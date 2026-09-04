-- =========================================================
-- PASAR UMKM - ADMIN RBAC + PERMISSIONS
-- 2026-09-05
--
-- Phase 4 scope:
-- 1. Seed canonical platform-admin roles.
-- 2. Seed explicit resource.action permissions.
-- 3. Grant every active permission explicitly to super_admin.
-- 4. Grant least-privilege permission sets to operational roles.
-- 5. Keep account assignment, UI, MFA, passkeys, and admin CRUD out of scope.
-- =========================================================

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM schema_migrations
       WHERE version = '2026-09-05-admin-bootstrap-policy'
     ) THEN
    RAISE EXCEPTION 'Admin RBAC migration ditolak: bootstrap policy belum diterapkan.';
  END IF;

  IF to_regclass('public.admin_roles') IS NULL
     OR to_regclass('public.admin_permissions') IS NULL
     OR to_regclass('public.admin_role_permissions') IS NULL
     OR to_regclass('public.admin_account_roles') IS NULL THEN
    RAISE EXCEPTION 'Admin RBAC migration ditolak: admin foundation belum lengkap.';
  END IF;
END $$;

-- Canonical internal roles. These are system-owned policy templates, not public roles.
INSERT INTO admin_roles (role_key, name, description, is_system, is_active)
VALUES
  ('super_admin', 'Super Admin', 'Platform owner role with every active administration permission.', TRUE, TRUE),
  ('moderator', 'Moderator', 'Content and marketplace safety moderation without account or system administration.', TRUE, TRUE),
  ('verifier', 'Verifier', 'UMKM/store verification role with narrowly scoped read access.', TRUE, TRUE),
  ('support', 'Support', 'Customer support role for user, store, product, order, report, and review assistance.', TRUE, TRUE),
  ('operations', 'Operations', 'Marketplace operations role for lifecycle intervention without admin-account or system control.', TRUE, TRUE)
