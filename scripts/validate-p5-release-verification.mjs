import { readFileSync } from 'node:fs';

const files = {
  wait: readFileSync('scripts/wait-cloudflare-deploy.mjs', 'utf8'),
  browser: readFileSync('scripts/browser-release-smoke.mjs', 'utf8'),
  workflow: readFileSync('.github/workflows/p5-real-release-verification.yml', 'utf8'),
  postDeploy: readFileSync('.github/workflows/post-deploy-smoke.yml', 'utf8'),
  packageJson: readFileSync('package.json', 'utf8')
};

const checks = [];
const requireContract = (condition, message) => {
  if (!condition) throw new Error(`P5 RELEASE FAIL: ${message}`);
  checks.push(message);
  console.log(`P5 RELEASE PASS: ${message}`);
};

requireContract(files.wait.includes('/commits/${sha}/check-runs'), 'deployment waiter is commit-SHA scoped');
requireContract(files.wait.includes("cloudflare-workers-and-pages"), 'deployment waiter identifies Cloudflare GitHub App checks');
requireContract(files.wait.includes("check.conclusion === 'success'"), 'deployment waiter requires successful Cloudflare conclusion');
requireContract(files.wait.includes('terminalFailure'), 'deployment waiter fails closed on terminal deployment failure');
requireContract(files.wait.includes('No Cloudflare deployment check appeared'), 'deployment waiter fails closed when no matching deploy appears');

for (const viewport of ['360x800', '390x844', '430x932', '768x1024', '1024x768', '1280x800', '1600x900']) {
  requireContract(files.browser.includes(viewport), `real browser matrix includes ${viewport}`);
}
requireContract(files.browser.includes('Page.captureScreenshot'), 'browser probe captures real rendered screenshots');
requireContract(files.browser.includes('Emulation.setDeviceMetricsOverride'), 'browser probe applies actual viewport metrics');
requireContract(files.browser.includes('horizontal overflow'), 'browser probe rejects horizontal overflow');
requireContract(files.browser.includes('categories did not hydrate'), 'browser probe waits for live category hydration');
requireContract(files.browser.includes('runtime JS errors'), 'browser probe fails on runtime JavaScript errors');
requireContract(files.browser.includes('primary CTA touch target'), 'browser probe checks minimum primary touch target');
requireContract(!/\.click\s*\(/.test(files.browser), 'production browser probe performs no scripted clicks');
requireContract(!/method\s*:\s*['\"](?:POST|PUT|PATCH|DELETE)['\"]/i.test(files.browser), 'production browser probe contains no mutating HTTP method');

requireContract(files.workflow.includes('checks: read'), 'P5 workflow can read exact deployment check-runs');
requireContract(files.workflow.includes('node scripts/wait-cloudflare-deploy.mjs'), 'P5 workflow waits for exact Cloudflare deployment');
requireContract(files.workflow.includes('node scripts/browser-release-smoke.mjs'), 'P5 workflow runs real browser verification');
requireContract(files.workflow.indexOf('wait-cloudflare-deploy.mjs') < files.workflow.indexOf('browser-release-smoke.mjs'), 'browser verification runs only after deployment attestation');
requireContract(files.workflow.includes('google-chrome --version'), 'P5 workflow proves a real Chrome binary is present');
requireContract(files.workflow.includes('P5_BASE_URL: https://pasar-umkm.hipmiptuinalazhaar.workers.dev'), 'P5 production browser target is explicit');

requireContract(files.postDeploy.includes('checks: read'), 'post-deploy smoke can read Cloudflare check-runs');
requireContract(files.postDeploy.includes('node scripts/wait-cloudflare-deploy.mjs'), 'post-deploy smoke waits for exact Cloudflare deployment');
requireContract(files.postDeploy.indexOf('wait-cloudflare-deploy.mjs') < files.postDeploy.indexOf('post-deploy-smoke.mjs'), 'post-deploy HTTP smoke occurs after deployment attestation');
requireContract(files.packageJson.includes('"test:p5-release"'), 'P5 static release contract is exposed through package scripts');
requireContract(files.packageJson.includes('npm run test:p5-release'), 'canonical validation includes P5 release contract');

console.log(`\nP5 real release verification contract: PASS (${checks.length} checks)`);
