# Pasar UMKM Admin RBAC — Phase 4

## Purpose

Phase 4 establishes server-authoritative role-based access control for the isolated Pasar UMKM administration domain. It does not create admin UI, account-management endpoints, MFA enrollment, or passkeys.

## Non-negotiable security boundary

- Public marketplace `users` and internal `admin_accounts` remain separate identities.
- Browser/client role claims are never trusted.
- Every privileged action must be authorized by a server-side permission check.
- `super_admin` has no application-code bypass. It receives every active permission through explicit `admin_role_permissions` rows.
- Role and permission changes take effect on the next request because authorization resolves active database grants at request time.
- Inactive roles and inactive permissions never authorize an action.
- Missing permission is fail-closed and returns `ADMIN_PERMISSION_DENIED`.
- Permission denial is written to `admin_audit_logs`.
- Permission keys use stable `resource.action` identifiers, never display labels or wildcard `*` grants.

## Canonical roles

### `super_admin`
Platform ownership and emergency administration. Receives every active permission explicitly. No magic bypass exists.

### `moderator`
Marketplace/content safety. Can inspect users/stores and moderate product, post, report, rating, and review surfaces. Cannot manage internal administrator identities or platform configuration.

### `verifier`
UMKM/store verification. Can inspect minimum context necessary for verification and verify eligible stores. Cannot suspend users, manage content, or administer roles.

### `support`
Customer support. Can read users, stores, products, order support context, reports, and reviews and perform non-financial order-support actions. Cannot suspend marketplace identities or manage admin access.

### `operations`
Marketplace lifecycle operations. Can perform selected store/product lifecycle interventions and order/report operations. Cannot create/suspend administrators, assign roles, or manage system configuration.

## Permission catalogue

Phase 4 seeds 31 explicit permissions across these resources:

- `dashboard`
- `users`
- `stores`
- `products`
- `posts`
- `orders`
- `reports`
- `reviews`
- `admin_accounts`
- `roles`
- `audit_logs`
- `system`

Each permission stores an `is_sensitive` signal. This does not weaken current authorization. A later step-up-auth phase can require fresh MFA/passkey confirmation before executing sensitive permissions.

## Server-side contract

Future privileged API owners must call:

```js
const authz = await requireAdminPermission(request, env, "stores.verify");
if (!authz.ok) return authz.response;
```

The route must never replace this with checks such as:

```js
if (body.role === "super_admin") { /* allow */ }
```

or:

```js
if (user.roles.includes("super_admin")) { /* bypass */ }
```

The database grant is the authority.

## Capability endpoint

`GET /api/admin/access/me`

Returns only the authenticated administrator's active roles and active permissions, grouped into capabilities for the future admin interface. It is read-only and `Cache-Control: no-store`.

This endpoint exists so Phase 5 can render navigation/actions from real server capabilities rather than hard-coded role assumptions. The backend still remains authoritative even if the UI hides or shows controls incorrectly.

## Session relationship

Phase 4 reads the isolated admin session cookie defined by Phase 3 and validates:

- session not revoked
- absolute expiry not reached
- idle expiry not reached
- session security version equals account security version
- admin account is active
- password rotation is complete
- MFA is verified whenever the account requires MFA

A valid capability lookup refreshes idle expiry using the Phase 3 idle-timeout policy.

## Migration behavior

`2026-09-05-admin-rbac-permissions.sql` is deterministic for the five canonical system roles:

1. seed/upsert canonical roles;
2. seed/upsert explicit permissions;
3. clear only canonical system-role permission mappings;
4. rebuild canonical mappings from policy;
5. grant all active permissions explicitly to `super_admin`;
6. record the migration ledger entry.

It never:

- creates an administrator account;
- changes the existing Capryan Super Admin account assignment;
- creates a session;
- stores credentials;
- modifies public user/seller roles;
- exposes public registration paths.

## Pasar UMKM 20-rule alignment

Phase 4 deliberately contains no UI, fake statistics, decorative dashboard cards, or duplicated public marketplace controllers. It keeps one authorization policy source, fails closed, preserves public APIs/database contracts, remains additive, and creates the capability contract needed for a mobile-first Phase 5 admin interface.

## Phase boundary

Still out of scope:

- `/admin` dashboard and UI;
- admin account/role management endpoints;
- actual moderation CRUD endpoints;
- MFA enrollment/TOTP verification;
- passkeys/WebAuthn;
- recovery codes;
- step-up authentication for sensitive permissions.
