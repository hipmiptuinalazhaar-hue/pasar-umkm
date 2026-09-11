# P5 Real Release Verification

## Tujuan

P5 membuktikan release yang benar-benar ter-deploy, bukan hanya source code yang lulus static CI. Fokusnya adalah menutup blind spot release identity, browser/device rendering, critical interaction surfaces, dan load-readiness tanpa melakukan mutation terhadap data production.

## Release identity

P5 tidak langsung menguji URL production sesaat setelah push. Workflow lebih dulu membaca GitHub check-runs untuk **commit SHA yang sedang diuji** dan menunggu check dari aplikasi `cloudflare-workers-and-pages` dengan nama `Workers Builds:` selesai dengan conclusion `success`.

Konsekuensinya:

- smoke tidak boleh menganggap deployment selesai hanya karena URL release lama masih sehat;
- failure, cancel, atau timeout Cloudflare membuat release verification fail-closed;
- tidak munculnya check Cloudflare dalam batas waktu juga dianggap failure;
- HTTP smoke, browser matrix, critical-surface browser test, dan load gate baru berjalan terhadap release yang telah ter-attest.

## Real browser viewport matrix

`scripts/browser-release-smoke.mjs` menjalankan Chrome headless nyata melalui Chrome DevTools Protocol tanpa library browser tambahan. Matrix default:

| Viewport | Sasaran |
| --- | --- |
| 360x800 | Android kecil |
| 390x844 | mobile modern |
| 430x932 | mobile besar |
| 768x1024 | tablet portrait |
| 1024x768 | laptop/compact landscape |
| 1280x800 | desktop |
| 1366x768 | laptop umum |
| 1600x900 | desktop lebar |

Setiap viewport membuktikan:

- document dan aplikasi selesai render;
- splash selesai;
- header, navigation, hero, search, dan primary CTA terlihat;
- kategori benar-benar ter-hydrate dari API;
- tidak ada horizontal overflow material;
- primary CTA mempertahankan touch target minimum 44px;
- tidak ada runtime JavaScript error/unhandled rejection yang tertangkap;
- navigation mengikuti mode mobile/tablet/laptop/desktop yang diharapkan;
- screenshot real-render dihasilkan untuk setiap viewport selama run.

Viewport matrix bersifat **read-only dan click-free**.

## Critical-surface browser certification

`scripts/browser-p5-critical-surfaces.mjs` melengkapi viewport matrix dengan interaksi browser nyata terhadap permukaan kritis. Runner menggunakan Chrome nyata dan memasang CDP Fetch guard yang memblokir seluruh request `POST`, `PUT`, `PATCH`, dan `DELETE`. Dengan demikian test boleh menekan tombol UI tanpa membuat order, pesan, notifikasi, rating, atau mutation production lain.

Coverage P5 mencakup:

- notification entry point dan regression guard untuk `notification-core.css`;
- batas ukuran avatar notifikasi agar bug avatar raksasa tidak kembali;
- notification row/topbar grid dan overflow;
- search open/close;
- side menu open/close;
- cart routing;
- account, notification, messages, dan seller guest/auth-gated intent;
- canonical Reels runtime dan shell;
- checkout, purchases, seller-orders, support, dan admin shell;
- private-route `no-store` dan `noindex` contract;
- private route rendering pada mobile 390x844 dan desktop 1280x800;
- runtime exception dan console-error guard.

Produksi tetap **mutation-safe**. Interaksi kritis boleh diklik, tetapi request state-changing dibatalkan di level browser protocol sebelum mencapai server.

## Exact post-deploy HTTP smoke

Pada push `main` atau manual release, P5 menjalankan `scripts/post-deploy-smoke.mjs` setelah exact Cloudflare SHA ter-attest dan sebelum Chrome certification. Ini membuktikan shell, legal/trust, support, health/database readiness, catalog, dan anonymous security boundaries masih sehat pada release yang sama.

## Post-deploy load gate

Setelah browser certification lulus, P5 menjalankan public-read load smoke pada production dengan tier 50, 100, dan 200 concurrent requests. Gate mensyaratkan minimum success rate 99% dan p95 di bawah batas yang ditetapkan workflow. Load probe hanya menggunakan public read traffic dan tidak melakukan mutation.

PR preview tidak menerima production load gate.

## Authenticated stateful E2E

Authenticated E2E V2 tetap menjadi jalur terpisah karena ia melakukan mutation nyata: cart, checkout, order lifecycle, rating, social/chat, dan admin session. Jalur ini hanya boleh dijalankan pada runtime non-production yang ter-attest dan database test terisolasi.

Production hostname secara eksplisit ditolak oleh authenticated runner. Mutation ke database pengguna tidak pernah digunakan hanya untuk membuat dashboard CI terlihat hijau.

Staging bootstrap juga memverifikasi database target bernama `pasar_umkm_staging`, menyalin schema saja tanpa production rows, lalu menanam synthetic buyer, seller, dan admin fixtures.

## Workflow

`P5 Real Release Verification` memiliki dua job:

1. `release-contract`
   - syntax check seluruh tooling P5;
   - exact locked dependencies;
   - canonical `npm run validate`, termasuk static P5 contract.

2. `real-browser`
   - menunggu exact Cloudflare deployment untuk SHA yang diuji;
   - menjalankan post-deploy HTTP smoke pada main/manual release;
   - memastikan Chrome nyata tersedia;
   - menjalankan viewport matrix;
   - menjalankan critical-surface browser certification dengan mutation blocker;
   - menjalankan 50/100/200 public-read load gate pada main/manual release;
   - mencetak browser report.

PR memakai exact Cloudflare preview URL. Push `main` memakai production hanya setelah exact deploy attestation.

## Definition of Done

P5 release/browser layer dianggap **100% selesai untuk scope production-safe certification** ketika:

- static P5 release contract hijau;
- seluruh canonical validation tidak regression;
- Cloudflare build untuk final SHA sukses;
- exact post-deploy HTTP smoke hijau;
- seluruh viewport real-browser matrix hijau;
- critical-surface browser certification hijau;
- notification visual regression guard hijau;
- critical private routes lolos mobile dan desktop rendering;
- tidak ada runtime/browser defect yang terdeteksi dalam scope test;
- 50/100/200 public-read load smoke hijau;
- runtime build tetap deterministic.

Full **stateful authenticated E2E** tidak pernah dijalankan terhadap production. Ia baru dapat ditandai live-verified ketika runtime staging terisolasi dan secrets synthetic roles tersedia. Ketiadaan konfigurasi staging tidak boleh diganti dengan mutation ke production.
