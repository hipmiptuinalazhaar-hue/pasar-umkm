# P6 Observability & Production Reliability

Dokumen ini mengunci batas operasional P6 untuk Pasar UMKM. Tujuannya bukan menambah fitur, melainkan memastikan produksi dapat diamati, dikorelasikan, dipantau, dan dipulihkan tanpa membocorkan data pengguna.

## Service level objectives

Target operasional awal:

- Availability produksi: **99.9%** untuk shell publik dan API baca inti.
- Probe sintetis terjadwal: 100% sukses pada setiap run, tanpa 5xx dan tanpa timeout.
- Latency probe: **p95 <= 5000 ms** pada jaringan GitHub-hosted runner. Angka ini adalah release gate konservatif, bukan klaim Core Web Vitals.
- `/api/health` wajib melaporkan database connected, core schema ready, P6 operational ready, dan support ready.
- API wajib mengirim `X-Request-Id` dan `Server-Timing` agar insiden dapat dikorelasikan tanpa menyimpan identitas pengguna.

SLO 99.9% diterjemahkan ke error budget sekitar 43 menit 49 detik per 30 hari. Synthetic probe bukan satu-satunya sumber kebenaran, tetapi menjadi alarm regresi dan availability gate yang dapat direproduksi.

## Telemetry privacy

Structured logs hanya boleh berisi metadata operasional yang dibatasi: timestamp, event, level, service, environment, request id, CF-Ray, colo, HTTP method, normalized route family, status, duration, outcome, error code, dan error class untuk exception.

Dilarang mencatat:

- query string mentah,
- request body,
- cookies,
- Authorization header,
- User-Agent,
- alamat IP,
- password, OTP, token, nomor rekening, isi chat, atau data pribadi lain.

Dynamic identifier pada URL tidak dicatat mentah. Route diklasifikasikan ke keluarga stabil seperti `/api/products/*`, `/api/disputes/*`, dan `/api/admin/operations/*`.

## Incident triage

Urutan triage ketika workflow P6 gagal:

1. Pastikan kegagalan berasal dari commit yang sama dengan deployment Cloudflare yang diuji.
2. Baca `p6-reliability-results/report.json` dari artifact workflow.
3. Periksa endpoint mana yang gagal, status HTTP, p95, max latency, dan apakah terjadi timeout.
4. Untuk API, gunakan `X-Request-Id` atau CF-Ray dari request terkait untuk mencari structured log Cloudflare.
5. Bedakan kelas insiden: deploy failure, database/schema, 5xx aplikasi, rate limit, auth denial abnormal, slow request, atau dependency/network.
6. Jangan memperbaiki gejala dengan menonaktifkan security, rate limit, ownership check, audit log, atau no-store pada endpoint privat.
7. Setelah perbaikan, wajib menjalankan canonical validation, P6 final contract, exact-deploy attestation, dan live production reliability probe lagi.

## Rollback and recovery

Jika commit baru membuat production gate gagal dan perbaikan aman tidak dapat diselesaikan segera:

1. Kembalikan aplikasi ke commit terakhir yang telah lulus P5 dan P6 certification menggunakan mekanisme Git/Cloudflare yang sudah ada.
2. Jangan rollback database dengan `DROP`, `TRUNCATE`, atau penghapusan data produksi. Migration P6 lama tetap additive.
3. Jangan menghapus report, dispute, support, order timeline, admin audit, atau case-event history untuk membuat health check tampak hijau.
4. Verifikasi `/api/health`, smoke HTTP, real-browser critical surfaces, lalu P6 reliability probe setelah rollback.
5. Catat commit penyebab, gejala, request id terkait, durasi insiden, dan tindakan pemulihan di catatan insiden internal.

## Monitoring cadence

Workflow `P6 Production Reliability` berjalan pada push yang relevan, manual dispatch, dan jadwal hourly pada menit ke-17. Jadwal dibuat tidak tepat di menit 00 untuk mengurangi kontensi umum runner terjadwal.

Probe produksi bersifat read-only. Ia hanya memakai GET ke homepage, health, kategori, toko, produk, unknown API, robots, dan sitemap. Tidak ada checkout sintetis, login, perubahan profil, transaksi, report creation, atau mutation lain di production.
