# P7 Launch, Growth & Monetization Readiness

P7 turns the technically hardened marketplace into a launchable product surface for sellers, buyers, administrators, search engines, and growth measurement.

## Seller Launch Center

`/launch/` is the canonical seller onboarding surface.

Flow:
1. Authenticate with the normal Pasar UMKM account.
2. Create the first UMKM/store if none exists.
3. Complete the business profile from the existing account/store management UI.
4. Create at least one active product.
5. Submit UMKM verification evidence.
6. Monitor buyer disputes and respond to seller-owned cases.

The Launch Center reads real database state. It does not persist a parallel checklist.

## Safety surfaced to users

The deferred P7 application layer adds contextual reporting for product, store, and post surfaces and keeps P6 report/dispute APIs as the single source of truth. Buyer disputes are shown from the canonical Orders V2 buyer list. Seller disputes are owner-scoped by store ownership.

## Discovery

`GET /api/discover` provides a bounded product/store discovery endpoint with:
- exact/prefix/contains relevance tiers;
- category filter;
- district filter;
- relevance/newest/price sorting for products;
- verified-store preference;
- active promotion boost;
- maximum 20 rows per result kind.

This is launch-scale relevance, not a claim of search-engine parity. Large-scale typo tolerance/full-text ranking remains a later scale phase.

## Growth instrumentation

`POST /api/growth/events` accepts an allowlisted event vocabulary. The browser anonymous identifier is hashed server-side before storage. Raw IP addresses and raw User-Agent strings are not stored in `growth_events`.

The admin Growth workspace exposes 7-day and 30-day funnel metrics. Historical traffic before P7 is not backfilled or fabricated.

## SEO / sharing

P7 adds:
- product Open Graph + Product JSON-LD share pages;
- store Open Graph + LocalBusiness JSON-LD share pages;
- dynamic `/sitemap.xml` for active stores/products;
- canonical metadata for the seller Launch Center.

Share pages are server-rendered so link unfurlers do not depend on client-side JavaScript.

## Promotion registry / monetization boundary

`marketplace_promotions` records placement intent for featured products, featured stores, search boosts, and sponsor banners. Admin management is protected by RBAC and fresh MFA step-up through `promotions.manage`.

P7 has **no billing, no wallet, no escrow, no refund ledger, and no fund movement**. Commercial agreements can be handled off-platform until a regulated/official payment integration is introduced in a later phase.

## Release rules

Before production release:
1. Rehearse the additive migration on an isolated Neon branch clone.
2. Run canonical validation and the P7 dedicated gate.
3. Verify real-browser P5 matrix on the PR candidate.
4. Take a production recovery snapshot.
5. Apply the additive P7 migration to production.
6. Merge only after all PR gates are green.
7. Wait for the exact Cloudflare SHA.
8. Run production-safe P7 checks, Post Deploy Smoke, browser verification, and load smoke after deployment.

No production synthetic accounts, orders, reports, disputes, or promotions are created by the release verification workflow.