import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const observability = read('src/observability.js');
const worker = read('src/worker-entry.js');
const wrangler = read('wrangler.jsonc');
const probe = read('scripts/p6-production-reliability-probe.mjs');
const docs = read('docs/P6_OBSERVABILITY_RELIABILITY.md');
const release = read('docs/LOCAL_RELEASE_PROCESS.md');
const pkg = JSON.parse(read('package.json'));

const checks = [];
const requireCheck = (condition, message) => {
  if (!condition) throw new Error(`P6 RELIABILITY FAIL: ${message}`);
  checks.push(message);
  console.log(`P6 RELIABILITY PASS: ${message}`);
};
const forbid = (pattern, value, message) => requireCheck(!pattern.test(value), message);

requireCheck(worker.includes('observeRequest(request, env, ctx, routeRequest)'), 'all Worker requests pass through observability wrapper');
requireCheck(observability.includes('p6-reliability-v2'), 'versioned observability policy is active');
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
requireCheck(observability.includes('sanitizeServerErrorResponse'), '5xx responses are sanitized before reaching clients');
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

for (const heading of ['Service level objectives','Telemetry privacy','Incident triage','Rollback and recovery']) {
  requireCheck(docs.includes(heading), `runbook includes ${heading}`);
}
requireCheck(docs.includes('99.9%'), 'runbook defines availability SLO');
requireCheck(docs.includes('p95'), 'runbook defines latency objective');
requireCheck(docs.includes('X-Request-Id'), 'runbook documents correlation workflow');

requireCheck(release.includes('npm run release:predeploy'), 'local release docs define predeploy gate');
requireCheck(release.includes('npm run release:postdeploy'), 'local release docs define postdeploy gate');
requireCheck(release.includes('GitHub Actions tidak digunakan'), 'local release docs declare no-Actions model');
requireCheck(String(pkg.scripts?.['release:postdeploy'] || '').includes('probe:p6-production'), 'postdeploy gate runs P6 reliability probe');
requireCheck(pkg.scripts?.['test:p6-final'] === 'node scripts/validate-p6-final-reliability.mjs', 'package exposes P6 final contract');
requireCheck(pkg.scripts?.['probe:p6-production'] === 'node scripts/p6-production-reliability-probe.mjs', 'package exposes P6 live reliability probe');
requireCheck(String(pkg.scripts?.validate || '').includes('npm run test:p6-final'), 'canonical validation includes P6 final reliability');

console.log(`\nP6 final observability + reliability contract: PASS (${checks.length} checks)`);
