# P8 Real Commerce & Fulfillment

P8 turns the launch-ready marketplace into a practical local-commerce workflow without making Pasar UMKM a custodian of buyer funds.

## Buyer flow

1. Add products to the existing cart.
2. Open `/checkout/` from the application checkout action.
3. Choose fulfillment per UMKM: seller delivery, pickup, or local courier when enabled.
4. Choose payment per UMKM: COD, pay at store, bank transfer to merchant, or merchant QRIS when enabled.
5. Enter recipient and delivery information.
6. Checkout through the existing transactional Orders V2 endpoint.
7. Track the order in `/purchases/`, review its timeline, buy again, cancel while pending, or confirm receipt when fulfillment reaches the correct state.

`checkout_commerce_preferences` is a short-lived, buyer-scoped bridge between the guided checkout UI and the existing atomic Orders V2 transaction. A database trigger snapshots the seller's commerce choices into each order before insert and clears the consumed preference row.

## Seller flow

`/seller-orders/` is the Seller Order Center.

Seller can:
- see incoming/active/completed orders;
- monitor response SLA;
- progress canonical order status through confirmed, processing, and ready;
- start pickup or delivery fulfillment after the order is ready;
- inspect the auditable order timeline;
- configure fulfillment methods, flat delivery fee, optional free-delivery threshold, service estimates, response SLA, and direct-merchant payment instructions.

Seller ownership is checked server-side for fulfillment mutations. Buyer ownership is checked server-side for receipt confirmation and order timeline access.

## Order snapshot

P8 adds order snapshot fields for:
- `fulfillment_method`;
- `fulfillment_status`;
- `payment_method`;
- direct merchant `payment_instructions`;
- delivery district/city;
- estimated fulfillment time;
- actual fulfillment time.

The existing `delivery_fee` and `total` fields are populated by the P8 checkout snapshot trigger based on the seller settings and order subtotal.

## Timeline

`order_timeline_events` records order creation, payment choice, canonical order-status transitions, and fulfillment transitions. This timeline is operational history, not a payment ledger.

## Non-custodial boundary

P8 does **not** create:
- a platform wallet;
- escrow;
- stored balance;
- payment settlement;
- refund ledger;
- automatic fund movement.

COD, pay-at-store, bank transfer, and merchant QRIS are direct payment methods between buyer and seller. Pasar UMKM records the selected method and instructions only.

## Release rules

1. Rehearse the additive P8 migration on an isolated Neon branch cloned from production schema.
2. Run canonical validation, Orders V2 tests, and the dedicated P8 contract.
3. Run real-browser P5 verification on the PR candidate.
4. Keep a pre-release Neon recovery branch or snapshot.
5. Apply the exact additive P8 migration to production.
6. Merge only with green CI.
7. Wait for the exact Cloudflare production SHA.
8. Run P8 read-only production verification, Post Deploy Smoke, browser verification, and load smoke after deployment.

Production verification must not create synthetic orders, seller settings, checkout preferences, fulfillment events, or payment records.