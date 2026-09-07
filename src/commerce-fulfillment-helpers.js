export const FULFILLMENT_METHODS = Object.freeze(['pickup','seller_delivery','local_courier']);
export const PAYMENT_METHODS = Object.freeze(['cod','pay_at_store','bank_transfer','merchant_qris']);

export const DEFAULT_STORE_COMMERCE_SETTINGS = Object.freeze({
  pickup_enabled: true,
  seller_delivery_enabled: true,
  local_courier_enabled: false,
  cod_enabled: true,
  pay_at_store_enabled: true,
  bank_transfer_enabled: false,
  merchant_qris_enabled: false,
  flat_delivery_fee: 0,
  free_delivery_threshold: null,
  estimated_min_minutes: 60,
  estimated_max_minutes: 240,
  response_sla_minutes: 240,
  pickup_instructions: null,
  bank_transfer_instructions: null,
  qris_instructions: null
});

function boolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function amount(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function integer(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

export function normalizeStoreCommerceSettings(row = {}) {
  const base = DEFAULT_STORE_COMMERCE_SETTINGS;
  const min = integer(row.estimated_min_minutes, base.estimated_min_minutes);
  const max = Math.max(min, integer(row.estimated_max_minutes, base.estimated_max_minutes));
  return {
    store_id: row.store_id || null,
    pickup_enabled: boolean(row.pickup_enabled, base.pickup_enabled),
    seller_delivery_enabled: boolean(row.seller_delivery_enabled, base.seller_delivery_enabled),
    local_courier_enabled: boolean(row.local_courier_enabled, base.local_courier_enabled),
    cod_enabled: boolean(row.cod_enabled, base.cod_enabled),
    pay_at_store_enabled: boolean(row.pay_at_store_enabled, base.pay_at_store_enabled),
    bank_transfer_enabled: boolean(row.bank_transfer_enabled, base.bank_transfer_enabled),
    merchant_qris_enabled: boolean(row.merchant_qris_enabled, base.merchant_qris_enabled),
    flat_delivery_fee: amount(row.flat_delivery_fee, base.flat_delivery_fee),
    free_delivery_threshold: row.free_delivery_threshold == null ? null : amount(row.free_delivery_threshold, null),
    estimated_min_minutes: min,
    estimated_max_minutes: max,
    response_sla_minutes: Math.max(15, integer(row.response_sla_minutes, base.response_sla_minutes)),
    pickup_instructions: row.pickup_instructions || null,
    bank_transfer_instructions: row.bank_transfer_instructions || null,
    qris_instructions: row.qris_instructions || null,
    updated_at: row.updated_at || null
  };
}

export async function loadStoreCommerceSettingsClient(client, storeId) {
  const result = await client.query(
    `SELECT * FROM store_commerce_settings WHERE store_id = $1::uuid LIMIT 1`,
    [storeId]
  );
  return normalizeStoreCommerceSettings({ store_id: storeId, ...(result.rows[0] || {}) });
}

function enabledFulfillment(settings) {
  const methods = [];
  if (settings.seller_delivery_enabled) methods.push('seller_delivery');
  if (settings.pickup_enabled) methods.push('pickup');
  if (settings.local_courier_enabled) methods.push('local_courier');
  return methods;
}

function enabledPayments(settings, fulfillmentMethod) {
  const methods = [];
  if (settings.cod_enabled && fulfillmentMethod !== 'pickup') methods.push('cod');
  if (settings.pay_at_store_enabled && fulfillmentMethod === 'pickup') methods.push('pay_at_store');
  if (settings.bank_transfer_enabled) methods.push('bank_transfer');
  if (settings.merchant_qris_enabled) methods.push('merchant_qris');
  return methods;
}

export function publicCommerceOptions(settingsInput) {
  const settings = normalizeStoreCommerceSettings(settingsInput);
  return {
    fulfillment_methods: enabledFulfillment(settings),
    payment_methods: PAYMENT_METHODS.filter(method => {
      if (method === 'cod') return settings.cod_enabled;
      if (method === 'pay_at_store') return settings.pay_at_store_enabled;
      if (method === 'bank_transfer') return settings.bank_transfer_enabled;
      return settings.merchant_qris_enabled;
    }),
    flat_delivery_fee: settings.flat_delivery_fee,
    free_delivery_threshold: settings.free_delivery_threshold,
    estimated_min_minutes: settings.estimated_min_minutes,
    estimated_max_minutes: settings.estimated_max_minutes,
    response_sla_minutes: settings.response_sla_minutes,
    pickup_instructions: settings.pickup_instructions
  };
}

export function resolveCheckoutCommerce(settingsInput, preference = {}, subtotal = 0) {
  const settings = normalizeStoreCommerceSettings(settingsInput);
  const fulfillmentOptions = enabledFulfillment(settings);
  let fulfillmentMethod = String(preference.fulfillment_method || '').trim().toLowerCase();
  if (!fulfillmentOptions.includes(fulfillmentMethod)) fulfillmentMethod = fulfillmentOptions[0];
  if (!fulfillmentMethod) throw Object.assign(new Error('Toko belum mengaktifkan metode pemenuhan pesanan.'), { status: 409 });

  const paymentOptions = enabledPayments(settings, fulfillmentMethod);
  let paymentMethod = String(preference.payment_method || '').trim().toLowerCase();
  if (!paymentOptions.includes(paymentMethod)) paymentMethod = paymentOptions[0];
  if (!paymentMethod) throw Object.assign(new Error('Toko belum mengaktifkan metode pembayaran untuk pilihan ini.'), { status: 409 });

  const numericSubtotal = Number(subtotal || 0);
  let deliveryFee = fulfillmentMethod === 'pickup' ? 0 : Number(settings.flat_delivery_fee || 0);
  if (settings.free_delivery_threshold != null && numericSubtotal >= Number(settings.free_delivery_threshold)) deliveryFee = 0;

  let paymentInstructions = null;
  if (paymentMethod === 'bank_transfer') paymentInstructions = settings.bank_transfer_instructions;
  if (paymentMethod === 'merchant_qris') paymentInstructions = settings.qris_instructions;
  if (paymentMethod === 'pay_at_store') paymentInstructions = settings.pickup_instructions;

  return {
    fulfillment_method: fulfillmentMethod,
    payment_method: paymentMethod,
    delivery_fee: Math.max(0, deliveryFee),
    requires_address: fulfillmentMethod !== 'pickup',
    payment_instructions: paymentInstructions || null,
    estimated_min_minutes: settings.estimated_min_minutes,
    estimated_max_minutes: settings.estimated_max_minutes
  };
}

export async function insertOrderTimelineEventClient(client, {
  orderId,
  actorUserId = null,
  eventKind,
  fromState = null,
  toState = null,
  note = null
}) {
  await client.query(
    `INSERT INTO order_timeline_events (order_id, actor_user_id, event_kind, from_state, to_state, note)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
    [orderId, actorUserId, eventKind, fromState, toState, note]
  );
}
