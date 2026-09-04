import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const controlApi = read('src/admin-control-api.js');
const worker = read('src/worker-entry.js');
const rateLimit = read('src/rate-limit.js');
const migration = read('database/migrations/2026-09-05-admin-control-center-indexes.sql');
const html = read('admin/index.html');
const css = read('css/admin-control.css');
const app = read('js/admin/app.js');
const api = read('js/admin/api.js');
const control = read('js/admin/control.js');
const overview = read('js/admin/overview.js');
const records = read('js/admin/records.js');
const headers = read('_headers');

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message);
}

function requireAbsent(text, pattern, message) {
  if (pattern.test(text)) throw new Error(message);
}

function requireUnder(path, maxBytes) {
  const bytes = fs.statSync(path).size;
  if (bytes > maxBytes) throw new Error(`${path} exceeds budget: ${bytes} > ${maxBytes} bytes`);
}

for (const endpoint of [
  '/api/admin/control/overview',
  '/api/admin/control/users',
  '/api/admin/control/stores',
  '/api/admin/control/products',
  '/api/admin/control/posts',
  '/api/admin/control/orders',
  '/api/admin/control/reviews',
  '/api/admin/control/audit',
  '/api/admin/control/admins'
]) {
  requireMatch(controlApi, new RegExp(endpoint.replaceAll('/', '\\/')), `Missing control center endpoint: ${endpoint}`);
}

for (const permission of [
  'dashboard.view', 'users.view', 'stores.view', 'products.view', 'posts.view',
  'orders.view', 'reviews.view', 'audit_logs.view', 'admin_accounts.view',
  'users.suspend', 'users.reactivate',
  'stores.verify', 'stores.suspend', 'stores.reactivate',
  'products.suspend', 'products.restore',
  'posts.suspend', 'posts.restore'
]) {
  requireMatch(controlApi, new RegExp(`['\"]${permission.replace('.', '\\.')}['\"]`), `Missing server permission contract: ${permission}`);
}

