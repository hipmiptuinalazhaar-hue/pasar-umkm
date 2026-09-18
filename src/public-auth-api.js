import { neon } from "@neondatabase/serverless";
import { handlePublicAuthSecurityV2Api } from "./public-auth-security-v2-api.js";
import { normalizeEmail, validEmail, validatePassword, auditAuth } from "./auth-security-v2-shared.js";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const MAX_SESSION_AGE = 604800;
const MAX_BCRYPT_PASSWORD_BYTES = 72;
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

function createSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function coreRoute(request) {
  const url = new URL(request.url);
  const method = request.method;
  if (url.pathname === "/api/auth/register" && method === "POST") return "register";
  if (url.pathname === "/api/auth/login" && method === "POST") return "login";
  if (url.pathname === "/api/auth/me" && method === "GET") return "me";
  if (url.pathname === "/api/auth/logout" && method === "POST") return "logout";
  return null;
}

function isSecurityV2Route(request) {
  const url = new URL(request.url);
  if (request.method !== "POST") return false;
  return url.pathname.startsWith("/api/auth/password/");
}

async function register(sql, request) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Data pendaftaran tidak valid." }, 400);

  const name = String(body.name || "").trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  if (name.length < 2 || name.length > 100) {
    return json({ ok: false, error: "Nama harus terdiri dari 2 sampai 100 karakter." }, 400);
  }
  if (!validEmail(email)) {
    return json({ ok: false, error: "Alamat email tidak valid." }, 400);
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return json({ ok: false, error: passwordError }, 400);
  }

  const existing = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
  if (existing[0]) {
    await auditAuth(sql, request, {
      email,
      eventType: "registration_direct",
      outcome: "blocked",
      metadata: { reason: "email_unavailable", email_verification_required: false }
    });
    return json({ ok: false, error: "Email tidak dapat digunakan untuk pendaftaran." }, 409);
  }

  const token = createSessionToken();
  try {
    const users = await sql`
      WITH created_user AS (
        INSERT INTO users (
          name, email, password_hash, email_verified, email_verified_at, last_login_at
        ) VALUES (
          ${name}, ${email}, crypt(${password}, gen_salt('bf', 12)), TRUE, NOW(), NOW()
        )
        RETURNING id, name, email, role, email_verified, created_at
      ),
      created_session AS (
        INSERT INTO sessions (user_id, token_hash, expires_at)
        SELECT id, encode(digest(${token}, 'sha256'), 'hex'), NOW() + INTERVAL '7 days'
        FROM created_user
        RETURNING user_id
      )
      SELECT cu.*
      FROM created_user cu
      JOIN created_session cs ON cs.user_id = cu.id
    `;
    const user = users[0];
    if (!user) throw new Error("USER_CREATION_FAILED");

    await auditAuth(sql, request, {
      userId: user.id,
      email: user.email,
      eventType: "registration_direct",
      outcome: "success",
      metadata: { email_verification_required: false }
    });

    return json(
      { ok: true, message: "Akun berhasil dibuat. Anda sudah masuk.", user },
      201,
      { "Set-Cookie": sessionCookie(token) }
    );
  } catch (error) {
    if (error?.code === "23505") {
      await auditAuth(sql, request, {
        email,
        eventType: "registration_direct",
        outcome: "blocked",
        metadata: { reason: "email_unavailable_race", email_verification_required: false }
      });
      return json({ ok: false, error: "Email tidak dapat digunakan untuk pendaftaran." }, 409);
    }
    throw error;
  }
}

async function login(sql, request) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Email dan kata sandi wajib diisi." }, 400);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  if (!email || !password) return json({ ok: false, error: "Email dan kata sandi wajib diisi." }, 400);

  const passwordBytes = textEncoder.encode(password).length;
  if (!validEmail(email) || passwordBytes > MAX_BCRYPT_PASSWORD_BYTES) {
    await auditAuth(sql, request, { email, eventType: "login", outcome: "failure", metadata: { reason: "invalid_credentials_shape" } });
    return json({ ok: false, error: "Email atau kata sandi salah." }, 401);
  }

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
  const sessions = await sql`
    WITH touched_user AS (
      UPDATE users
      SET last_login_at = NOW(), updated_at = NOW()
      WHERE id = ${user.id}
      RETURNING id
    )
    INSERT INTO sessions (user_id, token_hash, expires_at)
    SELECT id, encode(digest(${token}, 'sha256'), 'hex'), NOW() + INTERVAL '7 days'
    FROM touched_user
    RETURNING id
  `;
  if (!sessions[0]) throw new Error("SESSION_CREATION_FAILED");

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
    await sql`DELETE FROM sessions WHERE token_hash = encode(digest(${token}, 'sha256'), 'hex')`;
  }
  return json({ ok: true, message: "Logout berhasil." }, 200, { "Set-Cookie": clearSessionCookie() });
}

export async function handlePublicAuthApi(request, env) {
  const action = coreRoute(request);
  const securityV2 = isSecurityV2Route(request);
  if (!action && !securityV2) return null;

  try {
    const sql = neon(env.DATABASE_URL);
    if (securityV2) return await handlePublicAuthSecurityV2Api(sql, request, env);
    if (action === "register") return await register(sql, request);
    if (action === "login") return await login(sql, request);
    if (action === "me") return await me(sql, request);
    return await logout(sql, request);
  } catch (error) {
    console.error(`Public auth ${action || "security-v2"} error:`, error?.code || error?.status || "unknown");
    return json({
      ok: false,
      authenticated: action === "me" ? false : undefined,
      error: action === "me"
        ? "Gagal memeriksa session."
        : action === "login"
          ? "Terjadi kesalahan saat login."
          : action === "register"
            ? "Pendaftaran belum dapat diproses."
            : "Layanan keamanan akun sementara tidak tersedia."
    }, 500);
  }
}
