import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const worker = read('src/worker-entry.js');
const index = read('index.html');
const resilience = read('js/bootstrap-resilience-v1.js');
const pkg = JSON.parse(read('package.json'));

const checks = [
  ['homepage bootstrap read fast-path list exists', worker.includes('BOOTSTRAP_PUBLIC_READ_PATHS') && worker.includes('"/api/auth/me"') && worker.includes('"/api/categories"') && worker.includes('"/api/stores"') && worker.includes('"/api/products"') && worker.includes('"/api/posts"')],
  ['bootstrap GETs bypass cold schema verification', worker.includes('canBypassRuntimeSchemaVerification(request, url)') && worker.includes('if (!canBypassRuntimeSchemaVerification(request, url))')],
  ['auth maintenance runs after observed response', worker.indexOf('const response = await observeRequest') < worker.indexOf('ctx.waitUntil(maybeCleanupAuthState')),
  ['maintenance is scoped to health/auth traffic', worker.includes('maintenanceEligible') && worker.includes('url.pathname.startsWith("/api/auth/")')],
  ['blocking loader has bounded lifetime', resilience.includes('MAX_BLOCKING_LOADER_MS = 4500') && resilience.includes("release('soft-timeout')")],
  ['resilience releases on runtime failures', resilience.includes("release('runtime-error')") && resilience.includes("release('runtime-rejection')")],
  ['resilience loads before app runtime', index.indexOf('bootstrap-resilience-v1.js') >= 0 && index.indexOf('bootstrap-resilience-v1.js') < index.indexOf('js/app.runtime.js')],
  ['validator is canonical', String(pkg.scripts?.validate || '').includes('test:bootstrap-resilience')]
];

let failed = 0;
for (const [label, ok] of checks) {
  if (ok) console.log('PASS', label);
  else { failed += 1; console.error('FAIL', label); }
}
if (failed) process.exit(1);
console.log(`Bootstrap resilience validation passed: ${checks.length} assertions.`);
