import { neon } from "@neondatabase/serverless";
import {
  normalizeProductTags,
  productTagInsertQueries,
  publicProductTag,
  validateOwnedProducts
} from "./post-product-tags.js";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const piece of header.split(";")) {
    const [key, ...parts] = piece.trim().split("=");
    if (key === name) return parts.join("=") || null;
  }
  return null;
}

async function authenticatedUser(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const rows = await sql`
    SELECT u.id, u.name, u.avatar_url, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE
      s.token_hash = encode(digest(${token}, 'sha256'), 'hex')
      AND s.expires_at > NOW()
      AND u.is_active = TRUE
    LIMIT 1
  `;
  return rows[0] || null;
}

async function listPosts(sql) {
  const posts = await sql`
    SELECT
      p.id,
      p.store_id,
      p.caption,
      p.image_url,
      p.created_at,
      p.updated_at,
      s.name AS store_name,
      s.logo_url AS store_logo_url,
      s.district AS store_district,
      s.city AS store_city,
      s.province AS store_province,
      s.verification_status AS store_verification_status,
      (
        SELECT COUNT(*)::int
        FROM post_comments pc
        WHERE pc.post_id = p.id AND pc.is_active = TRUE
      ) AS comments_count,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'product_id', pr.id,
              'name', pr.name,
              'price', pr.price,
              'stock', pr.stock,
              'unit', pr.unit,
              'image_url', COALESCE(
                pr.thumbnail_url,
                (
                  SELECT pi.image_url
                  FROM product_images pi
                  WHERE pi.product_id = pr.id
                  ORDER BY pi.sort_order ASC, pi.created_at ASC
                  LIMIT 1
                )
              ),
              'tag_order', pp.tag_order,
              'anchor_x', pp.anchor_x,
              'anchor_y', pp.anchor_y
            )
            ORDER BY pp.tag_order ASC, pp.created_at ASC
          )
          FROM post_products pp
          JOIN products pr ON pr.id = pp.product_id
          WHERE
            pp.post_id = p.id
            AND pr.store_id = p.store_id
            AND pr.is_active = TRUE
        ),
        '[]'::jsonb
      ) AS product_tags
    FROM posts p
    JOIN stores s ON s.id = p.store_id
    WHERE p.is_active = TRUE AND s.is_active = TRUE
    ORDER BY p.created_at DESC
    LIMIT 100
  `;

  return json({ ok: true, count: posts.length, posts });
}

async function sellerContext(sql, request) {
  const user = await authenticatedUser(sql, request);
  if (!user) {
    return {
      response: json({ ok: false, error: "Silakan masuk terlebih dahulu." }, 401)
    };
  }

  if (user.role !== "seller" && user.role !== "admin") {
    return {
      response: json({ ok: false, error: "Hanya UMKM yang dapat membuat postingan." }, 403)
    };
  }

  const stores = await sql`
    SELECT id, name, slug, is_active
    FROM stores
    WHERE owner_id = ${user.id}
    LIMIT 1
  `;
  const store = stores[0];

  if (!store) {
    return { response: json({ ok: false, error: "UMKM belum ditemukan." }, 403) };
  }
  if (store.is_active !== true) {
    return { response: json({ ok: false, error: "UMKM sedang tidak aktif." }, 403) };
  }

  return { user, store, response: null };
}

async function createPost(sql, request) {
  const context = await sellerContext(sql, request);
  if (context.response) return context.response;

  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Data postingan tidak valid." }, 400);

  const caption = String(body.caption || "").trim();
  const imageUrl = String(body.image_url || "").trim();
  const normalized = normalizeProductTags(body);

  if (normalized.error) return json({ ok: false, error: normalized.error }, 400);
  if (!caption) return json({ ok: false, error: "Caption postingan wajib diisi." }, 400);
  if (caption.length > 1000) {
    return json({ ok: false, error: "Caption maksimal 1000 karakter." }, 400);
  }
  if (!imageUrl) return json({ ok: false, error: "Foto postingan wajib tersedia." }, 400);
  if (!imageUrl.startsWith("https://res.cloudinary.com/")) {
    return json({ ok: false, error: "URL foto postingan tidak valid." }, 400);
  }

  const owned = await validateOwnedProducts(sql, context.store.id, normalized.tags);
  if (owned.error) return json({ ok: false, error: owned.error }, 400);

  const postId = crypto.randomUUID();
  const insertPost = sql`
    INSERT INTO posts (id, store_id, caption, image_url, is_active)
    VALUES (${postId}::uuid, ${context.store.id}, ${caption}, ${imageUrl}, TRUE)
    RETURNING
      id,
      store_id,
      caption,
      image_url,
      is_active,
      created_at,
      updated_at
  `;

  const tagQueries = productTagInsertQueries(sql, postId, owned.products);
  const results = await sql.transaction([insertPost, ...tagQueries]);
  const post = results[0]?.[0];

  return json(
    {
      ok: true,
      message: owned.products.length
        ? "Postingan dan produk tertaut berhasil dipublikasikan."
        : "Postingan berhasil dipublikasikan.",
      post: {
        ...post,
        product_tags: owned.products.map(publicProductTag)
      }
    },
    201
  );
}

