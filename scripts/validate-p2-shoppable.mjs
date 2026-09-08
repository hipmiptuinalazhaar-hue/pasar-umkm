import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const fail = message => {
  console.error(`P2 Shoppable validation failed: ${message}`);
  process.exitCode = 1;
};
const requireText = (text, marker, label) => {
  if (!text.includes(marker)) fail(`missing ${label}: ${marker}`);
};
const forbidText = (text, marker, label) => {
  if (text.includes(marker)) fail(`forbidden ${label}: ${marker}`);
};

const paths = {
  runtime: 'js/p2-shoppable-runtime.js',
  css: 'css/p2-shoppable-runtime.css',
  p8: 'js/p8-commerce-integration.js',
  api: 'src/post-core-api.js',
  tags: 'src/post-product-tags.js',
  migration: 'database/migrations/2026-09-08-p2-shoppable-posts.sql',
  index: 'index.html'
};

for (const path of Object.values(paths)) {
  if (!fs.existsSync(path)) fail(`required file does not exist: ${path}`);
}

if (!process.exitCode) {
  const runtime = read(paths.runtime);
  const css = read(paths.css);
  const p8 = read(paths.p8);
  const api = read(paths.api);
  const tags = read(paths.tags);
  const migration = read(paths.migration);
  const index = read(paths.index);

  const runtimeBytes = fs.statSync(paths.runtime).size;
  const cssBytes = fs.statSync(paths.css).size;
  const tagModuleBytes = fs.statSync(paths.tags).size;
  console.log(`P2 shoppable runtime JS: ${runtimeBytes} / 24000 bytes`);
  console.log(`P2 shoppable runtime CSS: ${cssBytes} / 16000 bytes`);
  console.log(`P2 product-tag module: ${tagModuleBytes} / 8000 bytes`);
  if (runtimeBytes > 24_000) fail(`runtime JS budget exceeded: ${runtimeBytes} > 24000`);
  if (cssBytes > 16_000) fail(`runtime CSS budget exceeded: ${cssBytes} > 16000`);
  if (tagModuleBytes > 8_000) fail(`product-tag module budget exceeded: ${tagModuleBytes} > 8000`);

  for (const [marker, label] of [
    ["version: '1.0'", 'runtime version'],
    ['const MAX_TAGS = 5', 'five-product UI ceiling'],
    ["request('/api/products/me')", 'seller-owned product source'],
    ["fetch('/api/uploads/post-image'", 'post image upload contract'],
    ["request('/api/posts'", 'post API contract'],
    ['product_tags: productTags', 'product tag payload'],
    ['anchor_x', 'hotspot x coordinate'],
    ['anchor_y', 'hotspot y coordinate'],
    ['data-p2-product-link', 'product navigation affordance'],
    ["card.querySelector('.post-media')", 'social media host'],
    ['role="dialog"', 'accessible composer dialog'],
    ["event.key === 'Escape'", 'dialog escape behavior'],
    ["event.key !== 'Tab'", 'focus trap behavior'],
    ['MAX_IMAGE_BYTES', 'client image budget'],
    ['refreshFeedTags', 'tag read model refresh']
  ]) requireText(runtime, marker, label);

  for (const [marker, label] of [
    ['min-height: 48px', 'file control touch target'],
    ['min-height: 50px', 'publish control touch target'],
    ['@media (min-width: 768px)', 'tablet desktop composer layout'],
    ['@media (prefers-reduced-motion: reduce)', 'reduced motion contract'],
    ['.p2-product-hotspot:focus-visible', 'hotspot keyboard focus'],
    ['scroll-snap-type: x proximity', 'shoppable product rail behavior']
  ]) requireText(css, marker, label);

  for (const marker of ['linear-gradient(', 'radial-gradient(', 'backdrop-filter:', '-webkit-backdrop-filter:']) {
    forbidText(css, marker, 'decorative performance-heavy CSS');
  }

  for (const [marker, label] of [
    ["const P2_POST_SELECTOR='.post-card[data-post-id^=\"post-\"]'", 'social post discovery selector'],
    ['css/p2-shoppable-runtime.css?v=1.0', 'lazy shoppable CSS'],
    ['js/p2-shoppable-runtime.js?v=1.0', 'lazy shoppable JS'],
    ['[data-action="post-create"]', 'composer intent ownership'],
    ['openP2Composer', 'deterministic composer handoff'],
    ['waitFor(check,timeout=5000)', 'lazy load readiness guard'],
    ['P2_DISCOVERY_SELECTOR', 'unified discovery owner']
  ]) requireText(p8, marker, label);

  for (const asset of ['js/p2-shoppable-runtime.js', 'css/p2-shoppable-runtime.css']) {
    forbidText(index, asset, 'shoppable asset in initial HTML payload');
  }

  for (const [marker, label] of [
    ['export const MAX_PRODUCT_TAGS = 5', 'server tag ceiling'],
    ['normalizeProductTags', 'server tag parser'],
    ['validateOwnedProducts', 'same-store ownership validator'],
    ['p.store_id = ${storeId}::uuid', 'seller store ownership query'],
    ['p.is_active = TRUE', 'active product enforcement'],
    ['publicProductTag', 'public product-tag mapper'],
    ['productTagInsertQueries', 'tag insert query owner']
  ]) requireText(tags, marker, label);

  for (const [marker, label] of [
    ['from "./post-product-tags.js"', 'modular product-tag import'],
    ['normalizeProductTags', 'tag parser integration'],
    ['validateOwnedProducts', 'ownership validation integration'],
    ['productTagInsertQueries', 'tag insert integration'],
    ['sql.transaction([insertPost, ...tagQueries])', 'atomic post and tag create'],
    ['AS product_tags', 'public shoppable read model'],
    ['pr.store_id = p.store_id', 'read model same-store guard'],
    ['replacePostProducts', 'post tag replacement path'],
    ['request.method === "PUT"', 'post tag update method']
  ]) requireText(api, marker, label);

  for (const [marker, label] of [
    ['ADD COLUMN IF NOT EXISTS tag_order', 'tag order column'],
    ['ADD COLUMN IF NOT EXISTS anchor_x', 'anchor x column'],
    ['ADD COLUMN IF NOT EXISTS anchor_y', 'anchor y column'],
    ['post_products_tag_order_range', 'tag order check'],
    ['post_products_anchor_x_range', 'anchor x check'],
    ['post_products_anchor_y_range', 'anchor y check'],
    ['enforce_post_product_scope', 'database ownership function'],
    ['cross_store_product_tag_forbidden', 'cross-store database guard'],
    ['product_not_available_for_post_tag', 'inactive product database guard'],
    ['post_product_tag_limit_exceeded', 'database tag ceiling'],
    ['trg_post_products_scope', 'database trigger']
  ]) requireText(migration, marker, label);
}

if (!process.exitCode) console.log('P2 Shoppable validation passed.');
