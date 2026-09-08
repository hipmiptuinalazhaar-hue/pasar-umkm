import { Client, neon } from "@neondatabase/serverless";
import { ensureSupportInfrastructure, supportPolicy, supportTicketCode } from "./support-store.js";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_JSON_BYTES = 12 * 1024;

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

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const piece of header.split(";")) {
    const [key, ...rest] = piece.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

function uuid(value) {
  const id = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}

function text(value, max) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}

function category(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return supportPolicy.categories.includes(normalized) ? normalized : null;
}

async function parseJson(request) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) {
    return { response: fail("Permintaan terlalu besar.", 413, "REQUEST_TOO_LARGE") };
  }
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
    return { body };
  } catch {
    return { response: fail("Data permintaan tidak valid.", 400, "INVALID_JSON") };
  }
}

async function currentUser(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const rows = await sql`
    SELECT u.id, u.name, u.email, u.role::text AS role, u.avatar_url
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE
      s.token_hash = encode(digest(${token}, 'sha256'), 'hex')
      AND s.expires_at > NOW()
      AND u.is_active = TRUE
    LIMIT 1
  `;
  return rows[0] || null;
}

async function requireUser(sql, request) {
  const user = await currentUser(sql, request);
  return user
    ? { user }
    : { response: fail("Silakan masuk untuk menghubungi Customer Service.", 401, "AUTH_REQUIRED") };
}

async function withTransaction(env, work) {
  const client = new Client({ connectionString: env.DATABASE_URL });
  let started = false;
  try {
    await client.connect();
    await client.query("BEGIN");
    started = true;
    const result = await work(client);
    await client.query("COMMIT");
    started = false;
    return result;
  } catch (error) {
    if (started) {
      try { await client.query("ROLLBACK"); } catch (rollbackError) {
        console.error("Support rollback failed:", rollbackError);
      }
    }
    throw error;
  } finally {
    try { await client.end(); } catch {}
  }
}

function serializeTicket(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: supportTicketCode(row),
    category: row.category,
    subject: row.subject,
    status: row.status,
    priority: row.priority,
    order_id: row.order_id || null,
    order_number: row.order_number || null,
    store_id: row.store_id || null,
    store_name: row.store_name || null,
    unread: row.unread === true,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at || null,
    closed_at: row.closed_at || null
  };
}

async function ownTicket(sql, ticketId, userId, { lock = false } = {}) {
  const rows = lock
    ? await sql`
        SELECT t.*, o.order_number, s.name AS store_name
        FROM support_tickets t
        LEFT JOIN orders o ON o.id = t.order_id
        LEFT JOIN stores s ON s.id = t.store_id
        WHERE t.id = ${ticketId}::uuid AND t.user_id = ${userId}
        FOR UPDATE OF t
        LIMIT 1
      `
    : await sql`
        SELECT t.*, o.order_number, s.name AS store_name
        FROM support_tickets t
        LEFT JOIN orders o ON o.id = t.order_id
        LEFT JOIN stores s ON s.id = t.store_id
        WHERE t.id = ${ticketId}::uuid AND t.user_id = ${userId}
        LIMIT 1
      `;
  return rows[0] || null;
}

async function orderContext(sql, orderId, userId) {
  if (!orderId) return { orderId: null, storeId: null };
  const rows = await sql`
    SELECT o.id, o.store_id
    FROM orders o
    JOIN stores s ON s.id = o.store_id
    WHERE o.id = ${orderId}::uuid
      AND (o.buyer_id = ${userId} OR s.owner_id = ${userId})
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return { orderId: rows[0].id, storeId: rows[0].store_id };
}

async function defaultStore(sql, userId) {
  const rows = await sql`
    SELECT id FROM stores
    WHERE owner_id = ${userId}
    ORDER BY created_at ASC
    LIMIT 1
  `;
  return rows[0]?.id || null;
}

async function summary(sql, request) {
  const auth = await requireUser(sql, request);
  if (auth.response) return auth.response;
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed'))::int AS active_count,
      COUNT(*) FILTER (
        WHERE last_admin_message_at IS NOT NULL
          AND last_admin_message_at > COALESCE(user_last_read_at, '-infinity'::timestamptz)
      )::int AS unread_count,
      COUNT(*) FILTER (WHERE status = 'waiting_user')::int AS waiting_user_count
    FROM support_tickets
    WHERE user_id = ${auth.user.id}
  `;
  return json({ ok: true, support: rows[0] || { active_count: 0, unread_count: 0, waiting_user_count: 0 } });
}

