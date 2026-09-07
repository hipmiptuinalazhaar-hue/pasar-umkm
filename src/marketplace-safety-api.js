import { neon } from "@neondatabase/serverless";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 8192;
const REPORT_CATEGORIES = new Set(["spam","fraud","prohibited_item","harassment","misleading","order_issue","other"]);
const REPORT_SUBJECTS = new Set(["user","store","product","post","order"]);
const DISPUTE_REASONS = new Set(["item_not_received","item_not_as_described","seller_issue","payment_or_total_issue","other"]);

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      ...headers
    }
  });
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}

async function parseBody(request) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { error: json({ ok: false, code: "REQUEST_TOO_LARGE", error: "Request terlalu besar." }, 413) };
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: json({ ok: false, code: "INVALID_REQUEST", error: "Data tidak valid." }, 400) };
  }
  return { body };
}

async function authenticate(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return { response: json({ ok: false, code: "AUTH_REQUIRED", error: "Silakan login terlebih dahulu." }, 401) };
  const sql = neon(env.DATABASE_URL);
  const rows = await sql`
    SELECT s.id AS session_id, u.id, u.name, u.email, u.role::text AS role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = encode(digest(${token}, 'sha256'), 'hex')
      AND s.expires_at > NOW()
      AND u.is_active = TRUE
    LIMIT 1
  `;
  if (!rows[0]) return { response: json({ ok: false, code: "AUTH_REQUIRED", error: "Session tidak valid atau sudah berakhir." }, 401) };
  await sql`UPDATE sessions SET last_used_at = NOW() WHERE id = ${rows[0].session_id}`;
  return { sql, user: rows[0] };
}

async function subjectExists(sql, subjectType, subjectId, userId) {
  if (subjectType === "user") return (await sql`SELECT EXISTS(SELECT 1 FROM users WHERE id=${subjectId}::uuid) AS ok`)[0]?.ok === true;
  if (subjectType === "store") return (await sql`SELECT EXISTS(SELECT 1 FROM stores WHERE id=${subjectId}::uuid) AS ok`)[0]?.ok === true;
  if (subjectType === "product") return (await sql`SELECT EXISTS(SELECT 1 FROM products WHERE id=${subjectId}::uuid) AS ok`)[0]?.ok === true;
  if (subjectType === "post") return (await sql`SELECT EXISTS(SELECT 1 FROM posts WHERE id=${subjectId}::uuid) AS ok`)[0]?.ok === true;
  if (subjectType === "order") return (await sql`SELECT EXISTS(SELECT 1 FROM orders WHERE id=${subjectId}::uuid AND buyer_id=${userId}::uuid) AS ok`)[0]?.ok === true;
  return false;
}

async function createReport(request, env) {
  const auth = await authenticate(request, env);
  if (auth.response) return auth.response;
  const parsed = await parseBody(request);
  if (parsed.error) return parsed.error;

  const subjectType = String(parsed.body.subject_type || "").trim();
  const subjectId = String(parsed.body.subject_id || "").trim();
  const category = String(parsed.body.category || "").trim();
  const details = String(parsed.body.details || "").trim();
  if (!REPORT_SUBJECTS.has(subjectType) || !UUID_PATTERN.test(subjectId) || !REPORT_CATEGORIES.has(category) || details.length < 20 || details.length > 1000) {
    return json({ ok: false, code: "INVALID_REPORT", error: "Laporan tidak valid." }, 400);
  }
  if (!(await subjectExists(auth.sql, subjectType, subjectId, auth.user.id))) {
    return json({ ok: false, code: "REPORT_SUBJECT_NOT_FOUND", error: "Objek laporan tidak ditemukan atau tidak dapat dilaporkan." }, 404);
  }

  try {
    const rows = await auth.sql`
      WITH inserted AS (
        INSERT INTO moderation_reports(reporter_user_id, subject_type, subject_id, category, details)
        VALUES(${auth.user.id}, ${subjectType}, ${subjectId}::uuid, ${category}, ${details})
        RETURNING id, subject_type, subject_id, category, status, priority, created_at
      ), event AS (
        INSERT INTO marketplace_case_events(case_type, case_id, actor_type, actor_user_id, event_type, note)
        SELECT 'report', id, 'user', ${auth.user.id}, 'report.created', ${category} FROM inserted
      )
      SELECT * FROM inserted
    `;
    return json({ ok: true, report: rows[0] }, 201);
  } catch (error) {
    if (error?.code === "23505") return json({ ok: false, code: "REPORT_ALREADY_OPEN", error: "Laporan aktif untuk objek dan kategori ini sudah ada." }, 409);
    throw error;
  }
}

