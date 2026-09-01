-- =========================================================
-- PASAR UMKM - PROFILE MEDIA
-- Foto profil dipisahkan dari tabel users agar data akun
-- dan binary media tidak bercampur dalam satu record.
-- =========================================================

CREATE TABLE IF NOT EXISTS user_profile_media (
  user_id UUID PRIMARY KEY
    REFERENCES users(id)
    ON DELETE CASCADE,

  image_data BYTEA NOT NULL,

  mime_type VARCHAR(30) NOT NULL,

  byte_size INTEGER NOT NULL,

  updated_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  CONSTRAINT user_profile_media_mime_check
    CHECK (
      mime_type IN (
        'image/jpeg',
        'image/png',
        'image/webp'
      )
    ),

  CONSTRAINT user_profile_media_size_check
    CHECK (
      byte_size > 0
      AND byte_size <= 524288
    )
);
