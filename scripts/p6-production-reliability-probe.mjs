import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = new URL(process.env.P6_BASE_URL || 'https://pasar-umkm.hipmiptuinalazhaar.workers.dev/');
const timeoutMs = Number(process.env.P6_PROBE_TIMEOUT_MS || 12000);
const rounds = Number(process.env.P6_PROBE_ROUNDS || 3);
const p95LimitMs = Number(process.env.P6_P95_LIMIT_MS || 5000);
const outputDir = path.resolve(process.env.P6_PROBE_OUTPUT_DIR || 'p6-reliability-results');

if (baseUrl.protocol !== 'https:') throw new Error('P6 reliability probe requires HTTPS.');
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) throw new Error('P6_PROBE_ROUNDS must be an integer from 1 to 10.');
if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) throw new Error('P6_PROBE_TIMEOUT_MS must be 1000..30000.');
if (!Number.isFinite(p95LimitMs) || p95LimitMs < 250 || p95LimitMs > 30000) throw new Error('P6_P95_LIMIT_MS must be 250..30000.');

const targets = [
  { name: 'homepage', path: '/', status: 200, api: false },
  { name: 'health', path: '/api/health', status: 200, api: true },
  { name: 'categories', path: '/api/categories', status: 200, api: true },
  { name: 'stores', path: '/api/stores?limit=12', status: 200, api: true },
  { name: 'products', path: '/api/products?limit=12', status: 200, api: true },
  { name: 'unknown-api', path: '/api/__p6_reliability_unknown__', status: 404, api: true },
  { name: 'robots', path: '/robots.txt', status: 200, api: false },
  { name: 'sitemap', path: '/sitemap.xml', status: 200, api: false }
];

const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
};

async function timedFetch(target) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(new URL(target.path, baseUrl), {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'User-Agent': 'pasar-umkm-p6-reliability/1.0' }
    });
    const durationMs = Math.max(0, performance.now() - started);
    const bodyText = await response.text();
    return {
      ok: response.status === target.status,
      status: response.status,
      durationMs,
      headers: response.headers,
      bodyText
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      durationMs: Math.max(0, performance.now() - started),
      error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error),
      headers: new Headers(),
      bodyText: ''
    };
  } finally {
    clearTimeout(timer);
  }
}

const samples = [];
for (let round = 1; round <= rounds; round += 1) {
  for (const target of targets) {
    const result = await timedFetch(target);
    const requestId = result.headers.get('x-request-id');
    const serverTiming = result.headers.get('server-timing');
    const cacheControl = result.headers.get('cache-control') || '';
    const contentType = result.headers.get('content-type') || '';

    if (!result.ok) throw new Error(`${target.name}: expected HTTP ${target.status}, got ${result.status || result.error}`);
    if (result.status >= 500) throw new Error(`${target.name}: production returned ${result.status}`);
    if (target.api) {
      if (!requestId) throw new Error(`${target.name}: missing X-Request-Id diagnostic header`);
      if (!/^app;dur=\d+(?:\.\d+)?$/.test(serverTiming || '')) throw new Error(`${target.name}: invalid Server-Timing header: ${serverTiming}`);
      if (!/nosniff/i.test(result.headers.get('x-content-type-options') || '')) throw new Error(`${target.name}: missing nosniff`);
    }

    if (target.name === 'health') {
      if (!/no-store/i.test(cacheControl)) throw new Error('health: Cache-Control must be no-store');
      if (!contentType.toLowerCase().includes('application/json')) throw new Error('health: expected JSON');
      const data = JSON.parse(result.bodyText);
      if (data?.ok !== true || data?.database?.connected !== true) throw new Error('health: database connectivity attestation failed');
      if (data?.schema?.core_ready !== true) throw new Error('health: core schema is not ready');
      if (data?.schema?.p6_applied !== true || data?.schema?.operational_ready !== true) throw new Error('health: P6 operational schema is not ready');
      if (data?.schema?.support_ready !== true) throw new Error('health: support schema is not ready');
      if ('database_name' in data || 'table_count' in data?.database) throw new Error('health: internal database metadata leaked');
    }

    if (target.name === 'unknown-api') {
      const data = JSON.parse(result.bodyText);
      if (data?.code !== 'API_NOT_FOUND') throw new Error(`unknown-api: expected API_NOT_FOUND, got ${data?.code}`);
    }

    samples.push({ round, name: target.name, status: result.status, duration_ms: Number(result.durationMs.toFixed(1)) });
    console.log(`P6 RELIABILITY PASS round=${round} ${target.name} status=${result.status} duration=${result.durationMs.toFixed(1)}ms`);
  }
}

const durations = samples.map(item => item.duration_ms);
const p95 = percentile(durations, 0.95);
const max = Math.max(...durations);
if (p95 > p95LimitMs) throw new Error(`P6 reliability latency gate failed: p95=${p95}ms > ${p95LimitMs}ms`);

const report = {
  target: baseUrl.origin,
  generated_at: new Date().toISOString(),
  rounds,
  requests: samples.length,
  success_rate: 1,
  status_5xx: 0,
  timeouts: 0,
  p95_ms: p95,
  max_ms: max,
  p95_limit_ms: p95LimitMs,
  samples
};

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(`P6 production reliability: PASS ${samples.length}/${samples.length}; p95=${p95}ms; max=${max}ms`);
