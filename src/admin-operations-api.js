import { requireAdminPermission } from "./admin-authorization.js";
import { requestIdentifier, requestRiskHashes } from "./admin-security-core.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 8192;

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Pragma": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function parseLimit(value) {
  const parsed = Number.parseInt(String(value || "24"), 10);
  return Math.min(50, Math.max(1, Number.isFinite(parsed) ? parsed : 24));
}

async function parseBody(request) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { error: json({ ok: false, code: "REQUEST_TOO_LARGE" }, 413) };
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: json({ ok: false, code: "INVALID_REQUEST" }, 400) };
  return { body };
}

async function auth(request, env, permission) {
  const result = await requireAdminPermission(request, env, permission);
  return result.ok ? result : { response: result.response };
}

async function auditFields(request) {
  const hashes = await requestRiskHashes(request);
  return {
    requestId: requestIdentifier(request),
    ipHash: hashes.ipHash,
    userAgentHash: hashes.userAgentHash
  };
}

async function metrics(request, env) {
  const ctx = await auth(request, env, "dashboard.view");
  if (ctx.response) return ctx.response;
  const rows = await ctx.sql`
    SELECT
      (SELECT COUNT(*)::int FROM stores WHERE verification_status='verified' AND is_active=TRUE) AS verified_stores,
      (SELECT COUNT(*)::int FROM stores WHERE verification_status='pending' AND is_active=TRUE) AS pending_store_verification,
      (SELECT COUNT(*)::int FROM products WHERE is_active=TRUE) AS active_products,
      (SELECT COUNT(*)::int FROM orders WHERE created_at >= NOW() - INTERVAL '30 days') AS orders_30d,
      (SELECT COUNT(*)::int FROM orders WHERE status='completed' AND created_at >= NOW() - INTERVAL '30 days') AS completed_orders_30d,
      (SELECT COALESCE(SUM(total),0)::numeric FROM orders WHERE status='completed' AND created_at >= NOW() - INTERVAL '30 days') AS completed_gmv_30d,
      (SELECT COUNT(DISTINCT buyer_id)::int FROM orders WHERE created_at >= NOW() - INTERVAL '30 days') AS active_buyers_30d,
      (SELECT COUNT(DISTINCT store_id)::int FROM orders WHERE created_at >= NOW() - INTERVAL '30 days') AS active_sellers_30d,
      (SELECT COUNT(*)::int FROM moderation_reports WHERE status IN ('open','reviewing')) AS open_reports,
      (SELECT COUNT(*)::int FROM order_disputes WHERE status IN ('open','seller_response','admin_review')) AS open_disputes,
      (SELECT COUNT(*)::int FROM store_verification_submissions WHERE status='pending') AS pending_verification_cases,
      (SELECT COUNT(*)::int FROM admin_audit_logs WHERE created_at >= NOW() - INTERVAL '24 hours') AS admin_actions_24h
  `;
  const row = rows[0] || {};
  const orders = Number(row.orders_30d || 0);
  const completed = Number(row.completed_orders_30d || 0);
  return json({
    ok: true,
    metrics: {
      ...row,
      order_completion_rate_30d: orders > 0 ? Number(((completed / orders) * 100).toFixed(2)) : 0,
      traffic_conversion_rate_available: false
    },
    note: "Conversion pengunjung ke pembeli belum dihitung karena P6 tidak mengarang denominator traffic tanpa telemetry yang valid."
  });
}

async function listReports(request, env, url) {
  const ctx = await auth(request, env, "reports.view");
  if (ctx.response) return ctx.response;
  const limit = parseLimit(url.searchParams.get("limit"));
  const status = ["all","open","reviewing","resolved","dismissed"].includes(url.searchParams.get("status")) ? url.searchParams.get("status") : "open";
  const rows = await ctx.sql`
    SELECT r.id, r.reporter_user_id, u.name AS reporter_name, r.subject_type, r.subject_id,
           r.category, r.details, r.status, r.priority, r.resolution_note, r.resolved_at,
           r.created_at, r.updated_at
    FROM moderation_reports r
    JOIN users u ON u.id=r.reporter_user_id
    WHERE (${status}='all' OR r.status=${status})
    ORDER BY CASE r.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
             r.created_at ASC, r.id ASC
    LIMIT ${limit}
  `;
  return json({ ok: true, reports: rows, filters: { status, limit } });
}

