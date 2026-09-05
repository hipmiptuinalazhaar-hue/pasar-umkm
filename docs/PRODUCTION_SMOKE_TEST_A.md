# Production Smoke Test A

Tanggal: 5 September 2026

Target production:

`https://pasar-umkm.hipmiptuinalazhaar.workers.dev`

## Tujuan

Bagian A memverifikasi bahwa surface produksi utama Pasar UMKM benar-benar dapat dijangkau, kontrak API publik tetap sehat, schema production siap, pagination bekerja sesuai arsitektur, dan boundary autentikasi/ownership gagal tertutup saat request anonim mencoba memasuki surface privat.

Smoke test ini sengaja memisahkan dua kelas pengujian:

1. **Production-safe automated smoke** — boleh berjalan otomatis karena read-only atau sengaja gagal sebelum mutation.
2. **Stateful authenticated smoke** — membutuhkan session user/admin nyata dan dapat mengubah data production; tidak dijalankan otomatis tanpa test identity dan cleanup protocol yang eksplisit.

Ini mengikuti aturan project: jangan membuat data palsu di production hanya demi membuat checklist berubah hijau.

## Automated Production-Safe Matrix

| ID | Area | Probe | Expected |
| --- | --- | --- | --- |
| A-01 | Shell | Public app `/` | 200 + Pasar UMKM marker |
| A-02 | Shell | Admin shell `/admin/` | 200 + admin marker |
| A-03 | Health | `/api/health` | DB connected, core ready, P0/P1 applied |
| A-04 | Catalog | `/api/categories` | 200 + array contract |
| A-05 | Catalog | `/api/stores?limit=24` | bounded cursor page |
| A-06 | Catalog | `/api/products?limit=24` | bounded cursor page |
| A-07 | Catalog | `page=2` legacy pagination | 400 `CURSOR_REQUIRED` |
| A-08 | Catalog | malformed store cursor | 400 `INVALID_CURSOR` |
| A-09 | Social | public profile from active store | 200 |
| A-10 | Social | public followers | 200 |
| A-11 | Social | public following | 200 |
| A-12 | Auth | anonymous `/api/profile` | 401 |
| A-13 | Auth | anonymous `/api/stores/me` | 401 |
| A-14 | Auth | anonymous `/api/products/me` | 401 |
| A-15 | Commerce | anonymous cart | 401 |
| A-16 | Commerce | anonymous saved items | 401 |
| A-17 | Social | anonymous notifications | 401 |
| A-18 | Chat | anonymous conversations | 401 |
| A-19 | Chat | anonymous unread count | 401 |
| A-20 | Admin | anonymous admin session | 401 |
| A-21 | Admin | anonymous admin capabilities | 401 |
| A-22 | Admin | anonymous admin security sessions | 401 |
| A-23 | Auth | invalid registration payload | 400 before DB insert |
| A-24 | Auth | empty login credentials | 400 before authentication |
| A-25 | Ownership | anonymous store creation | 401 before mutation |
| A-26 | Ownership | anonymous product creation | 401 before mutation |
| A-27 | Chat | anonymous conversation creation | 401 before mutation |

## Stateful Authenticated Matrix

Status awal: **not automated on production**.

Flow ini tetap bagian dari Bagian A, tetapi memerlukan identity/session nyata atau disposable test identity dengan cleanup yang disetujui:

- register valid account
- login success
- logout dan login kembali
- edit profile
- upload/replace avatar
- create/edit store
- admin store verification
- create/edit/delete product
- add/update/remove cart item
- checkout
- buyer order list/detail
- seller order list/detail/status lifecycle
- cancellation + restock verification
- rating/review
- post/like/comment/reply
- follow/unfollow
- story/reels interaction
- notification read state
- conversation creation/message/media/mark-read
- admin moderation and privileged session/security actions

Stateful flow tidak akan dianggap PASS hanya karena route-nya ada di source. Ia harus dibuktikan dengan request production dan, untuk flow transaksi, cross-check database state.

## Safety Contract

Automated harness:

- tidak memiliki database credential;
- tidak memiliki user/admin credential;
- tidak mengirim valid registration payload;
- tidak mengirim authenticated mutation;
- tidak mengubah store/product/order/social/chat state;
- menggunakan timeout per request;
- gagal CI jika satu kontrak production-safe tidak terpenuhi.

Sebelum dan sesudah automated smoke, production database row counts dapat dibandingkan sebagai independent guard bahwa probe tidak menambah user/store/product/order/post/chat state.

## Release Rule

Harness mengikuti workflow:

`branch → commit → automated smoke → PR → validation → explicit merge`

Tidak ada merge ke `main` tanpa perintah eksplisit owner.