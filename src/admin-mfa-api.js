import { neon } from "@neondatabase/serverless";
import {
  adminCookie,
  challengeCookie,
  clearChallengeCookie,
  createAdminSession,
  createOpaqueToken,
  getCookie,
  loadAdminSession,
  requestIdentifier,
  requestRiskHashes,
  sameOrigin,
  sha256Hex,
  adminSecurityPolicy,
  isStepUpFresh
} from "./admin-security-core.js";
import {
  assertMfaConfig,
  buildOtpAuthUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotp,
  adminMfaCryptoPolicy
} from "./admin-mfa-crypto.js";

const MAX_BODY_BYTES = 4096;
const MAX_CHALLENGE_ATTEMPTS = 5;

function securityHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  };
}

function json(body, status = 200, cookies = []) {
  const headers = new Headers(securityHeaders());
  for (const cookie of cookies) if (cookie) headers.append("Set-Cookie", cookie);
  return Response.json(body, { status, headers });
}

async function parseSmallJson(request) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { error: json({ ok: false, code: "REQUEST_TOO_LARGE" }, 413) };
  }
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
    return { body };
  } catch {
    return { error: json({ ok: false, code: "INVALID_REQUEST" }, 400) };
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
      ${action}, 'admin_security', ${admin?.id || null}, ${outcome}, ${reasonCode},
      ${requestIdentifier(request)}, ${ipHash}, ${userAgentHash},
      CAST(${JSON.stringify(metadata || {})} AS jsonb)
    )
  `;
}

export async function issueMfaChallenge(sql, request, admin, purpose) {
  if (!['mfa_enroll', 'mfa_verify'].includes(purpose)) throw new TypeError("Invalid MFA challenge purpose");
  const { ipHash, userAgentHash } = await requestRiskHashes(request);
  const rawToken = createOpaqueToken(32);
  const tokenHash = await sha256Hex(rawToken);

  await sql`
    UPDATE admin_auth_challenges
    SET consumed_at = COALESCE(consumed_at, NOW())
    WHERE admin_account_id = ${admin.id}
      AND purpose = ${purpose}
      AND consumed_at IS NULL
  `;

  await sql`
    INSERT INTO admin_auth_challenges (
      admin_account_id, token_hash, purpose, attempts, max_attempts,
      ip_hash, user_agent_hash, expires_at
    ) VALUES (
      ${admin.id}, ${tokenHash}, ${purpose}, 0, ${MAX_CHALLENGE_ATTEMPTS},
      ${ipHash}, ${userAgentHash},
      NOW() + (${adminSecurityPolicy.challenge_ttl_minutes} * INTERVAL '1 minute')
    )
  `;

  return { rawToken, cookie: challengeCookie(rawToken) };
}

async function loadChallenge(sql, request, purpose) {
  const rawToken = getCookie(request, adminSecurityPolicy.challenge_cookie);
  if (!rawToken) return { error: "missing" };
  const tokenHash = await sha256Hex(rawToken);
  const { ipHash, userAgentHash } = await requestRiskHashes(request);
  const rows = await sql`
    SELECT
      c.id AS challenge_id, c.admin_account_id, c.purpose, c.attempts, c.max_attempts,
      c.ip_hash, c.user_agent_hash, c.expires_at, c.consumed_at,
      a.id, a.name, a.email, a.status, a.mfa_required, a.mfa_enrolled_at,
      a.must_rotate_password, a.security_version
    FROM admin_auth_challenges c
    JOIN admin_accounts a ON a.id = c.admin_account_id
    WHERE c.token_hash = ${tokenHash}
      AND c.purpose = ${purpose}
    LIMIT 1
  `;
  const challenge = rows[0] || null;
  if (!challenge) return { error: "invalid" };
  const invalid = challenge.consumed_at ||
    new Date(challenge.expires_at).getTime() <= Date.now() ||
    Number(challenge.attempts) >= Number(challenge.max_attempts) ||
    challenge.ip_hash !== ipHash || challenge.user_agent_hash !== userAgentHash;
  if (invalid) return { error: "invalid", challenge };
  return { challenge, tokenHash };
}

async function failChallenge(sql, challengeId) {
  await sql`
    UPDATE admin_auth_challenges
    SET attempts = attempts + 1,
        consumed_at = CASE WHEN attempts + 1 >= max_attempts THEN NOW() ELSE consumed_at END
    WHERE id = ${challengeId}
      AND consumed_at IS NULL
  `;
}

async function consumeChallenge(sql, challengeId) {
  await sql`UPDATE admin_auth_challenges SET consumed_at = COALESCE(consumed_at, NOW()) WHERE id = ${challengeId}`;
}

async function loadTotp(sql, adminId) {
  const rows = await sql`
    SELECT admin_account_id, secret_ciphertext, secret_iv, key_version, status,
           last_used_step, enrolled_at
    FROM admin_mfa_totp
    WHERE admin_account_id = ${adminId}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function enrollStart(request, env) {
  if (!sameOrigin(request)) return json({ ok: false, code: "ORIGIN_REJECTED" }, 403);
  try {
    await assertMfaConfig(env);
  } catch (error) {
    return json({ ok: false, code: error.code || "ADMIN_MFA_CONFIG_REQUIRED", error: "Konfigurasi keamanan MFA server belum siap." }, 503);
  }
  const sql = neon(env.DATABASE_URL);
  const loaded = await loadChallenge(sql, request, "mfa_enroll");
  if (loaded.error) return json({ ok: false, code: "MFA_CHALLENGE_INVALID" }, 401, [clearChallengeCookie()]);
  const admin = loaded.challenge;
  if (admin.must_rotate_password === true || admin.mfa_enrolled_at) {
    return json({ ok: false, code: "MFA_ENROLLMENT_NOT_ALLOWED" }, 409);
  }

  const secret = generateTotpSecret();
  const encrypted = await encryptTotpSecret(env, admin.id, secret);
  await sql`
    INSERT INTO admin_mfa_totp (
      admin_account_id, secret_ciphertext, secret_iv, key_version,
      algorithm, digits, period_seconds, status, last_used_step, updated_at
    ) VALUES (
      ${admin.id}, ${encrypted.ciphertext}, ${encrypted.iv}, ${encrypted.keyVersion},
      ${adminMfaCryptoPolicy.algorithm}, ${adminMfaCryptoPolicy.digits}, ${adminMfaCryptoPolicy.period_seconds},
      'pending', -1, NOW()
    )
    ON CONFLICT (admin_account_id) DO UPDATE SET
      secret_ciphertext = EXCLUDED.secret_ciphertext,
      secret_iv = EXCLUDED.secret_iv,
      key_version = EXCLUDED.key_version,
      status = 'pending',
      last_used_step = -1,
      enrolled_at = NULL,
      updated_at = NOW()
  `;

  await writeAudit(sql, request, admin, "admin.mfa.enroll.start", "success", "totp_secret_issued", { secret_exposed_once: true });
  return json({
    ok: true,
    method: "totp",
    secret,
    otpauth_uri: buildOtpAuthUri(admin.email, secret),
    issuer: "Pasar UMKM",
    digits: adminMfaCryptoPolicy.digits,
    period_seconds: adminMfaCryptoPolicy.period_seconds
  });
}

