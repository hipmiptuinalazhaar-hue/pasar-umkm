import { neon } from "@neondatabase/serverless";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_NAMES = new Set([
  "page_view","register_completed","seller_onboarding_view","store_created",
  "store_view","product_view","search","add_to_cart","checkout_started",
  "order_completed","verification_submitted","report_submitted","dispute_opened",
  "share_opened","promotion_opened"
]);
const RESOURCE_TYPES = new Set(["product","store","order","search","seller_onboarding","promotion","platform"]);
const DISCOVERY_KINDS = new Set(["all","products","stores"]);
const DISCOVERY_SORTS = new Set(["relevance","newest","price_asc","price_desc"]);
const MAX_BODY_BYTES = 4096;

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      ...headers
    }
  });
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function optionalUser(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const rows = await sql`
    SELECT u.id, u.name, u.email, u.role::text AS role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = encode(digest(${token}, 'sha256'), 'hex')
      AND s.expires_at > NOW()
      AND u.is_active = TRUE
    LIMIT 1
  `;
  return rows[0] || null;
}

async function requireUser(sql, request) {
  const user = await optionalUser(sql, request);
  if (!user) return { response: json({ ok: false, code: "AUTH_REQUIRED", error: "Silakan login terlebih dahulu." }, 401) };
  return { user };
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

async function smallJson(request) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { error: json({ ok: false, code: "REQUEST_TOO_LARGE" }, 413) };
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: json({ ok: false, code: "INVALID_REQUEST" }, 400) };
  }
  return { body };
}

function sanitizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set(["source","placement","path","viewport","query_length","referrer_host","surface","status"]);
  const output = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!allowed.has(key)) continue;
    const text = String(raw ?? "").trim().slice(0, 120);
    if (text) output[key] = text;
  }
  return output;
}

async function recordGrowthEvent(request, env) {
  if (!sameOrigin(request)) return json({ ok: false, code: "ORIGIN_REJECTED" }, 403);
  const parsed = await smallJson(request);
  if (parsed.error) return parsed.error;

  const eventName = String(parsed.body.event_name || "").trim();
  const anonymousId = String(parsed.body.anonymous_id || "").trim().slice(0, 96);
  const resourceType = String(parsed.body.resource_type || "").trim() || null;
  const resourceId = String(parsed.body.resource_id || "").trim() || null;
  if (!EVENT_NAMES.has(eventName)) return json({ ok: false, code: "INVALID_EVENT" }, 400);
  if (resourceType && !RESOURCE_TYPES.has(resourceType)) return json({ ok: false, code: "INVALID_RESOURCE_TYPE" }, 400);
  if (resourceId && !UUID_PATTERN.test(resourceId)) return json({ ok: false, code: "INVALID_RESOURCE_ID" }, 400);

  const sql = neon(env.DATABASE_URL);
  const user = await optionalUser(sql, request);
  const anonymousHash = anonymousId ? await sha256Hex(anonymousId) : null;
  const metadata = sanitizeMetadata(parsed.body.metadata);

  await sql`
    INSERT INTO growth_events(anonymous_key_hash, user_id, event_name, resource_type, resource_id, metadata)
    VALUES(
      ${anonymousHash}, ${user?.id || null}, ${eventName}, ${resourceType},
      ${resourceId}::uuid, CAST(${JSON.stringify(metadata)} AS jsonb)
    )
  `;
  return json({ ok: true, accepted: true }, 202);
}

