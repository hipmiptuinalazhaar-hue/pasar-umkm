import fs from 'node:fs';

const fail=message=>{throw new Error(message)};
const read=path=>{if(!fs.existsSync(path))fail(`${path} missing`);return fs.readFileSync(path,'utf8')};
const need=(source,text,label)=>{if(!source.includes(text))fail(`Missing ${label}: ${text}`)};
const forbid=(source,pattern,label)=>{if(pattern.test(source))fail(`Forbidden ${label}`)};

const migration=read('database/migrations/2026-09-07-p8-real-commerce-fulfillment.sql');
const helpers=read('src/commerce-fulfillment-helpers.js');
const api=read('src/commerce-fulfillment-api.js');
const preferences=read('src/checkout-commerce-preference-api.js');
const checkoutV2Api=read('src/cart-checkout-v2-api.js');
const worker=read('src/worker-entry.js');
const integration=read('js/p8-commerce-integration.js');
const center=read('js/p8-commerce-center.js');
const checkoutV2=read('js/checkout-v2.js');
const sellerBridge=read('js/seller-center-p8-bridge.js');
const sellerOrderBridge=read('js/seller-center-order-p8.js');
const nativeCommerce=read('js/commerce-experience-v2.js');
const p3=read('js/p3-premium-experience.js');
const v10=read('js/performance-v10-a.js');
const checkout=read('checkout/index.html');
const purchases=read('purchases/index.html');
const seller=read('seller-orders/index.html');
const css=read('css/p8-commerce-center.css');
const checkoutCss=read('css/checkout-v2.css');
const index=read('index.html');
const pkg=JSON.parse(read('package.json'));

for(const text of ['store_commerce_settings','checkout_commerce_preferences','order_timeline_events','fulfillment_method','fulfillment_status','payment_method','p8_apply_checkout_commerce_snapshot','p8_order_timeline_trigger','2026-09-07-p8-real-commerce-fulfillment'])need(migration,text,'P8 migration contract');
forbid(migration,/\bDROP\s+TABLE\b/i,'DROP TABLE in P8 migration');
forbid(migration,/\bTRUNCATE\b/i,'TRUNCATE in P8 migration');
forbid(migration,/DELETE\s+FROM\s+(orders|order_items|users|stores|products)\b/i,'destructive business-data deletion');
for(const text of ['pickup','seller_delivery','local_courier','cod','pay_at_store','bank_transfer','merchant_qris','resolveCheckoutCommerce','insertOrderTimelineEventClient'])need(helpers,text,'commerce helper');
for(const text of ['/api/commerce/fulfillment/settings/me','/timeline$/i','/fulfillment$/i','/confirm-received$/i','String(order.seller_user_id)!==String(auth.user.id)','String(order.buyer_id)!==String(auth.user.id)','FOR UPDATE OF o','order_timeline_events'])need(api,text,'fulfillment API safety');

for(const text of ["url.pathname!=='/api/commerce/checkout/preferences'",'allowedStores.has(storeId)',"updated_at<NOW()-INTERVAL '60 minutes'",'handleCartCheckoutV2Api'])need(preferences,text,'checkout preference boundary');
for(const text of ['/api/commerce/checkout-v2','selected_product_ids','checkout_commerce_preferences','DELETE FROM cart_items WHERE cart_id=$1::uuid AND product_id=ANY($2::uuid[])'])need(checkoutV2Api,text,'selective checkout V2');

