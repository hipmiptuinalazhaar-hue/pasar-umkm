import { readFileSync } from 'node:fs';

const files = {
  wait: readFileSync('scripts/wait-cloudflare-deploy.mjs', 'utf8'),
  browser: readFileSync('scripts/browser-release-smoke.mjs', 'utf8'),
  critical: readFileSync('scripts/browser-p5-critical-surfaces-v2.mjs', 'utf8'),
  load: readFileSync('scripts/load-smoke-v1.mjs', 'utf8'),
  workflow: readFileSync('.github/workflows/p5-real-release-verification.yml', 'utf8'),
  postDeploy: readFileSync('.github/workflows/post-deploy-smoke.yml', 'utf8'),
  authenticated: readFileSync('.github/workflows/authenticated-smoke-v2.yml', 'utf8'),
  docs: readFileSync('docs/P5_REAL_RELEASE_VERIFICATION.md', 'utf8'),
  packageJson: readFileSync('package.json', 'utf8')
};

const checks = [];
const requireContract = (condition, message) => {
  if (!condition) throw new Error(`P5 RELEASE FAIL: ${message}`);
  checks.push(message);
  console.log(`P5 RELEASE PASS: ${message}`);
};

requireContract(files.wait.includes('/commits/${sha}/check-runs'), 'deployment waiter is commit-SHA scoped');
requireContract(files.wait.includes('process.env.CLOUDFLARE_SHA || process.env.GITHUB_SHA'), 'deployment waiter supports explicit PR head SHA');
requireContract(files.wait.includes("cloudflare-workers-and-pages"), 'deployment waiter identifies Cloudflare GitHub App checks');
requireContract(files.wait.includes("check.conclusion === 'success'"), 'deployment waiter requires successful Cloudflare conclusion');
requireContract(files.wait.includes('terminalFailure'), 'deployment waiter fails closed on terminal deployment failure');
requireContract(files.wait.includes('No Cloudflare deployment check appeared'), 'deployment waiter fails closed when no matching deploy appears');
requireContract(files.wait.includes('Preview Alias URL:'), 'deployment waiter can resolve Cloudflare PR preview alias');
requireContract(files.wait.includes('preview_url='), 'deployment waiter exports exact preview URL to GitHub Actions');

