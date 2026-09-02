let functionalityReady = false;
let functionalityPromise = null;

function schemaError(missing) {
  const error = new Error(
    `[schema:not-ready] Functionality schema belum siap: ${missing.join(", ")}. ` +
    "Jalankan migration database sebelum deploy Worker."
  );
  error.code = "SCHEMA_NOT_READY";
  return error;
}

/**
 * P0 hardening:
 * semua DDL functionality dipindahkan ke migration.
 * Runtime hanya mengecek objek yang diwajibkan API.
 *
 * Guard ini juga mencakup object/column yang masih disentuh oleh beberapa
 * legacy handler dengan CREATE/ALTER IF NOT EXISTS. Handler tersebut hanya
 * dapat dicapai jika semuanya SUDAH ada, sehingga trafik production tidak
 * dapat melakukan schema mutation aktual.
 */
export async function ensureFunctionalityInfrastructure(sql) {
  if (functionalityReady) return;
  if (functionalityPromise) return functionalityPromise;

  functionalityPromise = (async () => {
    const rows = await sql`
      SELECT
        to_regclass('public.saved_items') IS NOT NULL AS saved_items,
        to_regclass('public.stories') IS NOT NULL AS stories,
        to_regclass('public.product_comments') IS NOT NULL AS product_comments,
        to_regclass('public.direct_conversations') IS NOT NULL AS direct_conversations,
        to_regclass('public.direct_messages') IS NOT NULL AS direct_messages,
        to_regclass('public.direct_conversation_user_state') IS NOT NULL AS direct_conversation_user_state,
        to_regclass('public.direct_message_user_state') IS NOT NULL AS direct_message_user_state,
        to_regclass('public.user_profile_media') IS NOT NULL AS user_profile_media,
        to_regclass('public.store_social_links') IS NOT NULL AS store_social_links,

        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'post_comments'
            AND column_name = 'parent_comment_id'
        ) AS post_parent_comment,

        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'product_comments'
            AND column_name = 'parent_comment_id'
        ) AS product_parent_comment,

        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'direct_conversation_user_state'
            AND column_name = 'is_pinned'
        ) AS conversation_state_pinned,

        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'direct_conversation_user_state'
            AND column_name = 'is_archived'
        ) AS conversation_state_archived,

        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'direct_message_user_state'
            AND column_name = 'is_pinned'
        ) AS message_state_pinned,

        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'direct_message_user_state'
            AND column_name = 'is_archived'
        ) AS message_state_archived,

        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'direct_message_user_state'
            AND column_name = 'is_hidden'
        ) AS message_state_hidden,

        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'direct_messages'
            AND column_name = 'message_type'
        ) AS direct_message_type,

        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'direct_messages'
            AND column_name = 'media_url'
        ) AS direct_message_media_url,

        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'direct_messages'
            AND column_name = 'media_name'
        ) AS direct_message_media_name,

        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'direct_messages'
            AND column_name = 'media_duration_seconds'
        ) AS direct_message_media_duration,

        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'direct_messages'
            AND column_name = 'latitude'
        ) AS direct_message_latitude,

        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'direct_messages'
            AND column_name = 'longitude'
        ) AS direct_message_longitude,

        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'user_profile_media'
            AND column_name = 'image_data'
        ) AS profile_media_image_data,

        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'user_profile_media'
            AND column_name = 'mime_type'
        ) AS profile_media_mime_type,

        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'user_profile_media'
            AND column_name = 'byte_size'
        ) AS profile_media_byte_size
    `;

    const state = rows[0] || {};
    const missing = [];

    if (!state.saved_items) missing.push("saved_items");
    if (!state.stories) missing.push("stories");
    if (!state.product_comments) missing.push("product_comments");
    if (!state.direct_conversations) missing.push("direct_conversations");
    if (!state.direct_messages) missing.push("direct_messages");
    if (!state.direct_conversation_user_state) missing.push("direct_conversation_user_state");
    if (!state.direct_message_user_state) missing.push("direct_message_user_state");
    if (!state.user_profile_media) missing.push("user_profile_media");
    if (!state.store_social_links) missing.push("store_social_links");
    if (!state.post_parent_comment) missing.push("post_comments.parent_comment_id");
    if (!state.product_parent_comment) missing.push("product_comments.parent_comment_id");
    if (!state.conversation_state_pinned) missing.push("direct_conversation_user_state.is_pinned");
    if (!state.conversation_state_archived) missing.push("direct_conversation_user_state.is_archived");
    if (!state.message_state_pinned) missing.push("direct_message_user_state.is_pinned");
    if (!state.message_state_archived) missing.push("direct_message_user_state.is_archived");
    if (!state.message_state_hidden) missing.push("direct_message_user_state.is_hidden");
    if (!state.direct_message_type) missing.push("direct_messages.message_type");
    if (!state.direct_message_media_url) missing.push("direct_messages.media_url");
    if (!state.direct_message_media_name) missing.push("direct_messages.media_name");
    if (!state.direct_message_media_duration) missing.push("direct_messages.media_duration_seconds");
    if (!state.direct_message_latitude) missing.push("direct_messages.latitude");
    if (!state.direct_message_longitude) missing.push("direct_messages.longitude");
    if (!state.profile_media_image_data) missing.push("user_profile_media.image_data");
    if (!state.profile_media_mime_type) missing.push("user_profile_media.mime_type");
    if (!state.profile_media_byte_size) missing.push("user_profile_media.byte_size");

    if (missing.length) {
      throw schemaError(missing);
    }

    functionalityReady = true;
  })();

  try {
    await functionalityPromise;
  } finally {
    functionalityPromise = null;
  }
}
