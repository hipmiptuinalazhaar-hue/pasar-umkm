import { neon } from "@neondatabase/serverless";

const ADMIN_COOKIE = "__Host-pasar_umkm_admin";
const SESSION_IDLE_MINUTES = 30;
const SESSION_ABSOLUTE_HOURS = 8;
const FAILED_LOGIN_LIMIT = 10;
const ACCOUNT_LOCK_MINUTES = 15;
const TOUCH_INTERVAL_MINUTES = 5;
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
  return Response.json(body, {
    status,
    headers: securityHeaders(headers)
  });
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const item of header.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return parts.join("=") || null;
  }
  return null;
}

function clearAdminCookie() {
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function adminCookie(token) {
  const maxAge = SESSION_ABSOLUTE_HOURS * 60 * 60;
  return `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
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

function createSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
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

function requestIdentifier(request) {
  return (
    request.headers.get("CF-Ray") ||
    request.headers.get("X-Request-ID") ||
    crypto.randomUUID()
  ).slice(0, 128);
}

async function requestRiskHashes(request) {
  const ipHash = await sha256Hex(clientAddress(request));
  const userAgentHash = await sha256Hex(request.headers.get("User-Agent") || "unknown");
  return { ipHash, userAgentHash };
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

async function parseSmallJson(request) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { error: json({ ok: false, error: "Request terlalu besar.", code: "REQUEST_TOO_LARGE" }, 413) };
  }

  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid body");
    return { body };
  } catch {
    return { error: json({ ok: false, error: "Data tidak valid.", code: "INVALID_REQUEST" }, 400) };
  }
}

async function writeAudit(sql, {
  adminId = null,
  actorName = null,
  actorEmail = null,
  action,
  resourceType = "admin_auth",
  resourceId = null,
  outcome,
  reasonCode = null,
  requestId,
  ipHash,
  userAgentHash,
  metadata = {}
}) {
  const safeMetadata = JSON.stringify(metadata || {});

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
      ${adminId},
      ${actorName},
      ${actorEmail},
      ${action},
      ${resourceType},
      ${resourceId},
      ${outcome},
      ${reasonCode},
      ${requestId},
      ${ipHash},
      ${userAgentHash},
      CAST(${safeMetadata} AS jsonb)
    )
  `;
}

async function findAdminForPassword(sql, email, password) {
  return sql`
    SELECT
      id,
      name,
      email,
      status,
      mfa_required,
      mfa_enrolled_at,
      must_rotate_password,
      password_changed_at,
      security_version,
      failed_login_count,
      locked_until,
      (password_hash = crypt(${password}, password_hash)) AS password_ok
    FROM admin_accounts
    WHERE lower(trim(email)) = ${email}
    LIMIT 1
  `;
}

async function recordFailedPassword(sql, adminId) {
  return sql`
    WITH next_state AS (
      SELECT
        id,
        CASE
          WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1
          ELSE failed_login_count + 1
        END AS next_count
      FROM admin_accounts
      WHERE id = ${adminId}
      FOR UPDATE
    )
    UPDATE admin_accounts a
    SET
      failed_login_count = ns.next_count,
      locked_until = CASE
        WHEN ns.next_count >= ${FAILED_LOGIN_LIMIT}
          THEN NOW() + (${ACCOUNT_LOCK_MINUTES} || ' minutes')::interval
        ELSE NULL
      END
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

async function login(request, env) {
  if (!sameOrigin(request)) {
    return json({ ok: false, error: "Origin tidak valid.", code: "ORIGIN_REJECTED" }, 403);
  }

  const parsed = await parseSmallJson(request);
  if (parsed.error) return parsed.error;

  const email = normalizeEmail(parsed.body.email);
  const password = String(parsed.body.password || "");
  const passwordBytes = utf8Bytes(password);

  if (!validEmail(email) || passwordBytes < 1 || passwordBytes > MAX_BCRYPT_PASSWORD_BYTES) {
    return json({ ok: false, error: "Email atau password tidak valid.", code: "AUTH_FAILED" }, 401);
  }

  const sql = neon(env.DATABASE_URL);
  const { ipHash, userAgentHash } = await requestRiskHashes(request);
  const requestId = requestIdentifier(request);
  const rows = await findAdminForPassword(sql, email, password);
  const admin = rows[0] || null;

  if (!admin) {
    await writeAudit(sql, {
      action: "admin.login",
      outcome: "denied",
      reasonCode: "invalid_credentials",
      requestId,
      ipHash,
      userAgentHash
    });
    return json({ ok: false, error: "Email atau password tidak valid.", code: "AUTH_FAILED" }, 401);
  }

  const lockedUntil = admin.locked_until ? new Date(admin.locked_until).getTime() : 0;
  const currentlyLocked = lockedUntil > Date.now();

  if (admin.password_ok !== true) {
    const failedRows = await recordFailedPassword(sql, admin.id);
    const state = failedRows[0] || {};
    await writeAudit(sql, {
      adminId: admin.id,
      actorName: admin.name,
      actorEmail: admin.email,
      action: "admin.login",
      resourceId: admin.id,
      outcome: "denied",
      reasonCode: "invalid_credentials",
      requestId,
      ipHash,
      userAgentHash,
      metadata: {
        failed_login_count: Number(state.failed_login_count || 0),
        account_temporarily_locked: Boolean(state.locked_until)
      }
    });
    return json({ ok: false, error: "Email atau password tidak valid.", code: "AUTH_FAILED" }, 401);
  }

  if (currentlyLocked) {
    await writeAudit(sql, {
      adminId: admin.id,
      actorName: admin.name,
      actorEmail: admin.email,
      action: "admin.login",
      resourceId: admin.id,
      outcome: "denied",
      reasonCode: "account_temporarily_locked",
      requestId,
      ipHash,
      userAgentHash
    });
    return json({
      ok: false,
      error: "Akun admin dikunci sementara karena terlalu banyak percobaan login.",
      code: "ADMIN_TEMPORARILY_LOCKED"
    }, 423);
  }

  await resetFailedPasswordState(sql, admin.id);

  if (["disabled", "suspended", "locked"].includes(admin.status)) {
    await writeAudit(sql, {
      adminId: admin.id,
      actorName: admin.name,
      actorEmail: admin.email,
      action: "admin.login",
      resourceId: admin.id,
      outcome: "denied",
      reasonCode: "account_not_active",
      requestId,
      ipHash,
      userAgentHash,
      metadata: { status: admin.status }
    });
    return json({ ok: false, error: "Akun admin tidak dapat digunakan.", code: "ADMIN_UNAVAILABLE" }, 403);
  }

  if (admin.must_rotate_password === true) {
    await writeAudit(sql, {
      adminId: admin.id,
      actorName: admin.name,
      actorEmail: admin.email,
      action: "admin.login",
      resourceId: admin.id,
      outcome: "denied",
      reasonCode: "password_rotation_required",
      requestId,
      ipHash,
      userAgentHash
    });
    return json({
      ok: false,
      code: "PASSWORD_ROTATION_REQUIRED",
      next_step: "rotate_password",
      admin: publicAdmin(admin)
    }, 428);
  }

  if (admin.status === "pending_activation") {
    const reason = admin.mfa_required && !admin.mfa_enrolled_at
      ? "mfa_enrollment_required"
      : admin.mfa_required
        ? "mfa_required"
        : "account_pending_activation";

    await writeAudit(sql, {
      adminId: admin.id,
      actorName: admin.name,
      actorEmail: admin.email,
      action: "admin.login",
      resourceId: admin.id,
      outcome: "denied",
      reasonCode: reason,
      requestId,
      ipHash,
      userAgentHash
    });

    if (reason === "mfa_enrollment_required") {
      return json({
        ok: false,
        code: "MFA_ENROLLMENT_REQUIRED",
        next_step: "mfa_enrollment",
        admin: publicAdmin(admin)
      }, 428);
    }

    if (reason === "mfa_required") {
      return json({ ok: false, code: "MFA_REQUIRED", next_step: "mfa_verify" }, 428);
    }

    return json({ ok: false, code: "ACCOUNT_PENDING_ACTIVATION" }, 403);
  }

  if (admin.status !== "active") {
    return json({ ok: false, error: "Akun admin tidak dapat digunakan.", code: "ADMIN_UNAVAILABLE" }, 403);
  }

  // Phase 3 deliberately refuses to bypass MFA. Phase 6 will add enrollment
  // and challenge verification, then may set admin_sessions.mfa_verified_at.
  if (admin.mfa_required === true) {
    await writeAudit(sql, {
      adminId: admin.id,
      actorName: admin.name,
      actorEmail: admin.email,
      action: "admin.login",
      resourceId: admin.id,
      outcome: "denied",
      reasonCode: "mfa_required",
      requestId,
      ipHash,
      userAgentHash
    });
    return json({ ok: false, code: "MFA_REQUIRED", next_step: "mfa_verify" }, 428);
  }

  const rawToken = createSessionToken();
  const tokenHash = await sha256Hex(rawToken);

  await sql`
    INSERT INTO admin_sessions (
      admin_account_id,
      token_hash,
      security_version,
      mfa_verified_at,
      ip_hash,
      user_agent_hash,
      idle_expires_at,
      expires_at
    ) VALUES (
      ${admin.id},
      ${tokenHash},
      ${admin.security_version},
      NULL,
      ${ipHash},
      ${userAgentHash},
      NOW() + (${SESSION_IDLE_MINUTES} || ' minutes')::interval,
      NOW() + (${SESSION_ABSOLUTE_HOURS} || ' hours')::interval
    )
  `;

  await sql`
    UPDATE admin_accounts
    SET last_login_at = NOW()
    WHERE id = ${admin.id}
  `;

  await writeAudit(sql, {
    adminId: admin.id,
    actorName: admin.name,
    actorEmail: admin.email,
    action: "admin.login",
    resourceId: admin.id,
    outcome: "success",
    reasonCode: "authenticated",
    requestId,
    ipHash,
    userAgentHash
  });

  return json({ ok: true, authenticated: true, admin: publicAdmin(admin) }, 200, {
    "Set-Cookie": adminCookie(rawToken)
  });
}

async function rotatePassword(request, env) {
  if (!sameOrigin(request)) {
    return json({ ok: false, error: "Origin tidak valid.", code: "ORIGIN_REJECTED" }, 403);
  }

  const parsed = await parseSmallJson(request);
  if (parsed.error) return parsed.error;

  const email = normalizeEmail(parsed.body.email);
  const currentPassword = String(parsed.body.current_password || "");
  const newPassword = String(parsed.body.new_password || "");
  const currentBytes = utf8Bytes(currentPassword);
  const newBytes = utf8Bytes(newPassword);

  if (!validEmail(email) || currentBytes < 1 || currentBytes > MAX_BCRYPT_PASSWORD_BYTES) {
    return json({ ok: false, error: "Kredensial tidak valid.", code: "AUTH_FAILED" }, 401);
  }

  if (newBytes < MIN_NEW_PASSWORD_BYTES || newBytes > MAX_BCRYPT_PASSWORD_BYTES) {
    return json({
      ok: false,
      error: `Password admin baru harus ${MIN_NEW_PASSWORD_BYTES}-${MAX_BCRYPT_PASSWORD_BYTES} byte.`,
      code: "PASSWORD_POLICY_FAILED"
    }, 400);
  }

  if (newPassword === currentPassword) {
    return json({ ok: false, error: "Password baru harus berbeda.", code: "PASSWORD_REUSE_REJECTED" }, 400);
  }

  const sql = neon(env.DATABASE_URL);
  const { ipHash, userAgentHash } = await requestRiskHashes(request);
  const requestId = requestIdentifier(request);
  const rows = await findAdminForPassword(sql, email, currentPassword);
  const admin = rows[0] || null;

  if (!admin || admin.password_ok !== true) {
    if (admin) await recordFailedPassword(sql, admin.id);
    await writeAudit(sql, {
      adminId: admin?.id || null,
      actorName: admin?.name || null,
      actorEmail: admin?.email || null,
      action: "admin.password.rotate",
      resourceId: admin?.id || null,
      outcome: "denied",
      reasonCode: "invalid_credentials",
      requestId,
      ipHash,
      userAgentHash
    });
    return json({ ok: false, error: "Kredensial tidak valid.", code: "AUTH_FAILED" }, 401);
  }

  const lockedUntil = admin.locked_until ? new Date(admin.locked_until).getTime() : 0;
  if (lockedUntil > Date.now()) {
    return json({ ok: false, code: "ADMIN_TEMPORARILY_LOCKED" }, 423);
  }

  if (["disabled", "suspended", "locked"].includes(admin.status)) {
    return json({ ok: false, code: "ADMIN_UNAVAILABLE" }, 403);
  }

  if (admin.must_rotate_password !== true) {
    return json({ ok: false, code: "PASSWORD_ROTATION_NOT_REQUIRED" }, 409);
  }

  await sql`
    UPDATE admin_accounts
    SET
      password_hash = crypt(${newPassword}, gen_salt('bf', 12)),
      must_rotate_password = FALSE,
      password_changed_at = NOW(),
      security_version = security_version + 1,
      failed_login_count = 0,
      locked_until = NULL
    WHERE id = ${admin.id}
  `;

  await sql`
    UPDATE admin_sessions
    SET revoked_at = COALESCE(revoked_at, NOW()),
        revoke_reason = COALESCE(revoke_reason, 'password_rotation')
    WHERE admin_account_id = ${admin.id}
      AND revoked_at IS NULL
  `;

  await writeAudit(sql, {
    adminId: admin.id,
    actorName: admin.name,
    actorEmail: admin.email,
    action: "admin.password.rotate",
    resourceId: admin.id,
    outcome: "success",
    reasonCode: "bootstrap_password_rotated",
    requestId,
    ipHash,
    userAgentHash
  });

  return json({
    ok: true,
    password_rotated: true,
    code: admin.mfa_required ? "MFA_ENROLLMENT_REQUIRED" : "PASSWORD_ROTATED",
    next_step: admin.mfa_required ? "mfa_enrollment" : "login"
  });
}

async function loadSession(request, sql, { touch = true } = {}) {
  const rawToken = getCookie(request, ADMIN_COOKIE);
  if (!rawToken) return { error: "missing" };

  const tokenHash = await sha256Hex(rawToken);
  const rows = await sql`
    SELECT
      s.id AS session_id,
      s.admin_account_id,
      s.security_version AS session_security_version,
      s.mfa_verified_at,
      s.created_at,
      s.last_used_at,
      s.idle_expires_at,
      s.expires_at,
      s.revoked_at,
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
    LIMIT 1
  `;

  const session = rows[0] || null;
  if (!session) return { error: "invalid" };

  const now = Date.now();
  const expired = new Date(session.expires_at).getTime() <= now;
  const idleExpired = new Date(session.idle_expires_at).getTime() <= now;
  const securityMismatch = Number(session.session_security_version) !== Number(session.security_version);
  const accountInvalid = session.status !== "active" || session.must_rotate_password === true;
  const mfaInvalid = session.mfa_required === true && !session.mfa_verified_at;

  if (session.revoked_at || expired || idleExpired || securityMismatch || accountInvalid || mfaInvalid) {
    if (!session.revoked_at) {
      const reason = expired
        ? "absolute_expiry"
        : idleExpired
          ? "idle_expiry"
          : securityMismatch
            ? "security_version_changed"
            : accountInvalid
              ? "account_state_changed"
              : "mfa_not_verified";

      await sql`
        UPDATE admin_sessions
        SET revoked_at = NOW(), revoke_reason = ${reason}
        WHERE id = ${session.session_id}
          AND revoked_at IS NULL
      `;
    }
    return { error: "invalid" };
  }

  if (touch) {
    await sql`
      UPDATE admin_sessions
      SET
        last_used_at = NOW(),
        idle_expires_at = LEAST(
          expires_at,
          NOW() + (${SESSION_IDLE_MINUTES} || ' minutes')::interval
        )
      WHERE id = ${session.session_id}
        AND last_used_at <= NOW() - (${TOUCH_INTERVAL_MINUTES} || ' minutes')::interval
        AND revoked_at IS NULL
    `;
  }

  return { session };
}

async function me(request, env) {
  const sql = neon(env.DATABASE_URL);
  const loaded = await loadSession(request, sql);

  if (loaded.error) {
    return json({ ok: false, authenticated: false, code: "ADMIN_SESSION_INVALID" }, 401, {
      "Set-Cookie": clearAdminCookie()
    });
  }

  const session = loaded.session;
  const roleRows = await sql`
    SELECT ar.role_key, ar.name
    FROM admin_account_roles aar
    JOIN admin_roles ar ON ar.id = aar.role_id
    WHERE aar.admin_account_id = ${session.id}
      AND ar.is_active = TRUE
    ORDER BY ar.role_key ASC
  `;

  return json({
    ok: true,
    authenticated: true,
    admin: publicAdmin(session),
    roles: roleRows.map(role => ({ key: role.role_key, name: role.name })),
    session: {
      expires_at: session.expires_at,
      idle_expires_at: session.idle_expires_at,
      mfa_verified: Boolean(session.mfa_verified_at)
    }
  });
}

async function logout(request, env) {
  if (!sameOrigin(request)) {
    return json({ ok: false, code: "ORIGIN_REJECTED" }, 403);
  }

  const rawToken = getCookie(request, ADMIN_COOKIE);
  if (!rawToken) {
    return json({ ok: true, logged_out: true }, 200, { "Set-Cookie": clearAdminCookie() });
  }

  const sql = neon(env.DATABASE_URL);
  const tokenHash = await sha256Hex(rawToken);
  const rows = await sql`
    SELECT
      s.id AS session_id,
      a.id,
      a.name,
      a.email
    FROM admin_sessions s
    JOIN admin_accounts a ON a.id = s.admin_account_id
    WHERE s.token_hash = ${tokenHash}
    LIMIT 1
  `;
  const admin = rows[0] || null;

  await sql`
    UPDATE admin_sessions
    SET revoked_at = COALESCE(revoked_at, NOW()),
        revoke_reason = COALESCE(revoke_reason, 'logout')
    WHERE token_hash = ${tokenHash}
  `;

  if (admin) {
    const { ipHash, userAgentHash } = await requestRiskHashes(request);
    await writeAudit(sql, {
      adminId: admin.id,
      actorName: admin.name,
      actorEmail: admin.email,
      action: "admin.logout",
      resourceId: admin.id,
      outcome: "success",
      reasonCode: "explicit_logout",
      requestId: requestIdentifier(request),
      ipHash,
      userAgentHash
    });
  }

  return json({ ok: true, logged_out: true }, 200, { "Set-Cookie": clearAdminCookie() });
}

async function revokeAll(request, env) {
  if (!sameOrigin(request)) {
    return json({ ok: false, code: "ORIGIN_REJECTED" }, 403);
  }

  const sql = neon(env.DATABASE_URL);
  const loaded = await loadSession(request, sql, { touch: false });
  if (loaded.error) {
    return json({ ok: false, authenticated: false, code: "ADMIN_SESSION_INVALID" }, 401, {
      "Set-Cookie": clearAdminCookie()
    });
  }

  const admin = loaded.session;
  await sql`
    UPDATE admin_accounts
    SET security_version = security_version + 1
    WHERE id = ${admin.id}
  `;

  const revokedRows = await sql`
    UPDATE admin_sessions
    SET revoked_at = COALESCE(revoked_at, NOW()),
        revoke_reason = COALESCE(revoke_reason, 'revoke_all')
    WHERE admin_account_id = ${admin.id}
      AND revoked_at IS NULL
    RETURNING id
  `;

  const { ipHash, userAgentHash } = await requestRiskHashes(request);
  await writeAudit(sql, {
    adminId: admin.id,
    actorName: admin.name,
    actorEmail: admin.email,
    action: "admin.sessions.revoke_all",
    resourceId: admin.id,
    outcome: "success",
    reasonCode: "explicit_revoke_all",
    requestId: requestIdentifier(request),
    ipHash,
    userAgentHash,
    metadata: { revoked_sessions: revokedRows.length }
  });

  return json({ ok: true, revoked_sessions: revokedRows.length }, 200, {
    "Set-Cookie": clearAdminCookie()
  });
}

export async function handleAdminAuthApi(request, env) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/admin/auth/")) return null;

  if (request.method === "POST" && url.pathname === "/api/admin/auth/login") {
    return login(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/auth/rotate-password") {
    return rotatePassword(request, env);
  }

  if (request.method === "GET" && url.pathname === "/api/admin/auth/me") {
    return me(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/auth/logout") {
    return logout(request, env);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/auth/revoke-all") {
    return revokeAll(request, env);
  }

  return json({ ok: false, error: "Admin auth route tidak ditemukan.", code: "NOT_FOUND" }, 404);
}

export const adminAuthPolicy = Object.freeze({
  cookie_name: ADMIN_COOKIE,
  same_site: "Strict",
  idle_minutes: SESSION_IDLE_MINUTES,
  absolute_hours: SESSION_ABSOLUTE_HOURS,
  failed_login_limit: FAILED_LOGIN_LIMIT,
  account_lock_minutes: ACCOUNT_LOCK_MINUTES,
  min_new_password_bytes: MIN_NEW_PASSWORD_BYTES,
  max_password_bytes: MAX_BCRYPT_PASSWORD_BYTES
});
