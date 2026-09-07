-- =========================================================
-- PASAR UMKM - P7 LAUNCH, GROWTH & MONETIZATION READINESS
-- 2026-09-07
-- Additive-only migration. No payment, wallet, escrow, or fund movement.
-- =========================================================

CREATE TABLE IF NOT EXISTS growth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_key_hash TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_name VARCHAR(48) NOT NULL CHECK (event_name IN (
    'page_view','register_completed','seller_onboarding_view','store_created',
    'store_view','product_view','search','add_to_cart','checkout_started',
    'order_completed','verification_submitted','report_submitted','dispute_opened',
    'share_opened','promotion_opened'
  )),
  resource_type VARCHAR(32) CHECK (resource_type IS NULL OR resource_type IN (
    'product','store','order','search','seller_onboarding','promotion','platform'
  )),
  resource_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS growth_events_event_time_idx
  ON growth_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS growth_events_user_time_idx
  ON growth_events(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS growth_events_resource_time_idx
  ON growth_events(resource_type, resource_id, created_at DESC)
  WHERE resource_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS marketplace_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement VARCHAR(32) NOT NULL CHECK (placement IN (
    'home_featured','search_boost','store_featured','sponsor_banner'
  )),
  subject_type VARCHAR(16) NOT NULL CHECK (subject_type IN ('product','store','post','external')),
  subject_id UUID,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  headline VARCHAR(180),
  sponsor_label VARCHAR(120),
  destination_url TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','active','paused','ended')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by_admin_id UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CHECK (subject_type = 'external' OR subject_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS marketplace_promotions_active_idx
  ON marketplace_promotions(placement, status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS marketplace_promotions_subject_idx
  ON marketplace_promotions(subject_type, subject_id, status);

INSERT INTO admin_permissions(permission_key, resource, action, description, is_sensitive, is_active)
VALUES
  ('growth.view', 'growth', 'view', 'View marketplace acquisition and conversion funnel metrics.', FALSE, TRUE),
  ('promotions.view', 'promotions', 'view', 'View marketplace promotion placements.', FALSE, TRUE),
  ('promotions.manage', 'promotions', 'manage', 'Create and change marketplace promotion placements without billing or fund movement.', TRUE, TRUE)
ON CONFLICT (permission_key) DO UPDATE SET
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  is_sensitive = EXCLUDED.is_sensitive,
  is_active = TRUE;

INSERT INTO admin_role_permissions(role_id, permission_id, granted_by_admin_id)
SELECT ar.id, ap.id, NULL
FROM admin_roles ar
JOIN admin_permissions ap ON ap.permission_key = ANY(ARRAY['growth.view','promotions.view','promotions.manage']::text[])
WHERE ar.role_key = 'super_admin' AND ar.is_active = TRUE AND ap.is_active = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO admin_role_permissions(role_id, permission_id, granted_by_admin_id)
SELECT ar.id, ap.id, NULL
FROM admin_roles ar
JOIN admin_permissions ap ON ap.permission_key = ANY(ARRAY['growth.view','promotions.view','promotions.manage']::text[])
WHERE ar.role_key = 'operations' AND ar.is_active = TRUE AND ap.is_active = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO admin_role_permissions(role_id, permission_id, granted_by_admin_id)
SELECT ar.id, ap.id, NULL
FROM admin_roles ar
JOIN admin_permissions ap ON ap.permission_key = ANY(ARRAY['growth.view','promotions.view']::text[])
WHERE ar.role_key IN ('support','moderator') AND ar.is_active = TRUE AND ap.is_active = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO schema_migrations(version, description)
VALUES (
  '2026-09-07-p7-launch-growth',
  'P7 launch/growth: privacy-minimized growth events, promotion placement registry, and growth/promotions RBAC.'
)
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description;