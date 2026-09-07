# P5 Real Release Verification

## Tujuan

P5 membuktikan release yang benar-benar ter-deploy, bukan hanya source code yang lulus static CI. Fokusnya adalah menghilangkan dua blind spot terakhir: race antara GitHub Actions dan Cloudflare deployment, serta tidak adanya browser/device verification nyata di pipeline production.

## Release identity

Post Deploy Smoke dan P5 Browser Matrix tidak lagi langsung menembak URL production sesaat setelah push. Keduanya lebih dulu membaca GitHub check-runs untuk **commit SHA yang sedang diuji** dan menunggu check dari aplikasi `cloudflare-workers-and-pages` dengan nama `Workers Builds:` selesai dengan conclusion `success`.

Konsekuensinya:

- smoke tidak boleh menganggap deployment selesai hanya karena URL lama masih sehat;
- failure/cancel/timeout Cloudflare membuat release verification fail-closed;
- tidak munculnya check Cloudflare dalam batas waktu juga dianggap failure;
- HTTP smoke baru berjalan setelah deployment SHA yang tepat ter-attest.

## Real browser matrix

`scripts/browser-release-smoke.mjs` menjalankan Chrome headless nyata melalui Chrome DevTools Protocol tanpa library browser tambahan. Matrix default:

| Viewport | Sasaran |
| --- | --- |
| 360x800 | Android kecil |
| 390x844 | mobile modern |
| 430x932 | mobile besar |
| 768x1024 | tablet portrait |
| 1024x768 | laptop/compact landscape |
| 1280x800 | desktop |
| 1600x900 | ultrawide |

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

Production browser smoke bersifat **read-only**. Ia tidak melakukan scripted click, login, checkout, chat write, rating write, atau HTTP mutation.

## Authenticated stateful E2E

Authenticated E2E V2 tetap menjadi jalur terpisah karena ia melakukan mutation nyata: cart, checkout, order lifecycle, rating, social/chat, dan admin session. Jalur ini hanya boleh dijalankan pada runtime non-production yang ter-attest dan database test terisolasi.

Production hostname secara eksplisit ditolak oleh authenticated runner. Tidak ada alasan engineering yang sah untuk menciptakan order palsu di database pengguna hanya agar dashboard CI terlihat hijau.

## Workflow

`P5 Real Release Verification` memiliki dua job:

1. `release-contract`
   - syntax tooling;
   - exact locked dependencies;
   - canonical `npm run validate`, termasuk static P5 contract.

2. `production-browser`
   - hanya pada push/main atau manual dispatch, bukan PR;
   - menunggu exact Cloudflare SHA;
   - memastikan Chrome nyata tersedia;
   - menjalankan seluruh viewport matrix terhadap production.

`Post Deploy Smoke` juga menggunakan exact deployment attestation yang sama sebelum menjalankan 9-point production HTTP smoke.

## Definition of Done

P5 code/release-verification layer dianggap selesai ketika:

- static P5 contract hijau;
- seluruh existing CI tidak regression;
- PR merged ke main;
- Cloudflare build untuk merge SHA sukses;
- Post Deploy Smoke sesudah exact deploy hijau;
- P5 real browser matrix sesudah exact deploy hijau;
- Load Smoke sesudah deployment tetap hijau.

Full **stateful authenticated E2E** baru dapat ditandai live-verified setelah tersedia runtime non-production yang terhubung ke database test terisolasi dan secrets synthetic roles. Ketiadaan konfigurasi eksternal tersebut tidak boleh diganti dengan mutation ke production.
