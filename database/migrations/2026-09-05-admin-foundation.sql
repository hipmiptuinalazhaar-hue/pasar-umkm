-- =========================================================
-- PASAR UMKM - ADMINISTRATION IDENTITY FOUNDATION
-- 2026-09-05
--
-- Scope:
-- 1. Separate privileged administration identities from public users.
-- 2. Establish role/permission relations without granting any account access.
-- 3. Establish isolated admin sessions and append-oriented audit records.
-- 4. Do not add admin login routes, UI, MFA secrets, or bootstrap accounts yet.
--
-- This migration is intentionally additive. Existing public auth, marketplace
-- users, stores, orders, chat, and social features remain untouched.
-- =========================================================

-- ---------------------------------------------------------
-- READ-ONLY PREFLIGHT
-- ---------------------------------------------------------
DO $$
DECLARE
  p0_ready BOOLEAN := FALSE;
BEGIN
  IF to_regclass('public.schema_migrations') IS NULL THEN
    RAISE EXCEPTION
      'Admin foundation migration ditolak: schema_migrations belum tersedia. Terapkan P0 terlebih dahulu.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM schema_migrations
    WHERE version = '2026-09-02-p0-runtime-schema-hardening'
  ) INTO p0_ready;

  IF NOT p0_ready THEN
    RAISE EXCEPTION
      'Admin foundation migration ditolak: migration P0 belum tercatat.';
  END IF;

  IF to_regclass('public.users') IS NULL
     OR to_regclass('public.sessions') IS NULL THEN
    RAISE EXCEPTION
      'Admin foundation migration ditolak: public auth schema belum lengkap.';
  END IF;

  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RAISE EXCEPTION
      'Admin foundation migration ditolak: helper set_updated_at() belum tersedia.';
  END IF;
END $$;

