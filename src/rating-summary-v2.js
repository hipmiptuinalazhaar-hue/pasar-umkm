import { neon } from "@neondatabase/serverless";
import { ensureRatingInfrastructure } from "./rating-store.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIN_COMPLETION_SAMPLE = 5;
const MAX_RECOMMENDATION_CANDIDATES = 12;

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

async function productEvidence(sql, productIds) {
  if (!productIds.length) return [];

  return sql`
    WITH target_products AS (
      SELECT id, store_id
      FROM products
      WHERE id = ANY(${productIds}::uuid[])
    ),
    verified_ratings AS (
      SELECT
        pr.product_id,
        ROUND(AVG(pr.rating)::numeric, 1) AS average_rating,
        COUNT(*)::int AS rating_count,
        COUNT(*) FILTER (
          WHERE NULLIF(BTRIM(COALESCE(pr.review, '')), '') IS NOT NULL
        )::int AS review_count
      FROM product_ratings pr
      JOIN orders ro
        ON ro.id = pr.order_id
       AND ro.buyer_id = pr.user_id
       AND ro.store_id = pr.store_id
       AND ro.status = 'completed'
      WHERE
        pr.product_id = ANY(${productIds}::uuid[])
        AND EXISTS (
          SELECT 1
          FROM order_items roi
          WHERE roi.order_id = ro.id AND roi.product_id = pr.product_id
        )
      GROUP BY pr.product_id
    ),
    completed_sales AS (
      SELECT
        oi.product_id,
        COALESCE(SUM(oi.quantity), 0)::int AS sold_count
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE
        oi.product_id = ANY(${productIds}::uuid[])
        AND o.status = 'completed'
      GROUP BY oi.product_id
    )
    SELECT
      tp.id AS product_id,
      tp.store_id,
      COALESCE(vr.average_rating, 0)::numeric AS average_rating,
      COALESCE(vr.rating_count, 0)::int AS rating_count,
      COALESCE(vr.rating_count, 0)::int AS verified_rating_count,
      COALESCE(vr.review_count, 0)::int AS verified_review_count,
      COALESCE(cs.sold_count, 0)::int AS sold_count
    FROM target_products tp
    LEFT JOIN verified_ratings vr ON vr.product_id = tp.id
    LEFT JOIN completed_sales cs ON cs.product_id = tp.id
  `;
}

async function storeEvidence(sql, storeIds) {
  if (!storeIds.length) return [];

  return sql`
    WITH target_stores AS (
      SELECT id, verification_status, verified_at
      FROM stores
      WHERE id = ANY(${storeIds}::uuid[])
    ),
    verified_ratings AS (
      SELECT
        sr.store_id,
        ROUND(AVG(sr.rating)::numeric, 1) AS average_rating,
        COUNT(*)::int AS rating_count,
        COUNT(*) FILTER (
          WHERE NULLIF(BTRIM(COALESCE(sr.review, '')), '') IS NOT NULL
        )::int AS review_count
      FROM store_ratings sr
      JOIN orders ro
        ON ro.id = sr.order_id
       AND ro.buyer_id = sr.user_id
       AND ro.store_id = sr.store_id
       AND ro.status = 'completed'
      WHERE sr.store_id = ANY(${storeIds}::uuid[])
      GROUP BY sr.store_id
    ),
    order_evidence AS (
      SELECT
        o.store_id,
        COUNT(*) FILTER (WHERE o.status = 'completed')::int AS completed_orders,
        COUNT(*) FILTER (WHERE o.status = 'cancelled')::int AS cancelled_orders,
        COUNT(*) FILTER (WHERE o.status IN ('completed', 'cancelled'))::int AS terminal_orders
      FROM orders o
      WHERE o.store_id = ANY(${storeIds}::uuid[])
      GROUP BY o.store_id
    ),
    completed_sales AS (
      SELECT
        o.store_id,
        COALESCE(SUM(oi.quantity), 0)::int AS sold_count
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE
        o.store_id = ANY(${storeIds}::uuid[])
        AND o.status = 'completed'
      GROUP BY o.store_id
    )
    SELECT
      ts.id AS store_id,
      ts.verification_status,
      ts.verified_at,
      (ts.verification_status = 'verified') AS is_verified,
      COALESCE(vr.average_rating, 0)::numeric AS average_rating,
      COALESCE(vr.rating_count, 0)::int AS rating_count,
      COALESCE(vr.rating_count, 0)::int AS verified_rating_count,
      COALESCE(vr.review_count, 0)::int AS verified_review_count,
      COALESCE(oe.completed_orders, 0)::int AS completed_orders,
      COALESCE(oe.cancelled_orders, 0)::int AS cancelled_orders,
      COALESCE(oe.terminal_orders, 0)::int AS terminal_orders,
      COALESCE(cs.sold_count, 0)::int AS sold_count,
      CASE
        WHEN COALESCE(oe.terminal_orders, 0) >= ${MIN_COMPLETION_SAMPLE}
        THEN ROUND(
          COALESCE(oe.completed_orders, 0)::numeric * 100 /
          NULLIF(oe.terminal_orders, 0),
          0
        )::int
        ELSE NULL
      END AS completion_rate,
      (COALESCE(oe.terminal_orders, 0) >= ${MIN_COMPLETION_SAMPLE}) AS completion_rate_eligible
    FROM target_stores ts
    LEFT JOIN verified_ratings vr ON vr.store_id = ts.id
    LEFT JOIN order_evidence oe ON oe.store_id = ts.id
    LEFT JOIN completed_sales cs ON cs.store_id = ts.id
  `;
}