async function enrollVerify(request, env) {
  if (!sameOrigin(request)) return json({ ok: false, code: "ORIGIN_REJECTED" }, 403);
  const parsed = await parseSmallJson(request);
  if (parsed.error) return parsed.error;
  try { await assertMfaConfig(env); } catch (error) {
    return json({ ok: false, code: error.code || "ADMIN_MFA_CONFIG_REQUIRED" }, 503);
  }
  const sql = neon(env.DATABASE_URL);
  const loaded = await loadChallenge(sql, request, "mfa_enroll");
  if (loaded.error) return json({ ok: false, code: "MFA_CHALLENGE_INVALID" }, 401, [clearChallengeCookie()]);
  const admin = loaded.challenge;
  const totp = await loadTotp(sql, admin.id);
  if (!totp || totp.status !== "pending") return json({ ok: false, code: "MFA_ENROLLMENT_NOT_STARTED" }, 409);
  const secret = await decryptTotpSecret(env, admin.id, totp.secret_ciphertext, totp.secret_iv);
  const verified = await verifyTotp(secret, parsed.body.code, { lastUsedStep: totp.last_used_step });
  if (!verified.ok) {
    await failChallenge(sql, admin.challenge_id);
    await writeAudit(sql, request, admin, "admin.mfa.enroll.verify", "denied", "invalid_totp");
    return json({ ok: false, code: "MFA_CODE_INVALID" }, 401);
  }

  const recoveryCodes = generateRecoveryCodes();
  const recoveryHashes = await Promise.all(recoveryCodes.map(code => hashRecoveryCode(env, code)));
  const updatedRows = await sql`
    WITH claimed_totp AS (
      UPDATE admin_mfa_totp
      SET status = 'active', last_used_step = ${verified.step}, enrolled_at = NOW(), updated_at = NOW()
      WHERE admin_account_id = ${admin.id}
        AND status = 'pending'
        AND last_used_step < ${verified.step}
      RETURNING admin_account_id
    ), activated AS (
      UPDATE admin_accounts
      SET mfa_enrolled_at = NOW(),
          status = CASE WHEN status = 'pending_activation' THEN 'active' ELSE status END,
          updated_at = NOW()
      WHERE id IN (SELECT admin_account_id FROM claimed_totp)
      RETURNING id, security_version
    ), removed_codes AS (
      DELETE FROM admin_recovery_codes WHERE admin_account_id IN (SELECT id FROM activated)
    ), inserted_codes AS (
      INSERT INTO admin_recovery_codes (admin_account_id, code_hash)
      SELECT a.id, value::text
      FROM activated a,
           jsonb_array_elements_text(CAST(${JSON.stringify(recoveryHashes)} AS jsonb)) value
      RETURNING id
    )
    SELECT id, security_version FROM activated
  `;
  const activated = updatedRows[0] || null;
  if (!activated) return json({ ok: false, code: "MFA_CODE_REPLAYED" }, 409);

  await consumeChallenge(sql, admin.challenge_id);
  const sessionResult = await createAdminSession(sql, request, { ...admin, security_version: activated.security_version }, { mfaMethod: "totp" });
  await sql`UPDATE admin_accounts SET last_login_at = NOW() WHERE id = ${admin.id}`;
  await writeAudit(sql, request, admin, "admin.mfa.enroll.verify", "success", "mfa_enrolled", { recovery_codes_issued: recoveryCodes.length });

  return json({
    ok: true,
    authenticated: true,
    mfa_enrolled: true,
    recovery_codes: recoveryCodes,
    recovery_codes_display_once: true
  }, 200, [adminCookie(sessionResult.rawToken), clearChallengeCookie()]);
}

