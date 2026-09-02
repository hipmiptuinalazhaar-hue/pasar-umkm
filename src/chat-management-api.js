import { neon } from "@neondatabase/serverless";
import { ensureFunctionalityInfrastructure } from "./functionality-store.js";

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
  const header = request.headers.get("Cookie");
  if (!header) return null;

  for (const cookie of header.split(";")) {
    const [key, ...rest] = cookie.trim().split("=");
    if (key === name) return rest.join("=") || null;
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
    SELECT u.id, u.name, u.avatar_url, u.role
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
    ? { user, response: null }
    : { user: null, response: error("Silakan masuk terlebih dahulu.", 401) };
}

async function conversationMeta(sql, conversationId, userId) {
  const rows = await sql`
    SELECT
      c.id,
      c.created_at,
      c.updated_at,
      CASE WHEN c.user_a_id = ${userId} THEN c.user_b_id ELSE c.user_a_id END AS other_user_id,
      u.name AS other_user_name,
      u.avatar_url AS other_user_avatar_url,
      u.role AS other_user_role,
      s.id AS other_store_id,
      s.name AS other_store_name,
      s.verification_status AS other_store_verification_status,
      cs.hidden_before,
      COALESCE(cs.is_pinned, FALSE) AS viewer_pinned,
      COALESCE(cs.is_archived, FALSE) AS viewer_archived
    FROM direct_conversations c
    JOIN users u
      ON u.id = CASE WHEN c.user_a_id = ${userId} THEN c.user_b_id ELSE c.user_a_id END
    LEFT JOIN LATERAL (
      SELECT store.id, store.name, store.verification_status
      FROM stores store
      WHERE store.owner_id = u.id AND store.is_active = TRUE
      ORDER BY store.created_at ASC
      LIMIT 1
    ) s ON TRUE
    LEFT JOIN direct_conversation_user_state cs
      ON cs.conversation_id = c.id AND cs.user_id = ${userId}
    WHERE
      c.id = ${conversationId}::uuid
      AND (c.user_a_id = ${userId} OR c.user_b_id = ${userId})
      AND u.is_active = TRUE
    LIMIT 1
  `;

  return rows[0] || null;
}

async function listConversations(sql, request) {
  const auth = await requireUser(sql, request);
  if (auth.response) return auth.response;

  const userId = auth.user.id;

  const conversations = await sql`
    SELECT
      c.id,
      c.created_at,
      c.updated_at,
      CASE WHEN c.user_a_id = ${userId} THEN c.user_b_id ELSE c.user_a_id END AS other_user_id,
      u.name AS other_user_name,
      u.avatar_url AS other_user_avatar_url,
      u.role AS other_user_role,
      s.id AS other_store_id,
      s.name AS other_store_name,
      s.verification_status AS other_store_verification_status,
      last_message.message AS last_message,
      last_message.sender_id AS last_message_sender_id,
      last_message.created_at AS last_message_at,
      COALESCE(cs.is_pinned, FALSE) AS viewer_pinned,
      COALESCE(cs.is_archived, FALSE) AS viewer_archived,
      (
        SELECT COUNT(*)::int
        FROM direct_messages unread
        LEFT JOIN direct_message_user_state mus
          ON mus.message_id = unread.id AND mus.user_id = ${userId}
        WHERE
          unread.conversation_id = c.id
          AND unread.sender_id <> ${userId}
          AND unread.is_read = FALSE
          AND COALESCE(mus.is_hidden, FALSE) = FALSE
          AND (cs.hidden_before IS NULL OR unread.created_at > cs.hidden_before)
      ) AS unread_count
    FROM direct_conversations c
    JOIN users u
      ON u.id = CASE WHEN c.user_a_id = ${userId} THEN c.user_b_id ELSE c.user_a_id END
    LEFT JOIN LATERAL (
      SELECT store.id, store.name, store.verification_status
      FROM stores store
      WHERE store.owner_id = u.id AND store.is_active = TRUE
      ORDER BY store.created_at ASC
      LIMIT 1
    ) s ON TRUE
    LEFT JOIN direct_conversation_user_state cs
      ON cs.conversation_id = c.id AND cs.user_id = ${userId}
    LEFT JOIN LATERAL (
      SELECT dm.message, dm.sender_id, dm.created_at
      FROM direct_messages dm
      LEFT JOIN direct_message_user_state mus
        ON mus.message_id = dm.id AND mus.user_id = ${userId}
      WHERE
        dm.conversation_id = c.id
        AND COALESCE(mus.is_hidden, FALSE) = FALSE
        AND (cs.hidden_before IS NULL OR dm.created_at > cs.hidden_before)
      ORDER BY dm.created_at DESC
      LIMIT 1
    ) last_message ON TRUE
    WHERE
      (c.user_a_id = ${userId} OR c.user_b_id = ${userId})
      AND u.is_active = TRUE
      AND (
        cs.hidden_before IS NULL
        OR last_message.created_at > cs.hidden_before
      )
    ORDER BY
      COALESCE(cs.is_pinned, FALSE) DESC,
      COALESCE(last_message.created_at, c.updated_at) DESC
    LIMIT 80
  `;

  return json({
    ok: true,
    count: conversations.length,
    archived_count: conversations.filter(item => item.viewer_archived).length,
    conversations
  });
}

