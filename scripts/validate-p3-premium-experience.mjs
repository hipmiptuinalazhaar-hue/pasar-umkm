import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const stat = file => fs.statSync(path.join(root, file));
const fail = message => {
  console.error(`P3 FAIL: ${message}`);
  process.exitCode = 1;
};
const pass = message => console.log(`P3 PASS: ${message}`);
const expect = (condition, message) => condition ? pass(message) : fail(message);

const index = read('index.html');
const loader = read('js/account-resilience.js');
const css = read('css/p3-premium-experience.css');
const js = read('js/p3-premium-experience.js');

expect(!index.includes('css/p3-premium-experience.css?v='), 'premium CSS is excluded from critical HTML');
expect(!index.includes('js/p3-premium-experience.js?v='), 'premium controller is excluded from critical HTML');
expect(loader.includes('css/p3-premium-experience.css?v=1.0'), 'P6 loader lazy-loads premium CSS');
expect(loader.includes('js/p3-premium-experience.js?v=1.1'), 'P6 loader lazy-loads refreshed premium controller');
expect(loader.includes('function ensurePremiumExperience()'), 'premium lazy loader has one reusable gate');
expect(loader.includes('runIdle(() => ensurePremiumExperience().catch(() => null),1200)'), 'premium experience is scheduled after critical render on normal networks');
expect(/if\s*\(network\.constrained\)[\s\S]{0,220}?ensurePremiumExperience/.test(loader), 'constrained networks delay rather than remove functional premium chain');
expect(loader.includes("document.addEventListener('visibilitychange', start"), 'hidden startup resumes deferred functional loading when visible');

const initialScripts = [...index.matchAll(/<script[^>]+src="js\//g)].length;
const initialStyles = [...index.matchAll(/<link[^>]+href="css\//g)].length;
expect(initialScripts === 5, `critical shell keeps exactly five first-party scripts including checkout router (${initialScripts})`);
expect(index.includes('js/p8-commerce-integration.js?v='), 'critical shell includes cache-safe checkout routing');
expect(initialStyles === 5, `critical shell keeps exactly five first-party stylesheets (${initialStyles})`);
expect(stat('index.html').size <= 18_000, 'critical HTML stays within 18 KB P6+commerce budget');
expect(stat('js/account-resilience.js').size <= 18_000, 'P6 loader stays within 18 KB budget after adaptive functional gate');

expect(js.includes("revision: '2.1'"), 'P3 v2.1 controller revision is declared');
expect(js.includes("js/v1-completion.js?v=1.1"), 'P3 refreshes V1 completion cache key');
expect(js.includes("css/p7-launch-growth.css?v=1.1"), 'P3 refreshes P7 presentation cache key');
expect(js.includes('function trapFocus('), 'dialog focus trap exists');
expect(js.includes("event.key !== 'Tab'"), 'focus trap is Tab-specific');
expect(js.includes("event.key === 'Escape'"), 'Escape closes active dialog surfaces');
expect(js.includes("setAttribute('aria-modal', 'true')"), 'dialog surfaces expose aria-modal');
expect(js.includes("setAttribute('aria-controls'"), 'dialog openers expose aria-controls');
expect(js.includes("setAttribute('aria-current', 'page')"), 'active navigation state is synchronized to aria-current');
expect(js.includes("className = 'p3-route-status p3-sr-only'"), 'route announcement live region exists');
expect(js.includes('Halaman ${activeLabel} dibuka.'), 'route changes are announced');
expect(js.includes("setAttribute('aria-busy'"), 'loading semantics expose aria-busy');
expect(js.includes("window.addEventListener('offline'"), 'offline event is handled');
expect(js.includes("window.addEventListener('online'"), 'online recovery event is handled');
expect(js.includes("className = 'p3-skip-link'"), 'skip-link enhancement exists');
expect(js.includes('getClientRects().length > 0'), 'focus trap filters hidden controls');

expect(css.includes(':focus-visible'), 'keyboard focus-visible contract exists');
expect(css.includes('min-height: 44px') || css.includes('min-height:44px'), '44px touch target contract exists');
expect(css.includes('prefers-reduced-motion'), 'reduced-motion accessibility is supported');
expect(css.includes('prefers-reduced-transparency'), 'reduced-transparency preference is supported');
expect(css.includes('prefers-contrast: more'), 'increased contrast preference is supported');
expect(css.includes('forced-colors: active'), 'forced-colors/high-contrast mode is supported');
expect(css.includes('safe-bottom'), 'safe-area bottom handling is preserved');
expect(css.includes('content-visibility: auto'), 'long-feed render optimization exists');
expect(css.includes('.p3-connectivity'), 'connectivity status presentation exists');
expect(css.includes('.p3-route-status'), 'route status helper is visually hidden');
expect(!css.includes('backdrop-filter:'), 'premium v2 avoids backdrop-filter on low-end devices');
expect(!css.includes('-webkit-backdrop-filter:'), 'premium v2 avoids prefixed backdrop-filter on low-end devices');

for (const forbidden of ['eval(', 'new Function(', 'document.write(']) {
  expect(!js.includes(forbidden), `premium controller avoids ${forbidden}`);
}

const cssBytes = stat('css/p3-premium-experience.css').size;
const jsBytes = stat('js/p3-premium-experience.js').size;
console.log(`P3 deferred footprint: CSS ${cssBytes} bytes, JS ${jsBytes} bytes`);
expect(cssBytes <= 18_000, 'premium CSS stays within 18 KB source budget');
expect(jsBytes <= 12_000, 'premium JS stays within 12 KB source budget');

if (process.exitCode) process.exit(process.exitCode);
console.log('P3 premium product experience v2.1 contract: PASS');