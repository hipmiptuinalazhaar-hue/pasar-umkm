import { Client, neon } from "@neondatabase/serverless";
import {
  destroyOwnedChatMedia,
  parseOwnedChatMediaUrl
} from "./chat-media-security.js";

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
  for (const piece of header.split(";")) {
    const [key, ...parts] = piece.trim().split("=");
    if (key === name) return parts.join("=") || null;
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
    SELECT u.id, u.role
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

async function messageForParticipant(sql, messageId, userId) {
  const rows = await sql`
    SELECT
      dm.id,
      dm.conversation_id,
      dm.sender_id,
      dm.message_type,
      dm.media_url
    FROM direct_messages dm
    JOIN direct_conversations c ON c.id = dm.conversation_id
    WHERE
      dm.id = ${messageId}::uuid
      AND (c.user_a_id = ${userId} OR c.user_b_id = ${userId})
    LIMIT 1
  `;
  return rows[0] || null;
}

async function deleteForMe(sql, messageId, userId) {
  const message = await messageForParticipant(sql, messageId, userId);
  if (!message) return error("Pesan tidak ditemukan.", 404);

  await sql`
    INSERT INTO direct_message_user_state (
      message_id,
      user_id,
      is_hidden,
      updated_at
    )
    VALUES (
      ${messageId}::uuid,
      ${userId},
      TRUE,
      NOW()
    )
    ON CONFLICT (message_id, user_id)
    DO UPDATE SET is_hidden = TRUE, updated_at = NOW()
  `;

  return json({
    ok: true,
    action: "delete_me",
    message_id: messageId,
    conversation_id: message.conversation_id
  });
}

async function deleteForEveryone(env, messageId, userId) {
  const client = new Client({ connectionString: env.DATABASE_URL });
  let started = false;
  let deletedMessage = null;

  try {
    await client.connect();
    await client.query("BEGIN");
    started = true;

    const found = await client.query(
      `
        SELECT
          dm.id,
          dm.conversation_id,
          dm.sender_id,
          dm.message_type,
          dm.media_url
        FROM direct_messages dm
        JOIN direct_conversations c ON c.id = dm.conversation_id
        WHERE
          dm.id = $1::uuid
          AND (c.user_a_id = $2::uuid OR c.user_b_id = $2::uuid)
        LIMIT 1
        FOR UPDATE OF dm
      `,
      [messageId, userId]
    );

    const message = found.rows[0];
    if (!message) {
      await client.query("ROLLBACK");
      started = false;
      return error("Pesan tidak ditemukan.", 404);
    }

    if (String(message.sender_id) !== String(userId)) {
      await client.query("ROLLBACK");
      started = false;
      return error("Hanya pengirim yang dapat menghapus pesan untuk semua.", 403);
    }

    await client.query("DELETE FROM direct_messages WHERE id = $1::uuid", [messageId]);
    await client.query("COMMIT");
    started = false;
    deletedMessage = message;
  } catch (err) {
    if (started) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Message delete rollback failed:", rollbackError);
      }
    }

    if (err?.code === "40001" || err?.code === "40P01") {
      return error("Pesan berubah bersamaan. Silakan coba lagi.", 409);
    }

    console.error("Message delete transaction failed:", err);
    return error("Pesan belum dapat dihapus.", 500);
  } finally {
    try {
      await client.end();
    } catch (closeError) {
      console.error("Message delete client close failed:", closeError);
    }
  }

  let mediaCleanup = "not_applicable";
  if (
    deletedMessage?.media_url &&
    (deletedMessage.message_type === "image" || deletedMessage.message_type === "audio")
  ) {
    const descriptor = parseOwnedChatMediaUrl(deletedMessage.media_url, env, {
      conversationId: deletedMessage.conversation_id,
      userId,
      kind: deletedMessage.message_type,
      allowLegacy: true
    });

    if (descriptor) {
      const cleaned = await destroyOwnedChatMedia(env, descriptor).catch(() => ({ ok: false }));
      mediaCleanup = cleaned.ok ? "cleaned" : "deferred";
    } else {
      mediaCleanup = "unmanaged_legacy";
    }
  }

  return json({
    ok: true,
    action: "delete_everyone",
    message_id: messageId,
    conversation_id: deletedMessage.conversation_id,
    media_cleanup: mediaCleanup
  });
}

export async function handleChatMessageActionApi(request, env) {
  if (request.method !== "POST") return null;

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/chat\/messages\/([0-9a-f-]{36})\/action$/i);
  if (!match) return null;

  const messageId = uuid(match[1]);
  if (!messageId) return error("Pesan tidak valid.", 400);

  try {
    const sql = neon(env.DATABASE_URL);
    const user = await currentUser(sql, request);
    if (!user) return error("Silakan masuk terlebih dahulu.", 401);

    const body = await request.json().catch(() => null);
    const action = String(body?.action || "").trim().toLowerCase();

    if (action === "delete_me") {
      return await deleteForMe(sql, messageId, user.id);
    }
    if (action === "delete_everyone") {
      return await deleteForEveryone(env, messageId, user.id);
    }

    return error("Aksi pesan tidak valid.", 400);
  } catch (err) {
    console.error("Chat message action API error:", err);
    return error("Aksi pesan sedang mengalami gangguan.", 500);
  }
}
