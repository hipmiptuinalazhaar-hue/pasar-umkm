import { readFile, stat } from 'node:fs/promises';

const INDEX = 'index.html';
const V10A = 'js/performance-v10-a.js';
const V10B = 'js/performance-v10-b.js';
const BUILD = 'scripts/build-runtime.mjs';
const EVIDENCE_API = 'src/rating-summary-v2.js';

const [index, v10a, v10b, build, evidenceApi] = await Promise.all([
  readFile(INDEX, 'utf8'),
  readFile(V10A, 'utf8'),
  readFile(V10B, 'utf8'),
  readFile(BUILD, 'utf8'),
  readFile(EVIDENCE_API, 'utf8')
]);

function assert(condition, message) {
  if (!condition) throw new Error(`[V10-B] ${message}`);
}

function forbid(source, pattern, message) {
  if (pattern.test(source)) throw new Error(`[V10-B] ${message}`);
}

const bytes = (await stat(V10B)).size;
assert(bytes <= 16_000, `efficiency runtime ${bytes} B melebihi budget 16 KB.`);

const directScripts = [...index.matchAll(/<script\s+[^>]*src=["'](js\/[^"']+)["'][^>]*>/gi)].map(match => match[1]);
assert(directScripts.length === 2, `critical script graph harus tetap 2 owner, ditemukan ${directScripts.length}.`);
assert(!directScripts.some(src => src.includes('performance-v10-b.js')), 'V10-B harus lazy setelah critical bootstrap, bukan initial owner ketiga.');
assert(v10a.includes("efficiency: 'js/performance-v10-b.js?v="), 'V10-A harus membawa fingerprinted V10-B lazy asset.');
assert(v10a.includes('scheduleEfficiency'), 'V10-A harus menjadwalkan V10-B setelah critical bootstrap.');
assert(build.includes('"js/performance-v10-b.js"'), 'build graph harus fingerprint V10-B sebelum hashing V10-A.');

for (const marker of [
  "version === '10.2'",
  "['/api/discover', 45_000]",
  "['/api/recommendations', 45_000]",
  "['/api/ratings/summaries', 60_000]",
  "originalUrl.origin !== location.origin || method !== 'GET'",
  'bridgeRecommendations',
  'bridgedEvidence',
  'evidenceFromMemory',
  "new URL('/api/recommendations', location.origin)",
  'recommendationLimit',
  'return 4',
  'return 6',
  'return 12',
  "CLOUDINARY_HOST = 'res.cloudinary.com'",
  'f_auto,q_auto:eco,c_limit,w_',
  'dpr_auto',
  'image.srcset',
  'image.sizes',
  "image.decoding = 'async'",
  "image.loading = nearViewport ? 'eager' : 'lazy'",
  "image.fetchPriority = nearViewport ? 'auto' : 'low'",
  "value.includes('/qris/')",
  "video.preload = device.constrained || device.lowEnd ? 'none' : 'metadata'",
  'video.playsInline = true',
  'MutationObserver',
  'PerformanceObserver',
  'api_transfer_bytes',
  'window.PasarPerformanceV10B'
]) assert(v10b.includes(marker), `runtime kehilangan contract ${marker}.`);

forbid(v10b, /(?:\/api\/auth|\/api\/commerce|\/api\/orders|\/api\/admin|\/api\/support)[^'"\s]*['"]\s*,\s*\d+_?\d*/, 'private/mutation API tidak boleh masuk cache rules V10-B.');
forbid(v10b, /method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i, 'V10-B tidak boleh membuat mutation request.');
forbid(v10b, /localStorage|sessionStorage/, 'V10-B cache harus bounded in-memory, bukan persistent stale cache.');

for (const marker of [
  'MAX_RECOMMENDATION_CANDIDATES = 12',
  'async function recommendationCandidates',
  'p.stock > 0',
  'async function recommendationBundle',
  'Promise.all([',
  'productEvidence(sql, productIds)',
  'storeEvidence(sql, storeIds)',
  'recommendation_version: "v10-b-1"',
  'url.pathname === "/api/recommendations"'
]) assert(evidenceApi.includes(marker), `recommendation API kehilangan contract ${marker}.`);
forbid(evidenceApi, /\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i, 'recommendation/evidence API harus read-only.');

console.log(`[V10-B] PASS: one-roundtrip recommendation bridge, bounded public GET cache, responsive Cloudinary delivery, QRIS protection, adaptive video preload, dynamic-media observer; runtime ${bytes} B.`);
