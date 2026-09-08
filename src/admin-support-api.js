import { requireAdminPermission } from "./admin-authorization.js";
import { ensureSupportInfrastructure, supportPolicy, supportTicketCode } from "./support-store.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 12 * 1024;
const MAX_QUERY = 100;

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

function fail(error, status = 400, code = "INVALID_REQUEST") {
  return json({ ok: false, error, code }, status);
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

function uuid(value) {
  const id = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}

function normalize(value, max = MAX_QUERY) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}

function parseLimit(value) {
  const parsed = Number.parseInt(String(value || 30), 10);
  return Number.isFinite(parsed) ? Math.min(50, Math.max(1, parsed)) : 30;
}

async function parseJson(request) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { response: fail("Request terlalu besar.", 413, "REQUEST_TOO_LARGE") };
  }
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
    return { body };
  } catch {
    return { response: fail("Data tidak valid.", 400, "INVALID_JSON") };
  }
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function auditSignals(request) {
  const address = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
  const userAgent = request.headers.get("User-Agent") || "unknown";
  const [ipHash, userAgentHash] = await Promise.all([sha256Hex(address), sha256Hex(userAgent)]);
  return {
    ipHash,
    userAgentHash,
    requestId: (request.headers.get("CF-Ray") || request.headers.get("X-Request-ID") || crypto.randomUUID()).slice(0, 128)
  };
}

async function audit(sql, request, admin, action, ticketId, metadata = {}) {
  const signals = await auditSignals(request);
  await sql`
    INSERT INTO admin_audit_logs (
      admin_account_id, actor_name_snapshot, actor_email_snapshot,
      action, resource_type, resource_id, outcome, reason_code,
      request_id, ip_hash, user_agent_hash, metadata
    ) VALUES (
      ${admin.id}, ${admin.name}, ${admin.email},
      ${action}, 'support_ticket', ${ticketId}, 'success', NULL,
      ${signals.requestId}, ${signals.ipHash}, ${signals.userAgentHash},
      CAST(${JSON.stringify(metadata)} AS jsonb)
    )
  `;
}

async function authorize(request, env, permission) {
  const result = await requireAdminPermission(request, env, permission);
  if (!result.ok) return { response: result.response };
  try {
    await ensureSupportInfrastructure(result.sql);
  } catch (error) {
    if (error?.code === "SCHEMA_NOT_READY") {
      return { response: fail("Customer Support schema belum siap.", 503, "SUPPORT_SCHEMA_NOT_READY") };
    }
    throw error;
  }
  return result;
}

function serialize(row) {
  return {
    id: row.id,
    code: supportTicketCode(row),
    category: row.category,
    subject: row.subject,
    status: row.status,
    priority: row.priority,
    unread: row.unread === true,
    user: {
      id: row.user_id,
      name: row.user_name,
      email: row.user_email,
      role: row.user_role,
      avatar_url: row.user_avatar_url || null
    },
    order: row.order_id ? {
      id: row.order_id,
      number: row.order_number,
      status: row.order_status || null,
      fulfillment_status: row.fulfillment_status || null,
      payment_method: row.payment_method || null
    } : null,
    store: row.store_id ? { id: row.store_id, name: row.store_name || null } : null,
    assignee: row.assigned_admin_id ? { id: row.assigned_admin_id, name: row.assigned_admin_name || "Administrator" } : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at || null,
    closed_at: row.closed_at || null
  };
}