async function verifyRecoveryCode(sql, env, adminId, code) {
  const hash = await hashRecoveryCode(env, code);
  if (!hash) return false;
  const rows = await sql`
    UPDATE admin_recovery_codes
    SET used_at = NOW()
    WHERE admin_account_id = ${adminId}
      AND code_hash = ${hash}
      AND used_at IS NULL
    RETURNING id
  `;
  return rows.length === 1;
}

async function verifyActiveTotp(sql, env, adminId, code) {
  const totp = await loadTotp(sql, adminId);
  if (!totp || totp.status !== "active") return { ok: false };
  const secret = await decryptTotpSecret(env, adminId, totp.secret_ciphertext, totp.secret_iv);
  const verified = await verifyTotp(secret, code, { lastUsedStep: totp.last_used_step });
  if (!verified.ok) return { ok: false };
  const rows = await sql`
    UPDATE admin_mfa_totp
    SET last_used_step = ${verified.step}, updated_at = NOW()
    WHERE admin_account_id = ${adminId}
      AND status = 'active'
      AND last_used_step < ${verified.step}
    RETURNING admin_account_id
  `;
  return { ok: rows.length === 1, method: "totp" };
}

async function verifyLoginMfa(request, env) {
  if (!sameOrigin(request)) return json({ ok: false, code: "ORIGIN_REJECTED" }, 403);
  const parsed = await parseSmallJson(request);
  if (parsed.error) return parsed.error;
  try { await assertMfaConfig(env); } catch (error) {
    return json({ ok: false, code: error.code || "ADMIN_MFA_CONFIG_REQUIRED" }, 503);
  }
  const sql = neon(env.DATABASE_URL);
  const loaded = await loadChallenge(sql, request, "mfa_verify");
  if (loaded.error) return json({ ok: false, code: "MFA_CHALLENGE_INVALID" }, 401, [clearChallengeCookie()]);
  const admin = loaded.challenge;
  if (admin.status !== "active" || admin.must_rotate_password === true || !admin.mfa_enrolled_at) {
    return json({ ok: false, code: "ADMIN_UNAVAILABLE" }, 403, [clearChallengeCookie()]);
  }

  const method = parsed.body.method === "recovery" ? "recovery" : "totp";
  let verified = false;
  if (method === "recovery") verified = await verifyRecoveryCode(sql, env, admin.id, parsed.body.code);
  else verified = (await verifyActiveTotp(sql, env, admin.id, parsed.body.code)).ok;
  if (!verified) {
    await failChallenge(sql, admin.challenge_id);
    await writeAudit(sql, request, admin, "admin.mfa.verify", "denied", method === "recovery" ? "invalid_recovery_code" : "invalid_totp");
    return json({ ok: false, code: "MFA_CODE_INVALID" }, 401);
  }

  await consumeChallenge(sql, admin.challenge_id);
  const sessionResult = await createAdminSession(sql, request, admin, { mfaMethod: method });
  await sql`UPDATE admin_accounts SET last_login_at = NOW(), failed_login_count = 0, locked_until = NULL WHERE id = ${admin.id}`;
  await writeAudit(sql, request, admin, "admin.login", "success", "mfa_authenticated", { mfa_method: method });
  return json({ ok: true, authenticated: true, mfa_method: method }, 200, [adminCookie(sessionResult.rawToken), clearChallengeCookie()]);
}

