import { neon } from "@neondatabase/serverless";
import { adminAuthPolicy } from "./admin-auth-api.js";

const PERMISSION_KEY_PATTERN = /^[a-z][a-z0-9_]{1,47}\.[a-z][a-z0-9_]{1,47}$/;
const ACCESS_POLICY_VERSION = "2026-09-05-admin-rbac-permissions";

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Pragma": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...headers
    }
  });
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}

function clearAdminCookie() {
  return `${adminAuthPolicy.cookie_name}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value || ""))
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function clientAddress(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function requestId(request) {
  return (
    request.headers.get("CF-Ray") ||
    request.headers.get("X-Request-ID") ||
    crypto.randomUUID()
  ).slice(0, 128);
}

async function requestHashes(request) {
  const [ipHash, userAgentHash] = await Promise.all([
    sha256Hex(clientAddress(request)),
    sha256Hex(request.headers.get("User-Agent") || "unknown")
  ]);
  return { ipHash, userAgentHash };
}

async function auditAuthorization(sql, request, admin, {
  permissionKey,
  outcome,
  reasonCode,
  metadata = {}
}) {
  const { ipHash, userAgentHash } = await requestHashes(request);
  await sql`
    INSERT INTO admin_audit_logs (
      admin_account_id,
      actor_name_snapshot,
      actor_email_snapshot,
      action,
      resource_type,
      resource_id,
      outcome,
      reason_code,
      request_id,
      ip_hash,
      user_agent_hash,
      metadata
    ) VALUES (
      ${admin?.id || null},
      ${admin?.name || null},
      ${admin?.email || null},
      'admin.authorization',
      'permission',
      ${permissionKey || null},
      ${outcome},
      ${reasonCode},
      ${requestId(request)},
      ${ipHash},
      ${userAgentHash},
      CAST(${JSON.stringify(metadata || {})} AS jsonb)
    )
  `;
}

async function loadSession(sql, request, { touch = true } = {}) {
  const rawToken = getCookie(request, adminAuthPolicy.cookie_name);
  if (!rawToken) return null;

  const tokenHash = await sha256Hex(rawToken);
  const rows = await sql`
    SELECT
      s.id AS session_id,
      s.admin_account_id,
      s.created_at AS session_created_at,
      s.last_used_at,
      s.idle_expires_at,
      s.expires_at,
      s.mfa_verified_at,
      a.id,
      a.name,
      a.email,
      a.status,
      a.mfa_required,
      a.mfa_enrolled_at,
      a.must_rotate_password,
      a.security_version
    FROM admin_sessions s
    JOIN admin_accounts a ON a.id = s.admin_account_id
    WHERE s.token_hash = ${tokenHash}
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
      AND s.idle_expires_at > NOW()
      AND s.security_version = a.security_version
      AND a.status = 'active'
      AND a.must_rotate_password = FALSE
      AND (a.mfa_required = FALSE OR s.mfa_verified_at IS NOT NULL)
    LIMIT 1
  `;

  const session = rows[0] || null;
  if (!session) return null;

  if (touch) {
    await sql`
      UPDATE admin_sessions
      SET
        last_used_at = NOW(),
        idle_expires_at = LEAST(
          expires_at,
          NOW() + (${adminAuthPolicy.idle_minutes} * INTERVAL '1 minute')
        )
      WHERE id = ${session.session_id}
        AND last_used_at <= NOW() - INTERVAL '5 minutes'
        AND revoked_at IS NULL
    `;
  }

  return session;
}

async function loadRolePermissionContext(sql, adminId) {
  const rows = await sql`
    SELECT
      ar.role_key,
      ar.name AS role_name,
      ap.permission_key,
      ap.resource,
      ap.action,
      ap.is_sensitive
    FROM admin_account_roles aar
    JOIN admin_roles ar
      ON ar.id = aar.role_id
     AND ar.is_active = TRUE
    LEFT JOIN admin_role_permissions arp
      ON arp.role_id = ar.id
    LEFT JOIN admin_permissions ap
      ON ap.id = arp.permission_id
     AND ap.is_active = TRUE
    WHERE aar.admin_account_id = ${adminId}
    ORDER BY ar.role_key ASC, ap.permission_key ASC NULLS LAST
  `;

  const roleMap = new Map();
  const permissionMap = new Map();

  for (const row of rows) {
    roleMap.set(row.role_key, {
      key: row.role_key,
      name: row.role_name
    });

    if (row.permission_key) {
      permissionMap.set(row.permission_key, {
        key: row.permission_key,
        resource: row.resource,
        action: row.action,
        sensitive: row.is_sensitive === true
      });
    }
  }

  return {
    roles: [...roleMap.values()],
    permissions: [...permissionMap.values()]
  };
}

export async function getAdminAccessContext(request, env, { touch = true } = {}) {
  const sql = neon(env.DATABASE_URL);
  const session = await loadSession(sql, request, { touch });

  if (!session) {
    return {
      ok: false,
      response: json(
        { ok: false, authenticated: false, code: "ADMIN_SESSION_INVALID" },
        401,
        { "Set-Cookie": clearAdminCookie() }
      )
    };
  }

  const access = await loadRolePermissionContext(sql, session.id);

  return {
    ok: true,
    sql,
    session,
    access,
    permissionSet: new Set(access.permissions.map(item => item.key))
  };
}

export async function requireAdminPermission(request, env, permissionKey, options = {}) {
  if (!PERMISSION_KEY_PATTERN.test(String(permissionKey || ""))) {
    throw new TypeError(`Invalid admin permission key: ${permissionKey}`);
  }

  const context = await getAdminAccessContext(request, env, options);
  if (!context.ok) return context;

  if (!context.permissionSet.has(permissionKey)) {
    await auditAuthorization(context.sql, request, context.session, {
      permissionKey,
      outcome: "denied",
      reasonCode: "missing_permission",
      metadata: {
        roles: context.access.roles.map(role => role.key),
        access_policy_version: ACCESS_POLICY_VERSION
      }
    });

    return {
      ok: false,
      response: json({
        ok: false,
        error: "Akses admin tidak diizinkan untuk tindakan ini.",
        code: "ADMIN_PERMISSION_DENIED"
      }, 403)
    };
  }

  const permission = context.access.permissions.find(item => item.key === permissionKey);
  return { ...context, permission };
}

export const adminAuthorizationPolicy = Object.freeze({
  version: ACCESS_POLICY_VERSION,
  permission_key_pattern: PERMISSION_KEY_PATTERN.source,
  super_admin_bypass: false,
  permission_source: "database_role_grants"
});
