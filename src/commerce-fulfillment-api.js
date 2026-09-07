import { Client, neon } from "@neondatabase/serverless";
import {
  FULFILLMENT_METHODS,
  PAYMENT_METHODS,
  normalizeStoreCommerceSettings,
  publicCommerceOptions,
  insertOrderTimelineEventClient
} from "./commerce-fulfillment-helpers.js";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FULFILLMENT_STATES = new Set(['awaiting_confirmation','ready_for_pickup','in_transit','picked_up','delivered','cancelled']);
const PAYMENT_PROVIDER_TYPES = new Set(['bank','ewallet']);
const CLOUDINARY_QRIS_PATTERN = /^https:\/\/res\.cloudinary\.com\//i;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
function jsonError(message, status = 400) { return json({ ok: false, error: message }, status); }
function getCookie(request, name) {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const cookie of header.split(";")) {
    const [key, ...value] = cookie.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}
function uuid(value) {
  const id = String(value || '').trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}
function text(value, max = 1000) { return String(value || '').trim().slice(0, max) || null; }
function profileFromRow(row = {}) {
  return {
    transfer_provider_type: row.transfer_provider_type || null,
    transfer_provider_name: row.transfer_provider_name || null,
    transfer_account_number: row.transfer_account_number || null,
    transfer_account_name: row.transfer_account_name || null,
    qris_merchant_name: row.qris_merchant_name || null,
    qris_image_url: row.qris_image_url || null,
    qris_public_id: row.qris_public_id || null
  };
}

async function authUser(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const rows = await sql`
    SELECT u.id,u.name,u.email,u.phone,u.avatar_url,u.role
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=encode(digest(${token},'sha256'),'hex')
      AND s.expires_at>NOW() AND u.is_active=TRUE LIMIT 1
  `;
  return rows[0] || null;
}
async function requireUser(sql, request) {
  const user = await authUser(sql, request);
  return user ? { user, response: null } : { user: null, response: jsonError('Silakan masuk terlebih dahulu.', 401) };
}
async function currentStore(sql, userId) {
  const rows = await sql`SELECT id,owner_id,name,address,district,city,verification_status FROM stores WHERE owner_id=${userId} ORDER BY created_at ASC LIMIT 1`;
  return rows[0] || null;
}

async function getPublicSettings(sql, storeId) {
  const rows = await sql`
    SELECT s.id AS store_id,s.name,s.address,s.district,s.city,s.verification_status,scs.*
    FROM stores s LEFT JOIN store_commerce_settings scs ON scs.store_id=s.id
    WHERE s.id=${storeId}::uuid AND s.is_active=TRUE LIMIT 1
  `;
  if (!rows[0]) return null;
  const normalized = normalizeStoreCommerceSettings({ store_id: storeId, ...rows[0] });
  return {
    store: {
      id: rows[0].store_id,
      name: rows[0].name,
      address: rows[0].address,
      district: rows[0].district,
      city: rows[0].city,
      verification_status: rows[0].verification_status
    },
    settings: normalized,
    options: publicCommerceOptions(normalized)
  };
}

async function sellerSettings(sql, request) {
  const auth = await requireUser(sql, request); if (auth.response) return auth.response;
  const store = await currentStore(sql, auth.user.id);
  if (!store) return jsonError('Buat UMKM terlebih dahulu.', 404);
  const rows = await sql`SELECT * FROM store_commerce_settings WHERE store_id=${store.id} LIMIT 1`;
  const row = rows[0] || {};
  return json({
    ok:true,
    store,
    settings: {
      ...normalizeStoreCommerceSettings({ store_id: store.id, ...row }),
      ...profileFromRow(row)
    }
  });
}

