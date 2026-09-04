# Pasar UMKM Admin Phase 2 — Super Admin Bootstrap

## Purpose

Phase 2 creates the first privileged platform owner without collapsing the security boundary between public marketplace users and internal administration identities.

Public account and admin account may belong to the same human and may use the same email address, but they remain separate database identities, password hashes, sessions, and authorization domains.

## Phase 2 contract

1. `super_admin` is a canonical system role.
2. No permission catalogue is seeded in this phase. Phase 4 owns RBAC permissions.
3. No admin session is created during bootstrap.
4. No admin login route is added during bootstrap.
5. Bootstrap credentials never enter Git history, migration files, CI logs, audit metadata, or application logs.
6. A newly bootstrapped account stays `pending_activation`.
7. `mfa_required` remains `TRUE`.
8. `must_rotate_password` remains `TRUE` until the future activation flow successfully changes the bootstrap password.
9. The bootstrap operation is idempotent by normalized admin email and role assignment.
10. Bootstrap creation must be written to `admin_audit_logs` without storing secrets.

## Production sequence

### A. Apply the Phase 2 policy migration

Apply:

`database/migrations/2026-09-05-admin-bootstrap-policy.sql`

Verify:

- migration `2026-09-05-admin-bootstrap-policy` exists in `schema_migrations`
- role `super_admin` exists and is both `is_system = TRUE` and `is_active = TRUE`
- `admin_accounts.must_rotate_password` exists and defaults to `TRUE`
- `admin_accounts.password_changed_at` exists

### B. Generate bootstrap credential outside source control

Generate a high-entropy temporary credential at execution time. Never commit it. Never reuse the public marketplace password.

The credential exists only to establish the first admin identity. Phase 3 must force a rotation before normal privileged operation.

### C. Create the isolated admin account

Run the bootstrap as one database transaction using runtime-supplied values for:

- `<ADMIN_NAME>`
- `<ADMIN_EMAIL>`
- `<TEMPORARY_PASSWORD>`

Required account state after creation:

- `status = 'pending_activation'`
- `mfa_required = TRUE`
- `must_rotate_password = TRUE`
- `password_changed_at IS NULL`
- password stored only as a bcrypt hash

The transaction must then assign the account to `super_admin` and append a successful `admin.bootstrap` audit record.

### D. Verification

Before Phase 2 is considered complete, verify:

- exactly one target admin identity exists for the normalized email
- the account has exactly one `super_admin` assignment
- no admin session exists for the new account
- the account remains pending activation
- MFA is still required
- password rotation is still required
- an `admin.bootstrap` audit event exists
- public `users` and public `sessions` rows were not modified

## Explicitly out of scope

- admin login endpoint
- admin cookie/session issuance
- MFA enrollment flow
- password rotation endpoint
- permission catalogue
- permission enforcement
- admin dashboard UI

Those belong to later phases. Keeping these boundaries prevents Phase 2 from becoming a convenient excuse to build five systems at once.
