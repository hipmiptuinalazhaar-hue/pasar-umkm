import fs from 'node:fs';

const headers = fs.readFileSync('_headers', 'utf8');
const buildRuntime = fs.readFileSync('scripts/build-runtime.mjs', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const boot = fs.readFileSync('js/performance-v10-a.js', 'utf8');

const fail = message => {
  console.error(`CACHE FRESHNESS FAIL: ${message}`);
  process.exitCode = 1;
};
const pass = message => console.log(`CACHE FRESHNESS PASS: ${message}`);
const expect = (condition, message) => condition ? pass(message) : fail(message);

function block(path) {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = headers.match(new RegExp(`(?:^|\\n)${escaped}\\n((?:  .+\\n?)+)`, 'm'));
  return match?.[1] || '';
}

for (const path of ['/', '/index.html', '/css/*', '/js/*']) {
  const value = block(path);
  expect(Boolean(value), `${path} cache policy exists`);
  expect(value.includes('max-age=0'), `${path} does not retain stale executable UI`);
  expect(value.includes('must-revalidate'), `${path} revalidates before reuse`);
}

for (const path of ['/css/*', '/js/*']) {
  expect(!block(path).includes('stale-while-revalidate'), `${path} cannot serve stale code in background`);
}

const assets = block('/assets/*');
expect(assets.includes('max-age=604800'), 'media assets keep efficient long-lived caching');

for (const asset of [
  'css/tokens.css',
  'css/style.runtime.css',
  'css/mobile-foundation-v2.css',
  'css/home-feed-v3.css',
  'css/tablet-desktop-v2.css',
  'css/public-experience-v9.css',
  'js/performance-v10-a.js',
  'js/app.runtime.js',
  'js/chat-single-render-v6.js',
  'js/account-resilience.js',
  'js/profile-saved.js',
  'js/p8-commerce-integration.js'
]) {
  expect(buildRuntime.includes(`"${asset}"`) || buildRuntime.includes(`'${asset}'`), `build fingerprints ${asset}`);
}

for (const lazy of [
  'js/chat-single-render-v6.js',
  'js/account-resilience.js',
  'js/profile-saved.js',
  'js/p8-commerce-integration.js'
]) {
  expect(boot.includes(lazy), `V10 bootstrap references lazy ${lazy}`);
  expect(!index.includes(`src="${lazy}`), `${lazy} is excluded from initial script graph`);
}

expect(buildRuntime.includes('css/ui-polish-v1.css'), 'tokens dependency graph includes UI polish CSS');
expect(buildRuntime.includes('stampTokenImports'), 'tokens imports receive dependency fingerprints before token hashing');
expect(buildRuntime.includes('stampLazyBootGraph'), 'V10 lazy dependencies receive fingerprints before bootstrap hashing');
expect(buildRuntime.includes('createHash("sha256")'), 'asset fingerprint uses SHA-256');
expect(buildRuntime.includes('slice(0, 12)'), 'asset fingerprint uses stable 12-character cache key');
expect(index.includes('src="js/performance-v10-a.js?v='), 'V10 bootstrap is critical deferred delivery');
expect(index.includes('rel="preload" href="css/public-experience-v9.css?v='), 'V9 stylesheet is discovered early with matching cache key');
expect(buildRuntime.includes('asset-cache-key'), 'build emits critical cache-key diagnostics');
expect(buildRuntime.includes('lazy-cache-key'), 'build emits lazy cache-key diagnostics');

if (process.exitCode) process.exit(process.exitCode);
console.log('Frontend cache freshness contract: PASS');