for (const viewport of ['360x800', '390x844', '430x932', '768x1024', '1024x768', '1280x800', '1600x900']) {
  requireContract(files.browser.includes(viewport), `real browser matrix includes ${viewport}`);
}
requireContract(files.browser.includes('Page.captureScreenshot'), 'browser probe captures real rendered screenshots');
requireContract(files.browser.includes('Emulation.setDeviceMetricsOverride'), 'browser probe applies actual viewport metrics');
requireContract(files.browser.includes('horizontal overflow'), 'browser probe rejects horizontal overflow');
requireContract(files.browser.includes('categories did not hydrate'), 'browser probe waits for live category hydration');
requireContract(files.browser.includes('runtime JS errors'), 'browser probe fails on runtime JavaScript errors');
requireContract(files.browser.includes('primary CTA touch target'), 'browser probe checks minimum primary touch target');
requireContract(!/\.click\s*\(/.test(files.browser), 'production viewport matrix performs no scripted clicks');
requireContract(!/method\s*:\s*['\"](?:POST|PUT|PATCH|DELETE)['\"]/i.test(files.browser), 'viewport matrix contains no mutating HTTP method');

for (const route of ['/checkout/', '/purchases/', '/seller-orders/', '/support/', '/admin/']) {
  requireContract(files.critical.includes(`'${route}'`), `critical-surface browser covers ${route}`);
}
requireContract(files.critical.includes("'#notificationButton'"), 'critical-surface browser covers notification entry point');
requireContract(files.critical.includes("'#messageButton'"), 'critical-surface browser covers message entry point');
requireContract(files.critical.includes("'[data-nav=\"reels\"]'"), 'critical-surface browser covers Reels entry point');
requireContract(files.critical.includes("'[data-nav=\"cart\"]'"), 'critical-surface browser covers cart entry point');
requireContract(files.critical.includes("'[data-nav=\"account\"]'"), 'critical-surface browser covers account entry point');
requireContract(files.critical.includes("'[data-action=\"sell\"]'"), 'critical-surface browser covers seller entry point');
requireContract(files.critical.includes('notification-core.css'), 'critical-surface browser verifies notification stylesheet delivery');
requireContract(files.critical.includes('notification avatar width regression'), 'critical-surface browser protects notification avatar sizing');
requireContract(files.critical.includes('notification row is not grid'), 'critical-surface browser protects notification row layout');
requireContract(files.critical.includes("new Set(['POST', 'PUT', 'PATCH', 'DELETE'])"), 'critical-surface browser declares all state-changing methods');
requireContract(files.critical.includes("cdp.send('Fetch.failRequest'"), 'critical-surface browser blocks state-changing network requests');
requireContract(files.critical.includes("window.PasarPerformanceV10.openReels()"), 'critical-surface browser opens Reels through canonical runtime owner');
requireContract(files.critical.includes("STATE.activeNav==='cart'"), 'critical-surface browser verifies live SPA routing state');
requireContract(files.critical.includes("STATE.activeSheet"), 'critical-surface browser waits for asynchronous auth-sheet state');
requireContract(files.critical.includes('390, height: 844') && files.critical.includes('1280, height: 800'), 'critical route shells are checked on mobile and desktop');

const waitStepIndex = files.workflow.indexOf('- name: Wait for exact Cloudflare deployment');
const httpStepIndex = files.workflow.indexOf('- name: Run exact post-deploy HTTP smoke');
const browserStepIndex = files.workflow.indexOf('- name: Run real browser viewport matrix');
const criticalStepIndex = files.workflow.indexOf('- name: Run critical-surface browser certification');
const loadStepIndex = files.workflow.indexOf('- name: Run post-deploy public read load smoke');
requireContract(files.workflow.includes('checks: read'), 'P5 workflow can read exact deployment check-runs');
requireContract(files.workflow.includes('node scripts/wait-cloudflare-deploy.mjs'), 'P5 workflow waits for exact Cloudflare deployment');
requireContract(files.workflow.includes('PRODUCTION_BASE_URL="$P5_BASE_URL" node scripts/post-deploy-smoke.mjs'), 'P5 workflow runs post-deploy HTTP smoke against attested release');
requireContract(files.workflow.includes('node scripts/browser-release-smoke.mjs'), 'P5 workflow runs real browser viewport verification');
requireContract(files.workflow.includes('node scripts/browser-p5-critical-surfaces-v2.mjs'), 'P5 workflow runs critical-surface browser verification v2');
requireContract(files.workflow.includes('node scripts/load-smoke-v1.mjs'), 'P5 workflow runs post-deploy public read load verification');
requireContract(waitStepIndex >= 0 && httpStepIndex > waitStepIndex, 'HTTP smoke runs only after deployment attestation');
requireContract(browserStepIndex > httpStepIndex, 'browser matrix follows healthy HTTP production smoke');
requireContract(criticalStepIndex > browserStepIndex, 'critical-surface certification follows viewport matrix');
requireContract(loadStepIndex > criticalStepIndex, 'production load gate follows browser certification');
requireContract((files.workflow.match(/if: github\.event_name != 'pull_request'/g) || []).length >= 2, 'production-only HTTP and load probes are excluded from PR preview');
requireContract(files.workflow.includes('google-chrome --version'), 'P5 workflow proves a real Chrome binary is present');
requireContract(files.workflow.includes('CLOUDFLARE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}'), 'P5 PR attestation targets branch head SHA, not merge-test SHA');
requireContract(files.workflow.includes('EVENT_NAME: ${{ github.event_name }}'), 'P5 workflow distinguishes PR preview from production release');
requireContract(files.workflow.includes('PREVIEW_URL: ${{ steps.deploy.outputs.preview_url }}'), 'P5 workflow consumes exact Cloudflare preview URL');
requireContract(files.workflow.includes('Cloudflare PR preview URL missing.'), 'PR verification fails closed when preview URL is absent');
requireContract(files.workflow.includes('P5_BASE_URL=$PREVIEW_URL'), 'PR browser matrix targets candidate preview build');
requireContract(files.workflow.includes('P5_BASE_URL=https://pasar-umkm.hipmiptuinalazhaar.workers.dev'), 'main browser matrix targets production only after deploy attestation');
requireContract(files.workflow.includes("'scripts/browser-p5-critical-surfaces-v2.mjs'"), 'critical-surface test changes retrigger P5 workflow');
requireContract(files.workflow.includes("'checkout/**'") && files.workflow.includes("'support/**'") && files.workflow.includes("'seller-orders/**'"), 'critical application surface changes retrigger P5 workflow');

requireContract(files.load.includes('LOAD_TIERS'), 'load harness keeps explicit concurrency tiers');
requireContract(files.load.includes('LOAD_MIN_SUCCESS_RATE'), 'load harness enforces minimum success rate');
requireContract(files.load.includes('LOAD_P95_LIMIT_MS'), 'load harness enforces p95 latency ceiling');

requireContract(files.postDeploy.includes('checks: read'), 'standalone post-deploy smoke can read Cloudflare check-runs');
requireContract(files.postDeploy.includes('node scripts/wait-cloudflare-deploy.mjs'), 'standalone post-deploy smoke waits for exact Cloudflare deployment');
const postWaitIndex = files.postDeploy.indexOf('- name: Wait for exact Cloudflare deployment');
const postSmokeIndex = files.postDeploy.indexOf('- name: Verify deployed production');
requireContract(postWaitIndex >= 0 && postSmokeIndex > postWaitIndex, 'standalone post-deploy HTTP smoke occurs after deployment attestation');

requireContract(files.authenticated.includes('Production target rejected for stateful authenticated E2E.'), 'stateful authenticated E2E explicitly rejects production');
requireContract(files.authenticated.includes('SMOKE_EXPECT_ENVIRONMENT: staging'), 'stateful authenticated E2E requires non-production runtime identity');
requireContract(files.authenticated.includes('SMOKE_ALLOW_MUTATIONS: "true"'), 'mutation permission is explicit only in isolated authenticated workflow');
requireContract(!files.workflow.includes('SMOKE_ALLOW_MUTATIONS'), 'real browser release workflow never enables application mutations');

requireContract(files.docs.includes('read-only'), 'P5 documentation records read-only production/preview browser boundary');
requireContract(files.docs.includes('database test terisolasi'), 'P5 documentation preserves isolated stateful E2E boundary');
requireContract(files.packageJson.includes('"test:p5-release"'), 'P5 static release contract is exposed through package scripts');
requireContract(files.packageJson.includes('npm run test:p5-release'), 'canonical validation includes P5 release contract');

console.log(`\nP5 real release verification contract: PASS (${checks.length} checks)`);
