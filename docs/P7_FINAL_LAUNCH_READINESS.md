# P7 Final Launch Readiness & Operational Hardening

## Scope

P7 is the final operational gate before P8 commerce finalization. It does not redesign the product and does not mutate production commerce data. The objective is to prove that the currently deployed application can be released, observed, rolled back, triaged, and recovered with an explicit production procedure.

This document intentionally uses the name **P7 Final Launch Readiness** to distinguish this roadmap phase from the older repository phase `P7_LAUNCH_GROWTH`.

## Release gate

A production release is eligible only when all of the following are true:

1. canonical repository validation passes;
2. deterministic runtime build produces no tracked-file drift;
3. exact Cloudflare deployment for the current Git SHA succeeds;
4. post-deploy HTTP smoke passes;
5. P6 reliability probe passes;
6. P7 production launch probe passes;
7. real Chrome viewport matrix passes;
8. critical browser surfaces pass;
9. read-only load smoke passes;
10. production health reports the required database/schema capabilities ready;
11. private surfaces keep `no-store` and `noindex` behavior;
12. auth/admin/support boundaries remain fail-closed.

No release should be called successful before the production gate for the same commit SHA is green.

## Production health criteria

The P7 production gate expects:

- homepage, robots and sitemap available;
- `/api/health` status 200 and database connected;
- core schema ready;
- operational schema ready;
- launch schema ready;
- commerce schema ready;
- structured payment profile ready;
- customer support schema ready;
- unknown API routes fail with 404 rather than leaking assets;
- anonymous private APIs fail closed;
- `X-Request-Id` correlation is present on API responses;
- `Server-Timing` application latency is present on API responses;
- HSTS and content sniffing protection remain present.

## Incident severity

### SEV-1

Use for total outage, persistent 5xx on checkout/auth, database unavailability, privilege escalation, confirmed data exposure, or corruption risk.

Actions:

1. stop further release activity;
2. record failing request IDs and exact deployed SHA;
3. inspect Cloudflare Worker logs and Neon health;
4. if regression is release-related, roll back application code first;
5. do not run destructive database recovery while the cause is unknown;
6. preserve audit/support/order evidence;
7. verify recovery with P7 production launch probe and real-browser gate.

### SEV-2

Use for a critical feature partially unavailable without known corruption or data exposure, such as seller dashboard, chat, notifications, support or search.

Actions: isolate affected route, inspect error rate/latency, disable only the unsafe release path when possible, and avoid database mutation unless a reviewed migration is the identified cause.

### SEV-3

Use for degraded UX, non-critical visual regressions, isolated 4xx anomalies, or minor performance degradation. Fix through the normal release gate.

## Application rollback procedure

1. Identify the last known-good Git commit and Cloudflare deployment.
2. Confirm the incident started after the candidate release.
3. Revert only the regression-causing code. Never overwrite unrelated work.
4. Let Cloudflare deploy the rollback commit.
5. Require the exact-deploy attestation for the rollback SHA.
6. Run post-deploy smoke, P6 reliability probe and P7 production launch probe.
7. Run real-browser certification for UI-affecting incidents.
8. Record the rollback SHA, reason, time and observed recovery.

A rollback is not considered complete just because Cloudflare reports deployment success.

## Database recovery policy

Database recovery is deliberately separated from application rollback.

Current Neon production branch: `production`.

Rules:

- never reset or restore the production branch as the first response to an application regression;
- never delete reports, disputes, orders, support history, audit logs, or marketplace case history to make a release pass;
- prefer additive migrations and forward fixes;
- before any destructive recovery, capture the incident timestamp and verify the recovery point;
- restore to an isolated branch first when a point-in-time/snapshot recovery drill is required;
- validate schema and representative read-only queries on the isolated branch before any production swap;
- a production branch swap/reset requires explicit owner approval.

### Backup posture verified during P7

Neon currently contains a manual production snapshot named `p6-pre-release-2026-09-07`. Attempts during P7 to enable automatic snapshot schedules and create an additional snapshot were rejected by the current Neon plan/limits. This is an external service-plan constraint, not silently treated as a successful backup configuration.

Until the plan permits automated schedules, the existing manual snapshot is the verified recovery anchor. Release operations must not claim automatic backup coverage.

## Data safety boundaries

The P7 certification is read-only against production. It must not:

- create synthetic orders;
- change stock;
- change payment state;
- modify users or admin roles;
- create support tickets;
- mutate seller settings;
- run migrations;
- restore/reset database branches.

## Observability and SLO handoff

P6 remains the owner of telemetry. P7 consumes those contracts as launch blockers.

Operational targets for the certification probe:

- success rate: 100% for deterministic launch probe checks;
- 5xx: 0;
- timeout: 0;
- p95 for launch probe requests: <= 5000 ms;
- anonymous privileged APIs: fail closed;
- correlation headers: present.

These are release-gate thresholds, not a claim about all real-user traffic.

## Post-release verification

Within the same deployment window:

1. verify exact Cloudflare SHA;
2. run production launch probe;
3. run Chrome viewport matrix;
4. verify notification, message, account, seller, cart, Reels and private shells;
5. run read-only load smoke;
6. inspect failures before announcing release completion.

## Go / No-Go

**GO** requires every automated P7 gate to pass for the same current SHA.

**NO-GO** if any release contract, deployment, production probe, real-browser, privacy, security-boundary, reliability or load check fails.

No manual override is documented for a red gate. Fix the cause and rerun.
