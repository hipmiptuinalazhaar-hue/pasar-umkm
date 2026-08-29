import { neon } from "@neondatabase/serverless";


// ==========================================
// COOKIE HELPER
// ==========================================

function getCookie(request, name) {
  const cookieHeader =
    request.headers.get("Cookie");

  if (!cookieHeader) {
    return null;
  }

  const cookies =
    cookieHeader.split(";");

  for (const cookie of cookies) {
    const [key, ...valueParts] =
      cookie.trim().split("=");

    if (key === name) {
      return valueParts.join("=") || null;
    }
  }

  return null;
}


// ==========================================
// SESSION TOKEN
// ==========================================

function createSessionToken() {
  const bytes =
    crypto.getRandomValues(
      new Uint8Array(32)
    );

  let binary = "";

  for (const byte of bytes) {
    binary +=
      String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


// ==========================================
// STORE SLUG
// ==========================================

function createStoreSlug(name) {
  const base =
    String(name || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      )
      .slice(0, 60);

  const suffix =
    crypto
      .randomUUID()
      .replace(/-/g, "")
      .slice(0, 8);

  return `${base || "umkm"}-${suffix}`;
}


// ==========================================
// CLOUDFLARE WORKER
// ==========================================

export default {
  async fetch(request, env) {
    const url =
      new URL(request.url);


    // ========================================
    // API HEALTH CHECK
    // ========================================

    if (
      url.pathname ===
      "/api/health"
    ) {
      try {
        const sql =
          neon(
            env.DATABASE_URL
          );

        const result =
          await sql`
            SELECT
              current_database()
                AS database,

              (
                SELECT
                  COUNT(*)::int

                FROM
                  information_schema.tables

                WHERE
                  table_schema =
                  'public'
              ) AS tables
          `;

        return Response.json(
          {
            ok: true,

            app:
              "Pasar UMKM",

            backend:
              "Cloudflare Workers",

            database: {
              connected:
                true,

              name:
                result[0].database,

              tables:
                result[0].tables
            }
          },
          {
            headers: {
              "Cache-Control":
                "no-store"
            }
          }
        );

      } catch (error) {
        console.error(
          "Health check error:",
          error
        );

        return Response.json(
          {
            ok: false,

            error:
              "Database connection failed"
          },
          {
            status: 500,

            headers: {
              "Cache-Control":
                "no-store"
            }
          }
        );
      }
    }


    // ========================================
    // API CATEGORIES
    // ========================================

    if (
      url.pathname ===
        "/api/categories" &&

      request.method ===
        "GET"
    ) {
      try {
        const sql =
          neon(
            env.DATABASE_URL
          );

        const categories =
          await sql`
            SELECT
              id,
              name,
              slug,
              icon,
              sort_order,
              is_home

            FROM
              categories

            WHERE
              is_active = TRUE

            ORDER BY
              sort_order ASC,
              name ASC
          `;

        return Response.json(
          {
            ok: true,

            count:
              categories.length,

            categories
          },
          {
            status: 200,

            headers: {
              "Cache-Control":
                "no-store"
            }
          }
        );

      } catch (error) {
        console.error(
          "Categories error:",
          error
        );

        return Response.json(
          {
            ok: false,

            error:
              "Failed to load categories"
          },
          {
            status: 500,

            headers: {
              "Cache-Control":
                "no-store"
            }
          }
        );
      }
    }


    // ========================================
    // API STORES - GET
    // ========================================

    if (
      url.pathname ===
        "/api/stores" &&

      request.method ===
        "GET"
    ) {
      try {
        const sql =
          neon(
            env.DATABASE_URL
          );

        const stores =
          await sql`
            SELECT
              id,
              name

            FROM
              stores

            WHERE
              is_active = TRUE

            ORDER BY
              name ASC
          `;

        return Response.json(
          {
            ok: true,

            count:
              stores.length,

            stores
          },
          {
            status: 200,

            headers: {
              "Cache-Control":
                "no-store"
            }
          }
        );

      } catch (error) {
        console.error(
          "Stores GET error:",
          error
        );

        return Response.json(
          {
            ok: false,

            error:
              "Gagal memuat data UMKM."
          },
          {
            status: 500,

            headers: {
              "Cache-Control":
                "no-store"
            }
          }
        );
      }
    }


    // ========================================
    // API STORES - CREATE
    // ========================================

    if (
      url.pathname ===
        "/api/stores" &&

      request.method ===
        "POST"
    ) {
      try {

        // ====================================
        // SESSION
        // ====================================

        const sessionToken =
          getCookie(
            request,
            "__Host-pasar_umkm_session"
          );

        if (!sessionToken) {
          return Response.json(
            {
              ok: false,

              error:
                "Silakan masuk terlebih dahulu."
            },
            {
              status: 401,

              headers: {
                "Cache-Control":
                  "no-store"
              }
            }
          );
        }


        const sql =
          neon(
            env.DATABASE_URL
          );


        // ====================================
        // CURRENT USER
        // ====================================

        const sessions =
          await sql`
            SELECT
              u.id,
              u.name,
              u.email,
              u.role

            FROM
              sessions s

            JOIN
              users u

              ON
                u.id =
                s.user_id

            WHERE
              s.token_hash =
                encode(
                  digest(
                    ${sessionToken},
                    'sha256'
                  ),
                  'hex'
                )

              AND
              s.expires_at >
                NOW()

              AND
              u.is_active =
                TRUE

            LIMIT 1
          `;


        if (
          sessions.length ===
          0
        ) {
          return Response.json(
            {
              ok: false,

              error:
                "Session tidak valid atau sudah berakhir."
            },
            {
              status: 401,

              headers: {
                "Cache-Control":
                  "no-store",

                "Set-Cookie":
                  "__Host-pasar_umkm_session=; " +
                  "Path=/; " +
                  "HttpOnly; " +
                  "Secure; " +
                  "SameSite=Lax; " +
                  "Max-Age=0"
              }
            }
          );
        }


        const currentUser =
          sessions[0];


        // ====================================
        // BODY
        // ====================================

        let body;

        try {
          body =
            await request.json();
        } catch {
          return Response.json(
            {
              ok: false,

              error:
                "Data UMKM tidak valid."
            },
            {
              status: 400,

              headers: {
                "Cache-Control":
                  "no-store"
              }
            }
          );
        }


        const name =
          String(
            body.name || ""
          )
            .trim()
            .replace(
              /\s+/g,
              " "
            );


        // ====================================
        // VALIDATION
        // ====================================

        if (
          name.length < 3
        ) {
          return Response.json(
            {
              ok: false,

              error:
                "Nama UMKM minimal 3 karakter."
            },
            {
              status: 400,

              headers: {
                "Cache-Control":
                  "no-store"
              }
            }
          );
        }


        if (
          name.length > 100
        ) {
          return Response.json(
            {
              ok: false,

              error:
                "Nama UMKM maksimal 100 karakter."
            },
            {
              status: 400,

              headers: {
                "Cache-Control":
                  "no-store"
              }
            }
          );
        }


        // ====================================
        // ONE USER = ONE STORE
        // ====================================

        const existingStores =
          await sql`
            SELECT
              id,
              name

            FROM
              stores

            WHERE
              owner_id =
                ${currentUser.id}

            LIMIT 1
          `;


        if (
          existingStores.length >
          0
        ) {
          return Response.json(
            {
              ok: false,

              error:
                "Akun ini sudah memiliki UMKM.",

              store:
                existingStores[0]
            },
            {
              status: 409,

              headers: {
                "Cache-Control":
                  "no-store"
              }
            }
          );
        }


        // ====================================
        // CREATE STORE
        // ====================================

        const slug =
          createStoreSlug(name);


        const stores =
          await sql`
            INSERT INTO stores (
              owner_id,
              name,
              slug
            )

            VALUES (
              ${currentUser.id},
              ${name},
              ${slug}
            )

            RETURNING
              id,
              owner_id,
              name,
              slug,
              verification_status,
              is_active,
              city,
              province,
              created_at
          `;


        const store =
          stores[0];


        // ====================================
        // BUYER -> SELLER
        // ====================================

        let finalRole =
          currentUser.role;


        if (
          currentUser.role ===
          "buyer"
        ) {
          const updatedUsers =
            await sql`
              UPDATE
                users

              SET
                role =
                  'seller'

              WHERE
                id =
                  ${currentUser.id}

              RETURNING
                role
            `;

          if (
            updatedUsers.length >
            0
          ) {
            finalRole =
              updatedUsers[0].role;
          }
        }


        return Response.json(
          {
            ok: true,

            message:
              "UMKM berhasil didaftarkan.",

            store,

            user: {
              id:
                currentUser.id,

              name:
                currentUser.name,

              email:
                currentUser.email,

              role:
                finalRole
            }
          },
          {
            status: 201,

            headers: {
              "Cache-Control":
                "no-store"
            }
          }
        );

      } catch (error) {
        console.error(
          "Stores POST error:",
          error
        );


        if (
          error?.code ===
          "23505"
        ) {
          return Response.json(
            {
              ok: false,

              error:
                "UMKM tersebut sudah terdaftar."
            },
            {
              status: 409,

              headers: {
                "Cache-Control":
                  "no-store"
              }
            }
          );
        }


        return Response.json(
          {
            ok: false,

            error:
              "Gagal mendaftarkan UMKM."
          },
          {
            status: 500,

            headers: {
              "Cache-Control":
                "no-store"
            }
          }
        );
      }
    }


    // ========================================
    // AUTH - REGISTER
    // ========================================

    if (
      url.pathname ===
        "/api/auth/register" &&

      request.method ===
        "POST"
    ) {
      let stage =
        "start";

      try {
        stage =
          "parse_body";

        const body =
          await request.json();

        const name =
          String(
            body.name || ""
          ).trim();

        const email =
          String(
            body.email || ""
          )
            .trim()
            .toLowerCase();

        const password =
          String(
            body.password || ""
          );


        stage =
          "validation";


        if (
          name.length < 2 ||
          name.length > 100
        ) {
          return Response.json(
            {
              ok: false,

              error:
                "Nama harus terdiri dari 2 sampai 100 karakter."
            },
            {
              status: 400,

              headers: {
                "Cache-Control":
                  "no-store"
              }
            }
          );
        }


        const emailPattern =
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


        if (
          !emailPattern.test(email) ||
          email.length > 255
        ) {
          return Response.json(
            {
              ok: false,

              error:
                "Alamat email tidak valid."
            },
            {
              status: 400,

              headers: {
                "Cache-Control":
                  "no-store"
              }
            }
          );
        }


        const passwordBytes =
          new TextEncoder()
            .encode(password)
            .length;


        if (
          passwordBytes < 8
        ) {
          return Response.json(
            {
              ok: false,

              error:
                "Password minimal 8 karakter."
            },
            {
              status: 400,

              headers: {
                "Cache-Control":
                  "no-store"
              }
            }
          );
        }


        if (
          passwordBytes > 72
        ) {
          return Response.json(
            {
              ok: false,

              error:
                "Password terlalu panjang."
            },
            {
              status: 400,

              headers: {
                "Cache-Control":
                  "no-store"
              }
            }
          );
        }


        stage =
          "database_init";


        const sql =
          neon(
            env.DATABASE_URL
          );


        stage =
          "check_email";


        const existingUser =
          await sql`
            SELECT
              id

            FROM
              users

            WHERE
              email =
                ${email}

            LIMIT 1
          `;


        if (
          existingUser.length >
          0
        ) {
          return Response.json(
            {
              ok: false,

              error:
                "Email sudah terdaftar."
            },
            {
              status: 409,

              headers: {
                "Cache-Control":
                  "no-store"
              }
            }
          );
        }


        stage =
          "insert_user";


        const users =
          await sql`
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
                gen_salt(
                  'bf',
                  12
                )
              )
            )

            RETURNING
              id,
              name,
              email,
              role,
              created_at
          `;


        return Response.json(
          {
            ok: true,

            message:
              "Akun berhasil dibuat.",

            user:
              users[0]
          },
          {
            status: 201,

            headers: {
              "Cache-Control":
                "no-store"
            }
          }
        );

      } catch (error) {
        console.error(
          "Register error:",
          error
        );

        return Response.json(
          {
            ok: false,

            error:
              "Register gagal.",

            stage,

            error_name:
              error?.name ||
              "UnknownError",

            error_code:
              error?.code ||
              null
          },
          {
            status: 500,

            headers: {
              "Cache-Control":
                "no-store"
            }
          }
        );
      }
    }


    // ========================================
    // AUTH - LOGIN
    // ========================================

    if (
      url.pathname ===
        "/api/auth/login" &&

      request.method ===
        "POST"
    ) {
      try {
        const body =
          await request.json();

        const email =
          String(
            body.email || ""
          )
            .trim()
            .toLowerCase();

        const password =
          String(
            body.password || ""
          );


        if (
          !email ||
          !password
        ) {
          return Response.json(
            {
              ok: false,

              error:
                "Email dan password wajib diisi."
            },
            {
              status: 400,

              headers: {
                "Cache-Control":
                  "no-store"
              }
            }
          );
        }


        const sql =
          neon(
            env.DATABASE_URL
          );


        const users =
          await sql`
            SELECT
              id,
              name,
              email,
              role

            FROM
              users

            WHERE
              email =
                ${email}

              AND
              is_active =
                TRUE

              AND
              password_hash =
                crypt(
                  ${password},
                  password_hash
                )

            LIMIT 1
          `;


        if (
          users.length ===
          0
        ) {
          return Response.json(
            {
              ok: false,

              error:
                "Email atau password salah."
            },
            {
              status: 401,

              headers: {
                "Cache-Control":
                  "no-store"
              }
            }
          );
        }


        const user =
          users[0];


        const sessionToken =
          createSessionToken();


        await sql`
          INSERT INTO sessions (
            user_id,
            token_hash,
            expires_at
          )

          VALUES (
            ${user.id},

            encode(
              digest(
                ${sessionToken},
                'sha256'
              ),
              'hex'
            ),

            NOW() +
              INTERVAL
              '7 days'
          )
        `;


        await sql`
          UPDATE
            users

          SET
            last_login_at =
              NOW()

          WHERE
            id =
              ${user.id}
        `;


        return Response.json(
          {
            ok: true,

            message:
              "Login berhasil.",

            user
          },
          {
            status: 200,

            headers: {
              "Cache-Control":
                "no-store",

              "Set-Cookie":
                `__Host-pasar_umkm_session=${sessionToken}; ` +
                `Path=/; ` +
                `HttpOnly; ` +
                `Secure; ` +
                `SameSite=Lax; ` +
                `Max-Age=604800`
            }
          }
        );

      } catch (error) {
        console.error(
          "Login error:",
          error
        );

        return Response.json(
          {
            ok: false,

            error:
              "Terjadi kesalahan saat login."
          },
          {
            status: 500,

            headers: {
              "Cache-Control":
                "no-store"
            }
          }
        );
      }
    }


    // ========================================
    // AUTH - ME
    // ========================================

    if (
      url.pathname ===
        "/api/auth/me" &&

      request.method ===
        "GET"
    ) {
      try {
        const sessionToken =
          getCookie(
            request,
            "__Host-pasar_umkm_session"
          );


        if (!sessionToken) {
          return Response.json(
            {
              ok: false,

              authenticated:
                false,

              error:
                "Belum login."
            },
            {
              status: 401,

              headers: {
                "Cache-Control":
                  "no-store"
              }
            }
          );
        }


        const sql =
          neon(
            env.DATABASE_URL
          );


        const sessions =
          await sql`
            SELECT
              s.id
                AS session_id,

              u.id,
              u.name,
              u.email,
              u.role,
              u.avatar_url

            FROM
              sessions s

            JOIN
              users u

              ON
                u.id =
                s.user_id

            WHERE
              s.token_hash =
                encode(
                  digest(
                    ${sessionToken},
                    'sha256'
                  ),
                  'hex'
                )

              AND
              s.expires_at >
                NOW()

              AND
              u.is_active =
                TRUE

            LIMIT 1
          `;


        if (
          sessions.length ===
          0
        ) {
          return Response.json(
            {
              ok: false,

              authenticated:
                false,

              error:
                "Session tidak valid atau sudah berakhir."
            },
            {
              status: 401,

              headers: {
                "Cache-Control":
                  "no-store",

                "Set-Cookie":
                  "__Host-pasar_umkm_session=; " +
                  "Path=/; " +
                  "HttpOnly; " +
                  "Secure; " +
                  "SameSite=Lax; " +
                  "Max-Age=0"
              }
            }
          );
        }


        const session =
          sessions[0];


        await sql`
          UPDATE
            sessions

          SET
            last_used_at =
              NOW()

          WHERE
            id =
              ${session.session_id}
        `;


        return Response.json(
          {
            ok: true,

            authenticated:
              true,

            user: {
              id:
                session.id,

              name:
                session.name,

              email:
                session.email,

              role:
                session.role,

              avatar_url:
                session.avatar_url
            }
          },
          {
            status: 200,

            headers: {
              "Cache-Control":
                "no-store"
            }
          }
        );

      } catch (error) {
        console.error(
          "Auth me error:",
          error
        );

        return Response.json(
          {
            ok: false,

            authenticated:
              false,

            error:
              "Gagal memeriksa session."
          },
          {
            status: 500,

            headers: {
              "Cache-Control":
                "no-store"
            }
          }
        );
      }
    }


    // ========================================
    // AUTH - LOGOUT
    // ========================================

    if (
      url.pathname ===
        "/api/auth/logout" &&

      request.method ===
        "POST"
    ) {
      try {
        const sessionToken =
          getCookie(
            request,
            "__Host-pasar_umkm_session"
          );


        if (sessionToken) {
          const sql =
            neon(
              env.DATABASE_URL
            );


          await sql`
            DELETE FROM
              sessions

            WHERE
              token_hash =
                encode(
                  digest(
                    ${sessionToken},
                    'sha256'
                  ),
                  'hex'
                )
          `;
        }


        return Response.json(
          {
            ok: true,

            message:
              "Logout berhasil."
          },
          {
            status: 200,

            headers: {
              "Cache-Control":
                "no-store",

              "Set-Cookie":
                "__Host-pasar_umkm_session=; " +
                "Path=/; " +
                "HttpOnly; " +
                "Secure; " +
                "SameSite=Lax; " +
                "Max-Age=0"
            }
          }
        );

      } catch (error) {
        console.error(
          "Logout error:",
          error
        );

        return Response.json(
          {
            ok: false,

            error:
              "Terjadi kesalahan saat logout."
          },
          {
            status: 500,

            headers: {
              "Cache-Control":
                "no-store"
            }
          }
        );
      }
    }


    // ========================================
    // API 404
    // ========================================

    if (
      url.pathname.startsWith(
        "/api/"
      )
    ) {
      return Response.json(
        {
          ok: false,

          error:
            "API endpoint tidak ditemukan."
        },
        {
          status: 404,

          headers: {
            "Cache-Control":
              "no-store"
          }
        }
      );
    }


    // ========================================
    // STATIC WEBSITE
    // ========================================

    return env.ASSETS.fetch(
      request
    );
  }
};
