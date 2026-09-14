import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const pkg = JSON.parse(read('package.json'));
const browser = read('scripts/browser-release-smoke.mjs');
const critical = read('scripts/browser-p5-critical-surfaces-v2.mjs');
const load = read('scripts/load-smoke-v1.mjs');
const postDeploy = read('scripts/post-deploy-smoke.mjs');
const waiter = read('scripts/wait-cloudflare-deploy.mjs');
const docs = read('docs/LOCAL_RELEASE_PROCESS.md');

const checks = [];
const requireContract = (condition, message) => {
  if (!condition) throw new Error(`P5 RELEASE FAIL: ${message}`);
  checks.push(message);
  console.log(`P5 RELEASE PASS: ${message}`);
};

for (const viewport of ['360x800', '390x844', '430x932', '768x1024', '1024x768', '1280x800', '1600x900']) {
  requireContract(browser.includes(viewport), `real browser matrix includes ${viewport}`);
}
requireContract(browser.includes('Page.captureScreenshot'), 'browser probe captures real rendered screenshots');
requireContract(browser.includes('Emulation.setDeviceMetricsOverride'), 'browser probe applies actual viewport metrics');
requireContract(browser.includes('horizontal overflow'), 'browser probe rejects horizontal overflow');
requireContract(browser.includes('runtime JS errors'), 'browser probe fails on runtime JavaScript errors');
requireContract(!/\.click\s*\(/.test(browser), 'production viewport matrix performs no scripted clicks');
requireContract(!/method\s*:\s*['\"](?:POST|PUT|PATCH|DELETE)['\"]/i.test(browser), 'viewport matrix contains no mutating HTTP method');

for (const route of ['/checkout/', '/purchases/', '/seller-orders/', '/support/', '/admin/']) {
  requireContract(critical.includes(`'${route}'`), `critical-surface browser covers ${route}`);
}
requireContract(critical.includes("new Set(['POST', 'PUT', 'PATCH', 'DELETE'])"), 'critical browser explicitly identifies state-changing methods');
requireContract(critical.includes("cdp.send('Fetch.failRequest'"), 'critical browser blocks state-changing network requests');
requireContract(critical.includes('390, height: 844') && critical.includes('1280, height: 800'), 'critical shells are checked on mobile and desktop');

requireContract(load.includes('LOAD_TIERS'), 'load harness keeps explicit concurrency tiers');
requireContract(load.includes('LOAD_MIN_SUCCESS_RATE'), 'load harness enforces minimum success rate');
requireContract(load.includes('LOAD_P95_LIMIT_MS'), 'load harness enforces p95 latency ceiling');
requireContract(postDeploy.includes('/api/health'), 'post-deploy smoke verifies backend health');

requireContract(waiter.includes("execFileSync('git', ['rev-parse', 'HEAD']"), 'Cloudflare waiter can resolve the local release HEAD');
requireContract(waiter.includes("DEFAULT_REPOSITORY = 'hipmiptuinalazhaar-hue/pasar-umkm'"), 'Cloudflare waiter has the canonical repository fallback');
requireContract(waiter.includes("check?.app?.slug === 'cloudflare-workers-and-pages'"), 'Cloudflare waiter identifies the official integration');
requireContract(waiter.includes('String(check.head_sha).toLowerCase() === sha.toLowerCase()'), 'Cloudflare waiter requires the exact commit SHA');
requireContract(waiter.includes("check.status === 'completed' && check.conclusion === 'success'"), 'Cloudflare waiter fails closed until successful deployment');
requireContract(waiter.includes('terminalFailure'), 'Cloudflare waiter rejects terminal deployment failures');
requireContract(waiter.includes('if (token) headers.Authorization'), 'GitHub token is optional for local public-repo release verification');

const predeploy = String(pkg.scripts?.['release:predeploy'] || '');
const attest = String(pkg.scripts?.['release:attest-cloudflare'] || '');
const postdeploy = String(pkg.scripts?.['release:postdeploy'] || '');
requireContract(predeploy.includes('build:runtime') && predeploy.includes('validate'), 'local predeploy gate builds runtime then runs canonical validation');
requireContract(attest === 'node scripts/wait-cloudflare-deploy.mjs', 'package exposes exact-SHA Cloudflare attestation');
requireContract(postdeploy.startsWith('npm run release:attest-cloudflare &&'), 'postdeploy verification waits for exact Cloudflare deployment first');
requireContract(postdeploy.includes('smoke:post-deploy'), 'local postdeploy gate runs HTTP smoke');
requireContract(postdeploy.includes('probe:p6-production') && postdeploy.includes('probe:p7-production'), 'local postdeploy gate runs reliability and launch probes');
requireContract(postdeploy.includes('probe:p8-scale-production') && postdeploy.includes('probe:p9-security'), 'local postdeploy gate runs scale and security probes');
requireContract(String(pkg.scripts?.validate || '').includes('test:p5-release'), 'canonical validation includes P5 release contract');
requireContract(String(pkg.scripts?.validate || '').includes('test:auth-v2'), 'canonical validation includes Auth V2 behavioral contract');

requireContract(docs.includes('npm run release:predeploy'), 'release documentation defines predeploy gate');
requireContract(docs.includes('npm run release:attest-cloudflare'), 'release documentation defines exact-SHA deployment attestation');
requireContract(docs.includes('Cloudflare'), 'release documentation identifies Cloudflare as deployment target');
requireContract(docs.includes('npm run release:postdeploy'), 'release documentation defines postdeploy verification');
requireContract(docs.includes('GitHub Actions tidak digunakan'), 'release documentation explicitly records the no-Actions policy');

console.log(`\nP5 local release verification contract: PASS (${checks.length} checks)`);
