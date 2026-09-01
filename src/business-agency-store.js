let businessAgencyReady = false;
let businessAgencyPromise = null;

export async function ensureBusinessAgencyInfrastructure(sql) {
  if (businessAgencyReady) return;
  if (businessAgencyPromise) return businessAgencyPromise;

  businessAgencyPromise = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS business_cash_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
        entry_type VARCHAR(10) NOT NULL CHECK (entry_type IN ('income', 'expense')),
        amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
        category VARCHAR(100),
        description VARCHAR(500),
        entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_business_cash_user_date
      ON business_cash_entries(user_id, entry_date DESC, created_at DESC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_business_cash_store_date
      ON business_cash_entries(store_id, entry_date DESC, created_at DESC)
    `;

    businessAgencyReady = true;
  })();

  try {
    await businessAgencyPromise;
  } finally {
    businessAgencyPromise = null;
  }
}
