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

CREATE TABLE IF NOT EXISTS checkout_commerce_preferences (
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  fulfillment_method VARCHAR(32) NOT NULL CHECK (fulfillment_method IN ('pickup','seller_delivery','local_courier')),
  payment_method VARCHAR(32) NOT NULL CHECK (payment_method IN ('cod','pay_at_store','bank_transfer','merchant_qris')),
  delivery_district VARCHAR(100),
  delivery_city VARCHAR(100) DEFAULT 'Lubuklinggau',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (buyer_id, store_id)
);

CREATE INDEX IF NOT EXISTS checkout_commerce_preferences_updated_idx
  ON checkout_commerce_preferences(updated_at DESC);

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

CREATE OR REPLACE FUNCTION p8_apply_checkout_commerce_snapshot()
RETURNS TRIGGER AS $$
DECLARE
  pref checkout_commerce_preferences%ROWTYPE;
  settings store_commerce_settings%ROWTYPE;
  chosen_fulfillment VARCHAR(32);
  chosen_payment VARCHAR(32);
  fee NUMERIC(14,2) := 0;
  min_minutes INTEGER := 60;
BEGIN
  SELECT * INTO pref
  FROM checkout_commerce_preferences
  WHERE buyer_id = NEW.buyer_id
    AND store_id = NEW.store_id
    AND updated_at > NOW() - INTERVAL '60 minutes'
  LIMIT 1;

  SELECT * INTO settings
  FROM store_commerce_settings
  WHERE store_id = NEW.store_id
  LIMIT 1;

  IF pref.fulfillment_method IS NOT NULL THEN
    chosen_fulfillment := pref.fulfillment_method;
  ELSIF settings.seller_delivery_enabled IS DISTINCT FROM FALSE THEN
    chosen_fulfillment := 'seller_delivery';
  ELSIF settings.pickup_enabled IS TRUE THEN
    chosen_fulfillment := 'pickup';
  ELSE
    chosen_fulfillment := 'local_courier';
  END IF;

  IF chosen_fulfillment = 'pickup' AND settings.pickup_enabled IS FALSE THEN
    chosen_fulfillment := CASE WHEN settings.seller_delivery_enabled IS DISTINCT FROM FALSE THEN 'seller_delivery' ELSE 'local_courier' END;
  ELSIF chosen_fulfillment = 'seller_delivery' AND settings.seller_delivery_enabled IS FALSE THEN
    chosen_fulfillment := CASE WHEN settings.pickup_enabled IS TRUE THEN 'pickup' ELSE 'local_courier' END;
  ELSIF chosen_fulfillment = 'local_courier' AND settings.local_courier_enabled IS DISTINCT FROM TRUE THEN
    chosen_fulfillment := CASE WHEN settings.seller_delivery_enabled IS DISTINCT FROM FALSE THEN 'seller_delivery' ELSE 'pickup' END;
  END IF;

  IF pref.payment_method IS NOT NULL THEN
    chosen_payment := pref.payment_method;
  ELSIF chosen_fulfillment <> 'pickup' AND settings.cod_enabled IS DISTINCT FROM FALSE THEN
    chosen_payment := 'cod';
  ELSIF chosen_fulfillment = 'pickup' AND settings.pay_at_store_enabled IS DISTINCT FROM FALSE THEN
    chosen_payment := 'pay_at_store';
  ELSIF settings.bank_transfer_enabled IS TRUE THEN
    chosen_payment := 'bank_transfer';
  ELSE
    chosen_payment := 'merchant_qris';
  END IF;

  IF chosen_payment = 'cod' AND (chosen_fulfillment = 'pickup' OR settings.cod_enabled IS FALSE) THEN
    chosen_payment := CASE WHEN settings.pay_at_store_enabled IS TRUE AND chosen_fulfillment = 'pickup' THEN 'pay_at_store' WHEN settings.bank_transfer_enabled IS TRUE THEN 'bank_transfer' WHEN settings.merchant_qris_enabled IS TRUE THEN 'merchant_qris' ELSE 'cod' END;
  ELSIF chosen_payment = 'pay_at_store' AND (chosen_fulfillment <> 'pickup' OR settings.pay_at_store_enabled IS FALSE) THEN
    chosen_payment := CASE WHEN settings.cod_enabled IS DISTINCT FROM FALSE AND chosen_fulfillment <> 'pickup' THEN 'cod' WHEN settings.bank_transfer_enabled IS TRUE THEN 'bank_transfer' ELSE 'merchant_qris' END;
  ELSIF chosen_payment = 'bank_transfer' AND settings.bank_transfer_enabled IS DISTINCT FROM TRUE THEN
    chosen_payment := CASE WHEN settings.cod_enabled IS DISTINCT FROM FALSE AND chosen_fulfillment <> 'pickup' THEN 'cod' WHEN settings.pay_at_store_enabled IS DISTINCT FROM FALSE AND chosen_fulfillment = 'pickup' THEN 'pay_at_store' ELSE 'merchant_qris' END;
  ELSIF chosen_payment = 'merchant_qris' AND settings.merchant_qris_enabled IS DISTINCT FROM TRUE THEN
    chosen_payment := CASE WHEN settings.cod_enabled IS DISTINCT FROM FALSE AND chosen_fulfillment <> 'pickup' THEN 'cod' WHEN settings.pay_at_store_enabled IS DISTINCT FROM FALSE AND chosen_fulfillment = 'pickup' THEN 'pay_at_store' ELSE 'bank_transfer' END;
  END IF;

  IF chosen_fulfillment <> 'pickup' THEN
    fee := COALESCE(settings.flat_delivery_fee, 0);
    IF settings.free_delivery_threshold IS NOT NULL AND NEW.subtotal >= settings.free_delivery_threshold THEN
      fee := 0;
    END IF;
  END IF;

  min_minutes := COALESCE(settings.estimated_min_minutes, 60);
  NEW.fulfillment_method := chosen_fulfillment;
  NEW.fulfillment_status := 'awaiting_confirmation';
  NEW.payment_method := chosen_payment;
  NEW.delivery_fee := fee;
  NEW.total := NEW.subtotal + fee;
  NEW.delivery_district := pref.delivery_district;
  NEW.delivery_city := COALESCE(NULLIF(pref.delivery_city,''), 'Lubuklinggau');
  NEW.estimated_fulfillment_at := NOW() + make_interval(mins => min_minutes);
  NEW.payment_instructions := CASE
    WHEN chosen_payment = 'bank_transfer' THEN settings.bank_transfer_instructions
    WHEN chosen_payment = 'merchant_qris' THEN settings.qris_instructions
    WHEN chosen_payment = 'pay_at_store' THEN settings.pickup_instructions
    ELSE NULL
  END;

  DELETE FROM checkout_commerce_preferences
  WHERE buyer_id = NEW.buyer_id AND store_id = NEW.store_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS p8_orders_checkout_snapshot ON orders;
CREATE TRIGGER p8_orders_checkout_snapshot
BEFORE INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION p8_apply_checkout_commerce_snapshot();

CREATE OR REPLACE FUNCTION p8_order_timeline_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO order_timeline_events(order_id,event_kind,to_state,note)
    VALUES (NEW.id,'order_created',NEW.status,'Pesanan dibuat.');
    INSERT INTO order_timeline_events(order_id,event_kind,to_state,note)
    VALUES (NEW.id,'payment',NEW.payment_method,'Metode pembayaran dipilih.');
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO order_timeline_events(order_id,event_kind,from_state,to_state,note)
    VALUES (NEW.id,'order_status',OLD.status,NEW.status,'Status pesanan diperbarui.');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS p8_orders_timeline ON orders;
CREATE TRIGGER p8_orders_timeline
AFTER INSERT OR UPDATE OF status ON orders
FOR EACH ROW EXECUTE FUNCTION p8_order_timeline_trigger();

INSERT INTO schema_migrations(version, description)
VALUES (
  '2026-09-07-p8-real-commerce-fulfillment',
  'P8 commerce fulfillment: seller fulfillment/payment settings, checkout preferences, order snapshots, and auditable order timeline.'
)
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description;