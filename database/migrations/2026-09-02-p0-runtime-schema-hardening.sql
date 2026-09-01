-- =========================================================
-- PASAR UMKM - P0 RUNTIME SCHEMA HARDENING
-- 2026-09-02
--
-- Tujuan:
-- 1. Semua schema mutation dilakukan terkontrol sebelum deploy.
-- 2. Runtime Worker hanya memverifikasi schema, bukan membuat/mengubahnya.
-- 3. Migration menolak database yang tidak memiliki base schema Pasar UMKM.
--
-- Idempotent: aman dijalankan ulang pada database yang benar.
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------
-- GUARD: JANGAN PERNAH MEMBANGUN P0 DI DATABASE YANG SALAH
-- ---------------------------------------------------------
DO $$
DECLARE
  missing_objects TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    missing_objects := array_append(missing_objects, 'users');
  END IF;
  IF to_regclass('public.sessions') IS NULL THEN
    missing_objects := array_append(missing_objects, 'sessions');
  END IF;
  IF to_regclass('public.categories') IS NULL THEN
    missing_objects := array_append(missing_objects, 'categories');
  END IF;
  IF to_regclass('public.stores') IS NULL THEN
    missing_objects := array_append(missing_objects, 'stores');
  END IF;
  IF to_regclass('public.products') IS NULL THEN
    missing_objects := array_append(missing_objects, 'products');
  END IF;
  IF to_regclass('public.posts') IS NULL THEN
    missing_objects := array_append(missing_objects, 'posts');
  END IF;
  IF to_regclass('public.orders') IS NULL THEN
    missing_objects := array_append(missing_objects, 'orders');
  END IF;
  IF to_regclass('public.notifications') IS NULL THEN
    missing_objects := array_append(missing_objects, 'notifications');
  END IF;

  IF cardinality(missing_objects) > 0 THEN
    RAISE EXCEPTION
      'P0 migration ditolak. Database % bukan target base schema Pasar UMKM. Missing: %',
      current_database(),
      array_to_string(missing_objects, ', ');
  END IF;
END $$;

-- ---------------------------------------------------------
-- MIGRATION LEDGER
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  description TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------
-- PRODUCT COMMENTS
-- Menutup drift: API sudah memakai tabel ini tetapi schema utama lama
-- belum menjadi sumber kebenaran yang lengkap.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES product_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_comments_content_not_empty
    CHECK (char_length(trim(content)) > 0),
  CONSTRAINT product_comments_content_length
    CHECK (char_length(content) <= 500)
);

ALTER TABLE post_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id UUID
  REFERENCES post_comments(id)
  ON DELETE CASCADE;

ALTER TABLE product_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id UUID
  REFERENCES product_comments(id)
  ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_product_comments_product_id
  ON product_comments(product_id);
CREATE INDEX IF NOT EXISTS idx_product_comments_user_id
  ON product_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_product_comments_created_at
  ON product_comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_comments_active_product
  ON product_comments(product_id, created_at)
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_product_comments_parent
  ON product_comments(parent_comment_id)
  WHERE parent_comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_post_comments_parent
  ON post_comments(parent_comment_id)
  WHERE parent_comment_id IS NOT NULL;