async function listTickets(sql, request) {
  const auth = await requireUser(sql, request);
  if (auth.response) return auth.response;
  const rows = await sql`
    SELECT
      t.*, o.order_number, s.name AS store_name,
      (
        t.last_admin_message_at IS NOT NULL
        AND t.last_admin_message_at > COALESCE(t.user_last_read_at, '-infinity'::timestamptz)
      ) AS unread
    FROM support_tickets t
    LEFT JOIN orders o ON o.id = t.order_id
    LEFT JOIN stores s ON s.id = t.store_id
    WHERE t.user_id = ${auth.user.id}
    ORDER BY
      CASE WHEN t.status IN ('waiting_support','in_progress','waiting_user') THEN 0 ELSE 1 END,
      t.updated_at DESC,
      t.id DESC
    LIMIT 50
  `;
  return json({ ok: true, count: rows.length, tickets: rows.map(serializeTicket) });
}

async function createTicket(sql, request, env) {
  if (!sameOrigin(request)) return fail("Origin permintaan tidak valid.", 403, "ORIGIN_REJECTED");
  const auth = await requireUser(sql, request);
  if (auth.response) return auth.response;
  const parsed = await parseJson(request);
  if (parsed.response) return parsed.response;

  const kind = category(parsed.body.category);
  const subject = text(parsed.body.subject, supportPolicy.max_subject_chars);
  const message = text(parsed.body.message, supportPolicy.max_message_chars);
  const orderId = parsed.body.order_id ? uuid(parsed.body.order_id) : null;
  if (!kind) return fail("Kategori bantuan tidak valid.", 400, "INVALID_CATEGORY");
  if (subject.length < 4) return fail("Judul masalah minimal 4 karakter.", 400, "INVALID_SUBJECT");
  if (message.length < 2) return fail("Jelaskan masalah sedikit lebih lengkap.", 400, "INVALID_MESSAGE");
  if (parsed.body.order_id && !orderId) return fail("Pesanan terkait tidak valid.", 400, "INVALID_ORDER");

  const activeRows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed'))::int AS active_count,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '10 minutes')::int AS recent_count
    FROM support_tickets
    WHERE user_id = ${auth.user.id}
  `;
  const counts = activeRows[0] || {};
  if (Number(counts.active_count || 0) >= supportPolicy.max_active_tickets_per_user) {
    return fail("Selesaikan tiket aktif sebelum membuat pengaduan baru.", 409, "ACTIVE_TICKET_LIMIT");
  }
  if (Number(counts.recent_count || 0) >= 3) {
    return fail("Terlalu banyak tiket dibuat dalam waktu singkat.", 429, "SUPPORT_RATE_LIMITED");
  }

  const linked = await orderContext(sql, orderId, auth.user.id);
  if (orderId && !linked) return fail("Pesanan tidak ditemukan pada akun ini.", 403, "ORDER_NOT_OWNED");
  const storeId = linked?.storeId || (kind === "seller_verification" ? await defaultStore(sql, auth.user.id) : null);

  const result = await withTransaction(env, async client => {
    const ticketResult = await client.query(
      `INSERT INTO support_tickets (
        user_id, category, subject, order_id, store_id,
        status, priority, user_last_read_at, last_user_message_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,'waiting_support','normal',NOW(),NOW(),NOW())
      RETURNING *`,
      [auth.user.id, kind, subject, linked?.orderId || null, storeId]
    );
    const ticket = ticketResult.rows[0];
    await client.query(
      `INSERT INTO support_messages (ticket_id, sender_type, user_id, message)
       VALUES ($1,'user',$2,$3)`,
      [ticket.id, auth.user.id, message]
    );
    await client.query(
      `INSERT INTO support_ticket_events (ticket_id, actor_type, user_id, event_type, to_value)
       VALUES ($1,'user',$2,'ticket.created','waiting_support')`,
      [ticket.id, auth.user.id]
    );
    return ticket;
  });

  const complete = await ownTicket(sql, result.id, auth.user.id);
  return json({ ok: true, ticket: serializeTicket(complete) }, 201);
}

async function getTicket(sql, request, ticketId) {
  const auth = await requireUser(sql, request);
  if (auth.response) return auth.response;
  const ticket = await ownTicket(sql, ticketId, auth.user.id);
  if (!ticket) return fail("Tiket bantuan tidak ditemukan.", 404, "SUPPORT_TICKET_NOT_FOUND");

  await sql`
    UPDATE support_tickets
    SET user_last_read_at = NOW()
    WHERE id = ${ticketId}::uuid AND user_id = ${auth.user.id}
  `;
  const messages = await sql`
    SELECT
      m.id, m.sender_type, m.message, m.media_type, m.media_url, m.media_name,
      m.media_bytes, m.created_at,
      CASE
        WHEN m.sender_type = 'admin' THEN 'Customer Service Pasar UMKM'
        WHEN m.sender_type = 'system' THEN 'Pasar UMKM'
        ELSE u.name
      END AS sender_label
    FROM support_messages m
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.ticket_id = ${ticketId}::uuid
    ORDER BY m.created_at ASC, m.id ASC
    LIMIT 300
  `;
  return json({
    ok: true,
    ticket: serializeTicket({ ...ticket, unread: false }),
    messages
  });
}

async function sendMessage(sql, request, env, ticketId) {
  if (!sameOrigin(request)) return fail("Origin permintaan tidak valid.", 403, "ORIGIN_REJECTED");
  const auth = await requireUser(sql, request);
  if (auth.response) return auth.response;
  const parsed = await parseJson(request);
  if (parsed.response) return parsed.response;
  const message = text(parsed.body.message, supportPolicy.max_message_chars);
  if (message.length < 1) return fail("Pesan tidak boleh kosong.", 400, "INVALID_MESSAGE");

  const recentRows = await sql`
    SELECT COUNT(*)::int AS count
    FROM support_messages
    WHERE user_id = ${auth.user.id}
      AND sender_type = 'user'
      AND created_at >= NOW() - INTERVAL '1 minute'
  `;
  if (Number(recentRows[0]?.count || 0) >= supportPolicy.max_messages_per_minute) {
    return fail("Pesan dikirim terlalu cepat. Tunggu sebentar.", 429, "SUPPORT_RATE_LIMITED");
  }

  const outcome = await withTransaction(env, async client => {
    const locked = await client.query(
      `SELECT * FROM support_tickets WHERE id=$1 AND user_id=$2 FOR UPDATE`,
      [ticketId, auth.user.id]
    );
    const ticket = locked.rows[0];
    if (!ticket) return { error: "missing" };
    if (ticket.status === "closed") return { error: "closed" };

    const previousStatus = ticket.status;
    const nextStatus = "waiting_support";
    const messageResult = await client.query(
      `INSERT INTO support_messages (ticket_id, sender_type, user_id, message)
       VALUES ($1,'user',$2,$3)
       RETURNING id, sender_type, message, created_at`,
      [ticketId, auth.user.id, message]
    );
    await client.query(
      `UPDATE support_tickets SET
        status=$1,
        resolved_at=CASE WHEN $1='resolved' THEN resolved_at ELSE NULL END,
        last_user_message_at=NOW(), user_last_read_at=NOW(), updated_at=NOW()
       WHERE id=$2`,
      [nextStatus, ticketId]
    );
    if (previousStatus !== nextStatus) {
      await client.query(
        `INSERT INTO support_ticket_events
          (ticket_id, actor_type, user_id, event_type, from_value, to_value)
         VALUES ($1,'user',$2,'status.changed',$3,$4)`,
        [ticketId, auth.user.id, previousStatus, nextStatus]
      );
    }
    return { message: messageResult.rows[0] };
  });

  if (outcome.error === "missing") return fail("Tiket bantuan tidak ditemukan.", 404, "SUPPORT_TICKET_NOT_FOUND");
  if (outcome.error === "closed") return fail("Tiket ini sudah ditutup. Buat tiket baru jika masih membutuhkan bantuan.", 409, "SUPPORT_TICKET_CLOSED");
  return json({ ok: true, message: { ...outcome.message, sender_label: auth.user.name } }, 201);
}

async function closeTicket(sql, request, env, ticketId) {
  if (!sameOrigin(request)) return fail("Origin permintaan tidak valid.", 403, "ORIGIN_REJECTED");
  const auth = await requireUser(sql, request);
  if (auth.response) return auth.response;

  const outcome = await withTransaction(env, async client => {
    const rows = await client.query(
      `SELECT id,status FROM support_tickets WHERE id=$1 AND user_id=$2 FOR UPDATE`,
      [ticketId, auth.user.id]
    );
    if (!rows.rows[0]) return { error: "missing" };
    const before = rows.rows[0].status;
    if (before === "closed") return { status: "closed" };
    await client.query(
      `UPDATE support_tickets SET status='closed', closed_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [ticketId]
    );
    await client.query(
      `INSERT INTO support_ticket_events
        (ticket_id, actor_type, user_id, event_type, from_value, to_value)
       VALUES ($1,'user',$2,'status.changed',$3,'closed')`,
      [ticketId, auth.user.id, before]
    );
    return { status: "closed" };
  });

  if (outcome.error === "missing") return fail("Tiket bantuan tidak ditemukan.", 404, "SUPPORT_TICKET_NOT_FOUND");
  return json({ ok: true, status: "closed" });
}

