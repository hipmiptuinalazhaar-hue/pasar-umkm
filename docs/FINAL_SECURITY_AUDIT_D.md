# Production Hardening D — Final Security Audit

## Tujuan

Bagian D melakukan audit adversarial terhadap boundary keamanan Pasar UMKM sebelum release-readiness. Fokusnya bukan menambah "fitur security" kosmetik, tetapi memastikan authority, identity, ownership, session, origin, media, dan privileged administration benar-benar terpisah dan fail-closed.

## Temuan utama

Audit menemukan dua gap arsitektural yang perlu diperbaiki:

1. **API write belum memiliki same-origin/fetch-metadata guard terpusat.** Beberapa admin handler sudah memiliki pemeriksaan origin sendiri, tetapi public social-commerce mutation masih bergantung terutama pada cookie `SameSite` dan ownership backend.
2. **Enum public `users.role` masih memiliki nilai historis `admin`.** Production saat audit tidak memiliki public user dengan role tersebut, tetapi model data tetap memungkinkan privileged-looking identity berada pada domain public. Ini bertentangan dengan arsitektur admin terisolasi yang sekarang menggunakan `admin_accounts` + RBAC + MFA.

## Perbaikan D

### 1. Central API write-origin boundary

`src/request-security.js` menjadi owner tunggal untuk request-boundary security sebelum rate-limit/router API.

Untuk `POST`, `PUT`, `PATCH`, dan `DELETE` di `/api/*`:

- `Origin` yang tersedia harus sama persis dengan origin aplikasi;
- `Sec-Fetch-Site` yang tersedia hanya boleh `same-origin` atau `none`;
- `cross-site` dan `same-site` browser writes ditolak;
- request non-browser yang tidak mengirim browser metadata tetap diperbolehkan agar CLI, CI, dan trusted operational tooling tidak rusak;
- public legacy admin routes `/api/commerce/admin*` selalu ditolak.

Boundary berjalan **sebelum** rate-limit dan seluruh API owner, sehingga tidak ada mutation owner yang perlu membuat implementasi CSRF sendiri.

### 2. Public/admin identity isolation di database

Migration `2026-09-05-final-security-hardening.sql` menambahkan constraint:

```sql
CHECK (role IN ('buyer'::user_role, 'seller'::user_role))
```

Enum `user_role` historis tidak direcreate karena penghapusan enum value adalah migration berisiko lebih tinggi dan tidak diperlukan untuk enforcement. Constraint database membuat `admin` mustahil dipersist ke `users.role` setelah migration diterapkan.

Preflight migration fail-closed bila:

- `users`, `admin_accounts`, atau `schema_migrations` belum siap;
- satu saja public user masih memiliki `role = 'admin'`.

Production preflight pada saat audit:

- public admin users: **0**;
- privileged `admin_accounts`: **1**;
- role-isolation constraint sebelum migration: **belum ada**.

### 3. Public-owner bypass cleanup

Active public owners yang mudah disentuh tanpa mengubah arsitektur dibersihkan:

- `comment-api.js`: penghapusan komentar hanya oleh pemilik komentar;
- `store-management-api.js`: pengelolaan toko hanya untuk public role `seller` yang memiliki toko tersebut.

Legacy compatibility code yang masih menyebut public `admin` tidak dipakai sebagai authority setelah migration D. Endpoint public-admin lama juga diblokir pada outer request boundary. Pembersihan historis source yang tersisa dapat dilakukan pada Bagian E technical-debt cleanup tanpa menurunkan security invariant.

## Audit matrix

