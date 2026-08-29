import { neon } from "@neondatabase/serverless";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ==========================================
    // API HEALTH CHECK
    // ==========================================
    if (url.pathname === "/api/health") {
      try {
        const sql = neon(env.DATABASE_URL);

        const result = await sql`
          SELECT
            current_database() AS database,
            (
              SELECT COUNT(*)::int
              FROM information_schema.tables
              WHERE table_schema = 'public'
            ) AS tables
        `;

        return Response.json({
          ok: true,
          app: "Pasar UMKM",
          backend: "Cloudflare Workers",
          database: {
            connected: true,
            name: result[0].database,
            tables: result[0].tables
          }
        });
      } catch (error) {
        return Response.json(
          {
            ok: false,
            error: "Database connection failed"
          },
          { status: 500 }
        );
      }
    }

    // ==========================================
    // API CATEGORIES
    // ==========================================
    if (
      url.pathname === "/api/categories" &&
      request.method === "GET"
    ) {
      try {
        const sql = neon(env.DATABASE_URL);

        const categories = await sql`
          SELECT
            id,
            name,
            slug,
            icon,
            sort_order,
            is_home
          FROM categories
          WHERE is_active = TRUE
          ORDER BY sort_order ASC, name ASC
        `;

        return Response.json({
          ok: true,
          count: categories.length,
          categories
        });
      } catch (error) {
        return Response.json(
          {
            ok: false,
            error: "Failed to load categories"
          },
          { status: 500 }
        );
      }
    }

    // ==========================================
    // AUTH - REGISTER
    // ==========================================
    if (
      url.pathname === "/api/auth/register" &&
      request.method === "POST"
    ) {
      let stage = "start";

      try {
        // --------------------------------------
        // 1. BACA REQUEST
        // --------------------------------------
        stage = "parse_body";

        const body = await request.json();

        const name = String(body.name || "").trim();

        const email = String(body.email || "")
          .trim()
          .toLowerCase();

        const password = String(body.password || "");

        // --------------------------------------
        // 2. VALIDASI
        // --------------------------------------
        stage = "validation";

        if (name.length < 2 || name.length > 100) {
          return Response.json(
            {
              ok: false,
              error: "Nama harus terdiri dari 2 sampai 100 karakter."
            },
            { status: 400 }
          );
        }

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(email) || email.length > 255) {
          return Response.json(
            {
              ok: false,
              error: "Alamat email tidak valid."
            },
            { status: 400 }
          );
        }

        const passwordBytes =
          new TextEncoder().encode(password).length;

        if (passwordBytes < 8) {
          return Response.json(
            {
              ok: false,
              error: "Password minimal 8 karakter."
            },
            { status: 400 }
          );
        }

        if (passwordBytes > 72) {
          return Response.json(
            {
              ok: false,
              error: "Password terlalu panjang."
            },
            { status: 400 }
          );
        }

        // --------------------------------------
        // 3. DATABASE
        // --------------------------------------
        stage = "database_init";

        const sql = neon(env.DATABASE_URL);

        // --------------------------------------
        // 4. CEK EMAIL
        // --------------------------------------
        stage = "check_email";

        const existingUser = await sql`
          SELECT id
          FROM users
          WHERE email = ${email}
          LIMIT 1
        `;

        if (existingUser.length > 0) {
          return Response.json(
            {
              ok: false,
              error: "Email sudah terdaftar."
            },
            { status: 409 }
          );
        }

        // --------------------------------------
        // 5. HASH PASSWORD + SIMPAN USER
        // bcrypt dijalankan oleh PostgreSQL pgcrypto
        // --------------------------------------
        stage = "insert_user";

        const users = await sql`
          INSERT INTO users (
            name,
            email,
            password_hash
          )
          VALUES (
            ${name},
            ${email},
            crypt(
              ${password},
              gen_salt('bf', 12)
            )
          )
          RETURNING
            id,
            name,
            email,
            role,
            created_at
        `;

        stage = "complete";

        return Response.json(
          {
            ok: true,
            message: "Akun berhasil dibuat.",
            user: users[0]
          },
          { status: 201 }
        );
      } catch (error) {
        console.error("Register error:", error);

        return Response.json(
          {
            ok: false,
            error: "Register gagal.",
            stage,
            error_name: error?.name || "UnknownError",
            error_code: error?.code || null
          },
          { status: 500 }
        );
      }
    }

    // ==========================================
    // API TIDAK DITEMUKAN
    // ==========================================
    if (url.pathname.startsWith("/api/")) {
      return Response.json(
        {
          ok: false,
          error: "API endpoint tidak ditemukan."
        },
        { status: 404 }
      );
    }

    // ==========================================
    // STATIC WEBSITE
    // ==========================================
    return env.ASSETS.fetch(request);
  }
};
