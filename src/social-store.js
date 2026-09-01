let socialSchemaReady = false;
let socialSchemaPromise = null;

/**
 * Skema sosial dibuat idempotent karena aplikasi sudah memakai pola
 * bootstrap tabel runtime untuk metadata profil. Semua DDL aman dipanggil
 * berulang dan dijalankan hanya sekali per Worker isolate.
 */
export async function ensureSocialSchema(sql) {
  if (socialSchemaReady) {
    return;
  }

  if (socialSchemaPromise) {
    return socialSchemaPromise;
  }

  socialSchemaPromise = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS user_follows (
        follower_id UUID NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,
        following_id UUID NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL
          DEFAULT NOW(),
        PRIMARY KEY (follower_id, following_id),
        CONSTRAINT user_follows_no_self
          CHECK (follower_id <> following_id)
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_follows_following
      ON user_follows(following_id, created_at DESC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_follows_follower
      ON user_follows(follower_id, created_at DESC)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS direct_conversations (
        id UUID PRIMARY KEY
          DEFAULT gen_random_uuid(),
        user_a_id UUID NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,
        user_b_id UUID NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL
          DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL
          DEFAULT NOW(),
        CONSTRAINT direct_conversations_no_self
          CHECK (user_a_id <> user_b_id),
        CONSTRAINT direct_conversations_pair_order
          CHECK (user_a_id::text < user_b_id::text),
        UNIQUE (user_a_id, user_b_id)
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_direct_conversations_user_a
      ON direct_conversations(user_a_id, updated_at DESC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_direct_conversations_user_b
      ON direct_conversations(user_b_id, updated_at DESC)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS direct_messages (
        id UUID PRIMARY KEY
          DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL
          REFERENCES direct_conversations(id)
          ON DELETE CASCADE,
        sender_id UUID NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,
        message TEXT NOT NULL,
        is_read BOOLEAN NOT NULL
          DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL
          DEFAULT NOW(),
        read_at TIMESTAMPTZ,
        CONSTRAINT direct_messages_not_empty
          CHECK (char_length(trim(message)) > 0),
        CONSTRAINT direct_messages_length
          CHECK (char_length(message) <= 2000)
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation
      ON direct_messages(conversation_id, created_at ASC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_direct_messages_unread
      ON direct_messages(conversation_id, is_read, created_at DESC)
    `;

    socialSchemaReady = true;
  })();

  try {
    await socialSchemaPromise;
  } finally {
    socialSchemaPromise = null;
  }
}
