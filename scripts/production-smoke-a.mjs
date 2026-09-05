const BASE_URL = (process.env.PRODUCTION_BASE_URL || 'https://pasar-umkm.hipmiptuinalazhaar.workers.dev').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 15000);

const results = [];
let publicStore = null;
let publicProfile = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      redirect: 'manual',
      signal: controller.signal,
      ...options,
      headers: {
        Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
        'User-Agent': 'pasar-umkm-production-smoke-a/1.0',
        ...(options.headers || {})
      }
    });

    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}

    return {
      status: response.status,
      headers: response.headers,
      text,
      json,
      durationMs: Date.now() - started
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function probe(id, area, title, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ id, area, title, status: 'PASS', durationMs: Date.now() - started, detail: detail || null });
    console.log(`PASS ${id} [${area}] ${title}${detail ? ` :: ${detail}` : ''}`);
  } catch (error) {
    results.push({ id, area, title, status: 'FAIL', durationMs: Date.now() - started, detail: error?.message || String(error) });
    console.error(`FAIL ${id} [${area}] ${title} :: ${error?.message || error}`);
  }
}

function expectJsonStatus(response, status) {
  assert(response.status === status, `expected HTTP ${status}, got ${response.status}`);
  assert(response.json && typeof response.json === 'object', 'response is not valid JSON');
}

function expectNoStore(response) {
  const value = response.headers.get('cache-control') || '';
  assert(/no-store/i.test(value), `Cache-Control must include no-store, got ${JSON.stringify(value)}`);
}

await probe('A-01', 'shell', 'Public application shell is reachable', async () => {
  const r = await request('/', { headers: { Accept: 'text/html' } });
  assert(r.status === 200, `expected HTTP 200, got ${r.status}`);
  assert(/pasar\s*umkm/i.test(r.text), 'application shell does not contain Pasar UMKM marker');
  return `${r.status} in ${r.durationMs}ms`;
});

await probe('A-02', 'shell', 'Admin application shell is reachable', async () => {
  const r = await request('/admin/', { headers: { Accept: 'text/html' } });
  assert(r.status === 200, `expected HTTP 200, got ${r.status}`);
  assert(/admin|control/i.test(r.text), 'admin shell marker was not found');
  return `${r.status} in ${r.durationMs}ms`;
});

await probe('A-03', 'health', 'Worker and production database health are ready', async () => {
  const r = await request('/api/health');
  expectJsonStatus(r, 200);
  expectNoStore(r);
  assert(r.json.ok === true, 'health ok !== true');
  assert(r.json.database?.connected === true, 'database is not reported connected');
  assert(r.json.schema?.core_ready === true, 'core schema is not ready');
  assert(r.json.schema?.p0_applied === true, 'P0 migration is not reported applied');
  assert(r.json.schema?.p1_applied === true, 'P1 migration is not reported applied');
  return `db=${r.json.database?.name}, tables=${r.json.database?.public_tables}`;
});

await probe('A-04', 'catalog', 'Categories endpoint is healthy', async () => {
  const r = await request('/api/categories');
  expectJsonStatus(r, 200);
  expectNoStore(r);
  assert(r.json.ok === true, 'categories ok !== true');
  assert(Array.isArray(r.json.categories), 'categories is not an array');
  assert(r.json.count === r.json.categories.length, 'categories count mismatch');
  return `${r.json.count} categories`;
});

await probe('A-05', 'catalog', 'Store directory first page uses bounded cursor pagination', async () => {
  const r = await request('/api/stores?limit=24');
  expectJsonStatus(r, 200);
  expectNoStore(r);
  assert(r.json.ok === true, 'stores ok !== true');
  assert(Array.isArray(r.json.stores), 'stores is not an array');
  assert(r.json.stores.length <= 24, 'store page exceeds requested limit');
  assert(r.json.pagination?.mode === 'cursor', 'store pagination mode is not cursor');
  publicStore = r.json.stores[0] || null;
  assert(publicStore?.id, 'no active public store available for downstream smoke probes');
  return `${r.json.stores.length} stores; first=${publicStore.name || publicStore.id}`;
});

await probe('A-06', 'catalog', 'Product catalog first page uses bounded cursor pagination', async () => {
  const r = await request('/api/products?limit=24');
  expectJsonStatus(r, 200);
  expectNoStore(r);
  assert(r.json.ok === true, 'products ok !== true');
  assert(Array.isArray(r.json.products), 'products is not an array');
  assert(r.json.products.length <= 24, 'product page exceeds requested limit');
  assert(r.json.pagination?.mode === 'cursor', 'product pagination mode is not cursor');
  return `${r.json.products.length} products`;
});

await probe('A-07', 'catalog', 'Legacy deep page pagination is rejected', async () => {
  const r = await request('/api/products?page=2');
  expectJsonStatus(r, 400);
  assert(r.json.code === 'CURSOR_REQUIRED', `expected CURSOR_REQUIRED, got ${r.json.code}`);
  return r.json.code;
});

await probe('A-08', 'catalog', 'Malformed catalog cursor is rejected', async () => {
  const r = await request('/api/stores?cursor=definitely-not-a-valid-store-cursor');
  expectJsonStatus(r, 400);
  assert(r.json.code === 'INVALID_CURSOR', `expected INVALID_CURSOR, got ${r.json.code}`);
  return r.json.code;
});

