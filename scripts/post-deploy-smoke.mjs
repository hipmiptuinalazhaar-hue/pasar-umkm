const BASE_URL = (process.env.PRODUCTION_BASE_URL || 'https://pasar-umkm.hipmiptuinalazhaar.workers.dev').replace(/\/$/, '');
const EXPECTED_RELEASE = process.env.EXPECTED_RELEASE || '2026-09-06-platform-hardening-v3';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 15000);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSameOrigin(response, label) {
  const expectedOrigin = new URL(BASE_URL).origin;
  const actualOrigin = new URL(response.url).origin;
  assert(actualOrigin === expectedOrigin, `${label} redirected off-origin to ${actualOrigin}`);
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      redirect: 'manual',
      signal: controller.signal,
      ...options,
      headers: {
        Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
        'User-Agent': 'pasar-umkm-post-deploy-smoke/1.0',
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { response, text, json };
  } finally {
    clearTimeout(timeout);
  }
}

const checks = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    checks.push({ name, ok: true });
    console.log(`PASS ${name}${detail ? ` :: ${detail}` : ''}`);
  } catch (error) {
    checks.push({ name, ok: false, error: error?.message || String(error) });
    console.error(`FAIL ${name} :: ${error?.message || error}`);
  }
}

await check('public shell', async () => {
  const { response, text } = await request('/', { headers: { Accept: 'text/html' } });
  assert(response.status === 200, `HTTP ${response.status}`);
  assert(/Pasar\s*UMKM/i.test(text), 'Pasar UMKM marker missing');
  const csp = response.headers.get('content-security-policy') || '';
  assert(csp.includes("object-src 'none'"), 'public CSP not active');
  assert(!csp.includes("'unsafe-eval'"), 'public CSP allows unsafe-eval');
  assert((response.headers.get('x-content-type-options') || '').toLowerCase() === 'nosniff', 'nosniff header missing');
  return 'shell + CSP';
});

await check('legal trust center', async () => {
  const { response, text } = await request('/legal/index.html', {
    redirect: 'follow',
    headers: { Accept: 'text/html' }
  });
  assert(response.status === 200, `HTTP ${response.status}`);
  assertSameOrigin(response, 'legal trust center');
  assert(/Legal\s*(?:&|&amp;)\s*Trust\s*Center/i.test(text), 'Legal & Trust Center marker missing');
  assert(text.includes('Capryan Agusto, orang perseorangan'), 'operator disclosure missing');
  assert(text.includes('Penyelesaian kasus tidak otomatis memindahkan uang.'), 'financial dispute boundary missing');
  return `hub + operator + commerce boundary (${new URL(response.url).pathname})`;
});

await check('legal privacy policy', async () => {
  const { response, text } = await request('/legal/privasi.html', {
    redirect: 'follow',
    headers: { Accept: 'text/html' }
  });
  assert(response.status === 200, `HTTP ${response.status}`);
  assertSameOrigin(response, 'legal privacy policy');
  assert(/Kebijakan\s+Privasi/i.test(text), 'privacy policy marker missing');
  assert(/Hak pengguna/i.test(text), 'privacy rights marker missing');
  return `privacy + data rights (${new URL(response.url).pathname})`;
});

await check('legal complaint channel', async () => {
  const { response, text } = await request('/legal/pengaduan.html', {
    redirect: 'follow',
    headers: { Accept: 'text/html' }
  });
  assert(response.status === 200, `HTTP ${response.status}`);
  assertSameOrigin(response, 'legal complaint channel');
  assert(/Pengaduan\s*&\s*Penyelesaian\s*Sengketa/i.test(text), 'complaint policy marker missing');
  assert(text.includes('hipmiptuinalazhaar@gmail.com'), 'support channel missing');
  assert(text.includes('/support/'), 'in-app Customer Service link missing');
  return `complaints + support channel (${new URL(response.url).pathname})`;
});

await check('support shell', async () => {
  const { response, text } = await request('/support/index.html', {
    redirect: 'follow',
    headers: { Accept: 'text/html' }
  });
  assert(response.status === 200, `HTTP ${response.status}`);
  assertSameOrigin(response, 'support shell');
  assert(/Customer\s+Service/i.test(text), 'Customer Service marker missing');
  assert(/support-center-v1\.js/.test(text), 'support client module missing');
  assert(/noindex,nofollow,noarchive/i.test(text), 'support shell must stay noindex');
  return `private support workspace (${new URL(response.url).pathname})`;
});

