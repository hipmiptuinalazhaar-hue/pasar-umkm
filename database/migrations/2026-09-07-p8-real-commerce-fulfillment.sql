-- =========================================================
-- PASAR UMKM - P8 REAL COMMERCE & FULFILLMENT
-- 2026-09-07
-- Additive-only migration. Platform does not custody funds.
-- =========================================================

CREATE TABLE IF NOT EXISTS store_commerce_settings (
  store_id UUID PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  pickup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  seller_delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  local_courier_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  cod_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  pay_at_store_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  bank_transfer_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  merchant_qris_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  flat_delivery_fee NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (flat_delivery_fee >= 0),
  free_delivery_threshold NUMERIC(14,2) CHECK (free_delivery_threshold IS NULL OR free_delivery_threshold >= 0),
  estimated_min_minutes INTEGER NOT NULL DEFAULT 60 CHECK (estimated_min_minutes BETWEEN 0 AND 10080),
  estimated_max_minutes INTEGER NOT NULL DEFAULT 240 CHECK (estimated_max_minutes BETWEEN 0 AND 20160),
  response_sla_minutes INTEGER NOT NULL DEFAULT 240 CHECK (response_sla_minutes BETWEEN 15 AND 10080),
  pickup_instructions TEXT,
  bank_transfer_instructions TEXT,
  qris_instructions TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (estimated_max_minutes >= estimated_min_minutes),
  CHECK (pickup_enabled OR seller_delivery_enabled OR local_courier_enabled),
  CHECK (cod_enabled OR pay_at_store_enabled OR bank_transfer_enabled OR merchant_qris_enabled)
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fulfillment_method VARCHAR(32) NOT NULL DEFAULT 'seller_delivery',
  ADD COLUMN IF NOT EXISTS fulfillment_status VARCHAR(32) NOT NULL DEFAULT 'awaiting_confirmation',
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(32) NOT NULL DEFAULT 'cod',
  ADD COLUMN IF NOT EXISTS payment_instructions TEXT,
  ADD COLUMN IF NOT EXISTS delivery_district VARCHAR(100),
  ADD COLUMN IF NOT EXISTS delivery_city VARCHAR(100) DEFAULT 'Lubuklinggau',
  ADD COLUMN IF NOT EXISTS estimated_fulfillment_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_fulfillment_method_check
    CHECK (fulfillment_method IN ('pickup','seller_delivery','local_courier'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_fulfillment_status_check
    CHECK (fulfillment_status IN ('awaiting_confirmation','ready_for_pickup','in_transit','picked_up','delivered','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IN ('cod','pay_at_store','bank_transfer','merchant_qris'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS order_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_kind VARCHAR(24) NOT NULL CHECK (event_kind IN ('order_created','order_status','fulfillment','payment','system')),
  from_state VARCHAR(64),
  to_state VARCHAR(64),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_timeline_order_time_idx
  ON order_timeline_events(order_id, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS orders_fulfillment_status_idx
  ON orders(fulfillment_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS orders_payment_method_idx
  ON orders(payment_method, created_at DESC);

INSERT INTO schema_migrations(version, description)
VALUES (
  '2026-09-07-p8-real-commerce-fulfillment',
  'P8 commerce fulfillment: seller fulfillment/payment settings, order fulfillment/payment snapshots, and auditable order timeline.'
)
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description;