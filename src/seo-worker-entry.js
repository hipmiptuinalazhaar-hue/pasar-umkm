import applicationWorker from "./worker-entry.js";
import { handlePublicSeo } from "./public-seo.js";

const SITE_ORIGIN = "https://pasar-umkm.hipmiptuinalazhaar.workers.dev";
const HOME_TITLE = "Pasar UMKM Lubuklinggau | Produk & Usaha Lokal";
const HOME_DESCRIPTION = "Temukan produk, toko, dan usaha lokal Lubuklinggau di Pasar UMKM. Jelajahi katalog UMKM, profil penjual, dan produk lokal dalam satu platform.";
const GOOGLE_SITE_VERIFICATION = "DMxwOlwgQkfPaF5_P_mezSHlo5-iGcU7t0QLYMi6M4c";
const LOGO_URL = `${SITE_ORIGIN}/assets/logo.webp?v=2.0`;
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
        publisher: { "@id": `${SITE_ORIGIN}/#initiative` },
        creator: { "@id": "https://capryan-agusto.hipmiptuinalazhaar.workers.dev/#person" }
      },
      {
        "@type": "WebPage",
        "@id": `${SITE_ORIGIN}/#home`,
        url: `${SITE_ORIGIN}/`,
        name: HOME_TITLE,
        description: HOME_DESCRIPTION,
        isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
        about: { "@id": `${SITE_ORIGIN}/#initiative` },
        primaryImageOfPage: { "@id": `${SITE_ORIGIN}/#logo` }
      },
      {
        "@type": "ImageObject",
        "@id": `${SITE_ORIGIN}/#logo`,
        url: LOGO_URL,
        contentUrl: LOGO_URL,
        caption: "Pasar UMKM Lubuklinggau"
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
        url: `${SITE_ORIGIN}/`,
        logo: { "@id": `${SITE_ORIGIN}/#logo` }
      }
    ]
  }).replace(/</g, "\\u003c");
}

