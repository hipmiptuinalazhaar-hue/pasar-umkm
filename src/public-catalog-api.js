import { neon } from "@neondatabase/serverless";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function positiveInt(value, fallback, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function pageInfo(page, limit, total) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    total_pages: totalPages,
    has_next: page < totalPages,
    has_previous: page > 1
  };
}

async function listStores(sql, url) {
  const page = positiveInt(url.searchParams.get("page"), 1, 100000);
  const limit = positiveInt(url.searchParams.get("limit"), 100, 100);
  const offset = (page - 1) * limit;

  const [rows, countRows] = await Promise.all([
    sql`
      SELECT
        s.id,
        s.category_id,
        c.name AS category_name,
        s.name,
        s.slug,
        s.description,
        s.logo_url,
        s.cover_url,
        s.phone,
        s.whatsapp,
        s.address,
        s.district,
        s.city,
        s.province,
        s.verification_status,
        s.verified_at,
        s.created_at,
        COALESCE(pc.product_count, 0)::int AS product_count
      FROM stores s
      LEFT JOIN categories c ON c.id = s.category_id
      LEFT JOIN (
        SELECT store_id, COUNT(*)::int AS product_count
        FROM products
        WHERE is_active = TRUE
        GROUP BY store_id
      ) pc ON pc.store_id = s.id
      WHERE s.is_active = TRUE
      ORDER BY
        CASE WHEN s.verification_status = 'verified' THEN 0 ELSE 1 END,
        s.name ASC,
        s.id ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*)::int AS total
      FROM stores
      WHERE is_active = TRUE
    `
  ]);

  const total = Number(countRows[0]?.total || 0);
  return json({
    ok: true,
    count: rows.length,
    stores: rows,
    pagination: pageInfo(page, limit, total)
  });
}

async function listProducts(sql, url) {
  const page = positiveInt(url.searchParams.get("page"), 1, 100000);
  const limit = positiveInt(url.searchParams.get("limit"), 100, 100);
  const offset = (page - 1) * limit;

  const [rows, countRows] = await Promise.all([
    sql`
      SELECT
        p.id,
        p.store_id,
        p.category_id,
        c.name AS category_name,
        s.name AS store_name,
        p.name,
        p.slug,
        p.description,
        p.price,
        p.stock,
        p.unit,
        COALESCE(NULLIF(p.thumbnail_url, ''), first_image.image_url) AS image_url,
        p.is_featured,
        COALESCE(comment_counts.comments_count, 0)::int AS comments_count,
        p.created_at
      FROM products p
      JOIN stores s ON s.id = p.store_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN (
        SELECT DISTINCT ON (product_id)
          product_id,
          image_url
        FROM product_images
        ORDER BY product_id, sort_order ASC, created_at ASC, id ASC
      ) first_image ON first_image.product_id = p.id
      LEFT JOIN (
        SELECT product_id, COUNT(*)::int AS comments_count
        FROM product_comments
        WHERE is_active = TRUE
        GROUP BY product_id
      ) comment_counts ON comment_counts.product_id = p.id
      WHERE
        p.is_active = TRUE
        AND s.is_active = TRUE
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*)::int AS total
      FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE p.is_active = TRUE AND s.is_active = TRUE
    `
  ]);

  const total = Number(countRows[0]?.total || 0);
  return json({
    ok: true,
    count: rows.length,
    products: rows,
    pagination: pageInfo(page, limit, total)
  });
}

export async function handlePublicCatalogApi(request, env) {
  if (request.method !== "GET") return null;

  const url = new URL(request.url);
  if (url.pathname !== "/api/stores" && url.pathname !== "/api/products") {
    return null;
  }

  try {
    const sql = neon(env.DATABASE_URL);
    return url.pathname === "/api/stores"
      ? await listStores(sql, url)
      : await listProducts(sql, url);
  } catch (error) {
    console.error("Public catalog API error:", error);
    return json(
      {
        ok: false,
        error: url.pathname === "/api/stores"
          ? "Gagal memuat data UMKM."
          : "Gagal memuat produk."
      },
      500
    );
  }
}
