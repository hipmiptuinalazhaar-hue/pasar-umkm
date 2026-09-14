# Pasar UMKM — Local Release Process

Pasar UMKM memakai Cloudflare sebagai target deployment. GitHub Actions tidak digunakan sebagai release runner aktif. Workflow historis yang berada di `.github/workflows-disabled/` hanya arsip referensi dan bukan kontrol produksi.

## 1. Pre-deploy gate

Jalankan dari working tree yang bersih dengan Node.js 22:

```bash
npm ci
npm run release:predeploy
```

`release:predeploy` wajib menyelesaikan build runtime dan seluruh `npm run validate`, termasuk lint syntax, kontrak Auth Security V2, route ownership, security boundary, commerce, SEO, staging safety, Reels, support, dan final-completion contract. Deploy tidak boleh dilanjutkan bila satu gate gagal.

## 2. Deploy Cloudflare

Deploy hanya artefak yang telah melewati pre-deploy gate menggunakan mekanisme Build & Deploy Cloudflare yang terhubung dengan repository/branch `main`. Commit yang dideploy wajib sama dengan commit yang baru diverifikasi.

Jangan menyalin secret ke repository. `DATABASE_URL`, konfigurasi Resend/Auth OTP, Cloudinary, dan key keamanan tetap berada di environment/secrets Cloudflare.

## 3. Exact-SHA deployment attestation

Sebelum menjalankan smoke atau production probe, verifikasi bahwa Cloudflare benar-benar sudah menyelesaikan deployment untuk commit lokal yang sama:

```bash
npm run release:attest-cloudflare
```

Secara default script membaca `git rev-parse HEAD`, memeriksa check-run resmi `cloudflare-workers-and-pages`, dan baru lulus ketika check-run untuk SHA tersebut berstatus `completed` dengan conclusion `success`. Repo publik dapat diverifikasi tanpa token. Jika GitHub API melakukan rate-limit, set `GITHUB_TOKEN` secara lokal tanpa memasukkannya ke repository.

Untuk memverifikasi SHA tertentu secara eksplisit gunakan `RELEASE_SHA` atau `CLOUDFLARE_SHA`. Script gagal tertutup bila check-run tidak muncul, deployment berakhir gagal/cancelled/timed-out, atau timeout tercapai.

## 4. Post-deploy verification

Setelah deployment exact-SHA telah terattestasi, jalankan:

```bash
npm run release:postdeploy
```

`release:postdeploy` sendiri selalu menjalankan `release:attest-cloudflare` terlebih dahulu. Baru setelah exact-SHA lolos, gate menjalankan smoke HTTP production, regression reliability, launch/growth probe, database-scale probe, dan offensive-security production probe. Probe production harus tetap non-destruktif kecuali script secara eksplisit menggunakan environment staging yang terisolasi.

## 5. Stateful authenticated smoke

Authenticated E2E yang melakukan mutasi tidak boleh diarahkan ke production. Gunakan database staging `pasar_umkm_staging`, runtime `APP_ENV=staging`, marker `p2-e2e-isolated`, dan credential smoke khusus staging.

## 6. Rollback

Jika deployment attestation atau post-deploy verification gagal:

1. hentikan perubahan lanjutan;
2. jangan menganggap smoke terhadap release sebelumnya sebagai bukti untuk SHA baru;
3. rollback deployment Cloudflare ke commit release sehat terakhir bila release baru memang sudah aktif;
4. jangan rollback database secara otomatis jika migration sudah berjalan;
5. lakukan forward-fix migration bila perubahan schema perlu dikoreksi;
6. ulangi exact-SHA attestation dan `npm run release:postdeploy` setelah rollback/forward-fix.

## 7. Evidence

Untuk setiap release penting simpan minimal: commit SHA, hasil `npm run release:predeploy`, check-run Cloudflare exact-SHA beserta Build ID/Version ID, hasil `npm run release:postdeploy`, dan catatan migration yang diterapkan. Bukti ini menggantikan asumsi lama bahwa workflow GitHub Actions adalah sumber kebenaran release.
