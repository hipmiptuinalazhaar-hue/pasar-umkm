import legacyWorker from "./worker.js";
import { handleProfileApi } from "./profile-api.js";

export default {
  async fetch(request, env, ctx) {
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
