import fs from 'node:fs';

const fail=message=>{throw new Error(message)};
const read=path=>{if(!fs.existsSync(path))fail(`${path} missing`);return fs.readFileSync(path,'utf8')};
const requireText=(source,text,label)=>{if(!source.includes(text))fail(`Missing ${label}: ${text}`)};
const forbid=(source,pattern,label)=>{if(pattern.test(source))fail(`Forbidden ${label}`)};

const migration=read('database/migrations/2026-09-07-p8-1-structured-payment-profile.sql');
const api=read('src/commerce-fulfillment-api.js');
const upload=read('src/image-upload-api.js');
const worker=read('src/worker-entry.js');
const ui=read('js/p8-payment-profile.js');
const css=read('css/p8-payment-profile.css');
const seller=read('seller-orders/index.html');
const checkout=read('checkout/index.html');
const purchases=read('purchases/index.html');
const home=read('index.html');
const nativeCommerce=read('js/commerce-experience-v2.js');
const integration=read('js/p8-commerce-integration.js');
const sellerBridge=read('js/seller-center-p8-bridge.js');
const sellerOrderBridge=read('js/seller-center-order-p8.js');
const sellerBridgeCss=read('css/seller-center-p8-bridge.css');
const p3=read('js/p3-premium-experience.js');
const pkg=JSON.parse(read('package.json'));

for(const text of [
  'transfer_provider_type','transfer_provider_name','transfer_account_number','transfer_account_name',
  'qris_merchant_name','qris_image_url','qris_public_id','payment_provider_name','payment_account_number',
  'payment_account_name','payment_qris_merchant_name','payment_qris_image_url',
  'p81_apply_payment_profile_snapshot','zz_p81_orders_payment_profile_snapshot',
  '2026-09-07-p8-1-structured-payment-profile'
])requireText(migration,text,'P8.1 migration');
forbid(migration,/\bDROP\s+TABLE\b/i,'DROP TABLE in P8.1 migration');
forbid(migration,/\bDROP\s+COLUMN\b/i,'DROP COLUMN in P8.1 migration');
forbid(migration,/\bTRUNCATE\b/i,'TRUNCATE in P8.1 migration');
forbid(migration,/DELETE\s+FROM\s+(orders|order_items|users|stores|products|store_commerce_settings)\b/i,'business-data deletion in P8.1 migration');