| Boundary | Status | Bukti arsitektur |
| --- | --- | --- |
| Public → admin privilege escalation | PASS setelah migration D | `users.role` buyer/seller-only; admin berada di `admin_accounts` |
| Admin route protection | PASS | isolated admin cookie/session domain |
| RBAC enforcement | PASS | permissions berasal dari DB grants; tidak ada super-admin bypass |
| Sensitive admin step-up | PASS | permission sensitive membutuhkan fresh MFA step-up |
| MFA login bypass | PASS | password success tidak memberi privileged session saat MFA required |
| Session fixation | PASS | session token dibuat server-side dengan CSPRNG dan token hash disimpan di DB |
| Revoked/expired admin session | PASS | revocation, absolute expiry, idle expiry, security-version mismatch diperiksa server-side |
| CSRF / cross-origin write | FIXED D | centralized Origin + Fetch Metadata guard |
| Cart IDOR | PASS | cart selalu di-resolve dari authenticated user |
| Order IDOR | PASS | buyer/store-owner relationship diperiksa server-side |
| Store mutation IDOR | PASS | store di-resolve dari authenticated owner ID |
| Rating IDOR | PASS | order harus dimiliki buyer sebelum rating |
| Comment deletion IDOR | FIXED D | owner-only pada active comment owner |
| Chat conversation IDOR | PASS | conversation membership diwajibkan |
| Delete message for everyone | PASS | hanya sender yang boleh menghapus untuk semua |
| Chat media ownership | PASS | folder/URL dikaitkan ke conversation + uploader dan diverifikasi server-side |
| Avatar media ownership | PASS | folder/URL dikaitkan ke authenticated user dan signature/file signature diverifikasi |
| Upload MIME spoofing | PASS | signature bytes diperiksa untuk supported media |
| Secret exposure | PASS | MFA key/TOTP/recovery/password tidak dikembalikan atau dicatat plaintext |
| Admin audit trail | PASS | privileged authorization/security events tersimpan di `admin_audit_logs` |
| Observability privacy | PASS | request telemetry tidak mencatat body, cookies, raw IP, raw UA, query, atau dynamic identifiers |

## Authority model

```text
Public user identity
  users.role = buyer | seller
        │
        ├─ buyer-owned resources
        └─ seller-owned store/resources

Privileged identity
  admin_accounts
        │
        ├─ admin_sessions
        ├─ MFA / recovery / step-up
        ├─ admin_account_roles
        ├─ admin_role_permissions
        └─ admin_audit_logs
```

Tidak ada bridge `users.role = admin` setelah migration D.

## Request-security decision table

| Request | Result |
| --- | --- |
| GET public API dari browser | allowed |
| POST same-origin | allowed |
| PATCH same-origin | allowed |
| POST `Origin: https://evil.example` | 403 `ORIGIN_REJECTED` |
| POST `Sec-Fetch-Site: cross-site` | 403 `ORIGIN_REJECTED` |
| POST sibling subdomain / `same-site` | 403 `ORIGIN_REJECTED` |
| trusted CLI tanpa Origin/Sec-Fetch-Site | allowed; auth/ownership tetap wajib |
| request ke `/api/commerce/admin*` | 403 `PUBLIC_ADMIN_ROUTE_DISABLED` |

## Database rollout

Migration ini **harus** diterapkan setelah PR D di-merge dan sebelum Bagian D dianggap production-complete. Health endpoint mengekspos:

```text
schema.final_security_migration
schema.final_security_applied
```

Dengan begitu deployment kode yang lupa migration tidak dapat diam-diam dianggap selesai.

## Regression guard

`scripts/validate-final-security-d.mjs` memverifikasi:

- request security terpasang sebelum rate limit/router;
- cross-origin dan fetch-metadata rejection secara executable;
- legacy public-admin route selalu ditolak;
- public owner aktif tidak mempunyai admin bypass;
- migration fail-closed dan buyer/seller-only constraint tetap ada;
- health endpoint mengekspos status migration D;
- admin RBAC tetap tanpa super-admin bypass;
- MFA/session security invariants utama tetap ada;
- chat/profile media ownership guards tetap ada;
- syntax dan runtime build tetap reproducible.

## Batas audit

Bagian D tidak mengklaim pentest eksternal atau formal certification. Ini adalah final application-security hardening untuk v1 release-readiness berdasarkan source, production schema preflight, executable regression contracts, dan existing CI.

## Status

Code dianggap siap merge ketika dedicated security validator dan seluruh existing CI hijau. Production status baru **complete** setelah migration D diterapkan dan `/api/health` melaporkan `final_security_applied: true`.
