# P9 Offensive Security Audit

Status: production certification gate.

P9 is a non-destructive offensive-security pass. It is designed to prove that the production boundary fails closed without creating synthetic orders, modifying user data, uploading files, or attempting destructive database operations.

## Threats covered

- cross-origin state-changing requests and browser-provenance bypass;
- anonymous access to private user, seller, support, and admin surfaces;
- legacy public-admin exposure;
- admin authorization bypass and sensitive-action step-up requirements;
- session-token storage and cookie hardening;
- upload type, size, and file-signature validation;
- provider-error information leakage;
- media ownership scoping;
- buyer/seller order ownership boundaries;
- checkout row locking and stock guards;
- edge/application rate-limit contracts;
- CSP, HSTS, frame protection, and `nosniff` headers;
- API request correlation and timing diagnostics.

## Safety rules

The production probe is read-only from a business-data perspective. Mutation-shaped requests are deliberately malformed or cross-origin so the edge/request-security layer must reject them before feature handlers can change state. The probe never uses a real account, real checkout, real upload, or privileged credential.

## Required commands

```bash
npm run test:p9-security
npm run probe:p9-security
```

P9 is PASS only when both the source contract and live production probe succeed against the exact deployed revision.

## Upload hardening

Seller product/post/QRIS uploads accept only JPEG, PNG, and WebP, retain explicit size ceilings, verify magic-byte signatures before the provider request, and never return Cloudinary provider error details to the browser.

## Known limitation

A complete two-account IDOR exercise requires isolated authenticated test identities and disposable fixtures. Production P9 therefore certifies ownership guards statically and anonymous/fail-closed boundaries dynamically. Authenticated destructive cross-account testing must only run in a dedicated staging dataset.