async function updateSellerSettings(sql, request) {
  const auth = await requireUser(sql, request); if (auth.response) return auth.response;
  const store = await currentStore(sql, auth.user.id);
  if (!store) return jsonError('Buat UMKM terlebih dahulu.', 404);
  const body = await request.json().catch(() => null);
  if (!body) return jsonError('Pengaturan commerce tidak valid.', 400);

  const pickup = body.pickup_enabled === true;
  const sellerDelivery = body.seller_delivery_enabled === true;
  const localCourier = body.local_courier_enabled === true;
  const cod = body.cod_enabled === true;
  const payAtStore = body.pay_at_store_enabled === true;
  const bankTransfer = body.bank_transfer_enabled === true;
  const qris = body.merchant_qris_enabled === true;
  if (!pickup && !sellerDelivery && !localCourier) return jsonError('Aktifkan minimal satu metode pemenuhan.', 400);
  if (!cod && !payAtStore && !bankTransfer && !qris) return jsonError('Aktifkan minimal satu metode pembayaran.', 400);

  const fee = Number(body.flat_delivery_fee ?? 0);
  const threshold = body.free_delivery_threshold === '' || body.free_delivery_threshold == null ? null : Number(body.free_delivery_threshold);
  const min = Number(body.estimated_min_minutes ?? 60);
  const max = Number(body.estimated_max_minutes ?? 240);
  const sla = Number(body.response_sla_minutes ?? 240);
  if (![fee,min,max,sla].every(Number.isFinite) || fee < 0 || min < 0 || max < min || sla < 15) return jsonError('Nilai biaya atau estimasi tidak valid.', 400);
  if (threshold != null && (!Number.isFinite(threshold) || threshold < 0)) return jsonError('Batas gratis ongkir tidak valid.', 400);

  const providerType = text(body.transfer_provider_type,16);
  const providerName = text(body.transfer_provider_name,80);
  const accountNumber = text(body.transfer_account_number,120);
  const accountName = text(body.transfer_account_name,160);
  const qrisMerchantName = text(body.qris_merchant_name,160);
  const qrisImageUrl = text(body.qris_image_url,1000);
  const qrisPublicId = text(body.qris_public_id,300);

  if (providerType && !PAYMENT_PROVIDER_TYPES.has(providerType)) return jsonError('Jenis tujuan transfer tidak valid.',400);
  if (accountNumber && !/^[0-9+().\-\s]{3,120}$/.test(accountNumber)) return jsonError('Nomor rekening atau e-wallet tidak valid.',400);
  if (qrisImageUrl && !CLOUDINARY_QRIS_PATTERN.test(qrisImageUrl)) return jsonError('QRIS harus berasal dari unggahan merchant Pasar UMKM.',400);

  if (bankTransfer && (!providerType || !providerName || !accountNumber || !accountName)) {
    return jsonError('Lengkapi jenis, nama bank/e-wallet, nomor akun, dan nama pemilik untuk mengaktifkan transfer.',400);
  }
  if (qris && (!qrisMerchantName || !qrisImageUrl)) {
    return jsonError('Nama merchant dan gambar QRIS wajib diisi untuk mengaktifkan QRIS.',400);
  }

  const transferNote = text(body.bank_transfer_instructions,600);
  const qrisNote = text(body.qris_instructions,600);
  const structuredTransferInstructions = bankTransfer
    ? [
        `${providerName} · ${accountNumber}`,
        `A/N ${accountName}`,
        transferNote
      ].filter(Boolean).join('\n')
    : transferNote;
  const structuredQrisInstructions = qris
    ? [
        `QRIS Merchant: ${qrisMerchantName}`,
        'Scan QRIS merchant yang ditampilkan pada detail pesanan.',
        qrisNote
      ].filter(Boolean).join('\n')
    : qrisNote;

  const rows = await sql`
    INSERT INTO store_commerce_settings (
      store_id,pickup_enabled,seller_delivery_enabled,local_courier_enabled,
      cod_enabled,pay_at_store_enabled,bank_transfer_enabled,merchant_qris_enabled,
      flat_delivery_fee,free_delivery_threshold,estimated_min_minutes,estimated_max_minutes,
      response_sla_minutes,pickup_instructions,bank_transfer_instructions,qris_instructions,
      transfer_provider_type,transfer_provider_name,transfer_account_number,transfer_account_name,
      qris_merchant_name,qris_image_url,qris_public_id,updated_at
    ) VALUES (
      ${store.id},${pickup},${sellerDelivery},${localCourier},
      ${cod},${payAtStore},${bankTransfer},${qris},
      ${fee},${threshold},${Math.trunc(min)},${Math.trunc(max)},${Math.trunc(sla)},
      ${text(body.pickup_instructions,1200)},${structuredTransferInstructions},${structuredQrisInstructions},
      ${providerType},${providerName},${accountNumber},${accountName},
      ${qrisMerchantName},${qrisImageUrl},${qrisPublicId},NOW()
    )
    ON CONFLICT (store_id) DO UPDATE SET
      pickup_enabled=EXCLUDED.pickup_enabled,
      seller_delivery_enabled=EXCLUDED.seller_delivery_enabled,
      local_courier_enabled=EXCLUDED.local_courier_enabled,
      cod_enabled=EXCLUDED.cod_enabled,
      pay_at_store_enabled=EXCLUDED.pay_at_store_enabled,
      bank_transfer_enabled=EXCLUDED.bank_transfer_enabled,
      merchant_qris_enabled=EXCLUDED.merchant_qris_enabled,
      flat_delivery_fee=EXCLUDED.flat_delivery_fee,
      free_delivery_threshold=EXCLUDED.free_delivery_threshold,
      estimated_min_minutes=EXCLUDED.estimated_min_minutes,
      estimated_max_minutes=EXCLUDED.estimated_max_minutes,
      response_sla_minutes=EXCLUDED.response_sla_minutes,
      pickup_instructions=EXCLUDED.pickup_instructions,
      bank_transfer_instructions=EXCLUDED.bank_transfer_instructions,
      qris_instructions=EXCLUDED.qris_instructions,
      transfer_provider_type=EXCLUDED.transfer_provider_type,
      transfer_provider_name=EXCLUDED.transfer_provider_name,
      transfer_account_number=EXCLUDED.transfer_account_number,
      transfer_account_name=EXCLUDED.transfer_account_name,
      qris_merchant_name=EXCLUDED.qris_merchant_name,
      qris_image_url=EXCLUDED.qris_image_url,
      qris_public_id=EXCLUDED.qris_public_id,
      updated_at=NOW()
    RETURNING *
  `;
  return json({
    ok:true,
    store,
    settings: {
      ...normalizeStoreCommerceSettings(rows[0]),
      ...profileFromRow(rows[0])
    }
  });
}

