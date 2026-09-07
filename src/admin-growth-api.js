import { requireAdminPermission } from "./admin-authorization.js";
import { requestIdentifier, requestRiskHashes } from "./admin-security-core.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLACEMENTS = new Set(["home_featured","search_boost","store_featured","sponsor_banner"]);
const SUBJECT_TYPES = new Set(["product","store","post","external"]);
const PROMOTION_STATUSES = new Set(["draft","scheduled","active","paused","ended"]);
const MAX_BODY_BYTES = 8192;

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

async function smallJson(request) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { error: json({ ok:false, code:"REQUEST_TOO_LARGE" }, 413) };
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: json({ ok:false, code:"INVALID_REQUEST" }, 400) };
  return { body };
}

async function audit(authz, request, { action, resourceId = null, outcome = "success", reasonCode = null, metadata = {} }) {
  const { ipHash, userAgentHash } = await requestRiskHashes(request);
  await authz.sql`
    INSERT INTO admin_audit_logs(
      admin_account_id, actor_name_snapshot, actor_email_snapshot,
      action, resource_type, resource_id, outcome, reason_code,
      request_id, ip_hash, user_agent_hash, metadata
    ) VALUES(
      ${authz.session.id}, ${authz.session.name}, ${authz.session.email},
      ${action}, 'promotion', ${resourceId}, ${outcome}, ${reasonCode},
      ${requestIdentifier(request)}, ${ipHash}, ${userAgentHash}, CAST(${JSON.stringify(metadata)} AS jsonb)
    )
  `;
}

function ratio(numerator, denominator) {
  const a = Number(numerator || 0);
  const b = Number(denominator || 0);
  return b > 0 ? Number(((a / b) * 100).toFixed(2)) : 0;
}

async function metrics(request, env) {
  const authz = await requireAdminPermission(request, env, "growth.view");
  if (!authz.ok) return authz.response;

  const rows = await authz.sql`
    WITH base AS (
      SELECT
        event_name,
        COALESCE(user_id::text, anonymous_key_hash, id::text) AS actor_key,
        created_at
      FROM growth_events
      WHERE created_at >= NOW() - INTERVAL '30 days'
    ), counts AS (
      SELECT
        COUNT(*) FILTER (WHERE event_name='page_view' AND created_at >= NOW()-INTERVAL '7 days')::int AS page_views_7d,
        COUNT(DISTINCT actor_key) FILTER (WHERE event_name='page_view' AND created_at >= NOW()-INTERVAL '7 days')::int AS visitors_7d,
        COUNT(*) FILTER (WHERE event_name='search' AND created_at >= NOW()-INTERVAL '7 days')::int AS searches_7d,
        COUNT(*) FILTER (WHERE event_name='product_view' AND created_at >= NOW()-INTERVAL '7 days')::int AS product_views_7d,
        COUNT(*) FILTER (WHERE event_name='add_to_cart' AND created_at >= NOW()-INTERVAL '7 days')::int AS add_to_cart_7d,
        COUNT(*) FILTER (WHERE event_name='checkout_started' AND created_at >= NOW()-INTERVAL '7 days')::int AS checkout_started_7d,
        COUNT(*) FILTER (WHERE event_name='order_completed' AND created_at >= NOW()-INTERVAL '7 days')::int AS order_completed_7d,
        COUNT(*) FILTER (WHERE event_name='seller_onboarding_view' AND created_at >= NOW()-INTERVAL '7 days')::int AS seller_onboarding_7d,
        COUNT(*) FILTER (WHERE event_name='verification_submitted' AND created_at >= NOW()-INTERVAL '7 days')::int AS verification_submitted_7d,
        COUNT(*) FILTER (WHERE event_name='page_view')::int AS page_views_30d,
        COUNT(DISTINCT actor_key) FILTER (WHERE event_name='page_view')::int AS visitors_30d,
        COUNT(*) FILTER (WHERE event_name='product_view')::int AS product_views_30d,
        COUNT(*) FILTER (WHERE event_name='add_to_cart')::int AS add_to_cart_30d,
        COUNT(*) FILTER (WHERE event_name='checkout_started')::int AS checkout_started_30d,
        COUNT(*) FILTER (WHERE event_name='order_completed')::int AS order_completed_30d
      FROM base
    ) SELECT * FROM counts
  `;
  const data = rows[0] || {};
  return json({
    ok: true,
    metrics: {
      ...data,
      product_to_cart_7d_pct: ratio(data.add_to_cart_7d, data.product_views_7d),
      cart_to_checkout_7d_pct: ratio(data.checkout_started_7d, data.add_to_cart_7d),
      checkout_to_completed_7d_pct: ratio(data.order_completed_7d, data.checkout_started_7d),
      product_to_cart_30d_pct: ratio(data.add_to_cart_30d, data.product_views_30d),
      cart_to_checkout_30d_pct: ratio(data.checkout_started_30d, data.add_to_cart_30d),
      checkout_to_completed_30d_pct: ratio(data.order_completed_30d, data.checkout_started_30d)
    },
    methodology: {
      visitor_key: "authenticated user id or hashed anonymous key",
      raw_ip_used: false,
      traffic_conversion_available: true,
      caveat: "Funnel reflects instrumented browser events after P7 rollout, not historical traffic."
    }
  });
}

