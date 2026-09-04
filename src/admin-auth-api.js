import { neon } from "@neondatabase/serverless";
import {
  adminCookie,
  adminSecurityPolicy,
  clearAdminCookie,
  clearChallengeCookie,
  createAdminSession,
  getCookie,
  loadAdminSession,
  requestIdentifier,
  requestRiskHashes,
  sameOrigin,
  sha256Hex
} from "./admin-security-core.js";
import { handleAdminMfaApi, issueMfaChallenge } from "./admin-mfa-api.js";
import { handleAdminSessionSecurityApi } from "./admin-session-security-api.js";

const FAILED_LOGIN_LIMIT = 10;
const ACCOUNT_LOCK_MINUTES = 15;
const MAX_BODY_BYTES = 4096;
const MIN_NEW_PASSWORD_BYTES = 14;
const MAX_BCRYPT_PASSWORD_BYTES = 72;

function securityHeaders(extra = {}) {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...extra
  };
}

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: securityHeaders(headers) });
}

function jsonCookies(body, status, cookies = []) {
  const headers = new Headers(securityHeaders());
  for (const cookie of cookies) if (cookie) headers.append("Set-Cookie", cookie);
  return Response.json(body, { status, headers });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 255);
}

function utf8Bytes(value) {
  return new TextEncoder().encode(String(value || "")).length;
}

function validEmail(email) {
  return email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function parseSmallJson(request) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { error: json({ ok: false, error: "Request terlalu besar.", code: "REQUEST_TOO_LARGE" }, 413) };
  }
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
    return { body };
  } catch {
    return { error: json({ ok: false, error: "Data tidak valid.", code: "INVALID_REQUEST" }, 400) };
  }
}

async function writeAudit(sql, request, admin, action, outcome, reasonCode, metadata = {}) {
  const { ipHash, userAgentHash } = await requestRiskHashes(request);
  await sql`
    INSERT INTO admin_audit_logs (
      admin_account_id, actor_name_snapshot, actor_email_snapshot,
      action, resource_type, resource_id, outcome, reason_code,
      request_id, ip_hash, user_agent_hash, metadata
    ) VALUES (
      ${admin?.id || null}, ${admin?.name || null}, ${admin?.email || null},
      ${action}, 'admin_auth', ${admin?.id || null}, ${outcome}, ${reasonCode},
      ${requestIdentifier(request)}, ${ipHash}, ${userAgentHash},
      CAST(${JSON.stringify(metadata || {})} AS jsonb)
    )
  `;
}

async function findAdminForPassword(sql, email, password) {
  return sql`
    SELECT
      id, name, email, status, mfa_required, mfa_enrolled_at,
      must_rotate_password, password_changed_at, security_version,
      failed_login_count, locked_until,
      (password_hash = crypt(${password}, password_hash)) AS password_ok
    FROM admin_accounts
    WHERE lower(trim(email)) = ${email}
    LIMIT 1
  `;
}

async function recordFailedPassword(sql, adminId) {
  return sql`
    WITH next_state AS (
      SELECT id,
        CASE WHEN locked_until IS NOT NULL AND locked_until <= NOW()
          THEN 1 ELSE failed_login_count + 1 END AS next_count
      FROM admin_accounts
      WHERE id = ${adminId}
      FOR UPDATE
    )
    UPDATE admin_accounts a
    SET failed_login_count = ns.next_count,
        locked_until = CASE WHEN ns.next_count >= ${FAILED_LOGIN_LIMIT}
          THEN NOW() + (${ACCOUNT_LOCK_MINUTES} * INTERVAL '1 minute') ELSE NULL END
    FROM next_state ns
    WHERE a.id = ns.id
    RETURNING a.failed_login_count, a.locked_until
  `;
}

async function resetFailedPasswordState(sql, adminId) {
  await sql`
    UPDATE admin_accounts
    SET failed_login_count = 0, locked_until = NULL
    WHERE id = ${adminId}
      AND (failed_login_count <> 0 OR locked_until IS NOT NULL)
  `;
}

function publicAdmin(admin) {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    status: admin.status,
    mfa_required: admin.mfa_required === true,
    mfa_enrolled: Boolean(admin.mfa_enrolled_at),
    must_rotate_password: admin.must_rotate_password === true
  };
}