async function listTickets(request, env, url) {
  const authz = await authorize(request, env, "support.view");
  if (authz.response) return authz.response;
  const statusParam = normalize(url.searchParams.get("status") || "all", 24);
  const categoryParam = normalize(url.searchParams.get("category") || "all", 32);
  const priorityParam = normalize(url.searchParams.get("priority") || "all", 12);
  const q = normalize(url.searchParams.get("q"));
  const limit = parseLimit(url.searchParams.get("limit"));
  const status = statusParam === "all" || supportPolicy.statuses.includes(statusParam) ? statusParam : "all";
  const category = categoryParam === "all" || supportPolicy.categories.includes(categoryParam) ? categoryParam : "all";
  const priority = priorityParam === "all" || supportPolicy.priorities.includes(priorityParam) ? priorityParam : "all";

  const rows = await authz.sql`
    SELECT
      t.*, u.name AS user_name, u.email AS user_email, u.role::text AS user_role,
      u.avatar_url AS user_avatar_url,
      o.order_number, o.status::text AS order_status, o.fulfillment_status, o.payment_method,
      s.name AS store_name,
      aa.name AS assigned_admin_name,
      (
        t.last_user_message_at IS NOT NULL
        AND t.last_user_message_at > COALESCE(t.admin_last_read_at, '-infinity'::timestamptz)
      ) AS unread
    FROM support_tickets t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN orders o ON o.id = t.order_id
    LEFT JOIN stores s ON s.id = t.store_id
    LEFT JOIN admin_accounts aa ON aa.id = t.assigned_admin_id
    WHERE (${status} = 'all' OR t.status = ${status})
      AND (${category} = 'all' OR t.category = ${category})
      AND (${priority} = 'all' OR t.priority = ${priority})
      AND (
        ${q} = ''
        OR u.name ILIKE ${`%${q}%`}
        OR u.email ILIKE ${`%${q}%`}
        OR t.subject ILIKE ${`%${q}%`}
        OR COALESCE(o.order_number, '') ILIKE ${`%${q}%`}
        OR CAST(t.ticket_no AS text) ILIKE ${`%${q}%`}
      )
    ORDER BY
      CASE t.status WHEN 'waiting_support' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'waiting_user' THEN 2 WHEN 'resolved' THEN 3 ELSE 4 END,
      CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      t.updated_at DESC,
      t.id DESC
    LIMIT ${limit}
  `;

  const metricsRows = await authz.sql`
    SELECT
      COUNT(*) FILTER (WHERE status='waiting_support')::int AS waiting_support,
      COUNT(*) FILTER (WHERE status='in_progress')::int AS in_progress,
      COUNT(*) FILTER (WHERE status='waiting_user')::int AS waiting_user,
      COUNT(*) FILTER (WHERE status='resolved' AND resolved_at >= NOW()-INTERVAL '7 days')::int AS resolved_7d,
      COUNT(*) FILTER (
        WHERE last_user_message_at IS NOT NULL
          AND last_user_message_at > COALESCE(admin_last_read_at, '-infinity'::timestamptz)
      )::int AS unread
    FROM support_tickets
  `;

  return json({ ok: true, metrics: metricsRows[0] || {}, tickets: rows.map(serialize) });
}

async function ticketDetail(request, env, ticketId) {
  const authz = await authorize(request, env, "support.view");
  if (authz.response) return authz.response;
  const rows = await authz.sql`
    SELECT
      t.*, u.name AS user_name, u.email AS user_email, u.role::text AS user_role,
      u.avatar_url AS user_avatar_url,
      o.order_number, o.status::text AS order_status, o.fulfillment_status, o.payment_method,
      s.name AS store_name, aa.name AS assigned_admin_name,
      FALSE AS unread
    FROM support_tickets t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN orders o ON o.id = t.order_id
    LEFT JOIN stores s ON s.id = t.store_id
    LEFT JOIN admin_accounts aa ON aa.id = t.assigned_admin_id
    WHERE t.id = ${ticketId}::uuid
    LIMIT 1
  `;
  if (!rows[0]) return fail("Tiket tidak ditemukan.", 404, "SUPPORT_TICKET_NOT_FOUND");

  await authz.sql`UPDATE support_tickets SET admin_last_read_at=NOW() WHERE id=${ticketId}::uuid`;
  const messages = await authz.sql`
    SELECT
      m.id, m.sender_type, m.message, m.media_type, m.media_url, m.media_name,
      m.media_bytes, m.created_at,
      CASE
        WHEN m.sender_type='admin' THEN COALESCE(aa.name, 'Customer Service')
        WHEN m.sender_type='system' THEN 'Pasar UMKM'
        ELSE u.name
      END AS sender_label
    FROM support_messages m
    LEFT JOIN users u ON u.id=m.user_id
    LEFT JOIN admin_accounts aa ON aa.id=m.admin_account_id
    WHERE m.ticket_id=${ticketId}::uuid
    ORDER BY m.created_at ASC, m.id ASC
    LIMIT 500
  `;
  const notes = await authz.sql`
    SELECT n.id, n.note, n.created_at, aa.name AS admin_name
    FROM support_internal_notes n
    JOIN admin_accounts aa ON aa.id=n.admin_account_id
    WHERE n.ticket_id=${ticketId}::uuid
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT 100
  `;
  return json({ ok: true, ticket: serialize(rows[0]), messages, notes });
}

