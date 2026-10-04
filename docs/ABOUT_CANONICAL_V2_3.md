# About Experience Canonical V2.3

Tanggal: 2026-10-05

## Bug
Menu "Tentang Pasar UMKM" memiliki dua renderer:
1. renderer legacy di app.js/app.runtime.js;
2. About Experience V2 yang dimuat lazy dari index.html.

Pada cold start/race asset, handler utama dapat menjalankan renderer legacy sebelum V2 aktif, sehingga tampilan lama muncul kembali.

## Fix
- Markup About legacy dihapus dari app.js dan app.runtime.js.
- openAbout() sekarang hanya mendelegasikan ke PasarAboutExperience revision 2.3.
- CSS dan JS About V2 dimuat sebagai asset awal berurutan setelah runtime, tidak lagi berdasarkan pointerdown.
- Fallback ke renderer lama di about-experience-v2.js dihapus.
- postReleaseUXBootstrap tidak lagi memiliki event interception untuk About.
- Validator canonical memastikan tidak ada dua owner About lagi.

## Failure behavior
Jika asset About V2 gagal tersedia, pengguna mendapat pesan error/retry. UI legacy tidak boleh pernah dirender kembali.
