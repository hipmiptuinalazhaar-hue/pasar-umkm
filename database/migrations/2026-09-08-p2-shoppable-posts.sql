-- P2 Social-Commerce: shoppable post hardening
-- Idempotent migration. No production execution is implied by this file.

ALTER TABLE post_products
    ADD COLUMN IF NOT EXISTS tag_order SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS anchor_x NUMERIC(5,4),
    ADD COLUMN IF NOT EXISTS anchor_y NUMERIC(5,4),
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE post_products
    DROP CONSTRAINT IF EXISTS post_products_tag_order_range;
ALTER TABLE post_products
    ADD CONSTRAINT post_products_tag_order_range
    CHECK (tag_order >= 0 AND tag_order < 5);

ALTER TABLE post_products
    DROP CONSTRAINT IF EXISTS post_products_anchor_x_range;
ALTER TABLE post_products
    ADD CONSTRAINT post_products_anchor_x_range
    CHECK (anchor_x IS NULL OR (anchor_x >= 0 AND anchor_x <= 1));

ALTER TABLE post_products
    DROP CONSTRAINT IF EXISTS post_products_anchor_y_range;
ALTER TABLE post_products
    ADD CONSTRAINT post_products_anchor_y_range
    CHECK (anchor_y IS NULL OR (anchor_y >= 0 AND anchor_y <= 1));

CREATE INDEX IF NOT EXISTS idx_post_products_product
    ON post_products(product_id, post_id);

CREATE INDEX IF NOT EXISTS idx_post_products_post_order
    ON post_products(post_id, tag_order, created_at);

CREATE OR REPLACE FUNCTION enforce_post_product_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
    post_store UUID;
    product_store UUID;
    product_active BOOLEAN;
    existing_count INTEGER;
BEGIN
    -- Serialize tag mutations per post so the five-tag ceiling cannot race.
    SELECT p.store_id
      INTO post_store
      FROM posts p
     WHERE p.id = NEW.post_id
       AND p.is_active = TRUE
     FOR UPDATE;

    IF post_store IS NULL THEN
        RAISE EXCEPTION 'post_not_available_for_product_tag';
    END IF;

    SELECT pr.store_id, pr.is_active
      INTO product_store, product_active
      FROM products pr
     WHERE pr.id = NEW.product_id;

    IF product_store IS NULL OR product_active IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'product_not_available_for_post_tag';
    END IF;

    IF product_store <> post_store THEN
        RAISE EXCEPTION 'cross_store_product_tag_forbidden';
    END IF;

    SELECT COUNT(*)::int
      INTO existing_count
      FROM post_products pp
     WHERE pp.post_id = NEW.post_id
       AND pp.product_id <> NEW.product_id;

    IF existing_count >= 5 THEN
        RAISE EXCEPTION 'post_product_tag_limit_exceeded';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_post_products_scope ON post_products;
CREATE TRIGGER trg_post_products_scope
BEFORE INSERT OR UPDATE OF post_id, product_id
ON post_products
FOR EACH ROW
EXECUTE FUNCTION enforce_post_product_scope();

CREATE TABLE IF NOT EXISTS app_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_migrations(name)
VALUES ('2026-09-08-p2-shoppable-posts')
ON CONFLICT (name) DO NOTHING;
