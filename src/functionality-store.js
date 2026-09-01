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
 */
export async function ensureFunctionalityInfrastructure(sql) {
  if (functionalityReady) return;
  if (functionalityPromise) return functionalityPromise;

  functionalityPromise = (async () => {
    const rows = await sql`
      SELECT
        to_regclass('public.saved_items') IS NOT NULL AS saved_items,
        to_regclass('public.stories') IS NOT NULL AS stories,
        to_regclass('public.direct_conversations') IS NOT NULL AS direct_conversations,
        to_regclass('public.direct_messages') IS NOT NULL AS direct_messages,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'post_comments'
            AND column_name = 'parent_comment_id'
        ) AS post_parent_comment,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'product_comments'
            AND column_name = 'parent_comment_id'
        ) AS product_parent_comment
    `;

    const state = rows[0] || {};
    const missing = [];

    if (!state.saved_items) missing.push("saved_items");
    if (!state.stories) missing.push("stories");
    if (!state.direct_conversations) missing.push("direct_conversations");
    if (!state.direct_messages) missing.push("direct_messages");
    if (!state.post_parent_comment) missing.push("post_comments.parent_comment_id");
    if (!state.product_parent_comment) missing.push("product_comments.parent_comment_id");

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
