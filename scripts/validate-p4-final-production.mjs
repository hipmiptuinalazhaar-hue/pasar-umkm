const BASE_URL = (process.env.PRODUCTION_BASE_URL || 'https://pasar-umkm.hipmiptuinalazhaar.workers.dev').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.P4_TIMEOUT_MS || 20000);

const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(pathOrUrl, options = {}) {
  const target = pathOrUrl.startsWith('http') ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(target, {
      redirect: 'follow',
      signal: controller.signal,
      ...options,
      headers: {
        Accept: 'text/html,application/json,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'pasar-umkm-p4-final-certification/1.0',
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { response, text, json };
  } finally {
    clearTimeout(timer);
  }
}

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    console.log(`P4 FINAL PASS: ${name}${detail ? ` :: ${detail}` : ''}`);
  } catch (error) {
    results.push({ name, ok: false, error: error?.message || String(error) });
    console.error(`P4 FINAL FAIL: ${name} :: ${error?.message || error}`);
  }
}

function canonicalFrom(html) {
  return html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1] || '';
}

function firstLoc(xml) {
  return xml.match(/<loc>([^<]+)<\/loc>/i)?.[1]?.replace(/&amp;/g, '&') || '';
}

await check('homepage production shell', async () => {
  const { response, text } = await request('/');
  assert(response.status === 200, `HTTP ${response.status}`);
  assert((text.match(/<title>/gi) || []).length === 1, 'homepage must contain exactly one title');
  assert(text.includes('<title>Pasar UMKM Lubuklinggau | Produk &amp; Usaha Lokal</title>') || text.includes('<title>Pasar UMKM Lubuklinggau | Produk & Usaha Lokal</title>'), 'final homepage title missing');
  assert(canonicalFrom(text) === `${BASE_URL}/`, 'homepage canonical mismatch');
  assert(text.includes('p3-seo-finalized-v14.3'), 'final SEO runtime policy missing');
  assert(text.includes('data-seo-directory="p3"'), 'crawlable homepage discovery content missing');
  const csp = response.headers.get('content-security-policy') || '';
  assert(csp.includes("object-src 'none'"), 'public CSP missing object-src none');
  assert(!csp.includes("'unsafe-eval'"), 'public CSP permits unsafe-eval');
  assert((response.headers.get('x-content-type-options') || '').toLowerCase() === 'nosniff', 'nosniff missing');
  return 'SEO + CSP + crawl shell';
});

await check('robots production contract', async () => {
  const { response, text } = await request('/robots.txt');
  assert(response.status === 200, `HTTP ${response.status}`);
  assert(text.includes(`Sitemap: ${BASE_URL}/sitemap.xml`), 'robots sitemap pointer missing');
  assert(text.includes('Disallow: /api/'), 'API disallow missing');
  assert(text.includes('Disallow: /admin/'), 'admin disallow missing');
  return 'crawler boundaries';
});

let storeShard = '';
let productShard = '';
await check('sitemap index production contract', async () => {
  const { response, text } = await request('/sitemap.xml');
  assert(response.status === 200, `HTTP ${response.status}`);
  assert(text.includes('<sitemapindex'), 'sitemap index root missing');
  assert(text.includes(`${BASE_URL}/sitemap-static.xml`), 'static sitemap missing');
  storeShard = text.match(new RegExp(`${BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/sitemap-stores-\\d+\\.xml`))?.[0] || '';
  productShard = text.match(new RegExp(`${BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/sitemap-products-\\d+\\.xml`))?.[0] || '';
  assert(storeShard, 'store sitemap shard missing');
  assert(productShard, 'product sitemap shard missing');
  return 'static + store + product shards';
});

let firstStoreUrl = '';
await check('store sitemap shard', async () => {
  const { response, text } = await request(storeShard);
  assert(response.status === 200, `HTTP ${response.status}`);
  assert(text.includes('<urlset'), 'store shard is not urlset');
  firstStoreUrl = firstLoc(text);
  assert(firstStoreUrl.startsWith(`${BASE_URL}/umkm/`), 'no public store URL found');
  return firstStoreUrl;
});

let firstProductUrl = '';
await check('product sitemap shard', async () => {
  const { response, text } = await request(productShard);
  assert(response.status === 200, `HTTP ${response.status}`);
  assert(text.includes('<urlset'), 'product shard is not urlset');
  firstProductUrl = firstLoc(text);
  assert(firstProductUrl.startsWith(`${BASE_URL}/produk/`), 'no public product URL found');
  return firstProductUrl;
});

await check('directory production page', async () => {
  const { response, text } = await request('/jelajahi/');
  assert(response.status === 200, `HTTP ${response.status}`);
  assert(canonicalFrom(text) === `${BASE_URL}/jelajahi/`, 'directory canonical mismatch');
  assert(text.includes('"@type":"CollectionPage"') || text.includes('"@type": "CollectionPage"'), 'CollectionPage schema missing');
  assert(text.includes('"@type":"ItemList"') || text.includes('"@type": "ItemList"'), 'ItemList schema missing');
  assert(/Cara menggunakan direktori Pasar UMKM/i.test(text), 'directory crawl guidance missing');
  return 'canonical + CollectionPage + ItemList';
});

