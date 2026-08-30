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

function createProductSlug(name) {
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

  return `${base || "produk"}-${suffix}`;
}

// ==========================================
// CLOUDFLARE WORKER
// ==========================================

export default {
  async fetch(request, env) {
    const url =
      new URL(request.url);


    // ========================================
    // API HEALTH
    // ========================================

    if (
      url.pathname === "/api/health"
    ) {
      try {
        const sql =
          neon(env.DATABASE_URL);

        const result =
          await sql`
            SELECT
              current_database() AS database,

              (
                SELECT
                  COUNT(*)::int
                FROM
                  information_schema.tables
                WHERE
                  table_schema = 'public'
              ) AS tables
          `;

        return Response.json(
          {
            ok: true,
            app: "Pasar UMKM",
            backend: "Cloudflare Workers",

            database: {
              connected: true,
              name: result[0].database,
              tables: result[0].tables
            }
          },
          {
            headers: {
              "Cache-Control": "no-store"
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
              "Cache-Control": "no-store"
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
      request.method === "GET"
    ) {
      try {
        const sql =
          neon(env.DATABASE_URL);

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
            count: categories.length,
            categories
          },
          {
            headers: {
              "Cache-Control": "no-store"
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
              "Cache-Control": "no-store"
            }
          }
        );
      }
    }


    // ========================================
    // STORE - CURRENT USER
    // GET /api/stores/me
    // ========================================

    if (
      url.pathname ===
        "/api/stores/me" &&
      request.method === "GET"
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
          neon(env.DATABASE_URL);


        // Cari user berdasarkan session
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
              ON u.id = s.user_id

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
              s.expires_at > NOW()

              AND
              u.is_active = TRUE

            LIMIT 1
          `;


        if (
          sessions.length === 0
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


        // Ambil toko milik user
        const stores =
          await sql`
            SELECT
              s.id,
              s.owner_id,
              s.category_id,

              c.name
                AS category_name,

              s.name,
              s.slug,
              s.description,

              s.logo_url,
              s.cover_url,

              s.phone,
              s.whatsapp,
              s.email,

              s.address,
              s.district,
              s.city,
              s.province,

              s.latitude,
              s.longitude,

              s.verification_status,
              s.verified_at,

              s.is_active,

              s.created_at,
              s.updated_at

            FROM
              stores s

            LEFT JOIN
              categories c

              ON
                c.id =
                s.category_id

            WHERE
              s.owner_id =
                ${currentUser.id}

            LIMIT 1
          `;


        if (
          stores.length === 0
        ) {
          return Response.json(
            {
              ok: true,
              has_store: false,
              store: null
            },
            {
              status: 200,
              headers: {
                "Cache-Control":
                  "no-store"
              }
            }
          );
        }


        return Response.json(
          {
            ok: true,
            has_store: true,
            store: stores[0]
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
          "Store ME error:",
          error
        );

        return Response.json(
          {
            ok: false,
            error:
              "Gagal memuat profil UMKM."
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
    // STORES - PUBLIC LIST
    // ========================================

    if (
      url.pathname ===
        "/api/stores" &&
      request.method === "GET"
    ) {
      try {
        const sql =
          neon(env.DATABASE_URL);

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
            count: stores.length,
            stores
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
// PRODUCTS - CURRENT SELLER
// GET /api/products/me
// ========================================

if (
  url.pathname ===
    "/api/products/me" &&
  request.method === "GET"
) {
  try {
    const sessionToken =
      getCookie(
        request,
        "__Host-pasar_umkm_session"
      );


    // =====================================
    // AUTH CHECK
    // =====================================

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
      neon(env.DATABASE_URL);


    // =====================================
    // CURRENT USER
    // =====================================

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
          ON u.id = s.user_id

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
          s.expires_at > NOW()

          AND
          u.is_active = TRUE

        LIMIT 1
      `;


    if (
      sessions.length === 0
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


    // =====================================
    // CURRENT USER STORE
    // =====================================

    const stores =
      await sql`
        SELECT
          id,
          name,
          slug,
          verification_status,
          is_active

        FROM
          stores

        WHERE
          owner_id =
            ${currentUser.id}

        LIMIT 1
      `;


    /*
     * User belum punya toko.
     * Bukan error.
     */
    if (
      stores.length === 0
    ) {
      return Response.json(
        {
          ok: true,
          has_store: false,
          store: null,
          count: 0,
          products: []
        },
        {
          status: 200,
          headers: {
            "Cache-Control":
              "no-store"
          }
        }
      );
    }


    const store =
      stores[0];


    // =====================================
    // PRODUCTS OWNED BY STORE
    // =====================================

    const products =
      await sql`
        SELECT
          p.id,
          p.store_id,
          p.category_id,

          c.name
            AS category_name,

          p.name,
          p.slug,
          p.description,

          p.price,
          p.stock,
          p.unit,

          p.thumbnail_url,

          COALESCE(
            NULLIF(
              p.thumbnail_url,
              ''
            ),

            (
              SELECT
                pi.image_url

              FROM
                product_images pi

              WHERE
                pi.product_id =
                  p.id

              ORDER BY
                pi.sort_order ASC,
                pi.created_at ASC

              LIMIT 1
            )
          )
            AS image_url,

          p.is_active,
          p.is_featured,

          p.created_at,
          p.updated_at

        FROM
          products p

        LEFT JOIN
          categories c
          ON c.id =
            p.category_id

        WHERE
          p.store_id =
            ${store.id}

        ORDER BY
          p.created_at DESC
      `;


    // =====================================
    // RESPONSE
    // =====================================

    return Response.json(
      {
        ok: true,

        has_store: true,

        store: {
          id:
            store.id,

          name:
            store.name,

          slug:
            store.slug,

          verification_status:
            store.verification_status,

          is_active:
            store.is_active
        },

        count:
          products.length,

        products
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
      "Products ME GET error:",
      error
    );


    return Response.json(
      {
        ok: false,
        error:
          "Gagal memuat produk toko."
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
// PRODUCTS - CREATE
// POST /api/products
// ========================================

if (
  url.pathname ===
    "/api/products" &&
  request.method === "POST"
) {
  try {
    const sessionToken =
      getCookie(
        request,
        "__Host-pasar_umkm_session"
      );


    // =====================================
    // AUTH
    // =====================================

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
      neon(env.DATABASE_URL);


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
          ON u.id = s.user_id

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
          s.expires_at > NOW()

          AND
          u.is_active = TRUE

        LIMIT 1
      `;


    if (
      sessions.length === 0
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


    // =====================================
    // CURRENT STORE
    // =====================================

    const stores =
      await sql`
        SELECT
          id,
          name,
          is_active

        FROM
          stores

        WHERE
          owner_id =
            ${currentUser.id}

        LIMIT 1
      `;


    if (
      stores.length === 0
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Akun ini belum memiliki UMKM."
        },
        {
          status: 403,
          headers: {
            "Cache-Control":
              "no-store"
          }
        }
      );
    }


    const store =
      stores[0];


    // =====================================
    // BODY
    // =====================================

    let body;

    try {
      body =
        await request.json();
    } catch {
      return Response.json(
        {
          ok: false,
          error:
            "Data produk tidak valid."
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
        .replace(/\s+/g, " ");


    const description =
      String(
        body.description || ""
      )
        .trim();


    const unit =
      String(
        body.unit || ""
      )
        .trim()
        .slice(0, 50);


    const thumbnailUrl =
      String(
        body.thumbnail_url || ""
      )
        .trim();


    const categoryId =
      body.category_id
        ? String(
            body.category_id
          ).trim()
        : null;


    const price =
      Number(
        body.price
      );


    const stock =
      Number(
        body.stock ?? 0
      );


    // =====================================
    // VALIDATION
    // =====================================

    if (
      name.length < 2
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Nama produk minimal 2 karakter."
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
      name.length > 150
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Nama produk terlalu panjang."
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
      !Number.isFinite(price) ||
      price < 0
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Harga produk tidak valid."
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
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Stok produk tidak valid."
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


    // =====================================
    // CATEGORY VALIDATION
    // =====================================

    if (categoryId) {
      const categories =
        await sql`
          SELECT
            id

          FROM
            categories

          WHERE
            id =
              ${categoryId}

            AND
            is_active = TRUE

          LIMIT 1
        `;


      if (
        categories.length === 0
      ) {
        return Response.json(
          {
            ok: false,
            error:
              "Kategori produk tidak valid."
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
    }


    // =====================================
    // CREATE PRODUCT
    // =====================================

    const slug =
      createProductSlug(
        name
      );


    const products =
      await sql`
        INSERT INTO products (
          store_id,
          category_id,
          name,
          slug,
          description,
          price,
          stock,
          unit,
          thumbnail_url,
          is_active
        )

        VALUES (
          ${store.id},
          ${categoryId},
          ${name},
          ${slug},
          ${
            description ||
            null
          },
          ${price},
          ${stock},
          ${
            unit ||
            null
          },
          ${
            thumbnailUrl ||
            null
          },
          TRUE
        )

        RETURNING
          id,
          store_id,
          category_id,
          name,
          slug,
          description,
          price,
          stock,
          unit,
          thumbnail_url,
          is_active,
          is_featured,
          created_at,
          updated_at
      `;


    const product =
      products[0];


    return Response.json(
      {
        ok: true,

        message:
          "Produk berhasil ditambahkan.",

        product
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
      "Products POST error:",
      error
    );


    return Response.json(
      {
        ok: false,
        error:
          "Gagal menambahkan produk."
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
// PRODUCTS - UPDATE
// PATCH /api/products/:id
// ========================================

if (
  url.pathname.startsWith(
    "/api/products/"
  ) &&
  url.pathname !==
    "/api/products/me" &&
  request.method === "PATCH"
) {
  try {

    // =====================================
    // PRODUCT ID
    // =====================================

    const productId =
      url.pathname
        .slice(
          "/api/products/".length
        )
        .trim();


    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


    if (
      !uuidPattern.test(productId)
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "ID produk tidak valid."
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


    // =====================================
    // AUTH
    // =====================================

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
      neon(env.DATABASE_URL);


    const sessions =
      await sql`
        SELECT
          u.id,
          u.role

        FROM
          sessions s

        JOIN
          users u
          ON u.id = s.user_id

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
          s.expires_at > NOW()

          AND
          u.is_active = TRUE

        LIMIT 1
      `;


    if (
      sessions.length === 0
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
              "no-store"
          }
        }
      );
    }


    const currentUser =
      sessions[0];


    if (
      currentUser.role !== "seller" &&
      currentUser.role !== "admin"
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Akun tidak memiliki izin mengubah produk."
        },
        {
          status: 403,
          headers: {
            "Cache-Control":
              "no-store"
          }
        }
      );
    }


    // =====================================
    // CURRENT STORE
    // =====================================

    const stores =
      await sql`
        SELECT
          id

        FROM
          stores

        WHERE
          owner_id =
            ${currentUser.id}

        LIMIT 1
      `;


    if (
      stores.length === 0
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "UMKM belum ditemukan."
        },
        {
          status: 403,
          headers: {
            "Cache-Control":
              "no-store"
          }
        }
      );
    }


    const store =
      stores[0];


    // =====================================
    // PRODUCT OWNERSHIP
    // =====================================

    const existingProducts =
      await sql`
        SELECT
          id

        FROM
          products

        WHERE
          id =
            ${productId}

          AND
          store_id =
            ${store.id}

        LIMIT 1
      `;


    if (
      existingProducts.length === 0
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Produk tidak ditemukan."
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


    // =====================================
    // BODY
    // =====================================

    let body;

    try {
      body =
        await request.json();
    } catch {
      return Response.json(
        {
          ok: false,
          error:
            "Data produk tidak valid."
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
        .replace(/\s+/g, " ");


    const description =
      String(
        body.description || ""
      ).trim();


    const unit =
      String(
        body.unit || ""
      )
        .trim()
        .slice(0, 50);


    const categoryId =
      body.category_id
        ? String(
            body.category_id
          ).trim()
        : null;


    const price =
      Number(
        body.price
      );


    const stock =
      Number(
        body.stock ?? 0
      );


    // =====================================
    // VALIDATION
    // =====================================

    if (
      name.length < 2
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Nama produk minimal 2 karakter."
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
      name.length > 150
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Nama produk terlalu panjang."
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
      !Number.isFinite(price) ||
      price < 0
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Harga produk tidak valid."
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
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Stok produk tidak valid."
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


    // =====================================
    // CATEGORY VALIDATION
    // =====================================

    if (categoryId) {
      const categories =
        await sql`
          SELECT
            id

          FROM
            categories

          WHERE
            id =
              ${categoryId}

            AND
            is_active = TRUE

          LIMIT 1
        `;


      if (
        categories.length === 0
      ) {
        return Response.json(
          {
            ok: false,
            error:
              "Kategori produk tidak valid."
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
    }


    // =====================================
    // UPDATE PRODUCT
    // =====================================

    const products =
      await sql`
        UPDATE
          products

        SET
          category_id =
            ${categoryId},

          name =
            ${name},

          description =
            ${
              description ||
              null
            },

          price =
            ${price},

          stock =
            ${stock},

          unit =
            ${
              unit ||
              null
            },

          updated_at =
            NOW()

        WHERE
          id =
            ${productId}

          AND
          store_id =
            ${store.id}

        RETURNING
          id,
          store_id,
          category_id,
          name,
          slug,
          description,
          price,
          stock,
          unit,
          thumbnail_url,
          is_active,
          is_featured,
          created_at,
          updated_at
      `;


    // =====================================
    // RESPONSE
    // =====================================

    return Response.json(
      {
        ok: true,

        message:
          "Produk berhasil diperbarui.",

        product:
          products[0]
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
      "Products PATCH error:",
      error
    );


    return Response.json(
      {
        ok: false,
        error:
          "Gagal memperbarui produk."
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
    // STORES - CREATE
    // ========================================

    if (
      url.pathname ===
        "/api/stores" &&
      request.method === "POST"
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
          neon(env.DATABASE_URL);


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
              ON u.id = s.user_id

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
              s.expires_at > NOW()

              AND
              u.is_active = TRUE

            LIMIT 1
          `;


        if (
          sessions.length === 0
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
            .replace(/\s+/g, " ");


        if (name.length < 3) {
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


        if (name.length > 100) {
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
          existingStores.length > 0
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
                role = 'seller'
              WHERE
                id =
                  ${currentUser.id}
              RETURNING
                role
            `;

          if (
            updatedUsers.length > 0
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
          error?.code === "23505"
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
    // AUTH REGISTER
    // ========================================

    if (
      url.pathname ===
        "/api/auth/register" &&
      request.method === "POST"
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
          neon(env.DATABASE_URL);


        stage =
          "check_email";


        const existingUser =
          await sql`
            SELECT
              id
            FROM
              users
            WHERE
              email = ${email}
            LIMIT 1
          `;


        if (
          existingUser.length > 0
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
    // AUTH LOGIN
    // ========================================

    if (
      url.pathname ===
        "/api/auth/login" &&
      request.method === "POST"
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
          neon(env.DATABASE_URL);


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
              is_active = TRUE

              AND
              password_hash =
                crypt(
                  ${password},
                  password_hash
                )

            LIMIT 1
          `;


        if (
          users.length === 0
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
              INTERVAL '7 days'
          )
        `;


        await sql`
          UPDATE
            users
          SET
            last_login_at = NOW()
          WHERE
            id = ${user.id}
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
    // AUTH ME
    // ========================================

    if (
      url.pathname ===
        "/api/auth/me" &&
      request.method === "GET"
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
              authenticated: false,
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
          neon(env.DATABASE_URL);


        const sessions =
          await sql`
            SELECT
              s.id AS session_id,

              u.id,
              u.name,
              u.email,
              u.role,
              u.avatar_url

            FROM
              sessions s

            JOIN
              users u
              ON u.id = s.user_id

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
              s.expires_at > NOW()

              AND
              u.is_active = TRUE

            LIMIT 1
          `;


        if (
          sessions.length === 0
        ) {
          return Response.json(
            {
              ok: false,
              authenticated: false,
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
            last_used_at = NOW()
          WHERE
            id =
              ${session.session_id}
        `;


        return Response.json(
          {
            ok: true,
            authenticated: true,

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
            authenticated: false,
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
    // AUTH LOGOUT
    // ========================================

    if (
      url.pathname ===
        "/api/auth/logout" &&
      request.method === "POST"
    ) {
      try {
        const sessionToken =
          getCookie(
            request,
            "__Host-pasar_umkm_session"
          );


        if (sessionToken) {
          const sql =
            neon(env.DATABASE_URL);


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
// PRODUCT IMAGE UPLOAD
// POST /api/uploads/product-image
// ========================================

if (
  url.pathname ===
    "/api/uploads/product-image" &&
  request.method === "POST"
) {
  try {
    const sessionToken =
      getCookie(
        request,
        "__Host-pasar_umkm_session"
      );


    // =====================================
    // AUTH
    // =====================================

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
      neon(env.DATABASE_URL);


    const sessions =
      await sql`
        SELECT
          u.id,
          u.role

        FROM
          sessions s

        JOIN
          users u
          ON u.id = s.user_id

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
          s.expires_at > NOW()

          AND
          u.is_active = TRUE

        LIMIT 1
      `;


    if (
      sessions.length === 0
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
              "no-store"
          }
        }
      );
    }


    const currentUser =
      sessions[0];


    if (
      currentUser.role !== "seller" &&
      currentUser.role !== "admin"
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Hanya seller yang dapat mengunggah foto produk."
        },
        {
          status: 403,
          headers: {
            "Cache-Control":
              "no-store"
          }
        }
      );
    }


    // =====================================
    // STORE
    // =====================================

    const stores =
      await sql`
        SELECT
          id

        FROM
          stores

        WHERE
          owner_id =
            ${currentUser.id}

        LIMIT 1
      `;


    if (
      stores.length === 0
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "UMKM belum ditemukan."
        },
        {
          status: 403,
          headers: {
            "Cache-Control":
              "no-store"
          }
        }
      );
    }


    const store =
      stores[0];


    // =====================================
    // READ IMAGE
    // =====================================

    const formData =
      await request.formData();


    const file =
      formData.get("file");


    if (
      !(file instanceof File)
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Foto produk belum dipilih."
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


    const allowedTypes =
      new Set([
        "image/jpeg",
        "image/png",
        "image/webp"
      ]);


    if (
      !allowedTypes.has(
        file.type
      )
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Format foto harus JPG, PNG, atau WEBP."
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


    const MAX_IMAGE_SIZE =
      5 * 1024 * 1024;


    if (
      file.size >
      MAX_IMAGE_SIZE
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Ukuran foto maksimal 5 MB."
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


    // =====================================
    // CLOUDINARY CONFIG
    // =====================================

    const cloudName =
      env.CLOUDINARY_CLOUD_NAME;

    const apiKey =
      env.CLOUDINARY_API_KEY;

    const apiSecret =
      env.CLOUDINARY_API_SECRET;


    if (
      !cloudName ||
      !apiKey ||
      !apiSecret
    ) {
      console.error(
        "Cloudinary configuration missing"
      );

      return Response.json(
        {
          ok: false,
          error:
            "Penyimpanan foto belum dikonfigurasi."
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


    // =====================================
    // CLOUDINARY UPLOAD
    // =====================================

    const uploadBody =
      new FormData();


    uploadBody.append(
      "file",
      file
    );


    uploadBody.append(
      "public_id",
      `pasar-umkm/products/${store.id}/${crypto.randomUUID()}`
    );


    uploadBody.append(
      "overwrite",
      "false"
    );


    const credentials =
      btoa(
        `${apiKey}:${apiSecret}`
      );


    const cloudinaryResponse =
      await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(
          cloudName
        )}/image/upload`,
        {
          method: "POST",

          headers: {
            Authorization:
              `Basic ${credentials}`
          },

          body:
            uploadBody
        }
      );


    const cloudinaryData =
      await cloudinaryResponse
        .json()
        .catch(() => ({}));


    if (
  !cloudinaryResponse.ok ||
  !cloudinaryData.secure_url
) {
  console.error(
    "Cloudinary upload error:",
    cloudinaryData
  );

  return Response.json(
    {
      ok: false,

      error:
        "Foto gagal diunggah.",

      cloudinary_status:
        cloudinaryResponse.status,

      cloudinary_error:
        cloudinaryData?.error?.message ||
        "Cloudinary tidak memberikan detail error."
    },
    {
      status: 502,
      headers: {
        "Cache-Control":
          "no-store"
      }
    }
  );
}


    // =====================================
    // RESPONSE
    // =====================================

    return Response.json(
      {
        ok: true,

        message:
          "Foto berhasil diunggah.",

        image: {
          url:
            cloudinaryData.secure_url,

          public_id:
            cloudinaryData.public_id,

          width:
            cloudinaryData.width || null,

          height:
            cloudinaryData.height || null,

          format:
            cloudinaryData.format || null,

          bytes:
            cloudinaryData.bytes || null
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
      "Product image upload error:",
      error
    );


    return Response.json(
      {
        ok: false,
        error:
          "Terjadi kesalahan saat mengunggah foto."
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
