import legacyWorker from "./worker.js";
import { handleProfileApi } from "./profile-api.js";
import { handleProfileMediaApi } from "./profile-media-api.js";
import { handlePublicProfileApi } from "./public-profile-api.js";

export default {
  async fetch(request, env, ctx) {
    const publicProfileResponse =
      await handlePublicProfileApi(request, env);

    if (publicProfileResponse) {
      return publicProfileResponse;
    }

    const profileMediaResponse =
      await handleProfileMediaApi(request, env);

    if (profileMediaResponse) {
      return profileMediaResponse;
    }

    const profileResponse =
      await handleProfileApi(request, env);

    if (profileResponse) {
      return profileResponse;
    }

    return legacyWorker.fetch(
      request,
      env,
      ctx
    );
  }
};
