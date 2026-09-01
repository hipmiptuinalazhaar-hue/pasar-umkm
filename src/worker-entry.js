import legacyWorker from "./worker.js";
import { handleProfileApi } from "./profile-api.js";
import { handleProfileMediaApi } from "./profile-media-api.js";
import { handlePublicProfileApi } from "./public-profile-api.js";
import { handleSocialApi } from "./social-api.js";
import { handleNotificationApi } from "./notification-api.js";
import { handleEngagementApi } from "./engagement-api.js";
import { handleFunctionalityApi } from "./functionality-api.js";
import { ensureNotificationInfrastructure } from "./notification-store.js";

export default {
  async fetch(request, env, ctx) {
    /*
     * Trigger notifikasi disiapkan sebelum API lain menulis aktivitas.
     * Kegagalan bootstrap notifikasi tidak boleh menjatuhkan marketplace.
     */
    try {
      await ensureNotificationInfrastructure(env);
    } catch (error) {
      console.error(
        "Notification infrastructure bootstrap error:",
        error
      );
    }

    const notificationResponse =
      await handleNotificationApi(request, env);

    if (notificationResponse) {
      return notificationResponse;
    }

    /*
     * Commerce core menangani cart, saved, checkout, orders,
     * universal search, stories, seller dashboard, dan admin.
     */
    const functionalityResponse =
      await handleFunctionalityApi(request, env);

    if (functionalityResponse) {
      return functionalityResponse;
    }

    /*
     * Likes harus diproses sebelum social router umum karena
     * social router mengembalikan 404 untuk /api/social/* lain.
     */
    const engagementResponse =
      await handleEngagementApi(request, env);

    if (engagementResponse) {
      return engagementResponse;
    }

    const socialResponse =
      await handleSocialApi(request, env);

    if (socialResponse) {
      return socialResponse;
    }

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
