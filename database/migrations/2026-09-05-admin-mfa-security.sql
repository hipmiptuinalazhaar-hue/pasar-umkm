-- =========================================================
-- PASAR UMKM - ADMIN MFA + ADVANCED SECURITY
-- 2026-09-05
--
-- Phase 6 scope:
-- - encrypted TOTP enrollment state
-- - single-use recovery codes
-- - short-lived password->MFA challenges
-- - session step-up timestamps and auth method
-- No MFA secret or recovery plaintext is seeded by this migration.
-- =========================================================

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM schema_migrations
       WHERE version = '2026-09-05-admin-control-center-indexes'
     ) THEN
    RAISE EXCEPTION 'Admin MFA migration ditolak: Admin Control Center foundation belum diterapkan.';
  END IF;

  IF to_regclass('public.admin_accounts') IS NULL
     OR to_regclass('public.admin_sessions') IS NULL
     OR to_regclass('public.admin_audit_logs') IS NULL THEN
    RAISE EXCEPTION 'Admin MFA migration ditolak: admin security foundation belum lengkap.';
  END IF;
END $$;

ALTER TABLE admin_sessions
  ADD COLUMN IF NOT EXISTS step_up_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auth_method VARCHAR(32);

CREATE TABLE IF NOT EXISTS admin_mfa_totp (
  admin_account_id UUID PRIMARY KEY REFERENCES admin_accounts(id) ON DELETE CASCADE,
  secret_ciphertext TEXT NOT NULL,
  secret_iv VARCHAR(64) NOT NULL,
  key_version SMALLINT NOT NULL DEFAULT 1 CHECK (key_version > 0),
  algorithm VARCHAR(16) NOT NULL DEFAULT 'SHA1' CHECK (algorithm = 'SHA1'),
  digits SMALLINT NOT NULL DEFAULT 6 CHECK (digits = 6),
  period_seconds SMALLINT NOT NULL DEFAULT 30 CHECK (period_seconds = 30),
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','disabled')),
  last_used_step BIGINT NOT NULL DEFAULT -1,
  enrolled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_mfa_totp_status
  ON admin_mfa_totp (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS admin_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_account_id UUID NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
  code_hash CHAR(64) NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (admin_account_id, code_hash)
);

CREATE INDEX IF NOT EXISTS idx_admin_recovery_codes_available
  ON admin_recovery_codes (admin_account_id, created_at DESC)
  WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_auth_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_account_id UUID NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  purpose VARCHAR(24) NOT NULL CHECK (purpose IN ('mfa_enroll','mfa_verify')),
  attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts SMALLINT NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  ip_hash CHAR(64) NOT NULL,
  user_agent_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_auth_challenges_account_purpose
  ON admin_auth_challenges (admin_account_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_auth_challenges_expiry
  ON admin_auth_challenges (expires_at)
  WHERE consumed_at IS NULL;

INSERT INTO schema_migrations(version, description)
VALUES (
  '2026-09-05-admin-mfa-security',
  'Add encrypted TOTP, single-use recovery codes, short-lived MFA challenges, and session step-up security state.'
)
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description;
