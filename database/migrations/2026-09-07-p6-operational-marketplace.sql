-- =========================================================
-- PASAR UMKM - P6 OPERATIONAL MARKETPLACE HARDENING
-- 2026-09-07
-- Additive-only migration: reports, disputes, verification cases, case events.
-- No production rows are deleted or rewritten.
-- =========================================================

CREATE TABLE IF NOT EXISTS moderation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_type VARCHAR(24) NOT NULL CHECK (subject_type IN ('user','store','product','post','order')),
  subject_id UUID NOT NULL,
  category VARCHAR(40) NOT NULL CHECK (category IN ('spam','fraud','prohibited_item','harassment','misleading','order_issue','other')),
  details TEXT NOT NULL CHECK (char_length(details) BETWEEN 20 AND 1000),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  priority VARCHAR(12) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assigned_admin_id UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS moderation_reports_active_dedupe_idx
  ON moderation_reports(reporter_user_id, subject_type, subject_id, category)
  WHERE status IN ('open','reviewing');
CREATE INDEX IF NOT EXISTS moderation_reports_queue_idx
  ON moderation_reports(status, priority, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS moderation_reports_subject_idx
  ON moderation_reports(subject_type, subject_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  reason_code VARCHAR(40) NOT NULL CHECK (reason_code IN ('item_not_received','item_not_as_described','seller_issue','payment_or_total_issue','other')),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 20 AND 1500),
  status VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open','seller_response','admin_review','resolved','rejected','cancelled')),
  seller_response TEXT,
  resolution_note TEXT,
  resolved_by_admin_id UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_disputes_queue_idx
  ON order_disputes(status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS order_disputes_buyer_idx
  ON order_disputes(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_disputes_store_idx
  ON order_disputes(store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS store_verification_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  submitted_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name VARCHAR(160) NOT NULL,
  owner_name VARCHAR(160) NOT NULL,
  contact_phone VARCHAR(32) NOT NULL,
  business_address TEXT NOT NULL,
  registration_number VARCHAR(120),
  evidence_note TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','withdrawn')),
  reviewed_by_admin_id UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS store_verification_pending_unique_idx
  ON store_verification_submissions(store_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS store_verification_queue_idx
  ON store_verification_submissions(status, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS marketplace_case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_type VARCHAR(24) NOT NULL CHECK (case_type IN ('report','dispute','verification')),
  case_id UUID NOT NULL,
  actor_type VARCHAR(16) NOT NULL CHECK (actor_type IN ('user','seller','admin','system')),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_admin_id UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
  event_type VARCHAR(64) NOT NULL,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS marketplace_case_events_case_idx
  ON marketplace_case_events(case_type, case_id, created_at ASC, id ASC);

INSERT INTO admin_permissions(permission_key, resource, action, description, is_sensitive, is_active)
VALUES
  ('disputes.view', 'disputes', 'view', 'View marketplace order dispute cases.', TRUE, TRUE),
  ('disputes.resolve', 'disputes', 'resolve', 'Resolve marketplace order dispute cases without moving funds.', TRUE, TRUE)
ON CONFLICT (permission_key) DO UPDATE SET
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  is_sensitive = EXCLUDED.is_sensitive,
  is_active = TRUE;

INSERT INTO admin_role_permissions(role_id, permission_id, granted_by_admin_id)
SELECT ar.id, ap.id, NULL
FROM admin_roles ar
JOIN admin_permissions ap ON ap.permission_key = ANY(ARRAY['disputes.view','disputes.resolve']::text[])
WHERE ar.role_key = 'super_admin'
  AND ar.is_active = TRUE
  AND ap.is_active = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO admin_role_permissions(role_id, permission_id, granted_by_admin_id)
SELECT ar.id, ap.id, NULL
FROM admin_roles ar
JOIN admin_permissions ap ON ap.permission_key = ANY(ARRAY['disputes.view','disputes.resolve']::text[])
WHERE ar.role_key IN ('support','operations')
  AND ar.is_active = TRUE
  AND ap.is_active = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO admin_role_permissions(role_id, permission_id, granted_by_admin_id)
SELECT ar.id, ap.id, NULL
FROM admin_roles ar
JOIN admin_permissions ap ON ap.permission_key = 'disputes.view'
WHERE ar.role_key = 'moderator'
  AND ar.is_active = TRUE
  AND ap.is_active = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO schema_migrations(version, description)
VALUES (
  '2026-09-07-p6-operational-marketplace',
  'P6 operational marketplace: user reports, order disputes, store verification submissions, case events, and dispute RBAC.'
)
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description;
