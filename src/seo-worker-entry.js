import applicationWorker from "./worker-entry.js";
import { handlePublicSeo } from "./public-seo.js";

const SITE_ORIGIN = "https://pasar-umkm.hipmiptuinalazhaar.workers.dev";
const HOME_DESCRIPTION = "Pasar UMKM Lubuklinggau, platform digital untuk menemukan produk, layanan, dan usaha lokal.";
const GOOGLE_SITE_VERIFICATION = "DMxwOlwgQkfPaF5_P_mezSHlo5-iGcU7t0QLYMi6M4c";
const CRITICAL_PUBLIC_STYLE = "/css/public-experience-v9.css?v=654bea569c48";
const TRUST_STYLE = "/css/p5-trust-conversion.css?v=1.0";
const SELLER_STYLE = "/css/seller-center-p8-bridge.css?v=1.0";
const V1_STYLE = "/css/v1-completion.css?v=1.1";
const P2_STYLE = "/css/p2-final-polish.css?v=2.0";
const PERFORMANCE_B = "/js/performance-v10-b.js?v=7a5a0101a671";
const COMMERCE_RUNTIME = "/js/p8-commerce-integration.js?v=fc3dcbac9b78";
const TRUST_RUNTIME = "/js/p5-trust-conversion.js?v=1.0";
const V1_RUNTIME = "/js/v1-completion.js?v=1.2";
const INSTANT_SHELL = "/js/instant-shell-v11.js?v=11.3";
const P2_RUNTIME = "/js/p2-final-ux.js?v=2.0";

function homepageSchema() {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_ORIGIN}/#website`,
        url: `${SITE_ORIGIN}/`,
        name: "Pasar UMKM Lubuklinggau",
        description: HOME_DESCRIPTION,
        inLanguage: "id-ID",
        creator: { "@id": "https://capryan-agusto.hipmiptuinalazhaar.workers.dev/#person" }
      },
      {
        "@type": "Person",
        "@id": "https://capryan-agusto.hipmiptuinalazhaar.workers.dev/#person",
        name: "Capryan Agusto",
        url: "https://capryan-agusto.hipmiptuinalazhaar.workers.dev/"
      },
      {
        "@type": "Organization",
        "@id": `${SITE_ORIGIN}/#initiative`,
        name: "HIPMI PT UIN Al Azhaar Lubuklinggau",
        url: `${SITE_ORIGIN}/`
      }
    ]
  }).replace(/</g, "\\u003c");
}

async function homepage(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/index.html") {
    return Response.redirect(`${SITE_ORIGIN}/${url.search}`, 301);
  }
  if (url.pathname !== "/") return null;

  const assetRequest = new Request(new URL("/", request.url), request);
  const assetResponse = await env.ASSETS.fetch(assetRequest);
  if (!assetResponse.ok || !String(assetResponse.headers.get("Content-Type") || "").includes("text/html")) return assetResponse;

  const headers = new Headers(assetResponse.headers);
  headers.set("Cache-Control", "no-cache, max-age=0, must-revalidate");
  headers.set("Pragma", "no-cache");
  const response = new Response(assetResponse.body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers
  });

  const canonical = `${SITE_ORIGIN}/`;
  return new HTMLRewriter()
    .on("head", {
      element(element) {
        element.append(`
<link rel="stylesheet" href="${CRITICAL_PUBLIC_STYLE}" data-critical-public-ui="v11">
<link rel="stylesheet" href="${TRUST_STYLE}" data-critical-trust-ui="v11">
<link rel="stylesheet" href="${SELLER_STYLE}" data-critical-seller-ui="v11">
<link rel="stylesheet" href="${V1_STYLE}" data-critical-v1-ui="v11">
<link rel="stylesheet" href="${P2_STYLE}" data-p2-final-ui="true">
<link rel="preload" href="${PERFORMANCE_B}" as="script">
<link rel="preload" href="${COMMERCE_RUNTIME}" as="script">
<link rel="preload" href="${TRUST_RUNTIME}" as="script">
<link rel="preload" href="${V1_RUNTIME}" as="script">
<link rel="preload" href="${INSTANT_SHELL}" as="script">
<link rel="preload" href="${P2_RUNTIME}" as="script">
<link rel="canonical" href="${canonical}">
<link rel="icon" href="/assets/logo.webp?v=2.0" type="image/webp">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<meta name="google-site-verification" content="${GOOGLE_SITE_VERIFICATION}">
<meta name="pumkm-runtime-policy" content="p2-finalized-v13">
<meta property="og:locale" content="id_ID">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Pasar UMKM Lubuklinggau">
<meta property="og:title" content="Pasar UMKM Lubuklinggau">
<meta property="og:description" content="${HOME_DESCRIPTION}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE_ORIGIN}/assets/logo.webp?v=2.0">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Pasar UMKM Lubuklinggau">
<meta name="twitter:description" content="${HOME_DESCRIPTION}">
<meta name="twitter:image" content="${SITE_ORIGIN}/assets/logo.webp?v=2.0">
<script type="application/ld+json">${homepageSchema()}</script>`, { html: true });
      }
    })
    .on("body", {
      element(element) {
        element.append(`
<script src="${PERFORMANCE_B}" defer data-v11-critical="recommendation-cache"></script>
<script src="${COMMERCE_RUNTIME}" defer data-v11-critical="commerce-navigation"></script>
<script src="${TRUST_RUNTIME}" defer data-v11-critical="trust-evidence"></script>
<script src="${V1_RUNTIME}" defer data-v11-critical="recommendation-ui"></script>
<script src="${INSTANT_SHELL}" defer data-v11-critical="instant-shell"></script>
<script src="${P2_RUNTIME}" defer data-p2-final-runtime="true"></script>`, { html: true });
      }
    })
    .transform(response);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if ((url.pathname === "/" || url.pathname === "/index.html") && (request.method === "GET" || request.method === "HEAD")) {
      const homeResponse = await homepage(request, env);
      if (homeResponse) return homeResponse;
    }
    const seoResponse = await handlePublicSeo(request, env);
    if (seoResponse) return seoResponse;
    return applicationWorker.fetch(request, env, ctx);
  }
};