import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const observability = read('src/observability.js');
const worker = read('src/worker-entry.js');
const wrangler = read('wrangler.jsonc');
const probe = read('scripts/p6-production-reliability-probe.mjs');
const workflow = read('.github/workflows/p6-production-reliability.yml');
const docs = read('docs/P6_OBSERVABILITY_RELIABILITY.md');
const pkg = JSON.parse(read('package.json'));

const checks = [];
const requireCheck = (condition, message) => {
  if (!condition) throw new Error(`P6 RELIABILITY FAIL: ${message}`);
  checks.push(message);
  console.log(`P6 RELIABILITY PASS: ${message}`);
};
const forbid = (pattern, value, message) => requireCheck(!pattern.test(value), message);

requireCheck(worker.includes('observeRequest(request, env, ctx, routeRequest)'), 'all Worker requests pass through observability wrapper');
requireCheck(observability.includes('p6-reliability-v1'), 'versioned observability policy is active');
for (const route of ['/api/admin/operations/*','/api/admin/support/*','/api/support/*','/api/reports/*','/api/disputes/*','/api/store-verification/*']) {
  requireCheck(observability.includes(route), `route taxonomy covers ${route}`);
}
for (const event of ['api.request.failed','api.rate_limited','api.auth.denied','api.request.slow','api.request.completed','api.request.exception']) {
  requireCheck(observability.includes(event), `structured telemetry covers ${event}`);
}
requireCheck(observability.includes('X-Request-Id'), 'API responses expose correlation id');
requireCheck(observability.includes('Server-Timing'), 'API responses expose server timing');
requireCheck(observability.includes('status >= 500 || status === 429'), '5xx and rate-limit events are always logged');
requireCheck(observability.includes('durationMs >= slowMs'), 'slow requests are always logged');
forbid(/request\.headers\.get\(["'](?:Cookie|Authorization|User-Agent|CF-Connecting-IP)["']\)/i, observability, 'observability does not collect sensitive request headers');
forbid(/url\.search|searchParams|request\.text\(|request\.json\(/i, observability, 'observability does not collect query strings or request bodies');
for (const marker of ['raw_path_logged: false','query_string_logged: false','request_body_logged: false','cookies_logged: false','user_agent_logged: false','ip_address_logged: false']) {
  requireCheck(observability.includes(marker), `privacy policy declares ${marker}`);
}

requireCheck(wrangler.includes('"observability"'), 'Cloudflare observability is enabled in Wrangler');
requireCheck(wrangler.includes('"invocation_logs": true'), 'Cloudflare invocation logs are enabled');
requireCheck(wrangler.includes('"head_sampling_rate": 1'), 'Cloudflare head sampling preserves all invocations');

for (const target of ['/api/health','/api/categories','/api/stores?limit=12','/api/products?limit=12','/api/__p6_reliability_unknown__']) {
  requireCheck(probe.includes(target), `production probe covers ${target}`);
}
requireCheck(probe.includes("method: 'GET'"), 'production probe is read-only');
forbid(/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i, probe, 'production probe contains no mutation method');
requireCheck(probe.includes('X-Request-Id diagnostic header'), 'production probe verifies correlation headers');
requireCheck(probe.includes('Server-Timing'), 'production probe verifies latency diagnostics');
requireCheck(probe.includes('p95LimitMs'), 'production probe enforces p95 latency ceiling');
requireCheck(probe.includes('status_5xx: 0'), 'production report certifies zero 5xx');
requireCheck(probe.includes('success_rate: 1'), 'production report certifies 100% probe availability');

requireCheck(workflow.includes('name: P6 Production Reliability'), 'P6 final reliability workflow exists');
requireCheck(workflow.includes('schedule:'), 'P6 reliability workflow has recurring production monitoring');
requireCheck(workflow.includes("cron: '17 * * * *'"), 'P6 production monitoring runs hourly');
requireCheck(workflow.includes('npm run test:p6-final'), 'workflow runs static P6 final contract');
requireCheck(workflow.includes('node scripts/wait-cloudflare-deploy.mjs'), 'push certification waits for exact Cloudflare deployment');
requireCheck(workflow.includes('node scripts/p6-production-reliability-probe.mjs'), 'workflow runs live production reliability probe');
requireCheck(workflow.includes('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'), 'checkout action stays SHA-pinned');
requireCheck(workflow.includes('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'), 'setup-node action stays SHA-pinned');
requireCheck(workflow.includes('upload-artifact@'), 'reliability report is preserved as a workflow artifact');

for (const heading of ['Service level objectives','Telemetry privacy','Incident triage','Rollback and recovery']) {
  requireCheck(docs.includes(heading), `runbook includes ${heading}`);
}
requireCheck(docs.includes('99.9%'), 'runbook defines availability SLO');
requireCheck(docs.includes('p95'), 'runbook defines latency objective');
requireCheck(docs.includes('X-Request-Id'), 'runbook documents correlation workflow');

requireCheck(pkg.scripts?.['test:p6-final'] === 'node scripts/validate-p6-final-reliability.mjs', 'package exposes P6 final contract');
requireCheck(pkg.scripts?.['probe:p6-production'] === 'node scripts/p6-production-reliability-probe.mjs', 'package exposes P6 live reliability probe');
requireCheck(String(pkg.scripts?.validate || '').includes('npm run test:p6-final'), 'canonical validation includes P6 final reliability');

console.log(`\nP6 final observability + reliability contract: PASS (${checks.length} checks)`);
