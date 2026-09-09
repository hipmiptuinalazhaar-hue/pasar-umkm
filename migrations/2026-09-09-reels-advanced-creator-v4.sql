BEGIN;

CREATE TABLE IF NOT EXISTS reel_audio_library (
  track_key varchar(64) PRIMARY KEY,
  label varchar(180) NOT NULL,
  description varchar(280),
  bpm integer,
  synth_profile varchar(32) NOT NULL,
  license_type varchar(48) NOT NULL DEFAULT 'platform-generated',
  attribution varchar(280),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reel_audio_library_bpm_check CHECK (bpm IS NULL OR (bpm BETWEEN 40 AND 220)),
  CONSTRAINT reel_audio_library_profile_check CHECK (synth_profile IN ('pulse','calm','bright'))
);

INSERT INTO reel_audio_library(track_key,label,description,bpm,synth_profile,license_type,attribution,sort_order)
VALUES
  ('pasar-pulse','Pasar Pulse','Beat elektronik ringan buatan platform untuk konten produk dan promo.',108,'pulse','platform-generated','Dibuat secara sintetis oleh Pasar UMKM.',10),
  ('pasar-calm','Pasar Calm','Loop lembut buatan platform untuk proses produksi, kuliner, dan storytelling.',82,'calm','platform-generated','Dibuat secara sintetis oleh Pasar UMKM.',20),
  ('pasar-bright','Pasar Bright','Beat cerah buatan platform untuk showcase produk dan konten singkat.',124,'bright','platform-generated','Dibuat secara sintetis oleh Pasar UMKM.',30)
ON CONFLICT (track_key) DO UPDATE SET
  label=EXCLUDED.label,
  description=EXCLUDED.description,
  bpm=EXCLUDED.bpm,
  synth_profile=EXCLUDED.synth_profile,
  license_type=EXCLUDED.license_type,
  attribution=EXCLUDED.attribution,
  sort_order=EXCLUDED.sort_order,
  is_active=true,
  updated_at=now();

ALTER TABLE reels
  ADD COLUMN IF NOT EXISTS text_overlays jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS audio_track_key varchar(64),
  ADD COLUMN IF NOT EXISTS audio_track_label varchar(180),
  ADD COLUMN IF NOT EXISTS audio_mix numeric(4,3) NOT NULL DEFAULT 1.000;

ALTER TABLE reel_drafts
  ADD COLUMN IF NOT EXISTS text_overlays jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS audio_track_key varchar(64),
  ADD COLUMN IF NOT EXISTS audio_track_label varchar(180),
  ADD COLUMN IF NOT EXISTS audio_mix numeric(4,3) NOT NULL DEFAULT 1.000;

ALTER TABLE reels
  ADD CONSTRAINT reels_text_overlays_array_check CHECK (jsonb_typeof(text_overlays)='array'),
  ADD CONSTRAINT reels_audio_mix_check CHECK (audio_mix BETWEEN 0 AND 1);

ALTER TABLE reel_drafts
  ADD CONSTRAINT reel_drafts_text_overlays_array_check CHECK (jsonb_typeof(text_overlays)='array'),
  ADD CONSTRAINT reel_drafts_audio_mix_check CHECK (audio_mix BETWEEN 0 AND 1);

CREATE INDEX IF NOT EXISTS idx_reels_audio_track ON reels(audio_track_key,created_at DESC) WHERE is_active=TRUE AND audio_track_key IS NOT NULL;

INSERT INTO schema_migrations(version,description)
VALUES ('2026-09-09-reels-advanced-creator-v4','Reels V4 advanced creator: safe audio library, timed text overlays, templates and remix metadata')
ON CONFLICT (version) DO NOTHING;

COMMIT;
