# Desktop UI V10 — P0–P7
Tanggal: 2026-09-22

P0: bottom navigation desktop fixed dan centered.
P1: homepage desktop split hero + showcase produk aktual + marketplace grid.
P2: Reels desktop video portrait dan panel informasi/aksi terpisah, header + bottom nav tetap tersedia.
P3: shell desktop konsisten untuk commerce/profile/chat serta halaman launch/support/purchases/checkout/seller-orders/legal.
P4: typography, hover, focus-visible dan pointer states.
P5: footer desktop trust/navigation.
P6: desktop-experience-v10.css menjadi final owner >=1024px; tablet-desktop-v2 tidak lagi dimuat dari entry; Reels memindahkan owner V10 ke cascade tail setelah lazy CSS.
P7: validate-desktop-v10.mjs menjadi release gate statis.

Target viewport QA: 1024x768, 1280x720, 1366x768, 1440x900, 1600x900, 1920x1080.
Tidak ada perubahan API, auth, order, payment, database, analytics, atau kontrak mobile.
