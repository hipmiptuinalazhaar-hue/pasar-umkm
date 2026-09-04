import { neon } from "@neondatabase/serverless";
import {
  clearAdminCookie,
  isStepUpFresh,
  loadAdminSession,
  requestIdentifier,
  requestRiskHashes,
  sameOrigin,
  adminSecurityPolicy
} from "./admin-security-core.js";

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Pragma": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...headers
    }
  });
}

async function audit(sql, request, admin, action, outcome, reasonCode, metadata = {}) {
  const { ipHash, userAgentHash } = await requestRiskHashes(request);
  await sql`
    INSERT INTO admin_audit_logs (
      admin_account_id, actor_name_snapshot, actor_email_snapshot,
      action, resource_type, resource_id, outcome, reason_code,
      request_id, ip_hash, user_agent_hash, metadata
    ) VALUES (
      ${admin.id}, ${admin.name}, ${admin.email}, ${action}, 'admin_session', ${admin.session_id},
      ${outcome}, ${reasonCode}, ${requestIdentifier(request)}, ${ipHash}, ${userAgentHash},
      CAST(${JSON.stringify(metadata || {})} AS jsonb)
    )
  `;
}

async function listSessions(request, env) {
  const sql = neon(env.DATABASE_URL);
  const loaded = await loadAdminSession(sql, request);
  if (loaded.error) return json({ ok: false, code: "ADMIN_SESSION_INVALID" }, 401, { "Set-Cookie": clearAdminCookie() });
  const admin = loaded.session;
  const rows = await sql`
    SELECT id, created_at, last_used_at, idle_expires_at, expires_at,
           mfa_verified_at, step_up_verified_at, auth_method, revoked_at, revoke_reason
    FROM admin_sessions
    WHERE admin_account_id = ${admin.id}
      AND created_at >= NOW() - INTERVAL '30 days'
    ORDER BY created_at DESC, id DESC
    LIMIT 50
  `;
  return json({
    ok: true,
    sessions: rows.map(row => ({
      id: row.id,
      current: row.id === admin.session_id,
      created_at: row.created_at,
      last_used_at: row.last_used_at,
      idle_expires_at: row.idle_expires_at,
      expires_at: row.expires_at,
      mfa_verified: Boolean(row.mfa_verified_at),
      step_up_fresh: row.step_up_verified_at ? Date.now() - new Date(row.step_up_verified_at).getTime() <= adminSecurityPolicy.step_up_max_age_minutes * 60_000 : false,
      auth_method: row.auth_method,
      revoked: Boolean(row.revoked_at),
      revoke_reason: row.revoke_reason
    }))
  });
}

async function revokeSession(request, env, sessionId) {
  if (!sameOrigin(request)) return json({ ok: false, code: "ORIGIN_REJECTED" }, 403);
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return json({ ok: false, code: "INVALID_SESSION_ID" }, 400);
  const sql = neon(env.DATABASE_URL);
  const loaded = await loadAdminSession(sql, request, { touch: false });
  if (loaded.error) return json({ ok: false, code: "ADMIN_SESSION_INVALID" }, 401, { "Set-Cookie": clearAdminCookie() });
  const admin = loaded.session;
  const isCurrent = sessionId === admin.session_id;
  if (!isCurrent && !isStepUpFresh(admin)) {
    return json({ ok: false, code: "ADMIN_STEP_UP_REQUIRED", step_up_valid_for_minutes: adminSecurityPolicy.step_up_max_age_minutes }, 428);
  }
  const rows = await sql`
    UPDATE admin_sessions
    SET revoked_at = COALESCE(revoked_at, NOW()),
        revoke_reason = COALESCE(revoke_reason, ${isCurrent ? "self_revoke_current" : "self_revoke_other"})
    WHERE id = ${sessionId}
      AND admin_account_id = ${admin.id}
      AND revoked_at IS NULL
    RETURNING id
  `;
  if (!rows.length) return json({ ok: false, code: "SESSION_NOT_FOUND" }, 404);
  await audit(sql, request, admin, "admin.session.revoke", "success", isCurrent ? "current_session_revoked" : "other_session_revoked", { target_session_id: sessionId });
  return json({ ok: true, revoked: true, current: isCurrent }, 200, isCurrent ? { "Set-Cookie": clearAdminCookie() } : {});
}

async function securityEvents(request, env) {
  const sql = neon(env.DATABASE_URL);
  const loaded = await loadAdminSession(sql, request);
  if (loaded.error) return json({ ok: false, code: "ADMIN_SESSION_INVALID" }, 401, { "Set-Cookie": clearAdminCookie() });
  const admin = loaded.session;
  const rows = await sql`
    SELECT action, outcome, reason_code, metadata, created_at
    FROM admin_audit_logs
    WHERE admin_account_id = ${admin.id}
      AND (
        action LIKE 'admin.login%'
        OR action LIKE 'admin.mfa.%'
        OR action LIKE 'admin.step_up%'
        OR action LIKE 'admin.password.%'
        OR action LIKE 'admin.session%'
        OR action LIKE 'admin.sessions.%'
        OR action LIKE 'admin.recovery.%'
      )
    ORDER BY created_at DESC, id DESC
    LIMIT 30
  `;
  return json({
    ok: true,
    events: rows.map(row => ({
      action: row.action,
      outcome: row.outcome,
      reason_code: row.reason_code,
      metadata: row.metadata,
      created_at: row.created_at
    }))
  });
}

export async function handleAdminSessionSecurityApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/admin/security/")) return null;
  try {
    if (request.method === "GET" && url.pathname === "/api/admin/security/sessions") return listSessions(request, env);
    const revokeMatch = url.pathname.match(/^\/api\/admin\/security\/sessions\/([0-9a-f-]{36})\/revoke$/i);
    if (request.method === "POST" && revokeMatch) return revokeSession(request, env, revokeMatch[1]);
    if (request.method === "GET" && url.pathname === "/api/admin/security/events") return securityEvents(request, env);
    return json({ ok: false, code: "NOT_FOUND" }, 404);
  } catch (error) {
    console.error("Admin session security error:", error);
    return json({ ok: false, code: "ADMIN_SECURITY_ERROR", error: "Layanan keamanan session admin sementara tidak tersedia." }, 500);
  }
}
