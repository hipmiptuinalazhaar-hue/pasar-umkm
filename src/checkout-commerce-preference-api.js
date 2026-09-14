import { neon, Client } from "@neondatabase/serverless";
import { loadStoreCommerceSettingsClient, publicCommerceOptions } from "./commerce-fulfillment-helpers.js";
import { handleCartCheckoutV2Api } from "./cart-checkout-v2-api.js";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
function error(message, status = 400, code = "CHECKOUT_PREFERENCE_ERROR") { return json({ ok: false, error: message, code }, status); }
function cookie(request, name) {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const item of header.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}
function uuid(value) {
  const id = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}

async function user(sql, request) {
  const token = cookie(request, SESSION_COOKIE);
  if (!token) return null;
  const rows = await sql`
    SELECT u.id,u.name,u.role
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=encode(digest(${token},'sha256'),'hex')
      AND s.expires_at>NOW() AND u.is_active=TRUE
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function handleCheckoutCommercePreferenceApi(request, env) {
  const url = new URL(request.url);
  const v2Response = await handleCartCheckoutV2Api(request, env);
  if (v2Response) return v2Response;

  if (url.pathname !== "/api/commerce/checkout/preferences") return null;
  if (request.method !== "PUT") return error("Metode tidak diizinkan.", 405, "METHOD_NOT_ALLOWED");

  const sql = neon(env.DATABASE_URL);
  const auth = await user(sql, request);
  if (!auth) return error("Silakan masuk terlebih dahulu.", 401, "AUTH_REQUIRED");
  const body = await request.json().catch(() => null);
  const preferences = Array.isArray(body?.preferences) ? body.preferences.slice(0, 20) : [];
  if (!preferences.length) return error("Pilihan checkout belum tersedia.", 400, "PREFERENCES_REQUIRED");

  const client = new Client({ connectionString: env.DATABASE_URL });
  let started = false;
  try {
    await client.connect();
    await client.query("BEGIN");
    started = true;

    const cartStoresResult = await client.query(
      `SELECT DISTINCT p.store_id
       FROM carts c
       JOIN cart_items ci ON ci.cart_id=c.id
       JOIN products p ON p.id=ci.product_id
       JOIN stores s ON s.id=p.store_id
       WHERE c.user_id=$1 AND p.is_active=TRUE AND s.is_active=TRUE`,
      [auth.id]
    );
    const allowedStores = new Set(cartStoresResult.rows.map(row => String(row.store_id)));
    if (!allowedStores.size) {
      await client.query("ROLLBACK");
      started = false;
      return error("Keranjang masih kosong.", 409, "CART_EMPTY");
    }

    const normalized = [];
    const seen = new Set();
    for (const item of preferences) {
      const storeId = uuid(item?.store_id);
      if (!storeId || !allowedStores.has(storeId)) throw Object.assign(new Error("INVALID_STORE"), { publicStatus: 400, publicCode: "INVALID_STORE", publicMessage: "Pilihan checkout memuat toko yang tidak ada di keranjang." });
      if (seen.has(storeId)) throw Object.assign(new Error("DUPLICATE_STORE"), { publicStatus: 400, publicCode: "DUPLICATE_STORE", publicMessage: "Pilihan checkout memuat toko yang sama lebih dari sekali." });
      seen.add(storeId);

      const settings = await loadStoreCommerceSettingsClient(client, storeId);
      const options = publicCommerceOptions(settings);
      const fulfillment = String(item?.fulfillment_method || "").trim().toLowerCase();
      const payment = String(item?.payment_method || "").trim().toLowerCase();
      if (!options.fulfillment_methods.includes(fulfillment)) throw Object.assign(new Error("FULFILLMENT_UNAVAILABLE"), { publicStatus: 409, publicCode: "FULFILLMENT_UNAVAILABLE", publicMessage: "Metode pemenuhan tidak tersedia di salah satu UMKM." });
      if (!options.payment_methods.includes(payment)) throw Object.assign(new Error("PAYMENT_UNAVAILABLE"), { publicStatus: 409, publicCode: "PAYMENT_UNAVAILABLE", publicMessage: "Metode pembayaran tidak tersedia di salah satu UMKM." });
      if (fulfillment === "pickup" && payment === "cod") throw Object.assign(new Error("INVALID_PAYMENT_COMBINATION"), { publicStatus: 400, publicCode: "INVALID_PAYMENT_COMBINATION", publicMessage: "COD tidak digunakan untuk ambil di toko." });
      if (fulfillment !== "pickup" && payment === "pay_at_store") throw Object.assign(new Error("INVALID_PAYMENT_COMBINATION"), { publicStatus: 400, publicCode: "INVALID_PAYMENT_COMBINATION", publicMessage: "Bayar di toko hanya tersedia untuk ambil di toko." });

      normalized.push({
        storeId,
        fulfillment,
        payment,
        district: String(item?.delivery_district || "").trim().slice(0, 100) || null,
        city: String(item?.delivery_city || "Lubuklinggau").trim().slice(0, 100) || "Lubuklinggau"
      });
    }

    for (const item of normalized) {
      await client.query(
        `INSERT INTO checkout_commerce_preferences(
           buyer_id,store_id,fulfillment_method,payment_method,delivery_district,delivery_city,updated_at
         ) VALUES($1,$2::uuid,$3,$4,$5,$6,NOW())
         ON CONFLICT(buyer_id,store_id) DO UPDATE SET
           fulfillment_method=EXCLUDED.fulfillment_method,
           payment_method=EXCLUDED.payment_method,
           delivery_district=EXCLUDED.delivery_district,
           delivery_city=EXCLUDED.delivery_city,
           updated_at=NOW()`,
        [auth.id, item.storeId, item.fulfillment, item.payment, item.district, item.city]
      );
    }

    await client.query(
      `DELETE FROM checkout_commerce_preferences
       WHERE buyer_id=$1 AND updated_at<NOW()-INTERVAL '60 minutes'`,
      [auth.id]
    );
    await client.query("COMMIT");
    started = false;

    return json({
      ok: true,
      count: normalized.length,
      preferences: normalized.map(item => ({ store_id: item.storeId, fulfillment_method: item.fulfillment, payment_method: item.payment }))
    });
  } catch (err) {
    if (started) {
      try { await client.query("ROLLBACK"); } catch {}
    }
    console.error("P8 checkout preferences error:", err?.code || err?.message || "unknown");
    if (err?.publicMessage) return error(err.publicMessage, err.publicStatus || 400, err.publicCode || "INVALID_PREFERENCE");
    return error("Pilihan checkout belum dapat disimpan.", 500, "CHECKOUT_PREFERENCE_INTERNAL_ERROR");
  } finally {
    try { await client.end(); } catch {}
  }
}
