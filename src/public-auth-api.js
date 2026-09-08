import { neon } from "@neondatabase/serverless";
import { assertAuthEmailConfigured, sendAuthCode } from "./auth-email.js";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const MAX_SESSION_AGE = 604800;
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_RESENDS = 5;
const RESET_TOKEN_TTL_MINUTES = 10;
const RECOVERY_MESSAGE = "Jika email tersebut terdaftar, kode pemulihan telah dikirim.";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const textEncoder = new TextEncoder();

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

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const piece of header.split(";")) {
    const [key, ...parts] = piece.trim().split("=");
    if (key === name) return parts.join("=") || null;
  }
  return null;
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomToken(byteLength = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

function createSessionToken() {
  return randomToken(32);
}

function createOtp() {
  const range = 1_000_000;
  const ceiling = Math.floor(0x100000000 / range) * range;
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= ceiling);
  return String(values[0] % range).padStart(6, "0");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(email) {
  return email.length <= 255 && EMAIL_PATTERN.test(email);
}

function validatePassword(password) {
  const passwordBytes = textEncoder.encode(String(password || "")).length;
  if (passwordBytes < 8) return "Kata sandi minimal 8 karakter.";
  if (passwordBytes > 72) return "Kata sandi terlalu panjang.";
  return null;
}

function maskedEmail(email) {
  const [local = "", domain = ""] = String(email || "").split("@");
  if (!local || !domain) return "email Anda";
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(2, Math.min(6, local.length - visible.length)))}@${domain}`;
}

function route(request) {
  const url = new URL(request.url);
  const method = request.method;

  if (url.pathname === "/api/auth/register" && method === "POST") return "register";
  if (url.pathname === "/api/auth/register/verify" && method === "POST") return "register-verify";
  if (url.pathname === "/api/auth/register/resend" && method === "POST") return "register-resend";
  if (url.pathname === "/api/auth/password/forgot" && method === "POST") return "password-forgot";
  if (url.pathname === "/api/auth/password/verify" && method === "POST") return "password-verify";
  if (url.pathname === "/api/auth/password/reset" && method === "POST") return "password-reset";
  if (url.pathname === "/api/auth/login" && method === "POST") return "login";
  if (url.pathname === "/api/auth/me" && method === "GET") return "me";
  if (url.pathname === "/api/auth/logout" && method === "POST") return "logout";
  return null;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(String(value || "")));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret, value) {
  const normalized = String(secret || "");
  if (normalized.length < 32) throw new Error("AUTH_OTP_PEPPER belum dikonfigurasi dengan aman.");
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(normalized),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(String(value || "")));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

async function otpHash(env, challengeId, purpose, code) {
  return hmacHex(env?.AUTH_OTP_PEPPER, `${purpose}:${challengeId}:${code}`);
}

function requestId(request) {
  return String(request.headers.get("CF-Ray") || request.headers.get("X-Request-Id") || "").slice(0, 160) || null;
}

async function requestIpHash(request) {
  const value = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
  return sha256Hex(value);
}

async function audit(sql, request, { userId = null, email = "", eventType, outcome, metadata = {} }) {
  try {
    const emailHash = email ? await sha256Hex(normalizeEmail(email)) : null;
    const ipHash = await requestIpHash(request);
    const safeMetadata = JSON.stringify(metadata && typeof metadata === "object" ? metadata : {});
    await sql`
      INSERT INTO user_auth_audit_events (
        user_id, email_hash, event_type, outcome, request_id, ip_hash, metadata
      ) VALUES (
        ${userId}, ${emailHash}, ${eventType}, ${outcome}, ${requestId(request)}, ${ipHash}, ${safeMetadata}::jsonb
      )
    `;
  } catch (error) {
    console.warn("Public auth audit unavailable", eventType, error?.code || error?.message || "unknown");
  }
}

async function createSession(sql, userId) {
  const token = createSessionToken();
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

function authServiceReady(env) {
  assertAuthEmailConfigured(env);
  const pepper = String(env?.AUTH_OTP_PEPPER || "");
  if (pepper.length < 32) throw new Error("AUTH_OTP_PEPPER belum dikonfigurasi dengan aman.");
}

function serviceUnavailable() {
  return json(
    { ok: false, error: "Layanan verifikasi akun sedang tidak tersedia. Coba lagi beberapa saat.", code: "AUTH_SERVICE_UNAVAILABLE" },
    503,
    { "Retry-After": "60" }
  );
}

async function register(sql, request, env) {
  authServiceReady(env);
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Data pendaftaran tidak valid." }, 400);

  const name = String(body.name || "").trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  if (name.length < 2 || name.length > 100) {
    return json({ ok: false, error: "Nama harus terdiri dari 2 sampai 100 karakter." }, 400);
  }
  if (!validEmail(email)) return json({ ok: false, error: "Alamat email tidak valid." }, 400);
  const passwordError = validatePassword(password);
  if (passwordError) return json({ ok: false, error: passwordError }, 400);

  const existing = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
  if (existing.length) {
    await audit(sql, request, { email, eventType: "registration_requested", outcome: "blocked", metadata: { reason: "email_unavailable" } });
    return json({ ok: false, error: "Email tidak dapat digunakan untuk pendaftaran." }, 409);
  }

  const pendingPasswordHash = await passwordHash(sql, password);
  if (!pendingPasswordHash) throw new Error("Password hashing failed");

  const challengeId = crypto.randomUUID();
  const code = createOtp();
  const codeHash = await otpHash(env, challengeId, "register", code);

  await sql`
    UPDATE user_auth_challenges
    SET consumed_at = NOW(), updated_at = NOW()
    WHERE email = ${email}
      AND purpose = 'register'
      AND consumed_at IS NULL
  `;

  await sql`
    INSERT INTO user_auth_challenges (
      id, purpose, email, pending_name, pending_password_hash,
      code_hash, expires_at, max_attempts, last_sent_at
    ) VALUES (
      ${challengeId}, 'register', ${email}, ${name}, ${pendingPasswordHash},
      ${codeHash}, NOW() + INTERVAL '10 minutes', ${OTP_MAX_ATTEMPTS}, NOW()
    )
  `;

  try {
    await sendAuthCode(env, {
      to: email,
      code,
      purpose: "register",
      expiresMinutes: OTP_TTL_MINUTES,
      idempotencyKey: `register-${challengeId}-0`
    });
  } catch (error) {
    await sql`
      UPDATE user_auth_challenges
      SET consumed_at = NOW(), updated_at = NOW()
      WHERE id = ${challengeId}
    `;
    await audit(sql, request, { email, eventType: "registration_otp_delivery", outcome: "failure", metadata: { provider_status: error?.status || null } });
    throw error;
  }

  await audit(sql, request, { email, eventType: "registration_otp_sent", outcome: "success" });
  return json({
    ok: true,
    verification_required: true,
    challenge_id: challengeId,
    masked_email: maskedEmail(email),
    expires_in: OTP_TTL_MINUTES * 60,
    resend_after: OTP_RESEND_SECONDS,
    message: "Kode verifikasi telah dikirim ke email Anda."
  }, 202);
}

async function registerResend(sql, request, env) {
  authServiceReady(env);
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
    SET
      code_hash = ${codeHash},
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
      SET
        code_hash = ${previous.codeHash},
        expires_at = ${previous.expiresAt},
        attempts = ${previous.attempts},
        resend_count = ${previous.resendCount},
        last_sent_at = ${previous.lastSentAt},
        updated_at = NOW()
      WHERE id = ${challengeId}
        AND code_hash = ${codeHash}
        AND consumed_at IS NULL
    `;
    await audit(sql, request, { email: challenge.email, eventType: "registration_otp_delivery", outcome: "failure", metadata: { provider_status: error?.status || null } });
    throw error;
  }

  await audit(sql, request, { email: challenge.email, eventType: "registration_otp_resent", outcome: "success" });
  return json({
    ok: true,
    masked_email: maskedEmail(challenge.email),
    expires_in: OTP_TTL_MINUTES * 60,
    resend_after: OTP_RESEND_SECONDS,
    message: "Kode verifikasi baru telah dikirim."
  });
}