async function listPromotions(request, env, url) {
  const authz = await requireAdminPermission(request, env, "promotions.view");
  if (!authz.ok) return authz.response;
  const status = PROMOTION_STATUSES.has(url.searchParams.get("status")) ? url.searchParams.get("status") : "all";
  const rows = await authz.sql`
    SELECT mp.id, mp.placement, mp.subject_type, mp.subject_id, mp.store_id,
      mp.headline, mp.sponsor_label, mp.destination_url, mp.status,
      mp.starts_at, mp.ends_at, mp.created_at, mp.updated_at,
      s.name AS store_name
    FROM marketplace_promotions mp
    LEFT JOIN stores s ON s.id=mp.store_id
    WHERE (${status}='all' OR mp.status=${status})
    ORDER BY mp.created_at DESC, mp.id DESC
    LIMIT 100
  `;
  return json({ ok:true, promotions:rows });
}

async function subjectExists(sql, type, id) {
  if (type === "external") return true;
  if (!UUID_PATTERN.test(id || "")) return false;
  if (type === "product") return (await sql`SELECT EXISTS(SELECT 1 FROM products WHERE id=${id}::uuid) AS ok`)[0]?.ok === true;
  if (type === "store") return (await sql`SELECT EXISTS(SELECT 1 FROM stores WHERE id=${id}::uuid) AS ok`)[0]?.ok === true;
  if (type === "post") return (await sql`SELECT EXISTS(SELECT 1 FROM posts WHERE id=${id}::uuid) AS ok`)[0]?.ok === true;
  return false;
}

function parseTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function createPromotion(request, env) {
  if (!sameOrigin(request)) return json({ ok:false, code:"ORIGIN_REJECTED" }, 403);
  const authz = await requireAdminPermission(request, env, "promotions.manage");
  if (!authz.ok) return authz.response;
  const parsed = await smallJson(request);
  if (parsed.error) return parsed.error;

  const placement = String(parsed.body.placement || "").trim();
  const subjectType = String(parsed.body.subject_type || "").trim();
  const subjectId = String(parsed.body.subject_id || "").trim() || null;
  const storeId = String(parsed.body.store_id || "").trim() || null;
  const headline = String(parsed.body.headline || "").trim().slice(0, 180) || null;
  const sponsorLabel = String(parsed.body.sponsor_label || "").trim().slice(0, 120) || null;
  const destinationUrl = String(parsed.body.destination_url || "").trim().slice(0, 800) || null;
  const status = PROMOTION_STATUSES.has(parsed.body.status) ? parsed.body.status : "draft";
  const startsAt = parseTimestamp(parsed.body.starts_at);
  const endsAt = parseTimestamp(parsed.body.ends_at);

  if (!PLACEMENTS.has(placement) || !SUBJECT_TYPES.has(subjectType)) return json({ ok:false, code:"INVALID_PROMOTION" }, 400);
  if (subjectType !== "external" && !subjectId) return json({ ok:false, code:"SUBJECT_REQUIRED" }, 400);
  if (!(await subjectExists(authz.sql, subjectType, subjectId))) return json({ ok:false, code:"SUBJECT_NOT_FOUND" }, 404);
  if (storeId && !UUID_PATTERN.test(storeId)) return json({ ok:false, code:"INVALID_STORE_ID" }, 400);
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) return json({ ok:false, code:"INVALID_SCHEDULE" }, 400);

  const rows = await authz.sql`
    INSERT INTO marketplace_promotions(
      placement, subject_type, subject_id, store_id, headline, sponsor_label,
      destination_url, status, starts_at, ends_at, created_by_admin_id
    ) VALUES(
      ${placement}, ${subjectType}, ${subjectId}::uuid, ${storeId}::uuid,
      ${headline}, ${sponsorLabel}, ${destinationUrl}, ${status}, ${startsAt}, ${endsAt}, ${authz.session.id}
    ) RETURNING *
  `;
  await audit(authz, request, { action:"promotion.create", resourceId:String(rows[0]?.id || ""), metadata:{ placement, subject_type:subjectType, status, billing_action:"none" } });
  return json({ ok:true, promotion:rows[0], billing_action:"none", financial_action:"none" }, 201);
}

async function changePromotionStatus(request, env, id) {
  if (!sameOrigin(request)) return json({ ok:false, code:"ORIGIN_REJECTED" }, 403);
  const authz = await requireAdminPermission(request, env, "promotions.manage");
  if (!authz.ok) return authz.response;
  const parsed = await smallJson(request);
  if (parsed.error) return parsed.error;
  const status = String(parsed.body.status || "").trim();
  const reason = String(parsed.body.reason || "").trim().slice(0, 300);
  if (!UUID_PATTERN.test(id) || !PROMOTION_STATUSES.has(status) || reason.length < 8) return json({ ok:false, code:"INVALID_PROMOTION_STATUS" }, 400);

  const rows = await authz.sql`
    UPDATE marketplace_promotions SET status=${status}, updated_at=NOW()
    WHERE id=${id}::uuid RETURNING *
  `;
  if (!rows[0]) return json({ ok:false, code:"PROMOTION_NOT_FOUND" }, 404);
  await audit(authz, request, { action:"promotion.status", resourceId:id, reasonCode:reason, metadata:{ status, billing_action:"none" } });
  return json({ ok:true, promotion:rows[0], billing_action:"none", financial_action:"none" });
}

export async function handleAdminGrowthApi(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  if (url.pathname === "/api/admin/growth/metrics" && method === "GET") return metrics(request, env);
  if (url.pathname === "/api/admin/growth/promotions" && method === "GET") return listPromotions(request, env, url);
  if (url.pathname === "/api/admin/growth/promotions" && method === "POST") return createPromotion(request, env);
  const match = url.pathname.match(/^\/api\/admin\/growth\/promotions\/([0-9a-f-]{36})\/status$/i);
  if (match && method === "PATCH") return changePromotionStatus(request, env, match[1]);
  return null;
}

export const adminGrowthPolicy = Object.freeze({
  version:"2026-09-07-p7-launch-growth",
  promotion_billing:false,
  financial_action:false,
  sensitive_management_requires_step_up:true
});