let functionalityReady = false;
let functionalityPromise = null;

async function ensureSavedItems(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS saved_items (
      user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      item_type VARCHAR(12) NOT NULL,
      item_id UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),
      PRIMARY KEY (user_id, item_type, item_id),
      CONSTRAINT saved_items_type_check
        CHECK (item_type IN ('post', 'product'))
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_saved_items_user_created
    ON saved_items(user_id, created_at DESC)
  `;
}

async function ensureStories(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS stories (
      id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      store_id UUID
        REFERENCES stores(id)
        ON DELETE CASCADE,
      image_url TEXT,
      caption TEXT,
      is_active BOOLEAN NOT NULL
        DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
        DEFAULT (NOW() + INTERVAL '24 hours'),
      CONSTRAINT stories_content_check
        CHECK (
          NULLIF(trim(COALESCE(image_url, '')), '') IS NOT NULL
          OR NULLIF(trim(COALESCE(caption, '')), '') IS NOT NULL
        )
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_stories_active_expiry
    ON stories(is_active, expires_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_stories_user_created
    ON stories(user_id, created_at DESC)
  `;
}

async function ensureOrderIndexes(sql) {
  await sql`
    CREATE INDEX IF NOT EXISTS idx_orders_buyer_created
    ON orders(buyer_id, created_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_orders_store_created
    ON orders(store_id, created_at DESC)
  `;
}

async function ensureDirectMessageNotification(sql) {
  await sql`
    CREATE OR REPLACE FUNCTION notify_direct_message_event()
    RETURNS TRIGGER AS $$
    DECLARE
      recipient_id UUID;
      actor_name TEXT;
    BEGIN
      SELECT
        CASE
          WHEN c.user_a_id = NEW.sender_id THEN c.user_b_id
          ELSE c.user_a_id
        END
      INTO recipient_id
      FROM direct_conversations c
      WHERE c.id = NEW.conversation_id
      LIMIT 1;

      IF recipient_id IS NULL OR recipient_id = NEW.sender_id THEN
        RETURN NEW;
      END IF;

      SELECT name
      INTO actor_name
      FROM users
      WHERE id = NEW.sender_id;

      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        target_type,
        target_id,
        actor_user_id,
        entity_type,
        entity_id,
        is_read,
        created_at
      )
      VALUES (
        recipient_id,
        'message',
        'Pesan baru',
        COALESCE(actor_name, 'Seseorang') || ' mengirim pesan kepada Anda.',
        'message',
        NEW.conversation_id,
        NEW.sender_id,
        'message',
        NEW.conversation_id,
        FALSE,
        NOW()
      );

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE
          tgname = 'trg_notify_direct_message'
          AND tgrelid = 'direct_messages'::regclass
          AND NOT tgisinternal
      ) THEN
        CREATE TRIGGER trg_notify_direct_message
        AFTER INSERT ON direct_messages
        FOR EACH ROW
        EXECUTE FUNCTION notify_direct_message_event();
      END IF;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$
  `;
}

