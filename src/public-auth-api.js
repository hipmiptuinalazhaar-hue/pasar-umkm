import { neon } from "@neondatabase/serverless";
import { sendAuthCode } from "./auth-email.js";
import { handlePublicAuthSecurityV2Api } from "./public-auth-security-v2-api.js";
import {
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_SECONDS,
  normalizeEmail,
  validEmail,
  validatePassword,
  maskedEmail,
  createOtp,
  otpHash,
  auditAuth,
  assertAuthV2Configured,
  isAuthConfigurationError
} from "./auth-security-v2-shared.js";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const MAX_SESSION_AGE = 604800;

function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff", ...extraHeaders }
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

function createSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function route(request) {
  const url = new URL(request.url);
  const method = request.method;
  if (url.pathname === "/api/auth/register" && method === "POST") return "register";
  if (url.pathname === "/api/auth/login" && method === "POST") return "login";
  if (url.pathname === "/api/auth/me" && method === "GET") return "me";
  if (url.pathname === "/api/auth/logout" && method === "POST") return "logout";
  return null;
}

function serviceUnavailable() {
  return json(
    { ok: false, error: "Layanan verifikasi akun sedang tidak tersedia. Coba lagi beberapa saat.", code: "AUTH_SERVICE_UNAVAILABLE" },
    503,
    { "Retry-After": "60" }
  );
}

async function register(sql, request, env) {
  assertAuthV2Configured(env);
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Data pendaftaran tidak valid." }, 400);

  const name = String(body.name || "").trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  if (name.length < 2 || name.length > 100) return json({ ok: false, error: "Nama harus terdiri dari 2 sampai 100 karakter." }, 400);
  if (!validEmail(email)) return json({ ok: false, error: "Alamat email tidak valid." }, 400);
  const passwordError = validatePassword(password);
  if (passwordError) return json({ ok: false, error: passwordError }, 400);

  const existing = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
  if (existing.length) {
    await auditAuth(sql, request, { email, eventType: "registration_requested", outcome: "blocked", metadata: { reason: "email_unavailable" } });
    return json({ ok: false, error: "Email tidak dapat digunakan untuk pendaftaran." }, 409);
  }

  const hashes = await sql`SELECT crypt(${password}, gen_salt('bf', 12)) AS password_hash`;
  const pendingPasswordHash = hashes[0]?.password_hash;
  if (!pendingPasswordHash) throw new Error("Password hashing failed");

  const challengeId = crypto.randomUUID();
  const code = createOtp();
  const codeHash = await otpHash(env, challengeId, "register", code);
  await sql`
    UPDATE user_auth_challenges
    SET consumed_at = NOW(), updated_at = NOW()
    WHERE email = ${email} AND purpose = 'register' AND consumed_at IS NULL
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
    await sql`UPDATE user_auth_challenges SET consumed_at = NOW(), updated_at = NOW() WHERE id = ${challengeId}`;
    await auditAuth(sql, request, { email, eventType: "registration_otp_delivery", outcome: "failure", metadata: { provider_status: error?.status || null } });
    throw error;
  }

  await auditAuth(sql, request, { email, eventType: "registration_otp_sent", outcome: "success" });
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

async function login(sql, request) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Email dan kata sandi wajib diisi." }, 400);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  if (!email || !password) return json({ ok: false, error: "Email dan kata sandi wajib diisi." }, 400);

  const users = await sql`
    SELECT id, name, email, role, email_verified
    FROM users
    WHERE email = ${email}
      AND is_active = TRUE
      AND email_verified = TRUE
      AND password_hash = crypt(${password}, password_hash)
    LIMIT 1
  `;
  if (!users[0]) {
    await auditAuth(sql, request, { email, eventType: "login", outcome: "failure" });
    return json({ ok: false, error: "Email atau kata sandi salah." }, 401);
  }

  const user = users[0];
  const token = createSessionToken();
  await sql`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (${user.id}, encode(digest(${token}, 'sha256'), 'hex'), NOW() + INTERVAL '7 days')
  `;
  await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`;
  await auditAuth(sql, request, { userId: user.id, email: user.email, eventType: "login", outcome: "success" });
  return json({ ok: true, message: "Login berhasil.", user }, 200, { "Set-Cookie": sessionCookie(token) });
}

async function me(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return json({ ok: false, authenticated: false, error: "Belum login." }, 401);

  const sessions = await sql`
    SELECT s.id AS session_id, u.id, u.name, u.email, u.role, u.avatar_url, u.email_verified
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = encode(digest(${token}, 'sha256'), 'hex')
      AND s.expires_at > NOW()
      AND u.is_active = TRUE
      AND u.email_verified = TRUE
    LIMIT 1
  `;
  const session = sessions[0];
  if (!session) {
    return json({ ok: false, authenticated: false, error: "Session tidak valid atau sudah berakhir." }, 401, { "Set-Cookie": clearSessionCookie() });
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
  if (token) await sql`DELETE FROM sessions WHERE token_hash = encode(digest(${token}, 'sha256'), 'hex')`;
  return json({ ok: true, message: "Logout berhasil." }, 200, { "Set-Cookie": clearSessionCookie() });
}

export async function handlePublicAuthApi(request, env) {
  const coreAction = route(request);
  const url = new URL(request.url);
  const isV2Route = url.pathname.startsWith("/api/auth/register/") || url.pathname.startsWith("/api/auth/password/");
  if (!coreAction && !isV2Route) return null;

  try {
    const sql = neon(env.DATABASE_URL);
    if (isV2Route) return await handlePublicAuthSecurityV2Api(sql, request, env);
    if (coreAction === "register") return await register(sql, request, env);
    if (coreAction === "login") return await login(sql, request);
    if (coreAction === "me") return await me(sql, request);
    return await logout(sql, request);
  } catch (error) {
    console.error(`Public auth ${coreAction || "v2"} error:`, error?.code || error?.status || error?.message || "unknown");
    if (isAuthConfigurationError(error)) return serviceUnavailable();
    return json({
      ok: false,
      authenticated: coreAction === "me" ? false : undefined,
      error: coreAction === "me" ? "Gagal memeriksa session." : coreAction === "login" ? "Terjadi kesalahan saat login." : "Verifikasi akun belum dapat diproses."
    }, 500);
  }
}
