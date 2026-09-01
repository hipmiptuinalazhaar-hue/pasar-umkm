let ratingReady = false;
let ratingPromise = null;

export async function ensureRatingInfrastructure(sql) {
  if (ratingReady) return;
  if (ratingPromise) return ratingPromise;

  ratingPromise = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS store_ratings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        review TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (order_id, user_id)
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS product_ratings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        review TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (order_id, product_id, user_id)
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_store_ratings_store
      ON store_ratings(store_id, created_at DESC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_product_ratings_product
      ON product_ratings(product_id, created_at DESC)
    `;

    ratingReady = true;
  })();

  try {
    await ratingPromise;
  } finally {
    ratingPromise = null;
  }
}
