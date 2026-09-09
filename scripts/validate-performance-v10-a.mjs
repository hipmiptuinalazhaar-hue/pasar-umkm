import { readFile, stat } from 'node:fs/promises';

const INDEX = 'index.html';
const BOOT = 'js/performance-v10-a.js';
const APP = 'js/app.runtime.js';
const ACCOUNT = 'js/account-resilience.js';
const BUILD = 'scripts/build-runtime.mjs';
const HEADERS = '_headers';

const [index, boot, account, build, headers] = await Promise.all([
  readFile(INDEX, 'utf8'),
  readFile(BOOT, 'utf8'),
  readFile(ACCOUNT, 'utf8'),
  readFile(BUILD, 'utf8'),
  readFile(HEADERS, 'utf8')
]);

function assert(condition, message) {
  if (!condition) throw new Error(`[V10-A] ${message}`);
}

const directScripts = [...index.matchAll(/<script\s+[^>]*src=["'](js\/[^"']+)["'][^>]*>/gi)].map(match => match[1]);
assert(directScripts.length === 2, `initial first-party script harus tepat 2, ditemukan ${directScripts.length}: ${directScripts.join(', ')}`);
assert(/^js\/performance-v10-a\.js\?v=/.test(directScripts[0]), 'V10 bootstrap harus dieksekusi sebelum app runtime.');
assert(/^js\/app\.runtime\.js\?v=/.test(directScripts[1]), 'app.runtime harus menjadi satu-satunya runtime aplikasi initial setelah V10 bootstrap.');

for (const forbidden of ['chat-single-render-v6.js', 'p8-commerce-integration.js', 'account-resilience.js', 'profile-saved.js']) {
  assert(!directScripts.some(src => src.includes(forbidden)), `${forbidden} tidak boleh berada di initial JS graph.`);
}

const bootBytes = (await stat(BOOT)).size;
const appBytes = (await stat(APP)).size;
const accountBytes = (await stat(ACCOUNT)).size;
const indexBytes = (await stat(INDEX)).size;
assert(bootBytes <= 12_000, `V10 bootstrap ${bootBytes} B melebihi budget 12 KB.`);
assert(bootBytes + appBytes <= 200_000, `initial first-party JS ${bootBytes + appBytes} B melebihi budget 200 KB.`);
assert(accountBytes <= 18_000, `lazy account bootstrap ${accountBytes} B melebihi budget 18 KB.`);
assert(indexBytes <= 16_500, `critical HTML ${indexBytes} B melebihi budget 16.5 KB.`);

const preload = index.match(/<link\s+rel=["']preload["'][^>]+href=["'](css\/public-experience-v9\.css\?v=[^"']+)["'][^>]+as=["']style["'][^>]*>/i);
const imported = index.match(/@import\s+url\(["'](css\/public-experience-v9\.css\?v=[^"']+)["']\)/i);
assert(preload && imported, 'Public Experience V9 harus preload sebelum @import.');
assert(preload[1] === imported[1], 'V9 preload dan @import harus memakai cache key identik.');
assert(index.indexOf(preload[0]) < index.indexOf(imported[0]), 'V9 preload harus muncul sebelum @import agar discovery tidak serial.');

for (const marker of [
  "PUBLIC_CACHE_TTL_MS = 20_000",
  "saveData",
  "['slow-2g', '2g']",
  'hardwareConcurrency',
  'deviceMemory',
  'lowEnd',
  'warmPublicBootstrap',
  'installIntentGate',
  'stopImmediatePropagation',
  'replaying',
  'PerformanceObserver',
  "largest-contentful-paint",
  "layout-shift",
  "longtask",
  "window.PasarP2Performance",
  "window.PasarPerformanceV10"
]) assert(boot.includes(marker), `performance bootstrap kehilangan contract ${marker}.`);

for (const asset of [
  'js/chat-single-render-v6.js',
  'js/p8-commerce-integration.js',
  'js/account-resilience.js',
  'js/profile-saved.js'
]) {
  assert(boot.includes(asset), `lazy graph kehilangan ${asset}.`);
  assert(build.includes(asset), `build fingerprint graph kehilangan ${asset}.`);
}

assert(!account.includes('window.fetch ='), 'fetch coalescing hanya boleh dimiliki V10 bootstrap, bukan account bootstrap.');
assert(account.includes('device.constrained || device.lowEnd'), 'account warmup harus menghormati constrained/low-end device.');
assert(account.includes("device.effectiveType === '3g'"), 'account warmup harus memiliki jalur 3G terpisah.');
assert(account.includes("window.PasarPerformanceV10.load('saved')"), 'saved profile runtime harus lazy melalui V10 graph.');

assert(build.includes('stampLazyBootGraph'), 'build harus fingerprint lazy dependency graph sebelum hashing V10 entrypoint.');
assert(build.includes('css/public-experience-v9.css'), 'build harus fingerprint V9 preload/import.');
assert(build.includes('js/performance-v10-a.js'), 'build harus fingerprint V10 bootstrap.');
assert(!build.includes('deployed as a critical deferred script'), 'legacy forced-critical P8 policy harus sudah dihapus.');

assert(/\/js\/\*[\s\S]*max-age=0, must-revalidate/.test(headers), 'freshness-first JS cache policy harus tetap dipertahankan.');
assert(/\/css\/\*[\s\S]*max-age=0, must-revalidate/.test(headers), 'freshness-first CSS cache policy harus tetap dipertahankan.');

console.log(`[V10-A] PASS: initial JS ${bootBytes + appBytes} B (${bootBytes} B bootstrap + ${appBytes} B app), account lazy ${accountBytes} B, HTML ${indexBytes} B.`);
