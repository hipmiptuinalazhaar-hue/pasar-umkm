import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('css/p2-final-polish.css');
const js = read('js/p2-final-ux.js');
const worker = read('src/seo-worker-entry.js');

const checks = [
  ['P2 stylesheet exists', css.includes('P2 FINAL UX / ACCESSIBILITY POLISH')],
  ['focus-visible ring', css.includes(':focus-visible') && css.includes('outline: 3px solid')],
  ['44px touch target', css.includes('min-height: 44px') && css.includes('min-width: 44px')],
  ['safe-area support', css.includes('env(safe-area-inset-bottom')],
  ['reduced motion support', css.includes('prefers-reduced-motion: reduce')],
  ['high contrast support', css.includes('prefers-contrast: more')],
  ['mobile input zoom protection', css.includes('font-size: max(16px, 1em)')],
  ['notification readable typography', css.includes('.notification-message { font-size: 12px')],
  ['overflow hardening', css.includes('overflow-wrap: anywhere') && css.includes('overflow-x: clip')],
  ['P2 runtime versioned', js.includes("version: '2.0'")],
  ['skip link installed', js.includes("link.className = 'skip-link'")],
  ['escape closes top layer', js.includes("event.key === 'Escape'") && js.includes('closeTopLayer()')],
  ['dialog tab trap', js.includes("event.key !== 'Tab'") && js.includes('focusables(modal)')],
  ['focus restoration', js.includes('lastTrigger.focus({ preventScroll: true })')],
  ['aria-expanded synchronization', js.includes("setAttribute('aria-expanded'")],
  ['aria-current synchronization', js.includes("setAttribute('aria-current', 'page')")],
  ['dynamic image hardening', js.includes("img:not([alt])") && js.includes("img:not([decoding])")],
  ['P2 CSS shipped by production worker', worker.includes('P2_STYLE') && worker.includes('data-p2-final-ui="true"')],
  ['P2 JS shipped by production worker', worker.includes('P2_RUNTIME') && worker.includes('data-p2-final-runtime="true"')],
  ['P2 runtime policy active', worker.includes('p2-finalized-v13')]
];

let failed = 0;
for (const [name, ok] of checks) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

if (failed) {
  console.error(`P2 Final UX validation failed: ${failed}/${checks.length} checks.`);
  process.exit(1);
}

console.log(`P2 Final UX validation passed: ${checks.length}/${checks.length} checks.`);