function normalizeQuery(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function normalizeTextFilter(value, max = 80) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

async function discoverProducts(sql, { q, category, district, sort, limit }) {
  return sql`
    SELECT
      p.id, p.store_id, p.category_id, p.name, p.slug, p.description, p.price, p.stock, p.unit,
      COALESCE(NULLIF(p.thumbnail_url, ''), first_image.image_url) AS image_url,
      p.is_featured, p.created_at,
      s.name AS store_name, s.logo_url AS store_logo_url, s.district AS store_district,
      s.city AS store_city, s.verification_status::text AS store_verification_status,
      c.name AS category_name,
      CASE
        WHEN ${q} = '' THEN 4
        WHEN lower(p.name) = lower(${q}) THEN 0
        WHEN lower(p.name) LIKE lower(${q}) || '%' THEN 1
        WHEN lower(s.name) LIKE lower(${q}) || '%' THEN 2
        WHEN lower(p.name) LIKE '%' || lower(${q}) || '%' THEN 3
        ELSE 4
      END AS relevance_rank,
      CASE WHEN EXISTS (
        SELECT 1 FROM marketplace_promotions mp
        WHERE mp.subject_type='product' AND mp.subject_id=p.id AND mp.status='active'
          AND (mp.starts_at IS NULL OR mp.starts_at <= NOW())
          AND (mp.ends_at IS NULL OR mp.ends_at > NOW())
          AND mp.placement IN ('home_featured','search_boost')
      ) THEN 0 ELSE 1 END AS promotion_rank
    FROM products p
    JOIN stores s ON s.id=p.store_id AND s.is_active=TRUE
    LEFT JOIN categories c ON c.id=p.category_id
    LEFT JOIN LATERAL (
      SELECT pi.image_url FROM product_images pi
      WHERE pi.product_id=p.id
      ORDER BY pi.sort_order ASC, pi.created_at ASC, pi.id ASC
      LIMIT 1
    ) first_image ON TRUE
    WHERE p.is_active=TRUE
      AND (${q} = '' OR lower(p.name) LIKE '%' || lower(${q}) || '%' OR lower(s.name) LIKE '%' || lower(${q}) || '%' OR lower(COALESCE(c.name,'')) LIKE '%' || lower(${q}) || '%')
      AND (${category} = '' OR lower(COALESCE(c.name,'')) = lower(${category}) OR p.category_id::text = ${category})
      AND (${district} = '' OR lower(COALESCE(s.district,'')) = lower(${district}))
    ORDER BY
      promotion_rank ASC,
      CASE WHEN ${sort} = 'price_asc' THEN p.price END ASC,
      CASE WHEN ${sort} = 'price_desc' THEN p.price END DESC,
      CASE WHEN ${sort} = 'newest' THEN p.created_at END DESC,
      relevance_rank ASC,
      p.is_featured DESC,
      p.created_at DESC,
      p.id DESC
    LIMIT ${limit}
  `;
}

async function discoverStores(sql, { q, category, district, limit }) {
  return sql`
    SELECT
      s.id, s.category_id, s.name, s.slug, s.description, s.logo_url, s.cover_url,
      s.address, s.district, s.city, s.province, s.verification_status::text AS verification_status,
      s.verified_at, s.created_at, c.name AS category_name,
      (SELECT COUNT(*)::int FROM products p WHERE p.store_id=s.id AND p.is_active=TRUE) AS product_count,
      CASE
        WHEN ${q} = '' THEN 4
        WHEN lower(s.name) = lower(${q}) THEN 0
        WHEN lower(s.name) LIKE lower(${q}) || '%' THEN 1
        WHEN lower(s.name) LIKE '%' || lower(${q}) || '%' THEN 2
        ELSE 4
      END AS relevance_rank,
      CASE WHEN EXISTS (
        SELECT 1 FROM marketplace_promotions mp
        WHERE mp.subject_type='store' AND mp.subject_id=s.id AND mp.status='active'
          AND (mp.starts_at IS NULL OR mp.starts_at <= NOW())
          AND (mp.ends_at IS NULL OR mp.ends_at > NOW())
          AND mp.placement IN ('store_featured','search_boost','home_featured')
      ) THEN 0 ELSE 1 END AS promotion_rank
    FROM stores s
    LEFT JOIN categories c ON c.id=s.category_id
    WHERE s.is_active=TRUE
      AND (${q} = '' OR lower(s.name) LIKE '%' || lower(${q}) || '%' OR lower(COALESCE(c.name,'')) LIKE '%' || lower(${q}) || '%')
      AND (${category} = '' OR lower(COALESCE(c.name,'')) = lower(${category}) OR s.category_id::text = ${category})
      AND (${district} = '' OR lower(COALESCE(s.district,'')) = lower(${district}))
    ORDER BY promotion_rank ASC,
      CASE WHEN s.verification_status='verified' THEN 0 ELSE 1 END ASC,
      relevance_rank ASC, s.name ASC, s.id ASC
    LIMIT ${limit}
  `;
}

async function discover(request, env, url) {
  const q = normalizeQuery(url.searchParams.get("q"));
  const category = normalizeTextFilter(url.searchParams.get("category"));
  const district = normalizeTextFilter(url.searchParams.get("district"));
  const kind = DISCOVERY_KINDS.has(url.searchParams.get("kind")) ? url.searchParams.get("kind") : "all";
  const sort = DISCOVERY_SORTS.has(url.searchParams.get("sort")) ? url.searchParams.get("sort") : "relevance";
  const limit = Math.min(20, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "12", 10) || 12));
  if (q && q.length < 2) return json({ ok: false, code: "QUERY_TOO_SHORT" }, 400);

  const sql = neon(env.DATABASE_URL);
  const [products, stores] = await Promise.all([
    kind === "stores" ? Promise.resolve([]) : discoverProducts(sql, { q, category, district, sort, limit }),
    kind === "products" ? Promise.resolve([]) : discoverStores(sql, { q, category, district, limit })
  ]);
  return json({ ok: true, query: q, filters: { kind, category, district, sort }, products, stores });
}

