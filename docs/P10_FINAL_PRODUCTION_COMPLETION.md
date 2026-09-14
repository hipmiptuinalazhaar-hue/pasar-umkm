# P10 Final Production Completion

Status target: 100% engineering completion for the defined Pasar UMKM production roadmap.

This document defines what "complete" means. It does not claim that software can never develop a future defect. Completion means every agreed engineering layer is implemented, deployed, and passing the available deterministic, production, browser, security, reliability, database, and load gates at the same revision.

## Completion gates

A revision is certified only when all of the following pass:

1. repository-wide syntax and platform validation;
2. P0-P8 regression contracts, including Auth V2, route ownership, security-boundary, and growth-integrity contracts;
3. P9 offensive-security source contract;
4. P10 completion contract;
5. deterministic runtime build with no tracked-source mutation;
6. exact Cloudflare deployment attestation for the tested commit;
7. post-deploy production HTTP smoke;
8. P6 reliability production probe;
9. P7 launch-readiness production probe;
10. P8 database-scale production probe;
11. P9 non-destructive production security probe;
12. Google Chrome real-browser viewport matrix;
13. critical navigation/account/cart/chat/Reels/private-surface browser certification;
14. read-only concurrent load smoke;
15. release evidence that records the tested Git SHA, Cloudflare build/version, production probe results, browser/load results, and migration state.

Cloudflare build success is necessary but is not, by itself, a substitute for the HTTP/browser/load gates above.

## Production invariants

- private APIs fail closed;
- write requests are protected against cross-origin and missing browser provenance when cookie-authenticated;
- admin permissions are database-authoritative with no super-admin bypass;
- sensitive admin actions require fresh step-up authentication;
- checkout remains transactional and stock-safe;
- completed-order analytics are server-authoritative; browser clients cannot assert `order_completed`;
- an unavailable trusted conversion metric is represented as unavailable, not fabricated as 0%;
- media ownership is scoped to the authenticated user/conversation/store;
- uploads are size-, MIME-, and magic-byte validated;
- provider implementation errors are not returned to clients;
- public API pagination/caching are bounded;
- production observability is active without logging raw request bodies, cookies, IP addresses, or query strings;
- browser layouts have no horizontal overflow in the certified viewport matrix;
- production probes do not create synthetic business data.

## Evidence policy

The local release contract is the final engineering authority:

```bash
npm run release:predeploy
# Cloudflare Build & Deploy for the exact tested main SHA
npm run release:postdeploy
```

`release:postdeploy` begins by requiring the official Cloudflare Workers check-run for the exact local HEAD SHA before running production smoke and probes. GitHub Actions are not an active release dependency.

A commit is not declared production-certified while any required production, browser, security, reliability, database, or load gate is pending, unavailable, or failing. "Not observable from the current tool environment" is evidence of a verification limitation, not evidence of a pass.

## Repository governance note

GitHub branch protection/rulesets are repository-host controls rather than application code. At the time of the 2026-09-14 audit, `main` had no active protection/ruleset. Application code/deployment evidence must not be used to imply that repository governance is protected when it is not.

Recommended repository governance once an administration-capable GitHub surface is available:

- protect `main` from deletion and force-push;
- require the official `Workers Builds: pasar-umkm` status for the candidate SHA;
- require the chosen review/release policy before merge according to the owner's operating model;
- retain an explicit administrator recovery path rather than silently bypassing required checks.

## Database recovery note

The verified recovery anchor is the manual Neon snapshot `p6-pre-release-2026-09-07`. Automatic snapshot scheduling is not currently configured. Release evidence must not claim automatic backup coverage unless Neon configuration is changed and re-verified.

## Future changes

Any code, schema, dependency, infrastructure, or security-policy change after certification creates a new revision and must pass the relevant regression and production gates again. P10 is a release baseline, not a magical exemption from future testing. Sadly, computers remain computers.
