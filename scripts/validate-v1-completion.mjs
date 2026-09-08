import fs from 'node:fs';

const read = path => {
  if (!fs.existsSync(path)) throw new Error(`Missing V1 completion file: ${path}`);
  return fs.readFileSync(path, 'utf8');
};
const need = (source, marker, label) => {
  if (!source.includes(marker)) throw new Error(`Missing ${label}: ${marker}`);
};
const needRegex = (source, pattern, label) => {
  if (!pattern.test(source)) throw new Error(`Missing ${label}: ${pattern}`);
};
const forbid = (source, pattern, label) => {
  if (pattern.test(source)) throw new Error(`Forbidden ${label}`);
};
const budget = (path, max) => {
  const bytes = fs.statSync(path).size;
  console.log(`${path}: ${bytes}/${max} bytes`);
  if (bytes > max) throw new Error(`${path} exceeds budget: ${bytes}/${max}`);
};

const runtime = read('js/v1-completion.js');
const css = read('css/v1-completion.css');
const p5Css = read('css/p5-trust-conversion.css');
const p3 = read('js/p3-premium-experience.js');
const index = read('index.html');
const checkoutApi = read('src/cart-checkout-v2-api.js');
const ordersApi = read('src/orders-api-v2.js');
const serverCommerce = `${checkoutApi}\n${ordersApi}`;
const adminPage = read('admin/intelligence.html');
const adminJs = read('js/admin/intelligence-v2.js');
const adminCss = read('css/admin-intelligence-v2.css');
const manifest = JSON.parse(read('release/v1-manifest.json'));
const pkg = JSON.parse(read('package.json'));

budget('js/v1-completion.js', 24000);
budget('css/v1-completion.css', 9000);
budget('js/p3-premium-experience.js', 12000);
budget('js/admin/intelligence-v2.js', 14000);
budget('css/admin-intelligence-v2.css', 9000);
budget('admin/intelligence.html', 3000);

for (const marker of [
  "version: '1.0'",
  '/api/commerce/orders?scope=seller',
  '/api/products/me',
  '/api/commerce/fulfillment/settings/me',
  'Tindakan hari ini',
  'response_sla_minutes',
  'Stok menipis',
  'Omzet selesai',
  'completion',
  'data-v1-orders',
  'data-v1-products'
]) need(runtime, marker, 'P6 Seller Operations V2 contract');

for (const marker of [
  '/api/discover?kind=products&sort=relevance&limit=16',
  '/api/ratings/summaries?',
  'rankingScore',
  'UMKM terverifikasi',
  'Rekomendasi untuk kamu',
  'Mengapa produk ini muncul?',
  'saveData',
  "['slow-2g','2g']",
  'data-action="product-detail"',
  'data-action="add-cart"',
  'data-action="buy-now"'
]) need(runtime, marker, 'P7 Discovery & Recommendation V2 contract');
forbid(runtime, /\/share\/product\//i, 'static share route inside in-app discovery');
forbid(runtime, /\bpaid\s*boost\s*=\s*true\b/i, 'opaque paid recommendation boost');
forbid(runtime, /P(?:[1-9]|10)\s*[·:]/i, 'user-facing milestone labels in marketplace runtime');

for (const marker of [
  'pasar_cart_selection_v2',
  '[data-cart-v2-checkout]',
  '/api/commerce/cart',
  'belum ada produk dipilih',
  'server akan memeriksa stok lagi secara atomik',
  'button.disabled = !ready'
]) need(runtime.toLowerCase(), marker.toLowerCase(), 'P8 Commerce Safety V3 UI contract');
needRegex(serverCommerce, /\bFOR\s+(?:UPDATE|SHARE)\b/i, 'P8 row-lock contract');
needRegex(serverCommerce, /UPDATE\s+products\s+SET\s+stock\s*=\s*stock\s*-\s*\$1[\s\S]{0,180}?stock\s*>?=\s*\$1/i, 'P8 atomic guarded stock decrement');
need(serverCommerce, 'selected_product_ids', 'P8 selective checkout input');
needRegex(serverCommerce, /DELETE\s+FROM\s+cart_items\s+WHERE\s+cart_id\s*=\s*\$1::uuid\s+AND\s+product_id\s*=\s*ANY\(\$2::uuid\[\]\)/i, 'P8 selected-only cart deletion');
forbid(serverCommerce, /\b(?:wallet_balance|escrow_account|settlement_account|refund_ledger)\b/i, 'custodial primitive in checkout/order core');

for (const marker of [
  "import { adminApi } from './api.js';",
  'adminApi.session()',
  'adminApi.access()',
  'adminApi.operationsMetrics()',
  'adminApi.growthMetrics()',
  "fetch('/api/health'",
  'Operational Intelligence',
  'order_completion_rate_30d',
  'checkout_to_completed_7d_pct'
]) need(adminJs, marker, 'P9 Operational Intelligence contract');
need(adminPage, 'noindex,nofollow,noarchive', 'P9 private robots contract');
need(adminPage, '/js/admin/intelligence-v2.js?v=1.0', 'P9 controller wiring');
forbid(adminJs, /operationAction\(|changeUserStatus\(|storeAction\(|changeProductStatus\(|changePostStatus\(/, 'P9 intelligence mutation action');
forbid(adminJs, /INTERNAL\s*[·-]\s*P\d|Operational P\d|Launch\/Growth P\d|Commerce P\d|P10 INPUT/i, 'user-facing milestone labels in admin intelligence');

for (const marker of [
  'js/v1-completion.js?v=1.0',
  "script.dataset.v1Completion = 'true'",
  'loadV1Completion',
  'script.onload = loadV1Completion'
]) need(p3, marker, 'lazy V1 loader contract');
if (index.includes('js/v1-completion.js')) throw new Error('V1 completion must not join the initial index script graph');

need(css, 'data-action', '');
needRegex(p5Css, /\.p5-trust-stats:has\(>span:nth-child\(3\):last-child\)\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/, 'three-column trust evidence layout');

if (manifest.release !== '2026-09-08-v1-completion') throw new Error('Unexpected P10 release manifest version');
for (const key of [
  'p6_seller_operations_v2',
  'p7_discovery_recommendation_v2',
  'p8_commerce_safety_v3',
  'p9_operational_intelligence_v2',
  'p10_launch_certification'
]) {
  if (manifest.milestones?.[key] !== true) throw new Error(`P10 manifest missing milestone: ${key}`);
}
for (const key of ['custodial_wallet','escrow','automated_refund_ledger','platform_generated_qris','opaque_trust_score']) {
  if (manifest.production_boundaries?.[key] !== false) throw new Error(`P10 boundary must remain false: ${key}`);
}
if (!Array.isArray(manifest.supported_viewports) || manifest.supported_viewports.join(',') !== '360,390,430,768,1024,1280,1366,1600') {
  throw new Error('P10 viewport certification matrix drifted');
}

for (const source of [css, adminCss]) {
  forbid(source, /linear-gradient\(|radial-gradient\(|backdrop-filter\s*:/i, 'GPU-heavy decorative styling in completion layer');
}

if (pkg.scripts?.['test:v1-completion'] !== 'node scripts/validate-v1-completion.mjs') throw new Error('package.json missing test:v1-completion');
if (!String(pkg.scripts?.validate || '').includes('npm run test:v1-completion')) throw new Error('Canonical validate must include P10 V1 certification');

console.log('P6-P10 V1 completion certification PASS: seller operations, shoppable discovery, cart safety, operational intelligence, non-custodial boundaries, clean user-facing copy, and launch manifest are intact.');
