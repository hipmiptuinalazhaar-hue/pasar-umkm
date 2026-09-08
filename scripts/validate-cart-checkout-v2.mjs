import fs from 'node:fs';

const read=path=>{if(!fs.existsSync(path))throw new Error(`${path} missing`);return fs.readFileSync(path,'utf8')};
const need=(source,text,label)=>{if(!source.includes(text))throw new Error(`Missing ${label}: ${text}`)};
const forbid=(source,pattern,label)=>{if(pattern.test(source))throw new Error(`Forbidden ${label}`)};

const migration=read('database/migrations/2026-09-08-cart-checkout-v2-addresses.sql');
const api=read('src/cart-checkout-v2-api.js');
const boundary=read('src/checkout-commerce-preference-api.js');
const cart=read('js/p8-commerce-integration.js');
const hotfix=read('js/cart-checkout-hotfix-v1.js');
const p3=read('js/p3-premium-experience.js');
const checkout=read('js/checkout-v2.js');
const checkoutHtml=read('checkout/index.html');
const checkoutCss=read('css/checkout-v2.css');
const cartCss=read('css/cart-checkout-v2.css');
const profile=read('js/profile-address-v2.js');
const seller=read('js/seller-center-order-p8.js');
const pkg=JSON.parse(read('package.json'));

for(const text of ['CREATE TABLE IF NOT EXISTS user_addresses','latitude NUMERIC(9,6)','longitude NUMERIC(9,6)','is_default BOOLEAN','user_addresses_one_default_idx','ADD COLUMN IF NOT EXISTS delivery_latitude','ADD COLUMN IF NOT EXISTS delivery_longitude','delivery_landmark','2026-09-08-cart-checkout-v2-addresses'])need(migration,text,'address migration');
forbid(migration,/\bDROP\s+(TABLE|COLUMN)\b/i,'destructive migration');
forbid(migration,/\bTRUNCATE\b/i,'TRUNCATE migration');
forbid(migration,/DELETE\s+FROM\s+(orders|order_items|users|stores|products)\b/i,'business data deletion');

