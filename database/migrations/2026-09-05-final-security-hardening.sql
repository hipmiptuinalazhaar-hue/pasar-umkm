-- =========================================================
-- PASAR UMKM - FINAL SECURITY HARDENING D
-- 2026-09-05
--
-- Security objective:
-- - public users are strictly buyer/seller identities;
-- - privileged administration remains isolated in admin_accounts.
-- =========================================================

-- ---------------------------------------------------------
-- PREFLIGHT
-- Fail closed if legacy public-admin data exists.
-- ---------------------------------------------------------
DO $$
DECLARE
  public_admin_count INTEGER := 0;
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'Security D migration ditolak: public.users tidak tersedia.';
  END IF;

  IF to_regclass('public.admin_accounts') IS NULL THEN
    RAISE EXCEPTION 'Security D migration ditolak: admin_accounts belum tersedia.';
  END IF;

  IF to_regclass('public.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'Security D migration ditolak: schema_migrations belum tersedia.';
  END IF;

  SELECT COUNT(*)::int
  INTO public_admin_count
  FROM users
  WHERE role = 'admin'::user_role;

  IF public_admin_count <> 0 THEN
    RAISE EXCEPTION
      'Security D migration ditolak: ditemukan % public user ber-role admin. Migrasikan identitas privileged ke admin_accounts terlebih dahulu.',
      public_admin_count;
  END IF;
END $$;

-- ---------------------------------------------------------
-- PUBLIC / ADMIN IDENTITY ISOLATION
-- Keep the historical enum value for compatibility, but make it impossible
-- for users.role to persist privileged identities.
-- ---------------------------------------------------------
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS ck_users_public_role_isolation;

ALTER TABLE users
  ADD CONSTRAINT ck_users_public_role_isolation
  CHECK (role IN ('buyer'::user_role, 'seller'::user_role));

-- ---------------------------------------------------------
-- RECORD SUCCESS
-- ---------------------------------------------------------
INSERT INTO schema_migrations(version, description)
VALUES (
  '2026-09-05-final-security-hardening',
  'Enforce buyer/seller-only public identities and isolate privileged admin accounts.'
)
ON CONFLICT (version)
DO UPDATE SET description = EXCLUDED.description;
