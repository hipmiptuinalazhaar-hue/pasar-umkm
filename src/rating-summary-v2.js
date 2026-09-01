import { neon } from "@neondatabase/serverless";
import { ensureRatingInfrastructure } from "./rating-store.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function parseUuidList(value) {
  const result = [];
  const seen = new Set();

  for (const raw of String(value || "").split(",")) {
    const id = String(raw || "").trim().toLowerCase();
    if (!UUID_PATTERN.test(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= 100) break;
  }

  return result;
}

export async function handleRatingSummaryV2(request, env) {
  const url = new URL(request.url);

  if (
    url.pathname !== "/api/ratings/summaries" ||
    request.method !== "GET"
  ) {
    return null;
  }

  try {
    const sql = neon(env.DATABASE_URL);
    await ensureRatingInfrastructure(sql);

    const productIds = parseUuidList(url.searchParams.get("product_ids"));
    const storeIds = parseUuidList(url.searchParams.get("store_ids"));

    let products = [];
    let stores = [];

    if (productIds.length) {
      products = await sql`
        SELECT
          p.id AS product_id,
          COALESCE(r.average_rating, 0)::numeric AS average_rating,
          COALESCE(r.rating_count, 0)::int AS rating_count,
          COALESCE(s.sold_count, 0)::int AS sold_count
        FROM products p
        LEFT JOIN LATERAL (
          SELECT
            ROUND(AVG(pr.rating)::numeric, 1) AS average_rating,
            COUNT(*)::int AS rating_count
          FROM product_ratings pr
          WHERE pr.product_id = p.id
        ) r ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(SUM(oi.quantity), 0)::int AS sold_count
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE
            oi.product_id = p.id
            AND o.status = 'completed'
        ) s ON TRUE
        WHERE p.id = ANY(${productIds}::uuid[])
      `;
    }

    if (storeIds.length) {
      stores = await sql`
        SELECT
          s.id AS store_id,
          COALESCE(r.average_rating, 0)::numeric AS average_rating,
          COALESCE(r.rating_count, 0)::int AS rating_count
        FROM stores s
        LEFT JOIN LATERAL (
          SELECT
            ROUND(AVG(sr.rating)::numeric, 1) AS average_rating,
            COUNT(*)::int AS rating_count
          FROM store_ratings sr
          WHERE sr.store_id = s.id
        ) r ON TRUE
        WHERE s.id = ANY(${storeIds}::uuid[])
      `;
    }

    return json({ ok: true, products, stores });
  } catch (error) {
    console.error("Rating summary v2 error:", error);
    return json({ ok: false, error: "Ringkasan rating belum dapat dimuat." }, 500);
  }
}