export async function handleSupportApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/support/")) return null;

  try {
    const sql = neon(env.DATABASE_URL);
    await ensureSupportInfrastructure(sql);

    if (url.pathname === "/api/support/summary" && request.method === "GET") {
      return await summary(sql, request);
    }
    if (url.pathname === "/api/support/tickets") {
      if (request.method === "GET") return await listTickets(sql, request);
      if (request.method === "POST") return await createTicket(sql, request, env);
      return fail("Metode tidak didukung.", 405, "METHOD_NOT_ALLOWED");
    }

    const ticketMatch = url.pathname.match(/^\/api\/support\/tickets\/([0-9a-f-]{36})$/i);
    if (ticketMatch) {
      const ticketId = uuid(ticketMatch[1]);
      if (!ticketId) return fail("Tiket tidak valid.", 400, "INVALID_TICKET_ID");
      if (request.method === "GET") return await getTicket(sql, request, ticketId);
      return fail("Metode tidak didukung.", 405, "METHOD_NOT_ALLOWED");
    }

    const messageMatch = url.pathname.match(/^\/api\/support\/tickets\/([0-9a-f-]{36})\/messages$/i);
    if (messageMatch && request.method === "POST") {
      const ticketId = uuid(messageMatch[1]);
      if (!ticketId) return fail("Tiket tidak valid.", 400, "INVALID_TICKET_ID");
      return await sendMessage(sql, request, env, ticketId);
    }

    const closeMatch = url.pathname.match(/^\/api\/support\/tickets\/([0-9a-f-]{36})\/close$/i);
    if (closeMatch && request.method === "POST") {
      const ticketId = uuid(closeMatch[1]);
      if (!ticketId) return fail("Tiket tidak valid.", 400, "INVALID_TICKET_ID");
      return await closeTicket(sql, request, env, ticketId);
    }

    return fail("Endpoint Customer Service tidak ditemukan.", 404, "SUPPORT_ROUTE_NOT_FOUND");
  } catch (error) {
    if (error?.code === "SCHEMA_NOT_READY") {
      return fail("Customer Service sedang disiapkan. Coba kembali sebentar lagi.", 503, "SUPPORT_SCHEMA_NOT_READY");
    }
    console.error("Support API error:", error);
    return fail("Customer Service sedang mengalami gangguan.", 500, "SUPPORT_INTERNAL_ERROR");
  }
}
