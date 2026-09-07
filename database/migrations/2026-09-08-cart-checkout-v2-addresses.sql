-- =========================================================
-- PASAR UMKM - CART + CHECKOUT V2 ADDRESS BOOK
-- 2026-09-08
-- Additive-only migration. Stores buyer delivery coordinates for routing.
-- =========================================================

CREATE TABLE IF NOT EXISTS user_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(60) NOT NULL DEFAULT 'Rumah',
  recipient_name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  address_text TEXT NOT NULL,
  district VARCHAR(100),
  city VARCHAR(100) NOT NULL DEFAULT 'Lubuklinggau',
  province VARCHAR(100) NOT NULL DEFAULT 'Sumatera Selatan',
  postal_code VARCHAR(20),
  landmark VARCHAR(240),
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  accuracy_m INTEGER,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (char_length(btrim(recipient_name)) BETWEEN 2 AND 120),
  CHECK (char_length(btrim(phone)) BETWEEN 5 AND 30),
  CHECK (char_length(btrim(address_text)) BETWEEN 5 AND 1200),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  CHECK (accuracy_m IS NULL OR accuracy_m BETWEEN 0 AND 100000)
);

CREATE INDEX IF NOT EXISTS user_addresses_user_updated_idx
  ON user_addresses(user_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS user_addresses_one_default_idx
  ON user_addresses(user_id)
  WHERE is_default = TRUE;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_latitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS delivery_longitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS delivery_accuracy_m INTEGER,
  ADD COLUMN IF NOT EXISTS delivery_landmark VARCHAR(240);

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_delivery_latitude_check
    CHECK (delivery_latitude IS NULL OR delivery_latitude BETWEEN -90 AND 90);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_delivery_longitude_check
    CHECK (delivery_longitude IS NULL OR delivery_longitude BETWEEN -180 AND 180);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_delivery_accuracy_check
    CHECK (delivery_accuracy_m IS NULL OR delivery_accuracy_m BETWEEN 0 AND 100000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO schema_migrations(version, description)
VALUES (
  '2026-09-08-cart-checkout-v2-addresses',
  'Cart + Checkout V2: buyer address book, default address, precise delivery coordinates, and seller navigation snapshot.'
)
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description;
