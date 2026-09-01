let mediaSocialReady = false;
let mediaSocialPromise = null;

export async function ensureMediaSocialInfrastructure(sql) {
  if (mediaSocialReady) return;
  if (mediaSocialPromise) return mediaSocialPromise;

  mediaSocialPromise = (async () => {
    const rows = await sql`
      SELECT
        to_regclass('public.reels') IS NOT NULL AS reels,
        to_regclass('public.reel_likes') IS NOT NULL AS reel_likes,
        to_regclass('public.reel_comments') IS NOT NULL AS reel_comments,
        to_regclass('public.story_likes') IS NOT NULL AS story_likes,
        to_regclass('public.story_comments') IS NOT NULL AS story_comments
    `;

    const state = rows[0] || {};
    const missing = [];

    for (const name of [
      "reels",
      "reel_likes",
      "reel_comments",
      "story_likes",
      "story_comments"
    ]) {
      if (!state[name]) missing.push(name);
    }

    if (missing.length) {
      const error = new Error(
        `[schema:not-ready] Media social schema belum siap: ${missing.join(", ")}. ` +
        "Jalankan migration database sebelum deploy Worker."
      );
      error.code = "SCHEMA_NOT_READY";
      throw error;
    }

    mediaSocialReady = true;
  })();

  try {
    await mediaSocialPromise;
  } finally {
    mediaSocialPromise = null;
  }
}
