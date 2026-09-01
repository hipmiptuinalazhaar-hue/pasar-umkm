let engagementSchemaReady = false;
let engagementSchemaPromise = null;

export async function ensureEngagementSchema(sql) {
  if (engagementSchemaReady) {
    return;
  }

  if (engagementSchemaPromise) {
    return engagementSchemaPromise;
  }

  engagementSchemaPromise = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS product_likes (
        user_id UUID NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,
        product_id UUID NOT NULL
          REFERENCES products(id)
          ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL
          DEFAULT NOW(),
        PRIMARY KEY (user_id, product_id)
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_product_likes_product
      ON product_likes(product_id, created_at DESC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_product_likes_user
      ON product_likes(user_id, created_at DESC)
    `;

    engagementSchemaReady = true;
  })();

  try {
    await engagementSchemaPromise;
  } finally {
    engagementSchemaPromise = null;
  }
}
