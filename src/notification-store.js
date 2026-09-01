import { neon } from "@neondatabase/serverless";
import { ensureSocialSchema } from "./social-store.js";

let notificationInfrastructureReady = false;
let notificationInfrastructurePromise = null;

async function tableExists(sql, tableName) {
  const rows = await sql`
    SELECT to_regclass(${`public.${tableName}`}) IS NOT NULL AS exists
  `;

  return Boolean(rows[0]?.exists);
}

async function ensureNotificationColumns(sql) {
  await sql`
    ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS actor_user_id UUID
      REFERENCES users(id)
      ON DELETE SET NULL
  `;

  await sql`
    ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS entity_type VARCHAR(30)
  `;

  await sql`
    ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS entity_id UUID
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON notifications(user_id, created_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created
    ON notifications(user_id, is_read, created_at DESC)
  `;
}

async function ensureWelcomeNotificationTrigger(sql) {
  await sql`
    CREATE OR REPLACE FUNCTION notify_new_user_welcome_event()
    RETURNS TRIGGER AS $$
    BEGIN
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
        NEW.id,
        'system',
        'Selamat datang, ' || COALESCE(NULLIF(trim(NEW.name), ''), 'Pengguna') || '!',
        'Selamat datang ' || COALESCE(NULLIF(trim(NEW.name), ''), 'Pengguna') || ', mulai buat toko sendiri yuk.',
        'sell',
        NEW.id,
        NULL,
        'start_selling',
        NEW.id,
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
          tgname = 'trg_notify_new_user_welcome'
          AND tgrelid = 'users'::regclass
          AND NOT tgisinternal
      ) THEN
        CREATE TRIGGER trg_notify_new_user_welcome
        AFTER INSERT ON users
        FOR EACH ROW
        EXECUTE FUNCTION notify_new_user_welcome_event();
      END IF;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$
  `;
}

async function ensureFollowNotificationTrigger(sql) {
  await sql`
    CREATE OR REPLACE FUNCTION notify_user_follow_event()
    RETURNS TRIGGER AS $$
    DECLARE
      actor_name TEXT;
    BEGIN
      IF NEW.follower_id = NEW.following_id THEN
        RETURN NEW;
      END IF;

      SELECT name
      INTO actor_name
      FROM users
      WHERE id = NEW.follower_id;

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
        NEW.following_id,
        'system',
        'Pengikut baru',
        COALESCE(actor_name, 'Seseorang') || ' mulai mengikuti Anda.',
        'profile',
        NEW.follower_id,
        NEW.follower_id,
        'profile',
        NEW.follower_id,
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
          tgname = 'trg_notify_user_follow'
          AND tgrelid = 'user_follows'::regclass
          AND NOT tgisinternal
      ) THEN
        CREATE TRIGGER trg_notify_user_follow
        AFTER INSERT ON user_follows
        FOR EACH ROW
        EXECUTE FUNCTION notify_user_follow_event();
      END IF;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$
  `;
}

async function ensurePostLikeNotificationTrigger(sql) {
  if (!(await tableExists(sql, "post_likes"))) {
    return;
  }

  await sql`
    CREATE OR REPLACE FUNCTION notify_post_like_event()
    RETURNS TRIGGER AS $$
    DECLARE
      recipient_id UUID;
      actor_name TEXT;
    BEGIN
      SELECT s.owner_id
      INTO recipient_id
      FROM posts p
      JOIN stores s
        ON s.id = p.store_id
      WHERE p.id = NEW.post_id
      LIMIT 1;

      IF recipient_id IS NULL OR recipient_id = NEW.user_id THEN
        RETURN NEW;
      END IF;

      SELECT name
      INTO actor_name
      FROM users
      WHERE id = NEW.user_id;

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
        'system',
        'Like baru',
        COALESCE(actor_name, 'Seseorang') || ' menyukai postingan Anda.',
        'post',
        NEW.post_id,
        NEW.user_id,
        'post',
        NEW.post_id,
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
          tgname = 'trg_notify_post_like'
          AND tgrelid = 'post_likes'::regclass
          AND NOT tgisinternal
      ) THEN
        CREATE TRIGGER trg_notify_post_like
        AFTER INSERT ON post_likes
        FOR EACH ROW
        EXECUTE FUNCTION notify_post_like_event();
      END IF;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$
  `;
}

async function ensurePostCommentNotificationTrigger(sql) {
  if (!(await tableExists(sql, "post_comments"))) {
    return;
  }

  await sql`
    CREATE OR REPLACE FUNCTION notify_post_comment_event()
    RETURNS TRIGGER AS $$
    DECLARE
      recipient_id UUID;
      actor_name TEXT;
    BEGIN
      SELECT s.owner_id
      INTO recipient_id
      FROM posts p
      JOIN stores s
        ON s.id = p.store_id
      WHERE p.id = NEW.post_id
      LIMIT 1;

      IF recipient_id IS NULL OR recipient_id = NEW.user_id THEN
        RETURN NEW;
      END IF;

      SELECT name
      INTO actor_name
      FROM users
      WHERE id = NEW.user_id;

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
          tgname = 'trg_notify_post_comment'
          AND tgrelid = 'post_comments'::regclass
          AND NOT tgisinternal
      ) THEN
        CREATE TRIGGER trg_notify_post_comment
        AFTER INSERT ON post_comments
        FOR EACH ROW
        EXECUTE FUNCTION notify_post_comment_event();
      END IF;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$
  `;
}

async function ensureProductCommentNotificationTrigger(sql) {
  if (!(await tableExists(sql, "product_comments"))) {
    return;
  }

  await sql`
    CREATE OR REPLACE FUNCTION notify_product_comment_event()
    RETURNS TRIGGER AS $$
    DECLARE
      recipient_id UUID;
      actor_name TEXT;
      product_name TEXT;
    BEGIN
      SELECT
        s.owner_id,
        p.name
      INTO
        recipient_id,
        product_name
      FROM products p
      JOIN stores s
        ON s.id = p.store_id
      WHERE p.id = NEW.product_id
      LIMIT 1;

      IF recipient_id IS NULL OR recipient_id = NEW.user_id THEN
        RETURN NEW;
      END IF;

      SELECT name
      INTO actor_name
      FROM users
      WHERE id = NEW.user_id;

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
        'system',
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
          tgname = 'trg_notify_product_comment'
          AND tgrelid = 'product_comments'::regclass
          AND NOT tgisinternal
      ) THEN
        CREATE TRIGGER trg_notify_product_comment
        AFTER INSERT ON product_comments
        FOR EACH ROW
        EXECUTE FUNCTION notify_product_comment_event();
      END IF;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$
  `;
}

export async function ensureNotificationInfrastructure(env) {
  if (notificationInfrastructureReady) {
    return;
  }

  if (notificationInfrastructurePromise) {
    return notificationInfrastructurePromise;
  }

  notificationInfrastructurePromise = (async () => {
    const sql = neon(env.DATABASE_URL);

    await ensureSocialSchema(sql);
    await ensureNotificationColumns(sql);
    await ensureWelcomeNotificationTrigger(sql);
    await ensureFollowNotificationTrigger(sql);
    await ensurePostLikeNotificationTrigger(sql);
    await ensurePostCommentNotificationTrigger(sql);
    await ensureProductCommentNotificationTrigger(sql);

    notificationInfrastructureReady = true;
  })();

  try {
    await notificationInfrastructurePromise;
  } finally {
    notificationInfrastructurePromise = null;
  }
}