async function unreadCount(sql, request) {
  const auth = await requireUser(sql, request);
  if (auth.response) return auth.response;

  const rows = await sql`
    SELECT COUNT(*)::int AS unread_count
    FROM direct_messages dm
    JOIN direct_conversations c ON c.id = dm.conversation_id
    LEFT JOIN direct_conversation_user_state cs
      ON cs.conversation_id = c.id AND cs.user_id = ${auth.user.id}
    LEFT JOIN direct_message_user_state mus
      ON mus.message_id = dm.id AND mus.user_id = ${auth.user.id}
    WHERE
      (c.user_a_id = ${auth.user.id} OR c.user_b_id = ${auth.user.id})
      AND dm.sender_id <> ${auth.user.id}
      AND dm.is_read = FALSE
      AND COALESCE(mus.is_hidden, FALSE) = FALSE
      AND (cs.hidden_before IS NULL OR dm.created_at > cs.hidden_before)
  `;

  return json({ ok: true, unread_count: rows[0]?.unread_count || 0 });
}

async function getMessages(sql, request, conversationId) {
  const auth = await requireUser(sql, request);
  if (auth.response) return auth.response;

  const conversation = await conversationMeta(sql, conversationId, auth.user.id);
  if (!conversation) return error("Percakapan tidak ditemukan.", 404);

  await sql`
    UPDATE direct_messages
    SET is_read = TRUE, read_at = COALESCE(read_at, NOW())
    WHERE
      conversation_id = ${conversationId}::uuid
      AND sender_id <> ${auth.user.id}
      AND is_read = FALSE
      AND (${conversation.hidden_before}::timestamptz IS NULL OR created_at > ${conversation.hidden_before}::timestamptz)
  `;

  const messages = await sql`
    SELECT * FROM (
      SELECT
        dm.id,
        dm.conversation_id,
        dm.sender_id,
        dm.message,
        dm.is_read,
        dm.created_at,
        dm.read_at,
        u.name AS sender_name,
        u.avatar_url AS sender_avatar_url
      FROM direct_messages dm
      JOIN users u ON u.id = dm.sender_id
      LEFT JOIN direct_message_user_state mus
        ON mus.message_id = dm.id AND mus.user_id = ${auth.user.id}
      WHERE
        dm.conversation_id = ${conversationId}::uuid
        AND COALESCE(mus.is_hidden, FALSE) = FALSE
        AND (${conversation.hidden_before}::timestamptz IS NULL OR dm.created_at > ${conversation.hidden_before}::timestamptz)
      ORDER BY dm.created_at DESC
      LIMIT 200
    ) recent
    ORDER BY recent.created_at ASC
  `;

  return json({ ok: true, conversation, count: messages.length, messages });
}

async function conversationByUser(sql, request, otherUserId) {
  const auth = await requireUser(sql, request);
  if (auth.response) return auth.response;

  const pair = [String(auth.user.id), String(otherUserId)]
    .sort((a, b) => a.localeCompare(b));

  const rows = await sql`
    SELECT id
    FROM direct_conversations
    WHERE user_a_id = ${pair[0]}::uuid AND user_b_id = ${pair[1]}::uuid
    LIMIT 1
  `;

  return json({ ok: true, conversation_id: rows[0]?.id || null });
}

