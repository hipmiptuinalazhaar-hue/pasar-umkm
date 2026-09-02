# P4 Final Audit Checklist

Tanggal audit: 2 September 2026

Branch integrasi: `p4-9-10-chat-profile-hardening`

Dokumen ini membedakan **code-complete** dari **production rollout**. Kotak P4.1–P4.10 di bawah berarti implementasi sudah hadir pada branch integrasi dan diperiksa oleh CI. Ini tidak berarti stack sudah di-merge ke `main` atau migration production sudah dijalankan.

## Checklist Implementasi P4

- [x] **P4.1 Atomic order transactions**
  - Checkout memakai transaksi interaktif `BEGIN/COMMIT/ROLLBACK`.
  - Cart, product, dan order memakai row locking yang terkontrol.
  - Stock decrement memakai guard `stock >= quantity`.
  - Cancellation, restock, status, dan notification berada dalam transaksi yang sama.
  - Manual compensation dan manual order UUID tidak digunakan.

- [x] **P4.2 Zero runtime schema DDL**
  - Runtime `src/*.js` tidak menjalankan `CREATE/ALTER/DROP` schema object.
  - Chat/profile menggunakan verifier infrastructure terpusat.
  - Perubahan schema dimiliki migration, bukan request handler.

- [x] **P4.3 Comment reply integrity**
  - Reply hanya boleh menempel pada root comment aktif yang valid.
  - Candidate/root dikunci untuk mencegah race saat reply/delete.
  - Soft-delete parent menghasilkan tombstone yang konsisten.
  - Tidak ada hard-delete komentar pada request path normal.

- [x] **P4.4 Chat media ownership and cleanup**
  - Media path terikat ke conversation + user + random asset UUID.
  - Cloudinary URL diverifikasi terhadap cloud/folder/ownership yang dikonfigurasi.
  - Delete-for-everyone dibatasi pada pengirim.
  - Cleanup asset provider tersedia untuk failure/delete path.

- [x] **P4.5 Reusable deterministic runtime pipeline**
  - Runtime JS/CSS/logo dibangun melalui workflow reusable.
  - Workflow tidak hard-code branch P3.
  - Drift check memastikan generated assets cocok dengan source.
  - Workflow bootstrap lama yang hanya berlaku sekali sudah dibuang.

- [x] **P4.6 Reproducible supply chain**
  - Dependency runtime dan build dipin ke versi exact.
  - `package-lock.json` dipakai melalui `npm ci`.
  - GitHub Actions eksternal dipin ke full commit SHA.
  - Dependabot dan npm save-exact policy aktif.

- [x] **P4.7 Incremental catalog loading**
  - Initial public catalog memakai batch kecil 24 item.
  - Frontend menyimpan cursor terpisah untuk products dan stores.
  - Home melakukan incremental load mendekati akhir feed.
  - Category/store directory memiliki manual load-more fallback.
  - Deduplikasi ID mencegah duplikasi item antar-page.

- [x] **P4.8 Cursor/keyset catalog pagination**
  - Products memakai keyset `(created_at, id)`.
  - Stores memakai stable rank/name/id keyset.
  - Default limit 24, maksimum 50.
  - `LIMIT + 1` menggantikan full `COUNT(*)` untuk `has_next`.
  - Deep `OFFSET` dihapus dan malformed/legacy cursor ditolak sebelum query database.

- [x] **P4.9 Deterministic latest chat window**
  - Message list, metadata, dan rich metadata mengambil **200 pesan terbaru**, bukan 200 tertua.
  - Window memakai `(created_at DESC, id DESC)` sebagai deterministic selector.
  - Hasil dikembalikan `(created_at ASC, id ASC)` agar UI tetap kronologis.
  - Tie pada timestamp tidak lagi membuat row biasa dan rich metadata bergeser pasangan.

- [x] **P4.10 External profile media storage**
  - Upload avatar baru tidak lagi menulis BYTEA ke `user_profile_media`.
  - Avatar baru disimpan pada owned Cloudinary folder `pasar-umkm/profile/<user-id>/<asset-uuid>`.
  - Provider `public_id` dan returned URL diverifikasi sebelum database menunjuk ke asset.
  - Jika database update gagal, asset baru dibersihkan.
  - Setelah database berhasil menunjuk ke asset baru, failure path tidak boleh menghapus asset committed tersebut.
  - Asset avatar Cloudinary lama milik user dibersihkan setelah replacement sukses.
  - Endpoint BYTEA lama tetap tersedia sebagai fallback untuk avatar legacy yang sudah ada.

## Cross-check Integrasi

- [x] Semua `src/*.js` dan frontend JS lolos syntax check.
- [x] P4.1–P4.10 diperiksa bersama pada final integration branch, bukan hanya pada PR masing-masing.
- [x] Runtime frontend dapat dibangun ulang tanpa drift.
- [x] Final Worker dapat dibundle dari locked toolchain.
- [x] Parser ownership chat/profile mendapat negative/adversarial tests.
- [x] Temporary mutation/bootstrap tooling P4 dibuang dari branch final.
- [x] P4.9 dan P4.10 tidak memerlukan migration database baru.

## Production Rollout Gates

Bagian ini **belum boleh dicentang hanya karena code CI hijau**.

- [ ] P0 migration diuji pada temporary Neon migration branch dan mendapat approval sebelum production apply.
- [ ] P0 migration diterapkan ke production dengan migration protocol yang sah.
- [ ] P1 migration diuji dan diterapkan setelah P0.
- [ ] Target database yang benar untuk Cloudflare `DATABASE_URL` diverifikasi.
- [ ] Stack PR di-merge berurutan dari P0 sampai P4.10 tanpa melewati dependency.
- [ ] Cloudflare production deployment setelah merge diverifikasi.
- [ ] Smoke test auth/session, catalog, cart, checkout, cancel, comments, chat, dan avatar dilakukan di production.
- [ ] Satu avatar baru diuji end-to-end terhadap konfigurasi Cloudinary production.
- [ ] Cleanup/replacement avatar Cloudinary diuji dengan mengganti avatar dua kali.
- [ ] Monitoring error/log production dilakukan setelah rollout.

## Known External Blocker

Pada audit terakhir, connector Neon `run_sql` gagal pada lapisan wrapper sebelum query database karena mismatch nama parameter (`projectId` vs `project_id`). Karena itu, status database production tidak boleh dianggap terverifikasi hanya dari audit kode ini. Tidak ada write ke Neon production yang dilakukan oleh P4.9/P4.10.

## Merge Order

`P0 → P1 → P2 → P3 → P4.1/2 → P4.3/4 → P4.5/6 → P4.7/8 → P4.9/10`

Jangan merge P4 langsung ke `main` sambil melewati migration dependency P0/P1. CI boleh percaya diri, database tetap tidak membaca motivasi manusia.