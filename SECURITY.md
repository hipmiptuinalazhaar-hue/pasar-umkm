# Security Policy

## Scope

Pasar UMKM is a production social-commerce application. Security-sensitive surfaces include authentication, sessions, admin RBAC/MFA, orders, store and product ownership, chat/media, uploads, and database migrations.

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
- Password/session/MFA material must never be logged in plaintext.
- Privileged mutations must remain server-authorized and audited.
- Security fixes go through a dedicated branch/PR and all relevant CI checks.
- Production data must not be mutated merely to make a test pass.
- Dependency and GitHub Action upgrades are reviewed and validated before merge.

## Supported version

The currently deployed `main` release is the supported production version. Historical branches and archived implementation snapshots are not supported security targets.
