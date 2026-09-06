const BASE_URL = (process.env.E2E_BASE_URL || process.env.PRODUCTION_BASE_URL || '').replace(/\/$/, '');
const EMAIL = String(process.env.SMOKE_USER_EMAIL || '').trim();
const PASSWORD = String(process.env.SMOKE_USER_PASSWORD || '');
const ALLOW_MUTATIONS = process.env.SMOKE_ALLOW_MUTATIONS === 'true';
const IS_PRODUCTION = /pasar-umkm\.hipmiptuinalazhaar\.workers\.dev$/i.test(new URL(BASE_URL || 'https://invalid.local').hostname);

if (!BASE_URL || !EMAIL || !PASSWORD) {
  console.error('Authenticated smoke requires E2E_BASE_URL, SMOKE_USER_EMAIL, and SMOKE_USER_PASSWORD.');
  process.exit(2);
}

if (IS_PRODUCTION && ALLOW_MUTATIONS) {
  console.error('Stateful mutation smoke is blocked on production by policy. Use a staging/preview environment.');
  process.exit(2);
}

let cookie = '';
let authenticatedRole = '';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    redirect: 'manual',
    ...options,
    headers: {
      Accept: 'application/json',
      Origin: BASE_URL,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {})
    }
  });

  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  if (setCookies.length) {
    cookie = setCookies.map(value => value.split(';')[0]).filter(Boolean).join('; ');
  }

  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { response, json, text };
}

const results = [];
async function probe(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}${detail ? ` :: ${detail}` : ''}`);
  } catch (error) {
    results.push({ name, ok: false, error: error?.message || String(error) });
    console.error(`FAIL ${name} :: ${error?.message || error}`);
  }
}

await probe('valid login', async () => {
  const { response, json } = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  assert(response.status === 200, `HTTP ${response.status}`);
  assert(json?.ok === true && json?.authenticated === true, 'login contract invalid');
  assert(cookie.includes('__Host-pasar_umkm_session='), 'session cookie not issued');
  authenticatedRole = String(json?.user?.role || '').trim().toLowerCase();
  return authenticatedRole || 'authenticated';
});

for (const [name, path] of [
  ['profile read', '/api/profile'],
  ['store workspace read', '/api/stores/me'],
  ['seller products read', '/api/products/me'],
  ['cart read', '/api/commerce/cart'],
  ['saved items read', '/api/commerce/saved'],
  ['buyer orders read', '/api/commerce/orders?scope=buyer'],
  ['notifications read', '/api/social/notifications'],
  ['conversation list read', '/api/social/conversations'],
  ['chat unread count read', '/api/social/unread-count']
]) {
  await probe(name, async () => {
    const { response, json } = await request(path);
    assert(response.status === 200, `HTTP ${response.status}`);
    assert(json?.ok === true, `${path} ok !== true`);
    if (path.includes('/api/commerce/orders')) {
      assert(Array.isArray(json?.orders), 'orders contract missing array');
    }
    return 'HTTP 200';
  });
}

if (authenticatedRole === 'seller' || authenticatedRole === 'admin') {
  await probe('seller orders read', async () => {
    const { response, json } = await request('/api/commerce/orders?scope=seller');
    assert(response.status === 200, `HTTP ${response.status}`);
    assert(json?.ok === true && Array.isArray(json?.orders), 'seller orders contract invalid');
    return `${json.orders.length} orders`;
  });
}

if (ALLOW_MUTATIONS) {
  await probe('reversible cart mutation', async () => {
    const catalog = await request('/api/products?limit=24');
    const product = catalog.json?.products?.find(item => Number(item.stock || 0) > 0);
    assert(product?.id, 'no in-stock product available');

    const before = await request('/api/commerce/cart');
    const existing = before.json?.cart?.items?.find(item => item.product_id === product.id) || null;
    const originalQuantity = existing ? Number(existing.quantity || 1) : 0;

    const add = await request('/api/commerce/cart/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: product.id, quantity: 1 })
    });
    assert([200, 201].includes(add.response.status), `cart add HTTP ${add.response.status}`);

    if (originalQuantity > 0) {
      const restore = await request(`/api/commerce/cart/items/${encodeURIComponent(product.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: originalQuantity })
      });
      assert(restore.response.status === 200, `cart restore HTTP ${restore.response.status}`);
    } else {
      const remove = await request(`/api/commerce/cart/items/${encodeURIComponent(product.id)}`, { method: 'DELETE' });
      assert(remove.response.status === 200, `cart cleanup HTTP ${remove.response.status}`);
    }

    return 'mutation restored to original cart state';
  });
}

await probe('logout', async () => {
  const { response, json } = await request('/api/auth/logout', { method: 'POST' });
  assert(response.status === 200, `HTTP ${response.status}`);
  assert(json?.ok === true, 'logout contract invalid');
  return 'session revoked';
});

const failures = results.filter(item => !item.ok);
console.log(`\nAuthenticated smoke: ${results.length - failures.length}/${results.length} PASS`);
if (failures.length) process.exit(1);