async function messageMeta(sql, request, conversationId) {
  const auth = await requireUser(sql, request);
  if (auth.response) return auth.response;

  const conversation = await conversationMeta(sql, conversationId, auth.user.id);
  if (!conversation) return error("Percakapan tidak ditemukan.", 404);

  const messages = await sql`
    SELECT
      dm.id,
      dm.sender_id,
      dm.created_at
    FROM direct_messages dm
    LEFT JOIN direct_message_user_state mus
      ON mus.message_id = dm.id AND mus.user_id = ${auth.user.id}
    WHERE
      dm.conversation_id = ${conversationId}::uuid
      AND COALESCE(mus.is_hidden, FALSE) = FALSE
      AND (${conversation.hidden_before}::timestamptz IS NULL OR dm.created_at > ${conversation.hidden_before}::timestamptz)
    ORDER BY dm.created_at ASC
    LIMIT 200
  `;

  return json({
    ok: true,
    conversation_id: conversationId,
    current_user_id: auth.user.id,
    messages
  });
}

async function conversationAction(sql, request, conversationId) {
  const auth = await requireUser(sql, request);
  if (auth.response) return auth.response;

  const conversation = await conversationMeta(sql, conversationId, auth.user.id);
  if (!conversation) return error("Percakapan tidak ditemukan.", 404);

  const body = await request.json().catch(() => null);
  const action = String(body?.action || "").trim().toLowerCase();
  const valid = new Set([
    "pin",
    "unpin",
    "archive",
    "unarchive",
    "delete_me"
  ]);

  if (!valid.has(action)) {
    return error("Aksi percakapan tidak valid.", 400);
  }

  if (action === "delete_me") {
    await sql`
      INSERT INTO direct_conversation_user_state (
        conversation_id,
        user_id,
        hidden_before,
        is_pinned,
        is_archived,
        updated_at
      )
      VALUES (
        ${conversationId}::uuid,
        ${auth.user.id},
        NOW(),
        FALSE,
        FALSE,
        NOW()
      )
      ON CONFLICT (conversation_id, user_id)
      DO UPDATE SET
        hidden_before = NOW(),
        is_pinned = FALSE,
        is_archived = FALSE,
        updated_at = NOW()
    `;

    return json({ ok: true, action, conversation_id: conversationId });
  }

  const pinValue =
    action === "pin" ? true :
    action === "unpin" ? false : null;
  const archiveValue =
    action === "archive" ? true :
    action === "unarchive" ? false : null;

  await sql`
    INSERT INTO direct_conversation_user_state (
      conversation_id,
      user_id,
      is_pinned,
      is_archived,
      updated_at
    )
    VALUES (
      ${conversationId}::uuid,
      ${auth.user.id},
      ${pinValue === true},
      ${archiveValue === true},
      NOW()
    )
    ON CONFLICT (conversation_id, user_id)
    DO UPDATE SET
      is_pinned = CASE
        WHEN ${pinValue}::boolean IS NULL
          THEN direct_conversation_user_state.is_pinned
        ELSE ${pinValue}::boolean
      END,
      is_archived = CASE
        WHEN ${archiveValue}::boolean IS NULL
          THEN direct_conversation_user_state.is_archived
        ELSE ${archiveValue}::boolean
      END,
      updated_at = NOW()
  `;

  return json({
    ok: true,
    action,
    conversation_id: conversationId,
    is_pinned: action === "pin" ? true : action === "unpin" ? false : conversation.viewer_pinned,
    is_archived: action === "archive" ? true : action === "unarchive" ? false : conversation.viewer_archived
  });
}

