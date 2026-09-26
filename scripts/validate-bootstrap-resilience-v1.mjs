import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const worker = read('src/worker-entry.js');
const index = read('index.html');
const resilience = read('js/bootstrap-resilience-v1.js');
const app = read('js/app.js');
const account = read('js/account-resilience.js');
const chat = read('js/chat-experience-v7.js');
const chatCss = read('css/chat-experience-v7.css');
const mobileCss = read('css/mobile-foundation-v2.css');
const navGuard = read('js/navigation-refresh-guard.js');
const about = read('js/about-experience-v2.js');
const pkg = JSON.parse(read('package.json'));

const checks = [
  ['homepage bootstrap read fast-path list exists', worker.includes('BOOTSTRAP_PUBLIC_READ_PATHS') && worker.includes('"/api/auth/me"') && worker.includes('"/api/categories"') && worker.includes('"/api/stores"') && worker.includes('"/api/products"') && worker.includes('"/api/posts"')],
  ['bootstrap GETs bypass cold schema verification', worker.includes('canBypassRuntimeSchemaVerification(request, url)') && worker.includes('if (!canBypassRuntimeSchemaVerification(request, url))')],
  ['auth maintenance runs after observed response', worker.indexOf('const response = await observeRequest') < worker.indexOf('ctx.waitUntil(maybeCleanupAuthState')),
  ['maintenance is scoped to health/auth traffic', worker.includes('maintenanceEligible') && worker.includes('url.pathname.startsWith("/api/auth/")')],
  ['blocking loader has bounded lifetime', resilience.includes('MAX_BLOCKING_LOADER_MS = 4500') && resilience.includes("release('soft-timeout')")],
  ['resilience releases on runtime failures', resilience.includes("release('runtime-error')") && resilience.includes("release('runtime-rejection')")],
  ['resilience loads before app runtime', index.indexOf('bootstrap-resilience-v1.js') >= 0 && index.indexOf('bootstrap-resilience-v1.js') < index.indexOf('js/app.runtime.js')],
  ['public bootstrap tolerates partial mobile-network failure', app.includes('async function resilientFetch') && app.includes('Promise.allSettled([\n    loadCategories(),\n    loadStores()') && app.includes('Products bootstrap network error') && app.includes('Posts bootstrap network error')],
  ['account profile cannot wait forever on lazy assets', account.includes('Timeout memuat') && account.includes('renderSocialAccountProfile(STATE.currentStore || null)')],
  ['chat requests have a bounded timeout', chat.includes("error.code = cause?.name === 'AbortError' ? 'CHAT_TIMEOUT'") && chat.includes('const timeoutMs = Number(options.timeoutMs || 12000)')],
  ['mobile chat tracks visual viewport bottom inset', chat.includes("'--chat7-offset-bottom'") && index.includes('bottom:var(--chat7-offset-bottom,0)!important') && index.includes('height:auto!important;min-height:0!important')],
  ['mobile chat can shrink below legacy 320px floor', chatCss.includes('@media (max-width:767px)') && chatCss.includes('min-height:0')],
  ['desktop footer cannot leak into phone seller pages', mobileCss.includes('.desktop-site-footer') && mobileCss.includes('display:none !important')],
  ['about V2 remains canonical and cache-busted', about.includes("revision: '2.2'") && /js\/about-experience-v2\.js\?v=[0-9a-f]{12}/.test(index) && /css\/about-experience-v2\.css\?v=[0-9a-f]{12}/.test(index)],
  ['seller center ownership assets are cache-busted', /js\/navigation-refresh-guard\.js\?v=[0-9a-f]{12}/.test(index) && /js\/commerce-experience-v2\.js\?v=[0-9a-f]{12}/.test(navGuard) && /css\/commerce-experience-v2\.css\?v=[0-9a-f]{12}/.test(navGuard)],
  ['legacy purchase label is absent from shell', !index.includes('Pembelian Saya')],
  ['validator is canonical', String(pkg.scripts?.validate || '').includes('test:bootstrap-resilience')]
];

let failed = 0;
for (const [label, ok] of checks) {
  if (ok) console.log('PASS', label);
  else { failed += 1; console.error('FAIL', label); }
}
if (failed) process.exit(1);
console.log(`Bootstrap resilience validation passed: ${checks.length} assertions.`);
