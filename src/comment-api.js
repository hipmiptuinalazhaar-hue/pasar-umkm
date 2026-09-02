import { Client } from "@neondatabase/serverless";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_COMMENT_LENGTH = 500;

const COMMENT_KINDS = Object.freeze({
  post: Object.freeze({
    table: "post_comments",
    targetTable: "posts",
    targetColumn: "post_id",
    targetLabel: "Postingan",
    createMessage: "Komentar berhasil dikirim."
  }),
  product: Object.freeze({
    table: "product_comments",
    targetTable: "products",
    targetColumn: "product_id",
    targetLabel: "Produk",
    createMessage: "Komentar produk berhasil dikirim."
  })
});

class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function jsonError(message, status = 400) {
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

function normalizeUuid(value) {
  const id = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}

function configFor(kind) {
  const config = COMMENT_KINDS[kind];
  if (!config) throw new HttpError("Jenis komentar tidak valid.", 400);
  return config;
}

async function withClient(env, work) {
  const client = new Client({ connectionString: env.DATABASE_URL });
  try {
    await client.connect();
    return await work(client);
  } finally {
    try {
      await client.end();
    } catch (error) {
      console.error("Comment database client close failed:", error);
    }
  }
}

async function withTransaction(env, work) {
  return await withClient(env, async client => {
    let started = false;
    try {
      await client.query("BEGIN");
      started = true;
      const result = await work(client);
      await client.query("COMMIT");
      started = false;
      return result;
    } catch (error) {
      if (started) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Comment transaction rollback failed:", rollbackError);
        }
      }
      throw error;
    }
  });
}

async function authenticatedUser(client, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const result = await client.query(
    `
      SELECT u.id, u.name, u.avatar_url, u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE
        s.token_hash = encode(digest($1, 'sha256'), 'hex')
        AND s.expires_at > NOW()
        AND u.is_active = TRUE
      LIMIT 1
    `,
    [token]
  );

  return result.rows[0] || null;
}

function targetActiveQuery(kind) {
  const config = configFor(kind);
  return `
    SELECT target.id
    FROM ${config.targetTable} target
    JOIN stores s ON s.id = target.store_id
    WHERE
      target.id = $1::uuid
      AND target.is_active = TRUE
      AND s.is_active = TRUE
    LIMIT 1
    FOR SHARE OF target, s
  `;
}

function listQuery(kind) {
  const { table, targetTable, targetColumn } = configFor(kind);

  return `
    SELECT
      c.id,
      c.${targetColumn},
      CASE
        WHEN c.is_active = TRUE AND COALESCE(u.is_active, FALSE) = TRUE
          THEN c.user_id
        ELSE NULL
      END AS user_id,
      c.parent_comment_id,
      CASE
        WHEN c.is_active = TRUE AND COALESCE(u.is_active, FALSE) = TRUE
          THEN c.content
        ELSE 'Komentar telah dihapus.'
      END AS content,
      c.created_at,
      c.updated_at,
      CASE
        WHEN c.is_active = TRUE AND COALESCE(u.is_active, FALSE) = TRUE
          THEN u.name
        ELSE 'Komentar dihapus'
      END AS user_name,
      CASE
        WHEN c.is_active = TRUE AND COALESCE(u.is_active, FALSE) = TRUE
          THEN u.avatar_url
        ELSE NULL
      END AS user_avatar,
      NOT (
        c.is_active = TRUE
        AND COALESCE(u.is_active, FALSE) = TRUE
      ) AS is_deleted
    FROM ${table} c
    LEFT JOIN users u ON u.id = c.user_id
    JOIN ${targetTable} target ON target.id = c.${targetColumn}
    JOIN stores s ON s.id = target.store_id
    WHERE
      c.${targetColumn} = $1::uuid
      AND target.is_active = TRUE
      AND s.is_active = TRUE
      AND (
        (
          c.parent_comment_id IS NULL
          AND (
            (c.is_active = TRUE AND COALESCE(u.is_active, FALSE) = TRUE)
            OR EXISTS (
              SELECT 1
              FROM ${table} reply
              JOIN users reply_user ON reply_user.id = reply.user_id
              WHERE
                reply.parent_comment_id = c.id
                AND reply.${targetColumn} = c.${targetColumn}
                AND reply.is_active = TRUE
                AND reply_user.is_active = TRUE
            )
          )
        )
        OR (
          c.parent_comment_id IS NOT NULL
          AND c.is_active = TRUE
          AND COALESCE(u.is_active, FALSE) = TRUE
          AND EXISTS (
            SELECT 1
            FROM ${table} parent
            WHERE
              parent.id = c.parent_comment_id
              AND parent.${targetColumn} = c.${targetColumn}
              AND parent.parent_comment_id IS NULL
          )
        )
      )
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT 500
  `;
}

