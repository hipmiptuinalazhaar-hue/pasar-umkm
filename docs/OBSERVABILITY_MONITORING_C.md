# Production Hardening C — Observability & Monitoring

## Tujuan

Bagian C membuat kegagalan production dapat ditelusuri tanpa menyimpan data sensitif ke log. Cloudflare Workers tetap menjadi runtime owner, sedangkan `src/observability.js` menjadi satu-satunya owner untuk request-lifecycle telemetry.

Observability **bukan** analytics pengguna. Sistem ini tidak dirancang untuk melacak perilaku personal, isi percakapan, payload checkout, atau identitas pengguna.

## Arsitektur

```text
API request
   │
   ▼
src/worker-entry.js
   │
   ▼
observeRequest(...)
   │
   ├─ generate internal request_id
   ├─ classify safe route family
   ├─ measure server duration
   ├─ dispatch existing API owners
   ├─ inspect HTTP status + safe backend error code
   ├─ emit structured Cloudflare log when policy requires
   └─ return X-Request-Id + Server-Timing
```

Seluruh API owner lama tetap utuh. Observability membungkus router, bukan membuat router kedua.

## Structured event contract

Event server berbentuk satu JSON object per log line dengan field stabil:

| Field | Makna |
| --- | --- |
| `ts` | UTC timestamp event |
| `event` | jenis event terstandar |
| `level` | `info`, `warn`, atau `error` |
| `service` | selalu `pasar-umkm` |
| `request_id` | UUID internal per invocation |
| `cf_ray` | Cloudflare Ray ID bila tersedia |
| `colo` | Cloudflare data-center code bila tersedia |
| `method` | HTTP method |
| `route` | route family yang sudah disanitasi |
| `status` | HTTP status |
| `duration_ms` | waktu aplikasi di Worker |
| `outcome` | `success` atau `error` |
| `error_code` | kode backend terkontrol atau fallback `HTTP_<status>` |
| `error_class` | hanya untuk unhandled exception; nama class, bukan message/stack |

Event classes:

- `api.request.completed`
- `api.request.slow`
- `api.request.failed`
- `api.request.exception`
- `api.rate_limited`
- `api.auth.denied`

## Privacy boundary

Telemetry **tidak boleh** mencatat:

- raw URL path dengan identifier dinamis;
- query string;
- request/response body;
- email, username, nomor telepon, alamat;
- cookie atau session token;
- Authorization header;
- User-Agent mentah;
- IP address mentah maupun hash baru khusus observability;
- error message atau stack trace yang dapat membawa payload/query/data pengguna.

Dynamic URL dipetakan ke route family, misalnya `/api/commerce/orders/*`, bukan order UUID aktual.

Admin audit trail di PostgreSQL tetap menjadi owner untuk kejadian privileged yang membutuhkan persistence. Structured Worker logs tidak menggantikan `admin_audit_logs`.

## Sampling policy

Kebijakan default:

- HTTP 5xx: **100%**
- HTTP 429: **100%**
- slow request: **100%**
- auth endpoint 401/403: **100%**
- error HTTP lain: **25%**
- successful request: **10%**

Nilai dapat dituning lewat Worker environment tanpa perubahan kode:

- `OBSERVABILITY_SUCCESS_SAMPLE_RATE` → `0..1`
- `OBSERVABILITY_CLIENT_ERROR_SAMPLE_RATE` → `0..1`
- `OBSERVABILITY_SLOW_REQUEST_MS` → `250..30000`, default `1500`

Jangan menaikkan sampling ke 100% secara permanen hanya karena dashboard terlihat lebih ramai. Volume log bukan sinonim observability.

## Request correlation

Setiap response Worker membawa:

```text
X-Request-Id: <internal UUID>
Server-Timing: app;dur=<milliseconds>
```

Saat bug dilaporkan, `X-Request-Id` adalah correlation key utama untuk mencari event server terkait. `CF-Ray` menjadi correlation key kedua untuk Cloudflare infrastructure.

Request ID selalu dibuat server-side. Nilai `X-Request-Id` dari client tidak dipercaya sebagai correlation identity.

## Failure coverage

### Endpoint failure

`status >= 500` menghasilkan `api.request.failed` dan selalu dicatat.

### Unhandled exception