async function listMyReports(request, env, url) {
  const auth = await authenticate(request, env);
  if (auth.response) return auth.response;
  const limit = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "24", 10) || 24));
  const rows = await auth.sql`
    SELECT id, subject_type, subject_id, category, status, priority, resolution_note, resolved_at, created_at, updated_at
    FROM moderation_reports
    WHERE reporter_user_id=${auth.user.id}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}
  `;
  return json({ ok: true, reports: rows });
}

async function createDispute(request, env) {
  const auth = await authenticate(request, env);
  if (auth.response) return auth.response;
  const parsed = await parseBody(request);
  if (parsed.error) return parsed.error;
  const orderId = String(parsed.body.order_id || "").trim();
  const reasonCode = String(parsed.body.reason_code || "").trim();
  const description = String(parsed.body.description || "").trim();
  if (!UUID_PATTERN.test(orderId) || !DISPUTE_REASONS.has(reasonCode) || description.length < 20 || description.length > 1500) {
    return json({ ok: false, code: "INVALID_DISPUTE", error: "Data sengketa tidak valid." }, 400);
  }

  const orderRows = await auth.sql`
    SELECT id, store_id, status::text AS status
    FROM orders
    WHERE id=${orderId}::uuid AND buyer_id=${auth.user.id}
    LIMIT 1
  `;
  const order = orderRows[0];
  if (!order) return json({ ok: false, code: "ORDER_NOT_FOUND", error: "Pesanan tidak ditemukan." }, 404);
  if (order.status === "cancelled") return json({ ok: false, code: "DISPUTE_NOT_ALLOWED", error: "Pesanan yang sudah dibatalkan tidak dapat membuka sengketa baru." }, 409);

  try {
    const rows = await auth.sql`
      WITH inserted AS (
        INSERT INTO order_disputes(order_id, buyer_id, store_id, reason_code, description)
        VALUES(${order.id}, ${auth.user.id}, ${order.store_id}, ${reasonCode}, ${description})
        RETURNING id, order_id, store_id, reason_code, status, created_at
      ), event AS (
        INSERT INTO marketplace_case_events(case_type, case_id, actor_type, actor_user_id, event_type, note)
        SELECT 'dispute', id, 'user', ${auth.user.id}, 'dispute.opened', ${reasonCode} FROM inserted
      )
      SELECT * FROM inserted
    `;
    return json({ ok: true, dispute: rows[0], financial_action: "none" }, 201);
  } catch (error) {
    if (error?.code === "23505") return json({ ok: false, code: "DISPUTE_ALREADY_EXISTS", error: "Pesanan ini sudah memiliki kasus sengketa." }, 409);
    throw error;
  }
}

async function listMyDisputes(request, env) {
  const auth = await authenticate(request, env);
  if (auth.response) return auth.response;
  const rows = await auth.sql`
    SELECT d.id, d.order_id, d.store_id, s.name AS store_name, d.reason_code, d.description,
           d.status, d.seller_response, d.resolution_note, d.resolved_at, d.created_at, d.updated_at
    FROM order_disputes d
    JOIN stores s ON s.id=d.store_id
    WHERE d.buyer_id=${auth.user.id}
    ORDER BY d.created_at DESC, d.id DESC
    LIMIT 50
  `;
  return json({ ok: true, disputes: rows });
}

async function sellerRespond(request, env, disputeId) {
  const auth = await authenticate(request, env);
  if (auth.response) return auth.response;
  const parsed = await parseBody(request);
  if (parsed.error) return parsed.error;
  const response = String(parsed.body.response || "").trim();
  if (!UUID_PATTERN.test(disputeId) || response.length < 20 || response.length > 1500) {
    return json({ ok: false, code: "INVALID_RESPONSE", error: "Tanggapan penjual tidak valid." }, 400);
  }
  const rows = await auth.sql`
    WITH updated AS (
      UPDATE order_disputes d
      SET seller_response=${response}, status='seller_response', updated_at=NOW()
      FROM stores s
      WHERE d.id=${disputeId}::uuid
        AND s.id=d.store_id
        AND s.owner_id=${auth.user.id}
        AND d.status IN ('open','seller_response')
      RETURNING d.id, d.order_id, d.status, d.seller_response, d.updated_at
    ), event AS (
      INSERT INTO marketplace_case_events(case_type, case_id, actor_type, actor_user_id, event_type, note)
      SELECT 'dispute', id, 'seller', ${auth.user.id}, 'dispute.seller_response', LEFT(${response}, 300) FROM updated
    )
    SELECT * FROM updated
  `;
  if (!rows[0]) return json({ ok: false, code: "DISPUTE_NOT_ACTIONABLE", error: "Kasus tidak ditemukan atau tidak dapat ditanggapi." }, 404);
  return json({ ok: true, dispute: rows[0] });
}

