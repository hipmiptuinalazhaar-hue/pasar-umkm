import { Client, neon } from "@neondatabase/serverless";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SELECTED_ITEMS = 100;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function error(message, status = 400, code = "REQUEST_INVALID") {
  return json({ ok: false, error: message, code }, status);
}

function cookie(request, name) {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const item of header.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return parts.join("=") || null;
  }
  return null;
}

function uuid(value) {
  const id = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}

function optionalText(value, max) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

function requiredText(value, min, max) {
  const text = String(value ?? "").trim().slice(0, max);
  return text.length >= min ? text : null;
}

function coordinate(value, type) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  const valid = Number.isFinite(number) && (type === "lat" ? number >= -90 && number <= 90 : number >= -180 && number <= 180);
  return valid ? Number(number.toFixed(6)) : NaN;
}

function accuracy(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Math.round(Number(value));
  return Number.isInteger(number) && number >= 0 && number <= 100000 ? number : NaN;
}

async function authenticatedUser(sql, request) {
  const token = cookie(request, SESSION_COOKIE);
  if (!token) return null;
  const rows = await sql`
    SELECT u.id, u.name, u.email, u.phone, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = encode(digest(${token}, 'sha256'), 'hex')
      AND s.expires_at > NOW()
      AND u.is_active = TRUE
    LIMIT 1
  `;
  return rows[0] || null;
}

async function requireUser(sql, request) {
  const user = await authenticatedUser(sql, request);
  return user ? { user, response: null } : { user: null, response: error("Silakan masuk terlebih dahulu.", 401, "AUTH_REQUIRED") };
}

function normalizeAddress(body, fallbackUser = {}) {
  const recipientName = requiredText(body?.recipient_name ?? fallbackUser.name, 2, 120);
  const phone = requiredText(body?.phone ?? fallbackUser.phone, 5, 30);
  const addressText = requiredText(body?.address_text, 5, 1200);
  const latitude = coordinate(body?.latitude, "lat");
  const longitude = coordinate(body?.longitude, "lng");
  const accuracyM = accuracy(body?.accuracy_m);

  if (!recipientName) throw Object.assign(new Error("Nama penerima belum valid."), { status: 400 });
  if (!phone) throw Object.assign(new Error("Nomor penerima belum valid."), { status: 400 });
  if (!addressText) throw Object.assign(new Error("Alamat belum valid."), { status: 400 });
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) throw Object.assign(new Error("Koordinat lokasi tidak valid."), { status: 400 });
  if ((latitude === null) !== (longitude === null)) throw Object.assign(new Error("Latitude dan longitude harus disimpan berpasangan."), { status: 400 });
  if (Number.isNaN(accuracyM)) throw Object.assign(new Error("Akurasi lokasi tidak valid."), { status: 400 });

  return {
    label: optionalText(body?.label, 60) || "Rumah",
    recipient_name: recipientName,
    phone,
    address_text: addressText,
    district: optionalText(body?.district, 100),
    city: optionalText(body?.city, 100) || "Lubuklinggau",
    province: optionalText(body?.province, 100) || "Sumatera Selatan",
    postal_code: optionalText(body?.postal_code, 20),
    landmark: optionalText(body?.landmark, 240),
    latitude,
    longitude,
    accuracy_m: accuracyM,
    is_default: body?.is_default !== false
  };
}

