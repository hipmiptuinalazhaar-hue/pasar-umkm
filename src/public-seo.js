import { neon } from "@neondatabase/serverless";

const SITE_ORIGIN = "https://pasar-umkm.hipmiptuinalazhaar.workers.dev";
const PERSONAL_URL = "https://capryan-agusto.hipmiptuinalazhaar.workers.dev/";
const SITE_NAME = "Pasar UMKM Lubuklinggau";
const DEFAULT_DESCRIPTION = "Pasar UMKM Lubuklinggau, platform digital untuk menemukan produk, layanan, dan usaha lokal.";
const XML_LIMIT = 45000;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function compactText(value, max = 160) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function canonicalUrl(pathname) {
  return `${SITE_ORIGIN}${pathname}`;
}

function textResponse(body, contentType, status = 200, cache = "public, max-age=300, stale-while-revalidate=3600") {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function notFound() {
  return new Response("<!doctype html><html lang=\"id\"><head><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex\"><title>Halaman tidak ditemukan | Pasar UMKM</title></head><body><main><h1>Halaman tidak ditemukan</h1><p>Produk atau UMKM ini tidak tersedia.</p><p><a href=\"/\">Kembali ke Pasar UMKM</a></p></main></body></html>", {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function pageShell({ title, description, canonical, image, type = "website", jsonLd, body }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeCanonical = escapeHtml(canonical);
  const safeImage = escapeHtml(image || `${SITE_ORIGIN}/assets/logo.webp?v=2.0`);
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
<meta name="description" content="${safeDescription}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<link rel="canonical" href="${safeCanonical}">
<link rel="icon" href="/assets/logo.webp?v=2.0" type="image/webp">
<meta property="og:locale" content="id_ID">
<meta property="og:site_name" content="Pasar UMKM Lubuklinggau">
<meta property="og:type" content="${escapeHtml(type)}">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:url" content="${safeCanonical}">
<meta property="og:image" content="${safeImage}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDescription}">
<meta name="twitter:image" content="${safeImage}">
<script type="application/ld+json">${safeJson(jsonLd)}</script>
<style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;color:#17221d;background:#f7faf8}main{max-width:780px;margin:auto;padding:32px 20px 56px}a{color:#0b6846}.crumbs{font-size:14px;margin-bottom:24px}.hero{background:#fff;border:1px solid #dfe8e3;border-radius:18px;padding:22px}.hero img{width:100%;max-height:420px;object-fit:cover;border-radius:14px;background:#eef3f0}.eyebrow{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#557166}h1{font-size:clamp(28px,6vw,44px);line-height:1.1;margin:10px 0 12px}.price{font-size:24px;font-weight:800;color:#0b6846}.meta{color:#5a6b63}.description{font-size:17px;line-height:1.7;white-space:pre-line}.links{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}.links a{display:inline-block;padding:11px 15px;border:1px solid #bdd3c8;border-radius:10px;text-decoration:none;font-weight:650}@media(max-width:520px){main{padding:20px 14px 44px}.hero{padding:17px}}</style>
</head>
<body>${body}</body>
</html>`;
}

async function robots() {
  const body = `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\nDisallow: /checkout/\nDisallow: /purchases/\nDisallow: /seller-orders/\nDisallow: /support/\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
  return textResponse(body, "text/plain; charset=utf-8", 200, "public, max-age=3600");
}

function sitemapEntry(location, lastmod) {
  const modified = lastmod ? `<lastmod>${escapeXml(new Date(lastmod).toISOString())}</lastmod>` : "";
  return `<url><loc>${escapeXml(location)}</loc>${modified}</url>`;
}

async function sitemap(env) {
  const sql = neon(env.DATABASE_URL);
  const [stores, products] = await Promise.all([
    sql`
      SELECT slug, updated_at
      FROM stores
      WHERE is_active = TRUE
        AND NULLIF(BTRIM(slug), '') IS NOT NULL
        AND NULLIF(BTRIM(name), '') IS NOT NULL
      ORDER BY updated_at DESC, id DESC
      LIMIT ${XML_LIMIT}
    `,
    sql`
      SELECT p.slug, p.updated_at, s.slug AS store_slug
      FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE p.is_active = TRUE
        AND s.is_active = TRUE
        AND NULLIF(BTRIM(p.slug), '') IS NOT NULL
        AND NULLIF(BTRIM(p.name), '') IS NOT NULL
        AND NULLIF(BTRIM(s.slug), '') IS NOT NULL
      ORDER BY p.updated_at DESC, p.id DESC
      LIMIT ${XML_LIMIT}
    `
  ]);

  const staticUrls = [
    sitemapEntry(`${SITE_ORIGIN}/`),
    sitemapEntry(`${SITE_ORIGIN}/legal/index.html`),
    sitemapEntry(`${SITE_ORIGIN}/legal/privasi.html`),
    sitemapEntry(`${SITE_ORIGIN}/legal/syarat-ketentuan.html`),
    sitemapEntry(`${SITE_ORIGIN}/legal/kebijakan-pembeli.html`),
    sitemapEntry(`${SITE_ORIGIN}/legal/kebijakan-penjual.html`)
  ];
  const storeUrls = stores.map(row => sitemapEntry(`${SITE_ORIGIN}/umkm/${encodeURIComponent(row.slug)}`, row.updated_at));
  const productUrls = products.map(row => sitemapEntry(`${SITE_ORIGIN}/produk/${encodeURIComponent(row.store_slug)}/${encodeURIComponent(row.slug)}`, row.updated_at));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...staticUrls, ...storeUrls, ...productUrls].join("")}</urlset>`;
  return textResponse(xml, "application/xml; charset=utf-8", 200, "public, max-age=900, stale-while-revalidate=3600");
}

async function storePage(env, rawSlug) {
  const slug = decodeURIComponent(rawSlug || "").trim().slice(0, 180);
  if (!slug) return notFound();
  const sql = neon(env.DATABASE_URL);
  const rows = await sql`
    SELECT s.id, s.name, s.slug, s.description, s.logo_url, s.cover_url,
           s.address, s.district, s.city, s.province, s.verification_status,
           s.updated_at, c.name AS category_name,
           COALESCE(pc.product_count, 0)::int AS product_count
    FROM stores s
    LEFT JOIN categories c ON c.id = s.category_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS product_count FROM products p
      WHERE p.store_id = s.id AND p.is_active = TRUE
    ) pc ON TRUE
    WHERE s.slug = ${slug} AND s.is_active = TRUE
    LIMIT 1
  `;
  const store = rows[0];
  if (!store) return notFound();

  const canonical = canonicalUrl(`/umkm/${encodeURIComponent(store.slug)}`);
  const description = compactText(store.description, 155) || `${store.name}, UMKM di ${store.city || "Lubuklinggau"}. Temukan profil usaha dan produk lokalnya di Pasar UMKM.`;
  const title = `${store.name} | UMKM ${store.city || "Lubuklinggau"}`;
  const image = store.cover_url || store.logo_url || `${SITE_ORIGIN}/assets/logo.webp?v=2.0`;
  const address = [store.address, store.district, store.city, store.province].filter(Boolean).join(", ");
  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${canonical}#business`,
    name: store.name,
    url: canonical,
    image,
    description,
    address: address ? { "@type": "PostalAddress", streetAddress: store.address || undefined, addressLocality: store.city || undefined, addressRegion: store.province || undefined, addressCountry: "ID" } : undefined,
    parentOrganization: { "@type": "Organization", name: "Pasar UMKM Lubuklinggau", url: `${SITE_ORIGIN}/` }
  };
  const body = `<main><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Pasar UMKM</a> / <span>${escapeHtml(store.name)}</span></nav><article class="hero">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(store.name)}" loading="eager">` : ""}<p class="eyebrow">${escapeHtml(store.category_name || "UMKM lokal")}${store.verification_status === "verified" ? " · Terverifikasi" : ""}</p><h1>${escapeHtml(store.name)}</h1><p class="meta">${escapeHtml(address || store.city || "Lubuklinggau")} · ${Number(store.product_count || 0)} produk aktif</p><p class="description">${escapeHtml(store.description || "Profil UMKM lokal di Pasar UMKM Lubuklinggau.")}</p><div class="links"><a href="/">Jelajahi Pasar UMKM</a><a href="${escapeHtml(PERSONAL_URL)}" rel="author">Tentang pengembang</a></div></article></main>`;
  return textResponse(pageShell({ title, description, canonical, image, type: "business.business", jsonLd: schema, body }), "text/html; charset=utf-8");
}

async function productPage(env, rawStoreSlug, rawProductSlug) {
  const storeSlug = decodeURIComponent(rawStoreSlug || "").trim().slice(0, 180);
  const productSlug = decodeURIComponent(rawProductSlug || "").trim().slice(0, 220);
  if (!storeSlug || !productSlug) return notFound();
  const sql = neon(env.DATABASE_URL);
  const rows = await sql`
    SELECT p.id, p.name, p.slug, p.description, p.price, p.stock, p.unit,
           COALESCE(NULLIF(p.thumbnail_url, ''), first_image.image_url) AS image_url,
           p.updated_at, s.name AS store_name, s.slug AS store_slug,
           s.city, s.province, c.name AS category_name
    FROM products p
    JOIN stores s ON s.id = p.store_id
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN LATERAL (
      SELECT pi.image_url FROM product_images pi
      WHERE pi.product_id = p.id
      ORDER BY pi.sort_order ASC, pi.created_at ASC, pi.id ASC
      LIMIT 1
    ) first_image ON TRUE
    WHERE p.slug = ${productSlug}
      AND s.slug = ${storeSlug}
      AND p.is_active = TRUE
      AND s.is_active = TRUE
    LIMIT 1
  `;
  const product = rows[0];
  if (!product) return notFound();

  const canonical = canonicalUrl(`/produk/${encodeURIComponent(product.store_slug)}/${encodeURIComponent(product.slug)}`);
  const storeCanonical = canonicalUrl(`/umkm/${encodeURIComponent(product.store_slug)}`);
  const description = compactText(product.description, 155) || `${product.name} dari ${product.store_name}. Temukan produk UMKM lokal di Pasar UMKM Lubuklinggau.`;
  const title = `${product.name} dari ${product.store_name} | Pasar UMKM`;
  const image = product.image_url || `${SITE_ORIGIN}/assets/logo.webp?v=2.0`;
  const price = Number(product.price || 0);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${canonical}#product`,
    name: product.name,
    description,
    image: image ? [image] : undefined,
    category: product.category_name || undefined,
    url: canonical,
    brand: { "@type": "Brand", name: product.store_name },
    offers: {
      "@type": "Offer",
      url: canonical,
      priceCurrency: "IDR",
      price: price.toFixed(2),
      availability: Number(product.stock || 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: product.store_name, url: storeCanonical }
    }
  };
  const formattedPrice = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(price);
  const body = `<main><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Pasar UMKM</a> / <a href="${escapeHtml(`/umkm/${encodeURIComponent(product.store_slug)}`)}">${escapeHtml(product.store_name)}</a> / <span>${escapeHtml(product.name)}</span></nav><article class="hero">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)} dari ${escapeHtml(product.store_name)}" loading="eager">` : ""}<p class="eyebrow">${escapeHtml(product.category_name || "Produk UMKM")}</p><h1>${escapeHtml(product.name)}</h1><p class="price">${escapeHtml(formattedPrice)}</p><p class="meta">${Number(product.stock || 0) > 0 ? `Stok ${Number(product.stock)}${product.unit ? ` ${escapeHtml(product.unit)}` : ""}` : "Stok habis"} · <a href="${escapeHtml(`/umkm/${encodeURIComponent(product.store_slug)}`)}">${escapeHtml(product.store_name)}</a></p><p class="description">${escapeHtml(product.description || "Produk lokal yang tersedia melalui Pasar UMKM Lubuklinggau.")}</p><div class="links"><a href="/">Buka Pasar UMKM</a><a href="${escapeHtml(`/umkm/${encodeURIComponent(product.store_slug)}`)}">Lihat UMKM</a></div></article></main>`;
  return textResponse(pageShell({ title, description, canonical, image, type: "product", jsonLd: schema, body }), "text/html; charset=utf-8");
}

export async function handlePublicSeo(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  try {
    if (url.pathname === "/robots.txt") return robots();
    if (url.pathname === "/sitemap.xml") return sitemap(env);
    const storeMatch = url.pathname.match(/^\/umkm\/([^/]+)\/?$/);
    if (storeMatch) return storePage(env, storeMatch[1]);
    const productMatch = url.pathname.match(/^\/produk\/([^/]+)\/([^/]+)\/?$/);
    if (productMatch) return productPage(env, productMatch[1], productMatch[2]);
    return null;
  } catch (error) {
    console.error("Public SEO route error:", error?.message || error);
    return textResponse("Layanan halaman publik sementara tidak tersedia.", "text/plain; charset=utf-8", 503, "no-store");
  }
}

export const publicSeoConfig = Object.freeze({ SITE_ORIGIN, PERSONAL_URL, SITE_NAME, DEFAULT_DESCRIPTION });
