let ratingReady = false;
let ratingPromise = null;

export async function ensureRatingInfrastructure(sql) {
  if (ratingReady) return;
  if (ratingPromise) return ratingPromise;

  ratingPromise = (async () => {
    const rows = await sql`
      SELECT
        to_regclass('public.store_ratings') IS NOT NULL AS store_ratings,
        to_regclass('public.product_ratings') IS NOT NULL AS product_ratings
    `;

    const state = rows[0] || {};
    const missing = [];

    if (!state.store_ratings) missing.push("store_ratings");
    if (!state.product_ratings) missing.push("product_ratings");

    if (missing.length) {
      const error = new Error(
        `[schema:not-ready] Rating schema belum siap: ${missing.join(", ")}. ` +
        "Jalankan migration database sebelum deploy Worker."
      );
      error.code = "SCHEMA_NOT_READY";
      throw error;
    }

    ratingReady = true;
  })();

  try {
    await ratingPromise;
  } finally {
    ratingPromise = null;
  }
}
