let mediaSocialReady = false;
let mediaSocialPromise = null;

export async function ensureMediaSocialInfrastructure(sql) {
  if (mediaSocialReady) return;
  if (mediaSocialPromise) return mediaSocialPromise;

  mediaSocialPromise = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS reels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
        video_url TEXT NOT NULL,
        cloudinary_public_id TEXT,
        caption TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_reels_active_created
      ON reels(is_active, created_at DESC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_reels_user_created
      ON reels(user_id, created_at DESC)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS reel_likes (
        reel_id UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (reel_id, user_id)
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS reel_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reel_id UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT reel_comments_body_check
          CHECK (char_length(trim(body)) BETWEEN 1 AND 1000)
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_reel_comments_reel_created
      ON reel_comments(reel_id, created_at ASC)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS story_likes (
        story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (story_id, user_id)
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS story_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT story_comments_body_check
          CHECK (char_length(trim(body)) BETWEEN 1 AND 500)
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_story_comments_story_created
      ON story_comments(story_id, created_at ASC)
    `;

    mediaSocialReady = true;
  })();

  try {
    await mediaSocialPromise;
  } finally {
    mediaSocialPromise = null;
  }
}