await probe('A-09', 'social', 'Public social profile resolves from a real active store', async () => {
  assert(publicStore?.id, 'store prerequisite missing');
  const r = await request(`/api/social/profile?store_id=${encodeURIComponent(publicStore.id)}`);
  expectJsonStatus(r, 200);
  expectNoStore(r);
  assert(r.json.ok === true, 'social profile ok !== true');
  assert(r.json.profile?.user_id, 'social profile has no user_id');
  publicProfile = r.json.profile;
  return `${publicProfile.user_name || publicProfile.user_id}`;
});

await probe('A-10', 'social', 'Public followers list resolves', async () => {
  assert(publicProfile?.user_id, 'profile prerequisite missing');
  const r = await request(`/api/social/followers?user_id=${encodeURIComponent(publicProfile.user_id)}`);
  expectJsonStatus(r, 200);
  assert(r.json.ok === true && Array.isArray(r.json.users), 'followers response contract invalid');
  return `${r.json.count} followers`;
});

await probe('A-11', 'social', 'Public following list resolves', async () => {
  assert(publicProfile?.user_id, 'profile prerequisite missing');
  const r = await request(`/api/social/following?user_id=${encodeURIComponent(publicProfile.user_id)}`);
  expectJsonStatus(r, 200);
  assert(r.json.ok === true && Array.isArray(r.json.users), 'following response contract invalid');
  return `${r.json.count} following`;
});

const unauthorizedGets = [
  ['A-12', 'auth', '/api/profile', 'Profile management rejects anonymous access'],
  ['A-13', 'auth', '/api/stores/me', 'Seller store workspace rejects anonymous access'],
  ['A-14', 'auth', '/api/products/me', 'Seller product workspace rejects anonymous access'],
  ['A-15', 'commerce', '/api/commerce/cart', 'Cart rejects anonymous access'],
  ['A-16', 'commerce', '/api/commerce/saved', 'Saved-items workspace rejects anonymous access'],
  ['A-17', 'social', '/api/social/notifications', 'Notifications reject anonymous access'],
  ['A-18', 'chat', '/api/social/conversations', 'Conversation list rejects anonymous access'],
  ['A-19', 'chat', '/api/social/unread-count', 'Unread chat count rejects anonymous access'],
  ['A-20', 'admin', '/api/admin/auth/me', 'Admin session endpoint rejects anonymous access'],
  ['A-21', 'admin', '/api/admin/access/me', 'Admin capability endpoint rejects anonymous access'],
  ['A-22', 'admin', '/api/admin/security/sessions', 'Admin security workspace rejects anonymous access']
];

for (const [id, area, path, title] of unauthorizedGets) {
  await probe(id, area, title, async () => {
    const r = await request(path);
    expectJsonStatus(r, 401);
    expectNoStore(r);
    assert(r.json.ok === false, 'anonymous boundary must return ok=false');
    return 'HTTP 401 as designed';
  });
}

await probe('A-23', 'auth', 'Registration validation fails before creating an account', async () => {
  const r = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'X', email: 'not-an-email', password: 'short' })
  });
  expectJsonStatus(r, 400);
  expectNoStore(r);
  assert(r.json.ok === false, 'invalid registration must return ok=false');
  return 'validation-only probe; no valid account payload sent';
});

await probe('A-24', 'auth', 'Login validation rejects missing credentials', async () => {
  const r = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: '', password: '' })
  });
  expectJsonStatus(r, 400);
  expectNoStore(r);
  assert(r.json.ok === false, 'invalid login must return ok=false');
  return 'validation-only probe';
});

await probe('A-25', 'ownership', 'Store creation cannot be reached anonymously', async () => {
  const r = await request('/api/stores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Smoke Probe Must Not Persist' })
  });
  expectJsonStatus(r, 401);
  assert(r.json.ok === false, 'anonymous store creation must return ok=false');
  return 'HTTP 401 before mutation';
});

await probe('A-26', 'ownership', 'Product creation cannot be reached anonymously', async () => {
  const r = await request('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Smoke Probe Must Not Persist', price: 1, stock: 1 })
  });
  expectJsonStatus(r, 401);
  assert(r.json.ok === false, 'anonymous product creation must return ok=false');
  return 'HTTP 401 before mutation';
});

await probe('A-27', 'chat', 'Conversation creation cannot be reached anonymously', async () => {
  const r = await request('/api/social/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_user_id: publicProfile?.user_id || null })
  });
  expectJsonStatus(r, 401);
  assert(r.json.ok === false, 'anonymous conversation creation must return ok=false');
  return 'HTTP 401 before mutation';
});

const passed = results.filter(item => item.status === 'PASS').length;
const failed = results.filter(item => item.status === 'FAIL').length;
const total = results.length;

console.log('\n=== PASAR UMKM PRODUCTION SMOKE A ===');
console.log(`Target : ${BASE_URL}`);
console.log(`Total  : ${total}`);
console.log(`PASS   : ${passed}`);
console.log(`FAIL   : ${failed}`);

if (failed > 0) {
  console.log('\nFailed probes:');
  for (const item of results.filter(item => item.status === 'FAIL')) {
    console.log(`- ${item.id} ${item.title}: ${item.detail}`);
  }
  process.exitCode = 1;
}