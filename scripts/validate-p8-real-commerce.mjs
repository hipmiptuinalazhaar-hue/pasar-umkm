import fs from 'node:fs';

const fail = message => { throw new Error(message); };
const read = path => { if (!fs.existsSync(path)) fail(`${path} missing`); return fs.readFileSync(path,'utf8'); };
const requireText = (source,text,label) => { if (!source.includes(text)) fail(`Missing ${label}: ${text}`); };
const forbid = (source,pattern,label) => { if (pattern.test(source)) fail(`Forbidden ${label}`); };

const migration=read('database/migrations/2026-09-07-p8-real-commerce-fulfillment.sql');
const helpers=read('src/commerce-fulfillment-helpers.js');
const api=read('src/commerce-fulfillment-api.js');
const preferences=read('src/checkout-commerce-preference-api.js');
const worker=read('src/worker-entry.js');
const integration=read('js/p8-commerce-integration.js');
const center=read('js/p8-commerce-center.js');
const p3=read('js/p3-premium-experience.js');
const checkout=read('checkout/index.html');
const purchases=read('purchases/index.html');
const seller=read('seller-orders/index.html');
const css=read('css/p8-commerce-center.css');
const index=read('index.html');
const pkg=JSON.parse(read('package.json'));

for (const text of ['store_commerce_settings','checkout_commerce_preferences','order_timeline_events','fulfillment_method','fulfillment_status','payment_method','p8_apply_checkout_commerce_snapshot','p8_order_timeline_trigger','2026-09-07-p8-real-commerce-fulfillment']) requireText(migration,text,'P8 migration contract');
forbid(migration,/\bDROP\s+TABLE\b/i,'DROP TABLE in P8 migration');
forbid(migration,/\bTRUNCATE\b/i,'TRUNCATE in P8 migration');
forbid(migration,/DELETE\s+FROM\s+(orders|order_items|users|stores|products)\b/i,'destructive business-data deletion');

for (const text of ['pickup','seller_delivery','local_courier','cod','pay_at_store','bank_transfer','merchant_qris','resolveCheckoutCommerce','insertOrderTimelineEventClient']) requireText(helpers,text,'commerce helper');

for (const text of ['/api/commerce/fulfillment/settings/me','/timeline$/i','/fulfillment$/i','/confirm-received$/i','String(order.seller_user_id)!==String(auth.user.id)','String(order.buyer_id)!==String(auth.user.id)','FOR UPDATE OF o','order_timeline_events']) requireText(api,text,'fulfillment API safety');
requireText(preferences,"url.pathname!=='/api/commerce/checkout/preferences'",'checkout preferences route');
requireText(preferences,'allowedStores.has(storeId)','cart-scoped checkout preference');
requireText(preferences,"updated_at<NOW()-INTERVAL '60 minutes'",'preference expiry');

const custodialPrimitive=/\b(refund_ledger|payment_gateway|wallet_balance|wallet_transactions|seller_wallet|user_wallet|escrow_account|settlement_account)\b/i;
const custodialRoute=/\/api\/(?:wallet|escrow|settlement)(?:\/|['"`])/i;
forbid(api,custodialPrimitive,'custodial payment primitive in P8 API');
forbid(api,custodialRoute,'custodial payment route in P8 API');
forbid(preferences,custodialPrimitive,'custodial payment primitive in checkout API');
forbid(preferences,custodialRoute,'custodial payment route in checkout API');

requireText(worker,'import { handleCommerceFulfillmentApi } from "./commerce-fulfillment-api.js";','P8 fulfillment import');
requireText(worker,'import { handleCheckoutCommercePreferenceApi } from "./checkout-commerce-preference-api.js";','P8 preference import');
requireText(worker,'const P8_MIGRATION = "2026-09-07-p8-real-commerce-fulfillment";','P8 migration marker');
requireText(worker,'p8_applied: p8Applied','P8 health applied');
requireText(worker,'commerce_ready: p8Applied && missingP8.length === 0','P8 health ready');
const preferenceCall=worker.indexOf('await handleCheckoutCommercePreferenceApi(request, env)');
const fulfillmentCall=worker.indexOf('await handleCommerceFulfillmentApi(request, env)');
const ordersCall=worker.indexOf('await handleOrdersApiV2(request, env)');
if (!(preferenceCall >= 0 && fulfillmentCall > preferenceCall && ordersCall > fulfillmentCall)) fail('P8 commerce handlers must run before Orders V2');

for (const [name,html,mode] of [['checkout',checkout,'checkout'],['purchases',purchases,'purchases'],['seller',seller,'seller']]) {
  requireText(html,`data-p8-mode="${mode}"`,`${name} mode`);
  requireText(html,'/css/p8-commerce-center.css?v=1.0',`${name} stylesheet`);
  requireText(html,'/js/p8-commerce-center.js?v=1.0',`${name} controller`);
  requireText(html,'noindex,nofollow',`${name} private robots`);
}

for (const text of ['/api/commerce/cart','/api/commerce/checkout/preferences','/api/commerce/checkout','/api/commerce/orders?scope=buyer','/api/commerce/orders?scope=seller','/confirm-received','/fulfillment/settings/me']) requireText(center,text,'P8 center API');
requireText(center,"location.replace('/purchases/')",'post-checkout redirect');
requireText(center,'Platform tidak menyimpan saldo','non-custodial UI boundary');
requireText(integration,"location.href='/checkout/'",'main checkout redirect');
requireText(integration,"sideLink('/purchases/'",'buyer center navigation');
requireText(integration,"sideLink('/seller-orders/'",'seller center navigation');
requireText(p3,'js/p8-commerce-integration.js?v=1.0','deferred P8 loader');
if (index.includes('p8-commerce-integration.js') || index.includes('p8-commerce-center.css')) fail('P8 assets must not join critical index shell');

const budgets=[
  ['src/commerce-fulfillment-api.js',api,26000],
  ['src/checkout-commerce-preference-api.js',preferences,12000],
  ['js/p8-commerce-center.js',center,30000],
  ['js/p8-commerce-integration.js',integration,6000],
  ['css/p8-commerce-center.css',css,16000]
];
for(const [path,source,max] of budgets){const bytes=Buffer.byteLength(source);if(bytes>max)fail(`${path} too large: ${bytes}/${max}`)}

if(pkg.scripts?.['test:p8-commerce']!=='node scripts/validate-p8-real-commerce.mjs') fail('package.json missing test:p8-commerce');
if(!String(pkg.scripts?.validate||'').includes('npm run test:p8-commerce')) fail('canonical validate must include P8');

console.log('P8 real commerce, fulfillment, non-custodial payment boundary, ownership and deferred UI contracts OK.');