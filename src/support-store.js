let supportReady = false;
let supportPromise = null;

const SUPPORT_MIGRATION = "2026-09-09-customer-support-v1";

function schemaError(missing) {
  const error = new Error(`[schema:not-ready] Customer Support V1 belum siap: ${missing.join(", ")}`);
  error.code = "SCHEMA_NOT_READY";
  return error;
}

export async function ensureSupportInfrastructure(sql) {
  if (supportReady) return;
  if (supportPromise) return supportPromise;

  supportPromise = (async () => {
    const rows = await sql`
      SELECT
        to_regclass('public.support_tickets') IS NOT NULL AS support_tickets,
        to_regclass('public.support_messages') IS NOT NULL AS support_messages,
        to_regclass('public.support_internal_notes') IS NOT NULL AS support_internal_notes,
        to_regclass('public.support_ticket_events') IS NOT NULL AS support_ticket_events,
        EXISTS (
          SELECT 1 FROM schema_migrations WHERE version = ${SUPPORT_MIGRATION}
        ) AS migration_applied,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='support_tickets' AND column_name='admin_last_read_at'
        ) AS admin_read_state,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='support_tickets' AND column_name='user_last_read_at'
        ) AS user_read_state
    `;
    const state = rows[0] || {};
    const missing = [];
    if (!state.support_tickets) missing.push("support_tickets");
    if (!state.support_messages) missing.push("support_messages");
    if (!state.support_internal_notes) missing.push("support_internal_notes");
    if (!state.support_ticket_events) missing.push("support_ticket_events");
    if (!state.migration_applied) missing.push(SUPPORT_MIGRATION);
    if (!state.admin_read_state) missing.push("support_tickets.admin_last_read_at");
    if (!state.user_read_state) missing.push("support_tickets.user_last_read_at");
    if (missing.length) throw schemaError(missing);
    supportReady = true;
  })();

  try {
    await supportPromise;
  } finally {
    supportPromise = null;
  }
}

export function supportTicketCode(ticket) {
  const date = new Date(ticket?.created_at || Date.now());
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `SUP-${y}${m}${d}-${String(ticket?.ticket_no || 0).padStart(6, "0")}`;
}

export const supportPolicy = Object.freeze({
  migration: SUPPORT_MIGRATION,
  categories: Object.freeze([
    "order", "payment", "account_security", "seller_verification",
    "product_report", "complaint", "other"
  ]),
  statuses: Object.freeze(["waiting_support", "in_progress", "waiting_user", "resolved", "closed"]),
  priorities: Object.freeze(["low", "normal", "high", "urgent"]),
  max_message_chars: 4000,
  max_subject_chars: 140,
  max_active_tickets_per_user: 5,
  max_messages_per_minute: 12
});
