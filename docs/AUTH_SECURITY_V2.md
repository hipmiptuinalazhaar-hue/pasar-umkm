# Auth Security V2

Status: implementation complete on feature branch; production rollout is gated by migration + secrets + release validation.

## Product goals

Auth Security V2 upgrades public-account authentication without changing the isolated privileged-admin authentication model.

The release owns:

- verified-email registration using a six-digit one-time code;
- resend cooldown and bounded verification attempts;
- password recovery without account-enumeration responses;
- single-use password-reset token;
- revocation of every existing public session after password reset;
- public-auth security audit events without raw email/IP values;
- dedicated per-route rate limiting;
- production UX for login, registration, email verification, recovery and password reset.

## API contract

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Validate registration, hash password, create registration challenge, send OTP |
| POST | `/api/auth/register/verify` | Verify OTP, create verified user, create session |
| POST | `/api/auth/register/resend` | Rotate registration OTP after cooldown |
| POST | `/api/auth/password/forgot` | Generic recovery request; never reveals account existence |
| POST | `/api/auth/password/verify` | Verify recovery OTP and mint short-lived reset token |
| POST | `/api/auth/password/reset` | Replace password and revoke every previous session |
| POST | `/api/auth/login` | Login verified active users |
| GET | `/api/auth/me` | Resolve current verified session |
| POST | `/api/auth/logout` | Revoke current session |

## Security model

### Registration OTP

- OTP is generated with Web Crypto secure randomness.
- Rejection sampling is used to avoid modulo bias in six-digit generation.
- Plain OTP is never stored in Postgres.
- Stored value is `HMAC-SHA-256(AUTH_OTP_PEPPER, purpose:challenge_id:code)`.
- OTP validity: 10 minutes.
- Maximum verification attempts: 5.
- Resend cooldown: 60 seconds.
- Maximum dedicated resends per registration challenge: 5.
- A resend rotates the code; the previous code stops being authoritative.

### Pending password protection

The registration password is bcrypt-hashed with PostgreSQL `crypt(..., gen_salt('bf', 12))` before it is persisted in the pending challenge. The plaintext password exists only for the duration of the registration-start request and is not returned to the frontend after the challenge is created.

### Password recovery

`/api/auth/password/forgot` always uses the same successful public response for syntactically valid email addresses:

> Jika email tersebut terdaftar, kode pemulihan telah dikirim.

No account identifier or database existence flag is returned. The endpoint also uses a response-duration floor to reduce trivial timing enumeration.

After OTP verification, the server returns a random high-entropy reset token. Postgres stores only the SHA-256 hash of that reset token. The token is short-lived and is cleared/consumed after successful reset.

### Session security

Public sessions continue to use an opaque random token stored only in a `HttpOnly; Secure; SameSite=Lax` cookie. Postgres stores only the SHA-256 token hash.

A successful password reset executes a server-side revocation of every session for the user before the recovery challenge is consumed.

### Audit privacy

`user_auth_audit_events` intentionally does not store:

- plaintext OTPs;
- passwords;
- reset tokens;
- raw email addresses;
- raw IP addresses;
- request bodies.

Email and IP hints are SHA-256 hashed for security correlation. Request IDs may be retained for operational tracing.

## Database migration

Migration:

`database/migrations/2026-09-08-auth-security-v2.sql`

Adds:

- `users.email_verified_at`;
- `users.password_changed_at`;
- `user_auth_challenges`;
- `user_auth_audit_events`;
- supporting indexes;
- migration marker `2026-09-08-auth-security-v2`.

Existing accounts are backfilled as verified because they pre-date mandatory email verification. This prevents an Auth V2 rollout from locking out legitimate existing users.

### Neon rehearsal evidence

The migration was rehearsed against an isolated Neon branch cloned from production database `pasar_umkm_app`.

Rehearsal assertions:

- 11 existing users remained accessible and verified;
- 11/11 had `email_verified = TRUE` and non-null `email_verified_at` after the rehearsal;
- both new user columns existed;
- `user_auth_challenges` existed;
- `user_auth_audit_events` existed;
- the Auth V2 migration marker existed.

No production database mutation is implied by this rehearsal.

## Required production secrets

The following Cloudflare Worker secrets/config are required before enabling the feature in production:

- `RESEND_API_KEY`: Resend key restricted to sending email when possible;
- `AUTH_OTP_PEPPER`: random secret with at least 32 characters; never reuse a password or database credential;
- `AUTH_FROM_EMAIL`: verified sender address/domain;
- `AUTH_FROM_NAME`: optional sender display name, default `Pasar UMKM`.

Do not store these values in Git, frontend JavaScript, migration files, screenshots, logs or documentation.

## Email transport

`src/auth-email.js` talks to the Resend REST API directly from Cloudflare Workers. No new runtime package is required.

Email requests use an idempotency key so accidental request retries do not intentionally create duplicate transactional messages for the same challenge generation.

## Frontend owner

`js/auth-security-v2.js` owns public Auth V2 presentation and flow state. It is loaded by the existing production commerce integration owner rather than adding more logic to the already-large legacy `app.js`.

The experience includes:

- login/register tabs;
- `Lupa kata sandi?` entry point;
- accessible `autocomplete="one-time-code"` OTP input;
- resend countdown;
- loading/error/success states;
- password visibility control;
- password-strength guidance;
- confirmation match on password reset;
- automatic authenticated session after successful email-verified registration;
- explicit re-login after password reset.

## Rate-limit policy

Auth V2 has isolated rules for:

- login;
- registration start;
- registration verification;
- registration resend;
- forgot-password request;
- recovery-code verification;
- password reset.

Keys combine a hashed client address with a hashed account/challenge hint where available. Existing Cloudflare edge rate-limit bindings remain the first enforcement layer when configured; the Worker-local limiter remains a fallback.

## Release gate

Workflow: `.github/workflows/auth-security-v2.yml`

Validator: `scripts/validate-auth-security-v2.mjs`

The validator checks syntax plus Auth V2 ownership/security contracts, including:

- required routes;
- HMAC pepper usage;
- constant-time OTP comparison;
- secure randomness;
- expiry/attempt limits;
- session revocation;
- generic recovery messaging;
- audit ownership;
- Resend transport and idempotency;
- no hard-coded provider key;
- no plaintext OTP database column;
- frontend OTP/recovery routes;
- production runtime loader;
- rate-limit ownership.

## Production rollout order

1. CI must be green on the exact PR head SHA.
2. Configure a verified email-sending domain/address in Resend.
3. Configure Cloudflare Worker secrets listed above.
4. Apply the rehearsed migration to `pasar_umkm_app` only after explicit release approval.
5. Merge/deploy the exact validated GitHub SHA.
6. Run a controlled registration test with a new test email.
7. Verify email arrival, OTP expiry, invalid-attempt handling and resend cooldown.
8. Run forgot-password through reset and confirm all pre-reset sessions are invalidated.
9. Check audit events and ensure no OTP/password/reset token/raw email/raw IP is present.
10. Run public-auth regression plus the existing production smoke suite.

## Explicit non-goals

This change does not replace the isolated privileged-admin identity/MFA system. It also does not add social login, passkeys, SMS OTP, platform wallet or payment identity. Those belong to separate release contracts.
