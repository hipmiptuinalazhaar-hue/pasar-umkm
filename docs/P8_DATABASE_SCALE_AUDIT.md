# P8 Database Scale Audit & Capacity Hardening

## Scope

P8 ini adalah phase baru setelah P7 Final Launch Readiness. Nama internalnya sengaja memakai `p8-scale` agar tidak bertabrakan dengan phase historis `P8 Real Commerce` yang sudah ada di repository.

Tujuan P8 adalah memastikan layer Neon PostgreSQL punya dasar scale yang aman sebelum traffic dan data tumbuh: query shape terkontrol, index ownership jelas, vacuum/bloat dapat dipantau, kapasitas punya threshold, dan tidak ada perubahan schema destruktif hanya karena angka statistik sesaat.

## Production database audited

- Project: Pasar UMKM
- Branch: `production`
- Database: `pasar_umkm_app`
- Audit date: 2026-09-12
- Audit mode: read-only

Tidak ada data produksi yang dimutasi selama audit ini.

## Baseline production findings

### Database footprint

Database memiliki 72 application tables. Tabel terbesar saat audit masih kecil:

- `growth_events`: 288 kB
- `user_profile_media`: 80 kB
- `notifications`: 72 kB
- `admin_audit_logs`: 48 kB
- `carts`: 40 kB
- `cart_items`: 40 kB

Ini berarti database belum berada pada titik di mana ukuran tabel sendiri menjadi bottleneck. Optimasi harus diarahkan ke query shape dan pola akses, bukan sekadar menambah index secara membabi buta.

### Index footprint

Terdapat lebih dari 200 index. Sebagian besar masih 8-16 kB karena cardinality data rendah. Index terbesar saat audit:

- `growth_events_event_time_idx`: 88 kB
- `growth_events_pkey`: 56 kB

Audit `unused-indexes` menemukan banyak index dengan scan rendah atau nol. P8 **tidak menghapus index tersebut** karena:

1. data produksi masih kecil;
2. statistik scan rendah pada tahap ini belum cukup untuk membuktikan index tidak dibutuhkan;
3. beberapa index melindungi query path yang belum sering dipakai tetapi kritikal ketika fitur aktif;
4. penghapusan index sekarang akan menjadi optimasi spekulatif dan berisiko regresi saat traffic naik.

Kandidat penghapusan baru boleh dipertimbangkan setelah statistik stabil pada window minimum 30 hari dan query owner sudah dipetakan.

### Sequential scan observations

Statistik menunjukkan sequential scan tinggi pada tabel public-read utama, terutama:

- `products`
- `stores`
- `product_comments`
- `categories`
- `sessions`
- `orders`
- `users`

Pada ukuran tabel saat ini, sequential scan bukan bukti otomatis bahwa query buruk. PostgreSQL memang dapat memilih seq scan karena tabel sangat kecil dan itu sering lebih murah daripada index lookup.

P8 therefore treats seq-scan count as a growth signal, bukan alasan otomatis untuk membuat index baru. Ketika row count naik, query plan harus diuji ulang dengan `EXPLAIN (ANALYZE, BUFFERS)` pada query nyata.

### Vacuum and dead tuples

Beberapa tabel memiliki dead tuples relatif tinggi dibanding jumlah row hidup, misalnya `notifications`, `direct_conversations`, `cart_items`, `direct_messages`, `orders`, `carts`, `stores`, dan `sessions`.

Namun ukuran absolutnya masih sangat kecil dan audit bloat hanya menemukan waste bermakna pada `growth_events` sekitar 64 kB. Tidak ada tindakan `VACUUM FULL`, `REINDEX`, atau table rewrite dilakukan. Operasi tersebut terlalu agresif untuk keadaan saat ini dan tidak layak dijalankan hanya demi membuat dashboard terlihat cantik. Database bukan tanaman hias.

### Bloat

Audit bloat menunjukkan:

- `growth_events`: estimated bloat 1.3, waste sekitar 64 kB
- tabel lain yang terdeteksi: sekitar 1.0 dengan waste 0 bytes

Status: healthy untuk skala saat ini.

### Locks and long-running queries

- long-running query >5 menit: 0
- active locks saat audit: 0

Status: tidak ada contention aktif yang terdeteksi.

### Query statistics extension

`pg_stat_statements` belum terpasang pada `pasar_umkm_app`. Karena pemasangan extension adalah mutation database, P8 tidak memasangnya secara otomatis. Hal ini bukan release blocker saat ini karena observability aplikasi dan database diagnostics tetap tersedia, tetapi extension tersebut menjadi kandidat ketika workload sudah cukup besar untuk membutuhkan ranking query cumulative cost secara kontinu.

