import seoWorker from "./seo-worker-entry.js";

const MAX_GROWTH_INSPECTION_BYTES = 4096;

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

function adminCsp(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "script-src-attr 'none'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data: https:",
    "media-src 'self' https:",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "upgrade-insecure-requests"
  ].join("; ");
}

function isHtml(response) {
  return String(response?.headers?.get("Content-Type") || "").toLowerCase().includes("text/html");
}

function isAdminPath(pathname) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

async function readBoundedJsonClone(request, maxBytes) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) return { tooLarge: true, body: null };

  const clone = request.clone();
  if (!clone.body) return { tooLarge: false, body: null };
  const reader = clone.body.getReader();
  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { tooLarge: true, body: null };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    return { tooLarge: false, body };
  } catch {
    return { tooLarge: false, body: null };
  }
}

async function rejectClientAuthoritativeGrowthEvent(request) {
  if (request.method !== "POST") return null;
  const url = new URL(request.url);
  if (url.pathname !== "/api/growth/events") return null;

  const parsed = await readBoundedJsonClone(request, MAX_GROWTH_INSPECTION_BYTES);
  if (parsed.tooLarge) return null;
  const body = parsed.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (String(body.event_name || "").trim() !== "order_completed") return null;

  return Response.json(
    {
      ok: false,
      code: "SERVER_AUTHORITATIVE_EVENT",
      error: "Status penyelesaian pesanan hanya dapat dicatat oleh server."
    },
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff"
      }
    }
  );
}

function securedHeaders(response, nonce, pathname) {
  const headers = new Headers(response.headers);
  const admin = isAdminPath(pathname);
  headers.set("Content-Security-Policy", admin ? adminCsp(nonce) : publicCsp(nonce));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", admin ? "no-referrer" : "strict-origin-when-cross-origin");
  headers.set("Strict-Transport-Security", "max-age=31536000");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (admin) {
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  }
  return headers;
}

export default {
  async fetch(request, env, ctx) {
    const rejectedGrowthEvent = await rejectClientAuthoritativeGrowthEvent(request);
    if (rejectedGrowthEvent) return rejectedGrowthEvent;

    const response = await seoWorker.fetch(request, env, ctx);
    if (!isHtml(response)) return response;

    const nonce = createNonce();
    const pathname = new URL(request.url).pathname;
    const secured = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: securedHeaders(response, nonce, pathname)
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
  frame_ancestors: "none",
  admin_csp_isolated: true,
  admin_https_media_allowed: true,
  admin_referrer_policy: "no-referrer",
  client_order_completed_growth_event_allowed: false,
  growth_inspection_max_bytes: MAX_GROWTH_INSPECTION_BYTES
});
