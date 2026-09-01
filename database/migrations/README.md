# Database Migrations

Folder ini berisi perubahan schema database Pasar UMKM yang harus dijalankan setelah `database/schema.sql` ketika menyiapkan database baru atau menyamakan database lama dengan backend terbaru.

## Urutan

1. Jalankan `database/schema.sql`.
2. Jalankan file migration berdasarkan nomor secara berurutan.

Saat ini:

- `001_social_comments_sync.sql`
  - menambahkan tabel `product_comments` jika belum ada;
  - menambahkan `parent_comment_id` untuk reply pada `post_comments` dan `product_comments`;
  - menambahkan foreign key, index, dan trigger `updated_at` yang dibutuhkan Worker saat ini.

- `002_soft_delete_comment_replies.sql`
  - menambahkan trigger untuk soft-delete reply ketika komentar induk dinonaktifkan;
  - mencegah orphan reply yang tetap aktif tetapi tidak punya root comment aktif;
  - menjaga jumlah komentar tetap konsisten dengan komentar yang benar-benar dapat ditampilkan frontend.

Semua migration harus sebisa mungkin idempotent agar aman dijalankan ulang pada environment yang sudah pernah menerima perubahan manual.
