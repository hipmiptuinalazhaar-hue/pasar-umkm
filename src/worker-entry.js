import { neon } from "@neondatabase/serverless";
import { handlePublicAuthApi } from "./public-auth-api.js";
import { handleCategoryApi } from "./category-api.js";
import { handleSellerCatalogApi } from "./seller-catalog-api.js";
import { handlePostCoreApi } from "./post-core-api.js";
import { handleImageUploadApi } from "./image-upload-api.js";
import { handleProfileApi } from "./profile-api.js";
import { handleProfileMediaApi } from "./profile-media-api.js";
import { handlePublicProfileApi } from "./public-profile-api.js";
import { handleSocialApi } from "./social-api.js";
import { handleNotificationApi } from "./notification-api.js";
import { handleEngagementApi } from "./engagement-api.js";
import { handleFunctionalityApi } from "./functionality-api.js";
import { handleOrdersApiV2 } from "./orders-api-v2.js";
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
import { handleMarketplaceSafetyApi } from "./marketplace-safety-api.js";
import { handleSellerDisputeApi } from "./seller-dispute-api.js";
import { handleLaunchGrowthApi } from "./launch-growth-api.js";
import { handleAdminAuthApi } from "./admin-auth-api.js";
import { handleAdminAccessApi } from "./admin-access-api.js";
import { handleAdminControlApi } from "./admin-control-api.js";
import { handleAdminOperationsApi } from "./admin-operations-api.js";
import { handleAdminGrowthApi } from "./admin-growth-api.js";
import { enforceRateLimit } from "./rate-limit.js";
import { ensureNotificationInfrastructure } from "./notification-store.js";
import { ensureFullFunctionalityInfrastructure } from "./functionality-bootstrap.js";
import { observeRequest } from "./observability.js";
import { enforceRequestSecurity } from "./request-security.js";

const P0_MIGRATION = "2026-09-02-p0-runtime-schema-hardening";
const P1_MIGRATION = "2026-09-02-p1-security-performance";
const FINAL_SECURITY_MIGRATION = "2026-09-05-final-security-hardening";
const P6_MIGRATION = "2026-09-07-p6-operational-marketplace";
const P7_MIGRATION = "2026-09-07-p7-launch-growth";
const RELEASE_CONTRACT = "2026-09-06-platform-hardening-v3";
const STAGING_ATTESTATION_MARKER = "p2-e2e-isolated";

function runtimeEnvironment(env) {
  const value = String(env?.APP_ENV || "production").trim().toLowerCase();
  return value === "staging" ? "staging" : "production";
}

function schemaUnavailable() {
  return Response.json(
    { ok: false, error: "Database schema belum siap untuk versi aplikasi ini.", code: "SCHEMA_NOT_READY" },
    { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } }
  );
}

