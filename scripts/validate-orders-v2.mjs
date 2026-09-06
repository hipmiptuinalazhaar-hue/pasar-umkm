import fs from 'node:fs';

const ordersPath = 'src/orders-api-v2.js';
const workerPath = 'src/worker-entry.js';

const fail = message => {
  throw new Error(message);
};

const requireText = (source, text, label) => {
  if (!source.includes(text)) fail(`Missing ${label}: ${text}`);
};

if (!fs.existsSync(ordersPath)) fail(`${ordersPath} missing`);
if (!fs.existsSync(workerPath)) fail(`${workerPath} missing`);

const orders = fs.readFileSync(ordersPath, 'utf8');
const worker = fs.readFileSync(workerPath, 'utf8');
const bytes = Buffer.byteLength(orders);

if (bytes > 30000) fail(`Orders V2 too large: ${bytes} / 30000 bytes`);

requireText(orders, '/api/commerce/checkout', 'checkout route');
requireText(orders, '/api/commerce/orders', 'orders route');
requireText(orders, '/status$/i', 'status route');
requireText(orders, 'order_id = ANY(${orderIds}::uuid[])', 'batched order items');

if (orders.includes('items: await getOrderItems')) {
  fail('N+1 order item enrichment returned');
}
if (orders.includes('for (const order of orders)')) {
  fail('Serial per-order enrichment loop returned');
}

requireText(orders, 'FOR UPDATE', 'transaction row lock');
requireText(orders, 'FOR UPDATE OF p', 'product row lock');
requireText(orders, 'FOR UPDATE OF o', 'order row lock');
requireText(orders, 'DELETE FROM cart_items WHERE cart_id = $1::uuid', 'atomic cart clear');
requireText(orders, "'Pesanan baru'", 'checkout seller notification');

const sameStatus = orders.indexOf('if (order.status === nextStatus)');
const transitionCheck = orders.indexOf('canTransition(order.status, nextStatus', sameStatus);
const statusUpdate = orders.indexOf('UPDATE orders', sameStatus);
const statusNotification = orders.indexOf('Status pesanan diperbarui', sameStatus);
if (sameStatus < 0 || transitionCheck < 0 || statusUpdate < 0 || statusNotification < 0) {
  fail('Idempotent status update contract incomplete');
}
if (!(sameStatus < transitionCheck && transitionCheck < statusUpdate && statusUpdate < statusNotification)) {
  fail('Same-status no-op must happen before transition mutation and notification');
}
requireText(orders, 'changed: false', 'idempotent no-op response');
requireText(orders, 'changed: true', 'changed response');

const restockStart = orders.indexOf('async function restockCancelledOrder');
const statusStart = orders.indexOf('async function updateOrderStatus', restockStart);
if (restockStart < 0 || statusStart < 0) fail('Cancellation restock helper missing');
const restock = orders.slice(restockStart, statusStart);
requireText(restock, 'WITH restock AS', 'aggregated cancellation restock');
requireText(restock, 'SUM(quantity)::int AS quantity', 'aggregated restock quantity');
if (/for\s*\(/.test(restock)) fail('Cancellation restock must not loop per item');

if (/\b(CREATE|ALTER|DROP)\s+(TABLE|INDEX|TRIGGER|TYPE)\b/i.test(orders)) {
  fail('Orders V2 must not perform runtime DDL');
}

requireText(worker, 'import { handleOrdersApiV2 } from "./orders-api-v2.js";', 'Orders V2 import');
const securityCall = worker.indexOf('enforceRequestSecurity(request)');
const limiterCall = worker.indexOf('enforceRateLimit(request, env)');
const ordersCall = worker.indexOf('await handleOrdersApiV2(request, env)');
const functionalityCall = worker.indexOf('await handleFunctionalityApi(request, env)');
if (securityCall < 0 || limiterCall < 0 || ordersCall < 0 || functionalityCall < 0) {
  fail('Runtime ordering markers missing');
}
if (!(securityCall < limiterCall && limiterCall < ordersCall && ordersCall < functionalityCall)) {
  fail('Orders V2 must remain behind request security/rate limiting and ahead of legacy functionality');
}

console.log(`Orders V2 bytes: ${bytes} / 30000`);
console.log('Orders V2 transaction, batching, idempotency, restock and routing contracts OK.');