async function messageAction(sql, request, messageId) {
  const auth = await requireUser(sql, request);
  if (auth.response) return auth.response;

  const rows = await sql`
    SELECT dm.id, dm.conversation_id, dm.sender_id
    FROM direct_messages dm
    JOIN direct_conversations c ON c.id = dm.conversation_id
    WHERE
      dm.id = ${messageId}::uuid
      AND (c.user_a_id = ${auth.user.id} OR c.user_b_id = ${auth.user.id})
    LIMIT 1
  `;

  const message = rows[0];
  if (!message) return error("Pesan tidak ditemukan.", 404);

  const body = await request.json().catch(() => null);
  const action = String(body?.action || "").trim().toLowerCase();

  if (action === "delete_me") {
    await sql`
      INSERT INTO direct_message_user_state (
        message_id,
        user_id,
        is_hidden,
        updated_at
      )
      VALUES (
        ${messageId}::uuid,
        ${auth.user.id},
        TRUE,
        NOW()
      )
      ON CONFLICT (message_id, user_id)
      DO UPDATE SET is_hidden = TRUE, updated_at = NOW()
    `;

    return json({
      ok: true,
      action,
      message_id: messageId,
      conversation_id: message.conversation_id
    });
  }

  if (action === "delete_everyone") {
    if (String(message.sender_id) !== String(auth.user.id)) {
      return error(
        "Hanya pengirim yang dapat menghapus pesan untuk semua.",
        403
      );
    }

    await sql`
      DELETE FROM direct_messages
      WHERE id = ${messageId}::uuid
    `;

    return json({
      ok: true,
      action,
      message_id: messageId,
      conversation_id: message.conversation_id
    });
  }

  return error("Aksi pesan tidak valid.", 400);
}

export async function handleChatManagementApi(request, env) {
  const url = new URL(request.url);

  const isSocialConversationList =
    url.pathname === "/api/social/conversations" && request.method === "GET";
  const isSocialUnread =
    url.pathname === "/api/social/unread-count" && request.method === "GET";
  const socialMessagesMatch = url.pathname.match(
    /^\/api\/social\/conversations\/([0-9a-f-]{36})\/messages$/i
  );

  if (
    !url.pathname.startsWith("/api/chat/") &&
    !isSocialConversationList &&
    !isSocialUnread &&
    !(socialMessagesMatch && request.method === "GET")
  ) {
    return null;
  }

  try {
    const sql = neon(env.DATABASE_URL);
    await ensureFunctionalityInfrastructure(sql);

    if (isSocialConversationList) return await listConversations(sql, request);
    if (isSocialUnread) return await unreadCount(sql, request);

    if (socialMessagesMatch && request.method === "GET") {
      const conversationId = uuid(socialMessagesMatch[1]);
      if (!conversationId) return error("Percakapan tidak valid.", 400);
      return await getMessages(sql, request, conversationId);
    }

    const byUserMatch = url.pathname.match(
      /^\/api\/chat\/conversations\/by-user\/([0-9a-f-]{36})$/i
    );
    if (byUserMatch && request.method === "GET") {
      const otherUserId = uuid(byUserMatch[1]);
      if (!otherUserId) return error("Pengguna tidak valid.", 400);
      return await conversationByUser(sql, request, otherUserId);
    }

    const metaMatch = url.pathname.match(
      /^\/api\/chat\/conversations\/([0-9a-f-]{36})\/messages-meta$/i
    );
    if (metaMatch && request.method === "GET") {
      const conversationId = uuid(metaMatch[1]);
      if (!conversationId) return error("Percakapan tidak valid.", 400);
      return await messageMeta(sql, request, conversationId);
    }

    const conversationActionMatch = url.pathname.match(
      /^\/api\/chat\/conversations\/([0-9a-f-]{36})\/action$/i
    );
    if (conversationActionMatch && request.method === "POST") {
      const conversationId = uuid(conversationActionMatch[1]);
      if (!conversationId) return error("Percakapan tidak valid.", 400);
      return await conversationAction(sql, request, conversationId);
    }

    const messageActionMatch = url.pathname.match(
      /^\/api\/chat\/messages\/([0-9a-f-]{36})\/action$/i
    );
    if (messageActionMatch && request.method === "POST") {
      const messageId = uuid(messageActionMatch[1]);
      if (!messageId) return error("Pesan tidak valid.", 400);
      return await messageAction(sql, request, messageId);
    }

    return error("Endpoint chat tidak ditemukan.", 404);
  } catch (err) {
    console.error("Chat management API error:", err);
    return error("Layanan chat sedang mengalami gangguan.", 500);
  }
}
