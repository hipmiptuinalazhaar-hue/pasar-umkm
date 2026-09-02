let businessAgencyReady = false;
let businessAgencyPromise = null;

export async function ensureBusinessAgencyInfrastructure(sql) {
  if (businessAgencyReady) return;
  if (businessAgencyPromise) return businessAgencyPromise;

  businessAgencyPromise = (async () => {
    const rows = await sql`
      SELECT to_regclass('public.business_cash_entries') IS NOT NULL AS business_cash_entries
    `;

    if (!rows[0]?.business_cash_entries) {
      const error = new Error(
        "[schema:not-ready] business_cash_entries belum tersedia. Jalankan migration database sebelum deploy Worker."
      );
      error.code = "SCHEMA_NOT_READY";
      throw error;
    }

    businessAgencyReady = true;
  })();

  try {
    await businessAgencyPromise;
  } finally {
    businessAgencyPromise = null;
  }
}
