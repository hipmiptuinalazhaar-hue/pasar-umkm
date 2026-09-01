import { neon } from "@neondatabase/serverless";
import { ensureBusinessAgencyInfrastructure } from "./business-agency-store.js";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function error(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";

  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || null;
  }

  return null;
}

function uuid(value) {
  const id = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}

async function currentUser(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const rows = await sql`
    SELECT u.id, u.name, u.role
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

async function userStore(sql, userId) {
  const rows = await sql`
    SELECT id, name
    FROM stores
    WHERE owner_id = ${userId} AND is_active = TRUE
    ORDER BY created_at ASC
    LIMIT 1
  `;

  return rows[0] || null;
}

async function listEntries(sql, userId) {
  const entries = await sql`
    SELECT
      id,
      entry_type,
      amount,
      category,
      description,
      entry_date,
      created_at
    FROM business_cash_entries
    WHERE user_id = ${userId}
    ORDER BY entry_date DESC, created_at DESC
    LIMIT 1000
  `;

  const summaryRows = await sql`
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE entry_type = 'income'), 0) AS total_income,
      COALESCE(SUM(amount) FILTER (WHERE entry_type = 'expense'), 0) AS total_expense,
      COALESCE(SUM(CASE WHEN entry_type = 'income' THEN amount ELSE -amount END), 0) AS balance
    FROM business_cash_entries
    WHERE user_id = ${userId}
  `;

  return {
    entries,
    summary: summaryRows[0] || {
      total_income: 0,
      total_expense: 0,
      balance: 0
    }
  };
}

export async function handleBusinessAgencyApi(request, env) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/business-agency/")) {
    return null;
  }

  try {
    const sql = neon(env.DATABASE_URL);
    await ensureBusinessAgencyInfrastructure(sql);

    const user = await currentUser(sql, request);
    if (!user) return error("Silakan masuk terlebih dahulu.", 401);

    const store = await userStore(sql, user.id);

    if (url.pathname === "/api/business-agency/cashbook" && request.method === "GET") {
      return json({
        ok: true,
        user,
        store,
        ...(await listEntries(sql, user.id))
      });
    }

    if (url.pathname === "/api/business-agency/cashbook" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      const type = String(body?.entry_type || "").trim();
      const amount = Number(body?.amount);
      const category = String(body?.category || "").trim().slice(0, 100) || null;
      const description = String(body?.description || "").trim().slice(0, 500) || null;
      const entryDate = String(body?.entry_date || "").trim();

      if (!['income', 'expense'].includes(type)) {
        return error("Jenis transaksi tidak valid.", 400);
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        return error("Nominal transaksi tidak valid.", 400);
      }

      if (entryDate && !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
        return error("Tanggal transaksi tidak valid.", 400);
      }

      const rows = await sql`
        INSERT INTO business_cash_entries (
          user_id,
          store_id,
          entry_type,
          amount,
          category,
          description,
          entry_date
        )
        VALUES (
          ${user.id},
          ${store?.id || null},
          ${type},
          ${amount},
          ${category},
          ${description},
          COALESCE(${entryDate || null}::date, CURRENT_DATE)
        )
        RETURNING *
      `;

      return json({
        ok: true,
        entry: rows[0],
        ...(await listEntries(sql, user.id))
      }, 201);
    }

    const deleteMatch = url.pathname.match(/^\/api\/business-agency\/cashbook\/([0-9a-f-]{36})$/i);

    if (deleteMatch && request.method === "DELETE") {
      const entryId = uuid(deleteMatch[1]);
      if (!entryId) return error("Transaksi tidak valid.", 400);

      const rows = await sql`
        DELETE FROM business_cash_entries
        WHERE id = ${entryId}::uuid AND user_id = ${user.id}
        RETURNING id
      `;

      if (!rows[0]) return error("Transaksi tidak ditemukan.", 404);

      return json({
        ok: true,
        ...(await listEntries(sql, user.id))
      });
    }

    return error("Endpoint AI Agency Bisnis tidak ditemukan.", 404);
  } catch (err) {
    console.error("Business agency API error:", err);
    return error("AI Agency Bisnis sedang mengalami gangguan.", 500);
  }
}