async function recommendationCandidates(sql, limit) {
  return sql`
    SELECT
      p.id, p.store_id, p.category_id, p.name, p.slug, p.description, p.price, p.stock, p.unit,
      COALESCE(NULLIF(p.thumbnail_url, ''), first_image.image_url) AS image_url,
      p.is_featured, p.created_at,
      s.name AS store_name, s.logo_url AS store_logo_url, s.district AS store_district,
      s.city AS store_city, s.verification_status::text AS store_verification_status,
      c.name AS category_name,
      CASE WHEN EXISTS (
        SELECT 1 FROM marketplace_promotions mp
        WHERE mp.subject_type='product' AND mp.subject_id=p.id AND mp.status='active'
          AND (mp.starts_at IS NULL OR mp.starts_at <= NOW())
          AND (mp.ends_at IS NULL OR mp.ends_at > NOW())
          AND mp.placement IN ('home_featured','search_boost')
      ) THEN 0 ELSE 1 END AS promotion_rank
    FROM products p
    JOIN stores s ON s.id=p.store_id AND s.is_active=TRUE
    LEFT JOIN categories c ON c.id=p.category_id
    LEFT JOIN LATERAL (
      SELECT pi.image_url FROM product_images pi
      WHERE pi.product_id=p.id
      ORDER BY pi.sort_order ASC, pi.created_at ASC, pi.id ASC
      LIMIT 1
    ) first_image ON TRUE
    WHERE p.is_active=TRUE AND p.stock > 0
    ORDER BY promotion_rank ASC, p.is_featured DESC, p.created_at DESC, p.id DESC
    LIMIT ${limit}
  `;
}

async function recommendationBundle(sql, url) {
  const requested = Number.parseInt(url.searchParams.get("limit") || "8", 10) || 8;
  const limit = Math.min(MAX_RECOMMENDATION_CANDIDATES, Math.max(1, requested));
  const products = await recommendationCandidates(sql, limit);
  const productIds = products.map(item => String(item.id)).filter(Boolean);
  const storeIds = [...new Set(products.map(item => String(item.store_id)).filter(Boolean))];
  const [productSummaries, storeSummaries] = await Promise.all([
    productEvidence(sql, productIds),
    storeEvidence(sql, storeIds)
  ]);
  return {
    ok: true,
    evidence_version: "p5-v1",
    recommendation_version: "v10-b-1",
    products,
    evidence: {
      products: productSummaries,
      stores: storeSummaries
    }
  };
}

export async function handleRatingSummaryV2(request, env) {
  const url = new URL(request.url);
  const isSummaries = url.pathname === "/api/ratings/summaries";
  const isRecommendations = url.pathname === "/api/recommendations";

  if ((!isSummaries && !isRecommendations) || request.method !== "GET") {
    return null;
  }

  try {
    const sql = neon(env.DATABASE_URL);
    await ensureRatingInfrastructure(sql);

    if (isRecommendations) {
      return json(await recommendationBundle(sql, url));
    }

    const productIds = parseUuidList(url.searchParams.get("product_ids"));
    const storeIds = parseUuidList(url.searchParams.get("store_ids"));

    const [products, stores] = await Promise.all([
      productEvidence(sql, productIds),
      storeEvidence(sql, storeIds)
    ]);

    return json({
      ok: true,
      evidence_version: "p5-v1",
      methodology: {
        ratings: "completed_order_only",
        completion_rate: "completed_over_completed_plus_cancelled",
        completion_rate_min_sample: MIN_COMPLETION_SAMPLE
      },
      products,
      stores
    });
  } catch (error) {
    console.error("Rating summary v2 error:", error);
    return json({ ok: false, error: "Ringkasan rating belum dapat dimuat." }, 500);
  }
}
