import fs from 'node:fs';
import path from 'node:path';

const base = String(process.env.P8_SCALE_BASE_URL || 'https://pasar-umkm.hipmiptuinalazhaar.workers.dev').replace(/\/$/, '');
const timeoutMs = Math.max(1000, Number(process.env.P8_SCALE_TIMEOUT_MS || 12000));
const p95LimitMs = Math.max(250, Number(process.env.P8_SCALE_P95_LIMIT_MS || 5000));
const pageLimit = Math.max(1, Math.min(10, Number(process.env.P8_SCALE_PAGE_LIMIT || 2)));
const outDir = 'p8-scale-results';
fs.mkdirSync(outDir, { recursive: true });

const samples = [];
const failures = [];

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getJson(name, pathname) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(base + pathname, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'pasar-umkm-p8-scale-probe/1.0'
      }
    });
    const duration = Math.round((performance.now() - started) * 10) / 10;
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    samples.push({ name, pathname, status: response.status, duration_ms: duration });
    assert(response.status === 200, `${name}: expected 200, got ${response.status}`);
    assert(response.status < 500, `${name}: server error ${response.status}`);
    assert(response.status !== 429, `${name}: rate limited`);
    assert(json && json.ok === true, `${name}: invalid ok contract`);
    const requestId = response.headers.get('x-request-id');
    const serverTiming = response.headers.get('server-timing');
    assert(requestId, `${name}: X-Request-Id missing`);
    assert(serverTiming, `${name}: Server-Timing missing`);
    console.log(`P8 SCALE PASS ${name} status=${response.status} duration=${duration}ms`);
    return { response, json, duration };
  } catch (error) {
    const duration = Math.round((performance.now() - started) * 10) / 10;
    const message = error?.name === 'AbortError'
      ? `${name}: timeout after ${timeoutMs}ms`
      : `${name}: ${error?.message || error}`;
    failures.push(message);
    console.error(`P8 SCALE FAIL ${message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function assertUnique(items, label) {
  const ids = items.map(item => String(item?.id || '')).filter(Boolean);
  assert(ids.length === items.length, `${label}: item without id`);
  assert(new Set(ids).size === ids.length, `${label}: duplicate id inside page`);
  return ids;
}

async function certifyCollection(kind, arrayKey) {
  const first = await getJson(`${kind} page-1`, `/api/${kind}?limit=${pageLimit}`);
  if (!first) return;

  const list1 = first.json?.[arrayKey];
  const pagination1 = first.json?.pagination;
  assert(Array.isArray(list1), `${kind}: ${arrayKey} is not an array`);
  assert(list1.length <= pageLimit, `${kind}: page exceeds requested limit`);
  assert(pagination1?.mode === 'cursor', `${kind}: pagination mode is not cursor`);
  assert(Number(pagination1?.limit) === pageLimit, `${kind}: pagination limit mismatch`);
  const ids1 = assertUnique(list1, `${kind} page-1`);

  if (pagination1?.has_next === true) {
    assert(typeof pagination1.next_cursor === 'string' && pagination1.next_cursor.length > 0, `${kind}: next_cursor missing`);
    const cursor = encodeURIComponent(pagination1.next_cursor);
    const second = await getJson(`${kind} page-2`, `/api/${kind}?limit=${pageLimit}&cursor=${cursor}`);
    if (!second) return;
    const list2 = second.json?.[arrayKey];
    const pagination2 = second.json?.pagination;
    assert(Array.isArray(list2), `${kind}: second page is not an array`);
    assert(list2.length <= pageLimit, `${kind}: second page exceeds limit`);
    assert(pagination2?.mode === 'cursor', `${kind}: second page lost cursor mode`);
    const ids2 = assertUnique(list2, `${kind} page-2`);
    const overlap = ids2.filter(id => ids1.includes(id));
    assert(overlap.length === 0, `${kind}: duplicate ids across cursor pages: ${overlap.join(',')}`);
  } else {
    assert(pagination1?.next_cursor === null, `${kind}: terminal page must expose next_cursor=null`);
  }
}

await certifyCollection('products', 'products');
await certifyCollection('stores', 'stores');

const health = await getJson('health database contract', '/api/health');
if (health) {
  assert(health.json?.database?.connected === true, 'health: database is not connected');
  assert(health.json?.schema?.core_ready === true, 'health: core schema is not ready');
  assert(health.json?.schema?.commerce_ready === true, 'health: commerce schema is not ready');
  assert(health.json?.schema?.support_ready === true, 'health: support schema is not ready');
}

const durations = samples.filter(sample => sample.status === 200).map(sample => sample.duration_ms);
const p95 = Math.round(percentile(durations, 95) * 10) / 10;
const max = durations.length ? Math.max(...durations) : 0;
if (p95 > p95LimitMs) failures.push(`p95 ${p95}ms exceeds ${p95LimitMs}ms`);

const summary = {
  target: base,
  page_limit: pageLimit,
  checks: samples.length,
  failures,
  p95_ms: p95,
  max_ms: max,
  threshold_p95_ms: p95LimitMs,
  production_mutations: 0,
  generated_at: new Date().toISOString()
};

fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ summary, samples }, null, 2));

if (failures.length) {
  console.error(`P8 production scale probe: FAIL (${failures.length})`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`P8 production scale probe: PASS; checks=${samples.length}; p95=${p95}ms; max=${max}ms; mutations=0`);
