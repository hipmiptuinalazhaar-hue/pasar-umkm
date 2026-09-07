-- =========================================================
-- PASAR UMKM - P8.1 STRUCTURED PAYMENT PROFILE
-- 2026-09-07
-- Additive-only. Platform remains non-custodial.
-- =========================================================

ALTER TABLE store_commerce_settings
  ADD COLUMN IF NOT EXISTS transfer_provider_type VARCHAR(16),
  ADD COLUMN IF NOT EXISTS transfer_provider_name VARCHAR(80),
  ADD COLUMN IF NOT EXISTS transfer_account_number VARCHAR(120),
  ADD COLUMN IF NOT EXISTS transfer_account_name VARCHAR(160),
  ADD COLUMN IF NOT EXISTS qris_merchant_name VARCHAR(160),
  ADD COLUMN IF NOT EXISTS qris_image_url TEXT,
  ADD COLUMN IF NOT EXISTS qris_public_id TEXT;

DO $$ BEGIN
  ALTER TABLE store_commerce_settings ADD CONSTRAINT store_commerce_transfer_provider_type_check
    CHECK (transfer_provider_type IS NULL OR transfer_provider_type IN ('bank','ewallet'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_provider_type VARCHAR(16),
  ADD COLUMN IF NOT EXISTS payment_provider_name VARCHAR(80),
  ADD COLUMN IF NOT EXISTS payment_account_number VARCHAR(120),
  ADD COLUMN IF NOT EXISTS payment_account_name VARCHAR(160),
  ADD COLUMN IF NOT EXISTS payment_qris_merchant_name VARCHAR(160),
  ADD COLUMN IF NOT EXISTS payment_qris_image_url TEXT;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_payment_provider_type_check
    CHECK (payment_provider_type IS NULL OR payment_provider_type IN ('bank','ewallet'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION p81_apply_payment_profile_snapshot()
RETURNS TRIGGER AS $$
DECLARE
  settings store_commerce_settings%ROWTYPE;
BEGIN
  SELECT * INTO settings
  FROM store_commerce_settings
  WHERE store_id = NEW.store_id
  LIMIT 1;

  IF NEW.payment_method = 'bank_transfer' THEN
    NEW.payment_provider_type := settings.transfer_provider_type;
    NEW.payment_provider_name := settings.transfer_provider_name;
    NEW.payment_account_number := settings.transfer_account_number;
    NEW.payment_account_name := settings.transfer_account_name;
    NEW.payment_qris_merchant_name := NULL;
    NEW.payment_qris_image_url := NULL;

    IF settings.transfer_provider_name IS NOT NULL
       AND settings.transfer_account_number IS NOT NULL
       AND settings.transfer_account_name IS NOT NULL THEN
      NEW.payment_instructions := CONCAT_WS(E'\n',
        CONCAT(settings.transfer_provider_name, ' · ', settings.transfer_account_number),
        CONCAT('A/N ', settings.transfer_account_name),
        NULLIF(settings.bank_transfer_instructions, '')
      );
    END IF;
  ELSIF NEW.payment_method = 'merchant_qris' THEN
    NEW.payment_provider_type := NULL;
    NEW.payment_provider_name := NULL;
    NEW.payment_account_number := NULL;
    NEW.payment_account_name := NULL;
    NEW.payment_qris_merchant_name := settings.qris_merchant_name;
    NEW.payment_qris_image_url := settings.qris_image_url;

    IF settings.qris_merchant_name IS NOT NULL THEN
      NEW.payment_instructions := CONCAT_WS(E'\n',
        CONCAT('QRIS Merchant: ', settings.qris_merchant_name),
        NULLIF(settings.qris_instructions, '')
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS zz_p81_orders_payment_profile_snapshot ON orders;
CREATE TRIGGER zz_p81_orders_payment_profile_snapshot
BEFORE INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION p81_apply_payment_profile_snapshot();

INSERT INTO schema_migrations(version, description)
VALUES (
  '2026-09-07-p8-1-structured-payment-profile',
  'P8.1 structured bank/e-wallet destination and merchant QRIS snapshot for direct non-custodial payments.'
)
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description;
