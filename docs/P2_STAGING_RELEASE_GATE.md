# P2 Staging Authenticated Release Gate

## Purpose

P2 adds a staging-only authenticated release gate for Pasar UMKM. The goal is to prove the real buyer, seller, social, order, rating, notification, and isolated-admin flows before treating a release candidate as production-ready.

The gate is deliberately fail-closed. A stateful smoke run is permitted only when both conditions are true:

1. the runtime health contract reports `environment: staging`; and
2. the connected database reports `staging_database_attested: true` through the presence of the staging-only database marker.

The production hostname is also explicitly rejected by the E2E runner.

## Isolation model

- Neon project: existing Pasar UMKM project.
- Neon branch: `staging-e2e`.
- Staging database: `pasar_umkm_staging`.
- Production database remains separate and is never used as the stateful E2E target.
- The staging database is bootstrapped from a **schema-only** dump. No production rows are copied into the test database.
- Smoke users, seller inventory, and admin identity are synthetic fixtures only.
- Production Cloudflare runtime defaults to `APP_ENV=production` when no explicit environment is supplied.

## Required GitHub Environment secrets

Create/use the GitHub Environment named `staging` and provide these secrets there:

- `STAGING_SCHEMA_SOURCE_URL`: connection string to the schema source on the isolated Neon staging branch. It is used only by `pg_dump --schema-only`.
- `STAGING_DATABASE_URL`: connection string for `pasar_umkm_staging`.
- `SMOKE_BUYER_EMAIL`
- `SMOKE_BUYER_PASSWORD`
- `SMOKE_SELLER_EMAIL`
- `SMOKE_SELLER_PASSWORD`
- `SMOKE_ADMIN_EMAIL`
- `SMOKE_ADMIN_PASSWORD`

No database URL or smoke password belongs in repository files, workflow inputs, logs, or application assets.

## Staging Worker requirements

The staging Worker or preview used by the authenticated test must:

- run the same candidate code as the intended release;
- set `APP_ENV=staging`;
- bind `DATABASE_URL` to `pasar_umkm_staging`;
- use separate non-production upload/media credentials if stateful media testing is later enabled;
- never inherit production database credentials for a stateful E2E run.

`Authenticated Smoke V2` refuses to run mutations when these runtime/database attestations are absent.

## Bootstrap

Run `Staging E2E Bootstrap V2` after the staging environment secrets exist.

The workflow:

1. verifies the target database is exactly `pasar_umkm_staging`;
2. checks whether the core schema already exists;
3. when needed, performs `pg_dump --schema-only --no-owner --no-privileges` from the isolated staging schema source;
4. rejects the dump if a `COPY` or `INSERT INTO` data statement is detected;
5. restores the schema into the blank staging database;
6. seeds deterministic synthetic buyer/seller/admin fixtures using injected secrets;
7. creates the `p2-e2e-isolated` staging database marker;
8. verifies the synthetic identities and attestation.

The bootstrap is idempotent at the fixture layer. Existing schema is not automatically dropped or reset.

## Authenticated E2E coverage

`Authenticated Smoke V2` covers:

### Buyer

- login and session establishment;
- profile read;
- cart mutation using the synthetic product;
- transactional checkout;
- buyer order projection;
- completed-order rating and readback;
- notification/session boundaries;
- explicit logout and session invalidation.

### Seller

- login;
- store workspace;
- seller product workspace;
- seller order projection;
- lifecycle `pending -> confirmed -> processing -> ready -> completed`;
- repeated final-status request to verify idempotent no-op behavior;
- notifications;
- explicit logout.

### Social

- buyer follows synthetic seller;
- direct conversation creation;
- direct message send;
- seller unread-count observation;
- seller message read;
- follow cleanup.

### Admin

Admin remains a separate security domain and is not tested by pretending a public user role is an administrator.

The staging admin flow covers:

- `/api/admin/auth/login`;
- isolated admin session;
- `/api/admin/auth/me`;
- `/api/admin/access/me` RBAC resolution;
- `super_admin` role and explicit permission resolution;
- logout and session invalidation.

The synthetic staging admin has `mfa_required=false` solely so automation can establish a deterministic staging session. Production MFA policy, MFA implementation, lockout, audit, and static security validators are unchanged.

## Release candidate policy

A release candidate is considered technically releasable only after:

1. repository syntax/security/platform gates pass;
2. P2 Staging Release Gate V2 static contract passes;
3. staging database bootstrap is healthy;
4. Authenticated Smoke V2 passes against the candidate staging runtime;
5. runtime asset build is reproducible;
6. production anonymous/post-deploy smoke remains green after release;
7. production load smoke remains within its defined thresholds.

Until GitHub branch protection can be enabled with repository administration permission, this is a documented release policy plus CI evidence rather than a server-enforced merge rule.

## Rollback contract

Rollback is intentionally conservative.

### Code/runtime rollback

If a production release fails after merge:

1. identify the last known-good merge commit;
2. revert the bad merge on `main` rather than force-pushing history;
3. allow the existing Cloudflare Git integration to deploy the revert;
4. require Post Deploy Smoke to return 9/9 PASS;
5. run Load Smoke V1 after the rollback deploy;
6. preserve the failed release SHA and CI logs for incident review.

### Database rollback

Database changes are **not** automatically rolled backward during application rollback. Destructive rollback SQL is prohibited as an automatic reaction to a failed deployment.

Schema releases must use backward-compatible/expand-contract changes where possible. If a database correction is required, use a reviewed forward-fix or an explicitly reviewed rollback migration after impact analysis.

### Staging reset

The Neon `staging-e2e` branch/database is disposable test infrastructure, but it must not be deleted automatically. Any branch deletion remains an explicit administrative action.

## Current external blockers

The repository integration cannot administer GitHub branch protection or repository/environment secrets. Therefore:

- `main` branch protection still requires repository-admin configuration;
- staging GitHub secrets must be entered through GitHub settings;
- the staging Cloudflare runtime must receive its own `APP_ENV=staging` and staging `DATABASE_URL` through Cloudflare configuration.

These restrictions are intentionally not bypassed by committing credentials or by testing against production.
