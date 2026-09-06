# Post-Release UX Recovery

Status: implementation branch, not yet merged to `main`.

## Scope

This recovery pass addresses three user-visible regressions reported after Final Release Readiness F:

1. conversation actions no longer appeared on long press in Chat V7;
2. completed buyer orders no longer exposed a rating action in Commerce V2;
3. the About Pasar UMKM surface was too sparse to explain the product and initiative credibly.

No database migration is required. No production data is mutated by this change set.

## 1. Chat conversation actions

### Root cause

Chat V7 retained the existing conversation action owner and API for pin, archive, and per-user deletion, but its long-press gesture only targeted individual message bubbles. Conversation rows still had the explicit overflow menu, yet the older long-press route to that same menu had been lost during the single-render migration.

### Recovery

`js/chat-conversation-actions-v7.js` is a presentation/gesture adapter only. It:

- recognizes a 520 ms long press on a conversation row;
- cancels when the pointer moves beyond the gesture tolerance;
- opens the existing V7 conversation menu instead of duplicating state or API logic;
- suppresses the follow-up click so a successful long press does not also open the thread;
- supports desktop `contextmenu` as an equivalent discoverability path;
- relabels the existing `delete_me` action to the clearer `Hapus percakapan`.

The adapter intentionally contains no `fetch()` call and no `/api/` route. Chat V7 remains the only conversation action/API owner.

## 2. Completed-order rating

### Root cause

`js/rating-core.js` still decorated the legacy order card structure (`.product-card[data-order-id]`). Commerce V2 renders buyer orders as `.commerce-order-card` with `.commerce-order-status`, so completed orders were no longer matched by the rating decorator even though the rating backend and form remained available.

### Recovery

Rating Core 2.2 now:

- preserves legacy rating support;
- detects completed **buyer** Commerce V2 order cards;
- inserts a standalone 48 px rating CTA after the order card, avoiding invalid nested buttons;
- adds the rating CTA to a completed buyer order detail view;
- never decorates seller order cards;
- keeps the existing eligibility check on `/api/ratings/order/:id` authoritative;
- keeps rating submission ownership in Rating Core;
- self-loads its scoped form and commerce CTA styles when lazily activated.

The bootstrap warms Rating Core on account/order/detail intent, so the feature does not become a new critical startup request.

## 3. About Pasar UMKM V2

The old About sheet communicated identity but not the product story. The new About surface is intentionally sectioned:

1. product positioning and local identity;
2. what Pasar UMKM is;
3. three core needs: discovery, commerce, and connection;
4. local ecosystem audiences;
5. product-development principles;
6. initiative, founder/product initiator, and initial focus.

It remains restrained, mobile-first, accessible, and free of decorative gradients. Tablet/desktop uses the same content owner with a wider responsive composition.

## Delivery and performance

- Four initial first-party script requests remain unchanged.
- Chat gesture code is lazy behind the existing Chat V7 bootstrap.
- About V2 is loaded only on About intent.
- Rating Core 2.2 is warmed only on account/order/detail intent.
- `index.html` remains within the existing critical HTML budget.
- Chat bootstrap remains within its existing 5 KB source budget.
- No new backend route is introduced.

## Validation requirements

Before merge:

- syntax check all changed/new JavaScript;
- verify Chat gesture adapter has no API ownership;
- verify long press, overflow menu, right-click/context menu, pin, archive and delete contracts;
- verify rating CTA is buyer-only and completed-order-only;
- verify rating form still uses the existing backend eligibility and submission paths;
- verify About V2 section contracts and anti-gradient styling;
- run `npm ci` and `npm run build:runtime` and reject runtime drift;
- run existing Chat V7, commerce, P6 performance, F release-readiness and security regression workflows;
- Cloudflare PR build must succeed.

## Manual browser matrix after preview

The following should still be visually exercised on the preview because static CI cannot prove pixel-perfect interaction geometry:

- 360 / 390 / 430 px mobile;
- 768 / 820 px tablet portrait;
- 1024 px tablet landscape/small laptop;
- 1366 / 1440 px laptop/desktop.

Critical manual paths:

- long-press conversation row -> Semat / Arsip / Hapus percakapan;
- completed buyer order -> Beri / Ubah Rating -> form -> save;
- seller order -> no rating CTA;
- About -> all sections scroll correctly with no horizontal overflow.