async function validatePasswordAttempt(sql, request, email, password, action) {
  const rows = await findAdminForPassword(sql, email, password);
  const admin = rows[0] || null;
  if (!admin) {
    await writeAudit(sql, request, null, action, "denied", "invalid_credentials");
    return { error: json({ ok: false, error: "Email atau password tidak valid.", code: "AUTH_FAILED" }, 401) };
  }

  const lockedUntil = admin.locked_until ? new Date(admin.locked_until).getTime() : 0;
  if (lockedUntil > Date.now()) {
    await writeAudit(sql, request, admin, action, "denied", admin.password_ok === true ? "account_temporarily_locked" : "invalid_credentials", { account_temporarily_locked: true });
    if (admin.password_ok !== true) return { error: json({ ok: false, error: "Email atau password tidak valid.", code: "AUTH_FAILED" }, 401) };
    const retryAfter = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000));
    return { error: json({ ok: false, code: "ADMIN_TEMPORARILY_LOCKED" }, 423, { "Retry-After": String(retryAfter) }) };
  }

  if (admin.password_ok !== true) {
    const failedRows = await recordFailedPassword(sql, admin.id);
    await writeAudit(sql, request, admin, action, "denied", "invalid_credentials", {
      failed_login_count: Number(failedRows[0]?.failed_login_count || 0),
      account_temporarily_locked: Boolean(failedRows[0]?.locked_until)
    });
    return { error: json({ ok: false, error: "Email atau password tidak valid.", code: "AUTH_FAILED" }, 401) };
  }

  await resetFailedPasswordState(sql, admin.id);
  return { admin };
}

async function mfaGate(sql, request, admin) {
  const purpose = admin.mfa_enrolled_at ? "mfa_verify" : "mfa_enroll";
  const challenge = await issueMfaChallenge(sql, request, admin, purpose);
  const code = purpose === "mfa_enroll" ? "MFA_ENROLLMENT_REQUIRED" : "MFA_REQUIRED";
  await writeAudit(sql, request, admin, "admin.login", "denied", purpose === "mfa_enroll" ? "mfa_enrollment_required" : "mfa_required");
  return jsonCookies({
    ok: false,
    code,
    next_step: purpose,
    admin: publicAdmin(admin)
  }, 428, [challenge.cookie]);
}

async function login(request, env) {
  if (!sameOrigin(request)) return json({ ok: false, code: "ORIGIN_REJECTED" }, 403);
  const parsed = await parseSmallJson(request);
  if (parsed.error) return parsed.error;
  const email = normalizeEmail(parsed.body.email);
  const password = String(parsed.body.password || "");
  const passwordBytes = utf8Bytes(password);
  if (!validEmail(email) || passwordBytes < 1 || passwordBytes > MAX_BCRYPT_PASSWORD_BYTES) {
    return json({ ok: false, error: "Email atau password tidak valid.", code: "AUTH_FAILED" }, 401);
  }

  const sql = neon(env.DATABASE_URL);
  const attempt = await validatePasswordAttempt(sql, request, email, password, "admin.login");
  if (attempt.error) return attempt.error;
  const admin = attempt.admin;

  if (["disabled", "suspended", "locked"].includes(admin.status)) {
    await writeAudit(sql, request, admin, "admin.login", "denied", "account_not_active", { status: admin.status });
    return json({ ok: false, code: "ADMIN_UNAVAILABLE" }, 403);
  }

  if (admin.must_rotate_password === true) {
    await writeAudit(sql, request, admin, "admin.login", "denied", "password_rotation_required");
    return json({ ok: false, code: "PASSWORD_ROTATION_REQUIRED", next_step: "rotate_password", admin: publicAdmin(admin) }, 428);
  }

  if (admin.mfa_required === true) return mfaGate(sql, request, admin);
  if (admin.status !== "active") return json({ ok: false, code: "ACCOUNT_PENDING_ACTIVATION" }, 403);

  const sessionResult = await createAdminSession(sql, request, admin, { mfaMethod: null, stepUp: false });
  await sql`UPDATE admin_accounts SET last_login_at = NOW() WHERE id = ${admin.id}`;
  await writeAudit(sql, request, admin, "admin.login", "success", "password_authenticated", { mfa_required: false });
  return json({ ok: true, authenticated: true, admin: publicAdmin(admin) }, 200, { "Set-Cookie": adminCookie(sessionResult.rawToken) });
}