async function launchStatus(request, env) {
  const sql = neon(env.DATABASE_URL);
  const auth = await requireUser(sql, request);
  if (auth.response) return auth.response;

  const stores = await sql`
    SELECT s.*, c.name AS category_name
    FROM stores s LEFT JOIN categories c ON c.id=s.category_id
    WHERE s.owner_id=${auth.user.id}
    ORDER BY s.created_at ASC LIMIT 1
  `;
  const store = stores[0] || null;
  let productCount = 0;
  let verification = null;
  if (store) {
    const metrics = await sql`SELECT COUNT(*)::int AS product_count FROM products WHERE store_id=${store.id} AND is_active=TRUE`;
    productCount = metrics[0]?.product_count || 0;
    const verificationRows = await sql`
      SELECT id, status, review_note, reviewed_at, created_at, updated_at
      FROM store_verification_submissions
      WHERE store_id=${store.id}
      ORDER BY created_at DESC LIMIT 1
    `;
    verification = verificationRows[0] || null;
  }
  return json({
    ok: true,
    user: auth.user,
    store,
    product_count: productCount,
    verification,
    steps: {
      account: true,
      store: Boolean(store),
      profile: Boolean(store?.description && store?.address && (store?.phone || store?.whatsapp)),
      product: productCount > 0,
      verification: store?.verification_status === "verified"
    }
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    }
  });
}

async function productShare(env, request, id) {
  const sql = neon(env.DATABASE_URL);
  const rows = await sql`
    SELECT p.id, p.name, p.description, p.price, p.stock, p.unit,
      COALESCE(NULLIF(p.thumbnail_url,''), img.image_url) AS image_url,
      s.id AS store_id, s.name AS store_name, s.city, s.verification_status::text AS verification_status
    FROM products p JOIN stores s ON s.id=p.store_id
    LEFT JOIN LATERAL (
      SELECT image_url FROM product_images WHERE product_id=p.id
      ORDER BY sort_order ASC, created_at ASC, id ASC LIMIT 1
    ) img ON TRUE
    WHERE p.id=${id}::uuid AND p.is_active=TRUE AND s.is_active=TRUE LIMIT 1
  `;
  const product = rows[0];
  if (!product) return htmlResponse("<!doctype html><title>Produk tidak ditemukan</title><h1>Produk tidak ditemukan</h1>", 404);
  const origin = new URL(request.url).origin;
  const canonical = `${origin}/share/product/${product.id}`;
  const description = String(product.description || `${product.name} dari ${product.store_name} di Pasar UMKM Lubuklinggau`).slice(0, 220);
  const image = product.image_url || `${origin}/assets/logo.webp`;
  const schema = {
    "@context":"https://schema.org","@type":"Product",name:product.name,description,
    image:[image],offers:{"@type":"Offer",priceCurrency:"IDR",price:String(product.price),availability:Number(product.stock)>0?"https://schema.org/InStock":"https://schema.org/OutOfStock"},
    brand:{"@type":"Organization",name:product.store_name}
  };
  return htmlResponse(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(product.name)} | Pasar UMKM</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="product"><meta property="og:title" content="${escapeHtml(product.name)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:image" content="${escapeHtml(image)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">${safeJson(schema)}</script><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:auto;padding:24px;color:#14261f}img{width:100%;max-height:440px;object-fit:cover;border-radius:24px}.price{font-size:1.5rem;font-weight:800}.cta{display:inline-block;padding:12px 18px;border-radius:999px;background:#0f573a;color:white;text-decoration:none;font-weight:700}</style></head><body><img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}"><p>${escapeHtml(product.store_name)}${product.verification_status==='verified'?' · UMKM Terverifikasi':''}</p><h1>${escapeHtml(product.name)}</h1><p class="price">Rp${Number(product.price||0).toLocaleString('id-ID')}</p><p>${escapeHtml(description)}</p><a class="cta" href="/?product=${escapeHtml(product.id)}">Buka di Pasar UMKM</a></body></html>`);
}

