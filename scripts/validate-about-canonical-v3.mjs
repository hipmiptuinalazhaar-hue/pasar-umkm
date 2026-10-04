import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const app = read('js/app.js');
const runtime = read('js/app.runtime.js');
const about = read('js/about-experience-v2.js');
const index = read('index.html');
const pkg = JSON.parse(read('package.json'));

const legacy = 'Platform digital untuk membantu masyarakat';

const checks = [
  ['legacy About markup removed from source app', !app.includes(legacy) && !app.includes("openBottomSheet(\n    `\n      <h2 id=\"sheetTitle\">\n        Tentang Pasar UMKM")],
  ['legacy About markup removed from runtime', !runtime.includes(legacy)],
  ['source openAbout delegates only to canonical V2', app.includes("experience?.revision === '2.3'") && app.includes('experience.open();')],
  ['runtime openAbout delegates only to canonical V2', runtime.includes('experience?.revision==="2.3"') && runtime.includes('experience.open()')],
  ['About V2 has no captured legacy fallback', !about.includes('const fallback =') && !about.includes('fallback?.()')],
  ['About V2 revision is 2.3', about.includes("revision: '2.3'") && about.includes("revision === '2.3'")],
  ['About CSS is initial canonical asset', index.includes('css/about-experience-v2.css?v=canonical-2.3') && index.includes('data-about-v2-style="canonical"')],
  ['About JS is initial canonical asset', index.includes('js/about-experience-v2.js?v=canonical-2.3') && index.includes('data-about-v2-script="canonical"')],
  ['legacy lazy About click interception removed', !index.includes("t.closest('[data-menu-action=\"about\"]')&&a()") && !index.includes('window.PasarPostReleaseUX=Object.freeze({about:')],
  ['canonical validation is part of release validate', String(pkg.scripts?.validate || '').includes('test:about-canonical')]
];

let failed = 0;
for (const [label, ok] of checks) {
  if (ok) console.log('PASS', label);
  else {
    failed += 1;
    console.error('FAIL', label);
  }
}
if (failed) {
  console.error(`About canonical validation failed: ${failed} assertion(s).`);
  process.exit(1);
}
console.log(`About canonical validation passed: ${checks.length} assertions.`);
