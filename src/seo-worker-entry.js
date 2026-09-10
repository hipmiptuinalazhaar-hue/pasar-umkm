import applicationWorker from "./worker-entry.js";
import { handlePublicSeo } from "./public-seo.js";

const SITE_ORIGIN = "https://pasar-umkm.hipmiptuinalazhaar.workers.dev";
const HOME_DESCRIPTION = "Pasar UMKM Lubuklinggau, platform digital untuk menemukan produk, layanan, dan usaha lokal.";
const GOOGLE_SITE_VERIFICATION = "DMxwOlwgQkfPaF5_P_mezSHlo5-iGcU7t0QLYMi6M4c";

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

  // Fetch the root asset. Cloudflare Static Assets canonicalizes /index.html
  // back to /, so requesting /index.html through ASSETS can yield a 307.
  const assetRequest = new Request(new URL("/", request.url), request);
  const response = await env.ASSETS.fetch(assetRequest);
  if (!response.ok || !String(response.headers.get("Content-Type") || "").includes("text/html")) return response;

  const canonical = `${SITE_ORIGIN}/`;
  return new HTMLRewriter()
    .on("head", {
      element(element) {
        element.append(`
<link rel="canonical" href="${canonical}">
<link rel="icon" href="/assets/logo.webp?v=2.0" type="image/webp">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<meta name="google-site-verification" content="${GOOGLE_SITE_VERIFICATION}">
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
