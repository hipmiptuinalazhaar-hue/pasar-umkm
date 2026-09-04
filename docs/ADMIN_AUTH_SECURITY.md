# Admin Phase 3 — Authentication & Session Security

## Scope

Phase 3 owns privileged authentication only. It does not create the admin dashboard, permission catalogue, or MFA enrollment UI.

The privileged identity boundary remains separate from the public marketplace:

- public identity: `users` + `sessions` + `__Host-pasar_umkm_session`
- admin identity: `admin_accounts` + `admin_sessions` + `__Host-pasar_umkm_admin`

No admin authentication route may depend on a public `users` or `sessions` row.

## Endpoints

### `POST /api/admin/auth/login`

Verifies the admin email/password against `admin_accounts`.

The endpoint fails closed when any of the following applies:

- invalid credentials
- account is suspended/disabled/locked
- temporary account lock is active
- bootstrap password still requires rotation
- account still needs MFA enrollment
- MFA is required but no verified MFA state exists

A privileged session is created only for an `active` account that has completed all required credential gates. Phase 3 deliberately does not bypass MFA while Phase 6 is still pending.

### `POST /api/admin/auth/rotate-password`

Rotates the one-time bootstrap credential before normal privileged use.

Contract:

- current credential must be valid
- replacement password must be 14–72 UTF-8 bytes
- replacement must differ from the current password
- bcrypt/`pgcrypto crypt()` remains cost 12
- `must_rotate_password` becomes false
- `password_changed_at` is written
- `security_version` increments
- any existing admin sessions are invalidated
- the action is audit logged

After rotation, an account with `mfa_required = true` is still not activated. It proceeds to the future MFA enrollment phase.

### `GET /api/admin/auth/me`

Validates the dedicated admin session and returns only the current privileged identity, active role names, and bounded session metadata.

Session validation requires:

- token hash match
- session not revoked
- absolute expiry valid
- idle expiry valid
- session `security_version` equals current account `security_version`
- account status is active
- password rotation is complete
- required MFA was verified for the session

Idle expiry is refreshed at most once every five minutes to avoid unnecessary database writes.

### `POST /api/admin/auth/logout`

Revokes the current admin session and clears the admin cookie. The operation is idempotent.

### `POST /api/admin/auth/revoke-all`

Invalidates all privileged sessions for the current admin by:

1. incrementing `admin_accounts.security_version`
2. revoking all active `admin_sessions`
3. writing an audit event
4. clearing the current admin cookie

The security-version increment is the primary fail-closed boundary even if a later cleanup write were interrupted.

## Session policy

- token entropy: 256 bits
- token persistence: SHA-256 hash only
- cookie: `__Host-pasar_umkm_admin`
- cookie flags: `HttpOnly; Secure; SameSite=Strict; Path=/`
- absolute session lifetime: 8 hours
- idle timeout: 30 minutes
- idle-touch write interval: 5 minutes
- raw IP addresses are not persisted
- IP and User-Agent signals are SHA-256 hashed before storage/audit

## Login abuse policy

Application-layer rate limits:

- admin login: 5 requests / 15 minutes per IP and account hint
- bootstrap password rotation: 5 requests / 30 minutes per IP and account hint
- session write actions: 30 requests / 10 minutes per IP and admin session hint

The database also keeps a durable account-level safeguard. Ten consecutive failed password attempts lock the account for 15 minutes.

The in-memory Worker limiter remains a soft first layer because Worker isolates are not globally shared. A Cloudflare-native/global rate-limit layer remains the correct later production hardening step. The database lock prevents the admin account itself from relying solely on isolate-local state.

## Audit policy

The following actions are written to `admin_audit_logs`:

- `admin.login`
- `admin.password.rotate`
- `admin.logout`
- `admin.sessions.revoke_all`

Audit metadata must never contain passwords, raw session tokens, raw IP addresses, MFA secrets, or recovery codes.

## Runtime ownership

`handleAdminAuthApi()` executes after the central rate limiter but before unrelated public feature infrastructure verification.

This is intentional: a schema/runtime problem in social, chat, notification, comments, ratings, or catalog features must not become an availability dependency for privileged authentication.

## Explicitly out of scope

Phase 3 does not add:

- `/admin` dashboard UI
- MFA secret generation or enrollment
- TOTP verification
- WebAuthn/passkeys
- recovery codes
- permission catalogue or permission enforcement
- moderator/support/verifier roles

Those remain owned by later phases. Phase 3 exposes MFA-required states but does not weaken or bypass them.
