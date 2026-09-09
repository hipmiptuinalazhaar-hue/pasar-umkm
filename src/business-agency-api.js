import { handleBusinessAgencyApiLegacy } from "./business-agency-api-legacy.js";
import { handleReelsCommerceV4Api } from "./reels-commerce-v4-api.js";

function bridgeReelsV4Request(request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/reels-v4")) return request;
  url.pathname = url.pathname.replace(/^\/api\/reels-v4/, "/api/reels/v4");
  return new Request(url.toString(), request);
}

export async function handleBusinessAgencyApi(request, env) {
  const url = new URL(request.url);

  if (
    url.pathname.startsWith("/api/reels-v4") ||
    url.pathname.startsWith("/api/admin/reels/v4") ||
    /^\/r\/[0-9a-f-]{36}$/i.test(url.pathname)
  ) {
    return handleReelsCommerceV4Api(bridgeReelsV4Request(request), env);
  }

  return handleBusinessAgencyApiLegacy(request, env);
}
