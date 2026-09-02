let socialSchemaReady = false;
let socialSchemaPromise = null;

function schemaError(missing) {
  const error = new Error(
    `[schema:not-ready] Social schema belum siap: ${missing.join(", ")}. ` +
    "Jalankan migration database sebelum deploy Worker."
  );
  error.code = "SCHEMA_NOT_READY";
  return error;
}

/**
 * Runtime hanya MEMVERIFIKASI schema.
 * DDL (CREATE/ALTER/INDEX/TRIGGER) wajib dijalankan lewat migration,
 * bukan dari request pengguna atau cold start Worker.
 */
export async function ensureSocialSchema(sql) {
  if (socialSchemaReady) return;
  if (socialSchemaPromise) return socialSchemaPromise;

  socialSchemaPromise = (async () => {
    const rows = await sql`
      SELECT
        to_regclass('public.user_follows') IS NOT NULL AS user_follows,
        to_regclass('public.direct_conversations') IS NOT NULL AS direct_conversations,
        to_regclass('public.direct_messages') IS NOT NULL AS direct_messages
    `;

    const state = rows[0] || {};
    const missing = [];

    if (!state.user_follows) missing.push("user_follows");
    if (!state.direct_conversations) missing.push("direct_conversations");
    if (!state.direct_messages) missing.push("direct_messages");

    if (missing.length) {
      throw schemaError(missing);
    }

    socialSchemaReady = true;
  })();

  try {
    await socialSchemaPromise;
  } finally {
    socialSchemaPromise = null;
  }
}