async function listComments(env, kind, targetId) {
  return await withClient(env, async client => {
    const result = await client.query(listQuery(kind), [targetId]);
    const comments = result.rows;
    const activeCount = comments.reduce(
      (count, comment) => count + (comment.is_deleted ? 0 : 1),
      0
    );

    return json({
      ok: true,
      count: activeCount,
      comments
    });
  });
}

function parentQuery(kind) {
  const { table, targetColumn } = configFor(kind);

  return `
    SELECT
      candidate.id AS candidate_id,
      root.id AS root_id
    FROM ${table} candidate
    JOIN ${table} root
      ON root.id = COALESCE(candidate.parent_comment_id, candidate.id)
    JOIN users candidate_user ON candidate_user.id = candidate.user_id
    JOIN users root_user ON root_user.id = root.user_id
    WHERE
      candidate.id = $1::uuid
      AND candidate.${targetColumn} = $2::uuid
      AND candidate.is_active = TRUE
      AND candidate_user.is_active = TRUE
      AND root.${targetColumn} = $2::uuid
      AND root.parent_comment_id IS NULL
      AND root.is_active = TRUE
      AND root_user.is_active = TRUE
    LIMIT 1
    FOR UPDATE OF candidate, root
  `;
}

function insertQuery(kind) {
  const { table, targetColumn } = configFor(kind);
  return `
    INSERT INTO ${table} (
      ${targetColumn},
      user_id,
      parent_comment_id,
      content,
      is_active
    )
    VALUES ($1::uuid, $2::uuid, $3::uuid, $4, TRUE)
    RETURNING
      id,
      ${targetColumn},
      user_id,
      parent_comment_id,
      content,
      created_at,
      updated_at
  `;
}

async function createComment(env, request, kind, targetId) {
  const body = await request.json().catch(() => null);
  if (!body) return jsonError("Data komentar tidak valid.", 400);

  const content = String(body.content || "").trim();
  if (!content) return jsonError("Komentar tidak boleh kosong.", 400);
  if (content.length > MAX_COMMENT_LENGTH) {
    return jsonError(`Komentar maksimal ${MAX_COMMENT_LENGTH} karakter.`, 400);
  }

  const requestedParentId = body.parent_comment_id
    ? normalizeUuid(body.parent_comment_id)
    : null;

  if (body.parent_comment_id && !requestedParentId) {
    return jsonError("ID komentar induk tidak valid.", 400);
  }

  try {
    const result = await withTransaction(env, async client => {
      const user = await authenticatedUser(client, request);
      if (!user) throw new HttpError("Silakan masuk terlebih dahulu.", 401);

      const target = await client.query(targetActiveQuery(kind), [targetId]);
      if (!target.rows[0]) {
        throw new HttpError(`${configFor(kind).targetLabel} tidak ditemukan.`, 404);
      }

      let parentCommentId = null;
      if (requestedParentId) {
        const parent = await client.query(parentQuery(kind), [
          requestedParentId,
          targetId
        ]);

        if (!parent.rows[0]) {
          throw new HttpError(
            "Komentar yang ingin dibalas tidak ditemukan atau sudah dihapus.",
            404
          );
        }

        parentCommentId = parent.rows[0].root_id;
      }

      const inserted = await client.query(insertQuery(kind), [
        targetId,
        user.id,
        parentCommentId,
        content
      ]);

      if (!inserted.rows[0]) {
        throw new HttpError("Komentar gagal dibuat.", 500);
      }

      return {
        ...inserted.rows[0],
        user_name: user.name,
        user_avatar: user.avatar_url || null,
        is_deleted: false
      };
    });

    return json(
      {
        ok: true,
        message: configFor(kind).createMessage,
        comment: result
      },
      201
    );
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }

    if (error?.code === "40001" || error?.code === "40P01") {
      return jsonError("Komentar berubah bersamaan. Silakan coba lagi.", 409);
    }

    console.error("Comment create transaction error:", error);
    return jsonError("Gagal mengirim komentar.", 500);
  }
}