async function loadOrderAccess(sql, orderId, user) {
  const rows = await sql`
    SELECT o.*,s.owner_id AS seller_user_id,s.name AS store_name,u.name AS buyer_name
    FROM orders o JOIN stores s ON s.id=o.store_id JOIN users u ON u.id=o.buyer_id
    WHERE o.id=${orderId}::uuid LIMIT 1
  `;
  const order = rows[0];
  if (!order) return { error: jsonError('Pesanan tidak ditemukan.',404) };
  const buyer = String(order.buyer_id) === String(user.id);
  const seller = String(order.seller_user_id) === String(user.id);
  const admin = user.role === 'admin';
  if (!buyer && !seller && !admin) return { error: jsonError('Anda tidak memiliki akses ke pesanan ini.',403) };
  return { order, buyer, seller, admin };
}

async function orderTimeline(sql, request, orderId) {
  const auth = await requireUser(sql, request); if (auth.response) return auth.response;
  const access = await loadOrderAccess(sql, orderId, auth.user); if (access.error) return access.error;
  const events = await sql`
    SELECT e.id,e.event_kind,e.from_state,e.to_state,e.note,e.created_at,e.actor_user_id,u.name AS actor_name
    FROM order_timeline_events e LEFT JOIN users u ON u.id=e.actor_user_id
    WHERE e.order_id=${orderId}::uuid ORDER BY e.created_at ASC,e.id ASC
  `;
  return json({ ok:true, order:access.order, events });
}

