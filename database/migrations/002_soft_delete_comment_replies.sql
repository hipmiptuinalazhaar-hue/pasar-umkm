-- =========================================================
-- PASAR UMKM
-- MIGRATION 002 - SOFT DELETE COMMENT REPLIES
--
-- Tujuan:
-- Saat komentar induk di-soft-delete (is_active = FALSE),
-- semua reply aktif di bawahnya ikut dinonaktifkan.
-- Ini mencegah reply yatim dan count komentar yang tidak cocok.
--
-- Worker saat ini menormalkan reply-ke-reply agar tetap menunjuk
-- ke root comment, sehingga satu tingkat cascade ini sesuai model
-- thread yang digunakan aplikasi.
-- =========================================================

BEGIN;


CREATE OR REPLACE FUNCTION cascade_soft_delete_comment_replies()
RETURNS TRIGGER AS $$
BEGIN
    IF
        OLD.is_active = TRUE
        AND NEW.is_active = FALSE
    THEN
        IF TG_TABLE_NAME = 'post_comments' THEN
            UPDATE post_comments
            SET
                is_active = FALSE,
                updated_at = NOW()
            WHERE
                parent_comment_id = OLD.id
                AND is_active = TRUE;

        ELSIF TG_TABLE_NAME = 'product_comments' THEN
            UPDATE product_comments
            SET
                is_active = FALSE,
                updated_at = NOW()
            WHERE
                parent_comment_id = OLD.id
                AND is_active = TRUE;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS post_comments_soft_delete_replies
ON post_comments;

CREATE TRIGGER post_comments_soft_delete_replies
AFTER UPDATE OF is_active ON post_comments
FOR EACH ROW
EXECUTE FUNCTION cascade_soft_delete_comment_replies();


DROP TRIGGER IF EXISTS product_comments_soft_delete_replies
ON product_comments;

CREATE TRIGGER product_comments_soft_delete_replies
AFTER UPDATE OF is_active ON product_comments
FOR EACH ROW
EXECUTE FUNCTION cascade_soft_delete_comment_replies();


COMMIT;
