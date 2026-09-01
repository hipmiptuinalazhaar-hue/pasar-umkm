-- =========================================================
-- PASAR UMKM
-- MIGRATION 001 - SOCIAL COMMENTS SCHEMA SYNC
--
-- Tujuan:
-- 1. Menyamakan schema repository dengan backend Worker aktif.
-- 2. Menambahkan product_comments.
-- 3. Menambahkan parent_comment_id untuk reply/thread.
--
-- Migration ini dibuat idempotent agar aman dijalankan ulang.
-- Jalankan SETELAH database/schema.sql.
-- =========================================================

BEGIN;


-- =========================================================
-- POST COMMENTS - REPLY SUPPORT
-- =========================================================

ALTER TABLE post_comments
ADD COLUMN IF NOT EXISTS parent_comment_id UUID;


DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'post_comments_parent_comment_id_fkey'
    ) THEN
        ALTER TABLE post_comments
        ADD CONSTRAINT post_comments_parent_comment_id_fkey
        FOREIGN KEY (parent_comment_id)
        REFERENCES post_comments(id)
        ON DELETE CASCADE;
    END IF;
END $$;


CREATE INDEX IF NOT EXISTS idx_post_comments_parent
ON post_comments(parent_comment_id);


CREATE INDEX IF NOT EXISTS idx_post_comments_active_parent
ON post_comments(post_id, parent_comment_id, created_at)
WHERE is_active = TRUE;


-- =========================================================
-- PRODUCT COMMENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS product_comments (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    product_id UUID NOT NULL
        REFERENCES products(id)
        ON DELETE CASCADE,

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    parent_comment_id UUID
        REFERENCES product_comments(id)
        ON DELETE CASCADE,

    content TEXT NOT NULL,

    is_active BOOLEAN NOT NULL
        DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT product_comments_content_not_empty
        CHECK (char_length(trim(content)) > 0),

    CONSTRAINT product_comments_content_length
        CHECK (char_length(content) <= 500)
);


-- Untuk database yang sudah memiliki product_comments
-- sebelum fitur reply ditambahkan.
ALTER TABLE product_comments
ADD COLUMN IF NOT EXISTS parent_comment_id UUID;


DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'product_comments_parent_comment_id_fkey'
    ) THEN
        ALTER TABLE product_comments
        ADD CONSTRAINT product_comments_parent_comment_id_fkey
        FOREIGN KEY (parent_comment_id)
        REFERENCES product_comments(id)
        ON DELETE CASCADE;
    END IF;
END $$;


CREATE INDEX IF NOT EXISTS idx_product_comments_product_id
ON product_comments(product_id);

CREATE INDEX IF NOT EXISTS idx_product_comments_user_id
ON product_comments(user_id);

CREATE INDEX IF NOT EXISTS idx_product_comments_created_at
ON product_comments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_comments_parent
ON product_comments(parent_comment_id);

CREATE INDEX IF NOT EXISTS idx_product_comments_active_product
ON product_comments(product_id, created_at)
WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_product_comments_active_parent
ON product_comments(product_id, parent_comment_id, created_at)
WHERE is_active = TRUE;


-- =========================================================
-- UPDATED_AT TRIGGER
-- set_updated_at() dibuat oleh database/schema.sql.
-- =========================================================

DROP TRIGGER IF EXISTS product_comments_updated_at
ON product_comments;

CREATE TRIGGER product_comments_updated_at
BEFORE UPDATE ON product_comments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


COMMIT;