async function reply(request, env, ticketId) {
  if (!sameOrigin(request)) return fail("Origin permintaan tidak valid.", 403, "ORIGIN_REJECTED");
  const authz = await authorize(request, env, "support.reply");
  if (authz.response) return authz.response;
  const parsed = await parseJson(request);
  if (parsed.response) return parsed.response;
  const message = normalize(parsed.body.message, supportPolicy.max_message_chars);
  if (!message) return fail("Balasan tidak boleh kosong.", 400, "INVALID_MESSAGE");

  const tickets = await authz.sql`
    SELECT id,status,assigned_admin_id FROM support_tickets
    WHERE id=${ticketId}::uuid
    FOR UPDATE
  `;
  const ticket = tickets[0];
  if (!ticket) return fail("Tiket tidak ditemukan.", 404, "SUPPORT_TICKET_NOT_FOUND");
  if (ticket.status === "closed") return fail("Tiket sudah ditutup. Buka kembali sebelum membalas.", 409, "SUPPORT_TICKET_CLOSED");

  await authz.sql`
    INSERT INTO support_messages (ticket_id,sender_type,admin_account_id,message)
    VALUES (${ticketId}::uuid,'admin',${authz.session.id},${message})
  `;
  const before = ticket.status;
  await authz.sql`
    UPDATE support_tickets SET
      status='waiting_user',
      assigned_admin_id=COALESCE(assigned_admin_id,${authz.session.id}),
      last_admin_message_at=NOW(), admin_last_read_at=NOW(),
      resolved_at=NULL, updated_at=NOW()
    WHERE id=${ticketId}::uuid
  `;
  if (before !== "waiting_user") {
    await authz.sql`
      INSERT INTO support_ticket_events
        (ticket_id,actor_type,admin_account_id,event_type,from_value,to_value)
      VALUES (${ticketId}::uuid,'admin',${authz.session.id},'status.changed',${before},'waiting_user')
    `;
  }
  await audit(authz.sql, request, authz.session, "support.reply", ticketId, { from_status: before, to_status: "waiting_user" });
  return json({ ok: true, status: "waiting_user" }, 201);
}

async function updateTicket(request, env, ticketId) {
  if (!sameOrigin(request)) return fail("Origin permintaan tidak valid.", 403, "ORIGIN_REJECTED");
  const authz = await authorize(request, env, "support.manage");
  if (authz.response) return authz.response;
  const parsed = await parseJson(request);
  if (parsed.response) return parsed.response;

  const nextStatus = parsed.body.status == null ? null : normalize(parsed.body.status, 24);
  const nextPriority = parsed.body.priority == null ? null : normalize(parsed.body.priority, 12);
  const assignment = parsed.body.assignment == null ? "keep" : normalize(parsed.body.assignment, 16);
  if (nextStatus && !supportPolicy.statuses.includes(nextStatus)) return fail("Status tidak valid.", 400, "INVALID_STATUS");
  if (nextPriority && !supportPolicy.priorities.includes(nextPriority)) return fail("Prioritas tidak valid.", 400, "INVALID_PRIORITY");
  if (!['keep','self','unassigned'].includes(assignment)) return fail("Penugasan tidak valid.", 400, "INVALID_ASSIGNMENT");

  const rows = await authz.sql`
    SELECT id,status,priority,assigned_admin_id FROM support_tickets
    WHERE id=${ticketId}::uuid
    FOR UPDATE
  `;
  const ticket = rows[0];
  if (!ticket) return fail("Tiket tidak ditemukan.", 404, "SUPPORT_TICKET_NOT_FOUND");
  const status = nextStatus || ticket.status;
  const priority = nextPriority || ticket.priority;
  const assignee = assignment === 'self' ? authz.session.id : assignment === 'unassigned' ? null : ticket.assigned_admin_id;

  await authz.sql`
    UPDATE support_tickets SET
      status=${status}, priority=${priority}, assigned_admin_id=${assignee},
      resolved_at=CASE WHEN ${status}='resolved' THEN COALESCE(resolved_at,NOW()) ELSE NULL END,
      closed_at=CASE WHEN ${status}='closed' THEN COALESCE(closed_at,NOW()) ELSE NULL END,
      updated_at=NOW()
    WHERE id=${ticketId}::uuid
  `;
  if (status !== ticket.status) {
    await authz.sql`
      INSERT INTO support_ticket_events
        (ticket_id,actor_type,admin_account_id,event_type,from_value,to_value)
      VALUES (${ticketId}::uuid,'admin',${authz.session.id},'status.changed',${ticket.status},${status})
    `;
  }
  if (priority !== ticket.priority) {
    await authz.sql`
      INSERT INTO support_ticket_events
        (ticket_id,actor_type,admin_account_id,event_type,from_value,to_value)
      VALUES (${ticketId}::uuid,'admin',${authz.session.id},'priority.changed',${ticket.priority},${priority})
    `;
  }
  if (String(assignee || '') !== String(ticket.assigned_admin_id || '')) {
    await authz.sql`
      INSERT INTO support_ticket_events
        (ticket_id,actor_type,admin_account_id,event_type,from_value,to_value)
      VALUES (${ticketId}::uuid,'admin',${authz.session.id},'assignment.changed',${ticket.assigned_admin_id || null},${assignee || null})
    `;
  }
  await audit(authz.sql, request, authz.session, "support.manage", ticketId, {
    status, priority, assignment,
    previous_status: ticket.status,
    previous_priority: ticket.priority
  });
  return json({ ok: true, status, priority, assigned_admin_id: assignee });
}

