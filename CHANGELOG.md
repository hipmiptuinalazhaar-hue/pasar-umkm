# Changelog

All notable production changes should be recorded here. Dates use Asia/Jakarta release dates.

## Unreleased — Platform Hardening V3

- add layered Cloudflare edge + isolate rate limiting for auth, privileged writes, uploads, comments, public catalog and health;
- move `/api/health` behind security/rate-limit boundaries and remove database/schema metadata disclosure;
- add non-sensitive release contract for post-deploy verification;
- add public Content Security Policy and Cross-Origin-Opener-Policy;
- add automatic post-deploy production smoke on `main` runtime changes;
- add repository-wide JavaScript syntax lint and Platform Hardening V3 release gate;
- add authenticated smoke harness with production mutation guard;
- freeze growth of legacy `worker.js`, `app.js`, and `style.css` surfaces;
- add SECURITY policy, CODEOWNERS, governance documentation, and structured issue templates.

## 2026-09-06 — Chat V7 action-layer hotfix

- restore visible conversation action sheets on mobile;
- place Chat V7 page below shared sheet/modal layers;
- add permanent Chat Action Layer validation.

## 2026-09-05 — Production hardening and release readiness

- add production-safe smoke testing;
- harden commerce edge cases and transaction recovery;
- add production observability and privacy-safe request correlation;
- isolate public and privileged admin security domains;
- retire legacy chat shims;
- finalize tablet, laptop, desktop and ultrawide responsive architecture.

## 2026-09-04 — Admin security platform

- add isolated admin authentication and sessions;
- add explicit RBAC permissions;
- add production Control Center;
- add MFA, recovery codes, session management, and step-up authentication.
