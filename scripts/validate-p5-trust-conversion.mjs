import { access, readFile, stat } from 'node:fs/promises';

const files = {
  backend: 'src/rating-summary-v2.js',
  frontend: 'js/p5-trust-conversion.js',
  css: 'css/p5-trust-conversion.css',
  index: 'index.html'
};

const errors = [];
for (const path of Object.values(files)) {
  try {
    await access(path);
  } catch {
    errors.push(`Missing P5 trust asset: ${path}`);
  }
}

if (!errors.length) {
  const [backend, frontend, css, index] = await Promise.all(
    Object.values(files).map(path => readFile(path, 'utf8'))
  );

  const budgets = {
    'P5 evidence backend': [files.backend, 9_000],
    'P5 trust frontend': [files.frontend, 22_000],
    'P5 trust CSS': [files.css, 7_000],
    'critical HTML': [files.index, 16_500]
  };

  for (const [name, [path, limit]] of Object.entries(budgets)) {
    const size = (await stat(path)).size;
    console.log(`${name}: ${size} / ${limit} bytes`);
    if (size > limit) errors.push(`${name} exceeds source budget: ${size} > ${limit}`);
  }

  const backendContracts = [
    'const MIN_COMPLETION_SAMPLE = 5',
    'const UUID_PATTERN',
    'if (result.length >= 100) break',
    'url.pathname === "/api/ratings/summaries"',
    'url.pathname === "/api/recommendations"',
    'request.method !== "GET"',
    "ro.status = 'completed'",
    'ro.buyer_id = pr.user_id',
    'ro.store_id = pr.store_id',
    'roi.order_id = ro.id AND roi.product_id = pr.product_id',
    "COUNT(*) FILTER (WHERE o.status = 'completed')",
    "COUNT(*) FILTER (WHERE o.status = 'cancelled')",
    "COUNT(*) FILTER (WHERE o.status IN ('completed', 'cancelled'))",
    'verified_rating_count',
    'verified_review_count',
    'completed_orders',
    'cancelled_orders',
    'terminal_orders',
    'completion_rate',
    'completion_rate_eligible',
    "evidence_version: \"p5-v1\"",
    'completed_over_completed_plus_cancelled',
    'completion_rate_min_sample: MIN_COMPLETION_SAMPLE',
    '"Cache-Control": "no-store"'
  ];

  for (const contract of backendContracts) {
    if (!backend.includes(contract)) errors.push(`Missing P5 backend evidence contract: ${contract}`);
  }

  if (/\b(CREATE|ALTER|DROP|TRUNCATE)\s+(TABLE|INDEX|TYPE)\b/i.test(backend)) {
    errors.push('P5 evidence endpoint must not perform runtime DDL');
  }

  const frontendContracts = [
    "version: '1.0'",
    'const MAX_IDS = 100',
    'const REFRESH_TTL = 30_000',
    '/api/ratings/summaries?',
    "method: 'GET'",
    "credentials: 'include'",
    "cache: 'no-store'",
    'UMKM terverifikasi',
    'rating pembelian',
    'pesanan selesai',
    'produk terjual',
    'Riwayat transaksi masih terbatas',
    'Cara indikator dihitung',
    'minimal 5 transaksi terminal',
    'data-p5-product-trust',
    'data-p5-store-panel',
    'data-p5-product-detail-trust',
    'data-p5-checkout-trust',
    'node.dataset.p5EvidenceKey',
    'replaceStable',
    "observer.observe(doc.body, { childList: true, subtree: true })"
  ];

  for (const contract of frontendContracts) {
    if (!frontend.includes(contract)) errors.push(`Missing P5 frontend contract: ${contract}`);
  }

  if (/method\s*:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/i.test(frontend)) {
    errors.push('P5 trust presentation must remain read-only');
  }
  if (/\blocalStorage\b/.test(frontend)) {
    errors.push('P5 trust presentation must not persist marketplace evidence in localStorage');
  }
  if (/observe\s*\([^)]*\{[^}]*attributes\s*:\s*true/is.test(frontend)) {
    errors.push('P5 MutationObserver must not watch attributes');
  }

  const misleadingPatterns = [
    /trust_score/i,
    /100%\s*aman/i,
    /dijamin\s+aman/i,
    /pasti\s+aman/i,
    /jaminan\s+pembayaran/i
  ];
  for (const pattern of misleadingPatterns) {
    if (pattern.test(frontend)) errors.push(`P5 contains unsupported trust claim: ${pattern}`);
  }

  const initialScripts = [...index.matchAll(/<script[^>]+src="js\//g)].length;
  if (initialScripts > 5) {
    errors.push(`Initial first-party script budget exceeded: ${initialScripts} > 5`);
  }
  if (/<script[^>]+src="js\/p5-trust-conversion\.js/i.test(index)) {
    errors.push('P5 trust must remain lazy and absent from initial external script graph');
  }

  const loaderContracts = [
    'js/p5-trust-conversion.js?v=1.0',
    "'p5-trust'",
    'window.__PUMKM_P5_INTENT__',
    '.post-card.is-product-post',
    '[data-nav="cart"]',
    '[data-commerce-action]',
    '[data-menu-action="stores"]',
    'trust:v'
  ];
  for (const contract of loaderContracts) {
    if (!index.includes(contract)) errors.push(`Missing lazy P5 loader contract: ${contract}`);
  }

  if (css.includes('linear-gradient(') || css.includes('radial-gradient(')) {
    errors.push('P5 trust CSS contains decorative gradient');
  }
  if (css.includes('backdrop-filter:')) {
    errors.push('P5 trust CSS contains backdrop-filter');
  }
  const tinyFonts = [...css.matchAll(/font-size\s*:\s*([0-9.]+)px/g)]
    .map(match => Number(match[1]))
    .filter(value => value < 10);
  if (tinyFonts.length) errors.push(`P5 trust CSS contains font below 10px: ${tinyFonts.join(', ')}`);

  for (const contract of [
    ':focus-visible',
    '@media (min-width:768px)',
    '@media (prefers-reduced-motion:reduce)',
    '.p5-trust-panel',
    '.p5-trust-chip',
    '.p5-trust-stats',
    '.p5-trust-method'
  ]) {
    if (!css.replaceAll(' ', '').includes(contract.replaceAll(' ', ''))) {
      errors.push(`Missing P5 trust CSS contract: ${contract}`);
    }
  }
}

if (errors.length) {
  console.error('P5 Trust & Conversion validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('P5 Trust & Conversion PASS: verified-purchase evidence, transparent methodology, minimum-sample completion rate, lazy read-only UX, and source budgets are intact.');
