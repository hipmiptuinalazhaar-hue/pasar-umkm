import legacyWorker from "./worker.js";
import { handleProfileApi } from "./profile-api.js";
import { handleProfileMediaApi } from "./profile-media-api.js";
import { handlePublicProfileApi } from "./public-profile-api.js";
import { handleSocialApi } from "./social-api.js";
import { handleNotificationApi } from "./notification-api.js";
import { handleEngagementApi } from "./engagement-api.js";
import { handleFunctionalityApi } from "./functionality-api.js";
import { ensureNotificationInfrastructure } from "./notification-store.js";
import { ensureFullFunctionalityInfrastructure } from "./functionality-bootstrap.js";

export default {
  async fetch(request, env, ctx) {
    /*
     * Bootstrap berurutan. Notifikasi menyiapkan kolom dasar,
     * lalu functionality memperkaya trigger reply, message,
     * saved, stories, dan commerce. Gagal bootstrap tidak boleh
     * menjatuhkan route marketplace lama.
     */
    try {
      await ensureNotificationInfrastructure(env);
      await ensureFullFunctionalityInfrastructure(env);
    } catch (error) {
      console.error(
        "Application infrastructure bootstrap error:",
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
