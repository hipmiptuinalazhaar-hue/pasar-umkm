# Production Hardening E — Technical Debt & Cleanup

## Tujuan

Bagian E mengurangi technical debt yang sudah tidak memiliki tanggung jawab runtime, memperjelas source-of-truth, dan memasang guardrail agar legacy owner tidak muncul kembali. Cleanup mengikuti prinsip **one feature → one owner**, minimal diff, dan tidak mengubah contract API/database yang sudah benar.

## Cleanup yang dilakukan

### 1. Retired chat shims dihapus

Chat V7 adalah owner aktif untuk presentation dan interaction. File berikut sebelumnya hanya berisi marker `Retired by UI-P4` atau flag retirement, sehingga tidak lagi memiliki behavior production dan dihapus dari repository:

**JavaScript**
- `js/chat-experience.js`
- `js/chat-mark-read.js`
- `js/chat-media-experience.js`
- `js/chat-stability-v4.js`
- `js/chat-whatsapp-v5.js`

**CSS**
- `css/chat-bubble-final.css`
- `css/chat-experience.css`
- `css/chat-layout-v2.css`
- `css/chat-single-render-v6.css`
- `css/chat-stability-v4.css`
- `css/chat-whatsapp-v3.css`
- `css/chat-whatsapp-v5.css`

Owner aktif yang tetap dipertahankan:
- `js/chat-single-render-v6.js` sebagai compatibility bootstrap/lazy-loader yang mengarahkan intent chat ke V7;
- `js/chat-experience-v7.js` sebagai interaction owner;
- `css/chat-experience-v7.css` sebagai presentation owner.

Nama `chat-single-render-v6.js` memang historis dan kurang ideal, tetapi rename file loader yang aktif berisiko mengubah cache/load contract tanpa manfaat runtime yang sebanding. Rename ditunda ke perubahan terpisah bila benar-benar diperlukan.

### 2. P4 audit dijadikan historical snapshot

`docs/P4_FINAL_AUDIT.md` sebelumnya masih menampilkan rollout gate dan blocker 2 September 2026 seolah status current production. Dokumen itu sekarang diberi status **HISTORICAL / ARCHIVED**, mempertahankan nilai histori engineering tetapi tidak lagi menjadi source-of-truth production.

Referensi hardening yang lebih baru:
- `docs/PRODUCTION_SMOKE_TEST_A.md`
- `docs/ERROR_EDGE_HARDENING_B.md`
- `docs/OBSERVABILITY_MONITORING_C.md`
- `docs/FINAL_SECURITY_AUDIT_D.md`
- dokumen ini untuk fase E.

### 3. Schema-guard documentation diperbaiki

Komentar pada `src/functionality-store.js` sebelumnya masih menyebut legacy handler yang menyentuh runtime DDL. Setelah P4, runtime tidak lagi memiliki schema mutation. Dokumentasi guard diselaraskan dengan kondisi aktual: migration adalah owner schema, runtime hanya memverifikasi objek/kolom yang dibutuhkan.

## Residual debt yang sengaja tidak dipaksakan dalam E

Cleanup tidak berarti mengubah file besar hanya untuk mengejar angka nol.

### Public-admin compatibility code

`src/functionality-api.js` dan `js/app.js` masih memiliki beberapa branch historis berbasis `role === "admin"`. Setelah Hardening D:

- database production menolak `users.role = admin`;
- privileged admin berada di `admin_accounts`;
- outer request-security menolak legacy `/api/commerce/admin*`;
- branch public-admin tersebut tidak lagi menjadi authority production.

Menghapus seluruh branch itu dari file besar membutuhkan perubahan runtime dan regeneration frontend yang lebih luas. Karena security invariant sudah enforced di backend/database, pekerjaan ini dicatat sebagai residual cleanup terpisah, bukan dicampur ke penghapusan shim low-risk.

### Open pull requests

Audit repository menemukan PR lama/dependency berikut masih terbuka:
- Dependabot #11, #12, #13, #14, #15;
- PR #31 `B1: Orders & transaction stability`.

E **tidak menutup, merge, rebase, atau menghapus** PR tersebut. PR #31 membawa `src/orders-api-v2.js` yang tidak ada pada current `main`, sehingga perlu audit tersendiri sebelum keputusan cleanup. Repository hygiene tidak boleh berubah menjadi penghapusan histori tanpa approval owner.

## Guardrail E

`scripts/validate-technical-debt-e.mjs` memastikan:

- seluruh retired chat shim di atas tetap tidak ada;
- Chat V7 owner dan compatibility bootstrap tetap ada;
- bootstrap aktif benar-benar memuat V7 JS/CSS;
- `index.html` tidak mereferensikan retired shim;
- P4 audit tetap ditandai archived dan blocker lama tidak kembali;
- schema guard tidak kembali mendokumentasikan runtime DDL yang sudah dipensiunkan;
- runtime build tetap reproducible.

## Database dan API

Bagian E tidak memerlukan migration database dan tidak mengubah data production. Tidak ada endpoint publik baru, tidak ada perubahan contract commerce/social/chat, dan tidak ada perubahan privileged admin authority.

## Status

Bagian E dianggap code-complete ketika dedicated cleanup validator dan seluruh existing CI hijau. Merge ke `main` dan deployment production tetap menunggu perintah eksplisit owner.