function allowedFulfillment(order, next) {
  if (!FULFILLMENT_STATES.has(next)) return false;
  if (order.status === 'cancelled') return next === 'cancelled';
  if (order.fulfillment_method === 'pickup') {
    return order.status === 'ready' && order.fulfillment_status === 'awaiting_confirmation' && next === 'ready_for_pickup';
  }
  return order.status === 'ready' && order.fulfillment_status === 'awaiting_confirmation' && next === 'in_transit';
}

async function updateFulfillment(request, env, orderId) {
  const sql = neon(env.DATABASE_URL);
  const auth = await requireUser(sql, request); if (auth.response) return auth.response;
  const body = await request.json().catch(() => null);
  const next = String(body?.status || '').trim().toLowerCase();
  if (!FULFILLMENT_STATES.has(next)) return jsonError('Status pemenuhan tidak valid.',400);
  const client = new Client({ connectionString: env.DATABASE_URL });
  try {
    await client.connect(); await client.query('BEGIN');
    const result = await client.query(`SELECT o.*,s.owner_id AS seller_user_id FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.id=$1::uuid FOR UPDATE OF o`,[orderId]);
    const order = result.rows[0];
    if (!order) throw Object.assign(new Error('Pesanan tidak ditemukan.'),{status:404});
    if (auth.user.role !== 'admin' && String(order.seller_user_id)!==String(auth.user.id)) throw Object.assign(new Error('Hanya seller pemilik pesanan yang dapat memperbarui pemenuhan.'),{status:403});
    if (order.fulfillment_status === next) { await client.query('ROLLBACK'); return json({ok:true,changed:false,order}); }
    if (!allowedFulfillment(order,next)) throw Object.assign(new Error('Urutan pemenuhan belum valid. Pastikan status order sudah siap.'),{status:409});
    const updated = await client.query(`UPDATE orders SET fulfillment_status=$1,updated_at=NOW() WHERE id=$2::uuid RETURNING *`,[next,orderId]);
    await insertOrderTimelineEventClient(client,{orderId,actorUserId:auth.user.id,eventKind:'fulfillment',fromState:order.fulfillment_status,toState:next,note:text(body?.note,800)});
    await client.query(`INSERT INTO notifications (user_id,type,title,message,target_type,target_id,actor_user_id,entity_type,entity_id,is_read,created_at) VALUES ($1::uuid,'order','Perjalanan pesanan diperbarui',$2,'order',$3::uuid,$4::uuid,'order',$3::uuid,FALSE,NOW())`,[order.buyer_id,`Pesanan ${order.order_number} sekarang ${next.replaceAll('_',' ')}.`,orderId,auth.user.id]);
    await client.query('COMMIT');
    return json({ok:true,changed:true,order:updated.rows[0]});
  } catch(error) {
    try { await client.query('ROLLBACK'); } catch {}
    return jsonError(error?.message || 'Status pemenuhan belum dapat diperbarui.',Number.isInteger(error?.status)?error.status:500);
  } finally { try { await client.end(); } catch {} }
}

