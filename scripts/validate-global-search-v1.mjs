import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const worker = read('src/worker-entry.js');
const api = read('src/global-search-api.js');
const ui = read('js/global-search-v1.js');
const index = read('index.html');
const app = read('js/app.js');
const runtime = read('js/app.runtime.js');
const pkg = JSON.parse(read('package.json'));

const checks = [
  ['global search API is routed', worker.includes('handleGlobalSearchApi') && worker.includes('"/api/search"')],
  ['API searches products', api.includes('FROM products p') && api.includes('p.is_active=TRUE')],
  ['API searches active stores', api.includes('FROM stores s') && api.includes('s.is_active=TRUE')],
  ['API searches public owner profiles', api.includes('FROM users u') && api.includes('JOIN stores s') && api.includes('u.is_active=TRUE')],
  ['API searches active categories', api.includes('FROM categories') && api.includes('is_active=TRUE')],
  ['search payload contains no private contacts', !api.includes('phone') && !api.includes('whatsapp') && !api.includes('email') && !api.includes('address')],
  ['frontend calls server-side search', ui.includes('/api/search?q=')],
  ['frontend debounces input', ui.includes('DEBOUNCE_MS = 280')],
  ['frontend cancels stale requests', ui.includes('AbortController') && ui.includes('requestSequence !== sequence')],
  ['remote products hydrate navigation state', ui.includes('appData.posts.push') && ui.includes('product-${id}')],
  ['remote stores hydrate navigation state', ui.includes('appData.stores.push')],
  ['result groups are complete', ['Produk','UMKM','Pengguna','Kategori'].every(label => ui.includes(label))],
  ['core input handler calls global search', app.includes('PasarGlobalSearch.search(query)') && runtime.includes('PasarGlobalSearch.search(query)')],
  ['global search script is loaded', index.includes('data-global-search="true"') && index.includes('js/global-search-v1.js')],
  ['global search loads after app runtime', index.indexOf('js/global-search-v1.js') > index.indexOf('js/app.runtime.js')],
  ['validator is release-gated', String(pkg.scripts?.validate || '').includes('test:global-search')]
];

let failed = 0;
for (const [label, ok] of checks) {
  if (ok) console.log('PASS', label);
  else { failed += 1; console.error('FAIL', label); }
}
if (failed) process.exit(1);
console.log(`Global search validation passed: ${checks.length} assertions.`);