function commentForDeleteQuery(kind) {
  const { table } = configFor(kind);
  return `
    SELECT id, user_id, parent_comment_id, is_active
    FROM ${table}
    WHERE id = $1::uuid
    LIMIT 1
    FOR UPDATE
  `;
}

function softDeleteQuery(kind) {
  const { table } = configFor(kind);
  return `
    UPDATE ${table}
    SET is_active = FALSE, updated_at = NOW()
    WHERE id = $1::uuid
    RETURNING id
  `;
}

async function deleteComment(env, request, kind, commentId) {
  try {
    await withTransaction(env, async client => {
      const user = await authenticatedUser(client, request);
      if (!user) throw new HttpError("Silakan masuk terlebih dahulu.", 401);

      const found = await client.query(commentForDeleteQuery(kind), [commentId]);
      const comment = found.rows[0];
      if (!comment || comment.is_active !== true) {
        throw new HttpError("Komentar tidak ditemukan.", 404);
      }

      const owner = String(comment.user_id) === String(user.id);
      const admin = user.role === "admin";
      if (!owner && !admin) {
        throw new HttpError(
          "Anda tidak memiliki izin menghapus komentar ini.",
          403
        );
      }

      await client.query(softDeleteQuery(kind), [commentId]);
    });

    return json({
      ok: true,
      message: "Komentar berhasil dihapus."
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }

    if (error?.code === "40001" || error?.code === "40P01") {
      return jsonError("Komentar berubah bersamaan. Silakan coba lagi.", 409);
    }

    console.error("Comment delete transaction error:", error);
    return jsonError("Gagal menghapus komentar.", 500);
  }
}

function route(url, method) {
  let match = url.pathname.match(/^\/api\/posts\/([0-9a-f-]{36})\/comments$/i);
  if (match && (method === "GET" || method === "POST")) {
    return { action: method === "GET" ? "list" : "create", kind: "post", id: match[1] };
  }

  match = url.pathname.match(/^\/api\/products\/([0-9a-f-]{36})\/comments$/i);
  if (match && (method === "GET" || method === "POST")) {
    return { action: method === "GET" ? "list" : "create", kind: "product", id: match[1] };
  }

  match = url.pathname.match(/^\/api\/comments\/([0-9a-f-]{36})$/i);
  if (match && method === "DELETE") {
    return { action: "delete", kind: "post", id: match[1] };
  }

  match = url.pathname.match(/^\/api\/product-comments\/([0-9a-f-]{36})$/i);
  if (match && method === "DELETE") {
    return { action: "delete", kind: "product", id: match[1] };
  }

  return null;
}

export async function handleCommentApi(request, env) {
  const url = new URL(request.url);
  const resolved = route(url, request.method);
  if (!resolved) return null;

  const id = normalizeUuid(resolved.id);
  if (!id) return jsonError("ID tidak valid.", 400);

  try {
    if (resolved.action === "list") {
      return await listComments(env, resolved.kind, id);
    }
    if (resolved.action === "create") {
      return await createComment(env, request, resolved.kind, id);
    }
    return await deleteComment(env, request, resolved.kind, id);
  } catch (error) {
    console.error("Comment API error:", error);
    return jsonError("Layanan komentar sedang mengalami gangguan.", 500);
  }
}