## Scale policy

### 1. Index policy

Index baru hanya boleh ditambahkan bila memenuhi salah satu kondisi berikut:

- query plan nyata menunjukkan scan/filter/sort yang mahal;
- query adalah hot-path dengan traffic konsisten;
- constraint integrity membutuhkan uniqueness;
- pagination/order-by membutuhkan index yang mempertahankan deterministic order;
- foreign-key access path menjadi bottleneck terukur.

Setiap index baru harus punya query owner dan alasan tertulis. Index tidak boleh dibuat hanya karena sebuah kolom “kelihatannya sering dipakai”.

### 2. Index retirement policy

Index hanya boleh dihapus bila seluruh syarat terpenuhi:

- bukan PK/unique/constraint index;
- scan rendah pada window minimal 30 hari;
- ukuran index cukup berarti untuk justify cleanup;
- tidak mendukung query musiman/admin/incident path;
- tidak dipakai oleh documented critical query;
- removal diuji di temporary branch terlebih dahulu.

### 3. Query-plan policy

Re-audit query plan wajib dilakukan ketika salah satu threshold tercapai:

- tabel public-read > 100k rows;
- tabel transaction/order > 50k rows;
- table size > 1 GB;
- index size > 500 MB;
- API p95 DB-backed endpoint > 1.5 s pada window stabil;
- seq scan tumbuh cepat bersamaan dengan latency growth;
- lock wait atau stalled query mulai muncul.

### 4. Pagination policy

List endpoint wajib menggunakan bounded limits. Dataset besar harus menggunakan cursor/keyset pagination dengan ordering deterministik. Offset pagination besar tidak boleh menjadi default untuk high-cardinality tables.

### 5. Transaction policy

Checkout/order mutation tetap wajib atomic. Stock dan state transition tidak boleh bergantung pada browser sebagai authority. Row lock atau equivalent concurrency guard harus dipertahankan pada critical inventory/order path.

### 6. Vacuum and bloat policy

Autovacuum tetap menjadi default maintenance owner. Manual vacuum/reindex hanya dipertimbangkan ketika ada evidence nyata, bukan berdasarkan rasio dead tuple pada tabel mini. `VACUUM FULL` dianggap operasi berisiko karena lock/rewrite dan tidak boleh dijalankan otomatis di production.

### 7. Capacity policy

Review kapasitas minimal bulanan ketika platform aktif tumbuh. Catat:

- logical database size;
- top table growth;
- top index growth;
- dead tuples/bloat;
- query latency;
- lock/stall incidents;
- storage/compute utilization;
- backup/restore readiness.

## Backup and recovery boundary

P7 sebelumnya sudah mendokumentasikan keterbatasan snapshot pada plan Neon saat ini. P8 tidak mengubah atau mereset branch database. Recovery drill tetap harus menggunakan snapshot/branch mechanism yang tersedia tanpa eksperimen destruktif pada branch production.

## Production read-only certification

P8 menambahkan production scale probe yang tidak melakukan mutation. Probe menguji:

- public products pagination;
- public stores pagination;
- deterministic uniqueness antar page;
- bounded page size;
- health contract;
- API latency ceiling;
- absence of 5xx/429 pada probe;
- no mutation method.

P8 juga mempertahankan P7 launch gate sebagai regression layer.

## Operational decision from this audit

Tidak ada schema migration/index mutation yang dibutuhkan saat ini. Ini keputusan teknis, bukan pekerjaan yang dilewatkan. Database saat ini kecil, tidak mengalami long-running query atau lock contention, dan bloat absolut rendah. Menambah atau membuang index sekarang hanya untuk terlihat “sibuk” justru akan menurunkan kualitas engineering.

Prioritas setelah P8 adalah menjaga guardrail, mengumpulkan workload yang lebih representatif, lalu melakukan query tuning hanya ketika data dan evidence memang menuntutnya.

## P8 exit criteria

P8 dinyatakan complete ketika:

1. production database diagnostics selesai secara read-only;
2. tidak ada destructive/unverified schema change;
3. database scale policy terdokumentasi;
4. static scale validator masuk canonical CI;
5. production cursor/latency probe hijau;
6. P7 production regression tetap hijau;
7. deterministic runtime build tetap bersih;
8. exact Cloudflare deployment untuk final P8 commit berhasil.
