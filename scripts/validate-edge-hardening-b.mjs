import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const fail = message => {
  console.error(`Edge Hardening B validation failed: ${message}`);
  process.exitCode = 1;
};
const requireText = (text, marker, label) => {
  if (!text.includes(marker)) fail(`missing ${label}: ${marker}`);
};
const forbidText = (text, marker, label) => {
  if (text.includes(marker)) fail(`forbidden ${label}: ${marker}`);
};

const commercePath = 'js/commerce-experience-v2.js';
const apiPath = 'src/functionality-api.js';
const carrierPath = 'js/profile-saved.js';
const indexPath = 'index.html';
const p2Path = '.github/workflows/ui-p2-commerce-validate.yml';
const p6Path = '.github/workflows/ui-p6-polish-performance-validate.yml';

const commerce = read(commercePath);
const api = read(apiPath);
const carrier = read(carrierPath);
const index = read(indexPath);
const p2 = read(p2Path);
const p6 = read(p6Path);

for (const [marker, label] of [
  ["version: '2.1'", 'Commerce 2.1 public version'],
  ['pending: new Set()', 'in-flight action registry'],
  ['new AbortController()', 'request timeout controller'],
  ["'REQUEST_TIMEOUT'", 'timeout error code'],
  ["'NETWORK_ERROR'", 'network error code'],
  ["'SESSION_EXPIRED'", 'session-expired error code'],
  ['async function withActionLock', 'single-flight action lock'],
  ["withActionLock(`cart:${productId}`", 'cart quantity lock'],
  ["withActionLock('cart-clear'", 'clear-cart lock'],
  ["withActionLock('checkout-submit'", 'checkout submit lock'],
  ["withActionLock(`order:${orderId}`", 'order transition lock'],
  ["withActionLock(`delete-product:${productId}`", 'product delete lock'],
  ["withActionLock(`add-cart:${productId}`", 'add-cart lock'],
  ["withActionLock('store-submit'", 'store submit lock'],
  ["withActionLock('product-submit'", 'product submit lock'],
  ["withActionLock(`onboarding:${step}`", 'onboarding lock'],
  ['submit.setAttribute(\'aria-busy\', \'true\')', 'checkout loading accessibility state'],
  ["['REQUEST_TIMEOUT', 'NETWORK_ERROR'].includes(error.code)", 'ambiguous checkout reconciliation'],
  ["Periksa Pesanan Saya sebelum mencoba lagi.", 'ambiguous checkout user guidance'],
  ["await go('buyer-orders', {}, { replace: true })", 'ambiguous checkout safe destination'],
  ["'Keranjang belum dapat dimuat'", 'recoverable cart error state'],
  ["data-commerce-route=\"cart\">Coba Lagi", 'cart retry action'],
  ["'Checkout belum dapat dimuat'", 'recoverable checkout error state'],
  ["data-commerce-route=\"checkout\">Coba Lagi", 'checkout retry action'],
  ["'Pesanan belum dapat dimuat'", 'recoverable orders error state'],
]) {
  requireText(commerce, marker, label);
}

requireText(commerce, 'const cart = await loadCart();', 'fresh checkout cart read');
forbidText(
  commerce,
  'const cart = COMMERCE.cart?.items?.length ? COMMERCE.cart : await loadCart();',
  'stale checkout cart shortcut'
);
forbidText(commerce, 'window.fetch =', 'second global fetch owner');

const patchStart = api.indexOf('if (request.method === "PATCH")');
const patchEnd = api.indexOf('if (request.method === "DELETE")', patchStart);
if (patchStart < 0 || patchEnd < 0) {
  fail('cart PATCH section could not be isolated');
} else {
  const patchSection = api.slice(patchStart, patchEnd);
  requireText(patchSection, 'JOIN stores s ON s.id = p.store_id', 'cart PATCH store join');
  requireText(patchSection, 'AND s.is_active = TRUE', 'cart PATCH active-store enforcement');
}

for (const [marker, label] of [
  ["window.PasarCommerce?.version === '2.1'", 'carrier Commerce 2.1 handshake'],
  ["js/commerce-experience-v2.js?v=2.1", 'Commerce 2.1 cache boundary'],
]) {
  requireText(carrier, marker, label);
}
requireText(index, 'js/profile-saved.js?v=2.2', 'carrier 2.2 cache boundary');
requireText(p2, 'js/profile-saved.js?v=2.2', 'P2 carrier cache assertion');
requireText(p2, 'js/commerce-experience-v2.js?v=2.1', 'P2 Commerce cache assertion');
requireText(p6, 'js/profile-saved.js?v=2.2', 'P6 carrier cache assertion');
requireText(p6, 'js/commerce-experience-v2.js?v=2.1', 'P6 Commerce cache assertion');
requireText(p6, 'scripts/validate-edge-hardening-b\\.mjs', 'P6 hardening scope guard');
requireText(p6, 'src/functionality-api\\.js', 'P6 backend hardening scope guard');
requireText(p6, '\\.github/workflows/edge-hardening-b-validate\\.yml', 'P6 edge workflow scope guard');

const commerceBytes = fs.statSync(commercePath).size;
if (commerceBytes > 80_000) {
  fail(`Commerce JS exceeds source budget: ${commerceBytes} > 80000`);
}

if (!process.exitCode) {
  console.log(`Edge Hardening B validation passed. Commerce JS: ${commerceBytes} / 80000 bytes.`);
}
