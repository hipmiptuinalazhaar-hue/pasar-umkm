-- =========================================================
-- PASAR UMKM - AUTH SECURITY V2
-- Email verification, password recovery, security audit
-- =========================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- Existing accounts pre-date mandatory email verification. Preserve access
-- for those accounts while requiring verification for every new V2 account.
UPDATE users
SET
  email_verified = TRUE,
  email_verified_at = COALESCE(email_verified_at, created_at, NOW())
WHERE email_verified IS DISTINCT FROM TRUE
   OR email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS user_auth_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose TEXT NOT NULL
    CHECK (purpose IN ('register', 'password_reset')),
  email VARCHAR(255) NOT NULL,
  pending_name VARCHAR(100),
  pending_password_hash TEXT,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
    CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5
    CHECK (max_attempts BETWEEN 1 AND 20),
  resend_count INTEGER NOT NULL DEFAULT 0
    CHECK (resend_count >= 0),
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  reset_token_hash TEXT,
  reset_token_expires_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (email = LOWER(email)),
  CHECK (
    (purpose = 'register' AND pending_name IS NOT NULL AND pending_password_hash IS NOT NULL)
    OR
    (purpose = 'password_reset' AND pending_name IS NULL AND pending_password_hash IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_user_auth_challenges_email_purpose
  ON user_auth_challenges (email, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_auth_challenges_active
  ON user_auth_challenges (purpose, expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS user_auth_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email_hash TEXT,
  event_type VARCHAR(80) NOT NULL,
  outcome VARCHAR(24) NOT NULL
    CHECK (outcome IN ('success', 'failure', 'blocked', 'requested')),
  request_id VARCHAR(160),
  ip_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_auth_audit_events_user_created
  ON user_auth_audit_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_auth_audit_events_type_created
  ON user_auth_audit_events (event_type, created_at DESC);

-- Prevent unbounded accumulation. Operational cleanup can safely remove
-- consumed/expired challenges after the retention window.
CREATE INDEX IF NOT EXISTS idx_user_auth_challenges_cleanup
  ON user_auth_challenges (created_at)
  WHERE consumed_at IS NOT NULL;

INSERT INTO schema_migrations (version)
VALUES ('2026-09-08-auth-security-v2')
ON CONFLICT (version) DO NOTHING;

COMMIT;
