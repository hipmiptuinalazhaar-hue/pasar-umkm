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
const indexPath = 'index.html';

for (const path of [jsPath, cssPath, p8Path, resiliencePath, indexPath]) {
  if (!fs.existsSync(path)) fail(`required file does not exist: ${path}`);
}

if (!process.exitCode) {
  const js = read(jsPath);
  const css = read(cssPath);
  const p8 = read(p8Path);
  const resilience = read(resiliencePath);
  const index = read(indexPath);

  const jsBytes = fs.statSync(jsPath).size;
  const cssBytes = fs.statSync(cssPath).size;
  const resilienceBytes = fs.statSync(resiliencePath).size;
  console.log(`P2 social-commerce JS: ${jsBytes} / 12000 bytes`);
  console.log(`P2 social-commerce CSS: ${cssBytes} / 8000 bytes`);
  console.log(`Account resilience loader: ${resilienceBytes} / 18000 bytes`);
  if (jsBytes > 12_000) fail(`JS budget exceeded: ${jsBytes} > 12000`);
  if (cssBytes > 8_000) fail(`CSS budget exceeded: ${cssBytes} > 8000`);
  if (resilienceBytes > 18_000) fail(`account-resilience budget exceeded: ${resilienceBytes} > 18000`);

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

  for (const marker of ['/api/', 'fetch(']) {
    forbidText(js, marker, 'network ownership in presentation-only P2 module');
  }

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
    ['function networkCapability()', 'adaptive bootstrap capability detector'],
    ["network.constrained ? ['/api/categories'] : [...warmPaths]", 'constrained bootstrap request reduction'],
    ["document.visibilityState === 'hidden'", 'hidden-tab warmup guard'],
    ["network.effectiveType === '3g'", '3G reduced warmup path'],
    ["['slow-2g','2g'].includes(effectiveType)", '2G constrained-network contract'],
    ["document.addEventListener('focusin'", 'keyboard intent loading in core loader'],
    ['requestIdleCallback', 'idle warmup scheduling'],
    ['PUBLIC_CACHE_TTL_MS = 20_000', 'public response coalescing TTL']
  ]) requireText(resilience, marker, label);

  for (const asset of ['js/p2-social-commerce.js', 'css/p2-social-commerce.css']) {
    forbidText(index, asset, 'P2 asset in initial HTML payload');
  }

  for (const [pattern, label] of [
    [/js\/p8-commerce-integration\.js\?v=[0-9a-f]{12}/, 'P8 deterministic runtime fingerprint'],
    [/js\/account-resilience\.js\?v=[0-9a-f]{12}/, 'account-resilience deterministic runtime fingerprint']
  ]) {
    if (!pattern.test(index)) fail(`missing ${label}`);
  }
}

if (!process.exitCode) {
  console.log('P2 Social-Commerce validation passed.');
}