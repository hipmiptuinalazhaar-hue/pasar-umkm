# P6 Operational Marketplace Hardening

## Scope
P6 adds operational trust and case-management primitives without turning Pasar UMKM into a payment intermediary.

### Added operational domains
- Authenticated user reports for user/store/product/post/order subjects.
- Order dispute lifecycle with buyer opening, seller response, and admin review/resolution.
- Store verification submissions with evidence metadata and explicit admin review.
- Append-only marketplace case events for report/dispute/verification timelines.
- Admin operational metrics and queues protected by existing RBAC + step-up policy.
- Trust Center at `/legal/` covering privacy, terms, seller policy, community rules, reports, and disputes.

## Financial boundary
P6 deliberately performs **no fund movement, refund capture, escrow action, payment reversal, or balance mutation**. A dispute resolution is an operational case decision only. Any future financial settlement integration must be implemented as a separate audited payment project.

## RBAC
Existing permissions are reused where possible:
- Reports: `reports.view`, `reports.resolve`
- Store verification: `stores.view`, `stores.verify`
- Audit: existing `admin_audit_logs`

P6 adds:
- `disputes.view`
- `disputes.resolve`

Sensitive admin mutations continue to require fresh step-up authentication through `requireAdminPermission`.

## State machines
### Moderation report
`open -> reviewing -> resolved|dismissed`

### Order dispute
`open -> seller_response|admin_review -> resolved|rejected`

A cancelled order cannot open a new dispute. One order has one dispute record.

### Store verification submission
`pending -> approved|rejected`

Only the store owner can submit verification evidence. Approval updates the store to `verified`; rejection updates it to `rejected`.

## Audit strategy
Privileged admin actions create records in `admin_audit_logs` with request ID plus hashed network/user-agent signals. Report, dispute, and verification lifecycle events are also appended to `marketplace_case_events`.

The event table is intended as a case timeline. It is not a replacement for privileged admin audit logs.

## Migration deployment
Migration: `database/migrations/2026-09-07-p6-operational-marketplace.sql`

Deployment order:
1. Run canonical repository validation.
2. Apply the additive migration to an isolated Neon database and verify tables, indexes, permissions, and migration marker.
3. Apply the exact migration to production before deploying code that requires the schema.
4. Verify `/api/health` reports `schema.p6_applied=true` and `schema.operational_ready=true`.
5. Deploy the Worker candidate.
6. Run exact-SHA Cloudflare attestation, production smoke, P5 browser verification, and public-read load smoke.

The migration is additive. It must not contain `DROP`, `TRUNCATE`, destructive `DELETE`, or bulk mutation of existing marketplace rows.

## Recovery and backup readiness
Before high-risk future migrations:
1. Confirm Neon branch/snapshot capability is available for the production branch.
2. Create a named recovery snapshot or isolated branch when appropriate.
3. Rehearse schema/application compatibility on an isolated database.
4. Never use destructive rollback automatically against production business data.
5. Prefer application rollback by reverting the release commit when the schema remains backward-compatible.

P6 tables are additive, so rollback of application code can leave the new tables in place safely. Do not delete report/dispute/audit history as part of a routine code rollback.

## Analytics semantics
P6 operational metrics include verified/pending stores, active products, 30-day orders/completed orders/GMV, distinct active buyers and sellers, open reports/disputes, verification queue, and recent admin actions.

`order_completion_rate_30d` is derived from order counts. Traffic conversion is explicitly unavailable until trustworthy visitor/session telemetry exists. P6 does not invent a denominator.

## Production-safe verification
Unauthenticated release checks may verify that protected P6 endpoints fail closed with HTTP 401/403 and that `/legal/` is reachable. Automated production checks must not create reports, disputes, verification submissions, users, stores, orders, or admin state.
