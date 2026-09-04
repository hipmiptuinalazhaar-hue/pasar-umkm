# Pasar UMKM Administration Foundation

## Status

Phase 1 foundation only. This phase creates the database/security boundary for internal administration. It does **not** create an admin account, admin login route, admin UI, MFA secret, or production permission grants.

## Architectural decision

Public marketplace identities and privileged administration identities are separate security domains.

- Public identity lives in `users` and authenticates through the existing public session system.
- Privileged identity lives in `admin_accounts` and will authenticate through `admin_sessions`.
- `admin_accounts` intentionally has no foreign key to `users`.
- `admin_sessions` intentionally has no foreign key to public `sessions`.
- A human may own both a public account and an admin account, but compromise of one identity must not implicitly grant access to the other.

The legacy `users.role = 'admin'` enum value remains untouched during this phase to avoid breaking existing backend contracts. New internal administration must not depend on that legacy public role. Removal or migration of legacy role checks requires a later dedicated phase after the new admin authentication path exists.

## Tables

### `admin_accounts`

Internal privileged identities. Stores password hashes only, account security state, MFA requirement state, lock state, and a monotonically increasing `security_version` for future global session invalidation.

### `admin_roles`

Stable role definitions. Human-readable names are separate from machine keys.

### `admin_permissions`

Permission catalogue using `resource.action` keys. Permissions can be marked sensitive for later step-up authentication policy.

### `admin_account_roles`

Many-to-many account/role assignment with grant attribution.

### `admin_role_permissions`

Many-to-many role/permission assignment with grant attribution.

### `admin_sessions`

Dedicated privileged sessions. Only token hashes are persisted. Sessions carry absolute and idle expiry plus a `security_version` snapshot so credential/privilege security events can invalidate prior sessions.

### `admin_audit_logs`

Append-oriented administrative action history with actor snapshots, outcome, resource, request correlation, hashed network/device hints, and structured metadata. No admin API should expose update/delete operations for this table.

## Hard security contracts

1. Public registration cannot read or write a requested `role`.
2. No public user/session foreign key is allowed inside the new admin identity/session foundation.
3. Admin emails are unique after trim + lowercase normalization.
4. Plaintext password columns are forbidden.
5. Admin session tokens are never stored raw.
6. Admin sessions are separate from public sessions.
7. Permission grants do not exist merely because a role/table exists. No account is privileged until a later explicit bootstrap/RBAC phase.
8. Existing marketplace APIs and database records remain untouched by this migration.

## Phase boundaries

### Phase 1, this PR

- isolated admin schema
- RBAC relation schema
- admin session schema
- audit-log schema
- CI contract protecting the public registration boundary

### Phase 2

Bootstrap the first Super Admin through an explicit internal procedure. No public signup path.

### Phase 3

Implement isolated admin authentication/session lifecycle, rate limiting, logout/revocation, login history, and session security.

### Phase 4

Seed and enforce the permission catalogue and RBAC policy in backend authorization guards.

### Phase 5

Build the mobile-first internal admin application.

### Phase 6

Add MFA, passkeys/WebAuthn, recovery, step-up authentication, device/session management, anomaly detection, and high-risk approval policy.

## Production rule

The migration file may be reviewed and validated in GitHub, but it must not be applied to production Neon ahead of the approved merge/deployment sequence. Database state must not outrun application source control.
