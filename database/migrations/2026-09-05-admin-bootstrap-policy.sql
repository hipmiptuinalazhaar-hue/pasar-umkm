-- =========================================================
-- PASAR UMKM - SUPER ADMIN BOOTSTRAP POLICY
-- 2026-09-05
--
-- Phase 2 scope only:
-- 1. Seed the canonical system role key `super_admin`.
-- 2. Require bootstrap credentials to be rotated before normal use.
-- 3. Keep account-specific credentials out of source-controlled migrations.
-- 4. Do not create permissions, login routes, sessions, or UI yet.
-- =========================================================

DO $$
DECLARE
  foundation_ready BOOLEAN := FALSE;
BEGIN
  IF to_regclass('public.schema_migrations') IS NULL THEN
    RAISE EXCEPTION
      'Admin bootstrap migration ditolak: schema_migrations belum tersedia.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM schema_migrations
    WHERE version = '2026-09-05-admin-foundation'
  ) INTO foundation_ready;

  IF NOT foundation_ready THEN
    RAISE EXCEPTION
      'Admin bootstrap migration ditolak: admin foundation belum diterapkan.';
  END IF;

  IF to_regclass('public.admin_accounts') IS NULL
     OR to_regclass('public.admin_roles') IS NULL
     OR to_regclass('public.admin_account_roles') IS NULL
     OR to_regclass('public.admin_audit_logs') IS NULL THEN
    RAISE EXCEPTION
      'Admin bootstrap migration ditolak: admin foundation schema belum lengkap.';
  END IF;
END $$;

-- ---------------------------------------------------------
-- CREDENTIAL ROTATION CONTRACT
-- A bootstrap credential is temporary by definition. The authentication phase
-- must refuse normal privileged operation while must_rotate_password = TRUE.
-- ---------------------------------------------------------
ALTER TABLE admin_accounts
  ADD COLUMN IF NOT EXISTS must_rotate_password BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE admin_accounts
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- Existing foundation contains no accounts at Phase 2 entry. This UPDATE makes
-- the migration safe if a controlled pre-production account was created early.
UPDATE admin_accounts
SET must_rotate_password = TRUE
WHERE password_changed_at IS NULL;

-- ---------------------------------------------------------
-- CANONICAL SYSTEM ROLE
-- No permissions are attached here. The dedicated RBAC phase owns permission
-- catalogue and role-permission grants.
-- ---------------------------------------------------------
INSERT INTO admin_roles (
  role_key,
  name,
  description,
  is_system,
  is_active
)
VALUES (
  'super_admin',
  'Super Admin',
  'Highest privileged administration role. Intended for tightly controlled platform ownership and emergency administration.',
  TRUE,
  TRUE
)
ON CONFLICT (role_key)
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_system = TRUE,
  is_active = TRUE;

-- ---------------------------------------------------------
-- RECORD SUCCESS
-- ---------------------------------------------------------
INSERT INTO schema_migrations(version, description)
VALUES (
  '2026-09-05-admin-bootstrap-policy',
  'Seed the canonical Super Admin system role and require bootstrap credential rotation without storing account credentials in source control.'
)
ON CONFLICT (version)
DO UPDATE SET description = EXCLUDED.description;