async function storeShare(env, request, id) {
  const sql = neon(env.DATABASE_URL);
  const rows = await sql`
    SELECT id, name, description, logo_url, cover_url, address, district, city, province, verification_status::text AS verification_status
    FROM stores WHERE id=${id}::uuid AND is_active=TRUE LIMIT 1
  `;
  const store = rows[0];
  if (!store) return htmlResponse("<!doctype html><title>UMKM tidak ditemukan</title><h1>UMKM tidak ditemukan</h1>", 404);
  const origin = new URL(request.url).origin;
  const canonical = `${origin}/share/store/${store.id}`;
  const description = String(store.description || `${store.name}, UMKM lokal di ${store.city || 'Lubuklinggau'}.`).slice(0, 220);
  const image = store.cover_url || store.logo_url || `${origin}/assets/logo.webp`;
  const schema = {"@context":"https://schema.org","@type":"LocalBusiness",name:store.name,description,image,address:[store.address,store.district,store.city,store.province].filter(Boolean).join(', ')};
  return htmlResponse(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(store.name)} | Pasar UMKM</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(store.name)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:image" content="${escapeHtml(image)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">${safeJson(schema)}</script><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:auto;padding:24px;color:#14261f}img{width:100%;max-height:440px;object-fit:cover;border-radius:24px}.cta{display:inline-block;padding:12px 18px;border-radius:999px;background:#0f573a;color:white;text-decoration:none;font-weight:700}</style></head><body><img src="${escapeHtml(image)}" alt="${escapeHtml(store.name)}"><p>${store.verification_status==='verified'?'UMKM Terverifikasi · ':''}${escapeHtml(store.city || 'Lubuklinggau')}</p><h1>${escapeHtml(store.name)}</h1><p>${escapeHtml(description)}</p><p>${escapeHtml([store.address,store.district,store.city].filter(Boolean).join(', '))}</p><a class="cta" href="/?store=${escapeHtml(store.id)}">Buka di Pasar UMKM</a></body></html>`);
}

function xmlEscape(value) {
  return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");
}

async function sitemap(request, env) {
  const sql = neon(env.DATABASE_URL);
  const [products, stores] = await Promise.all([
    sql`SELECT id, updated_at FROM products WHERE is_active=TRUE ORDER BY updated_at DESC LIMIT 5000`,
    sql`SELECT id, updated_at FROM stores WHERE is_active=TRUE ORDER BY updated_at DESC LIMIT 2000`
  ]);
  const origin = new URL(request.url).origin;
  const urls = [
    { loc: `${origin}/`, change: "daily", priority: "1.0" },
    { loc: `${origin}/launch/`, change: "weekly", priority: "0.8" },
    { loc: `${origin}/legal/`, change: "monthly", priority: "0.4" },
    ...stores.map(row => ({ loc: `${origin}/share/store/${row.id}`, lastmod: row.updated_at, change: "weekly", priority: "0.8" })),
    ...products.map(row => ({ loc: `${origin}/share/product/${row.id}`, lastmod: row.updated_at, change: "weekly", priority: "0.7" }))
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(item => `<url><loc>${xmlEscape(item.loc)}</loc>${item.lastmod?`<lastmod>${new Date(item.lastmod).toISOString()}</lastmod>`:''}<changefreq>${item.change}</changefreq><priority>${item.priority}</priority></url>`).join('')}</urlset>`;
  return new Response(body, { status: 200, headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=900" } });
}

export async function handleLaunchGrowthApi(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  if (url.pathname === "/api/growth/events" && method === "POST") return recordGrowthEvent(request, env);
  if (url.pathname === "/api/discover" && method === "GET") return discover(request, env, url);
  if (url.pathname === "/api/launch/status" && method === "GET") return launchStatus(request, env);
  if (url.pathname === "/sitemap.xml" && method === "GET") return sitemap(request, env);

  const productMatch = url.pathname.match(/^\/share\/product\/([0-9a-f-]{36})$/i);
  if (productMatch && method === "GET" && UUID_PATTERN.test(productMatch[1])) return productShare(env, request, productMatch[1]);
  const storeMatch = url.pathname.match(/^\/share\/store\/([0-9a-f-]{36})$/i);
  if (storeMatch && method === "GET" && UUID_PATTERN.test(storeMatch[1])) return storeShare(env, request, storeMatch[1]);
  return null;
}

export const launchGrowthPolicy = Object.freeze({
  version: "2026-09-07-p7-launch-growth",
  anonymous_ids_hashed: true,
  raw_ip_collection: false,
  raw_user_agent_collection: false,
  promotion_billing: false,
  fund_movement: false,
  discovery_max_results_per_kind: 20
});