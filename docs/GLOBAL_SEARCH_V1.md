# Global Search V1

Tanggal: 2026-10-05

Search lama hanya memfilter data yang sudah termuat di browser. Akibatnya produk di luar batch awal, UMKM lain, dan nama pengguna publik sering tidak ditemukan.

## Global Search baru
`GET /api/search?q=<query>&limit=8` mencari langsung di PostgreSQL:
- produk aktif;
- UMKM aktif;
- profil publik pemilik UMKM aktif;
- kategori aktif.

## Privasi
Endpoint search tidak mengembalikan email, nomor telepon, WhatsApp, atau alamat lengkap. Profil pengguna yang dapat dicari dibatasi pada pemilik UMKM dengan toko publik aktif.

## Frontend
- debounce 280 ms;
- request lama dibatalkan dengan AbortController;
- stale response tidak boleh menimpa query terbaru;
- hasil dikelompokkan menjadi Produk, UMKM, Pengguna, Kategori;
- produk/toko yang belum ada pada batch homepage di-hydrate ke state lokal sehingga detail bisa langsung dibuka.