async function updateReport(request, env, reportId) {
  const ctx = await auth(request, env, "reports.resolve");
  if (ctx.response) return ctx.response;
  const parsed = await parseBody(request);
  if (parsed.error) return parsed.error;
  const status = String(parsed.body.status || "").trim();
  const note = String(parsed.body.resolution_note || "").trim();
  if (!UUID_PATTERN.test(reportId) || !["reviewing","resolved","dismissed"].includes(status)) return json({ ok: false, code: "INVALID_REPORT_ACTION" }, 400);
  if (["resolved","dismissed"].includes(status) && (note.length < 8 || note.length > 1000)) return json({ ok: false, code: "RESOLUTION_NOTE_REQUIRED" }, 400);
  const signal = await auditFields(request);
  const rows = await ctx.sql`
    WITH updated AS (
      UPDATE moderation_reports
      SET status=${status},
          assigned_admin_id=${ctx.session.id},
          resolution_note=CASE WHEN ${status} IN ('resolved','dismissed') THEN ${note} ELSE resolution_note END,
          resolved_at=CASE WHEN ${status} IN ('resolved','dismissed') THEN NOW() ELSE NULL END,
          updated_at=NOW()
      WHERE id=${reportId}::uuid AND status NOT IN ('resolved','dismissed')
      RETURNING id, status, resolution_note, resolved_at, updated_at
    ), event AS (
      INSERT INTO marketplace_case_events(case_type, case_id, actor_type, actor_admin_id, event_type, note)
      SELECT 'report', id, 'admin', ${ctx.session.id}, 'report.' || status, NULLIF(${note}, '') FROM updated
    ), audit AS (
      INSERT INTO admin_audit_logs(admin_account_id, actor_name_snapshot, actor_email_snapshot, action, resource_type, resource_id, outcome, reason_code, request_id, ip_hash, user_agent_hash, metadata)
      SELECT ${ctx.session.id}, ${ctx.session.name}, ${ctx.session.email}, 'report.' || status, 'moderation_report', id::text, 'success', 'p6_case_action', ${signal.requestId}, ${signal.ipHash}, ${signal.userAgentHash}, jsonb_build_object('status', status)
      FROM updated
    )
    SELECT * FROM updated
  `;
  if (!rows[0]) return json({ ok: false, code: "REPORT_NOT_ACTIONABLE" }, 404);
  return json({ ok: true, report: rows[0] });
}

async function listDisputes(request, env, url) {
  const ctx = await auth(request, env, "disputes.view");
  if (ctx.response) return ctx.response;
  const limit = parseLimit(url.searchParams.get("limit"));
  const status = ["all","open","seller_response","admin_review","resolved","rejected","cancelled"].includes(url.searchParams.get("status")) ? url.searchParams.get("status") : "open";
  const rows = await ctx.sql`
    SELECT d.id, d.order_id, o.order_number, d.buyer_id, u.name AS buyer_name,
           d.store_id, s.name AS store_name, d.reason_code, d.description, d.status,
           d.seller_response, d.resolution_note, d.resolved_at, d.created_at, d.updated_at
    FROM order_disputes d
    JOIN orders o ON o.id=d.order_id
    JOIN users u ON u.id=d.buyer_id
    JOIN stores s ON s.id=d.store_id
    WHERE (${status}='all' OR d.status=${status})
    ORDER BY d.created_at ASC, d.id ASC
    LIMIT ${limit}
  `;
  return json({ ok: true, disputes: rows, filters: { status, limit }, financial_actions_available: false });
}

