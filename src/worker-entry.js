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
import { ensureNotificationInfrastructure } from "./notification-store.js";
import { ensureFullFunctionalityInfrastructure } from "./functionality-bootstrap.js";

export default {
  async fetch(request, env, ctx) {
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
