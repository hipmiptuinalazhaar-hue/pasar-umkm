let engagementSchemaReady = false;
let engagementSchemaPromise = null;

export async function ensureEngagementSchema(sql) {
  if (engagementSchemaReady) return;
  if (engagementSchemaPromise) return engagementSchemaPromise;

  engagementSchemaPromise = (async () => {
    const rows = await sql`
      SELECT to_regclass('public.product_likes') IS NOT NULL AS product_likes
    `;

    if (!rows[0]?.product_likes) {
      const error = new Error(
        "[schema:not-ready] product_likes belum tersedia. Jalankan migration database sebelum deploy Worker."
      );
      error.code = "SCHEMA_NOT_READY";
      throw error;
    }

    engagementSchemaReady = true;
  })();

  try {
    await engagementSchemaPromise;
  } finally {
    engagementSchemaPromise = null;
  }
}
