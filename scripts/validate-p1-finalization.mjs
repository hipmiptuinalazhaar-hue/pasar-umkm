import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';

const FILES = {
  headers: '_headers',
  requestSecurity: 'src/request-security.js',
  observability: 'src/observability.js',
  performanceB: 'js/performance-v10-b.js',
  build: 'scripts/build-runtime.mjs',
  seoWorker: 'src/seo-worker-entry.js',
  auth: 'src/public-auth-api.js',
  adminSecurity: 'src/admin-security-core.js',
  wrangler: 'wrangler.jsonc'
};

const entries = await Promise.all(Object.entries(FILES).map(async ([key, path]) => [key, await readFile(path, 'utf8')]));
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
assert(source.observability.includes('request_body_logged: false'), 'observability avoids request body logging');
assert(source.observability.includes('cookies_logged: false'), 'observability avoids cookie logging');
assert(source.observability.includes('ip_address_logged: false'), 'observability avoids raw IP logging');

assert(source.performanceB.includes("const MEDIA_ROOT_SELECTORS = ['#feed', '#searchResults', '#sheetContent', '#sideMenu', '.app']"), 'dynamic-media observer is scoped to known UI roots');
assert(!source.performanceB.includes('observer.observe(doc.body, { childList: true, subtree: true })'), 'body-wide media observer removed');
assert(source.performanceB.includes("device.constrained || device.lowEnd ? 'none' : 'metadata'"), 'low-end video preloading is disabled');
assert(source.performanceB.includes('device.constrained ? 480 : (device.lowEnd || device.effectiveType === \'3g\') ? 800 : 960'), 'low-end responsive image ceiling retained');

assert(source.build.includes('const SEO_WORKER = "src/seo-worker-entry.js"'), 'runtime build owns worker cache graph');
assert(source.build.includes('stampWorkerEagerGraph'), 'runtime build synchronizes eager worker assets');
assert(source.build.includes('WORKER_EAGER_ASSETS = ["js/performance-v10-b.js"]'), 'eager recommendation runtime participates in fingerprint graph');

const v10bHash = createHash('sha256').update(await readFile(FILES.performanceB)).digest('hex').slice(0, 12);
assert(source.seoWorker.includes(`/js/performance-v10-b.js?v=${v10bHash}`), `worker V10-B fingerprint matches source (${v10bHash})`);
assert(source.seoWorker.includes('p1-finalized-v12'), 'homepage declares finalized P1 runtime policy');

const wrangler = JSON.parse(source.wrangler);
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

console.log(`P1 finalization contract passed. Security, session provenance, low-end media scheduling, cache fingerprint integrity, rate limiting, and privacy-safe observability are certified.`);
