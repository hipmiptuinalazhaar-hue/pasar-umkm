import { sendAuthCode } from "./auth-email.js";
import {
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_SECONDS,
  OTP_MAX_RESENDS,
  RESET_TOKEN_TTL_MINUTES,
  RECOVERY_MESSAGE,
  UUID_PATTERN,
  normalizeEmail,
  validEmail,
  validatePassword,
  maskedEmail,
  randomToken,
  createOtp,
  sha256Hex,
  otpHash,
  constantTimeEqual,
  auditAuth,
  assertAuthV2Configured,
  isAuthConfigurationError
} from "./auth-security-v2-shared.js";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const MAX_SESSION_AGE = 604800;

function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    }
  });
}

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_SESSION_AGE}`;
}

async function createSession(sql, userId) {
  const token = randomToken(32);
  await sql`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (
      ${userId},
      encode(digest(${token}, 'sha256'), 'hex'),
      NOW() + INTERVAL '7 days'
    )
  `;
  return token;
}

async function passwordHash(sql, password) {
  const rows = await sql`SELECT crypt(${password}, gen_salt('bf', 12)) AS password_hash`;
  return rows[0]?.password_hash || null;
}

function route(request) {
  const url = new URL(request.url);
  if (request.method !== "POST") return null;
  if (url.pathname === "/api/auth/register/verify") return "register-verify";
  if (url.pathname === "/api/auth/register/resend") return "register-resend";
  if (url.pathname === "/api/auth/password/forgot") return "password-forgot";
  if (url.pathname === "/api/auth/password/verify") return "password-verify";
  if (url.pathname === "/api/auth/password/reset") return "password-reset";
  return null;
}

function serviceUnavailable() {
  return json(
    { ok: false, error: "Layanan verifikasi akun sedang tidak tersedia. Coba lagi beberapa saat.", code: "AUTH_SERVICE_UNAVAILABLE" },
    503,
    { "Retry-After": "60" }
  );
}

async function registerResend(sql, request, env) {
  assertAuthV2Configured(env);
  const body = await request.json().catch(() => null);
  const challengeId = String(body?.challenge_id || "").trim();
  if (!UUID_PATTERN.test(challengeId)) return json({ ok: false, error: "Permintaan verifikasi tidak valid." }, 400);

  const rows = await sql`
    SELECT id, email, code_hash, expires_at, attempts, resend_count, last_sent_at,
           EXTRACT(EPOCH FROM (NOW() - last_sent_at))::integer AS seconds_since_send
    FROM user_auth_challenges
    WHERE id = ${challengeId}
      AND purpose = 'register'
      AND consumed_at IS NULL
      AND created_at > NOW() - INTERVAL '24 hours'
    LIMIT 1
  `;
  const challenge = rows[0];
  if (!challenge) return json({ ok: false, error: "Permintaan verifikasi sudah tidak berlaku. Silakan daftar kembali." }, 400);

  const secondsSinceSend = Number(challenge.seconds_since_send || 0);
  if (secondsSinceSend < OTP_RESEND_SECONDS) {
    const retry = Math.max(1, OTP_RESEND_SECONDS - secondsSinceSend);
    return json({ ok: false, error: "Kode baru belum dapat dikirim. Tunggu sebentar.", retry_after: retry }, 429, { "Retry-After": String(retry) });
  }
  if (Number(challenge.resend_count || 0) >= OTP_MAX_RESENDS) {
    return json({ ok: false, error: "Batas pengiriman ulang tercapai. Silakan mulai pendaftaran kembali." }, 429);
  }

  const code = createOtp();
  const codeHash = await otpHash(env, challengeId, "register", code);
  const previous = {
    codeHash: challenge.code_hash,
    expiresAt: challenge.expires_at,
    attempts: challenge.attempts,
    resendCount: challenge.resend_count,
    lastSentAt: challenge.last_sent_at
  };

  const updated = await sql`
    UPDATE user_auth_challenges
    SET code_hash = ${codeHash},
        expires_at = NOW() + INTERVAL '10 minutes',
        attempts = 0,
        resend_count = resend_count + 1,
        last_sent_at = NOW(),
        updated_at = NOW()
    WHERE id = ${challengeId}
      AND consumed_at IS NULL
      AND last_sent_at = ${challenge.last_sent_at}
    RETURNING email, resend_count
  `;
  if (!updated[0]) return json({ ok: false, error: "Kode sedang diperbarui. Coba lagi beberapa saat." }, 409);

  try {
    await sendAuthCode(env, {
      to: challenge.email,
      code,
      purpose: "register",
      expiresMinutes: OTP_TTL_MINUTES,
      idempotencyKey: `register-${challengeId}-${updated[0].resend_count}`
    });
  } catch (error) {
    await sql`
      UPDATE user_auth_challenges
      SET code_hash = ${previous.codeHash},
          expires_at = ${previous.expiresAt},
          attempts = ${previous.attempts},
          resend_count = ${previous.resendCount},
          last_sent_at = ${previous.lastSentAt},
          updated_at = NOW()
      WHERE id = ${challengeId}
        AND code_hash = ${codeHash}
        AND consumed_at IS NULL
    `;
    await auditAuth(sql, request, { email: challenge.email, eventType: "registration_otp_delivery", outcome: "failure", metadata: { provider_status: error?.status || null } });
    throw error;
  }

  await auditAuth(sql, request, { email: challenge.email, eventType: "registration_otp_resent", outcome: "success" });
  return json({
    ok: true,
    masked_email: maskedEmail(challenge.email),
    expires_in: OTP_TTL_MINUTES * 60,
    resend_after: OTP_RESEND_SECONDS,
    message: "Kode verifikasi baru telah dikirim."
  });
}

async function registerVerify(sql, request, env) {
  assertAuthV2Configured(env);
  const body = await request.json().catch(() => null);
  const challengeId = String(body?.challenge_id || "").trim();
  const code = String(body?.code || "").replace(/\D/g, "").slice(0, 6);
  if (!UUID_PATTERN.test(challengeId) || !/^\d{6}$/.test(code)) {
    return json({ ok: false, error: "Kode verifikasi tidak valid." }, 400);
  }

  const rows = await sql`
    SELECT id, email, pending_name, pending_password_hash, code_hash,
           expires_at, attempts, max_attempts
    FROM user_auth_challenges
    WHERE id = ${challengeId}
      AND purpose = 'register'
      AND consumed_at IS NULL
    LIMIT 1
  `;
  const challenge = rows[0];
  if (!challenge) return json({ ok: false, error: "Kode verifikasi tidak valid atau sudah digunakan." }, 400);
  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    return json({ ok: false, error: "Kode verifikasi sudah kedaluwarsa. Kirim kode baru." }, 400);
  }
  if (Number(challenge.attempts || 0) >= Number(challenge.max_attempts || OTP_MAX_ATTEMPTS)) {
    return json({ ok: false, error: "Terlalu banyak percobaan kode. Silakan mulai pendaftaran kembali." }, 429);
  }

  const expected = await otpHash(env, challengeId, "register", code);
  if (!constantTimeEqual(expected, challenge.code_hash)) {
    const attemptRows = await sql`
      UPDATE user_auth_challenges
      SET attempts = attempts + 1, updated_at = NOW()
      WHERE id = ${challengeId}
        AND consumed_at IS NULL
      RETURNING attempts, max_attempts
    `;
    const remaining = Math.max(0, Number(attemptRows[0]?.max_attempts || OTP_MAX_ATTEMPTS) - Number(attemptRows[0]?.attempts || OTP_MAX_ATTEMPTS));
    await auditAuth(sql, request, { email: challenge.email, eventType: "registration_otp_verify", outcome: "failure", metadata: { remaining_attempts: remaining } });
    return json({ ok: false, error: remaining ? `Kode verifikasi salah. Tersisa ${remaining} percobaan.` : "Batas percobaan kode tercapai." }, remaining ? 400 : 429);
  }

  try {
    const users = await sql`
      INSERT INTO users (name, email, password_hash, email_verified, email_verified_at)
      VALUES (${challenge.pending_name}, ${challenge.email}, ${challenge.pending_password_hash}, TRUE, NOW())
      RETURNING id, name, email, role, email_verified, created_at
    `;
    const user = users[0];
    if (!user) throw new Error("User creation failed");

    await sql`
      UPDATE user_auth_challenges
      SET verified_at = NOW(), consumed_at = NOW(), updated_at = NOW()
      WHERE id = ${challengeId}
        AND consumed_at IS NULL
    `;

    const token = await createSession(sql, user.id);
    await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`;
    await auditAuth(sql, request, { userId: user.id, email: user.email, eventType: "registration_verified", outcome: "success" });

    return json({ ok: true, message: "Email terverifikasi. Akun Anda siap digunakan.", user }, 201, { "Set-Cookie": sessionCookie(token) });
  } catch (error) {
    if (error?.code === "23505") {
      await sql`UPDATE user_auth_challenges SET consumed_at = NOW(), updated_at = NOW() WHERE id = ${challengeId}`;
      return json({ ok: false, error: "Email tidak dapat digunakan untuk pendaftaran." }, 409);
    }
    throw error;
  }
}

