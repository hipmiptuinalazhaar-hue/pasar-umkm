# Reels Maintenance Mode V1

Tanggal: 2026-10-05

Reels ditutup sementara dari jalur pengguna karena fitur masih dalam penyempurnaan.

## Perilaku publik
- Tombol Reels tetap tampil di bottom navigation.
- Saat ditekan, aplikasi membuka bottom sheet dengan pesan "Fitur ini segera tersedia".
- Navigasi aktif tidak berpindah ke Reels.
- Klik pengguna tidak lagi mem-preload runtime Reels V4.
- `PasarPerformanceV10.openReels()` juga diarahkan ke pesan maintenance.

## Yang tidak dihapus
Kode, API, schema, media, dan admin tooling Reels tetap dipertahankan untuk pengembangan lanjutan. Maintenance mode hanya menutup entry point publik.
