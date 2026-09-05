# Error & Edge Case Hardening B

Tanggal: 5 September 2026

## Tujuan

Bagian B memperkuat jalur commerce Pasar UMKM agar tidak hanya bekerja pada kondisi ideal, tetapi tetap konsisten ketika pengguna menekan aksi berulang, koneksi lambat/putus, sesi berakhir, stok berubah, toko dinonaktifkan, status pesanan berubah dari tab lain, atau respons checkout hilang setelah server mungkin sudah melakukan commit.

Fokusnya adalah reliability dan state correctness. Tidak ada fitur bisnis baru, tidak ada perubahan schema database, dan tidak ada bypass terhadap ownership atau authorization yang sudah ada.

## Hardening yang diterapkan

### 1. Request timeout dan error classification

Commerce V2 sekarang memiliki timeout request terkontrol menggunakan `AbortController`:

- request JSON normal: 15 detik;
- upload `FormData`: 45 detik;
- timeout dipetakan ke `REQUEST_TIMEOUT`;
- kegagalan jaringan dipetakan ke `NETWORK_ERROR`;
- HTTP 401 dipetakan ke `SESSION_EXPIRED`.

Saat session benar-benar 401, state auth disinkronkan kembali melalui owner auth yang sudah ada, navigation/sidebar diperbarui, dan login dibuka kembali. Commerce tidak membuat owner auth kedua.

### 2. Single-flight mutation guard

Mutation berisiko tinggi memakai satu registry in-flight internal (`COMMERCE.pending`) dan `withActionLock()` sehingga aksi yang sama tidak dapat berjalan paralel dari double tap, Enter berulang, atau klik cepat.

Dilindungi:

- tambah produk ke cart;
- ubah/hapus quantity cart;
- kosongkan cart;
- submit checkout;
- perubahan status order;
- hapus produk;
- submit profil toko;
- submit produk;
- onboarding seller per-step.

Lock dilepas melalui `finally`, sehingga error tidak meninggalkan tombol/flow terkunci permanen.

### 3. Checkout selalu membaca cart terbaru

Halaman checkout tidak lagi mempercayai snapshot cart yang mungkin berasal dari tab/state sebelumnya. Setiap pembukaan checkout memanggil `loadCart()` sehingga harga, quantity, stock, dan availability yang ditampilkan berasal dari state server terbaru.

Backend checkout tetap menjadi authority akhir dan masih memakai transaksi, row locking, recheck product/store availability, stock verification, atomic decrement, serta rollback jika salah satu bagian gagal.

### 4. Ambiguous checkout recovery

Kasus penting: server dapat menyelesaikan transaksi, tetapi koneksi pengguna putus sebelum response diterima. Mengulang checkout secara buta dapat membuat UX membingungkan.

Jika checkout gagal karena timeout/network error, client melakukan reconciliation read pada cart:

- jika cart sudah kosong, pengguna diarahkan ke **Pesanan Saya** dan diperingatkan untuk memeriksa order sebelum mencoba lagi;
- jika cart masih berisi item, checkout tetap dianggap gagal dan tombol dapat dicoba ulang.

Ini tidak menggantikan transaksi backend. Ini menangani ketidakpastian response di client dengan aman.

### 5. Cart stale-stock recovery

Jika update quantity mendapat HTTP 409 karena stock berubah, client mengambil cart terbaru dan merender ulang state server sebelum menampilkan error. UI tidak terus mempertahankan quantity/stock lama setelah conflict.

### 6. Inactive-store enforcement pada cart PATCH

Sebelumnya POST cart dan checkout memeriksa `stores.is_active`, tetapi PATCH quantity hanya memeriksa `products.is_active`. Itu memungkinkan quantity item dari toko yang baru dinonaktifkan masih dimutasi sebelum akhirnya disembunyikan atau ditolak saat checkout.

PATCH cart sekarang join ke `stores` dan mensyaratkan:

`p.is_active = TRUE AND s.is_active = TRUE`

Dengan begitu contract POST, PATCH, read, dan checkout konsisten.

### 7. Order stale-state recovery

Perubahan status order memakai single-flight lock. Jika backend menjawab 403/409 karena status sudah berubah atau transition tidak lagi sah, client mencoba mengambil daftar order terbaru sehingga memory state tidak terus mempertahankan status lama.

Backend tetap menentukan transition yang valid dan cancellation restock tetap transactional/idempotent terhadap status `cancelled` yang sudah ada.

### 8. Recoverable loading error states

Keranjang, checkout, dan daftar pesanan tidak lagi berhenti pada skeleton ketika request gagal. Mereka merender explicit error state dengan pesan dan tombol **Coba Lagi** yang kembali memakai route owner Commerce V2.

Ini mempertahankan state model:

`Idle → Pressed → Loading → Success / Error → Retry`

## Cache boundary

Karena owner Commerce V2 berubah, cache version dinaikkan:

- `PasarCommerce.version`: `2.1`;
- `js/commerce-experience-v2.js?v=2.1`;
- carrier `js/profile-saved.js?v=2.2`.

CSS commerce tidak berubah, sehingga tetap `commerce-experience-v2.css?v=2.0`.

## Guardrail

Regression validator baru: `scripts/validate-edge-hardening-b.mjs`.

Workflow baru: `.github/workflows/edge-hardening-b-validate.yml`.

Guardrail memverifikasi timeout/error codes, action locks, checkout fresh-read, ambiguous-response recovery, active-store enforcement, cache boundary, module size budget, tidak adanya owner global `window.fetch` kedua, syntax JavaScript, dan reproducible runtime build.

P2/P6 validation tetap aktif dan hanya diperbarui untuk cache contract serta scoped maintenance files yang memang menjadi owner hardening ini. Tidak ada existing check yang dinonaktifkan.

## Database

Tidak ada migration database untuk Bagian B.

Checkout dan order transaction architecture yang sudah ada dipertahankan. Perubahan backend hanya memperketat availability predicate pada cart quantity PATCH.

## Release rule

`branch → commit → PR → seluruh validation → explicit merge owner`

Bagian B tidak boleh masuk `main` hanya karena implementasi terlihat benar. Merge tetap menunggu instruksi eksplisit owner setelah evidence CI selesai.