async function addressBook(request, env, url) {
  if (!url.pathname.startsWith("/api/commerce/address-book")) return null;
  const sql = neon(env.DATABASE_URL);
  const auth = await requireUser(sql, request);
  if (auth.response) return auth.response;

  const match = url.pathname.match(/^\/api\/commerce\/address-book\/([0-9a-f-]{36})$/i);
  const addressId = match ? uuid(match[1]) : null;

  try {
    if (url.pathname === "/api/commerce/address-book" && request.method === "GET") {
      const addresses = await sql`
        SELECT id, label, recipient_name, phone, address_text, district, city, province,
               postal_code, landmark, latitude, longitude, accuracy_m, is_default, created_at, updated_at
        FROM user_addresses
        WHERE user_id = ${auth.user.id}
        ORDER BY is_default DESC, updated_at DESC, created_at DESC
        LIMIT 30
      `;
      return json({ ok: true, count: addresses.length, addresses, default_address: addresses.find(item => item.is_default) || addresses[0] || null });
    }

    if (url.pathname === "/api/commerce/address-book" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") return error("Data alamat tidak valid.");
      const input = normalizeAddress(body, auth.user);
      const existing = await sql`SELECT COUNT(*)::int AS count FROM user_addresses WHERE user_id = ${auth.user.id}`;
      const makeDefault = input.is_default || Number(existing[0]?.count || 0) === 0;
      if (makeDefault) await sql`UPDATE user_addresses SET is_default = FALSE, updated_at = NOW() WHERE user_id = ${auth.user.id} AND is_default = TRUE`;
      const rows = await sql`
        INSERT INTO user_addresses(user_id,label,recipient_name,phone,address_text,district,city,province,postal_code,landmark,latitude,longitude,accuracy_m,is_default,updated_at)
        VALUES(${auth.user.id},${input.label},${input.recipient_name},${input.phone},${input.address_text},${input.district},${input.city},${input.province},${input.postal_code},${input.landmark},${input.latitude},${input.longitude},${input.accuracy_m},${makeDefault},NOW())
        RETURNING *
      `;
      return json({ ok: true, address: rows[0] }, 201);
    }

    if (addressId && request.method === "PATCH") {
      const owns = await sql`SELECT id FROM user_addresses WHERE id = ${addressId}::uuid AND user_id = ${auth.user.id} LIMIT 1`;
      if (!owns[0]) return error("Alamat tidak ditemukan.", 404, "ADDRESS_NOT_FOUND");
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") return error("Data alamat tidak valid.");
      const input = normalizeAddress(body, auth.user);
      if (input.is_default) await sql`UPDATE user_addresses SET is_default = FALSE, updated_at = NOW() WHERE user_id = ${auth.user.id} AND id <> ${addressId}::uuid AND is_default = TRUE`;
      const rows = await sql`
        UPDATE user_addresses SET
          label=${input.label}, recipient_name=${input.recipient_name}, phone=${input.phone}, address_text=${input.address_text},
          district=${input.district}, city=${input.city}, province=${input.province}, postal_code=${input.postal_code}, landmark=${input.landmark},
          latitude=${input.latitude}, longitude=${input.longitude}, accuracy_m=${input.accuracy_m}, is_default=${input.is_default}, updated_at=NOW()
        WHERE id=${addressId}::uuid AND user_id=${auth.user.id}
        RETURNING *
      `;
      return json({ ok: true, address: rows[0] });
    }

    if (addressId && request.method === "DELETE") {
      const deleted = await sql`DELETE FROM user_addresses WHERE id=${addressId}::uuid AND user_id=${auth.user.id} RETURNING id,is_default`;
      if (!deleted[0]) return error("Alamat tidak ditemukan.", 404, "ADDRESS_NOT_FOUND");
      if (deleted[0].is_default) {
        await sql`
          UPDATE user_addresses SET is_default=TRUE, updated_at=NOW()
          WHERE id=(SELECT id FROM user_addresses WHERE user_id=${auth.user.id} ORDER BY updated_at DESC,created_at DESC LIMIT 1)
        `;
      }
      return json({ ok: true, deleted: true });
    }

    return error("Metode tidak diizinkan.", 405, "METHOD_NOT_ALLOWED");
  } catch (cause) {
    console.error("Cart Checkout V2 address error:", cause);
    return error(cause?.message || "Alamat belum dapat diproses.", Number.isInteger(cause?.status) ? cause.status : 500, "ADDRESS_ERROR");
  }
}

function orderNumber() {
  const stamp = Date.now().toString().slice(-10);
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `PUMKM-${stamp}-${suffix}`;
}

function transactionError(message, status = 409, code = "CHECKOUT_CONFLICT") {
  return Object.assign(new Error(message), { status, checkoutCode: code });
}

