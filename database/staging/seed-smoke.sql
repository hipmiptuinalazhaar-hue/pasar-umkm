\set ON_ERROR_STOP on

-- PASAR UMKM P2 STAGING-ONLY SYNTHETIC SEED
-- Credentials are injected with psql variables. Never commit real passwords.
DO $$
BEGIN
  IF current_database() <> 'pasar_umkm_staging' THEN
    RAISE EXCEPTION 'P2 staging seed refused: current database is not pasar_umkm_staging';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS staging_environment (
  marker text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO staging_environment(marker)
VALUES ('p2-e2e-isolated')
ON CONFLICT (marker) DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO categories (id, name, slug, icon, sort_order, is_home, is_active)
VALUES (
  '00000000-0000-4000-8000-000000000601'::uuid,
  'P2 Synthetic',
  'p2-synthetic',
  'test-tube',
  999,
  FALSE,
  TRUE
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = TRUE;

INSERT INTO users (id, name, email, phone, password_hash, role, is_active, email_verified)
VALUES
  (
    '00000000-0000-4000-8000-000000000201'::uuid,
    'P2 Smoke Buyer',
    lower(trim(:'smoke_buyer_email')),
    '081200000201',
    crypt(:'smoke_buyer_password', gen_salt('bf', 12)),
    'buyer', TRUE, TRUE
  ),
  (
    '00000000-0000-4000-8000-000000000202'::uuid,
    'P2 Smoke Seller',
    lower(trim(:'smoke_seller_email')),
    '081200000202',
    crypt(:'smoke_seller_password', gen_salt('bf', 12)),
    'seller', TRUE, TRUE
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  is_active = TRUE,
  email_verified = TRUE,
  updated_at = NOW();

INSERT INTO stores (
  id, owner_id, category_id, name, slug, description,
  phone, whatsapp, address, district, city, province,
  verification_status, verified_at, is_active
)
VALUES (
  '00000000-0000-4000-8000-000000000301'::uuid,
  '00000000-0000-4000-8000-000000000202'::uuid,
  '00000000-0000-4000-8000-000000000601'::uuid,
  'P2 Synthetic Store',
  'p2-synthetic-store',
  'Synthetic staging-only merchant for authenticated release testing.',
  '081200000202',
  '081200000202',
  'Alamat staging sintetis',
  'Staging',
  'Lubuklinggau',
  'Sumatera Selatan',
  'verified',
  NOW(),
  TRUE
)
ON CONFLICT (id) DO UPDATE SET
  owner_id = EXCLUDED.owner_id,
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  verification_status = 'verified',
  verified_at = NOW(),
  is_active = TRUE,
  updated_at = NOW();

INSERT INTO products (
  id, store_id, category_id, name, slug, description,
  price, stock, unit, thumbnail_url, is_active, is_featured
)
VALUES (
  '00000000-0000-4000-8000-000000000401'::uuid,
  '00000000-0000-4000-8000-000000000301'::uuid,
  '00000000-0000-4000-8000-000000000601'::uuid,
  'P2 Synthetic Product',
  'p2-synthetic-product',
  'Synthetic staging-only product. Never publish as real inventory.',
  12500,
  1000,
  'unit',
  NULL,
  TRUE,
  FALSE
)
ON CONFLICT (store_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  stock = GREATEST(products.stock, 1000),
  is_active = TRUE,
  updated_at = NOW();

INSERT INTO carts (id, user_id)
VALUES (
  '00000000-0000-4000-8000-000000000701'::uuid,
  '00000000-0000-4000-8000-000000000201'::uuid
)
ON CONFLICT (user_id) DO NOTHING;

-- Minimal but real isolated-admin RBAC fixture. Production MFA policy is untouched.
INSERT INTO admin_roles (id, role_key, name, description, is_system, is_active)
VALUES (
  '00000000-0000-4000-8000-000000000801'::uuid,
  'super_admin',
  'Super Admin',
  'Synthetic staging super admin role.',
  TRUE,
  TRUE
)
ON CONFLICT (role_key) DO UPDATE SET
  name = EXCLUDED.name,
  is_system = TRUE,
  is_active = TRUE,
  updated_at = NOW();

INSERT INTO admin_permissions (
  id, permission_key, resource, action, description, is_sensitive, is_active
)
VALUES
  (
    '00000000-0000-4000-8000-000000000811'::uuid,
    'dashboard.view', 'dashboard', 'view',
    'Synthetic staging dashboard capability.', FALSE, TRUE
  ),
  (
    '00000000-0000-4000-8000-000000000812'::uuid,
    'system.view', 'system', 'view',
    'Synthetic staging system capability.', TRUE, TRUE
  )
ON CONFLICT (permission_key) DO UPDATE SET
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  is_sensitive = EXCLUDED.is_sensitive,
  is_active = TRUE,
  updated_at = NOW();

INSERT INTO admin_role_permissions (role_id, permission_id, granted_by_admin_id)
SELECT
  '00000000-0000-4000-8000-000000000801'::uuid,
  ap.id,
  NULL
FROM admin_permissions ap
WHERE ap.permission_key IN ('dashboard.view', 'system.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO admin_accounts (
  id, name, email, password_hash, status, mfa_required,
  security_version, failed_login_count, must_rotate_password,
  password_changed_at
)
VALUES (
  '00000000-0000-4000-8000-000000000501'::uuid,
  'P2 Smoke Admin',
  lower(trim(:'smoke_admin_email')),
  crypt(:'smoke_admin_password', gen_salt('bf', 12)),
  'active',
  FALSE,
  1,
  0,
  FALSE,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  status = 'active',
  mfa_required = FALSE,
  mfa_enrolled_at = NULL,
  must_rotate_password = FALSE,
  failed_login_count = 0,
  locked_until = NULL,
  security_version = admin_accounts.security_version + 1,
  password_changed_at = NOW(),
  updated_at = NOW();

INSERT INTO admin_account_roles (admin_account_id, role_id, granted_by_admin_id)
VALUES (
  '00000000-0000-4000-8000-000000000501'::uuid,
  '00000000-0000-4000-8000-000000000801'::uuid,
  NULL
)
ON CONFLICT (admin_account_id, role_id) DO NOTHING;

SELECT
  current_database() AS staging_database,
  (SELECT COUNT(*) FROM users WHERE id IN (
    '00000000-0000-4000-8000-000000000201'::uuid,
    '00000000-0000-4000-8000-000000000202'::uuid
  )) AS smoke_users,
  (SELECT COUNT(*) FROM staging_environment WHERE marker = 'p2-e2e-isolated') AS staging_attestation;