ON CONFLICT (role_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_system = TRUE,
  is_active = TRUE;

-- Permission catalogue. `is_sensitive` is a policy signal for future step-up auth.
INSERT INTO admin_permissions (
  permission_key,
  resource,
  action,
  description,
  is_sensitive,
  is_active
)
VALUES
  ('dashboard.view', 'dashboard', 'view', 'View internal administration overview data.', FALSE, TRUE),
  ('users.view', 'users', 'view', 'View user accounts and moderation context.', FALSE, TRUE),
  ('users.suspend', 'users', 'suspend', 'Suspend a marketplace user account.', TRUE, TRUE),
  ('users.reactivate', 'users', 'reactivate', 'Reactivate a suspended marketplace user account.', TRUE, TRUE),
  ('stores.view', 'stores', 'view', 'View merchant stores and verification context.', FALSE, TRUE),
  ('stores.verify', 'stores', 'verify', 'Verify an eligible merchant store.', TRUE, TRUE),
  ('stores.suspend', 'stores', 'suspend', 'Suspend a merchant store.', TRUE, TRUE),
  ('stores.reactivate', 'stores', 'reactivate', 'Reactivate a suspended merchant store.', TRUE, TRUE),
  ('products.view', 'products', 'view', 'View products and moderation context.', FALSE, TRUE),
  ('products.moderate', 'products', 'moderate', 'Apply non-destructive product moderation actions.', FALSE, TRUE),
  ('products.suspend', 'products', 'suspend', 'Suspend a marketplace product.', TRUE, TRUE),
  ('products.restore', 'products', 'restore', 'Restore a suspended marketplace product.', TRUE, TRUE),
  ('posts.view', 'posts', 'view', 'View social-commerce posts and moderation context.', FALSE, TRUE),
  ('posts.moderate', 'posts', 'moderate', 'Apply non-destructive post moderation actions.', FALSE, TRUE),
  ('posts.suspend', 'posts', 'suspend', 'Suspend a social-commerce post.', TRUE, TRUE),
  ('posts.restore', 'posts', 'restore', 'Restore a suspended social-commerce post.', TRUE, TRUE),
  ('orders.view', 'orders', 'view', 'View order support context.', TRUE, TRUE),
  ('orders.support', 'orders', 'support', 'Perform non-financial order support actions.', TRUE, TRUE),
  ('reports.view', 'reports', 'view', 'View user, store, product, and content reports.', FALSE, TRUE),
  ('reports.resolve', 'reports', 'resolve', 'Resolve a moderation or support report.', TRUE, TRUE),
  ('reviews.view', 'reviews', 'view', 'View rating and review moderation context.', FALSE, TRUE),
  ('reviews.moderate', 'reviews', 'moderate', 'Moderate ratings and reviews.', TRUE, TRUE),
  ('admin_accounts.view', 'admin_accounts', 'view', 'View internal administrator identities and role assignments.', TRUE, TRUE),
  ('admin_accounts.create', 'admin_accounts', 'create', 'Create a new internal administrator identity.', TRUE, TRUE),
  ('admin_accounts.suspend', 'admin_accounts', 'suspend', 'Suspend an internal administrator identity.', TRUE, TRUE),
  ('admin_accounts.assign_role', 'admin_accounts', 'assign_role', 'Assign or revoke administrator roles.', TRUE, TRUE),
  ('roles.view', 'roles', 'view', 'View roles and permission mappings.', TRUE, TRUE),
  ('roles.manage', 'roles', 'manage', 'Change role and permission policy.', TRUE, TRUE),
  ('audit_logs.view', 'audit_logs', 'view', 'View privileged administration audit history.', TRUE, TRUE),
  ('system.view', 'system', 'view', 'View internal system health and configuration.', TRUE, TRUE),
  ('system.manage', 'system', 'manage', 'Change privileged platform configuration.', TRUE, TRUE)
ON CONFLICT (permission_key) DO UPDATE SET
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  is_sensitive = EXCLUDED.is_sensitive,
  is_active = TRUE;

-- Canonical role mappings are deterministic. We reset grants only for system-owned
-- role templates, never for custom roles that may be introduced later.
DELETE FROM admin_role_permissions arp
USING admin_roles ar
WHERE arp.role_id = ar.id
  AND ar.role_key IN ('super_admin', 'moderator', 'verifier', 'support', 'operations');

-- Super Admin has no magic bypass in application code. It receives all active
-- permissions explicitly so permission removal takes effect immediately.
INSERT INTO admin_role_permissions (role_id, permission_id, granted_by_admin_id)
SELECT ar.id, ap.id, NULL
FROM admin_roles ar
CROSS JOIN admin_permissions ap
WHERE ar.role_key = 'super_admin'
  AND ar.is_active = TRUE
  AND ap.is_active = TRUE;

-- Moderator: content and marketplace safety only.
INSERT INTO admin_role_permissions (role_id, permission_id, granted_by_admin_id)
SELECT ar.id, ap.id, NULL
FROM admin_roles ar
JOIN admin_permissions ap ON ap.permission_key = ANY(ARRAY[
  'dashboard.view','users.view','stores.view',
  'products.view','products.moderate','products.suspend','products.restore',
  'posts.view','posts.moderate','posts.suspend','posts.restore',
  'reports.view','reports.resolve','reviews.view','reviews.moderate'
]::text[])
WHERE ar.role_key = 'moderator' AND ar.is_active = TRUE AND ap.is_active = TRUE;

-- Verifier: verification workflow, no moderation or account powers.
INSERT INTO admin_role_permissions (role_id, permission_id, granted_by_admin_id)
SELECT ar.id, ap.id, NULL
FROM admin_roles ar
JOIN admin_permissions ap ON ap.permission_key = ANY(ARRAY[
  'dashboard.view','users.view','stores.view','stores.verify','reports.view'
]::text[])
WHERE ar.role_key = 'verifier' AND ar.is_active = TRUE AND ap.is_active = TRUE;

-- Support: read/support workflow, no suspension, role management, or system control.
INSERT INTO admin_role_permissions (role_id, permission_id, granted_by_admin_id)
SELECT ar.id, ap.id, NULL
FROM admin_roles ar
JOIN admin_permissions ap ON ap.permission_key = ANY(ARRAY[
  'dashboard.view','users.view','stores.view','products.view',
  'orders.view','orders.support','reports.view','reviews.view'
]::text[])
WHERE ar.role_key = 'support' AND ar.is_active = TRUE AND ap.is_active = TRUE;

-- Operations: marketplace lifecycle interventions, no internal-admin powers.
INSERT INTO admin_role_permissions (role_id, permission_id, granted_by_admin_id)
SELECT ar.id, ap.id, NULL
FROM admin_roles ar
JOIN admin_permissions ap ON ap.permission_key = ANY(ARRAY[
  'dashboard.view','users.view','stores.view','stores.suspend','stores.reactivate',
  'products.view','products.suspend','products.restore','posts.view',
  'orders.view','orders.support','reports.view','reports.resolve'
]::text[])
WHERE ar.role_key = 'operations' AND ar.is_active = TRUE AND ap.is_active = TRUE;

INSERT INTO schema_migrations(version, description)
VALUES (
  '2026-09-05-admin-rbac-permissions',
  'Seed canonical platform-admin roles and explicit least-privilege permission mappings with no Super Admin bypass.'
)
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description;
