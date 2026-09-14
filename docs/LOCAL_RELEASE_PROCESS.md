# Pasar UMKM — Local Release Process

Pasar UMKM memakai Cloudflare sebagai target deployment. GitHub Actions tidak digunakan sebagai release runner aktif. Workflow historis yang berada di `.github/workflows-disabled/` hanya arsip referensi dan bukan kontrol produksi.

## 1. Pre-deploy gate

Jalankan dari working tree yang bersih dengan Node.js 22:

```bash
npm ci
npm run release:predeploy
```

`release:predeploy` wajib menyelesaikan build runtime dan seluruh `npm run validate`, termasuk lint syntax, kontrak Auth Security V2, security gate, commerce, SEO, staging safety, Reels, support, dan final-completion contract. Deploy tidak boleh dilanjutkan bila satu gate gagal.

## 2. Deploy Cloudflare

Deploy hanya artefak yang telah melewati pre-deploy gate menggunakan mekanisme Build & Deploy Cloudflare yang terhubung dengan repository/branch `main`. Pastikan commit yang dideploy sama dengan commit yang baru diverifikasi.

Jangan menyalin secret ke repository. `DATABASE_URL`, konfigurasi Resend/Auth OTP, Cloudinary, dan key keamanan tetap berada di environment/secrets Cloudflare.

## 3. Post-deploy verification

Setelah Cloudflare menyatakan deployment aktif, jalankan:

```bash
npm run release:postdeploy
```

Gate ini menjalankan smoke HTTP production, regression reliability, launch/growth probe, database-scale probe, dan offensive-security production probe. Probe production harus tetap non-destruktif kecuali script secara eksplisit menggunakan environment staging yang terisolasi.

## 4. Stateful authenticated smoke

Authenticated E2E yang melakukan mutasi tidak boleh diarahkan ke production. Gunakan database staging `pasar_umkm_staging`, runtime `APP_ENV=staging`, marker `p2-e2e-isolated`, dan credential smoke khusus staging.

## 5. Rollback

Jika post-deploy verification gagal:

1. hentikan perubahan lanjutan;
2. rollback deployment Cloudflare ke commit release sehat terakhir;
3. jangan rollback database secara otomatis jika migration sudah berjalan;
4. lakukan forward-fix migration bila perubahan schema perlu dikoreksi;
5. ulangi `npm run release:postdeploy` setelah rollback/forward-fix.

## 6. Evidence

Untuk setiap release penting simpan minimal: commit SHA, hasil `npm run release:predeploy`, deployment Cloudflare yang sesuai SHA, hasil `npm run release:postdeploy`, dan catatan migration yang diterapkan. Bukti ini menggantikan asumsi lama bahwa workflow GitHub Actions adalah sumber kebenaran release.
