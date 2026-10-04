import { neon } from "@neondatabase/serverless";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 80;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 10;

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}

function parseLimit(raw) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return DEFAULT_LIMIT;
  return Math.min(value, MAX_LIMIT);
}

function queryText(url) {
  return String(url.searchParams.get("q") || "").trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);
}

export async function handleGlobalSearchApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/search" || request.method !== "GET") return null;

  const q = queryText(url);
  const limit = parseLimit(url.searchParams.get("limit"));
  if (q.length < MIN_QUERY_LENGTH) {
    return json({ ok: false, error: "Pencarian minimal 2 karakter.", code: "SEARCH_QUERY_TOO_SHORT" }, 400);
  }

  try {
    const sql = neon(env.DATABASE_URL);
    const [products, stores, profiles, categories] = await Promise.all([
      sql`
        SELECT p.id,p.store_id,p.category_id,c.name AS category_name,
          s.name AS store_name,s.logo_url AS store_logo_url,
          s.verification_status AS store_verification_status,
          p.name,p.slug,p.description,p.price,p.stock,p.unit,
          COALESCE(NULLIF(p.thumbnail_url, ''),(
            SELECT pi.image_url FROM product_images pi
            WHERE pi.product_id=p.id
            ORDER BY pi.sort_order ASC,pi.created_at ASC,pi.id ASC LIMIT 1
          )) AS image_url,
          p.is_featured,p.created_at
        FROM products p
        JOIN stores s ON s.id=p.store_id
        LEFT JOIN categories c ON c.id=p.category_id
        WHERE p.is_active=TRUE AND s.is_active=TRUE
          AND (
            POSITION(LOWER(${q}) IN LOWER(COALESCE(p.name,''))) > 0
            OR POSITION(LOWER(${q}) IN LOWER(COALESCE(p.description,''))) > 0
            OR POSITION(LOWER(${q}) IN LOWER(COALESCE(s.name,''))) > 0
            OR POSITION(LOWER(${q}) IN LOWER(COALESCE(c.name,''))) > 0
          )
        ORDER BY
          CASE
            WHEN LOWER(p.name)=LOWER(${q}) THEN 0
            WHEN LOWER(p.name) LIKE LOWER(${q}) || '%' THEN 1
            WHEN LOWER(s.name)=LOWER(${q}) THEN 2
            WHEN LOWER(c.name)=LOWER(${q}) THEN 3
            ELSE 4
          END,
          p.is_featured DESC,p.created_at DESC,p.id DESC
        LIMIT ${limit}
      `,
      sql`
        SELECT s.id,s.category_id,c.name AS category_name,s.name,s.slug,s.description,
          s.logo_url,s.cover_url,s.district,s.city,s.province,s.verification_status,
          s.verified_at,s.created_at,u.id AS owner_user_id,u.name AS owner_name,
          u.avatar_url AS owner_avatar_url,
          COALESCE((SELECT COUNT(*)::int FROM products p WHERE p.store_id=s.id AND p.is_active=TRUE),0)::int AS product_count
        FROM stores s
        JOIN users u ON u.id=s.owner_id AND u.is_active=TRUE
        LEFT JOIN categories c ON c.id=s.category_id
        WHERE s.is_active=TRUE
          AND (
            POSITION(LOWER(${q}) IN LOWER(COALESCE(s.name,''))) > 0
            OR POSITION(LOWER(${q}) IN LOWER(COALESCE(s.description,''))) > 0
            OR POSITION(LOWER(${q}) IN LOWER(COALESCE(s.district,''))) > 0
            OR POSITION(LOWER(${q}) IN LOWER(COALESCE(s.city,''))) > 0
            OR POSITION(LOWER(${q}) IN LOWER(COALESCE(c.name,''))) > 0
            OR POSITION(LOWER(${q}) IN LOWER(COALESCE(u.name,''))) > 0
          )
        ORDER BY
          CASE
            WHEN LOWER(s.name)=LOWER(${q}) THEN 0
            WHEN LOWER(s.name) LIKE LOWER(${q}) || '%' THEN 1
            WHEN LOWER(u.name)=LOWER(${q}) THEN 2
            ELSE 3
          END,
          CASE WHEN s.verification_status='verified' THEN 0 ELSE 1 END,
          s.name ASC,s.id ASC
        LIMIT ${limit}
      `,
      sql`
        SELECT u.id AS user_id,u.name AS user_name,u.avatar_url AS user_avatar_url,
          u.role AS user_role,s.id AS store_id,s.name AS store_name,s.slug AS store_slug,
          s.logo_url AS store_logo_url,s.district,s.city,s.province,s.verification_status
        FROM users u
        JOIN stores s ON s.owner_id=u.id AND s.is_active=TRUE
        WHERE u.is_active=TRUE
          AND (
            POSITION(LOWER(${q}) IN LOWER(COALESCE(u.name,''))) > 0
            OR POSITION(LOWER(${q}) IN LOWER(COALESCE(s.name,''))) > 0
          )
        ORDER BY
          CASE
            WHEN LOWER(u.name)=LOWER(${q}) THEN 0
            WHEN LOWER(u.name) LIKE LOWER(${q}) || '%' THEN 1
            WHEN LOWER(s.name)=LOWER(${q}) THEN 2
            ELSE 3
          END,
          u.name ASC,u.id ASC
        LIMIT ${limit}
      `,
      sql`
        SELECT id,name,slug,icon,sort_order,is_home
        FROM categories
        WHERE is_active=TRUE
          AND POSITION(LOWER(${q}) IN LOWER(COALESCE(name,''))) > 0
        ORDER BY
          CASE
            WHEN LOWER(name)=LOWER(${q}) THEN 0
            WHEN LOWER(name) LIKE LOWER(${q}) || '%' THEN 1
            ELSE 2
          END,
          sort_order ASC,name ASC
        LIMIT ${limit}
      `
    ]);

    return json({
      ok: true,
      query: q,
      counts: { products: products.length, stores: stores.length, profiles: profiles.length, categories: categories.length },
      results: { products, stores, profiles, categories }
    });
  } catch (error) {
    console.error("Global search API error:", error);
    return json({ ok: false, error: "Pencarian belum dapat dimuat.", code: "SEARCH_FAILED" }, 500);
  }
}
