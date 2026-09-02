-- =========================================================
-- PASAR UMKM - P1 SECURITY + PERFORMANCE
-- 2026-09-02
--
-- Requires P0 migration to be present first.
-- =========================================================

-- ---------------------------------------------------------
-- READ-ONLY PREFLIGHT
-- ---------------------------------------------------------
DO $$
DECLARE
  p0_ready BOOLEAN := FALSE;
  duplicate_owners TEXT;
BEGIN
  IF to_regclass('public.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'P1 migration ditolak: schema_migrations belum tersedia. Terapkan P0 terlebih dahulu.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM schema_migrations
    WHERE version = '2026-09-02-p0-runtime-schema-hardening'
  ) INTO p0_ready;

  IF NOT p0_ready THEN
    RAISE EXCEPTION 'P1 migration ditolak: migration P0 belum tercatat.';
  END IF;

  IF to_regclass('public.stores') IS NULL
     OR to_regclass('public.products') IS NULL
     OR to_regclass('public.product_images') IS NULL
     OR to_regclass('public.product_comments') IS NULL THEN
    RAISE EXCEPTION 'P1 migration ditolak: core catalog schema belum lengkap.';
  END IF;

  SELECT string_agg(owner_id::text || ':' || store_count::text, ', ')
  INTO duplicate_owners
  FROM (
    SELECT owner_id, COUNT(*)::int AS store_count
    FROM stores
    GROUP BY owner_id
    HAVING COUNT(*) > 1
    ORDER BY owner_id
    LIMIT 20
  ) duplicates;

  IF duplicate_owners IS NOT NULL THEN
    RAISE EXCEPTION
      'P1 migration ditolak: terdapat owner dengan lebih dari satu toko (%). Rapikan data sebelum menambah unique constraint.',
      duplicate_owners;
  END IF;
END $$;

-- ---------------------------------------------------------
-- BUSINESS INTEGRITY
-- Aplikasi memperlakukan relasi owner -> store sebagai 1:1.
-- ---------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_stores_owner_id
  ON stores(owner_id);

-- ---------------------------------------------------------
-- PUBLIC CATALOG QUERY SUPPORT
-- ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_stores_active_verification_name
  ON stores(is_active, verification_status, name, id);

CREATE INDEX IF NOT EXISTS idx_products_active_created_id
  ON products(is_active, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_products_store_active
  ON products(store_id, is_active);

CREATE INDEX IF NOT EXISTS idx_product_images_product_sort_created
  ON product_images(product_id, sort_order ASC, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_product_comments_product_active
  ON product_comments(product_id, is_active);

-- ---------------------------------------------------------
-- RECORD SUCCESS
-- ---------------------------------------------------------
INSERT INTO schema_migrations(version, description)
VALUES (
  '2026-09-02-p1-security-performance',
  'Enforce one store per owner and add public catalog performance indexes.'
)
ON CONFLICT (version)
DO UPDATE SET description = EXCLUDED.description;