async function passwordForgot(sql, request, env) {
  const startedAt = Date.now();
  assertAuthV2Configured(env);
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  if (!validEmail(email)) return json({ ok: false, error: "Alamat email tidak valid." }, 400);

  const users = await sql`
    SELECT id, email
    FROM users
    WHERE email = ${email}
      AND is_active = TRUE
      AND email_verified = TRUE
    LIMIT 1
  `;
  const user = users[0] || null;

  if (user) {
    const recent = await sql`
      SELECT id, EXTRACT(EPOCH FROM (NOW() - last_sent_at))::integer AS seconds_since_send
      FROM user_auth_challenges
      WHERE email = ${email}
        AND purpose = 'password_reset'
        AND consumed_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (!recent[0] || Number(recent[0].seconds_since_send || 0) >= OTP_RESEND_SECONDS) {
      await sql`
        UPDATE user_auth_challenges
        SET consumed_at = NOW(), updated_at = NOW()
        WHERE email = ${email}
          AND purpose = 'password_reset'
          AND consumed_at IS NULL
      `;

      const challengeId = crypto.randomUUID();
      const code = createOtp();
      const codeHash = await otpHash(env, challengeId, "password_reset", code);
      await sql`
        INSERT INTO user_auth_challenges (id, purpose, email, code_hash, expires_at, max_attempts, last_sent_at)
        VALUES (${challengeId}, 'password_reset', ${email}, ${codeHash}, NOW() + INTERVAL '10 minutes', ${OTP_MAX_ATTEMPTS}, NOW())
      `;

      try {
        await sendAuthCode(env, {
          to: email,
          code,
          purpose: "password_reset",
          expiresMinutes: OTP_TTL_MINUTES,
          idempotencyKey: `password-reset-${challengeId}`
        });
        await auditAuth(sql, request, { userId: user.id, email, eventType: "password_reset_requested", outcome: "requested" });
      } catch (error) {
        await sql`UPDATE user_auth_challenges SET consumed_at = NOW(), updated_at = NOW() WHERE id = ${challengeId}`;
        await auditAuth(sql, request, { userId: user.id, email, eventType: "password_reset_delivery", outcome: "failure", metadata: { provider_status: error?.status || null } });
      }
    }
  }

  const remainingFloor = 700 - (Date.now() - startedAt);
  if (remainingFloor > 0) await new Promise(resolve => setTimeout(resolve, remainingFloor));
  return json({ ok: true, message: RECOVERY_MESSAGE, expires_in: OTP_TTL_MINUTES * 60, resend_after: OTP_RESEND_SECONDS }, 202);
}

async function passwordVerify(sql, request, env) {
  assertAuthV2Configured(env);
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const code = String(body?.code || "").replace(/\D/g, "").slice(0, 6);
  if (!validEmail(email) || !/^\d{6}$/.test(code)) {
    return json({ ok: false, error: "Kode pemulihan tidak valid atau sudah kedaluwarsa." }, 400);
  }

  const rows = await sql`
    SELECT id, email, code_hash, expires_at, attempts, max_attempts
    FROM user_auth_challenges
    WHERE email = ${email}
      AND purpose = 'password_reset'
      AND consumed_at IS NULL
      AND verified_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const challenge = rows[0];
  if (!challenge || new Date(challenge.expires_at).getTime() <= Date.now()) {
    return json({ ok: false, error: "Kode pemulihan tidak valid atau sudah kedaluwarsa." }, 400);
  }
  if (Number(challenge.attempts || 0) >= Number(challenge.max_attempts || OTP_MAX_ATTEMPTS)) {
    return json({ ok: false, error: "Batas percobaan kode pemulihan tercapai." }, 429);
  }

  const expected = await otpHash(env, challenge.id, "password_reset", code);
  if (!constantTimeEqual(expected, challenge.code_hash)) {
    await sql`
      UPDATE user_auth_challenges
      SET attempts = attempts + 1, updated_at = NOW()
      WHERE id = ${challenge.id}
        AND consumed_at IS NULL
        AND verified_at IS NULL
    `;
    await auditAuth(sql, request, { email, eventType: "password_reset_otp_verify", outcome: "failure" });
    return json({ ok: false, error: "Kode pemulihan tidak valid atau sudah kedaluwarsa." }, 400);
  }

  const resetToken = randomToken(32);
  const resetTokenHash = await sha256Hex(resetToken);
  const updated = await sql`
    UPDATE user_auth_challenges
    SET verified_at = NOW(),
        reset_token_hash = ${resetTokenHash},
        reset_token_expires_at = NOW() + INTERVAL '10 minutes',
        updated_at = NOW()
    WHERE id = ${challenge.id}
      AND consumed_at IS NULL
      AND verified_at IS NULL
    RETURNING id
  `;
  if (!updated[0]) return json({ ok: false, error: "Kode pemulihan tidak valid atau sudah digunakan." }, 409);

  await auditAuth(sql, request, { email, eventType: "password_reset_otp_verified", outcome: "success" });
  return json({ ok: true, reset_token: resetToken, reset_token_expires_in: RESET_TOKEN_TTL_MINUTES * 60, message: "Kode terverifikasi. Buat kata sandi baru." });
}

async function passwordReset(sql, request) {
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const resetToken = String(body?.reset_token || "").trim();
  const password = String(body?.password || "");
  if (!validEmail(email) || resetToken.length < 32) {
    return json({ ok: false, error: "Permintaan penggantian kata sandi tidak valid." }, 400);
  }
  const passwordError = validatePassword(password);
  if (passwordError) return json({ ok: false, error: passwordError }, 400);

  const resetTokenHash = await sha256Hex(resetToken);
  const challenges = await sql`
    SELECT id
    FROM user_auth_challenges
    WHERE email = ${email}
      AND purpose = 'password_reset'
      AND consumed_at IS NULL
      AND verified_at IS NOT NULL
      AND reset_token_hash = ${resetTokenHash}
      AND reset_token_expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const challenge = challenges[0];
  if (!challenge) return json({ ok: false, error: "Tautan pemulihan tidak valid atau sudah kedaluwarsa." }, 400);

  const newPasswordHash = await passwordHash(sql, password);
  if (!newPasswordHash) throw new Error("Password hashing failed");
  const users = await sql`
    UPDATE users
    SET password_hash = ${newPasswordHash}, password_changed_at = NOW(), updated_at = NOW()
    WHERE email = ${email}
      AND is_active = TRUE
      AND email_verified = TRUE
    RETURNING id, name, email, role
  `;
  const user = users[0];
  if (!user) return json({ ok: false, error: "Permintaan penggantian kata sandi tidak valid." }, 400);

  await sql`DELETE FROM sessions WHERE user_id = ${user.id}`;
  await sql`
    UPDATE user_auth_challenges
    SET consumed_at = NOW(), reset_token_hash = NULL, updated_at = NOW()
    WHERE id = ${challenge.id}
      AND consumed_at IS NULL
  `;
  await auditAuth(sql, request, { userId: user.id, email, eventType: "password_reset_completed", outcome: "success", metadata: { sessions_revoked: true } });
  return json({ ok: true, message: "Kata sandi berhasil diperbarui. Silakan masuk kembali di semua perangkat." });
}

export async function handlePublicAuthSecurityV2Api(sql, request, env) {
  const action = route(request);
  if (!action) return null;

  try {
    if (action === "register-verify") return await registerVerify(sql, request, env);
    if (action === "register-resend") return await registerResend(sql, request, env);
    if (action === "password-forgot") return await passwordForgot(sql, request, env);
    if (action === "password-verify") return await passwordVerify(sql, request, env);
    return await passwordReset(sql, request);
  } catch (error) {
    console.error(`Public auth security ${action} error:`, error?.code || error?.status || error?.message || "unknown");
    if (isAuthConfigurationError(error)) return serviceUnavailable();
    return json({ ok: false, error: action.startsWith("password") ? "Pemulihan akun belum dapat diproses." : "Verifikasi akun belum dapat diproses." }, 500);
  }
}