async function registerVerify(sql, request, env) {
  authServiceReady(env);
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
    await audit(sql, request, { email: challenge.email, eventType: "registration_otp_verify", outcome: "failure", metadata: { remaining_attempts: remaining } });
    return json({ ok: false, error: remaining ? `Kode verifikasi salah. Tersisa ${remaining} percobaan.` : "Batas percobaan kode tercapai." }, remaining ? 400 : 429);
  }

  try {
    const users = await sql`
      INSERT INTO users (
        name, email, password_hash, email_verified, email_verified_at
      ) VALUES (
        ${challenge.pending_name}, ${challenge.email}, ${challenge.pending_password_hash}, TRUE, NOW()
      )
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
    await audit(sql, request, { userId: user.id, email: user.email, eventType: "registration_verified", outcome: "success" });

    return json({
      ok: true,
      message: "Email terverifikasi. Akun Anda siap digunakan.",
      user
    }, 201, { "Set-Cookie": sessionCookie(token) });
  } catch (error) {
    if (error?.code === "23505") {
      await sql`
        UPDATE user_auth_challenges
        SET consumed_at = NOW(), updated_at = NOW()
        WHERE id = ${challengeId}
      `;
      return json({ ok: false, error: "Email tidak dapat digunakan untuk pendaftaran." }, 409);
    }
    throw error;
  }
}

async function passwordForgot(sql, request, env) {
  const startedAt = Date.now();
  authServiceReady(env);
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
        INSERT INTO user_auth_challenges (
          id, purpose, email, code_hash, expires_at, max_attempts, last_sent_at
        ) VALUES (
          ${challengeId}, 'password_reset', ${email}, ${codeHash},
          NOW() + INTERVAL '10 minutes', ${OTP_MAX_ATTEMPTS}, NOW()
        )
      `;

      try {
        await sendAuthCode(env, {
          to: email,
          code,
          purpose: "password_reset",
          expiresMinutes: OTP_TTL_MINUTES,
          idempotencyKey: `password-reset-${challengeId}`
        });
        await audit(sql, request, { userId: user.id, email, eventType: "password_reset_requested", outcome: "requested" });
      } catch (error) {
        await sql`
          UPDATE user_auth_challenges
          SET consumed_at = NOW(), updated_at = NOW()
          WHERE id = ${challengeId}
        `;
        await audit(sql, request, { userId: user.id, email, eventType: "password_reset_delivery", outcome: "failure", metadata: { provider_status: error?.status || null } });
      }
    }
  }

  const remainingFloor = 700 - (Date.now() - startedAt);
  if (remainingFloor > 0) await new Promise(resolve => setTimeout(resolve, remainingFloor));

  return json({
    ok: true,
    message: RECOVERY_MESSAGE,
    expires_in: OTP_TTL_MINUTES * 60,
    resend_after: OTP_RESEND_SECONDS
  }, 202);
}

