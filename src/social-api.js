import { neon } from "@neondatabase/serverless";
import { ensureSocialSchema } from "./social-store.js";
import { ensureStoreSocialLinksTable } from "./profile-social-store.js";

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

function normalizeUuid(value) {
  const id = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
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

async function requireAuthenticatedUser(sql, request) {
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

async function getPublicProfile(sql, request, { userId, storeId }) {
  await ensureStoreSocialLinksTable(sql);

  let rows;

  if (userId) {
    rows = await sql`
      SELECT
        u.id AS user_id,
        u.name AS user_name,
        u.avatar_url AS user_avatar_url,
        u.role AS user_role,
        u.created_at AS user_created_at,

        s.id AS store_id,
        s.name AS store_name,
        s.slug AS store_slug,
        s.description,
        s.logo_url,
        s.cover_url,
        s.whatsapp,
        s.district,
        s.city,
        s.province,
        s.verification_status,
        sl.instagram_url,
        sl.tiktok_url,

        (
          SELECT COUNT(*)::int
          FROM user_follows uf
          WHERE uf.following_id = u.id
        ) AS follower_count,

        (
          SELECT COUNT(*)::int
          FROM user_follows uf
          WHERE uf.follower_id = u.id
        ) AS following_count,

        COALESCE(
          (
            SELECT COUNT(*)::int
            FROM posts p
            WHERE
              p.store_id = s.id
              AND p.is_active = TRUE
          ),
          0
        ) AS post_count,

        COALESCE(
          (
            SELECT COUNT(*)::int
            FROM products p
            WHERE
              p.store_id = s.id
              AND p.is_active = TRUE
          ),
          0
        ) AS product_count

      FROM users u

      LEFT JOIN LATERAL (
        SELECT store.*
        FROM stores store
        WHERE
          store.owner_id = u.id
          AND store.is_active = TRUE
        ORDER BY store.created_at ASC
        LIMIT 1
      ) s ON TRUE

      LEFT JOIN store_social_links sl
        ON sl.store_id = s.id

      WHERE
        u.id = ${userId}::uuid
        AND u.is_active = TRUE

      LIMIT 1
    `;
  } else {
    rows = await sql`
      SELECT
        u.id AS user_id,
        u.name AS user_name,
        u.avatar_url AS user_avatar_url,
        u.role AS user_role,
        u.created_at AS user_created_at,

        s.id AS store_id,
        s.name AS store_name,
        s.slug AS store_slug,
        s.description,
        s.logo_url,
        s.cover_url,
        s.whatsapp,
        s.district,
        s.city,
        s.province,
        s.verification_status,
        sl.instagram_url,
        sl.tiktok_url,

        (
          SELECT COUNT(*)::int
          FROM user_follows uf
          WHERE uf.following_id = u.id
        ) AS follower_count,

        (
          SELECT COUNT(*)::int
          FROM user_follows uf
          WHERE uf.follower_id = u.id
        ) AS following_count,

        (
          SELECT COUNT(*)::int
          FROM posts p
          WHERE
            p.store_id = s.id
            AND p.is_active = TRUE
        ) AS post_count,

        (
          SELECT COUNT(*)::int
          FROM products p
          WHERE
            p.store_id = s.id
            AND p.is_active = TRUE
        ) AS product_count

      FROM stores s
      JOIN users u
        ON u.id = s.owner_id
      LEFT JOIN store_social_links sl
        ON sl.store_id = s.id

      WHERE
        s.id = ${storeId}::uuid
        AND s.is_active = TRUE
        AND u.is_active = TRUE

      LIMIT 1
    `;
  }

  const profile = rows[0] || null;

  if (!profile) {
    return null;
  }

  const viewer = await getAuthenticatedUser(sql, request);

  profile.is_self = Boolean(
    viewer &&
    String(viewer.id) === String(profile.user_id)
  );

  profile.is_following = false;

  if (viewer && !profile.is_self) {
    const relationship = await sql`
      SELECT EXISTS (
        SELECT 1
        FROM user_follows
        WHERE
          follower_id = ${viewer.id}
          AND following_id = ${profile.user_id}
      ) AS is_following
    `;

    profile.is_following = Boolean(
      relationship[0]?.is_following
    );
  }

  return profile;
}

async function getConversationMeta(sql, conversationId, currentUserId) {
  const rows = await sql`
    SELECT
      c.id,
      c.created_at,
      c.updated_at,

      CASE
        WHEN c.user_a_id = ${currentUserId}
          THEN c.user_b_id
        ELSE c.user_a_id
      END AS other_user_id,

      u.name AS other_user_name,
      u.avatar_url AS other_user_avatar_url,
      u.role AS other_user_role,

      s.id AS other_store_id,
      s.name AS other_store_name,
      s.verification_status AS other_store_verification_status

    FROM direct_conversations c

    JOIN users u
      ON u.id = CASE
        WHEN c.user_a_id = ${currentUserId}
          THEN c.user_b_id
        ELSE c.user_a_id
      END

    LEFT JOIN LATERAL (
      SELECT store.id, store.name, store.verification_status
      FROM stores store
      WHERE
        store.owner_id = u.id
        AND store.is_active = TRUE
      ORDER BY store.created_at ASC
      LIMIT 1
    ) s ON TRUE

    WHERE
      c.id = ${conversationId}::uuid
      AND (
        c.user_a_id = ${currentUserId}
        OR c.user_b_id = ${currentUserId}
      )
      AND u.is_active = TRUE

    LIMIT 1
  `;

  return rows[0] || null;
}

async function handleProfileRequest(sql, request, url) {
  const userId = normalizeUuid(
    url.searchParams.get("user_id")
  );

  const storeId = normalizeUuid(
    url.searchParams.get("store_id")
  );

  if (!userId && !storeId) {
    return jsonError(
      "Profil yang diminta tidak valid.",
      400
    );
  }

  const profile = await getPublicProfile(
    sql,
    request,
    {
      userId,
      storeId
    }
  );

  if (!profile) {
    return jsonError(
      "Profil tidak ditemukan.",
      404
    );
  }

  return json({
    ok: true,
    profile
  });
}

async function handleFollowRequest(sql, request, targetUserId) {
  const auth = await requireAuthenticatedUser(sql, request);

  if (auth.response) {
    return auth.response;
  }

  const currentUser = auth.user;

  if (String(currentUser.id) === String(targetUserId)) {
    return jsonError(
      "Anda tidak dapat mengikuti akun sendiri.",
      400
    );
  }

  const targets = await sql`
    SELECT id
    FROM users
    WHERE
      id = ${targetUserId}::uuid
      AND is_active = TRUE
    LIMIT 1
  `;

  if (!targets[0]) {
    return jsonError(
      "Pengguna tidak ditemukan.",
      404
    );
  }

  if (request.method === "POST") {
    await sql`
      INSERT INTO user_follows (
        follower_id,
        following_id
      )
      VALUES (
        ${currentUser.id},
        ${targetUserId}::uuid
      )
      ON CONFLICT (follower_id, following_id)
      DO NOTHING
    `;
  } else if (request.method === "DELETE") {
    await sql`
      DELETE FROM user_follows
      WHERE
        follower_id = ${currentUser.id}
        AND following_id = ${targetUserId}::uuid
    `;
  } else {
    return jsonError(
      "Metode tidak diizinkan.",
      405
    );
  }

  const counts = await sql`
    SELECT
      (
        SELECT COUNT(*)::int
        FROM user_follows
        WHERE following_id = ${targetUserId}::uuid
      ) AS follower_count,
      (
        SELECT COUNT(*)::int
        FROM user_follows
        WHERE follower_id = ${targetUserId}::uuid
      ) AS following_count,
      EXISTS (
        SELECT 1
        FROM user_follows
        WHERE
          follower_id = ${currentUser.id}
          AND following_id = ${targetUserId}::uuid
      ) AS is_following
  `;

  return json({
    ok: true,
    user_id: targetUserId,
    follower_count: counts[0]?.follower_count || 0,
    following_count: counts[0]?.following_count || 0,
    is_following: Boolean(counts[0]?.is_following)
  });
}

async function handleFollowList(sql, url, type) {
  const userId = normalizeUuid(
    url.searchParams.get("user_id")
  );

  if (!userId) {
    return jsonError(
      "Pengguna tidak valid.",
      400
    );
  }

  let users;

  if (type === "followers") {
    users = await sql`
      SELECT
        u.id AS user_id,
        u.name AS user_name,
        u.avatar_url AS user_avatar_url,
        u.role AS user_role,
        s.id AS store_id,
        s.name AS store_name,
        s.verification_status,
        uf.created_at AS followed_at

      FROM user_follows uf
      JOIN users u
        ON u.id = uf.follower_id

      LEFT JOIN LATERAL (
        SELECT store.id, store.name, store.verification_status
        FROM stores store
        WHERE
          store.owner_id = u.id
          AND store.is_active = TRUE
        ORDER BY store.created_at ASC
        LIMIT 1
      ) s ON TRUE

      WHERE
        uf.following_id = ${userId}::uuid
        AND u.is_active = TRUE

      ORDER BY uf.created_at DESC
      LIMIT 100
    `;
  } else {
    users = await sql`
      SELECT
        u.id AS user_id,
        u.name AS user_name,
        u.avatar_url AS user_avatar_url,
        u.role AS user_role,
        s.id AS store_id,
        s.name AS store_name,
        s.verification_status,
        uf.created_at AS followed_at

      FROM user_follows uf
      JOIN users u
        ON u.id = uf.following_id

      LEFT JOIN LATERAL (
        SELECT store.id, store.name, store.verification_status
        FROM stores store
        WHERE
          store.owner_id = u.id
          AND store.is_active = TRUE
        ORDER BY store.created_at ASC
        LIMIT 1
      ) s ON TRUE

      WHERE
        uf.follower_id = ${userId}::uuid
        AND u.is_active = TRUE

      ORDER BY uf.created_at DESC
      LIMIT 100
    `;
  }

  return json({
    ok: true,
    type,
    user_id: userId,
    count: users.length,
    users
  });
}

async function handleCommentAuthor(sql, url) {
  const commentId = normalizeUuid(
    url.searchParams.get("comment_id")
  );

  if (!commentId) {
    return jsonError(
      "Komentar tidak valid.",
      400
    );
  }

  const rows = await sql`
    WITH resolved_comment AS (
      SELECT
        pc.user_id,
        'post'::text AS comment_type
      FROM post_comments pc
      WHERE
        pc.id = ${commentId}::uuid
        AND pc.is_active = TRUE

      UNION ALL

      SELECT
        prc.user_id,
        'product'::text AS comment_type
      FROM product_comments prc
      WHERE
        prc.id = ${commentId}::uuid
        AND prc.is_active = TRUE
    )

    SELECT
      u.id AS user_id,
      u.name AS user_name,
      u.avatar_url AS user_avatar_url,
      u.role AS user_role,
      rc.comment_type
    FROM resolved_comment rc
    JOIN users u
      ON u.id = rc.user_id
    WHERE u.is_active = TRUE
    LIMIT 1
  `;

  if (!rows[0]) {
    return jsonError(
      "Pemilik komentar tidak ditemukan.",
      404
    );
  }

  return json({
    ok: true,
    user: rows[0]
  });
}

async function handleConversationCreate(sql, request) {
  const auth = await requireAuthenticatedUser(sql, request);

  if (auth.response) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const targetUserId = normalizeUuid(body?.target_user_id);

  if (!targetUserId) {
    return jsonError(
      "Penerima pesan tidak valid.",
      400
    );
  }

  if (String(auth.user.id) === String(targetUserId)) {
    return jsonError(
      "Anda tidak dapat mengirim pesan ke akun sendiri.",
      400
    );
  }

  const targets = await sql`
    SELECT id
    FROM users
    WHERE
      id = ${targetUserId}::uuid
      AND is_active = TRUE
    LIMIT 1
  `;

  if (!targets[0]) {
    return jsonError(
      "Penerima pesan tidak ditemukan.",
      404
    );
  }

  const pair = [
    String(auth.user.id),
    String(targetUserId)
  ].sort((a, b) => a.localeCompare(b));

  const rows = await sql`
    INSERT INTO direct_conversations (
      user_a_id,
      user_b_id
    )
    VALUES (
      ${pair[0]}::uuid,
      ${pair[1]}::uuid
    )
    ON CONFLICT (user_a_id, user_b_id)
    DO UPDATE SET
      updated_at = direct_conversations.updated_at
    RETURNING id
  `;

  const conversation = await getConversationMeta(
    sql,
    rows[0].id,
    auth.user.id
  );

  return json({
    ok: true,
    conversation
  });
}

async function handleConversationList(sql, request) {
  const auth = await requireAuthenticatedUser(sql, request);

  if (auth.response) {
    return auth.response;
  }

  const currentUserId = auth.user.id;

  const conversations = await sql`
    SELECT
      c.id,
      c.created_at,
      c.updated_at,

      CASE
        WHEN c.user_a_id = ${currentUserId}
          THEN c.user_b_id
        ELSE c.user_a_id
      END AS other_user_id,

      u.name AS other_user_name,
      u.avatar_url AS other_user_avatar_url,
      u.role AS other_user_role,

      s.id AS other_store_id,
      s.name AS other_store_name,
      s.verification_status AS other_store_verification_status,

      last_message.message AS last_message,
      last_message.sender_id AS last_message_sender_id,
      last_message.created_at AS last_message_at,

      (
        SELECT COUNT(*)::int
        FROM direct_messages unread
        WHERE
          unread.conversation_id = c.id
          AND unread.sender_id <> ${currentUserId}
          AND unread.is_read = FALSE
      ) AS unread_count

    FROM direct_conversations c

    JOIN users u
      ON u.id = CASE
        WHEN c.user_a_id = ${currentUserId}
          THEN c.user_b_id
        ELSE c.user_a_id
      END

    LEFT JOIN LATERAL (
      SELECT store.id, store.name, store.verification_status
      FROM stores store
      WHERE
        store.owner_id = u.id
        AND store.is_active = TRUE
      ORDER BY store.created_at ASC
      LIMIT 1
    ) s ON TRUE

    LEFT JOIN LATERAL (
      SELECT
        dm.message,
        dm.sender_id,
        dm.created_at
      FROM direct_messages dm
      WHERE dm.conversation_id = c.id
      ORDER BY dm.created_at DESC
      LIMIT 1
    ) last_message ON TRUE

    WHERE
      (
        c.user_a_id = ${currentUserId}
        OR c.user_b_id = ${currentUserId}
      )
      AND u.is_active = TRUE

    ORDER BY
      COALESCE(last_message.created_at, c.updated_at) DESC

    LIMIT 50
  `;

  return json({
    ok: true,
    count: conversations.length,
    conversations
  });
}

async function handleConversationMessages(
  sql,
  request,
  conversationId
) {
  const auth = await requireAuthenticatedUser(sql, request);

  if (auth.response) {
    return auth.response;
  }

  const conversation = await getConversationMeta(
    sql,
    conversationId,
    auth.user.id
  );

  if (!conversation) {
    return jsonError(
      "Percakapan tidak ditemukan.",
      404
    );
  }

  if (request.method === "GET") {
    await sql`
      UPDATE direct_messages
      SET
        is_read = TRUE,
        read_at = COALESCE(read_at, NOW())
      WHERE
        conversation_id = ${conversationId}::uuid
        AND sender_id <> ${auth.user.id}
        AND is_read = FALSE
    `;

    const messages = await sql`
      SELECT *
      FROM (
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
        JOIN users u
          ON u.id = dm.sender_id
        WHERE dm.conversation_id = ${conversationId}::uuid
        ORDER BY dm.created_at DESC
        LIMIT 200
      ) recent
      ORDER BY recent.created_at ASC
    `;

    return json({
      ok: true,
      conversation,
      count: messages.length,
      messages
    });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => null);
    const message = String(body?.message || "").trim();

    if (!message || message.length > 2000) {
      return jsonError(
        "Pesan harus berisi 1 sampai 2000 karakter.",
        400
      );
    }

    const inserted = await sql`
      INSERT INTO direct_messages (
        conversation_id,
        sender_id,
        message
      )
      VALUES (
        ${conversationId}::uuid,
        ${auth.user.id},
        ${message}
      )
      RETURNING
        id,
        conversation_id,
        sender_id,
        message,
        is_read,
        created_at,
        read_at
    `;

    await sql`
      UPDATE direct_conversations
      SET updated_at = NOW()
      WHERE id = ${conversationId}::uuid
    `;

    return json({
      ok: true,
      message: inserted[0]
    }, 201);
  }

  return jsonError(
    "Metode tidak diizinkan.",
    405
  );
}

async function handleUnreadCount(sql, request) {
  const auth = await requireAuthenticatedUser(sql, request);

  if (auth.response) {
    return auth.response;
  }

  const rows = await sql`
    SELECT COUNT(*)::int AS unread_count
    FROM direct_messages dm
    JOIN direct_conversations c
      ON c.id = dm.conversation_id
    WHERE
      (
        c.user_a_id = ${auth.user.id}
        OR c.user_b_id = ${auth.user.id}
      )
      AND dm.sender_id <> ${auth.user.id}
      AND dm.is_read = FALSE
  `;

  return json({
    ok: true,
    unread_count: rows[0]?.unread_count || 0
  });
}

export async function handleSocialApi(request, env) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/social/")) {
    return null;
  }

  try {
    const sql = neon(env.DATABASE_URL);
    await ensureSocialSchema(sql);

    if (
      url.pathname === "/api/social/profile" &&
      request.method === "GET"
    ) {
      return await handleProfileRequest(sql, request, url);
    }

    if (
      url.pathname === "/api/social/followers" &&
      request.method === "GET"
    ) {
      return await handleFollowList(sql, url, "followers");
    }

    if (
      url.pathname === "/api/social/following" &&
      request.method === "GET"
    ) {
      return await handleFollowList(sql, url, "following");
    }

    if (
      url.pathname === "/api/social/comment-author" &&
      request.method === "GET"
    ) {
      return await handleCommentAuthor(sql, url);
    }

    if (
      url.pathname === "/api/social/conversations" &&
      request.method === "GET"
    ) {
      return await handleConversationList(sql, request);
    }

    if (
      url.pathname === "/api/social/conversations" &&
      request.method === "POST"
    ) {
      return await handleConversationCreate(sql, request);
    }

    if (
      url.pathname === "/api/social/unread-count" &&
      request.method === "GET"
    ) {
      return await handleUnreadCount(sql, request);
    }

    const followMatch = url.pathname.match(
      /^\/api\/social\/follow\/([0-9a-f-]{36})$/i
    );

    if (followMatch) {
      const targetUserId = normalizeUuid(followMatch[1]);

      if (!targetUserId) {
        return jsonError(
          "Pengguna tidak valid.",
          400
        );
      }

      if (
        request.method !== "POST" &&
        request.method !== "DELETE"
      ) {
        return jsonError(
          "Metode tidak diizinkan.",
          405
        );
      }

      return await handleFollowRequest(
        sql,
        request,
        targetUserId
      );
    }

    const messagesMatch = url.pathname.match(
      /^\/api\/social\/conversations\/([0-9a-f-]{36})\/messages$/i
    );

    if (messagesMatch) {
      const conversationId = normalizeUuid(messagesMatch[1]);

      if (!conversationId) {
        return jsonError(
          "Percakapan tidak valid.",
          400
        );
      }

      return await handleConversationMessages(
        sql,
        request,
        conversationId
      );
    }

    return jsonError(
      "Endpoint sosial tidak ditemukan.",
      404
    );
  } catch (error) {
    console.error("Social API error:", error);

    return jsonError(
      "Layanan sosial sedang mengalami gangguan.",
      500
    );
  }
}
