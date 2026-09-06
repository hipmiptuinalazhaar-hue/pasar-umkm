const BASE_URL = (process.env.LOAD_BASE_URL || 'https://pasar-umkm.hipmiptuinalazhaar.workers.dev').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.LOAD_TIMEOUT_MS || 12000);
const P95_LIMIT_MS = Number(process.env.LOAD_P95_LIMIT_MS || 8000);
const MIN_SUCCESS_RATE = Number(process.env.LOAD_MIN_SUCCESS_RATE || 0.99);
const TIERS = String(process.env.LOAD_TIERS || '50,100,200')
  .split(',')
  .map(value => Number(value.trim()))
  .filter(value => Number.isInteger(value) && value > 0 && value <= 500);

if (!TIERS.length) {
  console.error('LOAD_TIERS must contain at least one integer between 1 and 500.');
  process.exit(2);
}

const ENDPOINTS = [
  '/api/categories',
  '/api/products?limit=12',
  '/api/stores?limit=12'
];

function percentile(values, quantile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
  return sorted[index];
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function timedRequest(index) {
  const path = ENDPOINTS[index % ENDPOINTS.length];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'pasar-umkm-load-smoke/1.0'
      }
    });
    const elapsed = performance.now() - started;
    await response.arrayBuffer();
    return {
      path,
      status: response.status,
      elapsed,
      ok: response.status >= 200 && response.status < 300,
      error: null
    };
  } catch (error) {
    return {
      path,
      status: 0,
      elapsed: performance.now() - started,
      ok: false,
      error: error?.name || error?.message || String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function warmup() {
  const results = await Promise.all(ENDPOINTS.map((_, index) => timedRequest(index)));
  const failed = results.filter(item => !item.ok);
  if (failed.length) {
    throw new Error(`Warmup failed: ${failed.map(item => `${item.path}:${item.status || item.error}`).join(', ')}`);
  }
}

async function runTier(concurrency) {
  const started = performance.now();
  const results = await Promise.all(
    Array.from({ length: concurrency }, (_, index) => timedRequest(index))
  );
  const wallMs = performance.now() - started;
  const latencies = results.map(item => item.elapsed);
  const success = results.filter(item => item.ok).length;
  const failures = results.length - success;
  const serverErrors = results.filter(item => item.status >= 500).length;
  const rateLimited = results.filter(item => item.status === 429).length;
  const timeouts = results.filter(item => item.status === 0).length;
  const successRate = success / results.length;
  const stats = {
    concurrency,
    requests: results.length,
    success,
    failures,
    successRate,
    serverErrors,
    rateLimited,
    timeouts,
    p50: percentile(latencies, 0.50),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    max: Math.max(...latencies),
    wallMs,
    throughput: results.length / (wallMs / 1000)
  };

  console.log(
    [
      `LOAD tier=${concurrency}`,
      `requests=${stats.requests}`,
      `success=${stats.success}`,
      `failures=${stats.failures}`,
      `success_rate=${round(successRate * 100, 2)}%`,
      `5xx=${serverErrors}`,
      `429=${rateLimited}`,
      `timeouts=${timeouts}`,
      `p50=${round(stats.p50)}ms`,
      `p95=${round(stats.p95)}ms`,
      `p99=${round(stats.p99)}ms`,
      `max=${round(stats.max)}ms`,
      `throughput=${round(stats.throughput)}req/s`
    ].join(' | ')
  );

  return stats;
}

console.log(`Load smoke target: ${BASE_URL}`);
console.log(`Read-only endpoints: ${ENDPOINTS.join(', ')}`);
console.log(`Tiers: ${TIERS.join(' -> ')} concurrent clients`);
console.log(`Gate: success >= ${MIN_SUCCESS_RATE * 100}%, 5xx=0, 429=0, p95 <= ${P95_LIMIT_MS}ms`);

await warmup();
console.log('Warmup: PASS');

const tiers = [];
for (const concurrency of TIERS) {
  tiers.push(await runTier(concurrency));
}

const failures = [];
for (const stats of tiers) {
  if (stats.successRate < MIN_SUCCESS_RATE) {
    failures.push(`tier ${stats.concurrency}: success rate ${round(stats.successRate * 100, 2)}%`);
  }
  if (stats.serverErrors > 0) {
    failures.push(`tier ${stats.concurrency}: ${stats.serverErrors} server errors`);
  }
  if (stats.rateLimited > 0) {
    failures.push(`tier ${stats.concurrency}: ${stats.rateLimited} unexpected 429 responses`);
  }
  if (stats.p95 > P95_LIMIT_MS) {
    failures.push(`tier ${stats.concurrency}: p95 ${round(stats.p95)}ms > ${P95_LIMIT_MS}ms`);
  }
}

const totalRequests = tiers.reduce((sum, tier) => sum + tier.requests, 0);
const totalSuccess = tiers.reduce((sum, tier) => sum + tier.success, 0);
console.log(`\nLoad smoke summary: ${totalSuccess}/${totalRequests} successful requests across ${tiers.length} tiers.`);

if (failures.length) {
  console.error('Load smoke gate FAILED:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Load smoke gate PASS.');
