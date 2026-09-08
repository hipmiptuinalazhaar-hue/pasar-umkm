# Pasar UMKM V1 Launch Certification

Release contract: `2026-09-08-v1-completion`

## Certification status

V1 is **technical-certified for production engineering** after the P1-P10 contract, Legal & Trust V1, Customer Support V1, production checkout/auth verification, exact Cloudflare deployment attestation, post-deploy smoke, and real Chrome viewport verification have passed on production releases.

This technical certification does **not** claim that government licensing/registration such as NIB/PSE/PMSE has been completed, does not certify marketplace seller/product density, and does not substitute for repository branch protection. Those are operator/governance launch controls outside the runtime engineering contract.

## Scope

V1 is considered technically launch-ready only when the production release preserves all ten product milestones and the automated release pipeline validates the exact deployed commit.

### Product milestones

- P1 Auth & Security: verified public sessions, email verification/recovery, admin isolation.
- P2 Social-Commerce: social discovery, shoppable posts, seller product tags and hotspots.
- P3 Premium UX: accessibility, responsive interaction and low-end-device discipline.
- P4 Commerce Chat: transaction-aware messaging, drafts and offline recovery.
- P5 Trust & Conversion: evidence-backed rating, verification and transaction indicators.
- P6 Seller Operations V2: daily seller action queue, stock health, revenue and response-SLA visibility.
- P7 Discovery & Recommendation V2: evidence-ranked marketplace recommendations with transparent factors and constrained-network opt-out.
- P8 Commerce Safety V3: selective-cart preflight plus existing transactional stock/order integrity and non-custodial boundary.
- P9 Operational Intelligence V2: internal health, operations, growth funnel and trust-and-safety queues in one read-only workspace.
- P10 Launch Certification: machine-readable manifest and CI contract covering P6-P10 plus canonical platform gates.

### Launch hardening completed after P10

- Legal & Trust V1: privacy, terms, seller/buyer policy, prohibited activity policy, complaint/dispute path and operator disclosure.
- Customer Support V1: private user-to-support tickets, admin support inbox, RBAC, internal notes and operational ticket lifecycle.
- Production checkout/auth verification: real production paths validated without introducing custodial payment primitives.
- Mobile chat recovery: header chat transition reconciles partial DOM state and fails safely instead of leaving a frozen partial shell.

## Mandatory release gates

A V1 production release is not technically certified unless all applicable checks pass on the exact release SHA:

1. `npm run validate`
2. P6-P10 V1 completion validation
3. runtime asset reproducibility
4. immutable/pinned GitHub Actions supply chain
5. platform hardening and security regression suites
6. Cloudflare exact-SHA deployment attestation
7. real Chrome runtime verification
8. viewport matrix: 360, 390, 430, 768, 1024, 1280, 1366 and 1600 px widths
9. production smoke after deployment

## Explicit product boundaries

V1 does **not** claim or implement platform custody of buyer/seller funds. The following remain outside the launch contract until a future regulated/payment-provider integration is deliberately designed and reviewed:

- platform wallet balances
- escrow accounts
- automated settlement ledger
- automated refund ledger
- platform-generated QRIS credentials

Seller bank/e-wallet/QRIS information is a merchant payment profile. Payment remains directly between buyer and seller through the seller's configured method.

## Recommendation integrity

The V2 recommendation layer is not an opaque trust or safety score. It uses observable marketplace evidence such as active stock, store verification, completed sales, verified-purchase rating, featured state and freshness. Save-Data and 2G users do not receive the additional recommendation fetch.

## Operational rule

A green merge is not equivalent to a completed release. Completion is:

`implement → validate → exact preview → real browser → merge main → Cloudflare production → production verification`.