function enhanceDirectory(response) {
  if (!response || response.status !== 200 || !String(response.headers.get("Content-Type") || "").includes("text/html")) return response;
  return new HTMLRewriter()
    .on("main", {
      element(element) {
        element.append(`
<section aria-labelledby="directoryGuideTitle" style="margin-top:38px;padding:24px;background:#fff;border:1px solid #dfe8e3;border-radius:18px;color:#43554c;font:500 15px/1.75 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <h2 id="directoryGuideTitle" style="margin:0 0 12px;color:#17221d">Cara menggunakan direktori Pasar UMKM</h2>
  <p>Direktori ini menjadi jalur publik untuk menemukan UMKM dan produk lokal yang aktif di Pasar UMKM Lubuklinggau. Daftar UMKM mengarahkan pengguna ke profil usaha yang berisi identitas toko, kategori, lokasi, deskripsi, serta jumlah produk aktif. Daftar produk mengarahkan pengguna ke halaman produk dengan informasi harga, stok, penjual, dan deskripsi yang bersumber dari data marketplace.</p>
  <p>Urutan yang tampil di halaman ini memprioritaskan data usaha dan produk yang masih aktif. Status verifikasi pada profil UMKM ditampilkan sebagai informasi tambahan ketika tersedia, tetapi pengguna tetap dianjurkan membaca detail produk, profil penjual, kebijakan transaksi, serta informasi pendukung sebelum membuat keputusan pembelian. Pasar UMKM tidak menambahkan rating, harga, stok, atau klaim usaha yang tidak berasal dari data platform.</p>
  <p>Bagi pelaku usaha, keberadaan halaman publik membantu katalog lebih mudah ditemukan melalui tautan internal dan mesin pencari. Bagi pembeli, struktur direktori membuat pencarian produk lokal lebih sederhana karena setiap produk terhubung langsung dengan profil UMKM yang menjualnya. Direktori ini diperbarui berdasarkan data aktif sehingga tautan menuju produk atau usaha yang sudah tidak tersedia tidak dimasukkan ke sitemap publik. Informasi yang ditampilkan tetap mengikuti pembaruan data marketplace dan status publik masing-masing entitas.</p>
  <p>Gunakan halaman <a href="/legal/index.html">informasi dan kebijakan</a> untuk memahami aturan platform, <a href="/legal/kebijakan-pembeli.html">kebijakan pembeli</a> untuk panduan transaksi, dan <a href="/legal/kebijakan-penjual.html">kebijakan penjual</a> untuk ketentuan bagi pemilik UMKM.</p>
</section>`, { html: true });
      }
    })
    .transform(response);
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
    .on("title", {
      element(element) {
        element.setInnerContent(HOME_TITLE);
      }
    })
    .on('meta[name="description"]', {
      element(element) {
        element.setAttribute("content", HOME_DESCRIPTION);
      }
    })
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
<meta name="pumkm-runtime-policy" content="p3-seo-finalized-v14.3">
<meta property="og:locale" content="id_ID">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Pasar UMKM Lubuklinggau">
<meta property="og:title" content="${HOME_TITLE}">
<meta property="og:description" content="${HOME_DESCRIPTION}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${LOGO_URL}">
<meta property="og:image:alt" content="Pasar UMKM Lubuklinggau">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${HOME_TITLE}">
<meta name="twitter:description" content="${HOME_DESCRIPTION}">
<meta name="twitter:image" content="${LOGO_URL}">
<script type="application/ld+json">${homepageSchema()}</script>`, { html: true });
      }
    })
    .on("body", {
      element(element) {
        element.append(`
<section data-seo-directory="p3" aria-labelledby="seoAboutTitle" style="max-width:980px;margin:28px auto 0;padding:24px 18px;font:500 14px/1.75 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#43554c">
  <h2 id="seoAboutTitle" style="margin:0 0 10px;font-size:20px;line-height:1.3;color:#17221d">Belanja dan menemukan UMKM Lubuklinggau dalam satu tempat</h2>
  <p>Pasar UMKM Lubuklinggau membantu masyarakat menemukan produk, toko, dan usaha lokal secara lebih terstruktur. Setiap profil UMKM publik dapat menampilkan identitas usaha, lokasi, kategori, serta produk aktif yang tersedia. Pengunjung dapat menjelajahi katalog untuk membandingkan pilihan dari pelaku usaha lokal tanpa harus mencari informasi yang tersebar di banyak kanal.</p>
  <p>Halaman produk memuat informasi harga, ketersediaan stok, nama penjual, dan deskripsi produk berdasarkan data yang dipublikasikan di platform. Halaman profil UMKM menghubungkan produk dengan usaha yang menjualnya sehingga pengguna dapat memahami sumber produk sebelum melanjutkan interaksi atau transaksi. Fitur kepercayaan, dukungan pelanggan, dan informasi kebijakan disediakan sebagai bagian dari pengalaman marketplace yang lebih transparan.</p>
  <p>Platform ini dikembangkan untuk mendukung digitalisasi ekosistem usaha lokal Lubuklinggau. Pemilik UMKM dapat membangun kehadiran digital melalui profil usaha dan katalog produk, sementara pembeli memperoleh jalur yang lebih sederhana untuk menemukan produk lokal. Data publik yang dapat dirayapi mesin pencari dibatasi pada informasi marketplace yang memang ditujukan untuk publik. Area akun, checkout, dukungan, dan endpoint API tetap dipisahkan dari halaman publik. Struktur ini menjaga halaman publik tetap informatif tanpa membuka data akun atau proses transaksi yang bersifat privat.</p>
  <p>Gunakan direktori Jelajahi untuk melihat UMKM dan produk terbaru, lalu buka profil usaha atau halaman produk untuk informasi yang lebih lengkap. Informasi operasional dan kebijakan platform juga tersedia melalui halaman legal resmi.</p>
</section>
<footer style="max-width:980px;margin:0 auto 96px;padding:18px 16px;border-top:1px solid rgba(18,31,24,.08);font:600 13px/1.6 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#506158">
  <nav aria-label="Tautan publik Pasar UMKM" style="display:flex;gap:14px;flex-wrap:wrap">
    <a href="/jelajahi/" style="color:#0b6846">Jelajahi UMKM &amp; produk</a>
    <a href="/legal/index.html" style="color:#0b6846">Informasi &amp; kebijakan</a>
    <a href="/legal/privasi.html" style="color:#0b6846">Privasi</a>
    <a href="/legal/syarat-ketentuan.html" style="color:#0b6846">Syarat &amp; ketentuan</a>
    <a href="/legal/kebijakan-pembeli.html" style="color:#0b6846">Kebijakan pembeli</a>
    <a href="/legal/kebijakan-penjual.html" style="color:#0b6846">Kebijakan penjual</a>
    <a href="https://capryan-agusto.hipmiptuinalazhaar.workers.dev/" rel="author" style="color:#0b6846">Tentang pengembang</a>
  </nav>
</footer>
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
    if (seoResponse) {
      if (url.pathname === "/jelajahi" || url.pathname === "/jelajahi/") return enhanceDirectory(seoResponse);
      return seoResponse;
    }
    return applicationWorker.fetch(request, env, ctx);
  }
};
