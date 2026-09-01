import legacyWorker from "./worker.js";
import { handleProfileApi } from "./profile-api.js";
import { handleProfileMediaApi } from "./profile-media-api.js";
import { handlePublicProfileApi } from "./public-profile-api.js";
import { handleSocialApi } from "./social-api.js";
import { handleNotificationApi } from "./notification-api.js";
import { handleEngagementApi } from "./engagement-api.js";
import { handleFunctionalityApi } from "./functionality-api.js";
import { handleStoreManagementApi } from "./store-management-api.js";
import { handleRatingApi } from "./rating-api.js";
import { handleRatingSummaryV2 } from "./rating-summary-v2.js";
import { handleBusinessAgencyApi } from "./business-agency-api.js";
import { handleMediaSocialApi } from "./media-social-api.js";
import { handleStoryUploadApi } from "./story-upload-api.js";
import { handleChatManagementApi } from "./chat-management-api.js";
import { handleChatMarkReadApi } from "./chat-mark-read-api.js";
import { handleChatMediaApi } from "./chat-media-api.js";
import { ensureNotificationInfrastructure } from "./notification-store.js";
import { ensureFullFunctionalityInfrastructure } from "./functionality-bootstrap.js";

function schemaUnavailable(error) {
  console.error("Production schema verification failed:", error);

  return Response.json(
    {
      ok: false,
      error: "Database schema belum siap untuk versi aplikasi ini.",
      code: "SCHEMA_NOT_READY"
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "60"
      }
    }
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    /*
     * Health endpoint harus tetap tersedia walaupun migration bermasalah.
     * Endpoint ini read-only dan membantu memastikan DATABASE_URL menunjuk
     * ke database production yang benar tanpa membocorkan credential.
     */
    if (url.pathname === "/api/health") {
      return legacyWorker.fetch(request, env, ctx);
    }

    /*
     * P0: runtime tidak lagi memperbaiki/mengubah schema.
     * ensure* sekarang hanya memverifikasi hasil migration.
     */
    try {
      await ensureNotificationInfrastructure(env);
      await ensureFullFunctionalityInfrastructure(env);
    } catch (error) {
      if (url.pathname.startsWith("/api/")) {
        return schemaUnavailable(error);
      }

      console.error("Non-API schema verification warning:", error);
    }

    const notificationResponse =
      await handleNotificationApi(request, env);

    if (notificationResponse) {
      return notificationResponse;
    }

    /* Summary v2 harus mendahului rating API lama. */
    const ratingSummaryResponse =
      await handleRatingSummaryV2(request, env);

    if (ratingSummaryResponse) {
      return ratingSummaryResponse;
    }

    const ratingResponse =
      await handleRatingApi(request, env);

    if (ratingResponse) {
      return ratingResponse;
    }

    const storyUploadResponse =
      await handleStoryUploadApi(request, env);

    if (storyUploadResponse) {
      return storyUploadResponse;
    }

    const mediaSocialResponse =
      await handleMediaSocialApi(request, env);

    if (mediaSocialResponse) {
      return mediaSocialResponse;
    }

    const businessAgencyResponse =
      await handleBusinessAgencyApi(request, env);

    if (businessAgencyResponse) {
      return businessAgencyResponse;
    }

    const storeManagementResponse =
      await handleStoreManagementApi(request, env);

    if (storeManagementResponse) {
      return storeManagementResponse;
    }

    const functionalityResponse =
      await handleFunctionalityApi(request, env);

    if (functionalityResponse) {
      return functionalityResponse;
    }

    const engagementResponse =
      await handleEngagementApi(request, env);

    if (engagementResponse) {
      return engagementResponse;
    }

    const chatMediaResponse =
      await handleChatMediaApi(request, env);

    if (chatMediaResponse) {
      return chatMediaResponse;
    }

    const chatMarkReadResponse =
      await handleChatMarkReadApi(request, env);

    if (chatMarkReadResponse) {
      return chatMarkReadResponse;
    }

    /*
     * Chat management harus mendahului social router karena ia
     * memperkaya endpoint conversation list, unread, dan thread GET.
     */
    const chatManagementResponse =
      await handleChatManagementApi(request, env);

    if (chatManagementResponse) {
      return chatManagementResponse;
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
