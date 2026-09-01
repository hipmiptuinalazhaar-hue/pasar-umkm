import legacyWorker from "./worker.js";
import { handleProfileApi } from "./profile-api.js";
import { handleProfileMediaApi } from "./profile-media-api.js";
import { handlePublicProfileApi } from "./public-profile-api.js";
import { handleSocialApi } from "./social-api.js";
import { handleNotificationApi } from "./notification-api.js";
import { ensureNotificationInfrastructure } from "./notification-store.js";

export default {
  async fetch(request, env, ctx) {
    /*
     * Pastikan trigger notifikasi sudah aktif sebelum route lama
     * memproses like atau komentar. Gagal menyiapkan notifikasi
     * tidak boleh menjatuhkan marketplace utama.
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