async function selectiveCheckout(request, env, url) {
  if (url.pathname !== "/api/commerce/checkout-v2") return null;
  if (request.method !== "POST") return error("Metode tidak diizinkan.", 405, "METHOD_NOT_ALLOWED");

  const sql = neon(env.DATABASE_URL);
  const auth = await requireUser(sql, request);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return error("Data checkout tidak valid.");

  const selectedIds = [...new Set((Array.isArray(body.selected_product_ids) ? body.selected_product_ids : []).map(uuid).filter(Boolean))].slice(0, MAX_SELECTED_ITEMS);
  if (!selectedIds.length) return error("Pilih minimal satu produk untuk checkout.", 400, "NO_ITEMS_SELECTED");
  if (selectedIds.length !== (Array.isArray(body.selected_product_ids) ? new Set(body.selected_product_ids.map(value => String(value || "").toLowerCase())).size : 0)) {
    return error("Daftar produk checkout memuat ID yang tidak valid.", 400, "INVALID_SELECTION");
  }

  const customerName = requiredText(body.customer_name ?? auth.user.name, 2, 120);
  const customerPhone = requiredText(body.customer_phone ?? auth.user.phone, 5, 30);
  const deliveryAddress = optionalText(body.delivery_address, 1200);
  const notes = optionalText(body.notes, 1000);
  const landmark = optionalText(body.delivery_landmark, 240);
  const latitude = coordinate(body.delivery_latitude, "lat");
  const longitude = coordinate(body.delivery_longitude, "lng");
  const accuracyM = accuracy(body.delivery_accuracy_m);

  if (!customerName) return error("Nama penerima belum valid.");
  if (!customerPhone) return error("Nomor penerima belum valid.");
  if (Number.isNaN(latitude) || Number.isNaN(longitude) || (latitude === null) !== (longitude === null)) return error("Titik lokasi pengantaran tidak valid.");
  if (Number.isNaN(accuracyM)) return error("Akurasi lokasi tidak valid.");

  const client = new Client({ connectionString: env.DATABASE_URL });
  let active = false;
  try {
    await client.connect();
    await client.query("BEGIN");
    active = true;

    const cartResult = await client.query("SELECT id FROM carts WHERE user_id=$1::uuid FOR UPDATE", [auth.user.id]);
    const cartId = cartResult.rows[0]?.id;
    if (!cartId) throw transactionError("Keranjang masih kosong.", 409, "CART_EMPTY");

    const itemsResult = await client.query(
      `SELECT id,product_id,quantity,created_at FROM cart_items WHERE cart_id=$1::uuid AND product_id=ANY($2::uuid[]) ORDER BY created_at ASC,id ASC FOR UPDATE`,
      [cartId, selectedIds]
    );
    if (itemsResult.rows.length !== selectedIds.length) throw transactionError("Ada produk pilihan yang sudah berubah atau tidak lagi ada di keranjang.", 409, "SELECTION_STALE");

    const productsResult = await client.query(
      `SELECT p.id,p.name,p.price,p.stock,p.store_id,p.is_active,s.name AS store_name,s.owner_id,s.is_active AS store_active
       FROM products p JOIN stores s ON s.id=p.store_id
       WHERE p.id=ANY($1::uuid[]) ORDER BY p.id ASC FOR UPDATE OF p`,
      [selectedIds]
    );
    const products = new Map(productsResult.rows.map(row => [String(row.id), row]));
    const groups = new Map();
    for (const cartItem of itemsResult.rows) {
      const product = products.get(String(cartItem.product_id));
      if (!product || !product.is_active || !product.store_active) throw transactionError("Ada produk pilihan yang tidak lagi tersedia.", 409, "PRODUCT_UNAVAILABLE");
      const quantity = Number(cartItem.quantity || 0);
      const stock = Number(product.stock || 0);
      const price = Number(product.price || 0);
      if (!Number.isInteger(quantity) || quantity < 1) throw transactionError("Jumlah produk di keranjang tidak valid.");
      if (quantity > stock) throw transactionError(`Stok ${product.name || "produk"} tidak mencukupi.`, 409, "STOCK_CHANGED");
      const storeId = String(product.store_id);
      if (!groups.has(storeId)) groups.set(storeId, []);
      groups.get(storeId).push({ product_id: product.id, name: product.name, price, quantity, store_id: product.store_id, store_name: product.store_name, owner_id: product.owner_id });
    }

    const storeIds = [...groups.keys()];
    const prefResult = await client.query(
      `SELECT buyer_id,store_id,fulfillment_method,payment_method,delivery_district,delivery_city
       FROM checkout_commerce_preferences
       WHERE buyer_id=$1::uuid AND store_id=ANY($2::uuid[]) AND updated_at>NOW()-INTERVAL '60 minutes'
       FOR UPDATE`,
      [auth.user.id, storeIds]
    );
    if (prefResult.rows.length !== storeIds.length) throw transactionError("Pilihan pengiriman atau pembayaran berubah. Periksa checkout kembali.", 409, "PREFERENCE_REQUIRED");
    const prefMap = new Map(prefResult.rows.map(row => [String(row.store_id), row]));
    const needsDelivery = prefResult.rows.some(row => row.fulfillment_method !== "pickup");
    if (needsDelivery && (!deliveryAddress || deliveryAddress.length < 5)) throw transactionError("Alamat pengantaran wajib untuk pesanan yang diantar.", 400, "ADDRESS_REQUIRED");

    const createdOrders = [];
    for (const [storeId, items] of groups.entries()) {
      const pref = prefMap.get(storeId);
      const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const isDelivery = pref.fulfillment_method !== "pickup";
      const inserted = await client.query(
        `INSERT INTO orders(order_number,buyer_id,store_id,status,subtotal,delivery_fee,total,customer_name,customer_phone,delivery_address,notes,delivery_latitude,delivery_longitude,delivery_accuracy_m,delivery_landmark)
         VALUES($1,$2::uuid,$3::uuid,'pending',$4,0,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [orderNumber(), auth.user.id, storeId, subtotal, customerName, customerPhone, isDelivery ? deliveryAddress : "Ambil di toko", notes, isDelivery ? latitude : null, isDelivery ? longitude : null, isDelivery ? accuracyM : null, isDelivery ? landmark : null]
      );
      const order = inserted.rows[0];
      if (!order) throw transactionError("Pesanan gagal dibuat.", 500, "ORDER_CREATE_FAILED");

      for (const item of items) {
        const stockResult = await client.query(
          `UPDATE products SET stock=stock-$1,updated_at=NOW() WHERE id=$2::uuid AND is_active=TRUE AND stock>=$1 RETURNING id,stock`,
          [item.quantity, item.product_id]
        );
        if (!stockResult.rows[0]) throw transactionError(`Stok ${item.name || "produk"} berubah. Periksa checkout kembali.`, 409, "STOCK_CHANGED");
        await client.query(
          `INSERT INTO order_items(order_id,product_id,product_name,product_price,quantity,subtotal) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6)`,
          [order.id, item.product_id, String(item.name || "Produk"), item.price, item.quantity, item.price * item.quantity]
        );
      }

      await client.query(
        `INSERT INTO notifications(user_id,type,title,message,target_type,target_id,actor_user_id,entity_type,entity_id,is_read,created_at)
         VALUES($1::uuid,'order','Pesanan baru',$2,'order',$3::uuid,$4::uuid,'order',$3::uuid,FALSE,NOW())`,
        [items[0].owner_id, `${auth.user.name || "Pembeli"} membuat pesanan ${order.order_number}.`, order.id, auth.user.id]
      );
      createdOrders.push(order);
    }

    await client.query("DELETE FROM cart_items WHERE cart_id=$1::uuid AND product_id=ANY($2::uuid[])", [cartId, selectedIds]);
    await client.query("COMMIT");
    active = false;
    return json({ ok: true, message: "Pesanan berhasil dibuat.", count: createdOrders.length, orders: createdOrders, checked_out_product_ids: selectedIds }, 201);
  } catch (cause) {
    if (active) {
      try { await client.query("ROLLBACK"); } catch (rollbackError) { console.error("Cart Checkout V2 rollback failed:", rollbackError); }
    }
    if (cause?.code === "40001" || cause?.code === "40P01") return error("Checkout sedang diproses bersamaan. Silakan coba lagi.", 409, "CHECKOUT_RETRY");
    console.error("Cart Checkout V2 transaction error:", cause);
    return error(cause?.message || "Checkout belum dapat diproses.", Number.isInteger(cause?.status) ? cause.status : 500, cause?.checkoutCode || "CHECKOUT_ERROR");
  } finally {
    try { await client.end(); } catch (closeError) { console.error("Cart Checkout V2 client close failed:", closeError); }
  }
}

export async function handleCartCheckoutV2Api(request, env) {
  const url = new URL(request.url);
  const addressResponse = await addressBook(request, env, url);
  if (addressResponse) return addressResponse;
  return selectiveCheckout(request, env, url);
}