async function passwordVerify(sql, request, env) {
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
    await audit(sql, request, { email, eventType: "password_reset_otp_verify", outcome: "failure" });
    return json({ ok: false, error: "Kode pemulihan tidak valid atau sudah kedaluwarsa." }, 400);
  }

  const resetToken = randomToken(32);
  const resetTokenHash = await sha256Hex(resetToken);
  const updated = await sql`
    UPDATE user_auth_challenges
    SET
      verified_at = NOW(),
      reset_token_hash = ${resetTokenHash},
      reset_token_expires_at = NOW() + INTERVAL '10 minutes',
      updated_at = NOW()
    WHERE id = ${challenge.id}
      AND consumed_at IS NULL
      AND verified_at IS NULL
    RETURNING id
  `;
  if (!updated[0]) return json({ ok: false, error: "Kode pemulihan tidak valid atau sudah digunakan." }, 409);

  await audit(sql, request, { email, eventType: "password_reset_otp_verified", outcome: "success" });
  return json({
    ok: true,
    reset_token: resetToken,
    reset_token_expires_in: RESET_TOKEN_TTL_MINUTES * 60,
    message: "Kode terverifikasi. Buat kata sandi baru."
  });
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
    SET
      password_hash = ${newPasswordHash},
      password_changed_at = NOW(),
      updated_at = NOW()
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
  await audit(sql, request, { userId: user.id, email, eventType: "password_reset_completed", outcome: "success", metadata: { sessions_revoked: true } });

  return json({
    ok: true,
    message: "Kata sandi berhasil diperbarui. Silakan masuk kembali di semua perangkat."
  });
}