function apiNotFound() {
  return Response.json(
    { ok: false, error: "API endpoint tidak ditemukan.", code: "API_NOT_FOUND" },
    { status: 404, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}

async function handleHealth(env) {
  try {
    const sql = neon(env.DATABASE_URL);
    const rows = await sql`
      SELECT
        to_regclass('public.users') IS NOT NULL AS users,
        to_regclass('public.sessions') IS NOT NULL AS sessions,
        to_regclass('public.categories') IS NOT NULL AS categories,
        to_regclass('public.stores') IS NOT NULL AS stores,
        to_regclass('public.products') IS NOT NULL AS products,
        to_regclass('public.posts') IS NOT NULL AS posts,
        to_regclass('public.orders') IS NOT NULL AS orders,
        to_regclass('public.notifications') IS NOT NULL AS notifications,
        to_regclass('public.schema_migrations') IS NOT NULL AS schema_migrations,
        to_regclass('public.staging_environment') IS NOT NULL AS staging_environment,
        to_regclass('public.moderation_reports') IS NOT NULL AS moderation_reports,
        to_regclass('public.order_disputes') IS NOT NULL AS order_disputes,
        to_regclass('public.store_verification_submissions') IS NOT NULL AS store_verification_submissions,
        to_regclass('public.marketplace_case_events') IS NOT NULL AS marketplace_case_events,
        to_regclass('public.growth_events') IS NOT NULL AS growth_events,
        to_regclass('public.marketplace_promotions') IS NOT NULL AS marketplace_promotions
    `;

    const state = rows[0] || {};
    const required = ["users","sessions","categories","stores","products","posts","orders","notifications"];
    const p6Required = ["moderation_reports","order_disputes","store_verification_submissions","marketplace_case_events"];
    const p7Required = ["growth_events","marketplace_promotions"];
    const missingCore = required.filter(name => !state[name]);
    const missingP6 = p6Required.filter(name => !state[name]);
    const missingP7 = p7Required.filter(name => !state[name]);
    let p0Applied = false;
    let p1Applied = false;
    let finalSecurityApplied = false;
    let p6Applied = false;
    let p7Applied = false;
    let stagingDatabaseAttested = false;

    if (state.schema_migrations) {
      const appliedRows = await sql`
        SELECT version FROM schema_migrations
        WHERE version = ANY(${[P0_MIGRATION, P1_MIGRATION, FINAL_SECURITY_MIGRATION, P6_MIGRATION, P7_MIGRATION]}::text[])
      `;
      const applied = new Set(appliedRows.map(row => row.version));
      p0Applied = applied.has(P0_MIGRATION);
      p1Applied = applied.has(P1_MIGRATION);
      finalSecurityApplied = applied.has(FINAL_SECURITY_MIGRATION);
      p6Applied = applied.has(P6_MIGRATION);
      p7Applied = applied.has(P7_MIGRATION);
    }

    if (state.staging_environment) {
      const markerRows = await sql`
        SELECT EXISTS (SELECT 1 FROM staging_environment WHERE marker = ${STAGING_ATTESTATION_MARKER}) AS attested
      `;
      stagingDatabaseAttested = markerRows[0]?.attested === true;
    }

    return Response.json({
      ok: true,
      app: "Pasar UMKM",
      backend: "Cloudflare Workers",
      release: RELEASE_CONTRACT,
      environment: runtimeEnvironment(env),
      staging_database_attested: stagingDatabaseAttested,
      database: { connected: true },
      schema: {
        core_ready: missingCore.length === 0,
        missing_core_count: missingCore.length,
        p0_applied: p0Applied,
        p1_applied: p1Applied,
        final_security_applied: finalSecurityApplied,
        p6_applied: p6Applied,
        operational_ready: p6Applied && missingP6.length === 0,
        missing_operational_count: missingP6.length,
        p7_applied: p7Applied,
        launch_ready: p7Applied && missingP7.length === 0,
        missing_launch_count: missingP7.length
      }
    }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return Response.json({
      ok: false,
      app: "Pasar UMKM",
      release: RELEASE_CONTRACT,
      environment: runtimeEnvironment(env),
      staging_database_attested: false,
      error: "Database connection failed",
      code: "HEALTH_DATABASE_ERROR"
    }, { status: 500, headers: { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" } });
  }
}

async function routeRequest(request, env, ctx) {
  const url = new URL(request.url);
  const securityResponse = enforceRequestSecurity(request);
  if (securityResponse) return securityResponse;
  const rateLimitResponse = await enforceRateLimit(request, env);
  if (rateLimitResponse) return rateLimitResponse;
  if (url.pathname === "/api/health") return handleHealth(env);

  const adminAuthResponse = await handleAdminAuthApi(request, env);
  if (adminAuthResponse) return adminAuthResponse;
  const adminAccessResponse = await handleAdminAccessApi(request, env);
  if (adminAccessResponse) return adminAccessResponse;
  const adminGrowthResponse = await handleAdminGrowthApi(request, env);
  if (adminGrowthResponse) return adminGrowthResponse;
  const adminOperationsResponse = await handleAdminOperationsApi(request, env);
  if (adminOperationsResponse) return adminOperationsResponse;
  const adminControlResponse = await handleAdminControlApi(request, env);
  if (adminControlResponse) return adminControlResponse;

  try {
    await ensureNotificationInfrastructure(env);
    await ensureFullFunctionalityInfrastructure(env);
  } catch {
    if (url.pathname.startsWith("/api/")) return schemaUnavailable();
  }

  const launchGrowthResponse = await handleLaunchGrowthApi(request, env);
  if (launchGrowthResponse) return launchGrowthResponse;
  const publicAuthResponse = await handlePublicAuthApi(request, env);
  if (publicAuthResponse) return publicAuthResponse;
  const sellerDisputeResponse = await handleSellerDisputeApi(request, env);
  if (sellerDisputeResponse) return sellerDisputeResponse;
  const marketplaceSafetyResponse = await handleMarketplaceSafetyApi(request, env);
  if (marketplaceSafetyResponse) return marketplaceSafetyResponse;
  const categoryResponse = await handleCategoryApi(request, env);
  if (categoryResponse) return categoryResponse;
  const sellerCatalogResponse = await handleSellerCatalogApi(request, env);
  if (sellerCatalogResponse) return sellerCatalogResponse;
  const postCoreResponse = await handlePostCoreApi(request, env);
  if (postCoreResponse) return postCoreResponse;
  const imageUploadResponse = await handleImageUploadApi(request, env);
  if (imageUploadResponse) return imageUploadResponse;
  const publicCatalogResponse = await handlePublicCatalogApi(request, env);
  if (publicCatalogResponse) return publicCatalogResponse;
  const notificationResponse = await handleNotificationApi(request, env);
  if (notificationResponse) return notificationResponse;
  const ratingSummaryResponse = await handleRatingSummaryV2(request, env);
  if (ratingSummaryResponse) return ratingSummaryResponse;
  const ratingResponse = await handleRatingApi(request, env);
  if (ratingResponse) return ratingResponse;
  const storyUploadResponse = await handleStoryUploadApi(request, env);
  if (storyUploadResponse) return storyUploadResponse;
  const mediaSocialResponse = await handleMediaSocialApi(request, env);
  if (mediaSocialResponse) return mediaSocialResponse;
  const businessAgencyResponse = await handleBusinessAgencyApi(request, env);
  if (businessAgencyResponse) return businessAgencyResponse;
  const storeManagementResponse = await handleStoreManagementApi(request, env);
  if (storeManagementResponse) return storeManagementResponse;
  const ordersResponse = await handleOrdersApiV2(request, env);
  if (ordersResponse) return ordersResponse;
  const functionalityResponse = await handleFunctionalityApi(request, env);
  if (functionalityResponse) return functionalityResponse;
  const engagementResponse = await handleEngagementApi(request, env);
  if (engagementResponse) return engagementResponse;
  const commentResponse = await handleCommentApi(request, env);
  if (commentResponse) return commentResponse;
  const chatMediaResponse = await handleChatMediaApiV2(request, env);
  if (chatMediaResponse) return chatMediaResponse;
  const chatMessageActionResponse = await handleChatMessageActionApi(request, env);
  if (chatMessageActionResponse) return chatMessageActionResponse;
  const chatMarkReadResponse = await handleChatMarkReadApi(request, env);
  if (chatMarkReadResponse) return chatMarkReadResponse;
  const chatManagementResponse = await handleChatManagementApi(request, env);
  if (chatManagementResponse) return chatManagementResponse;
  const socialResponse = await handleSocialApi(request, env);
  if (socialResponse) return socialResponse;
  const publicProfileResponse = await handlePublicProfileApi(request, env);
  if (publicProfileResponse) return publicProfileResponse;
  const profileMediaResponse = await handleProfileMediaApi(request, env);
  if (profileMediaResponse) return profileMediaResponse;
  const profileResponse = await handleProfileApi(request, env);
  if (profileResponse) return profileResponse;

  if (url.pathname.startsWith("/api/")) return apiNotFound();
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx) {
    return observeRequest(request, env, ctx, routeRequest);
  }
};