for(const text of [
  "PAYMENT_PROVIDER_TYPES = new Set(['bank','ewallet'])",
  'transfer_provider_name','transfer_account_number','transfer_account_name','qris_merchant_name','qris_image_url',
  "if (bankTransfer && (!providerType || !providerName || !accountNumber || !accountName))",
  "if (qris && (!qrisMerchantName || !qrisImageUrl))",
  'CLOUDINARY_QRIS_PATTERN','QRIS harus berasal dari unggahan merchant Pasar UMKM.',
  'bank_transfer_instructions: _bankTransferInstructions','qris_instructions: _qrisInstructions','settings: publicSettings'
])requireText(api,text,'structured payment API contract');
forbid(api,/\b(refund_ledger|payment_gateway|wallet_balance|wallet_transactions|seller_wallet|user_wallet|escrow_account|settlement_account)\b/i,'custodial primitive in P8.1 API');
forbid(api,/\/api\/(?:wallet|escrow|settlement)(?:\/|['"`])/i,'custodial API route in P8.1 API');

for(const text of [
  '/api/uploads/qris-image','MAX_QRIS_BYTES = 3 * 1024 * 1024','pasar-umkm/qris/',
  'merchant-qris','overwrite", kind === "qris" ? "true" : "false"','sellerStore(sql, request)'
])requireText(upload,text,'QRIS upload contract');
forbid(upload,/image\/upload[\s\S]*apiSecret[^\n]*return json\(/i,'secret disclosure');

for(const text of [
  'const P81_MIGRATION = "2026-09-07-p8-1-structured-payment-profile";',
  'p8_1_applied: p81Applied','payment_profile_ready: p81Applied',
  'transfer_provider_type','payment_qris_image_url'
])requireText(worker,text,'P8.1 health attestation');

for(const text of [
  'Tempat pembayaran seller','transfer_provider_type','transfer_provider_name','transfer_account_number','transfer_account_name',
  'qris_merchant_name','p81QrisFile','/api/uploads/qris-image','/api/commerce/fulfillment/settings/me',
  'Transfer rekening / e-wallet','QRIS merchant','payment_account_number','payment_qris_image_url',
  'data-copy-payment','Pasar UMKM hanya menampilkan tujuan pembayaran seller. Platform tidak membuat QRIS'
])requireText(ui,text,'P8.1 standalone fallback UI contract');
forbid(ui,/generate.{0,20}qris|qris.{0,20}from.{0,20}(account|rekening|ewallet)/i,'fake QRIS generation from account number');
forbid(ui,/\b(refund_ledger|wallet_balance|wallet_transactions|seller_wallet|user_wallet|escrow_account|settlement_account)\b/i,'custodial UI primitive');
forbid(ui,/\/api\/(?:wallet|escrow|settlement)(?:\/|['"`])/i,'custodial UI route');

for(const [name,html] of [['seller',seller],['checkout',checkout],['purchases',purchases]]){
  requireText(html,'/css/p8-payment-profile.css?v=',`${name} P8.1 stylesheet`);
  requireText(html,'/js/p8-payment-profile.js?v=',`${name} P8.1 controller`);
}
if(home.includes('p8-payment-profile.js')||home.includes('p8-payment-profile.css'))fail('P8.1 assets must not join critical homepage shell');

// Native Seller Center is now the canonical seller surface.
for(const text of [
  'aria-label="Menu Seller Center"',
  "sellerMenuRow('receipt', 'Pesanan Masuk'",
  "sellerMenuRow('package', 'Produk Saya'",
  "sellerMenuRow('storefront', 'Profil Toko'",
  "case 'seller-orders': return renderOrdersPage('seller')"
])requireText(nativeCommerce,text,'native Seller Center baseline');

for(const text of [
  '.commerce-menu-list[aria-label="Menu Seller Center"]',
  'Pengiriman & Pembayaran','COD, ongkir, rekening, e-wallet, dan QRIS',
  '/api/commerce/fulfillment/settings/me','/api/uploads/qris-image',
  'transfer_provider_type','transfer_provider_name','transfer_account_number','transfer_account_name',
  'qris_merchant_name','sellerP8QrisFile','merchant_qris_enabled','bank_transfer_enabled',
  'Pasar UMKM tidak menahan dana','window.PasarCommerce?.openSellerCenter?.()'
])requireText(sellerBridge,text,'native Seller Center payment bridge');
forbid(sellerBridge,/generate.{0,20}qris|qris.{0,20}from.{0,20}(account|rekening|ewallet)/i,'fake QRIS generation in native Seller Center');
forbid(sellerBridge,/\b(refund_ledger|wallet_balance|wallet_transactions|seller_wallet|user_wallet|escrow_account|settlement_account)\b/i,'custodial native Seller Center primitive');
forbid(sellerBridge,/\/api\/(?:wallet|escrow|settlement)(?:\/|['"`])/i,'custodial native Seller Center route');

for(const text of [
  '.commerce-order-card[data-order-scope="seller"]','/api/commerce/orders?scope=seller',
  '/fulfillment','/timeline','Pengiriman & Pembayaran','Status pengiriman','Pembayaran',
  'ready_for_pickup','in_transit'
])requireText(sellerOrderBridge,text,'native Seller Center order bridge');
forbid(sellerOrderBridge,/\/api\/(?:wallet|escrow|settlement)(?:\/|['"`])/i,'custodial seller order route');

for(const text of [
  "window.PasarP8Commerce?.version==='1.1'",
  "js/seller-center-p8-bridge.js?v=1.0",
  "js/seller-center-order-p8.js?v=1.0",
  "host.querySelector('[data-p8-seller-orders-link]')?.remove()"
])requireText(integration,text,'Seller Center P8 integration loader');
forbid(integration,/sideLink\(['"]\/seller-orders\//,'standalone Seller Order Center side-menu link');
requireText(p3,"window.PasarP8Commerce?.version === '1.1'",'P8.1 cache-busted loader version');
requireText(p3,"js/p8-commerce-integration.js?v=1.1",'P8.1 cache-busted integration asset');

const budgets=[
  ['js/p8-payment-profile.js',ui,22000],
  ['css/p8-payment-profile.css',css,9000],
  ['js/seller-center-p8-bridge.js',sellerBridge,24000],
  ['js/seller-center-order-p8.js',sellerOrderBridge,16000],
  ['css/seller-center-p8-bridge.css',sellerBridgeCss,12000],
  ['src/image-upload-api.js',upload,9000],
  ['src/commerce-fulfillment-api.js',api,30000]
];
for(const [path,source,max] of budgets){const bytes=Buffer.byteLength(source);if(bytes>max)fail(`${path} too large: ${bytes}/${max}`)}

if(pkg.scripts?.['test:p8-1-payments']!=='node scripts/validate-p8-1-payment-profile.mjs')fail('package.json missing test:p8-1-payments');
if(!String(pkg.scripts?.validate||'').includes('npm run test:p8-1-payments'))fail('canonical validate must include P8.1');

console.log('P8.1 payment profile and fulfillment are unified into the native Seller Center; structured bank/e-wallet, official QRIS upload, private order snapshots, and non-custodial boundaries OK.');
