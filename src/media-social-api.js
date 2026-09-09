import { handleMediaSocialApi as handleMediaSocialApiLegacy } from "./media-social-api-legacy.js";

export async function handleMediaSocialApi(request, env) {
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/reels-v4")) {
    return null;
  }

  return handleMediaSocialApiLegacy(request, env);
}
