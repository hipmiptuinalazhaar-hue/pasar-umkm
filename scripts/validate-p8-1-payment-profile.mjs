import fs from 'node:fs';

const fail=message=>{throw new Error(message)};
const read=path=>{if(!fs.existsSync(path))fail(`${path} missing`);return fs.readFileSync(path,'utf8')};
const need=(source,text,label)=>{if(!source.includes(text))fail(`Missing ${label}: ${text}`)};
const forbid=(source,pattern,label)=>{if(pattern.test(source))fail(`Forbidden ${label}`)};

const migration=read('database/migrations/2026-09-07-p8-1-structured-payment-profile.sql');
const api=read('src/commerce-fulfillment-api.js');
const upload=read('src/image-upload-api.js');
const worker=read('src/worker-entry.js');
const ui=read('js/p8-payment-profile.js');
const checkoutV2=read('js/checkout-v2.js');
const checkoutV2Api=read('src/cart-checkout-v2-api.js');
const css=read('css/p8-payment-profile.css');
const seller=read('seller-orders/index.html');
const checkout=read('checkout/index.html');
const purchases=read('purchases/index.html');
const nativeCommerce=read('js/commerce-experience-v2.js');
const integration=read('js/p8-commerce-integration.js');
const sellerBridge=read('js/seller-center-p8-bridge.js');
const sellerOrderBridge=read('js/seller-center-order-p8.js');
const sellerBridgeCss=read('css/seller-center-p8-bridge.css');
const p3=read('js/p3-premium-experience.js');
const pkg=JSON.parse(read('package.json'));

for(const text of ['transfer_provider_type','transfer_provider_name','transfer_account_number','transfer_account_name','qris_merchant_name','qris_image_url','qris_public_id','payment_provider_name','payment_account_number','payment_account_name','payment_qris_merchant_name','payment_qris_image_url','p81_apply_payment_profile_snapshot','zz_p81_orders_payment_profile_snapshot','2026-09-07-p8-1-structured-payment-profile'])need(migration,text,'P8.1 migration');
forbid(migration,/\bDROP\s+(TABLE|COLUMN)\b/i,'destructive P8.1 migration');forbid(migration,/\bTRUNCATE\b/i,'TRUNCATE P8.1 migration');
for(const text of ["PAYMENT_PROVIDER_TYPES = new Set(['bank','ewallet'])",'transfer_provider_name','transfer_account_number','transfer_account_name','qris_merchant_name','qris_image_url',"if (bankTransfer && (!providerType || !providerName || !accountNumber || !accountName))","if (qris && (!qrisMerchantName || !qrisImageUrl))",'CLOUDINARY_QRIS_PATTERN','settings: publicSettings'])need(api,text,'structured payment API');
for(const text of ['/api/uploads/qris-image','MAX_QRIS_BYTES = 3 * 1024 * 1024','pasar-umkm/qris/','merchant-qris'])need(upload,text,'QRIS upload');
for(const text of ['const P81_MIGRATION = "2026-09-07-p8-1-structured-payment-profile";','p8_1_applied: p81Applied','payment_profile_ready: p81Applied'])need(worker,text,'P8.1 health');
for(const text of ['resolveCheckoutCommerce','payment_method,payment_instructions','RETURNING *'])need(checkoutV2Api,text,'Checkout V2 authoritative payment snapshot');

const forbiddenCustody=/\b(refund_ledger|payment_gateway|wallet_balance|wallet_transactions|seller_wallet|user_wallet|escrow_account|settlement_account)\b/i;
for(const source of [api,ui,sellerBridge,checkoutV2Api])forbid(source,forbiddenCustody,'custodial payment primitive');
forbid(ui,/generate.{0,20}qris|qris.{0,20}from.{0,20}(account|rekening|ewallet)/i,'fake QRIS generation');
forbid(sellerBridge,/generate.{0,20}qris|qris.{0,20}from.{0,20}(account|rekening|ewallet)/i,'fake QRIS generation in Seller Center');

for(const text of ['Tempat pembayaran seller','transfer_provider_type','transfer_provider_name','transfer_account_number','qris_merchant_name','p81QrisFile','/api/uploads/qris-image','payment_account_number','payment_qris_image_url','data-copy-payment'])need(ui,text,'P8.1 payment profile UI');
for(const [name,html] of [['seller',seller],['purchases',purchases]]){need(html,'/css/p8-payment-profile.css?v=',`${name} P8.1 stylesheet`);need(html,'/js/p8-payment-profile.js?v=',`${name} P8.1 controller`)}
need(checkout,'data-p8-mode="checkout-v2"','Checkout V2 mode');
need(checkout,'/js/checkout-v2.js?v=1.0','Checkout V2 controller');
forbid(checkout,/p8-payment-profile\.js/,'legacy checkout payment observer');
for(const text of ['bank_transfer','merchant_qris','cod','pay_at_store','paymentOptions','/api/commerce/checkout/preferences'])need(checkoutV2,text,'Checkout V2 payment selection');

need(nativeCommerce,'aria-label="Menu Seller Center"','native Seller Center baseline');
for(const text of ['Pengiriman & Pembayaran','COD, ongkir, rekening, e-wallet, dan QRIS','/api/commerce/fulfillment/settings/me','/api/uploads/qris-image','transfer_provider_name','transfer_account_number','qris_merchant_name','merchant_qris_enabled','bank_transfer_enabled','Pasar UMKM tidak menahan dana'])need(sellerBridge,text,'native Seller Center payment bridge');
for(const text of ['/api/commerce/orders?scope=seller','/fulfillment','/timeline','Pembayaran'])need(sellerOrderBridge,text,'native Seller order bridge');
for(const text of ["window.PasarP8Commerce?.version==='1.3'","js/seller-center-p8-bridge.js?v=1.0","js/seller-center-order-p8.js?v=1.0",'[data-cart-v2-checkout]','[data-commerce-action="buy-now"]'])need(integration,text,'P8.1 integration');
need(p3,"window.PasarP8Commerce?.version === '1.3'",'P8.1 loader version');
need(p3,"js/p8-commerce-integration.js?v=1.3",'P8.1 lazy compatibility key');

const budgets=[['js/p8-payment-profile.js',ui,22000],['css/p8-payment-profile.css',css,9000],['js/seller-center-p8-bridge.js',sellerBridge,24000],['js/seller-center-order-p8.js',sellerOrderBridge,16000],['css/seller-center-p8-bridge.css',sellerBridgeCss,12000],['src/image-upload-api.js',upload,9000],['src/commerce-fulfillment-api.js',api,30000],['js/checkout-v2.js',checkoutV2,26000],['src/cart-checkout-v2-api.js',checkoutV2Api,26000]];
for(const [path,source,max] of budgets){const bytes=Buffer.byteLength(source);if(bytes>max)fail(`${path} too large: ${bytes}/${max}`)}
if(pkg.scripts?.['test:p8-1-payments']!=='node scripts/validate-p8-1-payment-profile.mjs')fail('package.json missing test:p8-1-payments');
if(!String(pkg.scripts?.validate||'').includes('npm run test:p8-1-payments'))fail('canonical validate must include P8.1');
console.log('P8.1 payment profile contract PASS: seller-managed direct payment destinations, official QRIS upload, authoritative Checkout V2 snapshots, and non-custodial boundaries are intact.');
