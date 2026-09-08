# Legal & Trust Layer V1

## Purpose

Legal & Trust V1 makes the platform's operational rules visible to users before public launch. It does not claim a license, NIB, or PSE registration that has not yet been issued.

## Operator disclosure

- Product: Pasar UMKM
- Current operator: Capryan Agusto, individual operator
- Operational domicile: Lubuklinggau, South Sumatra, Indonesia
- Support channel: hipmiptuinalazhaar@gmail.com
- Initiative context: HIPMI PT UIN Al Azhaar Lubuklinggau remains disclosed separately from the platform operator in the About experience.

## User-facing policy set

1. `/legal/index.html` — Legal & Trust Center and operator disclosure.
2. `/legal/privasi.html` — privacy, data categories, purposes, processors, retention, rights, security, minors, policy changes.
3. `/legal/syarat-ketentuan.html` — account, marketplace role, transactions, content, moderation, liability, governing law.
4. `/legal/kebijakan-penjual.html` — listing accuracy, inventory, fulfillment, payments, ranking transparency, reviews, buyer data.
5. `/legal/kebijakan-pembeli.html` — checkout, payments, receiving orders, cancellation/refund, reviews, disputes, anti-phishing.
6. `/legal/produk-terlarang.html` — illegal, dangerous, regulated, counterfeit, privacy-abusive and integrity-abusive products/activities.
7. `/legal/pengaduan.html` — transaction disputes, content reports, account security, data rights, evidence and support channel.

## Commerce boundary disclosed to users

The current release is explicitly non-custodial:

- no user wallet;
- no platform-held balance;
- no escrow;
- no automated refund ledger;
- seller-configured direct payment methods remain the payment boundary.

This matches the production boundaries in the V1 release manifest and avoids representing capabilities that do not exist.

## Ranking transparency

Seller policy discloses the current explainable recommendation factors:

- store verification;
- completed transactions;
- verified-purchase ratings;
- rating count;
- featured-product state;
- product freshness;
- stock availability.

The current V2 recommendation layer is disclosed as having no hidden paid boost. If promotion/ranking changes materially, seller-facing notice must be updated before rollout.

## Regulatory references used for policy design

The policy set is written to support operational alignment with current Indonesian requirements, including:

- Law No. 27 of 2022 on Personal Data Protection;
- private-scope electronic system registration requirements under Minister of Communication and Informatics Regulation No. 5 of 2020 as amended;
- Minister of Communication and Digital Regulation No. 15 of 2025 on risk-based licensing standards for electronic systems and transactions;
- Minister of Trade Regulation No. 19 of 2026 on Electronic Commerce, including marketplace/social-commerce transparency for promotion, search, recommendation and ranking.

The user-facing pages intentionally avoid asserting that these registrations have already been completed.

## Pre-public-launch legal work still outside the codebase

Legal & Trust V1 is policy infrastructure, not a substitute for registration. Before a large official launch, the operator should complete and verify the applicable OSS/NIB, PMSE/PPMSE classification, and PSE Lingkup Privat process, then add the official identifiers to the Legal & Trust Center only after issuance.

## Release contract

`npm run test:legal-trust` validates:

- all policy pages exist;
- operator identity and support channel are present;
- privacy and data-rights disclosures exist;
- non-custodial boundaries are explicit;
- seller ranking transparency exists;
- prohibited-product and complaint policies are present;
- About links expose the Legal & Trust Center;
- unsupported NIB/PSE registration claims are rejected;
- file-size budgets and placeholder-copy checks remain green.

`npm run validate` includes the legal-trust validator so future releases cannot silently remove this layer.
