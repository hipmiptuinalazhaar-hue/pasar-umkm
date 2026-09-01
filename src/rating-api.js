import { neon } from "@neondatabase/serverless";
import { ensureRatingInfrastructure } from "./rating-store.js";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function error(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";

  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || null;
  }

  return null;
}

function uuid(value) {
  const id = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}

function stars(value) {
  const rating = Number(value);
  return Number.isInteger(rating) && rating >= 1 && rating <= 5
    ? rating
    : null;
}

function cleanReview(value) {
  const review = String(value || "").trim();
  return review ? review.slice(0, 1200) : null;
}

async function currentUser(sql, request) {
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

async function orderForBuyer(sql, orderId, userId) {
  const rows = await sql`
    SELECT
      o.id,
      o.order_number,
      o.buyer_id,
      o.store_id,
      o.status,
      s.name AS store_name
    FROM orders o
    JOIN stores s ON s.id = o.store_id
    WHERE
      o.id = ${orderId}::uuid
      AND o.buyer_id = ${userId}
    LIMIT 1
  `;

  return rows[0] || null;
}

async function orderProducts(sql, orderId) {
  return await sql`
    SELECT DISTINCT
      oi.product_id,
      oi.product_name,
      p.thumbnail_url,
      (
        SELECT pi.image_url
        FROM product_images pi
        WHERE pi.product_id = oi.product_id
        ORDER BY pi.sort_order ASC, pi.created_at ASC
        LIMIT 1
      ) AS fallback_image
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ${orderId}::uuid
      AND oi.product_id IS NOT NULL
    ORDER BY oi.product_name ASC
  `;
}

async function orderRatingState(sql, orderId, userId) {
  const [storeRows, productRows] = await Promise.all([
    sql`
      SELECT rating, review, updated_at
      FROM store_ratings
      WHERE order_id = ${orderId}::uuid AND user_id = ${userId}
      LIMIT 1
    `,
    sql`
      SELECT product_id, rating, review, updated_at
      FROM product_ratings
      WHERE order_id = ${orderId}::uuid AND user_id = ${userId}
    `
  ]);

  return {
    store_rating: storeRows[0] || null,
    product_ratings: productRows
  };
}

async function notifySellerAboutRating(sql, order, user) {
  try {
    const sellers = await sql`
      SELECT owner_id
      FROM stores
      WHERE id = ${order.store_id}
      LIMIT 1
    `;

    if (!sellers[0]?.owner_id) {
      return;
    }

    /*
     * notification_type di schema hanya menerima:
     * system, order, product, message, store.
     * Rating toko masuk kategori store, bukan enum baru "rating".
     */
    await sql`
      INSERT INTO notifications (
        user_id, type, title, message,
        target_type, target_id,
        actor_user_id, entity_type, entity_id,
        is_read, created_at
      )
      VALUES (
        ${sellers[0].owner_id},
        'store',
        'Rating baru',
        ${`${user.name || "Pembeli"} memberikan rating untuk pesanan ${order.order_number}.`},
        'profile',
        ${user.id},
        ${user.id},
        'profile',
        ${user.id},
        FALSE,
        NOW()
      )
    `;
  } catch (notificationError) {
    /* Rating utama tetap sukses walau notifikasi tambahan gagal. */
    console.error("Rating notification error:", notificationError);
  }
}

async function handleOrderRating(sql, request, url) {
  const match = url.pathname.match(/^\/api\/ratings\/order\/([0-9a-f-]{36})$/i);
  if (!match) return null;

  const orderId = uuid(match[1]);
  if (!orderId) return error("Pesanan tidak valid.", 400);

  const user = await currentUser(sql, request);
  if (!user) return error("Silakan masuk terlebih dahulu.", 401);

  const order = await orderForBuyer(sql, orderId, user.id);
  if (!order) return error("Pesanan tidak ditemukan.", 404);

  const products = await orderProducts(sql, orderId);

  if (request.method === "GET") {
    const ratingState = await orderRatingState(sql, orderId, user.id);

    return json({
      ok: true,
      eligible: order.status === "completed",
      order,
      products,
      ...ratingState
    });
  }

  if (request.method !== "POST") {
    return error("Metode tidak diizinkan.", 405);
  }

  if (order.status !== "completed") {
    return error("Rating hanya dapat diberikan setelah pesanan selesai.", 409);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return error("Data rating tidak valid.", 400);
  }

  const storeRating = stars(body.store_rating);
  const storeReview = cleanReview(body.store_review);
  const productInput = Array.isArray(body.products) ? body.products : [];

  if (!storeRating && productInput.length === 0) {
    return error("Berikan minimal satu rating.", 400);
  }

  if (storeRating) {
    await sql`
      INSERT INTO store_ratings (
        order_id, user_id, store_id, rating, review
      )
      VALUES (
        ${order.id}, ${user.id}, ${order.store_id}, ${storeRating}, ${storeReview}
      )
      ON CONFLICT (order_id, user_id)
      DO UPDATE SET
        rating = EXCLUDED.rating,
        review = EXCLUDED.review,
        updated_at = NOW()
    `;
  }

  const allowedProducts = new Set(products.map(item => String(item.product_id)));

  for (const item of productInput.slice(0, 50)) {
    const productId = uuid(item?.product_id);
    const rating = stars(item?.rating);

    if (!productId || !rating || !allowedProducts.has(productId)) {
      continue;
    }

    await sql`
      INSERT INTO product_ratings (
        order_id, user_id, store_id, product_id, rating, review
      )
      VALUES (
        ${order.id},
        ${user.id},
        ${order.store_id},
        ${productId}::uuid,
        ${rating},
        ${cleanReview(item?.review)}
      )
      ON CONFLICT (order_id, product_id, user_id)
      DO UPDATE SET
        rating = EXCLUDED.rating,
        review = EXCLUDED.review,
        updated_at = NOW()
    `;
  }

  await notifySellerAboutRating(sql, order, user);

  return json({
    ok: true,
    message: "Rating berhasil disimpan.",
    ...(await orderRatingState(sql, orderId, user.id))
  });
}

function parseUuidList(value) {
  const result = [];
  const seen = new Set();

  for (const raw of String(value || "").split(",")) {
    const id = uuid(raw);
    if (id && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
    if (result.length >= 100) break;
  }

  return result;
}

async function handleSummaries(sql, request, url) {
  if (url.pathname !== "/api/ratings/summaries" || request.method !== "GET") {
    return null;
  }

  const productIds = parseUuidList(url.searchParams.get("product_ids"));
  const storeIds = parseUuidList(url.searchParams.get("store_ids"));

  let productRatings = [];
  let storeRatings = [];

  if (productIds.length) {
    productRatings = await sql`
      SELECT
        product_id,
        ROUND(AVG(rating)::numeric, 1) AS average_rating,
        COUNT(*)::int AS rating_count
      FROM product_ratings
      WHERE product_id = ANY(${productIds}::uuid[])
      GROUP BY product_id
    `;
  }

  if (storeIds.length) {
    storeRatings = await sql`
      SELECT
        store_id,
        ROUND(AVG(rating)::numeric, 1) AS average_rating,
        COUNT(*)::int AS rating_count
      FROM store_ratings
      WHERE store_id = ANY(${storeIds}::uuid[])
      GROUP BY store_id
    `;
  }

  return json({
    ok: true,
    products: productRatings,
    stores: storeRatings
  });
}

export async function handleRatingApi(request, env) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/ratings/")) {
    return null;
  }

  try {
    const sql = neon(env.DATABASE_URL);
    await ensureRatingInfrastructure(sql);

    const summaries = await handleSummaries(sql, request, url);
    if (summaries) return summaries;

    const orderRating = await handleOrderRating(sql, request, url);
    if (orderRating) return orderRating;

    return error("Endpoint rating tidak ditemukan.", 404);
  } catch (err) {
    console.error("Rating API error:", err);
    return error("Layanan rating sedang mengalami gangguan.", 500);
  }
}
