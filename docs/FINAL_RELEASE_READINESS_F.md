# Production Hardening F — Final Release Readiness

## Tujuan

Bagian F adalah gerbang release terakhir untuk Pasar UMKM. Fokus utamanya adalah memastikan satu aplikasi mobile-first dapat beradaptasi otomatis ke **mobile, tablet, laptop, desktop, dan ultrawide** tanpa membuat DOM/controller terpisah atau menggandakan feature owner.

F juga melakukan cross-check terhadap prinsip production hardening A–E: runtime build harus reproducible, touch/accessibility contract tetap hidup, responsive owner tunggal, cache asset terversi, dan tidak ada perubahan API/database hanya demi memperbaiki tampilan.

## Temuan utama audit

Masalah responsive terbesar bukan kekurangan jumlah breakpoint. Repository sudah memiliki responsive P5. Masalahnya adalah **cascade ownership**.

`index.html` memiliki blok bernama `postP6MobileShellHotfix`, tetapi aturan di dalamnya sebelumnya berlaku pada semua viewport. Aturan tersebut menggunakan `!important` untuk:

- menyembunyikan header pada profile/account;
- menghapus top padding pada profile;
- menyembunyikan header dan navigation pada Chat V7;
- memaksa Chat V7 menjadi fixed page selebar maksimum 720px.

Karena blok inline itu dimuat setelah stylesheet responsive, tablet/laptop/desktop tetap dapat menerima perilaku mobile. Secara visual hasilnya menyerupai aplikasi telepon yang diletakkan di canvas besar, bukan layout desktop yang benar.

## Perbaikan arsitektur

### 1. Mobile hotfix benar-benar mobile-only

Aturan shell Post-P6 sekarang dibungkus dalam:

```css
@media (max-width: 767px)
```

Mobile mempertahankan behavior yang sudah stabil, sedangkan viewport 768px ke atas tidak lagi ditimpa oleh shell mobile.

### 2. Satu responsive owner final

`css/tablet-desktop-v1.css` dipensiunkan.

Owner baru:

- `css/tablet-desktop-v2.css`

Owner tersebut hanya dimuat untuk `min-width: 768px` dan ditempatkan setelah mobile shell compatibility block. Tidak ada controller responsive baru. Semua perubahan adalah presentation/layout.

### 3. Device bands

| Viewport | Mode | Layout utama |
| --- | --- | --- |
| `< 768px` | Mobile | mobile header, bottom navigation, full-width touch surface |
| `768–899px` | Tablet portrait | centered content canvas, compact bottom dock, 6-category grid |
| `900–1023px` | Tablet landscape | wider work surface, 8-category grid, tetap touch-first |
| `1024–1279px` | Laptop / compact desktop | persistent 88px navigation rail, wide header/search, desktop commerce |
| `1280–1599px` | Desktop | expanded 208px rail, readable wide discovery, constrained feed |
| `1600px+` | Ultrawide | content growth capped; whitespace disengaja |

Breakpoints dipilih berdasarkan perubahan komposisi UI, bukan daftar merek perangkat.

## Responsive behavior per surface

### Home & discovery

- Hero tidak lagi melebar tanpa batas.
- Discovery memiliki maximum readable width.
- Kategori 6 kolom pada tablet, 8 kolom pada tablet landscape/laptop.
- Feed sosial tetap lebih sempit daripada canvas discovery agar post tidak berubah menjadi banner horizontal.
- Ultrawide memakai whitespace sebagai bagian layout, bukan memperbesar semua konten.

### Navigation

- Mobile: bottom navigation.
- Tablet: compact centered bottom dock.
- Laptop: persistent compact navigation rail.
- Desktop: expanded rail dengan icon + label.

### Commerce

- Tablet memperoleh contained work surface dan grid order dua kolom.
- Laptop/desktop mendapat menu tiga kolom.
- Product detail berubah menjadi dua kolom pada desktop tanpa controller/API baru.
- Sticky action mengikuti rail dan lebar work surface.

### Social profile & notifications

- Profile, post viewer, dan notifications mendapat contained readable canvas pada tablet/desktop.
- Header profile tidak lagi hilang akibat mobile-only hotfix.
- Comments menjadi centered dialog pada viewport besar.

### Chat V7

- Mobile tetap full-screen.
- Tablet memperoleh conversation canvas yang lebih lebar.
- Laptop/desktop memulihkan persistent application navigation agar user tidak terjebak di layar pesan.
- Chat V7 tetap satu-satunya renderer dan interaction owner.

## Mobile contracts yang dipertahankan

Bagian F tidak merombak mobile yang sudah baik. Existing mobile contract tetap dijaga:

- touch target minimum 44px;
- primary action 48px;
- form/search input 16px pada mobile untuk mencegah iOS zoom;
- safe-area support;
- reduced-motion support;
- mobile header/search dan bottom nav tetap mobile-first.

## Performance dan ownership

- Responsive V2 adalah CSS-only presentation owner.
- Tidak ada duplicate JavaScript controller.
- Tidak ada API baru.
- Tidak ada migration database.
- Tidak ada production data mutation.
- Responsive CSS hanya dimuat pada `min-width: 768px`.
- Source budget responsive dijaga maksimum 36KB.
- `!important` debt diberi batas tetap dan tidak boleh tumbuh bebas.

## Release guardrails

`Final Release Readiness F` dan responsive validator memeriksa:

- hanya satu responsive owner yang direferensikan index;
- responsive V1 harus tetap absent;
- mobile hotfix wajib ter-scope ke `max-width: 767px`;
- device bands 768 / 900–1023 / 1024 / 1280 / 1600 tersedia;
- tablet dock, laptop rail, desktop rail tersedia;
- social/feed/commerce width caps tersedia;
- desktop product-detail dua kolom tersedia;
- Chat V7 desktop navigation recovery tersedia;
- 44/48px mobile touch targets dan 16px mobile input contract tetap ada;
- decorative gradient/glass tidak masuk responsive owner;
- runtime build tetap reproducible.

## Validation boundary

CI dapat memverifikasi structure, ownership, CSS contracts, syntax, asset drift, dan deterministic build. CI repository saat ini tidak menyediakan browser screenshot matrix, sehingga dokumen ini tidak mengklaim pixel-perfect visual PASS hanya berdasarkan regex/static checks.

Release dianggap engineering-ready setelah seluruh PR CI dan Cloudflare preview hijau. Setelah merge/deploy, final production verification tetap mencakup viewport nyata 360/390/430, 768, 900–1023, 1024/1280+, serta smoke pada critical user flows.

## Database

Tidak ada migration database untuk F.

## Status

F menjadi code-complete setelah:

1. responsive architecture v2 terpasang;
2. legacy responsive owner dipensiunkan;
3. final release validator hijau;
4. seluruh existing CI tidak mengalami regression;
5. Cloudflare preview berhasil.

Merge ke `main` dan production deployment tetap hanya dilakukan setelah perintah eksplisit owner.
