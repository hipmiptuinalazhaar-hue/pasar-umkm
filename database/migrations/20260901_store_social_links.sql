-- PASAR UMKM
-- Store social links
-- Idempotent migration; runtime API also guards with CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS store_social_links (
  store_id UUID PRIMARY KEY
    REFERENCES stores(id)
    ON DELETE CASCADE,
  instagram_url TEXT,
  tiktok_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