async function stepUp(request, env) {
  if (!sameOrigin(request)) return json({ ok: false, code: "ORIGIN_REJECTED" }, 403);
  const parsed = await parseSmallJson(request);
  if (parsed.error) return parsed.error;
  try { await assertMfaConfig(env); } catch (error) {
    return json({ ok: false, code: error.code || "ADMIN_MFA_CONFIG_REQUIRED" }, 503);
  }
  const sql = neon(env.DATABASE_URL);
  const loaded = await loadAdminSession(sql, request, { touch: false });
  if (loaded.error) return json({ ok: false, code: "ADMIN_SESSION_INVALID" }, 401);
  const admin = loaded.session;
  const method = parsed.body.method === "recovery" ? "recovery" : "totp";
  const verified = method === "recovery"
    ? await verifyRecoveryCode(sql, env, admin.id, parsed.body.code)
    : (await verifyActiveTotp(sql, env, admin.id, parsed.body.code)).ok;
  if (!verified) {
    await writeAudit(sql, request, admin, "admin.step_up", "denied", "invalid_mfa", { method });
    return json({ ok: false, code: "MFA_CODE_INVALID" }, 401);
  }
  await sql`UPDATE admin_sessions SET step_up_verified_at = NOW(), auth_method = ${method} WHERE id = ${admin.session_id} AND revoked_at IS NULL`;
  await writeAudit(sql, request, admin, "admin.step_up", "success", "fresh_mfa", { method, max_age_minutes: adminSecurityPolicy.step_up_max_age_minutes });
  return json({ ok: true, step_up_verified: true, valid_for_minutes: adminSecurityPolicy.step_up_max_age_minutes });
}

