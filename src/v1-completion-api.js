import { neon } from "@neondatabase/serverless";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const V1_RELEASE = "2026-09-08-v1-completion";
const REQUIRED_MIGRATIONS = Object.freeze([
  "2026-09-07-p6-operational-marketplace",
  "2026-09-07-p7-launch-growth",
  "2026-09-07-p8-real-commerce-fulfillment",
  "2026-09-07-p8-1-structured-payment-profile"
]);

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}

async function authenticatedUser(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const rows = await sql`
    SELECT u.id, u.name, u.role
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

function boundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function cleanQuery(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 120);
}

function uuid(value) {
  const id = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}

async function sellerOperations(sql, request) {
  const user = await authenticatedUser(sql, request);
  if (!user) return json({ ok: false, error: "Silakan masuk terlebih dahulu." }, 401);

  const stores = await sql`
    SELECT
      s.id, s.name, s.verification_status, s.verified_at, s.is_active,
      COALESCE(c.response_sla_minutes, 240)::int AS response_sla_minutes
    FROM stores s
    LEFT JOIN store_commerce_settings c ON c.store_id = s.id
    WHERE s.owner_id = ${user.id}
    ORDER BY s.created_at ASC
    LIMIT 1
  `;
  const store = stores[0];
  if (!store) return json({ ok: false, error: "UMKM belum ditemukan." }, 404);

  const [orderRows, productRows, actionRows, topRows] = await Promise.all([
    sql`
      SELECT
        COUNT(*)::int AS order_count,
        COUNT(*) FILTER (WHERE status='pending')::int AS pending_count,
        COUNT(*) FILTER (WHERE status='confirmed')::int AS confirmed_count,
        COUNT(*) FILTER (WHERE status='processing')::int AS processing_count,
        COUNT(*) FILTER (WHERE status='ready')::int AS ready_count,
        COUNT(*) FILTER (WHERE status='completed')::int AS completed_count,
        COUNT(*) FILTER (WHERE status='cancelled')::int AS cancelled_count,
        COUNT(*) FILTER (
          WHERE status='pending'
            AND created_at < NOW() - (${Number(store.response_sla_minutes)} * INTERVAL '1 minute')
        )::int AS response_sla_breaches,
        COALESCE(SUM(total) FILTER (WHERE status='completed'),0)::numeric AS completed_revenue,
        COALESCE(AVG(total) FILTER (WHERE status='completed'),0)::numeric AS average_completed_order_value,
        MAX(created_at) AS latest_order_at
      FROM orders
      WHERE store_id=${store.id}
    `,
    sql`
      SELECT
        COUNT(*) FILTER (WHERE is_active=TRUE)::int AS active_product_count,
        COUNT(*) FILTER (WHERE is_active=TRUE AND stock=0)::int AS out_of_stock_count,
        COUNT(*) FILTER (WHERE is_active=TRUE AND stock BETWEEN 1 AND 5)::int AS low_stock_count,
        COALESCE(SUM(stock) FILTER (WHERE is_active=TRUE),0)::int AS total_units_in_stock,
        COALESCE(SUM(price*stock) FILTER (WHERE is_active=TRUE),0)::numeric AS inventory_retail_value
      FROM products
      WHERE store_id=${store.id}
    `,
    sql`
      SELECT id, order_number, status, total, buyer_id, created_at,
        CASE
          WHEN status='pending' THEN 'confirm_order'
          WHEN status='confirmed' THEN 'start_processing'
          WHEN status='processing' THEN 'mark_ready'
          WHEN status='ready' THEN 'complete_order'
          ELSE 'review'
        END AS next_action,
        CASE
          WHEN status='pending' AND created_at < NOW() - (${Number(store.response_sla_minutes)} * INTERVAL '1 minute') THEN 'urgent'
          WHEN status IN ('pending','confirmed','processing','ready') THEN 'action'
          ELSE 'normal'
        END AS priority
      FROM orders
      WHERE store_id=${store.id} AND status IN ('pending','confirmed','processing','ready')
      ORDER BY
        CASE WHEN status='pending' THEN 0 WHEN status='confirmed' THEN 1 WHEN status='processing' THEN 2 ELSE 3 END,
        created_at ASC
      LIMIT 8
    `,
    sql`
      SELECT
        oi.product_id,
        MAX(oi.product_name) AS product_name,
        COALESCE(SUM(oi.quantity),0)::int AS units_sold,
        COALESCE(SUM(oi.subtotal),0)::numeric AS completed_revenue
      FROM order_items oi
      JOIN orders o ON o.id=oi.order_id
      WHERE o.store_id=${store.id} AND o.status='completed'
      GROUP BY oi.product_id
      ORDER BY units_sold DESC, completed_revenue DESC
      LIMIT 5
    `
  ]);

  const orders = orderRows[0] || {};
  const products = productRows[0] || {};
  const terminal = Number(orders.completed_count || 0) + Number(orders.cancelled_count || 0);
  const completionRate = terminal >= 5
    ? Math.round((Number(orders.completed_count || 0) / terminal) * 100)
    : null;

  return json({
    ok: true,
    version: "2.0",
    store,
    operations: {
      ...orders,
      ...products,
      terminal_order_count: terminal,
      completion_rate: completionRate,
      completion_rate_eligible: terminal >= 5,
      requires_attention_count:
        Number(orders.pending_count || 0) +
        Number(orders.confirmed_count || 0) +
        Number(orders.processing_count || 0) +
        Number(orders.ready_count || 0) +
        Number(products.low_stock_count || 0) +
        Number(products.out_of_stock_count || 0)
    },
    action_queue: actionRows,
    top_products: topRows,
    methodology: {
      completion_rate: "completed / (completed + cancelled), shown after 5 terminal orders",
      low_stock: "active products with stock 1-5",
      sla_breach: "pending order older than seller response_sla_minutes"
    }
  });
}

async function discoveryV2(sql, url) {
  const q = cleanQuery(url.searchParams.get("q"));
  const categoryId = uuid(url.searchParams.get("category_id"));
  const limit = boundedInt(url.searchParams.get("limit"), 8, 1, 20);
  const pattern = q ? `%${q}%` : "%";
  const prefix = q ? `${q}%` : "%";

  const products = await sql`
    SELECT
      p.id, p.name, p.price, p.stock, p.unit,
      COALESCE(NULLIF(p.thumbnail_url,''),(
        SELECT pi.image_url FROM product_images pi
        WHERE pi.product_id=p.id
        ORDER BY pi.sort_order ASC, pi.created_at ASC, pi.id ASC LIMIT 1
      )) AS image_url,
      p.store_id, s.name AS store_name, s.verification_status AS store_verification_status,
      p.category_id, c.name AS category_name,
      COALESCE(sales.sold_count,0)::int AS sold_count,
      COALESCE(rating.average_rating,0)::numeric AS average_rating,
      COALESCE(rating.rating_count,0)::int AS verified_rating_count,
      (
        CASE
          WHEN ${q}='' THEN 20
          WHEN LOWER(p.name)=LOWER(${q}) THEN 100
          WHEN p.name ILIKE ${prefix} THEN 72
          WHEN p.name ILIKE ${pattern} THEN 48
          WHEN s.name ILIKE ${pattern} THEN 26
          WHEN COALESCE(c.name,'') ILIKE ${pattern} THEN 18
          ELSE 0
        END
        + CASE WHEN s.verification_status='verified' THEN 8 ELSE 0 END
        + LEAST(COALESCE(sales.sold_count,0),50) * 0.30
        + LEAST(COALESCE(rating.rating_count,0),20) * 0.35
        + COALESCE(rating.average_rating,0) * 1.2
        + CASE WHEN p.created_at > NOW()-INTERVAL '30 days' THEN 3 ELSE 0 END
      )::numeric(10,2) AS rank_score
    FROM products p
    JOIN stores s ON s.id=p.store_id AND s.is_active=TRUE
    LEFT JOIN categories c ON c.id=p.category_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(oi.quantity),0)::int AS sold_count
      FROM order_items oi JOIN orders o ON o.id=oi.order_id
      WHERE oi.product_id=p.id AND o.status='completed'
    ) sales ON TRUE
    LEFT JOIN LATERAL (
      SELECT ROUND(AVG(pr.rating)::numeric,1) AS average_rating, COUNT(*)::int AS rating_count
      FROM product_ratings pr
      JOIN orders o ON o.id=pr.order_id
      WHERE pr.product_id=p.id AND o.status='completed' AND o.buyer_id=pr.user_id
    ) rating ON TRUE
    WHERE
      p.is_active=TRUE AND p.stock>0
      AND (${categoryId}::uuid IS NULL OR p.category_id=${categoryId}::uuid)
      AND (${q}='' OR p.name ILIKE ${pattern} OR s.name ILIKE ${pattern} OR COALESCE(c.name,'') ILIKE ${pattern})
    ORDER BY rank_score DESC, p.created_at DESC, p.id ASC
    LIMIT ${limit}
  `;

  const stores = q ? await sql`
    SELECT
      s.id, s.name, s.logo_url, s.district, s.city, s.verification_status,
      COALESCE(stats.completed_orders,0)::int AS completed_orders,
      COALESCE(stats.sold_count,0)::int AS sold_count,
      (
        CASE WHEN LOWER(s.name)=LOWER(${q}) THEN 100 WHEN s.name ILIKE ${prefix} THEN 70 ELSE 42 END
        + CASE WHEN s.verification_status='verified' THEN 10 ELSE 0 END
        + LEAST(COALESCE(stats.completed_orders,0),40)*0.4
      )::numeric(10,2) AS rank_score
    FROM stores s
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT o.id)::int AS completed_orders, COALESCE(SUM(oi.quantity),0)::int AS sold_count
      FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id
      WHERE o.store_id=s.id AND o.status='completed'
    ) stats ON TRUE
    WHERE s.is_active=TRUE AND s.name ILIKE ${pattern}
    ORDER BY rank_score DESC, s.created_at DESC
    LIMIT ${Math.min(6, limit)}
  ` : [];

  return json({
    ok: true,
    version: "2.0",
    query: q,
    products,
    stores,
    ranking: {
      opaque_score: false,
      factors: ["text relevance", "verified store", "completed sales", "verified-purchase rating", "freshness"],
      paid_boost: false,
      max_results: 20
    }
  });
}

async function checkoutPreflight(sql, request) {
  const user = await authenticatedUser(sql, request);
  if (!user) return json({ ok: false, error: "Silakan masuk terlebih dahulu." }, 401);
  const body = await request.json().catch(() => ({}));
  const ids = [...new Set((Array.isArray(body.selected_product_ids) ? body.selected_product_ids : [])
    .map(uuid).filter(Boolean))].slice(0, 100);
  if (!ids.length) return json({ ok: false, error: "Pilih minimal satu produk." }, 400);

  const rows = await sql`
    SELECT
      ci.product_id, ci.quantity,
      p.name, p.stock, p.price, p.is_active AS product_active,
      s.id AS store_id, s.name AS store_name, s.is_active AS store_active,
      cs.pickup_enabled, cs.seller_delivery_enabled, cs.local_courier_enabled,
      cs.cod_enabled, cs.pay_at_store_enabled, cs.bank_transfer_enabled, cs.merchant_qris_enabled
    FROM carts c
    JOIN cart_items ci ON ci.cart_id=c.id
    JOIN products p ON p.id=ci.product_id
    JOIN stores s ON s.id=p.store_id
    LEFT JOIN store_commerce_settings cs ON cs.store_id=s.id
    WHERE c.user_id=${user.id} AND ci.product_id=ANY(${ids}::uuid[])
    ORDER BY s.id, ci.created_at, ci.id
  `;

  const found = new Set(rows.map(row => String(row.product_id)));
  const issues = [];
  for (const productId of ids) {
    if (!found.has(productId)) issues.push({ code: "NOT_IN_CART", product_id: productId, severity: "blocking" });
  }
  for (const row of rows) {
    if (!row.product_active || !row.store_active) {
      issues.push({ code: "UNAVAILABLE", product_id: row.product_id, severity: "blocking" });
    } else if (Number(row.quantity) > Number(row.stock)) {
      issues.push({ code: "INSUFFICIENT_STOCK", product_id: row.product_id, available_stock: Number(row.stock), severity: "blocking" });
    }
  }

  const stores = new Map();
  for (const row of rows) {
    const key = String(row.store_id);
    if (!stores.has(key)) {
      const fulfillmentReady = Boolean(row.pickup_enabled || row.seller_delivery_enabled || row.local_courier_enabled);
      const paymentReady = Boolean(row.cod_enabled || row.pay_at_store_enabled || row.bank_transfer_enabled || row.merchant_qris_enabled);
      stores.set(key, { store_id: row.store_id, store_name: row.store_name, fulfillment_ready: fulfillmentReady, payment_ready: paymentReady });
      if (!fulfillmentReady) issues.push({ code: "NO_FULFILLMENT_METHOD", store_id: row.store_id, severity: "blocking" });
      if (!paymentReady) issues.push({ code: "NO_PAYMENT_METHOD", store_id: row.store_id, severity: "blocking" });
    }
  }

  const blocking = issues.filter(issue => issue.severity === "blocking");
  return json({
    ok: true,
    version: "3.0",
    ready: blocking.length === 0,
    checked_at: new Date().toISOString(),
    selected_product_count: ids.length,
    cart_match_count: rows.length,
    stores: [...stores.values()],
    issues,
    safety: {
      server_rechecks_stock_during_checkout: true,
      checkout_transaction_serialized: true,
      selected_cart_rows_only: true,
      custodial_fund_movement: false
    }
  });
}

async function releaseStatus(sql) {
  const rows = await sql`
    SELECT version FROM schema_migrations
    WHERE version=ANY(${REQUIRED_MIGRATIONS}::text[])
  `;
  const applied = new Set(rows.map(row => row.version));
  const missing = REQUIRED_MIGRATIONS.filter(version => !applied.has(version));
  return json({
    ok: true,
    release: V1_RELEASE,
    launch_certified: missing.length === 0,
    schema_contract: { required: REQUIRED_MIGRATIONS, missing },
    capabilities: {
      auth_security: true,
      social_commerce: true,
      commerce_chat: true,
      trust_evidence: true,
      seller_operations_v2: true,
      discovery_ranking_v2: true,
      checkout_preflight_v3: true,
      operational_observability: true
    },
    boundaries: {
      escrow: false,
      platform_wallet: false,
      automated_refund_ledger: false,
      recommendation_paid_boost: false
    }
  });
}

export async function handleV1CompletionApi(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  const owns =
    url.pathname === "/api/commerce/seller/operations-v2" ||
    url.pathname === "/api/discover/v2" ||
    url.pathname === "/api/commerce/checkout/preflight" ||
    url.pathname === "/api/release/v1";
  if (!owns) return null;

  try {
    const sql = neon(env.DATABASE_URL);
    if (url.pathname === "/api/commerce/seller/operations-v2" && method === "GET") return sellerOperations(sql, request);
    if (url.pathname === "/api/discover/v2" && method === "GET") return discoveryV2(sql, url);
    if (url.pathname === "/api/commerce/checkout/preflight" && method === "POST") return checkoutPreflight(sql, request);
    if (url.pathname === "/api/release/v1" && method === "GET") return releaseStatus(sql);
    return json({ ok: false, error: "Method tidak didukung." }, 405);
  } catch (error) {
    console.error("V1 completion API error:", error);
    return json({ ok: false, error: "Layanan V1 belum dapat diproses." }, 500);
  }
}