async function updateDispute(request, env, disputeId) {
  const ctx = await auth(request, env, "disputes.resolve");
  if (ctx.response) return ctx.response;
  const parsed = await parseBody(request);
  if (parsed.error) return parsed.error;
  const status = String(parsed.body.status || "").trim();
  const note = String(parsed.body.resolution_note || "").trim();
  if (!UUID_PATTERN.test(disputeId) || !["admin_review","resolved","rejected"].includes(status)) return json({ ok: false, code: "INVALID_DISPUTE_ACTION" }, 400);
  if (["resolved","rejected"].includes(status) && (note.length < 8 || note.length > 1500)) return json({ ok: false, code: "RESOLUTION_NOTE_REQUIRED" }, 400);
  const signal = await auditFields(request);
  const rows = await ctx.sql`
    WITH updated AS (
      UPDATE order_disputes
      SET status=${status},
          resolution_note=CASE WHEN ${status} IN ('resolved','rejected') THEN ${note} ELSE resolution_note END,
          resolved_by_admin_id=CASE WHEN ${status} IN ('resolved','rejected') THEN ${ctx.session.id} ELSE resolved_by_admin_id END,
          resolved_at=CASE WHEN ${status} IN ('resolved','rejected') THEN NOW() ELSE NULL END,
          updated_at=NOW()
      WHERE id=${disputeId}::uuid AND status NOT IN ('resolved','rejected','cancelled')
      RETURNING id, order_id, status, resolution_note, resolved_at, updated_at
    ), event AS (
      INSERT INTO marketplace_case_events(case_type, case_id, actor_type, actor_admin_id, event_type, note)
      SELECT 'dispute', id, 'admin', ${ctx.session.id}, 'dispute.' || status, NULLIF(${note}, '') FROM updated
    ), audit AS (
      INSERT INTO admin_audit_logs(admin_account_id, actor_name_snapshot, actor_email_snapshot, action, resource_type, resource_id, outcome, reason_code, request_id, ip_hash, user_agent_hash, metadata)
      SELECT ${ctx.session.id}, ${ctx.session.name}, ${ctx.session.email}, 'dispute.' || status, 'order_dispute', id::text, 'success', 'p6_case_action', ${signal.requestId}, ${signal.ipHash}, ${signal.userAgentHash}, jsonb_build_object('order_id', order_id, 'financial_action', 'none')
      FROM updated
    )
    SELECT * FROM updated
  `;
  if (!rows[0]) return json({ ok: false, code: "DISPUTE_NOT_ACTIONABLE" }, 404);
  return json({ ok: true, dispute: rows[0], financial_action: "none" });
}

async function listVerifications(request, env, url) {
  const ctx = await auth(request, env, "stores.view");
  if (ctx.response) return ctx.response;
  const limit = parseLimit(url.searchParams.get("limit"));
  const status = ["all","pending","approved","rejected","withdrawn"].includes(url.searchParams.get("status")) ? url.searchParams.get("status") : "pending";
  const rows = await ctx.sql`
    SELECT v.id, v.store_id, s.name AS store_name, s.verification_status::text AS store_verification_status,
           v.submitted_by_user_id, u.name AS submitter_name, u.email AS submitter_email,
           v.business_name, v.owner_name, v.contact_phone, v.business_address,
           v.registration_number, v.evidence_note, v.status, v.review_note, v.reviewed_at, v.created_at
    FROM store_verification_submissions v
    JOIN stores s ON s.id=v.store_id
    JOIN users u ON u.id=v.submitted_by_user_id
    WHERE (${status}='all' OR v.status=${status})
    ORDER BY v.created_at ASC, v.id ASC
    LIMIT ${limit}
  `;
  return json({ ok: true, submissions: rows, filters: { status, limit } });
}