async function enhancePostCommentNotifications(sql) {
  await sql`
    CREATE OR REPLACE FUNCTION notify_post_comment_event()
    RETURNS TRIGGER AS $$
    DECLARE
      owner_id UUID;
      parent_owner_id UUID;
      actor_name TEXT;
    BEGIN
      SELECT s.owner_id
      INTO owner_id
      FROM posts p
      JOIN stores s ON s.id = p.store_id
      WHERE p.id = NEW.post_id
      LIMIT 1;

      SELECT name
      INTO actor_name
      FROM users
      WHERE id = NEW.user_id;

      IF NEW.parent_comment_id IS NOT NULL THEN
        SELECT user_id
        INTO parent_owner_id
        FROM post_comments
        WHERE id = NEW.parent_comment_id
        LIMIT 1;

        IF parent_owner_id IS NOT NULL
           AND parent_owner_id <> NEW.user_id THEN
          INSERT INTO notifications (
            user_id, type, title, message,
            target_type, target_id,
            actor_user_id, entity_type, entity_id,
            is_read, created_at
          )
          VALUES (
            parent_owner_id,
            'system',
            'Balasan komentar',
            COALESCE(actor_name, 'Seseorang') || ' membalas komentar Anda.',
            'post',
            NEW.post_id,
            NEW.user_id,
            'post',
            NEW.post_id,
            FALSE,
            NOW()
          );
        END IF;
      END IF;

      IF owner_id IS NOT NULL
         AND owner_id <> NEW.user_id
         AND (parent_owner_id IS NULL OR owner_id <> parent_owner_id) THEN
        INSERT INTO notifications (
          user_id, type, title, message,
          target_type, target_id,
          actor_user_id, entity_type, entity_id,
          is_read, created_at
        )
        VALUES (
          owner_id,
          'system',
          'Komentar baru',
          COALESCE(actor_name, 'Seseorang') || ' mengomentari postingan Anda.',
          'post',
          NEW.post_id,
          NEW.user_id,
          'post',
          NEW.post_id,
          FALSE,
          NOW()
        );
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;
}

async function enhanceProductCommentNotifications(sql) {
  await sql`
    CREATE OR REPLACE FUNCTION notify_product_comment_event()
    RETURNS TRIGGER AS $$
    DECLARE
      owner_id UUID;
      parent_owner_id UUID;
      actor_name TEXT;
      product_name TEXT;
    BEGIN
      SELECT s.owner_id, p.name
      INTO owner_id, product_name
      FROM products p
      JOIN stores s ON s.id = p.store_id
      WHERE p.id = NEW.product_id
      LIMIT 1;

      SELECT name
      INTO actor_name
      FROM users
      WHERE id = NEW.user_id;

      IF NEW.parent_comment_id IS NOT NULL THEN
        SELECT user_id
        INTO parent_owner_id
        FROM product_comments
        WHERE id = NEW.parent_comment_id
        LIMIT 1;

        IF parent_owner_id IS NOT NULL
           AND parent_owner_id <> NEW.user_id THEN
          INSERT INTO notifications (
            user_id, type, title, message,
            target_type, target_id,
            actor_user_id, entity_type, entity_id,
            is_read, created_at
          )
          VALUES (
            parent_owner_id,
            'system',
            'Balasan komentar',
            COALESCE(actor_name, 'Seseorang') || ' membalas komentar Anda.',
            'product',
            NEW.product_id,
            NEW.user_id,
            'product',
            NEW.product_id,
            FALSE,
            NOW()
          );
        END IF;
      END IF;

      IF owner_id IS NOT NULL
         AND owner_id <> NEW.user_id
         AND (parent_owner_id IS NULL OR owner_id <> parent_owner_id) THEN
        INSERT INTO notifications (
          user_id, type, title, message,
          target_type, target_id,
          actor_user_id, entity_type, entity_id,
          is_read, created_at
        )
        VALUES (
          owner_id,
          'product',
          'Komentar produk',
          COALESCE(actor_name, 'Seseorang') ||
            ' mengomentari ' || COALESCE(product_name, 'produk Anda') || '.',
          'product',
          NEW.product_id,
          NEW.user_id,
          'product',
          NEW.product_id,
          FALSE,
          NOW()
        );
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;
}

export async function ensureFunctionalityInfrastructure(sql) {
  if (functionalityReady) {
    return;
  }

  if (functionalityPromise) {
    return functionalityPromise;
  }

  functionalityPromise = (async () => {
    await ensureSavedItems(sql);
    await ensureStories(sql);
    await ensureOrderIndexes(sql);
    await ensureDirectMessageNotification(sql);
    await enhancePostCommentNotifications(sql);
    await enhanceProductCommentNotifications(sql);
    functionalityReady = true;
  })();

  try {
    await functionalityPromise;
  } finally {
    functionalityPromise = null;
  }
}
