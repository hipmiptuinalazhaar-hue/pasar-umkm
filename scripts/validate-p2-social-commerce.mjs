import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const fail = message => {
  console.error(`P2 Social-Commerce validation failed: ${message}`);
  process.exitCode = 1;
};
const requireText = (text, marker, label) => {
  if (!text.includes(marker)) fail(`missing ${label}: ${marker}`);
};
const forbidText = (text, marker, label) => {
  if (text.includes(marker)) fail(`forbidden ${label}: ${marker}`);
};

const jsPath = 'js/p2-social-commerce.js';
const cssPath = 'css/p2-social-commerce.css';
const p8Path = 'js/p8-commerce-integration.js';
const resiliencePath = 'js/account-resilience.js';
const performancePath = 'js/performance-v10-a.js';
const indexPath = 'index.html';

for (const path of [jsPath, cssPath, p8Path, resiliencePath, performancePath, indexPath]) {
  if (!fs.existsSync(path)) fail(`required file does not exist: ${path}`);
}

if (!process.exitCode) {
  const js = read(jsPath);
  const css = read(cssPath);
  const p8 = read(p8Path);
  const resilience = read(resiliencePath);
  const performance = read(performancePath);
  const index = read(indexPath);

  const jsBytes = fs.statSync(jsPath).size;
  const cssBytes = fs.statSync(cssPath).size;
  const resilienceBytes = fs.statSync(resiliencePath).size;
  const performanceBytes = fs.statSync(performancePath).size;
  console.log(`P2 social-commerce JS: ${jsBytes} / 12000 bytes`);
  console.log(`P2 social-commerce CSS: ${cssBytes} / 8000 bytes`);
  console.log(`Account resilience loader: ${resilienceBytes} / 18000 bytes`);
  console.log(`V10 performance bootstrap: ${performanceBytes} / 12000 bytes`);
  if (jsBytes > 12_000) fail(`JS budget exceeded: ${jsBytes} > 12000`);
  if (cssBytes > 8_000) fail(`CSS budget exceeded: ${cssBytes} > 8000`);
  if (resilienceBytes > 18_000) fail(`account-resilience budget exceeded: ${resilienceBytes} > 18000`);
  if (performanceBytes > 12_000) fail(`performance bootstrap budget exceeded: ${performanceBytes} > 12000`);

  for (const [marker, label] of [
    ["version: '1.0'", 'P2 public version'],
    ['MutationObserver', 'DOM enhancement observer'],
    ['requestAnimationFrame', 'batched enhancement scheduling'],
    ['data-p2-product-detail', 'product media detail ownership'],
    ["media.dataset.action = 'product-detail'", 'existing product-detail router reuse'],
    ["media.setAttribute('tabindex', '0')", 'keyboard focusability'],
    ["['Enter', ' '].includes(event.key)", 'keyboard activation'],
    ['verified-badge', 'verified seller trust cue'],
    ['Stok habis', 'sold-out cue'],
    ['Sisa ${stock}', 'low-stock cue'],
    ['getDiagnostics', 'client diagnostics surface']
  ]) requireText(js, marker, label);

  for (const marker of ['/api/', 'fetch(']) forbidText(js, marker, 'network ownership in presentation-only P2 module');

  for (const [marker, label] of [
    ['content-visibility: auto', 'offscreen rendering optimization'],
    ['contain-intrinsic-size: auto 680px', 'intrinsic feed sizing'],
    ['min-height: 48px', 'commerce CTA touch target'],
    [':focus-visible', 'keyboard focus treatment'],
    ['@media (hover: hover) and (pointer: fine)', 'fine-pointer enhancement isolation'],
    ['@media (prefers-reduced-motion: reduce)', 'reduced-motion handling']
  ]) requireText(css, marker, label);

  for (const marker of ['linear-gradient(', 'radial-gradient(', 'backdrop-filter:', '-webkit-backdrop-filter:']) {
    forbidText(css, marker, 'decorative performance-heavy CSS');
  }

  for (const [marker, label] of [
    ['loadP2SocialCommerce', 'P8 P2 lazy loader'],
    ['js/p2-social-commerce.js?v=1.0', 'P2 JS lazy asset'],
    ['css/p2-social-commerce.css?v=1.0', 'P2 CSS lazy asset'],
    ['navigator.connection', 'network capability detection'],
    ['saveData', 'Save-Data contract'],
    ['effectiveType', 'network class contract'],
    ['IntersectionObserver', 'near-viewport speculative loader'],
    ['pointerdown', 'intent prewarm'],
    ['focusin', 'keyboard intent prewarm'],
    ["rootMargin:'480px 0px'", 'near-viewport preload boundary']
  ]) requireText(p8, marker, label);

  for (const [marker, label] of [
    ['window.PasarP2Performance', 'P2 performance diagnostics surface'],
    ['function capability()', 'adaptive bootstrap capability detector'],
    ["? ['/api/categories']", 'constrained bootstrap request reduction'],
    ["network.effectiveType === '3g'", '3G reduced bootstrap path'],
    ["['slow-2g', '2g'].includes(effectiveType)", '2G constrained-network contract'],
    ['hardwareConcurrency', 'CPU capability contract'],
    ['deviceMemory', 'memory capability contract'],
    ['PUBLIC_CACHE_TTL_MS = 20_000', 'public response coalescing TTL'],
    ['installIntentGate', 'intent-gated lazy delivery'],
    ['stopImmediatePropagation', 'safe legacy-action interception'],
    ['replaying', 'post-load action replay guard']
  ]) requireText(performance, marker, label);

  for (const [marker, label] of [
    ["document.visibilityState === 'hidden'", 'hidden-tab warmup guard'],
    ["device.effectiveType === '3g'", '3G reduced enhancement warmup'],
    ['device.constrained || device.lowEnd', 'low-end enhancement suppression'],
    ["window.PasarPerformanceV10.load('saved')", 'saved feature delegated to V10 graph'],
    ['requestIdleCallback', 'idle enhancement scheduling']
  ]) requireText(resilience, marker, label);

  for (const asset of ['js/p2-social-commerce.js', 'css/p2-social-commerce.css']) forbidText(index, asset, 'P2 asset in initial HTML payload');
  for (const asset of ['js/p8-commerce-integration.js', 'js/account-resilience.js', 'js/profile-saved.js', 'js/chat-single-render-v6.js']) {
    forbidText(index, `src="${asset}`, `${asset} in initial HTML payload`);
    requireText(performance, asset, `${asset} V10 lazy ownership`);
  }

  if (!/js\/performance-v10-a\.js\?v=[^"']+/.test(index)) fail('missing V10 deterministic runtime entry');
  if (!/js\/app\.runtime\.js\?v=[0-9a-f]{12}/.test(index)) fail('missing app deterministic runtime fingerprint');
}

if (!process.exitCode) console.log('P2 Social-Commerce validation passed.');
