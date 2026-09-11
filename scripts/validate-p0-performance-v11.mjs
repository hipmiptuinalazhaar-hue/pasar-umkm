import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const instant = read('js/instant-shell-v11.js');
const seo = read('src/seo-worker-entry.js');
const v10a = read('js/performance-v10-a.js');
const v1 = read('js/v1-completion.js');

const assertions = [
  ['instant shell v11.3', instant.includes("version === '11.3'") && instant.includes("version: '11.3'")],
  ['session prewarm is memoized', instant.includes('__pumkmV11Memoized') && instant.includes('authPromise')],
  ['critical public requests start in parallel', instant.includes('Promise.allSettled')],
  ['categories prewarm exact', instant.includes("'/api/categories'")],
  ['stores prewarm exact', instant.includes("'/api/stores?limit=24'")],
  ['products prewarm exact', instant.includes("'/api/products?limit=24'")],
  ['posts prewarm exact', instant.includes("'/api/posts'")],
  ['trust acceleration scoped', instant.includes("doc.getElementById('feed') || doc.body")],
  ['recommendations refresh eagerly', instant.includes('refreshDiscovery')],
  ['seller operations refresh eagerly', instant.includes('refreshSeller')],
  ['HTML remains fresh', seo.includes('no-cache, max-age=0, must-revalidate')],
  ['recommendation CSS critical', seo.includes('data-critical-v1-ui="v11"')],
  ['recommendation runtime eager', seo.includes('data-v11-critical="recommendation-ui"')],
  ['commerce runtime eager', seo.includes('data-v11-critical="commerce-navigation"')],
  ['trust runtime eager', seo.includes('data-v11-critical="trust-evidence"')],
  ['instant shell eager', seo.includes('data-v11-critical="instant-shell"')],
  ['V10 request coalescing retained', v10a.includes('responseCache.set(key') && v10a.includes('cached?.expiresAt > now')],
  ['V1 recommendations use evidence', v1.includes('/api/ratings/summaries') && v1.includes('rankingScore')],
  ['V1 seller center parallel requests', v1.includes("api('/api/commerce/orders?scope=seller')") && v1.includes("api('/api/products/me')")]
];

const failed = assertions.filter(([, ok]) => !ok);
for (const [name, ok] of assertions) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}

if (failed.length) {
  console.error(`P0 performance contract failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}

console.log(`P0 performance contract passed (${assertions.length}/${assertions.length}).`);
