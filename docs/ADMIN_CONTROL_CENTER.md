# Admin Phase 5 — Control Center

## Purpose

Phase 5 turns the privileged administration foundation into a real internal product surface. It is intentionally separate from the public marketplace UI and remains governed by the existing admin authentication and RBAC boundaries.

This phase does **not** weaken the Phase 3 MFA fail-closed rule. Until MFA enrollment/verification exists, the current Super Admin cannot receive a privileged production session and therefore cannot reach protected Control Center data.

## Product contract

The Control Center follows the Pasar UMKM 20-rule engineering/product constitution:

1. Mobile-first from 360px, then 390/430, tablet, desktop.
2. Premium restrained visual hierarchy, not decorative dashboard noise.
3. No fake metrics, mock queues, or invented operational data.
4. Internal Pasar UMKM identity, not a marketplace-admin clone.
5. Dedicated admin design system in `css/admin-control.css`.
6. 44px touch targets, 16px mobile inputs, focus-visible support.
7. Login, lists, mutations, pagination, and errors all expose explicit UI states.
8. Confirmation bottom sheet is used only for quick privileged actions; desktop promotes it to a dialog.
9. One owner per feature: auth gate, control shell, data API, records, overview.
10. No legacy admin patch layer is introduced.
11. Dashboard logic is lazy-loaded only after authenticated intent; overview/records are route-lazy-loaded.
12. Existing marketplace backend contracts remain intact; Phase 5 adds isolated admin APIs.
13. Static assets use versioned URLs; admin HTML is no-store.
14. A permanent Admin Control Center CI gate validates security, accessibility, performance, and ownership contracts.
15. CI budgets are explicit and are not raised to hide regressions.
16. Branch → PR → validation → merge only after explicit owner instruction.
17. API fields, role permissions, routes, cursor pagination, and build are validated before completion.
18. Phase 5 does not implement MFA/passkeys or unrelated public features.
19. List APIs use bounded keyset pagination and supporting indexes.
20. The result is simple, mobile-first, consistent, fast, accessible, functional, scalable, and anti-AI-slop.

## Static surface

Entry point:

- `/admin/`

Static files:

- `admin/index.html`
- `css/admin-control.css`
- `js/admin/api.js`
- `js/admin/app.js`
- `js/admin/control.js`
- `js/admin/overview.js`
- `js/admin/records.js`

### Static security

`/admin` and `/admin/*` are hardened with:

- `Cache-Control: no-store`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- disabled camera/microphone/geolocation
- CSP with `default-src 'self'`
- `frame-ancestors 'none'`
- no inline script or style blocks
- `noindex,nofollow,noarchive`

## Authentication states

The document supports four explicit states:

1. Loading session state.
2. Admin login.
3. Mandatory bootstrap password rotation.
4. MFA-required security gate.
5. Authenticated Control Center, once a valid privileged session exists.

The page does not emulate or bypass MFA.

## Capability-driven navigation

Navigation is derived from `GET /api/admin/access/me` and is never hard-coded from a role string.

Available modules are shown only when the session has the corresponding active DB permission:

| Module | Permission |
| --- | --- |
| Overview | `dashboard.view` |
| Users | `users.view` |
| Stores | `stores.view` |
| Products | `products.view` |
| Social Posts | `posts.view` |
| Orders | `orders.view` |
| Reviews | `reviews.view` |
| Audit | `audit_logs.view` |
| Admin Access | `admin_accounts.view` |

`Reports` is intentionally not rendered because production currently has no canonical reports data source. The overview exposes whether `moderation_reports` exists instead of inventing report metrics.

## Control API

All endpoints run before unrelated public feature bootstraps.

Read endpoints:

- `GET /api/admin/control/overview`
- `GET /api/admin/control/users`
- `GET /api/admin/control/stores`
- `GET /api/admin/control/products`
- `GET /api/admin/control/posts`
- `GET /api/admin/control/orders`
- `GET /api/admin/control/reviews`
- `GET /api/admin/control/audit`
- `GET /api/admin/control/admins`

Mutation endpoints:

- `PATCH /api/admin/control/users/:id/status`
- `PATCH /api/admin/control/stores/:id/action`
- `PATCH /api/admin/control/products/:id/status`
- `PATCH /api/admin/control/posts/:id/status`

Every endpoint performs server-side permission checks. Client-side capability hiding is only a UX optimization and is never the security boundary.

## Mutation safety

Privileged writes require:

- valid admin session
- explicit RBAC permission
- same-origin request
- bounded request body
- reason between 8 and 300 characters
- actual state transition, otherwise `NO_STATE_CHANGE`
- audit log entry

User suspension also deletes public `sessions` rows for that user to revoke active marketplace sessions immediately.

No destructive hard-delete operation is introduced in this phase.

## Privacy minimization

List APIs intentionally omit data that is not necessary for operational overview:

- no password hashes
- no order delivery addresses
- no customer phone numbers
- no admin IP hashes in audit list
- no admin User-Agent hashes in audit list

Sensitive detail views can be designed separately with narrower permissions and stronger step-up requirements if needed.

## Pagination and performance

All large list endpoints use a bounded keyset cursor based on:

`(created_at DESC, id DESC)`

No `OFFSET` pagination is permitted.

Phase 5 adds indexes for:

- users
- stores
- products
- posts
- orders
- store ratings
- product ratings
- admin audit logs
- admin accounts

Migration:

`database/migrations/2026-09-05-admin-control-center-indexes.sql`

Default page size: 24.

Maximum page size: 50.

## Rate limits

- Control reads: 180 requests/minute per IP + admin-session hint.
- Control writes: 30 requests/10 minutes per IP + admin-session hint.

These remain an application-layer soft guard. The earlier P0 recommendation for Cloudflare-native/distributed rate limiting remains valid for global enforcement.

## Phase 6 dependency

Phase 5 is intentionally compatible with the existing fail-closed authentication behavior. The next security phase must provide real MFA enrollment/challenge verification before the current `mfa_required = true` Super Admin can obtain a privileged session.

Phase 6 candidates:

- TOTP enrollment + verification
- encrypted MFA secret handling
- recovery codes
- step-up freshness for sensitive permissions
- passkeys/WebAuthn
- trusted-session/device controls

No Phase 6 shortcut belongs in Phase 5.