async function rotatePassword(request, env) {
  if (!sameOrigin(request)) return json({ ok: false, code: "ORIGIN_REJECTED" }, 403);
  const parsed = await parseSmallJson(request);
  if (parsed.error) return parsed.error;
  const email = normalizeEmail(parsed.body.email);
  const currentPassword = String(parsed.body.current_password || "");
  const newPassword = String(parsed.body.new_password || "");
  if (!validEmail(email) || utf8Bytes(currentPassword) < 1 || utf8Bytes(currentPassword) > MAX_BCRYPT_PASSWORD_BYTES) {
    return json({ ok: false, code: "AUTH_FAILED" }, 401);
  }
  const newBytes = utf8Bytes(newPassword);
  if (newBytes < MIN_NEW_PASSWORD_BYTES || newBytes > MAX_BCRYPT_PASSWORD_BYTES) {
    return json({ ok: false, error: `Password admin baru harus ${MIN_NEW_PASSWORD_BYTES}-${MAX_BCRYPT_PASSWORD_BYTES} byte.`, code: "PASSWORD_POLICY_FAILED" }, 400);
  }
  if (newPassword === currentPassword) return json({ ok: false, code: "PASSWORD_REUSE_REJECTED" }, 400);

  const sql = neon(env.DATABASE_URL);
  const attempt = await validatePasswordAttempt(sql, request, email, currentPassword, "admin.password.rotate");
  if (attempt.error) return attempt.error;
  const admin = attempt.admin;
  if (["disabled", "suspended", "locked"].includes(admin.status)) return json({ ok: false, code: "ADMIN_UNAVAILABLE" }, 403);
  if (admin.must_rotate_password !== true) return json({ ok: false, code: "PASSWORD_ROTATION_NOT_REQUIRED" }, 409);

  const rows = await sql`
    UPDATE admin_accounts
    SET password_hash = crypt(${newPassword}, gen_salt('bf', 12)),
        must_rotate_password = FALSE,
        password_changed_at = NOW(),
        security_version = security_version + 1,
        failed_login_count = 0,
        locked_until = NULL,
        status = CASE WHEN status = 'pending_activation' AND mfa_required = FALSE THEN 'active' ELSE status END,
        updated_at = NOW()
    WHERE id = ${admin.id}
    RETURNING security_version, status, mfa_required, mfa_enrolled_at
  `;
  const updated = rows[0];
  await sql`
    UPDATE admin_sessions
    SET revoked_at = COALESCE(revoked_at, NOW()), revoke_reason = COALESCE(revoke_reason, 'password_rotation')
    WHERE admin_account_id = ${admin.id} AND revoked_at IS NULL
  `;
  await writeAudit(sql, request, admin, "admin.password.rotate", "success", "bootstrap_password_rotated");

  if (updated.mfa_required === true) {
    const nextAdmin = { ...admin, ...updated, must_rotate_password: false };
    const purpose = updated.mfa_enrolled_at ? "mfa_verify" : "mfa_enroll";
    const challenge = await issueMfaChallenge(sql, request, nextAdmin, purpose);
    const code = purpose === "mfa_enroll" ? "MFA_ENROLLMENT_REQUIRED" : "MFA_REQUIRED";
    return jsonCookies({ ok: true, password_rotated: true, code, next_step: purpose }, 200, [challenge.cookie]);
  }

  return json({ ok: true, password_rotated: true, code: "PASSWORD_ROTATED", next_step: "login" });
}

async function me(request, env) {
  const sql = neon(env.DATABASE_URL);
  const loaded = await loadAdminSession(sql, request);
  if (loaded.error) {
    return jsonCookies({ ok: false, authenticated: false, code: "ADMIN_SESSION_INVALID" }, 401, [clearAdminCookie()]);
  }
  const session = loaded.session;
  const roleRows = await sql`
    SELECT ar.role_key, ar.name
    FROM admin_account_roles aar
    JOIN admin_roles ar ON ar.id = aar.role_id
    WHERE aar.admin_account_id = ${session.id} AND ar.is_active = TRUE
    ORDER BY ar.role_key ASC
  `;
  return json({
    ok: true,
    authenticated: true,
    admin: publicAdmin(session),
    roles: roleRows.map(role => ({ key: role.role_key, name: role.name })),
    session: {
      id: session.session_id,
      expires_at: session.expires_at,
      idle_expires_at: session.idle_expires_at,
      mfa_verified: Boolean(session.mfa_verified_at),
      step_up_verified_at: session.step_up_verified_at,
      auth_method: session.auth_method
    }
  });
}