async function login(sql, request) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Email dan kata sandi wajib diisi." }, 400);

  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  if (!email || !password) return json({ ok: false, error: "Email dan kata sandi wajib diisi." }, 400);

  const users = await sql`
    SELECT id, name, email, role, email_verified
    FROM users
    WHERE
      email = ${email}
      AND is_active = TRUE
      AND email_verified = TRUE
      AND password_hash = crypt(${password}, password_hash)
    LIMIT 1
  `;

  if (!users[0]) {
    await audit(sql, request, { email, eventType: "login", outcome: "failure" });
    return json({ ok: false, error: "Email atau kata sandi salah." }, 401);
  }

  const user = users[0];
  const token = await createSession(sql, user.id);
  await sql`
    UPDATE users
    SET last_login_at = NOW()
    WHERE id = ${user.id}
  `;
  await audit(sql, request, { userId: user.id, email: user.email, eventType: "login", outcome: "success" });

  return json({ ok: true, message: "Login berhasil.", user }, 200, { "Set-Cookie": sessionCookie(token) });
}

async function me(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return json({ ok: false, authenticated: false, error: "Belum login." }, 401);

  const sessions = await sql`
    SELECT
      s.id AS session_id,
      u.id,
      u.name,
      u.email,
      u.role,
      u.avatar_url,
      u.email_verified
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE
      s.token_hash = encode(digest(${token}, 'sha256'), 'hex')
      AND s.expires_at > NOW()
      AND u.is_active = TRUE
      AND u.email_verified = TRUE
    LIMIT 1
  `;

  const session = sessions[0];
  if (!session) {
    return json(
      { ok: false, authenticated: false, error: "Session tidak valid atau sudah berakhir." },
      401,
      { "Set-Cookie": clearSessionCookie() }
    );
  }

  await sql`UPDATE sessions SET last_used_at = NOW() WHERE id = ${session.session_id}`;
  return json({
    ok: true,
    authenticated: true,
    user: {
      id: session.id,
      name: session.name,
      email: session.email,
      role: session.role,
      avatar_url: session.avatar_url,
      email_verified: session.email_verified
    }
  });
}

async function logout(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) {
    await sql`
      DELETE FROM sessions
      WHERE token_hash = encode(digest(${token}, 'sha256'), 'hex')
    `;
  }
  return json({ ok: true, message: "Logout berhasil." }, 200, { "Set-Cookie": clearSessionCookie() });
}

export async function handlePublicAuthApi(request, env) {
  const action = route(request);
  if (!action) return null;

  try {
    const sql = neon(env.DATABASE_URL);
    if (action === "register") return await register(sql, request, env);
    if (action === "register-verify") return await registerVerify(sql, request, env);
    if (action === "register-resend") return await registerResend(sql, request, env);
    if (action === "password-forgot") return await passwordForgot(sql, request, env);
    if (action === "password-verify") return await passwordVerify(sql, request, env);
    if (action === "password-reset") return await passwordReset(sql, request);
    if (action === "login") return await login(sql, request);
    if (action === "me") return await me(sql, request);
    return await logout(sql, request);
  } catch (error) {
    console.error(`Public auth ${action} error:`, error?.code || error?.status || error?.message || "unknown");
    if (
      String(error?.message || "").includes("belum dikonfigurasi") ||
      String(error?.message || "").includes("Provider email")
    ) {
      return serviceUnavailable();
    }
    return json(
      {
        ok: false,
        authenticated: action === "me" ? false : undefined,
        error: action === "me"
          ? "Gagal memeriksa session."
          : action === "login"
            ? "Terjadi kesalahan saat login."
            : action.startsWith("password")
              ? "Pemulihan akun belum dapat diproses."
              : "Verifikasi akun belum dapat diproses."
      },
      500
    );
  }
}
