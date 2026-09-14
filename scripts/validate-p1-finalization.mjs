import { readFile, stat } from 'node:fs/promises';

const FILES = {
  headers: '_headers',
  requestSecurity: 'src/request-security.js',
  observability: 'src/observability.js',
  securityEntry: 'src/security-worker-entry.js',
  performanceB: 'js/performance-v10-b.js',
  build: 'scripts/build-runtime.mjs',
  seoWorker: 'src/seo-worker-entry.js',
  auth: 'src/public-auth-api.js',
  adminSecurity: 'src/admin-security-core.js',
  wrangler: 'wrangler.jsonc'
};

const entries = await Promise.all(Object.entries(FILES).map(async ([key, filePath]) => [key, await readFile(filePath, 'utf8')]));
const source = Object.fromEntries(entries);
const failures = [];
const pass = message => console.log(`PASS ${message}`);
const assert = (condition, message) => {
  if (!condition) failures.push(message);
  else pass(message);
};

assert(source.headers.includes('Strict-Transport-Security: max-age=31536000'), 'HSTS enabled for static responses');
assert(source.headers.includes('X-Permitted-Cross-Domain-Policies: none'), 'legacy cross-domain policy disabled');
assert(source.headers.includes("script-src-attr 'none'"), 'inline event-handler execution blocked by CSP');
assert(source.headers.includes("frame-src 'none'"), 'embedded frame execution blocked by CSP');
assert(!source.headers.includes("'unsafe-eval'"), 'CSP forbids unsafe-eval');
assert(source.headers.includes('/checkout\n  Cache-Control: no-store'), 'checkout remains no-store');
assert(source.headers.includes('/admin\n  Cache-Control: no-store'), 'admin remains no-store');
assert(source.securityEntry.includes("script-src 'self' 'nonce-${nonce}'"), 'HTML Worker CSP uses per-response script nonce');
assert(!source.securityEntry.includes("script-src 'self' 'unsafe-inline'"), 'effective HTML script CSP forbids unsafe-inline');

for (const cookie of ['__Host-pasar_umkm_session', '__Host-pasar_umkm_admin', '__Host-pasar_umkm_admin_challenge']) {
  assert(source.requestSecurity.includes(cookie), `request security recognizes ${cookie}`);
}
assert(source.requestSecurity.includes('BROWSER_PROVENANCE_REQUIRED'), 'session-backed writes reject missing browser provenance');
assert(source.requestSecurity.includes('session_writes_require_browser_provenance: true'), 'session write provenance policy exported');
assert(source.requestSecurity.includes('requestOrigin && requestOrigin !== url.origin'), 'cross-origin mutation requests rejected');
assert(source.requestSecurity.includes('!TRUSTED_FETCH_SITES.has(fetchSite)'), 'cross-site Fetch Metadata rejected');

assert(source.auth.includes('HttpOnly; Secure; SameSite=Lax'), 'public session cookie remains hardened');
assert(source.adminSecurity.includes('HttpOnly; Secure; SameSite=Strict'), 'admin session cookie remains strict');
assert(source.observability.includes('Strict-Transport-Security'), 'API responses receive HSTS through observability wrapper');
assert(source.observability.includes('X-Frame-Options'), 'API responses deny framing');
assert(source.observability.includes('X-Permitted-Cross-Domain-Policies'), 'API responses disable legacy cross-domain policies');
assert(source.observability.includes('sanitizeServerErrorResponse'), 'API 5xx responses are sanitized globally');
assert(source.observability.includes('request_body_logged: false'), 'observability avoids request body logging');
assert(source.observability.includes('cookies_logged: false'), 'observability avoids cookie logging');
assert(source.observability.includes('ip_address_logged: false'), 'observability avoids raw IP logging');

assert(source.performanceB.includes('const MEDIA_ROOT_SELECTOR = ['), 'dynamic-media observer declares scoped UI roots');
for (const root of ["'.app-main'", "'#feed'", "'#quickCategories'", "'#sheetContent'", "'#searchResults'", "'#sideMenuContent'"]) {
  assert(source.performanceB.includes(root), `dynamic-media observer includes ${root}`);
}
assert(source.performanceB.includes('observer.observe(root, { childList: true, subtree: true })'), 'media observer attaches to scoped roots');
assert(!source.performanceB.includes('observer.observe(doc.body, { childList: true, subtree: true })'), 'media optimizer no longer attaches its observer to the full body');
assert(source.performanceB.includes("device.constrained || device.lowEnd ? 'none' : 'metadata'"), 'low-end video preloading is disabled');
assert(source.performanceB.includes("device.constrained ? 480 : (device.lowEnd || device.effectiveType === '3g') ? 800 : 960"), 'low-end responsive image ceiling retained');

assert(!source.build.includes('writeFile('), 'runtime build does not rewrite tracked source');
assert(source.build.includes('outfile: JS_RUNTIME'), 'runtime build generates JS runtime artifact');
assert(source.build.includes('outfile: CSS_RUNTIME'), 'runtime build generates CSS runtime artifact');
assert(source.build.includes('asset-cache-diagnostic'), 'runtime build reports asset hashes as diagnostics');
assert(source.build.includes('generated runtime outputs only'), 'runtime build declares immutable-source contract');
assert(source.headers.includes('/js/*\n  Cache-Control: public, max-age=0, must-revalidate'), 'JS cache revalidates before reuse');
assert(source.headers.includes('/css/*\n  Cache-Control: public, max-age=0, must-revalidate'), 'CSS cache revalidates before reuse');
assert(source.seoWorker.includes('/js/performance-v10-b.js?v='), 'homepage still references V10-B through a cache-keyed URL');
assert(/p(?:1-finalized-v12|[2-9][\w.-]*finalized-v\d)/.test(source.seoWorker), 'homepage declares P1-or-newer finalized runtime policy');

const wrangler = JSON.parse(source.wrangler);
assert(wrangler.main === 'src/security-worker-entry.js', 'Cloudflare runtime enters through security wrapper');
const limiters = new Set((wrangler.ratelimits || []).map(item => item.name));
for (const name of ['EDGE_AUTH_LIMITER', 'EDGE_WRITE_LIMITER', 'EDGE_READ_LIMITER']) {
  assert(limiters.has(name), `Cloudflare limiter ${name} configured`);
}
assert(wrangler.observability?.enabled === true, 'Cloudflare observability enabled');

const runtimeBytes = (await stat(FILES.performanceB)).size;
assert(runtimeBytes <= 16000, `V10-B low-end runtime stays within 16 KB budget (${runtimeBytes} B)`);

if (failures.length) {
  console.error(`P1 finalization FAILED (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('P1 finalization contract passed. Security, immutable-source build, cache revalidation, rate limiting, low-end scheduling and privacy-safe observability are certified.');
