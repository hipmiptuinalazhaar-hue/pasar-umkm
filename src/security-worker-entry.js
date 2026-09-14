import seoWorker from "./seo-worker-entry.js";

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createNonce() {
  return base64Url(crypto.getRandomValues(new Uint8Array(18)));
}

function publicCsp(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "upgrade-insecure-requests"
  ].join("; ");
}

function isHtml(response) {
  return String(response?.headers?.get("Content-Type") || "").toLowerCase().includes("text/html");
}

function securedHeaders(response, nonce) {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", publicCsp(nonce));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Strict-Transport-Security", "max-age=31536000");
  return headers;
}

export default {
  async fetch(request, env, ctx) {
    const response = await seoWorker.fetch(request, env, ctx);
    if (!isHtml(response)) return response;

    const nonce = createNonce();
    const secured = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: securedHeaders(response, nonce)
    });

    if (request.method === "HEAD") return secured;

    return new HTMLRewriter()
      .on("script", {
        element(element) {
          element.setAttribute("nonce", nonce);
        }
      })
      .transform(secured);
  }
};

export const securityWorkerPolicy = Object.freeze({
  nonce_bytes: 18,
  inline_script_without_nonce_allowed: false,
  inline_script_attributes_allowed: false,
  connect_src: "self",
  frame_ancestors: "none"
});
