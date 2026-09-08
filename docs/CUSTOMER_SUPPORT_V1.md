# Customer Support V1

Production-grade customer support and complaint handling for Pasar UMKM.

## Scope

- Authenticated customer ticket creation and listing.
- Ticket detail, user replies, and controlled lifecycle states.
- Internal admin support queue with RBAC permissions.
- Internal notes and support timeline/audit events.
- Support Center UI linked from legal and About experiences.
- No payment custody, automated refunds, or privileged financial actions.

## Security boundaries

- User endpoints require an active Pasar UMKM session.
- Admin endpoints require explicit `support.view`, `support.reply`, or `support.manage` permissions.
- Sensitive admin lifecycle actions require fresh step-up authentication through the existing authorization layer.
- Request bodies, search text, identifiers, and pagination are bounded and validated.
- Responses are `no-store`; support tables are runtime-verified rather than mutated on request paths.

## Data model

Migration: `database/migrations/2026-09-09-customer-support-v1.sql`

Tables:
- `support_tickets`
- `support_ticket_messages`
- `support_ticket_notes`
- `support_ticket_events`

The migration also seeds the support permissions and role grants.

## Release rule

`implement -> validate -> PR CI -> merge main -> exact Cloudflare deploy -> production smoke`
