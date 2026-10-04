import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const app = read('js/app.js');
const runtime = read('js/app.runtime.js');
const perf = read('js/performance-v10-a.js');
const index = read('index.html');
const pkg = JSON.parse(read('package.json'));

const checks = [
  ['Reels nav remains visible', index.includes('data-nav="reels"')],
  ['Reels nav is marked coming soon', index.includes('data-feature-state="coming-soon"') && index.includes('fitur ini segera tersedia')],
  ['source route blocks Reels before activeNav mutation', app.includes("if (target === 'reels')") && app.includes('openReelsComingSoon();\n    return;')],
  ['runtime route blocks Reels before activeNav mutation', runtime.includes('if(target==="reels"){openReelsComingSoon();return}')],
  ['coming-soon message is exact', app.includes('Fitur ini segera tersedia') && runtime.includes('Fitur ini segera tersedia')],
  ['public Reels click no longer preloads V4', !perf.includes("e.target.closest('[data-nav=reels]')&&loaders.reels()")],
  ['performance openReels is maintenance-safe', perf.includes("openReels:()=>{window.openReelsComingSoon?.();return Promise.resolve(false)}")],
  ['app no longer calls performance Reels opener', !app.includes('PasarPerformanceV10?.openReels?.()') && !runtime.includes('PasarPerformanceV10?.openReels?.()')],
  ['obsolete auto-open hook is absent', !app.includes('[data-v10-lazy=reels]') && !runtime.includes('[data-v10-lazy=reels]')],
  ['maintenance validator is canonical', String(pkg.scripts?.validate || '').includes('test:reels-maintenance')]
];

let failed=0;
for(const [label,ok] of checks){
  if(ok) console.log('PASS',label);
  else { failed+=1; console.error('FAIL',label); }
}
if(failed) process.exit(1);
console.log(`Reels maintenance validation passed: ${checks.length} assertions.`);
