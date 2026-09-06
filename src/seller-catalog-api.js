import { neon } from "@neondatabase/serverless";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
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

function createUniqueSlug(name, fallback) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${base || fallback}-${suffix}`;
}

async function authenticatedUser(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) {
    return {
      user: null,
      response: json({ ok: false, error: "Silakan masuk terlebih dahulu." }, 401)
    };
  }

  const sessions = await sql`
    SELECT u.id, u.name, u.email, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE
      s.token_hash = encode(digest(${token}, 'sha256'), 'hex')
      AND s.expires_at > NOW()
      AND u.is_active = TRUE
    LIMIT 1
  `;

  if (!sessions[0]) {
    return {
      user: null,
      response: json(
        { ok: false, error: "Session tidak valid atau sudah berakhir." },
        401,
        { "Set-Cookie": clearSessionCookie() }
      )
    };
  }

  return { user: sessions[0], response: null };
}

async function currentStore(sql, userId, fields = "summary") {
  if (fields === "full") {
    const rows = await sql`
      SELECT
        s.id,
        s.owner_id,
        s.category_id,
        c.name AS category_name,
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
      FROM stores s
      LEFT JOIN categories c ON c.id = s.category_id
      WHERE s.owner_id = ${userId}
      LIMIT 1
    `;
    return rows[0] || null;
  }

  const rows = await sql`
    SELECT id, name, slug, verification_status, is_active
    FROM stores
    WHERE owner_id = ${userId}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function getStoreMe(sql, request) {
  const auth = await authenticatedUser(sql, request);
  if (auth.response) return auth.response;

  const store = await currentStore(sql, auth.user.id, "full");
  if (!store) {
    return json({ ok: true, has_store: false, store: null });
  }

  return json({ ok: true, has_store: true, store });
}

