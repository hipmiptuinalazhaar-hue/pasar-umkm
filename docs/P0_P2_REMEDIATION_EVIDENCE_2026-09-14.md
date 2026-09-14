# P0–P2 Remediation Evidence — 2026-09-14

Dokumen ini mencatat bukti teknis setelah remediasi P0 sampai P2 pada Pasar UMKM. Tujuannya adalah membedakan perubahan yang sudah memiliki bukti produksi, guardrail yang sudah dipasang di source, dan batas verifikasi yang masih memerlukan eksekusi dari environment release lokal.

## 1. Scope yang ditutup

### P0 — Authentication & account security

- Registrasi langsung yang membuat akun/session sebelum verifikasi telah dipensiunkan.
- `POST /api/auth/register` hanya membuat challenge OTP.
- Pembuatan user, session, konsumsi challenge, dan state login terjadi setelah OTP valid.
- Registration verification memakai row lock dan explicit DB transaction.
- Password recovery memakai challenge OTP V2 dan reset password mencabut session lama.
- Login hanya menerima akun aktif + email terverifikasi.
- Input password login dibatasi sampai 72 byte sebelum bcrypt untuk menghindari truncation ambiguity.
- Pembuatan session login dan update `last_login_at` berada dalam satu atomic SQL statement.
- Auth maintenance memiliki satu owner runtime melalui `ctx.waitUntil`, interval satu jam, dan batch maksimum 500 row per kategori.

### P1 — Reels, release integrity, security routing

- POST create/draft Reels V4 memiliki secure-create owner terpisah.
- Video diperiksa berdasarkan container/magic signature, MIME, ukuran, durasi, trim, dan product ownership.
- Cloudinary asset dibersihkan ketika upload berhasil tetapi validasi/DB write berikutnya gagal.
- Client tidak dapat menjadi authority event `order` Reels.
- Release process tidak bergantung pada GitHub Actions aktif.
- Local release memiliki predeploy gate dan postdeploy probe.
- Exact-SHA Cloudflare check-run menjadi mandatory attestation sebelum postdeploy smoke/probes.
- Semua application HTML routes diarahkan melalui security Worker lebih dulu, sementara static CSS/JS/media tetap menggunakan asset delivery.

### P2 — Transactionality, information disclosure, media hardening, housekeeping

- Multi-store checkout preference writes berada dalam transaction.
- API 5xx disanitasi pada global observability boundary sebelum dikirim ke browser.
- Story image upload memeriksa magic bytes.
- External avatar dibatasi ke HTTPS allowlist yang didukung.
- Seller dispute queue mendukung seluruh store milik seller.
- External promotion memiliki contract subject/destination yang valid dan tidak memaksa arbitrary external id menjadi UUID.
- Static build tidak lagi menulis ulang tracked source untuk cache fingerprinting.
- Static fallback CSP tidak mengizinkan inline JavaScript.
- Public Worker HTML memakai per-response CSP nonce.
- Admin HTML mempertahankan CSP terpisah yang lebih ketat: `base-uri 'none'`, `no-referrer`, API connection same-origin, dan HTTPS moderation media.

## 2. Permanent regression guards

Canonical `npm run validate` mencakup antara lain:

- `test:auth-v2`
- `test:route-ownership`
- `test:security-boundary`
- P1/P2/P3/P4/P5/P6/P7/P8/P9/P10 contracts
- cart/checkout, cache freshness, performance V10, Reels, legal/trust, support, staging release safety

Auth validator menolak direct verified registration, login bcrypt boundary regression, session creation yang tidak atomic, dan initial registration frontend yang membuat session sebelum OTP.

Security boundary validator menolak hilangnya Worker-first application HTML coverage, admin CSP isolation, nonce CSP, global 5xx sanitizer, bounded auth cleanup, story signature validation, dan avatar host/HTTPS restrictions.

Route ownership validator memastikan modern/canonical commerce and Reels owners tidak direbut kembali oleh legacy handlers.

## 3. Production database evidence

Read-only inspection pada Neon production database `pasar_umkm_app` mengonfirmasi:

- core schema ready;
- operational/P6 schema ready;
- launch/P7 schema ready;
- commerce/P8 schema ready;
- structured payment profile/P8.1 migration applied;
- customer support schema ready;
- Auth Security V2 migration applied;
- Reels Commerce V4 dan Advanced Creator migrations applied;
- `user_auth_challenges` memiliki pending registration fields dan purpose constraint untuk `register` / `password_reset`;
- auth audit table dan session table tersedia.

Tidak ada destructive SQL yang dijalankan untuk membuat audit terlihat hijau.

## 4. Cloudflare deployment evidence

Runtime/security remediation pada commit:

`281307ca42d7453df03754be63d8671a544ee399`

mendapat Cloudflare Workers check-run dengan exact matching `head_sha` dan conclusion `success`.

Evidence:

- Build ID: `993bdf94-128f-427a-855f-a7db144c981a`
- Version ID: `a937de3d-2d09-4ca8-afd3-20aea36192c7`
- Integration: official `cloudflare-workers-and-pages`

Release tooling setelah commit tersebut menambahkan mandatory local exact-SHA attestation melalui `npm run release:attest-cloudflare`. `release:postdeploy` sekarang menjalankan attestation tersebut sebelum production smoke/probes.

## 5. Canonical release sequence

```text
npm ci
npm run release:predeploy
        ↓
Cloudflare Build & Deploy dari main
        ↓
npm run release:attest-cloudflare
        ↓
npm run release:postdeploy
```

`release:postdeploy` juga menjalankan attestation sendiri sebagai langkah pertama, sehingga smoke tidak dapat dianggap sebagai bukti untuk SHA baru bila Cloudflare masih melayani release sebelumnya.

## 6. Verification boundaries

Environment ChatGPT yang digunakan untuk remediation ini tidak menyediakan checkout repository lokal lengkap yang dapat menjalankan seluruh `npm run release:predeploy`, dan tidak memiliki DNS outbound untuk melakukan HTTP smoke langsung ke hostname `workers.dev`.

Karena itu dokumen ini **tidak** mengklaim bahwa full local validation + postdeploy HTTP probe telah dieksekusi dari environment tersebut. Bukti yang tersedia adalah source-level regression contracts, read-only Neon production inspection, dan Cloudflare exact-SHA build/deploy check-run.

Full release certification tetap membutuhkan eksekusi canonical local release commands di checkout Node.js 22 yang memiliki network access.

## 7. Residual governance risk

GitHub branch `main` saat audit masih menunjukkan:

- branch protection: disabled;
- required status checks enforcement: off;
- repository rulesets: none.

Koneksi GitHub yang tersedia pada sesi remediation tidak menyediakan write action untuk branch protection/rulesets, sehingga kondisi ini tidak dapat diubah dari sesi ini. Ini merupakan residual repository-governance risk, bukan application-runtime bug.

Minimum recommended repository policy ketika control-plane tersedia:

1. block force-push dan branch deletion pada `main`;
2. batasi direct push bila workflow tim sudah siap;
3. tetap gunakan local `release:predeploy` karena proyek sengaja tidak memakai GitHub Actions sebagai release runner;
4. gunakan Cloudflare exact-SHA check-run sebagai deployment attestation, bukan sebagai pengganti source validation.

## 8. Completion statement

P0–P2 source remediation, production-schema compatibility checks, Cloudflare runtime deployment attestation, and permanent regression guards telah dikerjakan. Remaining work bukan lagi defect P0–P2 yang diketahui dari audit ini, melainkan eksekusi full local release certification pada environment ber-network serta repository governance control yang memerlukan akses GitHub settings.
