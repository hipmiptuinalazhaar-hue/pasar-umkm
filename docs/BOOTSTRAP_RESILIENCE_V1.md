# Bootstrap Resilience V1

Implemented 2026-09-22 after production mobile users observed a full-screen loader that could remain visible while the database-backed bootstrap endpoints were slow.

## Root cause
The application bootstrap awaited auth, categories, stores, products and posts before releasing the full-screen loader. On a cold Worker/DB path, the request router also awaited runtime schema verification before those public reads. Auth housekeeping was scheduled at request start, adding avoidable database work during the same critical window.

## Fix
- GET /api/auth/me, /api/categories, /api/stores, /api/products and /api/posts bypass cold runtime schema verification. Production schema remains release-gated and all other APIs retain fail-closed runtime verification.
- Auth housekeeping is scheduled only after an auth/health response has been produced.
- The initial full-screen loader has a 4.5 second soft ceiling. If data is still pending, the static marketplace shell is released instead of blocking the user indefinitely.
- Mobile and desktop navigation behavior is unchanged.

## Operational note
This is a resilience fix, not a claim that database latency is solved permanently. Endpoint latency must still be monitored independently.
