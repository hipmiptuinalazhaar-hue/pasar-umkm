# Repository Governance

## Main branch contract

`main` is the production release branch. Direct feature work must not be developed on `main`.

Required repository settings:

1. Require a pull request before merging.
2. Require status checks to pass before merging.
3. Require the branch to be up to date before merge when practical.
4. Require CODEOWNERS review when more than one trusted maintainer is active.
5. Block force pushes.
6. Block branch deletion.
7. Do not allow failed or cancelled validation checks to be bypassed for routine releases.

Recommended required checks include at minimum:

- `Platform Hardening V3 / validate-platform`
- `Supply Chain Validation / validate-supply-chain`
- `Final Security D Validation`
- `Final Release Readiness F Validation`
- the feature-specific validator for any changed critical surface.

## Release flow

1. Branch from current `main`.
2. Keep changes scoped to explicit owners.
3. Run syntax, security, responsive/UI and feature regression validation.
4. Open a PR into `main`.
5. Merge only after all relevant checks are green.
6. Let the configured Cloudflare production integration deploy `main`.
7. `Post Deploy Smoke` verifies the production release contract and core public/auth boundaries after the deployment lands.
8. If post-deploy verification fails, treat the release as unhealthy and restore a known-good commit rather than stacking speculative hotfixes.

## Production-data discipline

- Never create fake production accounts/orders merely to satisfy CI.
- Stateful authenticated E2E belongs on a staging/preview environment with dedicated smoke credentials.
- Reversible production probes must remain read-only by default.
- Database migrations are reviewed independently and must have a rollback/forward-fix plan.

## Legacy retirement

`src/worker.js`, `js/app.js`, and `css/style.css` are legacy migration surfaces. The V3 validation freezes their current maximum size. New product work belongs in modular owners rather than enlarging those files.

## Administrative limitation

GitHub branch-protection/ruleset settings are repository-administration settings, not code. They must be enabled in repository settings by an identity/integration with GitHub administration permission. CI and CODEOWNERS in this repository are prepared to support that protection once enabled.
