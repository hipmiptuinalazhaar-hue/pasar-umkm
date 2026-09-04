import { neon } from "@neondatabase/serverless";
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
import { handleChatMediaApiV2 } from "./chat-media-api-v2.js";
import { handleChatMessageActionApi } from "./chat-message-action-api.js";
import { handleCommentApi } from "./comment-api.js";
import { handlePublicCatalogApi } from "./public-catalog-api.js";
import { handleAdminAuthApi } from "./admin-auth-api.js";
import { handleAdminAccessApi } from "./admin-access-api.js";
import { enforceRateLimit } from "./rate-limit.js";
import { ensureNotificationInfrastructure } from "./notification-store.js";
import { ensureFullFunctionalityInfrastructure } from "./functionality-bootstrap.js";

const P0_MIGRATION = "2026-09-02-p0-runtime-schema-hardening";
const P1_MIGRATION = "2026-09-02-p1-security-performance";

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

async function handleHealth(env) {
  try {
    const sql = neon(env.DATABASE_URL);

    const rows = await sql`
      SELECT
        current_database() AS database_name,
        (
          SELECT COUNT(*)::int
          FROM information_schema.tables
          WHERE table_schema = 'public'
        ) AS public_tables,
        to_regclass('public.users') IS NOT NULL AS users,
        to_regclass('public.sessions') IS NOT NULL AS sessions,
        to_regclass('public.categories') IS NOT NULL AS categories,
        to_regclass('public.stores') IS NOT NULL AS stores,
        to_regclass('public.products') IS NOT NULL AS products,
        to_regclass('public.posts') IS NOT NULL AS posts,
        to_regclass('public.orders') IS NOT NULL AS orders,
        to_regclass('public.notifications') IS NOT NULL AS notifications,
        to_regclass('public.schema_migrations') IS NOT NULL AS schema_migrations
    `;

    const state = rows[0] || {};
    const required = [
      "users",
      "sessions",
      "categories",
      "stores",
      "products",
      "posts",
      "orders",
      "notifications"
    ];

    const missingCore = required.filter(name => !state[name]);
    let p0Applied = false;
    let p1Applied = false;
    let latestMigration = null;

    if (state.schema_migrations) {
      const migrationRows = await sql`
        SELECT version, applied_at
        FROM schema_migrations
        ORDER BY applied_at DESC, version DESC
        LIMIT 1
      `;

      latestMigration = migrationRows[0]?.version || null;

      const appliedRows = await sql`
        SELECT version
        FROM schema_migrations
        WHERE version = ANY(${[P0_MIGRATION, P1_MIGRATION]}::text[])
      `;

      const applied = new Set(appliedRows.map(row => row.version));
      p0Applied = applied.has(P0_MIGRATION);
      p1Applied = applied.has(P1_MIGRATION);
    }

    return Response.json(
      {
        ok: true,
        app: "Pasar UMKM",
        backend: "Cloudflare Workers",
        database: {
          connected: true,
          name: state.database_name,
          public_tables: Number(state.public_tables || 0)
        },
        schema: {
          core_ready: missingCore.length === 0,
          missing_core: missingCore,
          p0_migration: P0_MIGRATION,
          p0_applied: p0Applied,
          p1_migration: P1_MIGRATION,
          p1_applied: p1Applied,
          latest_migration: latestMigration
        }
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("Health diagnostic error:", error);

    return Response.json(
      {
        ok: false,
        app: "Pasar UMKM",
        error: "Database connection failed"
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return handleHealth(env);
    }

    const rateLimitResponse = await enforceRateLimit(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Privileged administration auth is an isolated security domain and must
    // remain available independently from public social-commerce feature bootstraps.
    const adminAuthResponse = await handleAdminAuthApi(request, env);
    if (adminAuthResponse) {
      return adminAuthResponse;
    }

    // RBAC/capability resolution shares the isolated admin runtime boundary.
    // Future privileged APIs must authorize server-side before public bootstraps.
    const adminAccessResponse = await handleAdminAccessApi(request, env);
    if (adminAccessResponse) {
      return adminAccessResponse;
    }

    try {
      await ensureNotificationInfrastructure(env);
      await ensureFullFunctionalityInfrastructure(env);
    } catch (error) {
      if (url.pathname.startsWith("/api/")) {
        return schemaUnavailable(error);
      }

      console.error("Non-API schema verification warning:", error);
    }

    const publicCatalogResponse =
      await handlePublicCatalogApi(request, env);

    if (publicCatalogResponse) {
      return publicCatalogResponse;
    }

    const notificationResponse =
      await handleNotificationApi(request, env);

    if (notificationResponse) {
      return notificationResponse;
    }

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

    const commentResponse =
      await handleCommentApi(request, env);

    if (commentResponse) {
      return commentResponse;
    }

    const chatMediaResponse =
      await handleChatMediaApiV2(request, env);

    if (chatMediaResponse) {
      return chatMediaResponse;
    }

    const chatMessageActionResponse =
      await handleChatMessageActionApi(request, env);

    if (chatMessageActionResponse) {
      return chatMessageActionResponse;
    }

    const chatMarkReadResponse =
      await handleChatMarkReadApi(request, env);

    if (chatMarkReadResponse) {
      return chatMarkReadResponse;
    }

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

    return legacyWorker.fetch(request, env, ctx);
  }
};