await check('admin shell', async () => {
  const { response, text } = await request('/admin/', { headers: { Accept: 'text/html' } });
  assert(response.status === 200, `HTTP ${response.status}`);
  assert(/Admin\s+Console|Control\s+Center/i.test(text), 'Admin Console marker missing');
  assert((response.headers.get('x-frame-options') || '').toUpperCase() === 'DENY', 'admin frame denial missing');
  return 'no-store admin surface';
});

await check('health release contract', async () => {
  const { response, json } = await request('/api/health');
  assert(response.status === 200, `HTTP ${response.status}`);
  assert(json?.ok === true, 'health ok=false');
  assert(json?.release === EXPECTED_RELEASE, `release=${json?.release || 'missing'}`);
  assert(json?.database?.connected === true, 'database not connected');
  assert(json?.schema?.core_ready === true, 'core schema not ready');
  assert(json?.schema?.missing_core_count === 0, 'core schema missing tables');
  assert(json?.schema?.p0_applied === true, 'P0 migration missing');
  assert(json?.schema?.p1_applied === true, 'P1 migration missing');
  assert(json?.schema?.final_security_applied === true, 'final security migration missing');
  assert(json?.schema?.support_applied === true, 'Customer Support V1 migration missing');
  assert(json?.schema?.support_ready === true, 'Customer Support V1 schema not ready');
  assert(json?.schema?.missing_support_count === 0, 'Customer Support V1 missing tables');
  assert(json?.database?.name === undefined, 'database name leaked');
  assert(json?.database?.public_tables === undefined, 'public table count leaked');
  assert(json?.schema?.latest_migration === undefined, 'latest migration leaked');
  assert(/no-store/i.test(response.headers.get('cache-control') || ''), 'health is cacheable');
  return `${EXPECTED_RELEASE} + support-ready`;
});

await check('public categories', async () => {
  const { response, json } = await request('/api/categories');
  assert(response.status === 200, `HTTP ${response.status}`);
  assert(json?.ok === true && Array.isArray(json.categories), 'categories contract invalid');
  return `${json.categories.length} categories`;
});

await check('public stores cursor', async () => {
  const { response, json } = await request('/api/stores?limit=24');
  assert(response.status === 200, `HTTP ${response.status}`);
  assert(json?.ok === true && Array.isArray(json.stores), 'stores contract invalid');
  assert(json.stores.length <= 24, 'store page exceeds limit');
  assert(json?.pagination?.mode === 'cursor', 'stores pagination is not cursor');
  return `${json.stores.length} stores`;
});

await check('public products cursor', async () => {
  const { response, json } = await request('/api/products?limit=24');
  assert(response.status === 200, `HTTP ${response.status}`);
  assert(json?.ok === true && Array.isArray(json.products), 'products contract invalid');
  assert(json.products.length <= 24, 'product page exceeds limit');
  assert(json?.pagination?.mode === 'cursor', 'products pagination is not cursor');
  return `${json.products.length} products`;
});

await check('public auth boundary', async () => {
  const { response, json } = await request('/api/profile');
  assert(response.status === 401, `expected 401, got ${response.status}`);
  assert(json?.ok === false, 'anonymous profile boundary invalid');
  return '401 fail-closed';
});

await check('support auth boundary', async () => {
  const { response, json } = await request('/api/support/tickets');
  assert(response.status === 401, `expected 401, got ${response.status}`);
  assert(json?.ok === false, 'anonymous support boundary invalid');
  assert(json?.code === 'AUTH_REQUIRED', `unexpected code ${json?.code}`);
  return '401 private user channel';
});

await check('admin auth boundary', async () => {
  const { response, json } = await request('/api/admin/auth/me');
  assert(response.status === 401, `expected 401, got ${response.status}`);
  assert(json?.authenticated === false, 'anonymous admin boundary invalid');
  return '401 fail-closed';
});

await check('admin support auth boundary', async () => {
  const { response, json } = await request('/api/admin/support/tickets');
  assert(response.status === 401, `expected 401, got ${response.status}`);
  assert(json?.ok === false, 'anonymous admin support boundary invalid');
  return '401 privileged support channel';
});

await check('legacy public-admin disabled', async () => {
  const { response, json } = await request('/api/commerce/admin');
  assert(response.status === 403, `expected 403, got ${response.status}`);
  assert(json?.code === 'PUBLIC_ADMIN_ROUTE_DISABLED', `unexpected code ${json?.code}`);
  return json.code;
});

const failures = checks.filter(item => !item.ok);
console.log(`\nPost-deploy smoke: ${checks.length - failures.length}/${checks.length} PASS`);
if (failures.length) process.exit(1);