async function reviewVerification(request, env, submissionId) {
  const ctx = await auth(request, env, "stores.verify");
  if (ctx.response) return ctx.response;
  const parsed = await parseBody(request);
  if (parsed.error) return parsed.error;
  const action = String(parsed.body.action || "").trim();
  const note = String(parsed.body.review_note || "").trim();
  if (!UUID_PATTERN.test(submissionId) || !["approve","reject"].includes(action) || note.length < 8 || note.length > 1000) return json({ ok: false, code: "INVALID_VERIFICATION_ACTION" }, 400);
  const signal = await auditFields(request);
  const rows = await ctx.sql`
    WITH reviewed AS (
      UPDATE store_verification_submissions
      SET status=CASE WHEN ${action}='approve' THEN 'approved' ELSE 'rejected' END,
          reviewed_by_admin_id=${ctx.session.id}, review_note=${note}, reviewed_at=NOW(), updated_at=NOW()
      WHERE id=${submissionId}::uuid AND status='pending'
      RETURNING id, store_id, status, review_note, reviewed_at
    ), store_update AS (
      UPDATE stores s
      SET verification_status=CASE WHEN ${action}='approve' THEN 'verified'::store_verification_status ELSE 'rejected'::store_verification_status END,
          verified_at=CASE WHEN ${action}='approve' THEN NOW() ELSE NULL END,
          updated_at=NOW()
      FROM reviewed r
      WHERE s.id=r.store_id
      RETURNING s.id, s.verification_status::text AS verification_status, s.verified_at
    ), event AS (
      INSERT INTO marketplace_case_events(case_type, case_id, actor_type, actor_admin_id, event_type, note)
      SELECT 'verification', id, 'admin', ${ctx.session.id}, 'verification.' || status, ${note} FROM reviewed
    ), audit AS (
      INSERT INTO admin_audit_logs(admin_account_id, actor_name_snapshot, actor_email_snapshot, action, resource_type, resource_id, outcome, reason_code, request_id, ip_hash, user_agent_hash, metadata)
      SELECT ${ctx.session.id}, ${ctx.session.name}, ${ctx.session.email}, 'store_verification.' || ${action}, 'store', store_id::text, 'success', 'p6_verification_review', ${signal.requestId}, ${signal.ipHash}, ${signal.userAgentHash}, jsonb_build_object('submission_id', id, 'review_status', status)
      FROM reviewed
    )
    SELECT r.*, s.verification_status, s.verified_at
    FROM reviewed r JOIN store_update s ON s.id=r.store_id
  `;
  if (!rows[0]) return json({ ok: false, code: "VERIFICATION_NOT_ACTIONABLE" }, 404);
  return json({ ok: true, submission: rows[0] });
}

export async function handleAdminOperationsApi(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  if (url.pathname === "/api/admin/operations/metrics" && method === "GET") return metrics(request, env);
  if (url.pathname === "/api/admin/operations/reports" && method === "GET") return listReports(request, env, url);
  if (url.pathname === "/api/admin/operations/disputes" && method === "GET") return listDisputes(request, env, url);
  if (url.pathname === "/api/admin/operations/verifications" && method === "GET") return listVerifications(request, env, url);

  let match = url.pathname.match(/^\/api\/admin\/operations\/reports\/([0-9a-f-]{36})$/i);
  if (match && method === "PATCH") return updateReport(request, env, match[1]);
  match = url.pathname.match(/^\/api\/admin\/operations\/disputes\/([0-9a-f-]{36})$/i);
  if (match && method === "PATCH") return updateDispute(request, env, match[1]);
  match = url.pathname.match(/^\/api\/admin\/operations\/verifications\/([0-9a-f-]{36})$/i);
  if (match && method === "PATCH") return reviewVerification(request, env, match[1]);
  return null;
}

export const adminOperationsContract = Object.freeze({
  report_permission: "reports.resolve",
  dispute_permissions: ["disputes.view","disputes.resolve"],
  verification_permission: "stores.verify",
  privileged_mutations_are_audited: true,
  dispute_financial_actions: false
});
