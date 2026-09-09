BEGIN;

DO $$
BEGIN
  IF to_regclass('public.reels') IS NULL
     OR to_regclass('public.products') IS NULL
     OR to_regclass('public.user_follows') IS NULL
     OR to_regclass('public.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'Reels Commerce V4 requires the production marketplace schema';
  END IF;
END $$;

ALTER TABLE reels
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS duration_seconds numeric(10,3),
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer,
  ADD COLUMN IF NOT EXISTS bytes bigint,
  ADD COLUMN IF NOT EXISTS location_text varchar(180),
  ADD COLUMN IF NOT EXISTS trim_start_seconds numeric(10,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trim_end_seconds numeric(10,3),
  ADD COLUMN IF NOT EXISTS crop_mode varchar(16) NOT NULL DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS audio_mode varchar(16) NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS original_audio_label varchar(180) NOT NULL DEFAULT 'Original audio',
  ADD COLUMN IF NOT EXISTS remix_of_reel_id uuid REFERENCES reels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_of_reel_id uuid REFERENCES reels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allow_comments boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS visibility varchar(16) NOT NULL DEFAULT 'public';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reels_crop_mode_check') THEN
    ALTER TABLE reels ADD CONSTRAINT reels_crop_mode_check CHECK (crop_mode IN ('cover','contain'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reels_audio_mode_check') THEN
    ALTER TABLE reels ADD CONSTRAINT reels_audio_mode_check CHECK (audio_mode IN ('original','muted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reels_visibility_check') THEN
    ALTER TABLE reels ADD CONSTRAINT reels_visibility_check CHECK (visibility IN ('public','followers','private'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reels_duration_check') THEN
    ALTER TABLE reels ADD CONSTRAINT reels_duration_check CHECK (duration_seconds IS NULL OR (duration_seconds > 0 AND duration_seconds <= 180));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reels_trim_check') THEN
    ALTER TABLE reels ADD CONSTRAINT reels_trim_check CHECK (
      trim_start_seconds >= 0 AND
      (trim_end_seconds IS NULL OR trim_end_seconds > trim_start_seconds) AND
      (duration_seconds IS NULL OR trim_start_seconds < duration_seconds) AND
      (duration_seconds IS NULL OR trim_end_seconds IS NULL OR trim_end_seconds <= duration_seconds)
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS reel_saves (
  reel_id uuid NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reel_id, user_id)
);

CREATE TABLE IF NOT EXISTS reel_reposts (
  reel_id uuid NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reel_id, user_id)
);

CREATE TABLE IF NOT EXISTS reel_viewer_preferences (
  reel_id uuid NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preference varchar(24) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reel_id, user_id),
  CONSTRAINT reel_viewer_preference_check CHECK (preference IN ('not_interested','hidden'))
);

CREATE TABLE IF NOT EXISTS reel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id uuid NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  anonymous_key_hash text,
  event_type varchar(32) NOT NULL,
  watch_ms integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reel_event_type_check CHECK (event_type IN (
    'impression','play','view','watch','complete','replay','pause','share','save',
    'repost','profile_click','store_click','product_click','chat_click','add_to_cart','order'
  )),
  CONSTRAINT reel_event_watch_check CHECK (watch_ms >= 0 AND watch_ms <= 3600000)
);

CREATE TABLE IF NOT EXISTS reel_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id uuid NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category varchar(32) NOT NULL,
  details text,
  status varchar(24) NOT NULL DEFAULT 'open',
  resolution_note text,
  resolved_by_admin_id uuid REFERENCES admin_accounts(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reel_report_category_check CHECK (category IN ('spam','fraud','prohibited_item','harassment','sexual_content','violence','misleading','copyright','other')),
  CONSTRAINT reel_report_status_check CHECK (status IN ('open','reviewing','resolved','dismissed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reel_reports_open
  ON reel_reports(reel_id, reporter_user_id, category)
  WHERE status IN ('open','reviewing');

CREATE TABLE IF NOT EXISTS reel_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  video_url text,
  cloudinary_public_id text,
  cover_url text,
  caption text,
  location_text varchar(180),
  trim_start_seconds numeric(10,3) NOT NULL DEFAULT 0,
  trim_end_seconds numeric(10,3),
  crop_mode varchar(16) NOT NULL DEFAULT 'cover',
  audio_mode varchar(16) NOT NULL DEFAULT 'original',
  remix_of_reel_id uuid REFERENCES reels(id) ON DELETE SET NULL,
  template_of_reel_id uuid REFERENCES reels(id) ON DELETE SET NULL,
  duration_seconds numeric(10,3),
  width integer,
  height integer,
  bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reels_public_created ON reels(created_at DESC, id DESC) WHERE is_active=TRUE AND visibility='public';
CREATE INDEX IF NOT EXISTS idx_reels_product ON reels(product_id, created_at DESC) WHERE is_active=TRUE;
CREATE INDEX IF NOT EXISTS idx_reel_saves_user_created ON reel_saves(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reel_reposts_user_created ON reel_reposts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reel_events_reel_created ON reel_events(reel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reel_events_user_created ON reel_events(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reel_reports_status_created ON reel_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reel_drafts_user_updated ON reel_drafts(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reel_comments_reel_created_desc ON reel_comments(reel_id, created_at DESC, id DESC) WHERE is_active=TRUE;

INSERT INTO schema_migrations(version, description)
VALUES ('2026-09-09-reels-commerce-v4', 'Reels Commerce V4: discovery, creator, commerce, safety, analytics')
ON CONFLICT (version) DO NOTHING;

COMMIT;
