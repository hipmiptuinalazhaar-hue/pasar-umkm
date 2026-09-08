import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = Object.freeze({
  migration: 'database/migrations/2026-09-09-customer-support-v1.sql',
  store: 'src/support-store.js',
  api: 'src/support-api.js',
  adminApi: 'src/admin-support-api.js',
  worker: 'src/worker-entry.js',
  userHtml: 'support/index.html',
  userJs: 'js/support-center-v1.js',
  userCss: 'css/support-center-v1.css',
  adminClient: 'js/admin/api.js',
  adminControl: 'js/admin/control.js',
  adminJs: 'js/admin/support.js',
  adminCss: 'css/admin-support-v1.css',
  complaints: 'legal/pengaduan.html',
  about: 'js/about-experience-v2.js',
  index: 'index.html',
  package: 'package.json',
  smoke: 'scripts/post-deploy-smoke.mjs'
});

const data = {};
const errors = [];
const fail = message => errors.push(message);
const must = (condition, message) => { if (!condition) fail(message); };

for (const [key, relative] of Object.entries(files)) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    fail(`missing ${relative}`);
    data[key] = '';
    continue;
  }
  data[key] = fs.readFileSync(absolute, 'utf8');
}

function has(key, token, message = `${files[key]} missing ${token}`) {
  must(data[key].includes(token), message);
}
function budget(key, limit) {
  const size = Buffer.byteLength(data[key]);
  must(size <= limit, `${files[key]} ${size}B exceeds ${limit}B budget`);
}

// Data model + explicit RBAC. No mutation of existing marketplace commerce tables.
for (const token of ['support_tickets','support_messages','support_internal_notes','support_ticket_events']) has('migration', token);
for (const token of ["'support.view'", "'support.reply'", "'support.manage'", "'super_admin'", "'support'"]) has('migration', token);
has('migration', "'2026-09-09-customer-support-v1'");
must(!/ALTER\s+TABLE\s+(?:orders|users|stores|products|direct_messages|direct_conversations)/i.test(data.migration), 'support migration must remain additive to existing marketplace tables');

// Public support API boundaries.
for (const token of [
  '/api/support/summary','/api/support/tickets','AUTH_REQUIRED','ORIGIN_REJECTED',
  'ORDER_NOT_OWNED','ACTIVE_TICKET_LIMIT','SUPPORT_RATE_LIMITED','SUPPORT_TICKET_CLOSED',
  'ensureSupportInfrastructure','Cache-Control','no-store'
]) has('api', token);
has('api', 'o.buyer_id = ${userId} OR s.owner_id = ${userId}', 'order context must be limited to buyer or seller owner');
must(!data.api.includes('support_internal_notes'), 'public support API must never reference internal admin notes');
must(!/UPDATE\s+(orders|products|stores)|INSERT\s+INTO\s+(payments|wallets)|DELETE\s+FROM\s+(orders|products)/i.test(data.api), 'public support API must not mutate commerce or money state');

// Admin support requires explicit permissions and audit logging.
for (const permission of ['support.view','support.reply','support.manage']) has('adminApi', permission);
for (const token of ['admin_audit_logs','support.reply','support.manage','support.note','support_internal_notes']) has('adminApi', token);
must(!/UPDATE\s+(orders|products|stores)|DELETE\s+FROM\s+(orders|products)|INSERT\s+INTO\s+(payments|wallets)/i.test(data.adminApi), 'admin support API must not mutate commerce or money state');

// Runtime owns the support endpoints and exposes a fail-closed health contract.
for (const token of [
  'handleSupportApi','handleAdminSupportApi','SUPPORT_MIGRATION','support_applied','support_ready','missing_support_count'
]) has('worker', token);
has('worker', '2026-09-09-customer-support-v1');

// User-facing support experience.
for (const token of ['Customer Service','noindex,nofollow,noarchive','support-center-v1.css','support-center-v1.js']) has('userHtml', token);
for (const token of [
  'Mulai chat dengan CS','Customer Service Pasar UMKM','password','OTP','/api/support/tickets',
  'data-new-ticket','data-close-ticket','waiting_support','waiting_user'
]) has('userJs', token);
must(!/Super\s*Admin/i.test(data.userHtml + data.userJs), 'user-facing support UI must never expose the internal Super Admin label');
must(!/gradient\s*\(|backdrop-filter/i.test(data.userCss), 'support user CSS must avoid gradient/backdrop-filter effects');

// Admin inbox and permission-gated route.
has('adminControl', 'label: "Customer Support"');
has('adminControl', 'permission: "support.view"');
has('adminControl', './support.js?v=1.0.0');
for (const token of ['supportTickets','supportTicket','supportReply','supportUpdate','supportNote']) has('adminClient', token);
for (const token of ['Customer Support','Antrean tiket','Catatan internal','support.reply','support.manage']) has('adminJs', token);
must(!/gradient\s*\(|backdrop-filter/i.test(data.adminCss), 'support admin CSS must avoid gradient/backdrop-filter effects');

// Discovery + legal support path, without touching critical first-paint index ownership.
has('complaints', '/support/');
has('complaints', 'Chat Customer Service');
has('about', '/support/');
has('about', 'Customer Service Pasar UMKM');
must(!/support-center-v1\.js|admin\/support\.js|src\/support-api\.js/.test(data.index), 'support must not add a direct initial script owner to index.html');
const initialScripts = [...data.index.matchAll(/<script\s+src=/g)].length;
must(initialScripts === 5, `index.html initial external script count changed: ${initialScripts}, expected 5`);

// Canonical release verification includes support checks.
has('package', 'test:customer-support');
has('package', 'validate-customer-support-v1.mjs');
has('smoke', 'support shell');
has('smoke', 'support auth boundary');
has('smoke', 'admin support auth boundary');
has('smoke', 'support_ready');

// Keep the feature bounded enough to remain maintainable on the current zero-capital stack.
budget('migration', 14000);
budget('store', 7000);
budget('api', 26000);
budget('adminApi', 26000);
budget('userHtml', 5000);
budget('userJs', 24000);
budget('userCss', 18000);
budget('adminJs', 20000);
budget('adminCss', 18000);

for (const [key, text] of Object.entries(data)) {
  must(!/(TODO|TBD|LOREM|PLACEHOLDER)/i.test(text), `${files[key]} contains placeholder content`);
}

if (errors.length) {
  console.error('\nCustomer Support V1 validation failed:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log('Customer Support V1 validation passed');
console.log(' - private user-to-platform ticket channel');
console.log(' - explicit support RBAC + admin audit trail');
console.log(' - order ownership and same-origin write boundaries');
console.log(' - admin inbox, replies, assignment, priority, notes');
console.log(' - no commerce/money mutation capability');
console.log(' - no first-paint index ownership added');
console.log(' - production smoke contract includes support');
