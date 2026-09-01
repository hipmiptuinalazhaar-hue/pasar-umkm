import { neon } from "@neondatabase/serverless";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const cookie of header.split(";")) {
    const [key, ...rest] = cookie.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

async function userId(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const rows = await sql`
    SELECT u.id
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE
      s.token_hash = encode(digest(${token}, 'sha256'), 'hex')
      AND s.expires_at > NOW()
      AND u.is_active = TRUE
    LIMIT 1
  `;
  return rows[0]?.id || null;
}

export async function handleChatMarkReadApi(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(
    /^\/api\/chat\/conversations\/([0-9a-f-]{36})\/mark-read$/i
  );

  if (!match) return null;
  if (request.method !== "POST") return json({ ok: false, error: "Metode tidak diizinkan." }, 405);

  const conversationId = String(match[1] || "").toLowerCase();
  if (!UUID_PATTERN.test(conversationId)) {
    return json({ ok: false, error: "Percakapan tidak valid." }, 400);
  }

  try {
    const sql = neon(env.DATABASE_URL);
    const currentUserId = await userId(sql, request);
    if (!currentUserId) {
      return json({ ok: false, error: "Silakan masuk terlebih dahulu." }, 401);
    }

    const access = await sql`
      SELECT id
      FROM direct_conversations
      WHERE
        id = ${conversationId}::uuid
        AND (user_a_id = ${currentUserId} OR user_b_id = ${currentUserId})
      LIMIT 1
    `;

    if (!access[0]) {
      return json({ ok: false, error: "Percakapan tidak ditemukan." }, 404);
    }

    await sql`
      UPDATE direct_messages
      SET is_read = TRUE, read_at = COALESCE(read_at, NOW())
      WHERE
        conversation_id = ${conversationId}::uuid
        AND sender_id <> ${currentUserId}
        AND is_read = FALSE
    `;

    return json({ ok: true });
  } catch (error) {
    console.error("Chat mark-read error:", error);
    return json({ ok: false, error: "Status baca belum dapat diperbarui." }, 500);
  }
}
