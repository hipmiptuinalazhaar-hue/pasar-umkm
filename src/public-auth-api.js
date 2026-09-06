import { neon } from "@neondatabase/serverless";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const MAX_SESSION_AGE = 604800;

function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
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
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
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

async function register(sql, request) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Data pendaftaran tidak valid." }, 400);

  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (name.length < 2 || name.length > 100) {
    return json({ ok: false, error: "Nama harus terdiri dari 2 sampai 100 karakter." }, 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return json({ ok: false, error: "Alamat email tidak valid." }, 400);
  }

  const passwordBytes = new TextEncoder().encode(password).length;
  if (passwordBytes < 8) {
    return json({ ok: false, error: "Password minimal 8 karakter." }, 400);
  }
  if (passwordBytes > 72) {
    return json({ ok: false, error: "Password terlalu panjang." }, 400);
  }

  const existing = await sql`
    SELECT id
    FROM users
    WHERE email = ${email}
    LIMIT 1
  `;

  if (existing.length) {
    return json({ ok: false, error: "Email sudah terdaftar." }, 409);
  }

  try {
    const users = await sql`
      INSERT INTO users (name, email, password_hash)
      VALUES (
        ${name},
        ${email},
        crypt(${password}, gen_salt('bf', 12))
      )
      RETURNING id, name, email, role, created_at
    `;

    return json(
      {
        ok: true,
        message: "Akun berhasil dibuat.",
        user: users[0]
      },
      201
    );
  } catch (error) {
    if (error?.code === "23505") {
      return json({ ok: false, error: "Email sudah terdaftar." }, 409);
    }
    throw error;
  }
}

async function login(sql, request) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Email dan password wajib diisi." }, 400);

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) {
    return json({ ok: false, error: "Email dan password wajib diisi." }, 400);
  }

  const users = await sql`
    SELECT id, name, email, role
    FROM users
    WHERE
      email = ${email}
      AND is_active = TRUE
      AND password_hash = crypt(${password}, password_hash)
    LIMIT 1
  `;

  if (!users[0]) {
    return json({ ok: false, error: "Email atau password salah." }, 401);
  }

  const user = users[0];
  const token = createSessionToken();

  await sql`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (
      ${user.id},
      encode(digest(${token}, 'sha256'), 'hex'),
      NOW() + INTERVAL '7 days'
    )
  `;

  await sql`
    UPDATE users
    SET last_login_at = NOW()
    WHERE id = ${user.id}
  `;

  return json(
    {
      ok: true,
      message: "Login berhasil.",
      user
    },
    200,
    { "Set-Cookie": sessionCookie(token) }
  );
}

async function me(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) {
    return json({ ok: false, authenticated: false, error: "Belum login." }, 401);
  }

  const sessions = await sql`
    SELECT
      s.id AS session_id,
      u.id,
      u.name,
      u.email,
      u.role,
      u.avatar_url
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE
      s.token_hash = encode(digest(${token}, 'sha256'), 'hex')
      AND s.expires_at > NOW()
      AND u.is_active = TRUE
    LIMIT 1
  `;

  const session = sessions[0];
  if (!session) {
    return json(
      {
        ok: false,
        authenticated: false,
        error: "Session tidak valid atau sudah berakhir."
      },
      401,
      { "Set-Cookie": clearSessionCookie() }
    );
  }

  await sql`
    UPDATE sessions
    SET last_used_at = NOW()
    WHERE id = ${session.session_id}
  `;

  return json({
    ok: true,
    authenticated: true,
    user: {
      id: session.id,
      name: session.name,
      email: session.email,
      role: session.role,
      avatar_url: session.avatar_url
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

  return json(
    { ok: true, message: "Logout berhasil." },
    200,
    { "Set-Cookie": clearSessionCookie() }
  );
}

export async function handlePublicAuthApi(request, env) {
  const action = route(request);
  if (!action) return null;

  try {
    const sql = neon(env.DATABASE_URL);
    if (action === "register") return await register(sql, request);
    if (action === "login") return await login(sql, request);
    if (action === "me") return await me(sql, request);
    return await logout(sql, request);
  } catch (error) {
    console.error(`Public auth ${action} error:`, error);
    return json(
      {
        ok: false,
        authenticated: action === "me" ? false : undefined,
        error: action === "register"
          ? "Register gagal."
          : action === "login"
            ? "Terjadi kesalahan saat login."
            : action === "me"
              ? "Gagal memeriksa session."
              : "Terjadi kesalahan saat logout."
      },
      500
    );
  }
}
