import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const seo = read('src/public-seo.js');
const worker = read('src/seo-worker-entry.js');
const wrangler = read('wrangler.jsonc');

const checks = [
  ['homepage title finalized', worker.includes('Pasar UMKM Lubuklinggau | Produk & Usaha Lokal')],
  ['homepage title replaced without duplication', worker.includes('element.setInnerContent(HOME_TITLE)') && !worker.includes('text.replace(HOME_TITLE)')],
  ['homepage description finalized', worker.includes('Temukan produk, toko, dan usaha lokal Lubuklinggau')],
  ['homepage canonical', worker.includes('<link rel="canonical" href="${canonical}">')],
  ['homepage Organization logo', worker.includes('"@type": "Organization"') && worker.includes('logo: { "@id": `${SITE_ORIGIN}/#logo` }')],
  ['homepage WebSite schema', worker.includes('"@type": "WebSite"')],
  ['homepage WebPage schema', worker.includes('"@type": "WebPage"')],
  ['crawlable discovery link on homepage', worker.includes('href="/jelajahi/"') && worker.includes('data-seo-directory="p3"')],
  ['homepage crawl-quality content', worker.includes('Belanja dan menemukan UMKM Lubuklinggau dalam satu tempat') && worker.includes('Data publik yang dapat dirayapi mesin pencari')],
  ['directory crawl-quality enhancement', worker.includes('function enhanceDirectory(response)') && worker.includes('Cara menggunakan direktori Pasar UMKM')],
  ['SEO runtime policy finalized', worker.includes('p3-seo-finalized-v14')],
  ['robots points to sitemap index', seo.includes('Sitemap: ${SITE_ORIGIN}/sitemap.xml')],
  ['sitemap index architecture', seo.includes('<sitemapindex xmlns=') && seo.includes('sitemapIndex(env)')],
  ['sitemap static shard', seo.includes('/sitemap-static.xml') && seo.includes('staticSitemap()')],
  ['sitemap store shards', seo.includes('/sitemap-stores-${page}.xml') && seo.includes('storesSitemap(env, page)')],
  ['sitemap product shards', seo.includes('/sitemap-products-${page}.xml') && seo.includes('productsSitemap(env, page)')],
  ['sitemap per-file limit safe', seo.includes('const XML_LIMIT = 45000')],
  ['crawlable discovery route', seo.includes('async function directoryPage(env)') && seo.includes('"@type": "CollectionPage"')],
  ['directory ItemList schema', seo.includes('"@type": "ItemList"')],
  ['store BreadcrumbList schema', seo.includes('breadcrumbSchema([{ name: "Pasar UMKM"')],
  ['product Product schema', seo.includes('"@type": "Product"') && seo.includes('priceCurrency: "IDR"')],
  ['product does not fake store as brand', !seo.includes('brand: { "@type": "Brand", name: product.store_name }')],
  ['store LocalBusiness schema', seo.includes('"@type": "LocalBusiness"') && seo.includes('logo: store.logo_url || undefined')],
  ['public pages have OG image alt', seo.includes('<meta property="og:image:alt"')],
  ['404 routes are noindex', seo.includes('"X-Robots-Tag": "noindex, nofollow"')],
  ['worker routes discovery page', wrangler.includes('"/jelajahi/*"')],
  ['worker routes sitemap shards', wrangler.includes('"/sitemap-stores-*.xml"') && wrangler.includes('"/sitemap-products-*.xml"')],
  ['public SEO parameterized SQL preserved', seo.includes('WHERE s.slug = ${slug}') && seo.includes('p.slug = ${productSlug}')],
  ['schema JSON is HTML-safe', seo.includes('JSON.stringify(value).replace(/</g, "\\\\u003c")')]
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
  console.error(`P3 SEO finalization failed: ${failed}/${checks.length} checks.`);
  process.exit(1);
}

console.log(`P3 SEO finalization passed: ${checks.length}/${checks.length} checks.`);
