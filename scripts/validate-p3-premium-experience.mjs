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
expect(loader.includes('js/p3-premium-experience.js?v=1.0'), 'P6 loader lazy-loads premium controller');
expect(loader.includes('function ensurePremiumExperience()'), 'premium lazy loader has one reusable gate');
expect(loader.includes('runIdle(() => ensurePremiumExperience().catch(() => null),1200)'), 'premium experience is scheduled after critical render');

const initialScripts = [...index.matchAll(/<script[^>]+src="js\//g)].length;
const initialStyles = [...index.matchAll(/<link[^>]+href="css\//g)].length;
expect(initialScripts === 4, `critical shell keeps exactly four first-party scripts (${initialScripts})`);
expect(initialStyles === 5, `critical shell keeps exactly five first-party stylesheets (${initialStyles})`);
expect(stat('index.html').size <= 16_000, 'critical HTML stays within 16 KB P6 budget');
expect(stat('js/account-resilience.js').size <= 18_000, 'P6 loader stays within 18 KB budget after premium gate');

expect(css.includes(':focus-visible'), 'keyboard focus-visible contract exists');
expect(css.includes('min-height: 44px') || css.includes('min-height:44px'), '44px touch target contract exists');
expect(css.includes('prefers-reduced-motion'), 'reduced-motion accessibility is supported');
expect(css.includes('prefers-contrast: more'), 'increased contrast preference is supported');
expect(css.includes('forced-colors: active'), 'forced-colors/high-contrast mode is supported');
expect(css.includes('safe-bottom'), 'safe-area bottom handling is preserved');
expect(css.includes('content-visibility: auto'), 'long-feed render optimization exists');
expect(css.includes('.p3-connectivity'), 'connectivity status presentation exists');

expect(js.includes("window.addEventListener('offline'"), 'offline event is handled');
expect(js.includes("window.addEventListener('online'"), 'online recovery event is handled');
expect(js.includes("event.key !== 'Escape'"), 'Escape closes search surface');
expect(js.includes("setAttribute('aria-current', 'page')"), 'active navigation state is synchronized to aria-current');
expect(js.includes("setAttribute('aria-expanded'"), 'overlay opener state is synchronized to aria-expanded');
expect(js.includes("setAttribute('aria-controls'"), 'overlay controls are linked with aria-controls');
expect(js.includes("role', 'status'"), 'loading/connectivity status semantics exist');
expect(js.includes("className = 'p3-skip-link'"), 'skip-link enhancement exists');

for (const forbidden of ['eval(', 'new Function(', 'document.write(']) {
  expect(!js.includes(forbidden), `premium controller avoids ${forbidden}`);
}

const cssBytes = stat('css/p3-premium-experience.css').size;
const jsBytes = stat('js/p3-premium-experience.js').size;
console.log(`P3 deferred footprint: CSS ${cssBytes} bytes, JS ${jsBytes} bytes`);
expect(cssBytes <= 18_000, 'premium CSS stays within 18 KB source budget');
expect(jsBytes <= 12_000, 'premium JS stays within 12 KB source budget');

if (process.exitCode) process.exit(process.exitCode);
console.log('P3 premium product experience contract: PASS');
