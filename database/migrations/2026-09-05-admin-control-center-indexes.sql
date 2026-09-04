-- =========================================================
-- PASAR UMKM - ADMIN CONTROL CENTER INDEXES
-- 2026-09-05
--
-- Phase 5 scope:
-- Support keyset pagination and bounded prefix search used by the internal
-- control center. No business data or authorization policy is changed here.
-- =========================================================

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM schema_migrations
       WHERE version = '2026-09-05-admin-rbac-permissions'
     ) THEN
    RAISE EXCEPTION 'Admin Control Center migration ditolak: RBAC belum diterapkan.';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_created_id
  ON users (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_stores_created_id
  ON stores (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_products_created_id
  ON products (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_posts_created_id
  ON posts (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_orders_created_id
  ON orders (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_store_ratings_created_id
  ON store_ratings (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_product_ratings_created_id
  ON product_ratings (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_id
  ON admin_audit_logs (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_admin_accounts_created_id
  ON admin_accounts (created_at DESC, id DESC);

-- Prefix/exact search support for bounded internal lookup fields. These do not
-- introduce unrestricted full-text search or index sensitive profile fields.
CREATE INDEX IF NOT EXISTS idx_users_name_lower_prefix
  ON users (lower(name) text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_users_email_lower
  ON users (lower(email));

CREATE INDEX IF NOT EXISTS idx_stores_name_lower_prefix
  ON stores (lower(name) text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_products_name_lower_prefix
  ON products (lower(name) text_pattern_ops);

INSERT INTO schema_migrations(version, description)
VALUES (
  '2026-09-05-admin-control-center-indexes',
  'Add keyset pagination and bounded prefix-search indexes for Admin Control Center data sources.'
)
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description;