async function submitVerification(request, env) {
  const auth = await authenticate(request, env);
  if (auth.response) return auth.response;
  const parsed = await parseBody(request);
  if (parsed.error) return parsed.error;
  const storeId = String(parsed.body.store_id || "").trim();
  const businessName = String(parsed.body.business_name || "").trim();
  const ownerName = String(parsed.body.owner_name || "").trim();
  const contactPhone = String(parsed.body.contact_phone || "").trim();
  const businessAddress = String(parsed.body.business_address || "").trim();
  const registrationNumber = String(parsed.body.registration_number || "").trim().slice(0, 120) || null;
  const evidenceNote = String(parsed.body.evidence_note || "").trim().slice(0, 1000) || null;
  if (!UUID_PATTERN.test(storeId) || businessName.length < 2 || businessName.length > 160 || ownerName.length < 2 || ownerName.length > 160 || contactPhone.length < 8 || contactPhone.length > 32 || businessAddress.length < 10 || businessAddress.length > 800) {
    return json({ ok: false, code: "INVALID_VERIFICATION_SUBMISSION", error: "Data verifikasi UMKM belum lengkap atau tidak valid." }, 400);
  }

  const owned = await auth.sql`SELECT id, verification_status::text AS verification_status FROM stores WHERE id=${storeId}::uuid AND owner_id=${auth.user.id} LIMIT 1`;
  if (!owned[0]) return json({ ok: false, code: "STORE_NOT_FOUND", error: "Toko tidak ditemukan." }, 404);
  if (owned[0].verification_status === "verified") return json({ ok: false, code: "STORE_ALREADY_VERIFIED", error: "Toko sudah terverifikasi." }, 409);

  try {
    const rows = await auth.sql`
      WITH inserted AS (
        INSERT INTO store_verification_submissions(store_id, submitted_by_user_id, business_name, owner_name, contact_phone, business_address, registration_number, evidence_note)
        VALUES(${storeId}::uuid, ${auth.user.id}, ${businessName}, ${ownerName}, ${contactPhone}, ${businessAddress}, ${registrationNumber}, ${evidenceNote})
        RETURNING id, store_id, status, created_at
      ), reset_store AS (
        UPDATE stores SET verification_status='pending', verified_at=NULL, updated_at=NOW()
        WHERE id=${storeId}::uuid
      ), event AS (
        INSERT INTO marketplace_case_events(case_type, case_id, actor_type, actor_user_id, event_type, note)
        SELECT 'verification', id, 'seller', ${auth.user.id}, 'verification.submitted', ${businessName} FROM inserted
      )
      SELECT * FROM inserted
    `;
    return json({ ok: true, submission: rows[0] }, 201);
  } catch (error) {
    if (error?.code === "23505") return json({ ok: false, code: "VERIFICATION_ALREADY_PENDING", error: "Pengajuan verifikasi toko ini masih menunggu pemeriksaan." }, 409);
    throw error;
  }
}

async function myVerification(request, env, url) {
  const auth = await authenticate(request, env);
  if (auth.response) return auth.response;
  const storeId = String(url.searchParams.get("store_id") || "").trim();
  if (!UUID_PATTERN.test(storeId)) return json({ ok: false, code: "INVALID_STORE_ID" }, 400);
  const rows = await auth.sql`
    SELECT v.id, v.store_id, v.business_name, v.owner_name, v.contact_phone, v.business_address,
           v.registration_number, v.evidence_note, v.status, v.review_note, v.reviewed_at, v.created_at, v.updated_at
    FROM store_verification_submissions v
    JOIN stores s ON s.id=v.store_id
    WHERE v.store_id=${storeId}::uuid AND s.owner_id=${auth.user.id}
    ORDER BY v.created_at DESC
    LIMIT 1
  `;
  return json({ ok: true, submission: rows[0] || null });
}

export async function handleMarketplaceSafetyApi(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  if (url.pathname === "/api/reports" && method === "POST") return createReport(request, env);
  if (url.pathname === "/api/reports/me" && method === "GET") return listMyReports(request, env, url);
  if (url.pathname === "/api/disputes" && method === "POST") return createDispute(request, env);
  if (url.pathname === "/api/disputes/me" && method === "GET") return listMyDisputes(request, env);
  const sellerResponseMatch = url.pathname.match(/^\/api\/disputes\/([0-9a-f-]{36})\/seller-response$/i);
  if (sellerResponseMatch && method === "POST") return sellerRespond(request, env, sellerResponseMatch[1]);
  if (url.pathname === "/api/store-verification/submissions" && method === "POST") return submitVerification(request, env);
  if (url.pathname === "/api/store-verification/submissions/me" && method === "GET") return myVerification(request, env, url);
  return null;
}

export const marketplaceSafetyContract = Object.freeze({
  report_subjects: [...REPORT_SUBJECTS],
  report_categories: [...REPORT_CATEGORIES],
  dispute_reasons: [...DISPUTE_REASONS],
  refunds_or_fund_moves: false,
  production_mutations_require_authenticated_user: true
});
