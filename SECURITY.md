# Security Policy

## Scope

Pasar UMKM is a production social-commerce application. Security-sensitive surfaces include authentication, sessions, admin RBAC/MFA, orders, store and product ownership, chat/media, uploads, analytics events, and database migrations.

## Reporting a vulnerability

Do not publish credentials, session tokens, personal data, exploit payloads, or reproducible account-takeover details in a public issue.

Use GitHub's **Security** area and private vulnerability reporting/security advisory flow when available for this repository. Include:

- affected route or feature;
- impact and preconditions;
- minimal reproduction steps;
- request/response metadata with secrets removed;
- whether production data was touched;
- suggested remediation, if known.

If private reporting is temporarily unavailable, open a public issue containing only a high-level notice that a private security contact is required. Do not include the exploit itself.

## Handling rules

- Secrets are never committed to the repository.
- Password/session/MFA/OTP material must never be logged in plaintext.
- Privileged mutations must remain server-authorized and audited.
- Registration must not create a verified account or authenticated session before the email OTP challenge is successfully consumed.
- Production data must not be mutated merely to make a test pass.
- Stateful authenticated E2E is staging-only and must fail closed on production targets.
- Browser-originated analytics must not be trusted as proof of a completed transaction.
- Internal database/provider error messages are logged server-side but are not returned raw to clients.

## Release controls

GitHub Actions are not an active release runner for this repository. Files in `.github/workflows-disabled/` are archived references only.

Every production change must pass the local release contract documented in `docs/LOCAL_RELEASE_PROCESS.md`:

1. `npm run release:predeploy`
2. Cloudflare Build & Deploy for the exact verified `main` commit
3. `npm run release:postdeploy`

A failed pre-deploy or post-deploy gate blocks certification. Do not claim a release is verified only because Cloudflare finished deploying it.

## Supported version

The currently deployed `main` release is the supported production version. Historical branches, disabled workflows, and archived implementation snapshots are not supported security targets.