const custodial=/\b(refund_ledger|payment_gateway|wallet_balance|wallet_transactions|seller_wallet|user_wallet|escrow_account|settlement_account)\b/i;
const custodialRoute=/\/api\/(?:wallet|escrow|settlement)(?:\/|['"`])/i;
for(const source of [api,preferences,checkoutV2Api]){forbid(source,custodial,'custodial payment primitive');forbid(source,custodialRoute,'custodial payment route')}

need(worker,'import { handleCheckoutCommercePreferenceApi } from "./checkout-commerce-preference-api.js";','P8 preference import');
need(worker,'const P8_MIGRATION = "2026-09-07-p8-real-commerce-fulfillment";','P8 migration marker');
need(worker,'p8_applied: p8Applied','P8 health applied');
const preferenceCall=worker.indexOf('await handleCheckoutCommercePreferenceApi(request, env)');
const fulfillmentCall=worker.indexOf('await handleCommerceFulfillmentApi(request, env)');
const ordersCall=worker.indexOf('await handleOrdersApiV2(request, env)');
if(!(preferenceCall>=0&&fulfillmentCall>preferenceCall&&ordersCall>fulfillmentCall))fail('P8 commerce handlers must run before Orders V2');

need(checkout,'data-p8-mode="checkout-v2"','Checkout V2 mode');
need(checkout,'/css/checkout-v2.css?v=1.0','Checkout V2 stylesheet');
need(checkout,'/js/checkout-v2.js?v=1.0','Checkout V2 controller');
need(checkout,'noindex,nofollow','Checkout private robots');
forbid(checkout,/p8-commerce-center\.js|p8-payment-profile\.js/,'legacy checkout controller');
for(const [name,html,mode] of [['purchases',purchases,'purchases'],['seller',seller,'seller']]){need(html,`data-p8-mode="${mode}"`,`${name} mode`);need(html,'/css/p8-commerce-center.css?v=1.0',`${name} stylesheet`);need(html,'/js/p8-commerce-center.js?v=1.0',`${name} controller`);need(html,'noindex,nofollow',`${name} private robots`)}

for(const text of ['/api/commerce/orders?scope=buyer','/api/commerce/orders?scope=seller','/confirm-received','/fulfillment/settings/me','Platform tidak menyimpan saldo'])need(center,text,'P8 purchase/seller center');
for(const text of ['/api/commerce/cart','/api/commerce/checkout/preferences','/api/commerce/checkout-v2','selected_product_ids','navigator.geolocation','sessionStorage.removeItem'])need(checkoutV2,text,'Checkout V2 commerce flow');
forbid(checkoutV2,/MutationObserver/,'checkout MutationObserver state engine');

for(const text of ["const target='/checkout/index.html'",'[data-cart-v2-checkout]','[data-commerce-action="checkout"]','[data-commerce-action="buy-now"]',"fetch('/api/commerce/cart/items'",'pasar_cart_selection_v2','data-cart-v2-item',"sideLink('/purchases/'",'js/seller-center-p8-bridge.js?v=1.0','js/seller-center-order-p8.js?v=1.0'])need(integration,text,'cart/checkout integration');
forbid(integration,/location\.pathname==='\/checkout\/'\s*\|\|\s*location\.pathname==='\/checkout'/,'legacy directory checkout no-op guard');
need(nativeCommerce,'aria-label="Menu Seller Center"','native Seller Center menu');
need(nativeCommerce,"sellerMenuRow('receipt', 'Pesanan Masuk'",'native seller orders navigation');
need(sellerBridge,'Pengiriman & Pembayaran','native seller fulfillment/payment settings');
need(sellerOrderBridge,'/api/commerce/orders?scope=seller','native seller order data');
need(sellerOrderBridge,'Navigasi ke pembeli','seller map navigation');
need(p3,'js/p8-commerce-integration.js?v=1.2','deferred P8 loader compatibility key');
need(p3,"window.PasarP8Commerce?.version === '1.2'",'P8 loader version contract');
need(index,'js/performance-v10-a.js?v=','V10 critical adaptive router');
forbid(index,/<script[^>]+src="js\/p8-commerce-integration\.js\?v=/,'eager P8 checkout router in critical HTML');
need(v10,"commerce: 'js/p8-commerce-integration.js?v=",'V10 fingerprinted lazy checkout router');
need(v10,'[data-nav="cart"]','V10 cart intent gate');
need(v10,'[data-commerce-action]','V10 commerce intent gate');
need(v10,'event.stopImmediatePropagation()','V10 protected intent interception');
need(v10,'target.click()','V10 checkout intent replay after owner load');

const budgets=[['src/commerce-fulfillment-api.js',api,30000],['src/checkout-commerce-preference-api.js',preferences,14000],['src/cart-checkout-v2-api.js',checkoutV2Api,24000],['js/p8-commerce-center.js',center,30000],['js/p8-commerce-integration.js',integration,16000],['js/checkout-v2.js',checkoutV2,26000],['js/seller-center-p8-bridge.js',sellerBridge,24000],['js/seller-center-order-p8.js',sellerOrderBridge,16000],['css/p8-commerce-center.css',css,16000],['css/checkout-v2.css',checkoutCss,18000]];
for(const [path,source,max] of budgets){const bytes=Buffer.byteLength(source);if(bytes>max)fail(`${path} too large: ${bytes}/${max}`)}
if(pkg.scripts?.['test:p8-commerce']!=='node scripts/validate-p8-real-commerce.mjs')fail('package.json missing test:p8-commerce');
if(!String(pkg.scripts?.validate||'').includes('npm run test:p8-commerce'))fail('canonical validate must include P8');
console.log('P8 real commerce contract PASS: seller fulfillment/payment, state-driven selective Checkout V2, native Seller Center, non-custodial boundary, ownership, and V10 protected lazy checkout routing are intact.');