-- ---------------------------------------------------------
-- ADMIN ACCOUNTS
-- Privileged identities are deliberately NOT foreign-keyed to public users.
-- A person may own both identities, but the security boundaries stay separate.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending_activation',
  mfa_required BOOLEAN NOT NULL DEFAULT TRUE,
  mfa_enrolled_at TIMESTAMPTZ,
  security_version INTEGER NOT NULL DEFAULT 1,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_by_admin_id UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT admin_accounts_name_length
    CHECK (char_length(trim(name)) BETWEEN 2 AND 100),
  CONSTRAINT admin_accounts_email_length
    CHECK (char_length(trim(email)) BETWEEN 3 AND 255),
  CONSTRAINT admin_accounts_password_hash_present
    CHECK (char_length(password_hash) >= 20),
  CONSTRAINT admin_accounts_status_valid
    CHECK (status IN ('active', 'pending_activation', 'locked', 'suspended', 'disabled')),
  CONSTRAINT admin_accounts_security_version_valid
    CHECK (security_version >= 1),
  CONSTRAINT admin_accounts_failed_login_count_valid
    CHECK (failed_login_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_accounts_email_normalized
  ON admin_accounts (lower(trim(email)));

CREATE INDEX IF NOT EXISTS idx_admin_accounts_status
  ON admin_accounts (status, created_at DESC);

DROP TRIGGER IF EXISTS admin_accounts_updated_at ON admin_accounts;
CREATE TRIGGER admin_accounts_updated_at
BEFORE UPDATE ON admin_accounts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------
-- ADMIN ROLES
-- Stable machine key is separate from human-readable name.
-- No roles are seeded here; bootstrap/RBAC policy belongs to later phases.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT admin_roles_key_format
    CHECK (role_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT admin_roles_name_length
    CHECK (char_length(trim(name)) BETWEEN 2 AND 100)
);

DROP TRIGGER IF EXISTS admin_roles_updated_at ON admin_roles;
CREATE TRIGGER admin_roles_updated_at
BEFORE UPDATE ON admin_roles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------
-- ADMIN PERMISSIONS
-- Permission keys use resource.action semantics such as stores.verify.
-- The catalogue remains empty until the dedicated RBAC phase.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key VARCHAR(96) NOT NULL UNIQUE,
  resource VARCHAR(48) NOT NULL,
  action VARCHAR(48) NOT NULL,
  description TEXT,
  is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT admin_permissions_resource_format
    CHECK (resource ~ '^[a-z][a-z0-9_]{1,47}$'),
  CONSTRAINT admin_permissions_action_format
    CHECK (action ~ '^[a-z][a-z0-9_]{1,47}$'),
  CONSTRAINT admin_permissions_key_matches_parts
    CHECK (permission_key = resource || '.' || action)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_permissions_resource_action
  ON admin_permissions (resource, action);

DROP TRIGGER IF EXISTS admin_permissions_updated_at ON admin_permissions;
CREATE TRIGGER admin_permissions_updated_at
BEFORE UPDATE ON admin_permissions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------
-- ACCOUNT <-> ROLE ASSIGNMENTS
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_account_roles (
  admin_account_id UUID NOT NULL
    REFERENCES admin_accounts(id) ON DELETE CASCADE,
  role_id UUID NOT NULL
    REFERENCES admin_roles(id) ON DELETE CASCADE,
  granted_by_admin_id UUID
    REFERENCES admin_accounts(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (admin_account_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_account_roles_role
  ON admin_account_roles (role_id, admin_account_id);

-- ---------------------------------------------------------
-- ROLE <-> PERMISSION ASSIGNMENTS
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_role_permissions (
  role_id UUID NOT NULL
    REFERENCES admin_roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL
    REFERENCES admin_permissions(id) ON DELETE CASCADE,
  granted_by_admin_id UUID
    REFERENCES admin_accounts(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_role_permissions_permission
  ON admin_role_permissions (permission_id, role_id);

-- ---------------------------------------------------------
-- ADMIN SESSIONS
-- Separate token namespace and table from public marketplace sessions.
-- token_hash expects a lowercase SHA-256 hex digest, never a raw token.
-- security_version is a snapshot used to revoke all sessions after a future
-- credential/privilege security event without scanning or rewriting tokens.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_account_id UUID NOT NULL
    REFERENCES admin_accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  security_version INTEGER NOT NULL,
  mfa_verified_at TIMESTAMPTZ,
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idle_expires_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoke_reason VARCHAR(120),

  CONSTRAINT admin_sessions_token_hash_format
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT admin_sessions_security_version_valid
    CHECK (security_version >= 1),
  CONSTRAINT admin_sessions_ip_hash_format
    CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT admin_sessions_user_agent_hash_format
    CHECK (user_agent_hash IS NULL OR user_agent_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT admin_sessions_expiry_order
    CHECK (
      idle_expires_at > created_at
      AND expires_at > created_at
      AND idle_expires_at <= expires_at
    ),
  CONSTRAINT admin_sessions_revoke_reason_consistent
    CHECK (revoked_at IS NOT NULL OR revoke_reason IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_account_active
  ON admin_sessions (admin_account_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry
  ON admin_sessions (expires_at)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------
-- ADMIN AUDIT LOG
-- Application contract: append-oriented. No admin API may expose update/delete.
-- Actor snapshots preserve accountability if an admin account is later disabled
-- or removed. IP/user-agent are hashes, not raw identifying values.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_account_id UUID
    REFERENCES admin_accounts(id) ON DELETE SET NULL,
  actor_name_snapshot VARCHAR(100),
  actor_email_snapshot VARCHAR(255),
  action VARCHAR(120) NOT NULL,
  resource_type VARCHAR(80) NOT NULL,
  resource_id TEXT,
  outcome VARCHAR(16) NOT NULL,
  reason_code VARCHAR(80),
  request_id VARCHAR(128),
  ip_hash TEXT,
  user_agent_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT admin_audit_logs_action_present
    CHECK (char_length(trim(action)) > 0),
  CONSTRAINT admin_audit_logs_resource_type_present
    CHECK (char_length(trim(resource_type)) > 0),
  CONSTRAINT admin_audit_logs_outcome_valid
    CHECK (outcome IN ('success', 'denied', 'error')),
  CONSTRAINT admin_audit_logs_ip_hash_format
    CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT admin_audit_logs_user_agent_hash_format
    CHECK (user_agent_hash IS NULL OR user_agent_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT admin_audit_logs_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor_created
  ON admin_audit_logs (admin_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action_created
  ON admin_audit_logs (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_resource_created
  ON admin_audit_logs (resource_type, resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_request_id
  ON admin_audit_logs (request_id)
  WHERE request_id IS NOT NULL;

-- ---------------------------------------------------------
-- RECORD SUCCESS
-- ---------------------------------------------------------
INSERT INTO schema_migrations(version, description)
VALUES (
  '2026-09-05-admin-foundation',
  'Create isolated admin identities, RBAC relations, sessions, and audit-log foundation without granting admin access.'
)
ON CONFLICT (version)
DO UPDATE SET description = EXCLUDED.description;