async function confirmReceived(request, env, orderId) {
  const sql = neon(env.DATABASE_URL);
  const auth = await requireUser(sql, request); if (auth.response) return auth.response;
  const client = new Client({ connectionString: env.DATABASE_URL });
  try {
    await client.connect(); await client.query('BEGIN');
    const result = await client.query(`SELECT o.*,s.owner_id AS seller_user_id FROM orders o JOIN stores s ON s.id=o.store_id WHERE o.id=$1::uuid FOR UPDATE OF o`,[orderId]);
    const order = result.rows[0];
    if (!order) throw Object.assign(new Error('Pesanan tidak ditemukan.'),{status:404});
    if (String(order.buyer_id)!==String(auth.user.id)) throw Object.assign(new Error('Hanya pembeli pemilik pesanan yang dapat mengonfirmasi penerimaan.'),{status:403});
    if (order.status === 'completed' && ['delivered','picked_up'].includes(order.fulfillment_status)) { await client.query('ROLLBACK'); return json({ok:true,changed:false,order}); }
    const expected = order.fulfillment_method === 'pickup' ? 'ready_for_pickup' : 'in_transit';
    const finalFulfillment = order.fulfillment_method === 'pickup' ? 'picked_up' : 'delivered';
    if (order.status !== 'ready' || order.fulfillment_status !== expected) throw Object.assign(new Error('Pesanan belum berada pada tahap yang dapat dikonfirmasi diterima.'),{status:409});
    const updated = await client.query(`UPDATE orders SET status='completed',fulfillment_status=$1,fulfilled_at=NOW(),updated_at=NOW() WHERE id=$2::uuid RETURNING *`,[finalFulfillment,orderId]);
    await insertOrderTimelineEventClient(client,{orderId,actorUserId:auth.user.id,eventKind:'fulfillment',fromState:order.fulfillment_status,toState:finalFulfillment,note:'Pembeli mengonfirmasi penerimaan.'});
    await insertOrderTimelineEventClient(client,{orderId,actorUserId:auth.user.id,eventKind:'order_status',fromState:order.status,toState:'completed',note:'Pesanan selesai setelah konfirmasi pembeli.'});
    await client.query(`INSERT INTO notifications (user_id,type,title,message,target_type,target_id,actor_user_id,entity_type,entity_id,is_read,created_at) VALUES ($1::uuid,'order','Pesanan diterima',$2,'order',$3::uuid,$4::uuid,'order',$3::uuid,FALSE,NOW())`,[order.seller_user_id,`Pembeli mengonfirmasi pesanan ${order.order_number} telah diterima.`,orderId,auth.user.id]);
    await client.query('COMMIT');
    return json({ok:true,changed:true,order:updated.rows[0]});
  } catch(error) {
    try { await client.query('ROLLBACK'); } catch {}
    return jsonError(error?.message || 'Konfirmasi penerimaan belum dapat diproses.',Number.isInteger(error?.status)?error.status:500);
  } finally { try { await client.end(); } catch {} }
}

export async function handleCommerceFulfillmentApi(request, env) {
  const url = new URL(request.url);
  const publicMatch = url.pathname.match(/^\/api\/commerce\/fulfillment\/stores\/([0-9a-f-]{36})$/i);
  const timelineMatch = url.pathname.match(/^\/api\/commerce\/orders\/([0-9a-f-]{36})\/timeline$/i);
  const fulfillmentMatch = url.pathname.match(/^\/api\/commerce\/orders\/([0-9a-f-]{36})\/fulfillment$/i);
  const receivedMatch = url.pathname.match(/^\/api\/commerce\/orders\/([0-9a-f-]{36})\/confirm-received$/i);
  const isSellerSettings = url.pathname === '/api/commerce/fulfillment/settings/me';
  if (!publicMatch && !timelineMatch && !fulfillmentMatch && !receivedMatch && !isSellerSettings) return null;

  try {
    const sql = neon(env.DATABASE_URL);
    if (publicMatch && request.method === 'GET') {
      const storeId = uuid(publicMatch[1]); if (!storeId) return jsonError('UMKM tidak valid.',400);
      const result = await getPublicSettings(sql,storeId); return result ? json({ok:true,...result}) : jsonError('UMKM tidak ditemukan.',404);
    }
    if (isSellerSettings && request.method === 'GET') return sellerSettings(sql,request);
    if (isSellerSettings && request.method === 'PUT') return updateSellerSettings(sql,request);
    if (timelineMatch && request.method === 'GET') return orderTimeline(sql,request,uuid(timelineMatch[1]));
    if (fulfillmentMatch && request.method === 'PATCH') return updateFulfillment(request,env,uuid(fulfillmentMatch[1]));
    if (receivedMatch && request.method === 'POST') return confirmReceived(request,env,uuid(receivedMatch[1]));
    return jsonError('Metode tidak diizinkan.',405);
  } catch(error) {
    console.error('P8 fulfillment route error:',error);
    return jsonError(error?.message || 'Layanan pemenuhan pesanan sedang mengalami gangguan.',500);
  }
}

export const COMMERCE_FULFILLMENT_ENUMS = Object.freeze({ fulfillment:FULFILLMENT_METHODS, payment:PAYMENT_METHODS });