DROP TRIGGER IF EXISTS product_comments_updated_at ON product_comments;
CREATE TRIGGER product_comments_updated_at
BEFORE UPDATE ON product_comments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------
-- SOCIAL GRAPH + DIRECT CHAT CORE
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_follows (
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT user_follows_no_self CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_following
  ON user_follows(following_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_follows_follower
  ON user_follows(follower_id, created_at DESC);

CREATE TABLE IF NOT EXISTS direct_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT direct_conversations_no_self CHECK (user_a_id <> user_b_id),
  CONSTRAINT direct_conversations_pair_order CHECK (user_a_id::text < user_b_id::text),
  UNIQUE (user_a_id, user_b_id)
);

CREATE INDEX IF NOT EXISTS idx_direct_conversations_user_a
  ON direct_conversations(user_a_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_conversations_user_b
  ON direct_conversations(user_b_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  CONSTRAINT direct_messages_not_empty CHECK (char_length(trim(message)) > 0),
  CONSTRAINT direct_messages_length CHECK (char_length(message) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation
  ON direct_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_unread
  ON direct_messages(conversation_id, is_read, created_at DESC);

-- Rich chat columns. Nullable columns avoid table rewrite for existing rows.
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(20);
UPDATE direct_messages SET message_type = 'text' WHERE message_type IS NULL;
ALTER TABLE direct_messages ALTER COLUMN message_type SET DEFAULT 'text';
ALTER TABLE direct_messages ALTER COLUMN message_type SET NOT NULL;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS media_name TEXT;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS media_duration_seconds INTEGER;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Per-user chat state.
CREATE TABLE IF NOT EXISTS direct_conversation_user_state (
  conversation_id UUID NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hidden_before TIMESTAMPTZ,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

ALTER TABLE direct_conversation_user_state
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE direct_conversation_user_state
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_direct_conversation_user_state_user
  ON direct_conversation_user_state(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS direct_message_user_state (
  message_id UUID NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_direct_message_user_state_user
  ON direct_message_user_state(user_id, updated_at DESC);

-- ---------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS actor_user_id UUID
  REFERENCES users(id)
  ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_type VARCHAR(30);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_id UUID;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created
  ON notifications(user_id, is_read, created_at DESC);

CREATE OR REPLACE FUNCTION notify_new_user_welcome_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (
    user_id, type, title, message,
    target_type, target_id,
    actor_user_id, entity_type, entity_id,
    is_read, created_at
  ) VALUES (
    NEW.id,
    'system',
    'Selamat datang, ' || COALESCE(NULLIF(trim(NEW.name), ''), 'Pengguna') || '!',
    'Selamat datang ' || COALESCE(NULLIF(trim(NEW.name), ''), 'Pengguna') || ', mulai buat toko sendiri yuk.',
    'sell', NEW.id,
    NULL, 'start_selling', NEW.id,
    FALSE, NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_new_user_welcome ON users;
CREATE TRIGGER trg_notify_new_user_welcome
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION notify_new_user_welcome_event();

CREATE OR REPLACE FUNCTION notify_user_follow_event()
RETURNS TRIGGER AS $$
DECLARE
  actor_name TEXT;
BEGIN
  IF NEW.follower_id = NEW.following_id THEN
    RETURN NEW;
  END IF;

  SELECT name INTO actor_name
  FROM users
  WHERE id = NEW.follower_id;

  INSERT INTO notifications (
    user_id, type, title, message,
    target_type, target_id,
    actor_user_id, entity_type, entity_id,
    is_read, created_at
  ) VALUES (
    NEW.following_id,
    'system',
    'Pengikut baru',
    COALESCE(actor_name, 'Seseorang') || ' mulai mengikuti Anda.',
    'profile', NEW.follower_id,
    NEW.follower_id, 'profile', NEW.follower_id,
    FALSE, NOW()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_user_follow ON user_follows;
CREATE TRIGGER trg_notify_user_follow
AFTER INSERT ON user_follows
FOR EACH ROW
EXECUTE FUNCTION notify_user_follow_event();

CREATE OR REPLACE FUNCTION notify_post_like_event()
RETURNS TRIGGER AS $$
DECLARE
  recipient_id UUID;
  actor_name TEXT;
BEGIN
  SELECT s.owner_id
  INTO recipient_id
  FROM posts p
  JOIN stores s ON s.id = p.store_id
  WHERE p.id = NEW.post_id
  LIMIT 1;

  IF recipient_id IS NULL OR recipient_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT name INTO actor_name FROM users WHERE id = NEW.user_id;

  INSERT INTO notifications (
    user_id, type, title, message,
    target_type, target_id,
    actor_user_id, entity_type, entity_id,
    is_read, created_at
  ) VALUES (
    recipient_id,
    'system',
    'Like baru',
    COALESCE(actor_name, 'Seseorang') || ' menyukai postingan Anda.',
    'post', NEW.post_id,
    NEW.user_id, 'post', NEW.post_id,
    FALSE, NOW()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_post_like ON post_likes;
CREATE TRIGGER trg_notify_post_like
AFTER INSERT ON post_likes
FOR EACH ROW
EXECUTE FUNCTION notify_post_like_event();

-- ---------------------------------------------------------
-- SAVED ITEMS + STORIES + ORDER INDEXES
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_items (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type VARCHAR(12) NOT NULL,
  item_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_type, item_id),
  CONSTRAINT saved_items_type_check CHECK (item_type IN ('post', 'product'))
);
CREATE INDEX IF NOT EXISTS idx_saved_items_user_created
  ON saved_items(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  image_url TEXT,
  caption TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  CONSTRAINT stories_content_check CHECK (
    NULLIF(trim(COALESCE(image_url, '')), '') IS NOT NULL
    OR NULLIF(trim(COALESCE(caption, '')), '') IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS idx_stories_active_expiry
  ON stories(is_active, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_user_created
  ON stories(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_buyer_created
  ON orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_store_created
  ON orders(store_id, created_at DESC);

-- Latest direct-message notification trigger.
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

  SELECT name INTO actor_name FROM users WHERE id = NEW.sender_id;

  INSERT INTO notifications (
    user_id, type, title, message,
    target_type, target_id,
    actor_user_id, entity_type, entity_id,
    is_read, created_at
  ) VALUES (
    recipient_id,
    'message',
    'Pesan baru',
    COALESCE(actor_name, 'Seseorang') || ' mengirim pesan kepada Anda.',
    'message', NEW.conversation_id,
    NEW.sender_id, 'message', NEW.conversation_id,
    FALSE, NOW()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_direct_message ON direct_messages;
CREATE TRIGGER trg_notify_direct_message
AFTER INSERT ON direct_messages
FOR EACH ROW
EXECUTE FUNCTION notify_direct_message_event();

-- Latest post comment/reply notification trigger.
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

  SELECT name INTO actor_name FROM users WHERE id = NEW.user_id;

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
      ) VALUES (
        parent_owner_id,
        'system',
        'Balasan komentar',
        COALESCE(actor_name, 'Seseorang') || ' membalas komentar Anda.',
        'post', NEW.post_id,
        NEW.user_id, 'post', NEW.post_id,
        FALSE, NOW()
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
    ) VALUES (
      owner_id,
      'system',
      'Komentar baru',
      COALESCE(actor_name, 'Seseorang') || ' mengomentari postingan Anda.',
      'post', NEW.post_id,
      NEW.user_id, 'post', NEW.post_id,
      FALSE, NOW()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_post_comment ON post_comments;
CREATE TRIGGER trg_notify_post_comment
AFTER INSERT ON post_comments
FOR EACH ROW
EXECUTE FUNCTION notify_post_comment_event();

-- Latest product comment/reply notification trigger.
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

  SELECT name INTO actor_name FROM users WHERE id = NEW.user_id;

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
      ) VALUES (
        parent_owner_id,
        'system',
        'Balasan komentar',
        COALESCE(actor_name, 'Seseorang') || ' membalas komentar Anda.',
        'product', NEW.product_id,
        NEW.user_id, 'product', NEW.product_id,
        FALSE, NOW()
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
    ) VALUES (
      owner_id,
      'product',
      'Komentar produk',
      COALESCE(actor_name, 'Seseorang') ||
        ' mengomentari ' || COALESCE(product_name, 'produk Anda') || '.',
      'product', NEW.product_id,
      NEW.user_id, 'product', NEW.product_id,
      FALSE, NOW()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_product_comment ON product_comments;
CREATE TRIGGER trg_notify_product_comment
AFTER INSERT ON product_comments
FOR EACH ROW
EXECUTE FUNCTION notify_product_comment_event();

-- ---------------------------------------------------------
-- PRODUCT ENGAGEMENT
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_likes (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_product_likes_product
  ON product_likes(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_likes_user
  ON product_likes(user_id, created_at DESC);

-- ---------------------------------------------------------
-- MEDIA SOCIAL: REELS + STORY ENGAGEMENT
-- ---------------------------------------------------------
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
);
CREATE INDEX IF NOT EXISTS idx_reels_active_created
  ON reels(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reels_user_created
  ON reels(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reel_likes (
  reel_id UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (reel_id, user_id)
);

CREATE TABLE IF NOT EXISTS reel_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reel_comments_body_check CHECK (char_length(trim(body)) BETWEEN 1 AND 1000)
);
CREATE INDEX IF NOT EXISTS idx_reel_comments_reel_created
  ON reel_comments(reel_id, created_at ASC);

CREATE TABLE IF NOT EXISTS story_likes (
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, user_id)
);

CREATE TABLE IF NOT EXISTS story_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT story_comments_body_check CHECK (char_length(trim(body)) BETWEEN 1 AND 500)
);
CREATE INDEX IF NOT EXISTS idx_story_comments_story_created
  ON story_comments(story_id, created_at ASC);

-- ---------------------------------------------------------
-- RATINGS
-- ---------------------------------------------------------
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
);

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
);
CREATE INDEX IF NOT EXISTS idx_store_ratings_store
  ON store_ratings(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_ratings_product
  ON product_ratings(product_id, created_at DESC);

-- ---------------------------------------------------------
-- BUSINESS AGENCY
-- ---------------------------------------------------------
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
);
CREATE INDEX IF NOT EXISTS idx_business_cash_user_date
  ON business_cash_entries(user_id, entry_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_cash_store_date
  ON business_cash_entries(store_id, entry_date DESC, created_at DESC);

-- ---------------------------------------------------------
-- PROFILE MEDIA + STORE SOCIAL LINKS
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profile_media (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  image_data BYTEA NOT NULL,
  mime_type VARCHAR(30) NOT NULL,
  byte_size INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_profile_media_mime_check
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT user_profile_media_size_check
    CHECK (byte_size > 0 AND byte_size <= 524288)
);

CREATE TABLE IF NOT EXISTS store_social_links (
  store_id UUID PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  instagram_url TEXT,
  tiktok_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------
-- RECORD SUCCESS
-- ---------------------------------------------------------
INSERT INTO schema_migrations(version, description)
VALUES (
  '2026-09-02-p0-runtime-schema-hardening',
  'Move runtime schema mutation into controlled migration and establish schema guard.'
)
ON CONFLICT (version)
DO UPDATE SET description = EXCLUDED.description;