async function createStore(sql, request) {
  const auth = await authenticatedUser(sql, request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Data UMKM tidak valid." }, 400);

  const name = String(body.name || "").trim().replace(/\s+/g, " ");
  if (name.length < 3) {
    return json({ ok: false, error: "Nama UMKM minimal 3 karakter." }, 400);
  }
  if (name.length > 100) {
    return json({ ok: false, error: "Nama UMKM maksimal 100 karakter." }, 400);
  }

  const existing = await sql`
    SELECT id, name
    FROM stores
    WHERE owner_id = ${auth.user.id}
    LIMIT 1
  `;
  if (existing[0]) {
    return json(
      { ok: false, error: "Akun ini sudah memiliki UMKM.", store: existing[0] },
      409
    );
  }

  try {
    const stores = await sql`
      INSERT INTO stores (owner_id, name, slug)
      VALUES (${auth.user.id}, ${name}, ${createUniqueSlug(name, "umkm")})
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

    let role = auth.user.role;
    if (role === "buyer") {
      const updated = await sql`
        UPDATE users
        SET role = 'seller'
        WHERE id = ${auth.user.id}
        RETURNING role
      `;
      role = updated[0]?.role || role;
    }

    return json(
      {
        ok: true,
        message: "UMKM berhasil didaftarkan.",
        store: stores[0],
        user: {
          id: auth.user.id,
          name: auth.user.name,
          email: auth.user.email,
          role
        }
      },
      201
    );
  } catch (error) {
    if (error?.code === "23505") {
      return json({ ok: false, error: "UMKM tersebut sudah terdaftar." }, 409);
    }
    throw error;
  }
}

async function getProductsMe(sql, request) {
  const auth = await authenticatedUser(sql, request);
  if (auth.response) return auth.response;

  const store = await currentStore(sql, auth.user.id);
  if (!store) {
    return json({
      ok: true,
      has_store: false,
      store: null,
      count: 0,
      products: []
    });
  }

  const products = await sql`
    SELECT
      p.id,
      p.store_id,
      p.category_id,
      c.name AS category_name,
      p.name,
      p.slug,
      p.description,
      p.price,
      p.stock,
      p.unit,
      p.thumbnail_url,
      COALESCE(
        NULLIF(p.thumbnail_url, ''),
        (
          SELECT pi.image_url
          FROM product_images pi
          WHERE pi.product_id = p.id
          ORDER BY pi.sort_order ASC, pi.created_at ASC, pi.id ASC
          LIMIT 1
        )
      ) AS image_url,
      p.is_active,
      p.is_featured,
      p.created_at,
      p.updated_at
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.store_id = ${store.id} AND p.is_active = TRUE
    ORDER BY p.created_at DESC
  `;

  return json({
    ok: true,
    has_store: true,
    store: {
      id: store.id,
      name: store.name,
      slug: store.slug,
      verification_status: store.verification_status,
      is_active: store.is_active
    },
    count: products.length,
    products
  });
}

function parseProductBody(body) {
  const name = String(body?.name || "").trim().replace(/\s+/g, " ");
  const description = String(body?.description || "").trim();
  const unit = String(body?.unit || "").trim().slice(0, 50);
  const thumbnailUrl = String(body?.thumbnail_url || "").trim();
  const categoryId = body?.category_id ? String(body.category_id).trim() : null;
  const price = Number(body?.price);
  const stock = Number(body?.stock ?? 0);

  if (name.length < 2) return { error: "Nama produk minimal 2 karakter." };
  if (name.length > 150) return { error: "Nama produk terlalu panjang." };
  if (!Number.isFinite(price) || price < 0) return { error: "Harga produk tidak valid." };
  if (!Number.isInteger(stock) || stock < 0) return { error: "Stok produk tidak valid." };

  return {
    value: {
      name,
      description,
      unit,
      thumbnailUrl,
      categoryId,
      price,
      stock
    }
  };
}

async function validateCategory(sql, categoryId) {
  if (!categoryId) return true;
  if (!UUID_PATTERN.test(categoryId)) return false;

  const rows = await sql`
    SELECT id
    FROM categories
    WHERE id = ${categoryId}::uuid AND is_active = TRUE
    LIMIT 1
  `;
  return Boolean(rows[0]);
}

async function requireSellerStore(sql, request, permissionMessage = null) {
  const auth = await authenticatedUser(sql, request);
  if (auth.response) return auth;

  if (
    permissionMessage &&
    auth.user.role !== "seller" &&
    auth.user.role !== "admin"
  ) {
    return {
      user: auth.user,
      store: null,
      response: json({ ok: false, error: permissionMessage }, 403)
    };
  }

  const store = await currentStore(sql, auth.user.id);
  if (!store) {
    return {
      user: auth.user,
      store: null,
      response: json(
        {
          ok: false,
          error: permissionMessage ? "UMKM belum ditemukan." : "Akun ini belum memiliki UMKM."
        },
        403
      )
    };
  }

  return { user: auth.user, store, response: null };
}

async function createProduct(sql, request) {
  const owner = await requireSellerStore(sql, request);
  if (owner.response) return owner.response;

  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Data produk tidak valid." }, 400);

  const parsed = parseProductBody(body);
  if (parsed.error) return json({ ok: false, error: parsed.error }, 400);
  const value = parsed.value;

  if (!(await validateCategory(sql, value.categoryId))) {
    return json({ ok: false, error: "Kategori produk tidak valid." }, 400);
  }

  const products = await sql`
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
      ${owner.store.id},
      ${value.categoryId},
      ${value.name},
      ${createUniqueSlug(value.name, "produk")},
      ${value.description || null},
      ${value.price},
      ${value.stock},
      ${value.unit || null},
      ${value.thumbnailUrl || null},
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

  return json(
    { ok: true, message: "Produk berhasil ditambahkan.", product: products[0] },
    201
  );
}

async function updateProduct(sql, request, productId) {
  const owner = await requireSellerStore(
    sql,
    request,
    "Akun tidak memiliki izin mengubah produk."
  );
  if (owner.response) return owner.response;

  const existing = await sql`
    SELECT id
    FROM products
    WHERE id = ${productId}::uuid AND store_id = ${owner.store.id}
    LIMIT 1
  `;
  if (!existing[0]) return json({ ok: false, error: "Produk tidak ditemukan." }, 404);

  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Data produk tidak valid." }, 400);

  const parsed = parseProductBody(body);
  if (parsed.error) return json({ ok: false, error: parsed.error }, 400);
  const value = parsed.value;

  if (!(await validateCategory(sql, value.categoryId))) {
    return json({ ok: false, error: "Kategori produk tidak valid." }, 400);
  }

  const products = await sql`
    UPDATE products
    SET
      category_id = ${value.categoryId},
      name = ${value.name},
      description = ${value.description || null},
      price = ${value.price},
      stock = ${value.stock},
      unit = ${value.unit || null},
      updated_at = NOW()
    WHERE id = ${productId}::uuid AND store_id = ${owner.store.id}
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

  return json({
    ok: true,
    message: "Produk berhasil diperbarui.",
    product: products[0]
  });
}

async function deleteProduct(sql, request, productId) {
  const owner = await requireSellerStore(
    sql,
    request,
    "Akun tidak memiliki izin menghapus produk."
  );
  if (owner.response) return owner.response;

  const products = await sql`
    UPDATE products
    SET is_active = FALSE, updated_at = NOW()
    WHERE
      id = ${productId}::uuid
      AND store_id = ${owner.store.id}
      AND is_active = TRUE
    RETURNING id, name, is_active, updated_at
  `;

  if (!products[0]) {
    return json({ ok: false, error: "Produk tidak ditemukan atau sudah dinonaktifkan." }, 404);
  }

  return json({
    ok: true,
    message: "Produk berhasil dihapus.",
    product: products[0]
  });
}

function resolveRoute(request) {
  const url = new URL(request.url);
  const method = request.method;

  if (url.pathname === "/api/stores/me" && method === "GET") return { action: "store-me" };
  if (url.pathname === "/api/stores" && method === "POST") return { action: "store-create" };
  if (url.pathname === "/api/products/me" && method === "GET") return { action: "products-me" };
  if (url.pathname === "/api/products" && method === "POST") return { action: "product-create" };

  const productMatch = url.pathname.match(/^\/api\/products\/([^/]+)$/);
  if (productMatch && (method === "PATCH" || method === "DELETE")) {
    const id = String(productMatch[1] || "").trim().toLowerCase();
    return {
      action: method === "PATCH" ? "product-update" : "product-delete",
      id
    };
  }

  return null;
}

export async function handleSellerCatalogApi(request, env) {
  const route = resolveRoute(request);
  if (!route) return null;

  if (route.id && !UUID_PATTERN.test(route.id)) {
    return json({ ok: false, error: "ID produk tidak valid." }, 400);
  }

  try {
    const sql = neon(env.DATABASE_URL);
    if (route.action === "store-me") return await getStoreMe(sql, request);
    if (route.action === "store-create") return await createStore(sql, request);
    if (route.action === "products-me") return await getProductsMe(sql, request);
    if (route.action === "product-create") return await createProduct(sql, request);
    if (route.action === "product-update") return await updateProduct(sql, request, route.id);
    return await deleteProduct(sql, request, route.id);
  } catch (error) {
    console.error(`Seller catalog ${route.action} error:`, error);
    const errorMessage = route.action === "store-me"
      ? "Gagal memuat profil UMKM."
      : route.action === "store-create"
        ? "Gagal mendaftarkan UMKM."
        : route.action === "products-me"
          ? "Gagal memuat produk toko."
          : route.action === "product-create"
            ? "Gagal menambahkan produk."
            : route.action === "product-update"
              ? "Gagal memperbarui produk."
              : "Gagal menghapus produk.";
    return json({ ok: false, error: errorMessage }, 500);
  }
}
