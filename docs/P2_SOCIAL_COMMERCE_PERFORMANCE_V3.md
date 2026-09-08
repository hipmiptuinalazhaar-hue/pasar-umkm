# P2 Social-Commerce Performance V3

## Objective

P2 upgrades the existing Pasar UMKM frontend-performance layer into a conversion-oriented social-commerce experience without replacing the stable commerce, checkout, social, chat, or authentication owners that already passed release validation.

The product goal is simple: a user should be able to discover a product while scrolling social content, understand trust and stock context immediately, open product detail with one intentional action, and continue toward cart or checkout without paying the performance cost of unrelated features.

## Product principles

1. Social discovery and commerce must feel like one product, not two applications stitched together.
2. Mobile and low-end Android devices are first-class targets.
3. Initial HTML remains small; new P2 assets are lazy-loaded.
4. Network-constrained users must not be punished by speculative loading.
5. Existing server-authoritative cart, checkout, stock, payment, order, and security contracts remain authoritative.
6. Presentation modules must not duplicate API ownership.
7. Progressive enhancement must fail safely: core product cards remain usable if P2 assets fail to load.

## Existing foundations reused

P2 intentionally reuses:

- existing product feed cards from `app.runtime.js`;
- existing `product-detail`, `add-cart`, and `buy-now` actions;
- P8 buy-now and Cart V2 ownership;
- transactional checkout and order lifecycle;
- verified-store state already rendered in the social feed;
- lazy/intent infrastructure already established by P2 frontend-performance and P6 performance work.

No new wallet, escrow, stored balance, payment settlement, or fund movement is introduced.

## Architecture

### Initial critical path

P2 adds **zero direct script or stylesheet references to `index.html`**.

`js/p8-commerce-integration.js` remains an already-loaded commerce bridge and becomes the P2 lazy-loading owner.

### Adaptive loading

P8 evaluates browser network capability through `navigator.connection` when available.

- `Save-Data`: speculative P2 loading is disabled.
- `slow-2g` / `2g`: speculative P2 loading is disabled.
- faster connections: P2 can be warmed when a product post approaches the viewport.
- explicit pointer or keyboard intent can load P2 regardless of speculative policy.

This preserves user control while still making the experience feel immediate on healthy connections.

### P2 presentation island

`js/p2-social-commerce.js` is intentionally presentation-only. It:

- upgrades product media into keyboard-accessible product-detail entry points;
- reuses the existing global `product-detail` action router instead of creating a second route owner;
- adds local-UMKM, verification, low-stock, and sold-out context chips;
- improves CTA accessibility labels;
- batches DOM upgrades with `requestAnimationFrame`;
- observes dynamic feed rendering through `MutationObserver`;
- exposes non-sensitive local diagnostics.

It does **not** call APIs.

### P2 CSS island

`css/p2-social-commerce.css` is lazy-loaded together with the presentation module.

The stylesheet:

- uses `content-visibility: auto` for enhanced product posts;
- provides intrinsic sizing to reduce long-feed rendering cost;
- enforces 48px commerce CTA touch targets;
- provides keyboard focus states;
- isolates hover-only affordances to fine-pointer devices;
- respects reduced-motion preferences;
- avoids gradients, glass effects, and backdrop filters.

## Conversion UX hierarchy

For a shoppable product post, the user sees information in this order:

1. seller identity and verification;
2. product visual;
3. engagement actions;
4. category and stock;
5. local/verified/availability trust cues;
6. product name and price;
7. optional description;
8. Add to Cart and Buy Now actions.

The media itself becomes a product-detail entry point, matching modern social-commerce behavior without turning the entire card into an accidental click target.

## Performance budgets

P2-specific budgets:

- P2 social-commerce JavaScript: <= 12 KB source.
- P2 social-commerce CSS: <= 8 KB source.
- zero P2 assets in initial HTML.
- no direct network ownership in P2 presentation JavaScript.

Existing global P2/P6/runtime budgets remain unchanged.

## Accessibility contract

- product media is focusable only after it becomes an intentional interactive target;
- Enter and Space activate product detail;
- CTA labels include product names;
- minimum primary commerce touch target remains 48px;
- focus-visible treatment is explicit;
- reduced-motion is respected.

## Failure model

If P2 JavaScript or CSS fails to load:

- the original product card remains visible;
- original Add to Cart / Buy Now buttons remain available;
- P8 commerce and checkout ownership remain unchanged;
- no API state is partially written by P2 because P2 owns no network mutations.

## Validation

`scripts/validate-p2-social-commerce.mjs` verifies:

- JS/CSS budgets;
- no P2 asset in initial HTML;
- lazy loader ownership in P8;
- Save-Data and effective-network awareness;
- viewport and explicit-intent loading contracts;
- keyboard accessibility;
- existing product-detail router reuse;
- verified and stock trust cues;
- no API/fetch ownership in P2 presentation code;
- no decorative gradients/backdrop filters;
- offscreen rendering and reduced-motion contracts.

## Rollout model

P2 is stacked on top of Auth Security V2 so P1 remains isolated from unfinished P2 work.

Recommended release sequence:

1. finish P2 exact-head CI;
2. real-browser viewport validation;
3. merge/activate P1 according to its production gates;
4. rebase or retarget P2 onto the resulting main head;
5. run P2 + P4/P5/P6/P8 regression matrix;
6. deploy P2;
7. measure conversion and performance before adding heavier recommendation algorithms or live-commerce features.

## Future P2+ candidates

Not included in this slice:

- product tagging inside arbitrary seller posts/reels/stories;
- recommendation ranking;
- live shopping;
- creator affiliate attribution;
- promotion/discount engine;
- seller advertising;
- checkout payment gateway or escrow.

Those should be separate product phases because each introduces new data models, abuse cases, operational cost, and regulatory surface.