requireAbsent(controlApi, /\bOFFSET\b/i, 'Admin lists must use keyset pagination, never OFFSET pagination.');
requireMatch(controlApi, /created_at[\s\S]*?id[\s\S]*?<\s*\(/i, 'Admin lists must enforce created_at/id keyset cursor comparisons.');
requireMatch(controlApi, /MAX_LIMIT\s*=\s*50/, 'Admin list page size must have a hard maximum.');
requireMatch(controlApi, /DELETE\s+FROM\s+sessions[\s\S]*?user_id/i, 'Suspending a public user must revoke active public sessions.');
requireMatch(controlApi, /INSERT\s+INTO\s+admin_audit_logs/i, 'Privileged control mutations must write audit logs.');
requireMatch(controlApi, /MIN_REASON\s*=\s*8[\s\S]*?MAX_REASON\s*=\s*300/i, 'Privileged mutations must require bounded reasons.');
requireMatch(controlApi, /sameOrigin\(request\)/, 'State-changing control requests must enforce same-origin policy.');
requireMatch(controlApi, /to_regclass\('public\.moderation_reports'\)/, 'Overview must expose report-source availability instead of inventing report data.');
requireAbsent(controlApi, /customer_phone|delivery_address|password_hash/i, 'Control list APIs must not expose unnecessary sensitive fields.');

const controlIndex = worker.indexOf('handleAdminControlApi');
const bootstrapIndex = worker.indexOf('ensureNotificationInfrastructure(env)');
if (controlIndex < 0 || bootstrapIndex < 0 || controlIndex > bootstrapIndex) {
  throw new Error('Admin Control Center must execute before unrelated public feature bootstrap.');
}

requireMatch(rateLimit, /name:\s*['\"]admin-control-read['\"][\s\S]*?limit:\s*180[\s\S]*?includeAdminSession:\s*true/i, 'Missing session-aware admin control read rate limit.');
requireMatch(rateLimit, /name:\s*['\"]admin-control-write['\"][\s\S]*?limit:\s*30[\s\S]*?includeAdminSession:\s*true/i, 'Missing session-aware admin control write rate limit.');

for (const indexName of [
  'idx_users_created_id', 'idx_stores_created_id', 'idx_products_created_id',
  'idx_posts_created_id', 'idx_orders_created_id', 'idx_store_ratings_created_id',
  'idx_product_ratings_created_id', 'idx_admin_audit_logs_created_id',
  'idx_admin_accounts_created_id'
]) {
  requireMatch(migration, new RegExp(indexName), `Missing keyset index: ${indexName}`);
}
requireMatch(migration, /2026-09-05-admin-control-center-indexes/, 'Control Center migration version must be recorded.');

requireAbsent(html, /<style\b/i, 'Admin document must not use inline style blocks.');
requireAbsent(html, /<script(?![^>]*\bsrc=)[^>]*>/i, 'Admin document must not use inline script blocks.');
requireMatch(html, /<meta\s+name=['\"]robots['\"][^>]*noindex/i, 'Internal admin page must be noindex.');
requireMatch(html, /actionDialog/i, 'Quick privileged actions must use an explicit confirmation dialog.');

requireMatch(app, /import\(\s*['\"]\.\/control\.js\?v=5\.0\.0['\"]\s*\)/, 'Control Center code must lazy-load only after authenticated intent.');
requireMatch(control, /import\(\s*['\"]\.\/overview\.js\?v=5\.0\.0['\"]\s*\)/, 'Overview must be route-lazy-loaded.');
requireMatch(control, /import\(\s*['\"]\.\/records\.js\?v=5\.0\.0['\"]\s*\)/, 'Record views must be route-lazy-loaded.');
requireAbsent(control, /key:\s*['\"]reports['\"]/i, 'Reports navigation must not exist without a real reports data source.');
requireMatch(control, /permissionSet\.has|permissions\.map/i, 'Navigation must derive from server capabilities.');
requireAbsent(`${app}\n${control}\n${overview}\n${records}`, /Math\.random\(|mockData|fakeStat|dummyData/i, 'Admin UI must not contain fake/mock production data.');
requireMatch(overview, /adminApi\.control\(['\"]overview['\"]/, 'Overview metrics must come from the real control API.');

requireMatch(css, /button,\s*\n?a[\s\S]*?min-height:\s*44px/i, 'Touch targets must preserve the 44px minimum.');
requireMatch(css, /\.field-input[\s\S]*?font-size:\s*16px/i, 'Mobile inputs must stay at least 16px.');
for (const breakpoint of ['600px', '900px', '1240px']) {
  requireMatch(css, new RegExp(`@media \\(min-width: ${breakpoint.replace('.', '\\.')}\\)`), `Missing progressive responsive breakpoint ${breakpoint}`);
}
requireMatch(css, /\.action-dialog[\s\S]*?margin:\s*auto\s+0\s+0/i, 'Mobile quick-action confirmation should render as a bottom sheet.');
requireMatch(css, /@media\s*\(min-width:\s*900px\)[\s\S]*?\.action-dialog[\s\S]*?margin:\s*auto/i, 'Desktop confirmation must promote to centered dialog.');

requireMatch(headers, /\/admin\/\*[\s\S]*?Cache-Control:\s*no-store/i, 'Admin HTML must never be cached.');
requireMatch(headers, /Content-Security-Policy:[^\n]*default-src 'self'/i, 'Admin static surface must ship a restrictive CSP.');
requireMatch(headers, /frame-ancestors 'none'/i, 'Admin CSP must block framing.');

requireUnder('admin/index.html', 16_000);
requireUnder('css/admin-control.css', 36_000);
requireUnder('src/admin-control-api.js', 52_000);
const totalAdminJs = ['js/admin/api.js','js/admin/app.js','js/admin/control.js','js/admin/overview.js','js/admin/records.js']
  .reduce((sum, path) => sum + fs.statSync(path).size, 0);
if (totalAdminJs > 90_000) throw new Error(`Admin JS source budget exceeded: ${totalAdminJs} > 90000 bytes`);

console.log('Admin Control Center validation passed.');
console.log(`Admin JS source bytes: ${totalAdminJs}`);
console.log('Validated: real-data UI, RBAC, keyset pagination, audited mutations, privacy minimization, CSP, mobile-first accessibility, lazy loading.');
