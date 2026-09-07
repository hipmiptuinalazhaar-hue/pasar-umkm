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
forbid(api,/\b(escrow|settlement|refund_ledger|payment_gateway|wallet_balance|wallet_transactions|seller_wallet|user_wallet)\b/i,'custodial primitive in P8.1 API');

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
])requireText(ui,text,'P8.1 UI contract');
forbid(ui,/generate.{0,20}qris|qris.{0,20}from.{0,20}(account|rekening|ewallet)/i,'fake QRIS generation from account number');
forbid(ui,/\b(escrow|settlement|refund_ledger|wallet_balance|wallet_transactions|seller_wallet|user_wallet)\b/i,'custodial UI primitive');

for(const [name,html] of [['seller',seller],['checkout',checkout],['purchases',purchases]]){
  requireText(html,'/css/p8-payment-profile.css?v=1.0',`${name} P8.1 stylesheet`);
  requireText(html,'/js/p8-payment-profile.js?v=1.0',`${name} P8.1 controller`);
}
if(home.includes('p8-payment-profile.js')||home.includes('p8-payment-profile.css'))fail('P8.1 assets must not join critical homepage shell');

const budgets=[
  ['js/p8-payment-profile.js',ui,22000],
  ['css/p8-payment-profile.css',css,9000],
  ['src/image-upload-api.js',upload,9000],
  ['src/commerce-fulfillment-api.js',api,30000]
];
for(const [path,source,max] of budgets){const bytes=Buffer.byteLength(source);if(bytes>max)fail(`${path} too large: ${bytes}/${max}`)}

if(pkg.scripts?.['test:p8-1-payments']!=='node scripts/validate-p8-1-payment-profile.mjs')fail('package.json missing test:p8-1-payments');
if(!String(pkg.scripts?.validate||'').includes('npm run test:p8-1-payments'))fail('canonical validate must include P8.1');

console.log('P8.1 structured bank/e-wallet profile, official merchant QRIS upload, private order snapshot, non-custodial and deferred UI contracts OK.');
