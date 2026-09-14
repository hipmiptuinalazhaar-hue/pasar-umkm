import { handleMediaSocialApi as handleMediaSocialApiLegacy } from "./media-social-api-legacy.js";
import { handleReelsCommerceV4Api } from "./reels-commerce-v4-api.js";
import { handleReelsAdvancedV4Api } from "./reels-advanced-v4-api.js";
import { handleReelsV4SecureCreateApi } from "./reels-v4-secure-create-api.js";

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" }
  });
}

async function enforceReelsEventBoundary(request) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/reels/v4/events" || request.method !== "POST") return null;
  const body = await request.clone().json().catch(() => null);
  const events = Array.isArray(body?.events) ? body.events : [];
  if (events.some(item => String(item?.event_type || "") === "order")) {
    return json({
      ok: false,
      code: "SERVER_AUTHORITATIVE_EVENT",
      error: "Event transaksi hanya boleh dicatat oleh lifecycle pesanan server."
    }, 400);
  }
  return null;
}

export async function handleMediaSocialApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  const secureCreate = await handleReelsV4SecureCreateApi(request, env);
  if (secureCreate) return secureCreate;

  if (path.startsWith("/api/reels/v4/advanced")) {
    return handleReelsAdvancedV4Api(request, env);
  }

  if (path.startsWith("/api/reels/v4") || path.startsWith("/api/admin/reels/v4") || /^\/r\/[0-9a-f-]{36}$/i.test(path)) {
    const boundary = await enforceReelsEventBoundary(request);
    if (boundary) return boundary;
    return handleReelsCommerceV4Api(request, env);
  }

  return handleMediaSocialApiLegacy(request, env);
}