async function addNote(request, env, ticketId) {
  if (!sameOrigin(request)) return fail("Origin permintaan tidak valid.", 403, "ORIGIN_REJECTED");
  const authz = await authorize(request, env, "support.manage");
  if (authz.response) return authz.response;
  const parsed = await parseJson(request);
  if (parsed.response) return parsed.response;
  const note = normalize(parsed.body.note, 4000);
  if (note.length < 2) return fail("Catatan terlalu pendek.", 400, "INVALID_NOTE");
  const exists = await authz.sql`SELECT id FROM support_tickets WHERE id=${ticketId}::uuid LIMIT 1`;
  if (!exists[0]) return fail("Tiket tidak ditemukan.", 404, "SUPPORT_TICKET_NOT_FOUND");
  await authz.sql`
    INSERT INTO support_internal_notes(ticket_id,admin_account_id,note)
    VALUES (${ticketId}::uuid,${authz.session.id},${note})
  `;
  await audit(authz.sql, request, authz.session, "support.note", ticketId, { note_length: note.length });
  return json({ ok: true }, 201);
}

export async function handleAdminSupportApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/admin/support/")) return null;
  try {
    if (url.pathname === "/api/admin/support/tickets" && request.method === "GET") {
      return await listTickets(request, env, url);
    }
    const ticketMatch = url.pathname.match(/^\/api\/admin\/support\/tickets\/([0-9a-f-]{36})$/i);
    if (ticketMatch) {
      const id = uuid(ticketMatch[1]);
      if (!id) return fail("ID tiket tidak valid.", 400, "INVALID_TICKET_ID");
      if (request.method === "GET") return await ticketDetail(request, env, id);
      if (request.method === "PATCH") return await updateTicket(request, env, id);
      return fail("Metode tidak didukung.", 405, "METHOD_NOT_ALLOWED");
    }
    const replyMatch = url.pathname.match(/^\/api\/admin\/support\/tickets\/([0-9a-f-]{36})\/messages$/i);
    if (replyMatch && request.method === "POST") {
      const id = uuid(replyMatch[1]);
      if (!id) return fail("ID tiket tidak valid.", 400, "INVALID_TICKET_ID");
      return await reply(request, env, id);
    }
    const noteMatch = url.pathname.match(/^\/api\/admin\/support\/tickets\/([0-9a-f-]{36})\/notes$/i);
    if (noteMatch && request.method === "POST") {
      const id = uuid(noteMatch[1]);
      if (!id) return fail("ID tiket tidak valid.", 400, "INVALID_TICKET_ID");
      return await addNote(request, env, id);
    }
    return fail("Endpoint support admin tidak ditemukan.", 404, "ADMIN_SUPPORT_ROUTE_NOT_FOUND");
  } catch (error) {
    console.error("Admin support API error:", error);
    return fail("Customer Support admin sedang mengalami gangguan.", 500, "ADMIN_SUPPORT_INTERNAL_ERROR");
  }
}