await check('dynamic store production page', async () => {
  const { response, text } = await request(firstStoreUrl);
  assert(response.status === 200, `HTTP ${response.status}`);
  assert(canonicalFrom(text) === firstStoreUrl, 'store canonical mismatch');
  assert(text.includes('"@type":"LocalBusiness"') || text.includes('"@type": "LocalBusiness"'), 'LocalBusiness schema missing');
  assert(text.includes('"@type":"BreadcrumbList"') || text.includes('"@type": "BreadcrumbList"'), 'store breadcrumbs missing');
  assert(/Tentang UMKM|Informasi UMKM/i.test(text), 'store explanatory section missing');
  return 'LocalBusiness + breadcrumb + content';
});

await check('dynamic product production page', async () => {
  const { response, text } = await request(firstProductUrl);
  assert(response.status === 200, `HTTP ${response.status}`);
  assert(canonicalFrom(text) === firstProductUrl, 'product canonical mismatch');
  assert(text.includes('"@type":"Product"') || text.includes('"@type": "Product"'), 'Product schema missing');
  assert(text.includes('"@type":"Offer"') || text.includes('"@type": "Offer"'), 'Offer schema missing');
  assert(/Informasi produk/i.test(text), 'product explanatory section missing');
  return 'Product + Offer + content';
});

await check('health and database readiness', async () => {
  const { response, json } = await request('/api/health', { headers: { Accept: 'application/json' } });
  assert(response.status === 200, `HTTP ${response.status}`);
  assert(json?.ok === true, 'health ok=false');
  assert(json?.database?.connected === true, 'database disconnected');
  assert(json?.schema?.core_ready === true, 'core schema not ready');
  assert(json?.schema?.missing_core_count === 0, 'core tables missing');
  assert(json?.schema?.support_ready === true, 'support schema not ready');
  assert(json?.schema?.missing_support_count === 0, 'support tables missing');
  assert(json?.database?.name === undefined, 'database name leaked');
  assert(json?.database?.public_tables === undefined, 'table count leaked');
  assert(/no-store/i.test(response.headers.get('cache-control') || ''), 'health response is cacheable');
  return 'database + core + support ready';
});

for (const [name, path, expectedStatus, expectedCode] of [
  ['public account fail-closed', '/api/profile', 401, null],
  ['support fail-closed', '/api/support/tickets', 401, 'AUTH_REQUIRED'],
  ['admin fail-closed', '/api/admin/auth/me', 401, null],
  ['admin support fail-closed', '/api/admin/support/tickets', 401, null]
]) {
  await check(name, async () => {
    const { response, json } = await request(path, { headers: { Accept: 'application/json' } });
    assert(response.status === expectedStatus, `expected ${expectedStatus}, got ${response.status}`);
    if (expectedCode) assert(json?.code === expectedCode, `expected ${expectedCode}, got ${json?.code}`);
    return `HTTP ${expectedStatus}`;
  });
}

for (const [name, path] of [
  ['checkout privacy headers', '/checkout/'],
  ['purchases privacy headers', '/purchases/'],
  ['seller orders privacy headers', '/seller-orders/'],
  ['support privacy headers', '/support/'],
  ['admin privacy headers', '/admin/']
]) {
  await check(name, async () => {
    const { response } = await request(path, { headers: { Accept: 'text/html' } });
    assert(response.status === 200 || response.status === 404, `unexpected HTTP ${response.status}`);
    const cache = response.headers.get('cache-control') || '';
    const robots = response.headers.get('x-robots-tag') || '';
    assert(/no-store/i.test(cache), `missing no-store: ${cache}`);
    assert(/noindex/i.test(robots), `missing noindex: ${robots}`);
    return 'no-store + noindex';
  });
}

await check('legacy public admin remains disabled', async () => {
  const { response, json } = await request('/api/commerce/admin', { headers: { Accept: 'application/json' } });
  assert(response.status === 403, `expected 403, got ${response.status}`);
  assert(json?.code === 'PUBLIC_ADMIN_ROUTE_DISABLED', `unexpected code ${json?.code}`);
  return json.code;
});

await check('unknown API fails closed', async () => {
  const { response, json } = await request('/api/__p4_unknown_route__', { headers: { Accept: 'application/json' } });
  assert(response.status === 404, `expected 404, got ${response.status}`);
  assert(json?.code === 'API_NOT_FOUND', `unexpected code ${json?.code}`);
  return 'API_NOT_FOUND';
});

const failures = results.filter(item => !item.ok);
console.log(`\nP4 final production certification: ${results.length - failures.length}/${results.length} PASS`);
if (failures.length) {
  for (const failure of failures) console.error(` - ${failure.name}: ${failure.error}`);
  process.exit(1);
}