async function regenerateRecovery(request, env) {
  if (!sameOrigin(request)) return json({ ok: false, code: "ORIGIN_REJECTED" }, 403);
  try { await assertMfaConfig(env); } catch (error) {
    return json({ ok: false, code: error.code || "ADMIN_MFA_CONFIG_REQUIRED" }, 503);
  }
  const sql = neon(env.DATABASE_URL);
  const loaded = await loadAdminSession(sql, request, { touch: false });
  if (loaded.error) return json({ ok: false, code: "ADMIN_SESSION_INVALID" }, 401);
  const admin = loaded.session;
  if (!isStepUpFresh(admin)) return json({ ok: false, code: "ADMIN_STEP_UP_REQUIRED" }, 428);
  const codes = generateRecoveryCodes();
  const hashes = await Promise.all(codes.map(code => hashRecoveryCode(env, code)));
  await sql`
    WITH removed AS (
      DELETE FROM admin_recovery_codes WHERE admin_account_id = ${admin.id}
    )
    INSERT INTO admin_recovery_codes (admin_account_id, code_hash)
    SELECT ${admin.id}, value::text
    FROM jsonb_array_elements_text(CAST(${JSON.stringify(hashes)} AS jsonb)) value
  `;
  await writeAudit(sql, request, admin, "admin.recovery.regenerate", "success", "recovery_codes_rotated", { recovery_codes_issued: codes.length });
  return json({ ok: true, recovery_codes: codes, recovery_codes_display_once: true });
}

async function mfaStatus(request, env) {
  const sql = neon(env.DATABASE_URL);
  const loaded = await loadAdminSession(sql, request, { touch: true });
  if (loaded.error) return json({ ok: false, code: "ADMIN_SESSION_INVALID" }, 401);
  const admin = loaded.session;
  const rows = await sql`
    SELECT
      EXISTS(SELECT 1 FROM admin_mfa_totp WHERE admin_account_id = ${admin.id} AND status = 'active') AS totp_active,
      (SELECT COUNT(*)::int FROM admin_recovery_codes WHERE admin_account_id = ${admin.id} AND used_at IS NULL) AS recovery_codes_remaining
  `;
  return json({ ok: true, totp_active: rows[0]?.totp_active === true, recovery_codes_remaining: Number(rows[0]?.recovery_codes_remaining || 0), step_up_fresh: isStepUpFresh(admin) });
}

export async function handleAdminMfaApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/admin/auth/mfa/") && url.pathname !== "/api/admin/auth/step-up") return null;
  try {
    if (request.method === "POST" && url.pathname === "/api/admin/auth/mfa/enroll/start") return enrollStart(request, env);
    if (request.method === "POST" && url.pathname === "/api/admin/auth/mfa/enroll/verify") return enrollVerify(request, env);
    if (request.method === "POST" && url.pathname === "/api/admin/auth/mfa/verify") return verifyLoginMfa(request, env);
    if (request.method === "POST" && url.pathname === "/api/admin/auth/step-up") return stepUp(request, env);
    if (request.method === "POST" && url.pathname === "/api/admin/auth/mfa/recovery/regenerate") return regenerateRecovery(request, env);
    if (request.method === "GET" && url.pathname === "/api/admin/auth/mfa/status") return mfaStatus(request, env);
    return json({ ok: false, code: "NOT_FOUND" }, 404);
  } catch (error) {
    console.error("Admin MFA error:", error);
    const code = error?.code === "ADMIN_MFA_CONFIG_REQUIRED" || error?.code === "ADMIN_MFA_CONFIG_INVALID" ? error.code : "ADMIN_MFA_ERROR";
    return json({ ok: false, code, error: code.startsWith("ADMIN_MFA_CONFIG") ? "Konfigurasi keamanan MFA server belum siap." : "Layanan MFA admin sementara tidak tersedia." }, code.startsWith("ADMIN_MFA_CONFIG") ? 503 : 500);
  }
}

export const adminMfaPolicy = Object.freeze({
  challenge_attempts: MAX_CHALLENGE_ATTEMPTS,
  challenge_minutes: adminSecurityPolicy.challenge_ttl_minutes,
  step_up_minutes: adminSecurityPolicy.step_up_max_age_minutes,
  totp: adminMfaCryptoPolicy
});
