# Desktop V10 Cascade Fix

Tanggal: 2026-09-23

## Masalah
Homepage production diproses oleh `src/seo-worker-entry.js`. Worker tersebut menyisipkan kembali `public-experience-v9.css` setelah stylesheet V10 yang sudah ada di `index.html`. Karena V9 memiliki aturan desktop `top: var(--v9-header-h) !important; bottom: auto !important;`, navigation kembali tampil sebagai bar atas walaupun source V10 sudah menetapkan bottom navigation.

## Perbaikan
- `desktop-experience-v10.css?v=10.0.1` sekarang disisipkan oleh SEO Worker setelah P2/public styles sehingga menjadi owner cascade terakhir pada homepage production.
- Reference di index dibump ke 10.0.1 untuk mematahkan cache browser lama.
- Validator Desktop V10 sekarang membaca `src/seo-worker-entry.js` dan memastikan Desktop V10 ditempatkan setelah style publik/P2.

## Expected desktop behavior
Pada viewport >=1024px, Beranda/Reels/Jual/Keranjang/Akun menjadi bottom navigation fixed dan centered. Header atas hanya berisi menu, logo, search, notifikasi/pesan.
