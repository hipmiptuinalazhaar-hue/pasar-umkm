import { neon } from "@neondatabase/serverless";
import { ensureEngagementSchema } from "./engagement-store.js";

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
        "Silakan masuk terlebih dahulu untuk menyukai konten.",
        401
      )
    };
  }

  return {
    user,
    response: null
  };
}

function normalizeStateItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const items = [];

  for (const raw of value.slice(0, 150)) {
    const kind = raw?.kind === "product" ? "product" : "post";
    const id = normalizeUuid(raw?.id);

    if (!id) {
      continue;
    }

    const key = `${kind}:${id}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    items.push({ kind, id });
  }

  return items;
}

async function handleState(sql, request) {
  const body = await request.json().catch(() => null);
  const items = normalizeStateItems(body?.items);
  const currentUser = await getAuthenticatedUser(sql, request);
  const currentUserId = currentUser?.id || null;

  if (!items.length) {
    return json({
      ok: true,
      items: []
    });
  }

  const postIds = items
    .filter(item => item.kind === "post")
    .map(item => item.id);

  const productIds = items
    .filter(item => item.kind === "product")
    .map(item => item.id);

  const postRows = postIds.length
    ? await sql`
        SELECT
          p.id,
          COUNT(pl.user_id)::int AS like_count,
          COALESCE(
            BOOL_OR(pl.user_id = ${currentUserId}::uuid),
            FALSE
          ) AS liked_by_me
        FROM posts p
        LEFT JOIN post_likes pl
          ON pl.post_id = p.id
        WHERE
          p.id = ANY(${postIds}::uuid[])
          AND p.is_active = TRUE
        GROUP BY p.id
      `
    : [];

  const productRows = productIds.length
    ? await sql`
        SELECT
          p.id,
          COUNT(pl.user_id)::int AS like_count,
          COALESCE(
            BOOL_OR(pl.user_id = ${currentUserId}::uuid),
            FALSE
          ) AS liked_by_me
        FROM products p
        LEFT JOIN product_likes pl
          ON pl.product_id = p.id
        WHERE
          p.id = ANY(${productIds}::uuid[])
          AND p.is_active = TRUE
        GROUP BY p.id
      `
    : [];

  const state = new Map();

  for (const row of postRows) {
    state.set(`post:${row.id}`, {
      kind: "post",
      id: row.id,
      like_count: Number(row.like_count || 0),
      liked_by_me: Boolean(row.liked_by_me)
    });
  }

  for (const row of productRows) {
    state.set(`product:${row.id}`, {
      kind: "product",
      id: row.id,
      like_count: Number(row.like_count || 0),
      liked_by_me: Boolean(row.liked_by_me)
    });
  }

  return json({
    ok: true,
    items: items.map(item =>
      state.get(`${item.kind}:${item.id}`) || {
        kind: item.kind,
        id: item.id,
        like_count: 0,
        liked_by_me: false
      }
    )
  });
}

async function ensureContentExists(sql, kind, id) {
  if (kind === "product") {
    const rows = await sql`
      SELECT id
      FROM products
      WHERE
        id = ${id}::uuid
        AND is_active = TRUE
      LIMIT 1
    `;

    return Boolean(rows[0]);
  }

  const rows = await sql`
    SELECT id
    FROM posts
    WHERE
      id = ${id}::uuid
      AND is_active = TRUE
    LIMIT 1
  `;

  return Boolean(rows[0]);
}

async function createProductLikeNotification(sql, actor, productId) {
  try {
    const rows = await sql`
      SELECT
        p.name AS product_name,
        s.owner_id
      FROM products p
      JOIN stores s
        ON s.id = p.store_id
      WHERE p.id = ${productId}::uuid
      LIMIT 1
    `;

    const product = rows[0];

    if (
      !product ||
      String(product.owner_id) === String(actor.id)
    ) {
      return;
    }

    await sql`
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        target_type,
        target_id,
        actor_user_id,
        entity_type,
        entity_id,
        is_read,
        created_at
      )
      VALUES (
        ${product.owner_id},
        'system',
        'Like produk baru',
        ${`${actor.name || "Seseorang"} menyukai ${product.product_name || "produk Anda"}.`},
        'product',
        ${productId}::uuid,
        ${actor.id},
        'product',
        ${productId}::uuid,
        FALSE,
        NOW()
      )
    `;
  } catch (error) {
    console.error(
      "Product like notification error:",
      error
    );
  }
}

async function mutateLike(sql, request, kind, id) {
  const auth = await requireUser(sql, request);

  if (auth.response) {
    return auth.response;
  }

  if (!(await ensureContentExists(sql, kind, id))) {
    return jsonError(
      kind === "product"
        ? "Produk tidak ditemukan."
        : "Postingan tidak ditemukan.",
      404
    );
  }

  if (kind === "product") {
    if (request.method === "POST") {
      const inserted = await sql`
        INSERT INTO product_likes (
          user_id,
          product_id
        )
        VALUES (
          ${auth.user.id},
          ${id}::uuid
        )
        ON CONFLICT (user_id, product_id)
        DO NOTHING
        RETURNING product_id
      `;

      if (inserted[0]) {
        await createProductLikeNotification(
          sql,
          auth.user,
          id
        );
      }
    } else {
      await sql`
        DELETE FROM product_likes
        WHERE
          user_id = ${auth.user.id}
          AND product_id = ${id}::uuid
      `;
    }

    const rows = await sql`
      SELECT
        COUNT(*)::int AS like_count,
        EXISTS (
          SELECT 1
          FROM product_likes
          WHERE
            user_id = ${auth.user.id}
            AND product_id = ${id}::uuid
        ) AS liked_by_me
      FROM product_likes
      WHERE product_id = ${id}::uuid
    `;

    return json({
      ok: true,
      kind,
      id,
      like_count: Number(rows[0]?.like_count || 0),
      liked_by_me: Boolean(rows[0]?.liked_by_me)
    });
  }

  if (request.method === "POST") {
    await sql`
      INSERT INTO post_likes (
        user_id,
        post_id
      )
      VALUES (
        ${auth.user.id},
        ${id}::uuid
      )
      ON CONFLICT (user_id, post_id)
      DO NOTHING
    `;
  } else {
    await sql`
      DELETE FROM post_likes
      WHERE
        user_id = ${auth.user.id}
        AND post_id = ${id}::uuid
    `;
  }

  const rows = await sql`
    SELECT
      COUNT(*)::int AS like_count,
      EXISTS (
        SELECT 1
        FROM post_likes
        WHERE
          user_id = ${auth.user.id}
          AND post_id = ${id}::uuid
      ) AS liked_by_me
    FROM post_likes
    WHERE post_id = ${id}::uuid
  `;

  return json({
    ok: true,
    kind,
    id,
    like_count: Number(rows[0]?.like_count || 0),
    liked_by_me: Boolean(rows[0]?.liked_by_me)
  });
}

export async function handleEngagementApi(request, env) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/social/likes")) {
    return null;
  }

  try {
    const sql = neon(env.DATABASE_URL);
    await ensureEngagementSchema(sql);

    if (
      url.pathname === "/api/social/likes/state" &&
      request.method === "POST"
    ) {
      return await handleState(sql, request);
    }

    const match = url.pathname.match(
      /^\/api\/social\/likes\/(post|product)\/([0-9a-f-]{36})$/i
    );

    if (!match) {
      return jsonError(
        "Endpoint like tidak ditemukan.",
        404
      );
    }

    const kind = match[1].toLowerCase();
    const id = normalizeUuid(match[2]);

    if (!id) {
      return jsonError(
        "Konten tidak valid.",
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

    return await mutateLike(
      sql,
      request,
      kind,
      id
    );
  } catch (error) {
    console.error("Engagement API error:", error);

    return jsonError(
      "Like belum dapat diproses.",
      500
    );
  }
}
