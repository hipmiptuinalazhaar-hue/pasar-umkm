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
const boot = read('js/performance-v10-a.js');
const loader = read('js/account-resilience.js');
const css = read('css/p3-premium-experience.css');
const js = read('js/p3-premium-experience.js');

expect(!index.includes('css/p3-premium-experience.css?v='), 'premium CSS is excluded from critical HTML');
expect(!index.includes('js/p3-premium-experience.js?v='), 'premium controller is excluded from critical HTML');
expect(loader.includes('css/p3-premium-experience.css?v=1.0'), 'P6 loader lazy-loads premium CSS');
expect(loader.includes('js/p3-premium-experience.js?v=1.1'), 'P6 loader lazy-loads refreshed premium controller');
expect(loader.includes('function ensurePremiumExperience()'), 'premium lazy loader has one reusable gate');
expect(loader.includes('runIdle(() => ensurePremiumExperience().catch(() => null), 1800)'), 'premium experience is scheduled after critical render on normal networks');
expect(/if\s*\(device\.constrained\s*\|\|\s*device\.lowEnd\)[\s\S]{0,220}?ensurePremiumExperience[\s\S]{0,120}?8000/.test(loader), 'constrained and low-end devices deeply defer but preserve premium accessibility chain');
expect(loader.includes("device.effectiveType === '3g'") && loader.includes('3000'), '3G devices use a separate deferred premium path');
expect(loader.includes("document.addEventListener('visibilitychange', start"), 'hidden startup resumes deferred functional loading when visible');

const initialScriptSrcs = [...index.matchAll(/<script\s+[^>]*src=["'](js\/[^"']+)["'][^>]*>/gi)].map(match => match[1]);
const initialStyleHrefs = [...index.matchAll(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["'](css\/[^"']+)["'][^>]*>/gi)].map(match => match[1]);
expect(initialScriptSrcs.length === 2, `critical shell keeps exactly two first-party scripts under V10 (${initialScriptSrcs.length})`);
expect(initialScriptSrcs[0]?.startsWith('js/performance-v10-a.js?v='), 'V10 adaptive bootstrap owns critical feature routing');
expect(initialScriptSrcs[1]?.startsWith('js/app.runtime.js?v='), 'app runtime remains the only application implementation in critical JS');
expect(/js\/p8-commerce-integration\.js\?v=[0-9a-f]{12}/.test(boot), 'V10 bootstrap includes cache-safe lazy checkout routing');
expect(boot.includes("'[data-action=\"checkout\"]'") && boot.includes('stopImmediatePropagation') && boot.includes('target.click()'), 'checkout intent is intercepted and replayed only after its owner loads');
expect(initialStyleHrefs.length === 6, `critical shell keeps exactly six direct first-party stylesheets after P2 finalization (${initialStyleHrefs.length})`);
expect(initialStyleHrefs.some(href => href.startsWith('css/p2-final-polish.css?v=')), 'P2 accessibility polish is part of the finalized critical style layer');
expect(index.includes('rel="preload" href="css/public-experience-v9.css?v='), 'V9 presentation is discovered early without becoming an extra stylesheet owner');
expect(stat('index.html').size <= 18_000, 'critical HTML stays within 18 KB P6+commerce budget');
expect(stat('js/account-resilience.js').size <= 18_000, 'P6 loader stays within 18 KB budget after adaptive functional gate');
expect(stat('js/performance-v10-a.js').size <= 12_000, 'V10 adaptive bootstrap stays within 12 KB source budget');

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
console.log('P3 premium product experience v2.1 + V10 adaptive shell contract: PASS');