Exception yang lolos dari API owner ditangkap boundary terluar, dicatat sebagai `api.request.exception`, lalu response menjadi generic `INTERNAL_ERROR` tanpa membocorkan exception detail.

### Authentication failure

401/403 dari `/api/auth/*` dan `/api/admin/auth/*` menghasilkan `api.auth.denied` dan dicatat 100%.

### Rate limit

HTTP 429 menghasilkan `api.rate_limited` dan dicatat 100%.

### Slow request

Request melewati threshold menghasilkan `api.request.slow` walaupun status akhirnya sukses.

### Commerce, order, chat, upload

Route family mempertahankan cukup konteks untuk filter subsystem tanpa membawa ID pengguna/order/chat. Contoh:

```text
/api/commerce/checkout
/api/commerce/cart/*
/api/commerce/orders/*
/api/chat/media/*
/api/profile/avatar
```

Dengan demikian kegagalan checkout, order, chat media, avatar upload, dan subsystem lain dapat difilter dari event yang sama tanpa telemetry owner kedua.

## Cloudflare operations runbook

Cloudflare Workers Observability sudah diaktifkan di `wrangler.jsonc` dengan invocation logs dan head sampling `1`. Structured application event dari modul ini melengkapi invocation logs tersebut.

Saat insiden:

1. Filter `service = pasar-umkm`.
2. Jika ada laporan pengguna, filter `request_id` terlebih dahulu.
3. Jika tidak ada request ID, filter `event` + `route` + rentang waktu sempit.
4. Periksa `status`, `error_code`, `duration_ms`, `cf_ray`.
5. Untuk aksi admin, korelasikan waktu/request dengan `admin_audit_logs` tanpa menyalin secret/token ke log.
6. Perbaiki owner sebenarnya. Jangan menambal observability agar error terlihat hilang.

## Recommended production alert thresholds

Threshold awal untuk volume saat ini:

| Signal | Investigasi ketika |
| --- | --- |
| Health | satu `HEALTH_DATABASE_ERROR` / `SCHEMA_NOT_READY` |
| Global 5xx | >2% request selama 5 menit |
| Checkout 5xx | >=3 dalam 5 menit |
| Checkout latency | p95 >2500 ms selama 10 menit |
| Upload/media 5xx | >5% selama 15 menit |
| Admin auth rate limit | >=5 event dalam 10 menit |
| General slow requests | >10% selama 10 menit |

Threshold adalah runbook awal, bukan SLA formal. Setelah traffic nyata cukup besar, baseline harus dihitung dari data production dan threshold disesuaikan.

## Database observability

Bagian C tidak membuat tabel telemetry baru. Alasannya:

1. Cloudflare sudah menjadi owner invocation/application logs.
2. PostgreSQL tidak boleh berubah menjadi tempat pembuangan log request berfrekuensi tinggi.
3. Admin security persistence sudah memiliki `admin_audit_logs`.
4. Tidak ada alasan menambah migration hanya agar diagram arsitektur terlihat sibuk.

Neon tetap dipantau lewat health endpoint, query failure yang menjadi HTTP 5xx, migration readiness, dan tooling/logs Neon saat investigasi insiden.

## Operational SLO draft

Untuk fase v1 stable, target engineering internal:

- health endpoint availability >= 99.9%;
- API server error rate < 1% pada window 15 menit;
- checkout server error rate < 0.5%;
- p95 API duration < 1500 ms untuk endpoint non-upload;
- setiap 5xx memiliki request correlation ID;
- tidak ada raw secret/PII pada structured telemetry.

Ini adalah engineering target untuk release readiness, bukan janji komersial kepada publik.

## Guardrail

`node scripts/validate-observability-c.mjs` memastikan:

- observability Cloudflare tetap aktif;
- Worker selalu melewati observability boundary;
- correlation headers tetap ada;
- 5xx/429/slow/auth-denied always-log policy tetap ada;
- raw query/body/cookie/IP/User-Agent tidak masuk ke telemetry owner;
- error message/stack tidak masuk structured event;
- route fallback tetap teredaksi;
- syntax dan runtime build tetap reproducible.

## Status

Bagian C dianggap code-complete ketika dedicated validator dan seluruh existing CI hijau pada PR. Merge ke `main` dan production deploy tetap membutuhkan perintah eksplisit owner sesuai release rule proyek.