async function logout(request, env) {
  if (!sameOrigin(request)) return json({ ok: false, code: "ORIGIN_REJECTED" }, 403);
  const rawToken = getCookie(request, adminSecurityPolicy.session_cookie);
  if (!rawToken) return jsonCookies({ ok: true, logged_out: true }, 200, [clearAdminCookie(), clearChallengeCookie()]);
  const sql = neon(env.DATABASE_URL);
  const tokenHash = await sha256Hex(rawToken);
  const rows = await sql`
    SELECT s.id AS session_id, a.id, a.name, a.email
    FROM admin_sessions s JOIN admin_accounts a ON a.id = s.admin_account_id
    WHERE s.token_hash = ${tokenHash} LIMIT 1
  `;
  const admin = rows[0] || null;
  await sql`
    UPDATE admin_sessions
    SET revoked_at = COALESCE(revoked_at, NOW()), revoke_reason = COALESCE(revoke_reason, 'logout')
    WHERE token_hash = ${tokenHash}
  `;
  if (admin) await writeAudit(sql, request, admin, "admin.logout", "success", "explicit_logout");
  return jsonCookies({ ok: true, logged_out: true }, 200, [clearAdminCookie(), clearChallengeCookie()]);
}

async function revokeAll(request, env) {
  if (!sameOrigin(request)) return json({ ok: false, code: "ORIGIN_REJECTED" }, 403);
  const sql = neon(env.DATABASE_URL);
  const loaded = await loadAdminSession(sql, request, { touch: false });
  if (loaded.error) return jsonCookies({ ok: false, code: "ADMIN_SESSION_INVALID" }, 401, [clearAdminCookie()]);
  const admin = loaded.session;
  await sql`UPDATE admin_accounts SET security_version = security_version + 1, updated_at = NOW() WHERE id = ${admin.id}`;
  const revokedRows = await sql`
    UPDATE admin_sessions
    SET revoked_at = COALESCE(revoked_at, NOW()), revoke_reason = COALESCE(revoke_reason, 'revoke_all')
    WHERE admin_account_id = ${admin.id} AND revoked_at IS NULL
    RETURNING id
  `;
  await writeAudit(sql, request, admin, "admin.sessions.revoke_all", "success", "explicit_revoke_all", { revoked_sessions: revokedRows.length });
  return jsonCookies({ ok: true, revoked_sessions: revokedRows.length }, 200, [clearAdminCookie(), clearChallengeCookie()]);
}

export async function handleAdminAuthApi(request, env) {
  const mfaResponse = await handleAdminMfaApi(request, env);
  if (mfaResponse) return mfaResponse;
  const securityResponse = await handleAdminSessionSecurityApi(request, env);
  if (securityResponse) return securityResponse;

  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/admin/auth/")) return null;
  try {
    if (request.method === "POST" && url.pathname === "/api/admin/auth/login") return login(request, env);
    if (request.method === "POST" && url.pathname === "/api/admin/auth/rotate-password") return rotatePassword(request, env);
    if (request.method === "GET" && url.pathname === "/api/admin/auth/me") return me(request, env);
    if (request.method === "POST" && url.pathname === "/api/admin/auth/logout") return logout(request, env);
    if (request.method === "POST" && url.pathname === "/api/admin/auth/revoke-all") return revokeAll(request, env);
    return json({ ok: false, code: "NOT_FOUND" }, 404);
  } catch (error) {
    console.error("Admin auth error:", error);
    return json({ ok: false, error: "Layanan autentikasi admin sementara tidak tersedia.", code: "ADMIN_AUTH_ERROR" }, 500);
  }
}

export const adminAuthPolicy = Object.freeze({
  cookie_name: adminSecurityPolicy.session_cookie,
  challenge_cookie_name: adminSecurityPolicy.challenge_cookie,
  same_site: "Strict",
  idle_minutes: adminSecurityPolicy.idle_minutes,
  absolute_hours: adminSecurityPolicy.absolute_hours,
  failed_login_limit: FAILED_LOGIN_LIMIT,
  account_lock_minutes: ACCOUNT_LOCK_MINUTES,
  min_new_password_bytes: MIN_NEW_PASSWORD_BYTES,
  max_password_bytes: MAX_BCRYPT_PASSWORD_BYTES
});