async function replacePostProducts(sql, request, postId) {
  const context = await sellerContext(sql, request);
  if (context.response) return context.response;

  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Data produk tertaut tidak valid." }, 400);

  const normalized = normalizeProductTags(body);
  if (normalized.error) return json({ ok: false, error: normalized.error }, 400);

  const posts = await sql`
    SELECT id
    FROM posts
    WHERE
      id = ${postId}::uuid
      AND store_id = ${context.store.id}
      AND is_active = TRUE
    LIMIT 1
  `;
  if (!posts[0]) return json({ ok: false, error: "Postingan tidak ditemukan." }, 404);

  const owned = await validateOwnedProducts(sql, context.store.id, normalized.tags);
  if (owned.error) return json({ ok: false, error: owned.error }, 400);

  const inserts = productTagInsertQueries(sql, postId, owned.products);
  const results = await sql.transaction([
    sql`DELETE FROM post_products WHERE post_id = ${postId}::uuid`,
    ...inserts,
    sql`
      UPDATE posts
      SET updated_at = NOW()
      WHERE id = ${postId}::uuid
      RETURNING id, updated_at
    `
  ]);
  const updated = results[results.length - 1]?.[0];

  return json({
    ok: true,
    message: "Produk tertaut berhasil diperbarui.",
    post: {
      ...updated,
      product_tags: owned.products.map(publicProductTag)
    }
  });
}

async function deletePost(sql, request, postId) {
  const user = await authenticatedUser(sql, request);
  if (!user) return json({ ok: false, error: "Silakan masuk terlebih dahulu." }, 401);

  if (user.role !== "seller" && user.role !== "admin") {
    return json({ ok: false, error: "Akun tidak memiliki izin menghapus postingan." }, 403);
  }

  const stores = await sql`
    SELECT id
    FROM stores
    WHERE owner_id = ${user.id}
    LIMIT 1
  `;
  if (!stores[0]) return json({ ok: false, error: "UMKM belum ditemukan." }, 403);

  const posts = await sql`
    UPDATE posts
    SET is_active = FALSE, updated_at = NOW()
    WHERE
      id = ${postId}::uuid
      AND store_id = ${stores[0].id}
      AND is_active = TRUE
    RETURNING id, caption, is_active, updated_at
  `;

  if (!posts[0]) {
    return json({ ok: false, error: "Postingan tidak ditemukan atau sudah dihapus." }, 404);
  }

  return json({
    ok: true,
    message: "Postingan berhasil dihapus.",
    post: posts[0]
  });
}

function resolveRoute(request) {
  const url = new URL(request.url);
  if (url.pathname === "/api/posts" && request.method === "GET") return { action: "list" };
  if (url.pathname === "/api/posts" && request.method === "POST") return { action: "create" };

  const productMatch = url.pathname.match(/^\/api\/posts\/([^/]+)\/products$/);
  if (productMatch && request.method === "PUT") {
    return {
      action: "replace-products",
      id: String(productMatch[1] || "").trim().toLowerCase()
    };
  }

  const match = url.pathname.match(/^\/api\/posts\/([^/]+)$/);
  if (match && request.method === "DELETE") {
    return { action: "delete", id: String(match[1] || "").trim().toLowerCase() };
  }
  return null;
}

export async function handlePostCoreApi(request, env) {
  const route = resolveRoute(request);
  if (!route) return null;

  if (route.id && !UUID_PATTERN.test(route.id)) {
    return json({ ok: false, error: "ID postingan tidak valid." }, 400);
  }

  try {
    const sql = neon(env.DATABASE_URL);
    if (route.action === "list") return await listPosts(sql);
    if (route.action === "create") return await createPost(sql, request);
    if (route.action === "replace-products") {
      return await replacePostProducts(sql, request, route.id);
    }
    return await deletePost(sql, request, route.id);
  } catch (error) {
    console.error(`Post core ${route.action} error:`, error);
    return json(
      {
        ok: false,
        error: route.action === "list"
          ? "Gagal memuat postingan."
          : route.action === "create"
            ? "Gagal membuat postingan."
            : route.action === "replace-products"
              ? "Gagal memperbarui produk tertaut."
              : "Gagal menghapus postingan."
      },
      500
    );
  }
}
