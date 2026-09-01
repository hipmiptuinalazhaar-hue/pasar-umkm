import { neon } from "@neondatabase/serverless";
import { ensureNotificationInfrastructure } from "./notification-store.js";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie");

  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [key, ...valueParts] = cookie.trim().split("=");

    if (key === name) {
      return valueParts.join("=") || null;
    }
  }

  return null;
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function jsonError(message, status = 400) {
  return json(
    {
      ok: false,
      error: message
    },
    status
  );
}

function normalizeUuid(value) {
  const id = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}

async function getAuthenticatedUser(sql, request) {
  const sessionToken = getCookie(request, SESSION_COOKIE);

  if (!sessionToken) {
    return null;
  }

  const rows = await sql`
    SELECT
      u.id,
      u.name,
      u.avatar_url,
      u.role
    FROM sessions s
    JOIN users u
      ON u.id = s.user_id
    WHERE
      s.token_hash = encode(
        digest(${sessionToken}, 'sha256'),
        'hex'
      )
      AND s.expires_at > NOW()
      AND u.is_active = TRUE
    LIMIT 1
  `;

  return rows[0] || null;
}

async function requireUser(sql, request) {
  const user = await getAuthenticatedUser(sql, request);

  if (!user) {
    return {
      user: null,
      response: jsonError(
        "Silakan masuk terlebih dahulu.",
        401
      )
    };
  }

  return {
    user,
    response: null
  };
}

async function getNotifications(sql, userId) {
  const rows = await sql`
    SELECT
      n.id,
      n.type,
      n.title,
      n.message,
      n.target_type,
      n.target_id,
      n.actor_user_id,
      n.entity_type,
      n.entity_id,
      n.is_read,
      n.created_at,
      n.read_at,

      actor.name AS actor_name,
      actor.avatar_url AS actor_avatar_url,
      actor.role AS actor_role,

      actor_store.id AS actor_store_id,
      actor_store.name AS actor_store_name,
      actor_store.verification_status AS actor_store_verification_status

    FROM notifications n

    LEFT JOIN users actor
      ON actor.id = n.actor_user_id

    LEFT JOIN LATERAL (
      SELECT
        s.id,
        s.name,
        s.verification_status
      FROM stores s
      WHERE
        s.owner_id = actor.id
        AND s.is_active = TRUE
      ORDER BY s.created_at ASC
      LIMIT 1
    ) actor_store ON TRUE

    WHERE n.user_id = ${userId}

    ORDER BY n.created_at DESC
    LIMIT 100
  `;

  return rows;
}

async function getUnreadCount(sql, userId) {
  const rows = await sql`
    SELECT COUNT(*)::int AS unread_count
    FROM notifications
    WHERE
      user_id = ${userId}
      AND is_read = FALSE
  `;

  return Number(rows[0]?.unread_count || 0);
}

async function handleList(sql, request) {
  const auth = await requireUser(sql, request);

  if (auth.response) {
    return auth.response;
  }

  const [notifications, unreadCount] = await Promise.all([
    getNotifications(sql, auth.user.id),
    getUnreadCount(sql, auth.user.id)
  ]);

  return json({
    ok: true,
    count: notifications.length,
    unread_count: unreadCount,
    notifications
  });
}

async function handleUnreadCount(sql, request) {
  const auth = await requireUser(sql, request);

  if (auth.response) {
    return auth.response;
  }

  return json({
    ok: true,
    unread_count: await getUnreadCount(sql, auth.user.id)
  });
}

async function handleReadOne(sql, request, notificationId) {
  const auth = await requireUser(sql, request);

  if (auth.response) {
    return auth.response;
  }

  const rows = await sql`
    UPDATE notifications
    SET
      is_read = TRUE,
      read_at = COALESCE(read_at, NOW())
    WHERE
      id = ${notificationId}::uuid
      AND user_id = ${auth.user.id}
    RETURNING
      id,
      is_read,
      read_at
  `;

  if (!rows[0]) {
    return jsonError(
      "Notifikasi tidak ditemukan.",
      404
    );
  }

  return json({
    ok: true,
    notification: rows[0],
    unread_count: await getUnreadCount(sql, auth.user.id)
  });
}

async function handleReadAll(sql, request) {
  const auth = await requireUser(sql, request);

  if (auth.response) {
    return auth.response;
  }

  await sql`
    UPDATE notifications
    SET
      is_read = TRUE,
      read_at = COALESCE(read_at, NOW())
    WHERE
      user_id = ${auth.user.id}
      AND is_read = FALSE
  `;

  return json({
    ok: true,
    unread_count: 0
  });
}

export async function handleNotificationApi(request, env) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/social/notifications")) {
    return null;
  }

  try {
    await ensureNotificationInfrastructure(env);

    const sql = neon(env.DATABASE_URL);

    if (
      url.pathname === "/api/social/notifications" &&
      request.method === "GET"
    ) {
      return await handleList(sql, request);
    }

    if (
      url.pathname === "/api/social/notifications/unread-count" &&
      request.method === "GET"
    ) {
      return await handleUnreadCount(sql, request);
    }

    if (
      url.pathname === "/api/social/notifications/read-all" &&
      request.method === "POST"
    ) {
      return await handleReadAll(sql, request);
    }

    const readMatch = url.pathname.match(
      /^\/api\/social\/notifications\/([0-9a-f-]{36})\/read$/i
    );

    if (readMatch && request.method === "PATCH") {
      const notificationId = normalizeUuid(readMatch[1]);

      if (!notificationId) {
        return jsonError(
          "Notifikasi tidak valid.",
          400
        );
      }

      return await handleReadOne(
        sql,
        request,
        notificationId
      );
    }

    return jsonError(
      "Endpoint notifikasi tidak ditemukan.",
      404
    );
  } catch (error) {
    console.error("Notification API error:", error);

    return jsonError(
      "Layanan notifikasi sedang mengalami gangguan.",
      500
    );
  }
}