for(const text of ['/api/commerce/address-book','/api/commerce/checkout-v2','selected_product_ids','notes_by_store','FOR UPDATE','BEGIN','ROLLBACK','COMMIT','product_id=ANY($2::uuid[])','DELETE FROM cart_items WHERE cart_id=$1::uuid AND product_id=ANY($2::uuid[])','delivery_latitude','delivery_longitude','delivery_accuracy_m','delivery_landmark','checkout_commerce_preferences','resolveCheckoutCommerce','normalizeStoreCommerceSettings','delivery_fee,total','fulfillment_method,fulfillment_status,payment_method,payment_instructions','COMMERCE_OPTIONS_CHANGED'])need(api,text,'selective authoritative checkout API');
forbid(api,/DELETE FROM cart_items WHERE cart_id=\$1::uuid["'`)]/,'whole-cart deletion in Checkout V2');
forbid(api,/VALUES\([^\n]*'pending'[^\n]*\$4,0,\$4/,'hard-coded zero delivery total');
need(boundary,'handleCartCheckoutV2Api','V2 commerce boundary');

for(const text of ['pasar_cart_selection_v2','data-cart-v2-item','data-cart-v2-store','data-cart-v2-all','Checkout (','setSelection([String(productId)])','css/cart-checkout-v2.css?v=1.0','js/profile-address-v2.js?v=1.0',"window.PasarP8Commerce=Object.freeze({version:'1.2'",'[data-cart-v2-checkout]',"const target='/checkout/index.html'","location[replace?'replace':'assign'](target)"])need(cart,text,'selective cart state / checkout ownership');
forbid(cart,/location\.pathname==='\/checkout\/'\s*\|\|\s*location\.pathname==='\/checkout'/,'legacy checkout pathname no-op');

for(const text of [
  "version === '1.2'",
  'commerce-cart-v2-toolbar',
  'data-cart-v2-item',
  'data-cart-v2-store',
  'data-cart-v2-all',
  'Pilih semua',
  'produk dipilih',
  'changeSelection',
  'prepareSelection',
  'sessionStorage.setItem(SELECTION_KEY',
  "css/cart-checkout-v2.css?v=1.1",
  "location.assign('/checkout/index.html')",
  "window.addEventListener('change'",
  "window.addEventListener('click'",
  'stopImmediatePropagation',
  'PasarCartCheckoutHotfix',
  "version: '1.2'"
])need(hotfix,text,'visible selective cart checkout owner');
forbid(hotfix,/location\.assign\(['"]\/checkout\/['"]\)/,'legacy directory checkout fallback');
forbid(hotfix,/\bfetch\s*\(/,'duplicate cart API ownership in selection UI');

for(const text of ['js/cart-checkout-hotfix-v1.js?v=1.2','loadCartCheckoutHotfix()',"window.PasarCartCheckoutHotfix?.version === '1.2'","window.PasarP8Commerce?.version === '1.2'","js/p8-commerce-integration.js?v=1.2"])need(p3,text,'cart selection/P8 loader');
for(const text of ['min-width:24px','min-height:52px',':focus-visible','commerce-cart-v2-store-check-wrap','touch-action:manipulation'])need(cartCss,text,'cart accessibility styling');

for(const text of ['/api/commerce/cart','/api/commerce/address-book','/api/commerce/fulfillment/stores/','/api/commerce/checkout/preferences','/api/commerce/checkout-v2','pasar_cart_selection_v2','navigator.geolocation','https://www.google.com/maps?q=','selected_product_ids','notes_by_store','sessionStorage.removeItem'])need(checkout,text,'Checkout V2 state flow');
forbid(checkout,/MutationObserver/,'MutationObserver checkout state engine');
forbid(checkout,/\/api\/commerce\/checkout['"`]/,'legacy all-cart checkout endpoint');
for(const text of ['data-p8-mode="checkout-v2"','/css/checkout-v2.css?v=1.0','/js/checkout-v2.js?v=1.0','checkoutV2Submit','noindex,nofollow'])need(checkoutHtml,text,'Checkout V2 document');
forbid(checkoutHtml,/p8-commerce-center\.js|p8-payment-profile\.js/,'legacy checkout controller');
for(const text of ['min-height:54px','position:fixed','accent-color:var(--c-primary)','@media(prefers-reduced-motion:reduce)'])need(checkoutCss,text,'Checkout V2 mobile UX');

for(const text of ['/api/commerce/address-book','navigator.geolocation','https://www.google.com/maps?q=','Simpan alamat utama','profileAddressV2'])need(profile,text,'profile address/location');
for(const text of ['delivery_latitude','delivery_longitude','delivery_landmark','https://www.google.com/maps?q=','Navigasi ke pembeli'])need(seller,text,'seller delivery navigation');

const budgets=[['src/cart-checkout-v2-api.js',api,26000],['js/p8-commerce-integration.js',cart,16000],['js/cart-checkout-hotfix-v1.js',hotfix,12000],['js/checkout-v2.js',checkout,26000],['js/profile-address-v2.js',profile,14000],['js/seller-center-order-p8.js',seller,14000],['css/checkout-v2.css',checkoutCss,18000],['css/cart-checkout-v2.css',cartCss,7500]];
for(const [path,source,max] of budgets){const bytes=Buffer.byteLength(source);if(bytes>max)throw new Error(`${path} too large: ${bytes}/${max}`)}

if(pkg.scripts?.['test:cart-checkout-v2']!=='node scripts/validate-cart-checkout-v2.mjs')throw new Error('package.json missing test:cart-checkout-v2');
if(!String(pkg.scripts?.validate||'').includes('npm run test:cart-checkout-v2'))throw new Error('canonical validate must include Cart Checkout V2');

console.log('Cart + Checkout V2 contract PASS: visible per-product/store/select-all controls, selected-only totals, deterministic selection persistence, exact Checkout V2 navigation, and server-authoritative selected-only order creation are intact.');
