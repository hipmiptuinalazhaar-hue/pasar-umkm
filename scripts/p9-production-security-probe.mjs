import fs from 'node:fs';

const BASE_URL = String(process.env.P9_BASE_URL || 'https://pasar-umkm.hipmiptuinalazhaar.workers.dev').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.P9_PROBE_TIMEOUT_MS || 12000);
const REPORT_DIR = 'p9-security-results';

function timeoutSignal(ms) {
  return AbortSignal.timeout(Math.max(1000, ms));
}

async function request(path, init = {}) {
  const started = performance.now();
  const response = await fetch(`${BASE_URL}${path}`, {
    redirect: 'manual',
    ...init,
    signal: timeoutSignal(TIMEOUT_MS)
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return {
    path,
    status: response.status,
    headers: response.headers,
    text,
    json,
    duration: Math.round((performance.now() - started) * 10) / 10
  };
}

function headerIncludes(result, name, value) {
  return String(result.headers.get(name) || '').toLowerCase().includes(String(value).toLowerCase());
}

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`);
}

const root = await request('/');
check('root available', root.status === 200, `status=${root.status} ${root.duration}ms`);
check('root CSP blocks objects', headerIncludes(root, 'content-security-policy', "object-src 'none'"));
check('root CSP blocks inline event handlers', headerIncludes(root, 'content-security-policy', "script-src-attr 'none'"));
check('root HSTS enabled', Boolean(root.headers.get('strict-transport-security')));
check('root nosniff enabled', headerIncludes(root, 'x-content-type-options', 'nosniff'));

const crossOrigin = await request('/api/profile', {
  method: 'POST',
  headers: {
    Origin: 'https://attacker.invalid',
    'Content-Type': 'application/json'
  },
  body: '{}'
});
check('cross-origin mutation rejected', crossOrigin.status === 403 && crossOrigin.json?.code === 'ORIGIN_REJECTED', `status=${crossOrigin.status} code=${crossOrigin.json?.code || 'n/a'}`);

const provenance = await request('/api/profile', {
  method: 'POST',
  headers: {
    Cookie: '__Host-pasar_umkm_session=fake-session-token',
    'Content-Type': 'application/json'
  },
  body: '{}'
});
check('cookie mutation without browser provenance rejected', provenance.status === 403 && provenance.json?.code === 'BROWSER_PROVENANCE_REQUIRED', `status=${provenance.status} code=${provenance.json?.code || 'n/a'}`);

const legacyAdmin = await request('/api/commerce/admin');
check('legacy public admin disabled', legacyAdmin.status === 403 && legacyAdmin.json?.code === 'PUBLIC_ADMIN_ROUTE_DISABLED', `status=${legacyAdmin.status} code=${legacyAdmin.json?.code || 'n/a'}`);

const privateRoutes = [
  ['/api/profile', [401]],
  ['/api/notifications', [401, 404]],
  ['/api/commerce/orders', [401]],
  ['/api/support/tickets', [401]],
  ['/api/admin/auth/me', [401]],
  ['/api/admin/support/tickets', [401, 403]],
  ['/api/products/me', [401, 403]]
];

for (const [path, allowed] of privateRoutes) {
  const result = await request(path);
  check(`anonymous access fails closed ${path}`, allowed.includes(result.status), `status=${result.status}`);
  check(`private response is no-store ${path}`, headerIncludes(result, 'cache-control', 'no-store'), result.headers.get('cache-control') || 'missing');
}

const uploadAnon = await request('/api/uploads/product-image', {
  method: 'POST',
  headers: {
    Origin: BASE_URL,
    'Sec-Fetch-Site': 'same-origin'
  }
});
check('anonymous upload fails closed', [401, 403].includes(uploadAnon.status), `status=${uploadAnon.status}`);

const health = await request('/api/health');
check('health endpoint remains available', health.status === 200 && health.json?.ok === true, `status=${health.status}`);
check('API correlation header present', Boolean(health.headers.get('x-request-id')));
check('API server timing present', Boolean(health.headers.get('server-timing')));
check('API security nosniff present', headerIncludes(health, 'x-content-type-options', 'nosniff'));

const failed = checks.filter(item => !item.ok);
const report = {
  target: BASE_URL,
  checked_at: new Date().toISOString(),
  total: checks.length,
  passed: checks.length - failed.length,
  failed: failed.map(item => ({ name: item.name, detail: item.detail })),
  checks
};

fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(`${REPORT_DIR}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exit(1);
console.log(`P9 production security probe PASS (${checks.length}/${checks.length}).`);
