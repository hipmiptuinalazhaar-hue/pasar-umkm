import { neon } from "@neondatabase/serverless";
import {
  clearAdminCookie,
  isStepUpFresh,
  loadAdminSession,
  requestIdentifier,
  requestRiskHashes,
  adminSecurityPolicy
} from "./admin-security-core.js";

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

async function auditAuthorization(sql, request, admin, {
  permissionKey,
  outcome,
  reasonCode,
  metadata = {}
}) {
  const { ipHash, userAgentHash } = await requestRiskHashes(request);
  await sql`
    INSERT INTO admin_audit_logs (
      admin_account_id, actor_name_snapshot, actor_email_snapshot,
      action, resource_type, resource_id, outcome, reason_code,
      request_id, ip_hash, user_agent_hash, metadata
    ) VALUES (
      ${admin?.id || null}, ${admin?.name || null}, ${admin?.email || null},
      'admin.authorization', 'permission', ${permissionKey || null}, ${outcome}, ${reasonCode},
      ${requestIdentifier(request)}, ${ipHash}, ${userAgentHash},
      CAST(${JSON.stringify(metadata || {})} AS jsonb)
    )
  `;
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
    JOIN admin_roles ar ON ar.id = aar.role_id AND ar.is_active = TRUE
    LEFT JOIN admin_role_permissions arp ON arp.role_id = ar.id
    LEFT JOIN admin_permissions ap ON ap.id = arp.permission_id AND ap.is_active = TRUE
    WHERE aar.admin_account_id = ${adminId}
    ORDER BY ar.role_key ASC, ap.permission_key ASC NULLS LAST
  `;
  const roleMap = new Map();
  const permissionMap = new Map();
  for (const row of rows) {
    roleMap.set(row.role_key, { key: row.role_key, name: row.role_name });
    if (row.permission_key) {
      permissionMap.set(row.permission_key, {
        key: row.permission_key,
        resource: row.resource,
        action: row.action,
        sensitive: row.is_sensitive === true
      });
    }
  }
  return { roles: [...roleMap.values()], permissions: [...permissionMap.values()] };
}

export async function getAdminAccessContext(request, env, { touch = true } = {}) {
  const sql = neon(env.DATABASE_URL);
  const loaded = await loadAdminSession(sql, request, { touch });
  if (loaded.error) {
    return {
      ok: false,
      response: json({ ok: false, authenticated: false, code: "ADMIN_SESSION_INVALID" }, 401, {
        "Set-Cookie": clearAdminCookie()
      })
    };
  }
  const session = loaded.session;
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
      response: json({ ok: false, error: "Akses admin tidak diizinkan untuk tindakan ini.", code: "ADMIN_PERMISSION_DENIED" }, 403)
    };
  }

  const permission = context.access.permissions.find(item => item.key === permissionKey);
  if (permission?.sensitive === true && !isStepUpFresh(context.session)) {
    await auditAuthorization(context.sql, request, context.session, {
      permissionKey,
      outcome: "denied",
      reasonCode: "step_up_required",
      metadata: {
        access_policy_version: ACCESS_POLICY_VERSION,
        step_up_max_age_minutes: adminSecurityPolicy.step_up_max_age_minutes
      }
    });
    return {
      ok: false,
      response: json({
        ok: false,
        code: "ADMIN_STEP_UP_REQUIRED",
        required_permission: permissionKey,
        step_up_valid_for_minutes: adminSecurityPolicy.step_up_max_age_minutes
      }, 428)
    };
  }

  return { ...context, permission };
}

export const adminAuthorizationPolicy = Object.freeze({
  version: ACCESS_POLICY_VERSION,
  permission_key_pattern: PERMISSION_KEY_PATTERN.source,
  super_admin_bypass: false,
  permission_source: "database_role_grants",
  sensitive_permissions_require_fresh_step_up: true,
  step_up_max_age_minutes: adminSecurityPolicy.step_up_max_age_minutes
});
