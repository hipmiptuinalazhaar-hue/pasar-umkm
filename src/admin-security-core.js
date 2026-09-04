const ADMIN_COOKIE = "__Host-pasar_umkm_admin";
const CHALLENGE_COOKIE = "__Host-pasar_umkm_admin_challenge";
const SESSION_IDLE_MINUTES = 30;
const SESSION_ABSOLUTE_HOURS = 8;
const SESSION_TOUCH_MINUTES = 5;
const STEP_UP_MAX_AGE_MINUTES = 10;
const CHALLENGE_TTL_MINUTES = 5;

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function createOpaqueToken(size = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(size)));
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const item of header.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return parts.join("=") || null;
  }
  return null;
}

export function adminCookie(token) {
  return `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_ABSOLUTE_HOURS * 3600}`;
}

export function clearAdminCookie() {
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function challengeCookie(token) {
  return `${CHALLENGE_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${CHALLENGE_TTL_MINUTES * 60}`;
}

export function clearChallengeCookie() {
  return `${CHALLENGE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

export function clientAddress(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
}

export function requestIdentifier(request) {
  return (request.headers.get("CF-Ray") || request.headers.get("X-Request-ID") || crypto.randomUUID()).slice(0, 128);
}

export async function requestRiskHashes(request) {
  const [ipHash, userAgentHash] = await Promise.all([
    sha256Hex(clientAddress(request)),
    sha256Hex(request.headers.get("User-Agent") || "unknown")
  ]);
  return { ipHash, userAgentHash };
}

export async function loadAdminSession(sql, request, { touch = true } = {}) {
  const rawToken = getCookie(request, ADMIN_COOKIE);
  if (!rawToken) return { error: "missing" };
  const tokenHash = await sha256Hex(rawToken);
  const rows = await sql`
    SELECT
      s.id AS session_id,
      s.admin_account_id,
      s.security_version AS session_security_version,
      s.mfa_verified_at,
      s.step_up_verified_at,
      s.auth_method,
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
      const reason = expired ? "absolute_expiry" : idleExpired ? "idle_expiry" : securityMismatch ? "security_version_changed" : accountInvalid ? "account_state_changed" : "mfa_not_verified";
      await sql`UPDATE admin_sessions SET revoked_at = NOW(), revoke_reason = ${reason} WHERE id = ${session.session_id} AND revoked_at IS NULL`;
    }
    return { error: "invalid" };
  }

  if (touch) {
    await sql`
      UPDATE admin_sessions
      SET last_used_at = NOW(),
          idle_expires_at = LEAST(expires_at, NOW() + (${SESSION_IDLE_MINUTES} * INTERVAL '1 minute'))
      WHERE id = ${session.session_id}
        AND last_used_at <= NOW() - (${SESSION_TOUCH_MINUTES} * INTERVAL '1 minute')
        AND revoked_at IS NULL
    `;
  }
  return { session, rawToken, tokenHash };
}

export async function createAdminSession(sql, request, admin, { mfaMethod = null, stepUp = true } = {}) {
  const rawToken = createOpaqueToken(32);
  const tokenHash = await sha256Hex(rawToken);
  const { ipHash, userAgentHash } = await requestRiskHashes(request);
  const rows = await sql`
    INSERT INTO admin_sessions (
      admin_account_id, token_hash, security_version, mfa_verified_at, step_up_verified_at,
      auth_method, ip_hash, user_agent_hash, idle_expires_at, expires_at
    ) VALUES (
      ${admin.id}, ${tokenHash}, ${admin.security_version},
      ${mfaMethod ? new Date().toISOString() : null},
      ${mfaMethod && stepUp ? new Date().toISOString() : null},
      ${mfaMethod}, ${ipHash}, ${userAgentHash},
      NOW() + (${SESSION_IDLE_MINUTES} * INTERVAL '1 minute'),
      NOW() + (${SESSION_ABSOLUTE_HOURS} * INTERVAL '1 hour')
    )
    RETURNING id, expires_at, idle_expires_at, mfa_verified_at, step_up_verified_at
  `;
  return { rawToken, tokenHash, session: rows[0], ipHash, userAgentHash };
}

export function isStepUpFresh(session) {
  if (!session?.step_up_verified_at) return false;
  return Date.now() - new Date(session.step_up_verified_at).getTime() <= STEP_UP_MAX_AGE_MINUTES * 60_000;
}

export const adminSecurityPolicy = Object.freeze({
  session_cookie: ADMIN_COOKIE,
  challenge_cookie: CHALLENGE_COOKIE,
  idle_minutes: SESSION_IDLE_MINUTES,
  absolute_hours: SESSION_ABSOLUTE_HOURS,
  touch_minutes: SESSION_TOUCH_MINUTES,
  step_up_max_age_minutes: STEP_UP_MAX_AGE_MINUTES,
  challenge_ttl_minutes: CHALLENGE_TTL_MINUTES
});
