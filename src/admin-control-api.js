import { requireAdminPermission } from "./admin-authorization.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;
const MAX_QUERY = 80;
const MAX_BODY_BYTES = 4096;
const MIN_REASON = 8;
const MAX_REASON = 300;

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

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

function normalizeQuery(value) {
  return String(value || "").trim().slice(0, MAX_QUERY);
}

function parseLimit(value) {
  const parsed = Number.parseInt(String(value || DEFAULT_LIMIT), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

function encodeCursor(row) {
  if (!row?.created_at || !row?.id) return null;
  const raw = `${new Date(row.created_at).toISOString()}|${row.id}`;
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeCursor(value) {
  if (!value) return { createdAt: null, id: null };
  try {
    const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const [createdAt, id, extra] = atob(padded).split("|");
    if (extra !== undefined || !UUID_PATTERN.test(id || "")) throw new Error("bad cursor");
    const date = new Date(createdAt);
    if (!Number.isFinite(date.getTime())) throw new Error("bad cursor date");
    return { createdAt: date.toISOString(), id };
  } catch {
    return null;
  }
}

function paginate(rows, limit) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    page: {
      limit,
      has_more: hasMore,
      next_cursor: hasMore ? encodeCursor(items[items.length - 1]) : null
    }
  };
}

async function parseSmallJson(request) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { error: json({ ok: false, code: "REQUEST_TOO_LARGE", error: "Request terlalu besar." }, 413) };
  }
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
    return { body };
  } catch {
    return { error: json({ ok: false, code: "INVALID_REQUEST", error: "Data tidak valid." }, 400) };
  }
}

function validReason(value) {
  const reason = String(value || "").trim();
  if (reason.length < MIN_REASON || reason.length > MAX_REASON) return null;
  return reason;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value || ""))
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function auditSignals(request) {
  const address = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
  const userAgent = request.headers.get("User-Agent") || "unknown";
  const [ipHash, userAgentHash] = await Promise.all([
    sha256Hex(address),
    sha256Hex(userAgent)
  ]);
  return {
    ipHash,
    userAgentHash,
    requestId: (request.headers.get("CF-Ray") || request.headers.get("X-Request-ID") || crypto.randomUUID()).slice(0, 128)
  };
}

async function authorize(request, env, permissionKey, options = {}) {
  const result = await requireAdminPermission(request, env, permissionKey, options);
  return result.ok ? result : { response: result.response };
}

async function overview(request, env) {
  const authz = await authorize(request, env, "dashboard.view");
  if (authz.response) return authz.response;

  const rows = await authz.sql`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS users_total,
      (SELECT COUNT(*)::int FROM users WHERE is_active = TRUE) AS users_active,
      (SELECT COUNT(*)::int FROM users WHERE created_at >= NOW() - INTERVAL '7 days') AS users_new_7d,
      (SELECT COUNT(*)::int FROM stores) AS stores_total,
      (SELECT COUNT(*)::int FROM stores WHERE is_active = TRUE) AS stores_active,
      (SELECT COUNT(*)::int FROM stores WHERE verification_status = 'pending') AS stores_pending_verification,
      (SELECT COUNT(*)::int FROM products) AS products_total,
      (SELECT COUNT(*)::int FROM products WHERE is_active = TRUE) AS products_active,
      (SELECT COUNT(*)::int FROM products WHERE is_active = FALSE) AS products_inactive,
      (SELECT COUNT(*)::int FROM posts) AS posts_total,
      (SELECT COUNT(*)::int FROM posts WHERE is_active = TRUE) AS posts_active,
      (SELECT COUNT(*)::int FROM posts WHERE is_active = FALSE) AS posts_inactive,
      (SELECT COUNT(*)::int FROM orders) AS orders_total,
      (SELECT COUNT(*)::int FROM orders WHERE status = 'pending') AS orders_pending,
      (SELECT COUNT(*)::int FROM orders WHERE status = 'completed') AS orders_completed,
      (SELECT COUNT(*)::int FROM orders WHERE status = 'cancelled') AS orders_cancelled,
      (SELECT COALESCE(SUM(total), 0)::numeric FROM orders WHERE status = 'completed') AS completed_order_value,
      (SELECT COUNT(*)::int FROM store_ratings) + (SELECT COUNT(*)::int FROM product_ratings) AS reviews_total,
      (
        SELECT ROUND(AVG(rating)::numeric, 2)
        FROM (
          SELECT rating FROM store_ratings
          UNION ALL
          SELECT rating FROM product_ratings
        ) all_ratings
      ) AS rating_average,
      to_regclass('public.moderation_reports') IS NOT NULL AS reports_available
  `;

  return json({ ok: true, overview: rows[0] || {} });
}

async function users(request, env, url) {
  const authz = await authorize(request, env, "users.view");
  if (authz.response) return authz.response;

  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  if (cursor === null) return json({ ok: false, code: "INVALID_CURSOR" }, 400);
  const q = normalizeQuery(url.searchParams.get("q"));
  const state = ["all", "active", "suspended"].includes(url.searchParams.get("state"))
    ? url.searchParams.get("state")
    : "all";

  const rows = await authz.sql`
    SELECT
      u.id, u.name, u.email, u.role::text AS role, u.is_active,
      u.email_verified, u.last_login_at, u.created_at,
      (s.id IS NOT NULL) AS has_store,
      s.name AS store_name
    FROM users u
    LEFT JOIN stores s ON s.owner_id = u.id
    WHERE
      (${q} = '' OR lower(u.email) = lower(${q}) OR lower(u.name) LIKE lower(${q}) || '%')
      AND (${state} = 'all' OR (${state} = 'active' AND u.is_active = TRUE) OR (${state} = 'suspended' AND u.is_active = FALSE))
      AND (${cursor.createdAt}::timestamptz IS NULL OR (u.created_at, u.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid))
    ORDER BY u.created_at DESC, u.id DESC
    LIMIT ${limit + 1}
  `;

  return json({ ok: true, ...paginate(rows, limit), filters: { q, state } });
}

async function stores(request, env, url) {
  const authz = await authorize(request, env, "stores.view");
  if (authz.response) return authz.response;

  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  if (cursor === null) return json({ ok: false, code: "INVALID_CURSOR" }, 400);
  const q = normalizeQuery(url.searchParams.get("q"));
  const verification = ["all", "pending", "verified", "rejected"].includes(url.searchParams.get("verification"))
    ? url.searchParams.get("verification")
    : "all";

  const rows = await authz.sql`
    SELECT
      s.id, s.name, s.slug, s.city, s.province, s.verification_status::text AS verification_status,
      s.verified_at, s.is_active, s.created_at,
      u.id AS owner_id, u.name AS owner_name, u.email AS owner_email,
      (SELECT COUNT(*)::int FROM products p WHERE p.store_id = s.id) AS product_count,
      (SELECT COUNT(*)::int FROM orders o WHERE o.store_id = s.id) AS order_count
    FROM stores s
    JOIN users u ON u.id = s.owner_id
    WHERE
      (${q} = '' OR lower(s.name) LIKE lower(${q}) || '%' OR lower(u.email) = lower(${q}))
      AND (${verification} = 'all' OR s.verification_status::text = ${verification})
      AND (${cursor.createdAt}::timestamptz IS NULL OR (s.created_at, s.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid))
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT ${limit + 1}
  `;

  return json({ ok: true, ...paginate(rows, limit), filters: { q, verification } });
}

async function products(request, env, url) {
  const authz = await authorize(request, env, "products.view");
  if (authz.response) return authz.response;

  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  if (cursor === null) return json({ ok: false, code: "INVALID_CURSOR" }, 400);
  const q = normalizeQuery(url.searchParams.get("q"));
  const state = ["all", "active", "inactive"].includes(url.searchParams.get("state"))
    ? url.searchParams.get("state")
    : "all";

  const rows = await authz.sql`
    SELECT
      p.id, p.name, p.slug, p.price, p.stock, p.unit, p.thumbnail_url,
      p.is_active, p.is_featured, p.created_at,
      s.id AS store_id, s.name AS store_name
    FROM products p
    JOIN stores s ON s.id = p.store_id
    WHERE
      (${q} = '' OR lower(p.name) LIKE lower(${q}) || '%' OR lower(s.name) LIKE lower(${q}) || '%')
      AND (${state} = 'all' OR (${state} = 'active' AND p.is_active = TRUE) OR (${state} = 'inactive' AND p.is_active = FALSE))
      AND (${cursor.createdAt}::timestamptz IS NULL OR (p.created_at, p.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid))
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT ${limit + 1}
  `;

  return json({ ok: true, ...paginate(rows, limit), filters: { q, state } });
}

async function posts(request, env, url) {
  const authz = await authorize(request, env, "posts.view");
  if (authz.response) return authz.response;

  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  if (cursor === null) return json({ ok: false, code: "INVALID_CURSOR" }, 400);
  const state = ["all", "active", "inactive"].includes(url.searchParams.get("state"))
    ? url.searchParams.get("state")
    : "all";

  const rows = await authz.sql`
    SELECT
      p.id, LEFT(COALESCE(p.caption, ''), 220) AS caption, p.image_url,
      p.is_active, p.created_at, s.id AS store_id, s.name AS store_name
    FROM posts p
    JOIN stores s ON s.id = p.store_id
    WHERE
      (${state} = 'all' OR (${state} = 'active' AND p.is_active = TRUE) OR (${state} = 'inactive' AND p.is_active = FALSE))
      AND (${cursor.createdAt}::timestamptz IS NULL OR (p.created_at, p.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid))
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT ${limit + 1}
  `;

  return json({ ok: true, ...paginate(rows, limit), filters: { state } });
}

async function orders(request, env, url) {
  const authz = await authorize(request, env, "orders.view");
  if (authz.response) return authz.response;

  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  if (cursor === null) return json({ ok: false, code: "INVALID_CURSOR" }, 400);
  const q = normalizeQuery(url.searchParams.get("q"));
  const status = ["all", "pending", "confirmed", "processing", "ready", "completed", "cancelled"].includes(url.searchParams.get("status"))
    ? url.searchParams.get("status")
    : "all";

  const rows = await authz.sql`
    SELECT
      o.id, o.order_number, o.status::text AS status, o.subtotal, o.delivery_fee, o.total,
      o.created_at, u.id AS buyer_id, u.name AS buyer_name,
      s.id AS store_id, s.name AS store_name
    FROM orders o
    JOIN users u ON u.id = o.buyer_id
    JOIN stores s ON s.id = o.store_id
    WHERE
      (${q} = '' OR o.order_number = ${q} OR lower(u.name) LIKE lower(${q}) || '%' OR lower(s.name) LIKE lower(${q}) || '%')
      AND (${status} = 'all' OR o.status::text = ${status})
      AND (${cursor.createdAt}::timestamptz IS NULL OR (o.created_at, o.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid))
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT ${limit + 1}
  `;

  return json({ ok: true, ...paginate(rows, limit), filters: { q, status } });
}

async function reviews(request, env, url) {
  const authz = await authorize(request, env, "reviews.view");
  if (authz.response) return authz.response;

  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  if (cursor === null) return json({ ok: false, code: "INVALID_CURSOR" }, 400);
  const type = ["all", "store", "product"].includes(url.searchParams.get("type"))
    ? url.searchParams.get("type")
    : "all";

  const rows = await authz.sql`
    WITH review_feed AS (
      SELECT
        sr.id, sr.created_at, 'store'::text AS subject_type,
        s.id AS subject_id, s.name AS subject_name,
        sr.rating::int AS rating, sr.review,
        u.id AS user_id, u.name AS user_name
      FROM store_ratings sr
      JOIN stores s ON s.id = sr.store_id
      JOIN users u ON u.id = sr.user_id
      UNION ALL
      SELECT
        pr.id, pr.created_at, 'product'::text AS subject_type,
        p.id AS subject_id, p.name AS subject_name,
        pr.rating::int AS rating, pr.review,
        u.id AS user_id, u.name AS user_name
      FROM product_ratings pr
      JOIN products p ON p.id = pr.product_id
      JOIN users u ON u.id = pr.user_id
    )
    SELECT id, created_at, subject_type, subject_id, subject_name, rating, review, user_id, user_name
    FROM review_feed
    WHERE
      (${type} = 'all' OR subject_type = ${type})
      AND (${cursor.createdAt}::timestamptz IS NULL OR (created_at, id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid))
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit + 1}
  `;

  return json({ ok: true, ...paginate(rows, limit), filters: { type } });
}

async function audit(request, env, url) {
  const authz = await authorize(request, env, "audit_logs.view");
  if (authz.response) return authz.response;

  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  if (cursor === null) return json({ ok: false, code: "INVALID_CURSOR" }, 400);
  const outcome = ["all", "success", "denied", "failure"].includes(url.searchParams.get("outcome"))
    ? url.searchParams.get("outcome")
    : "all";

  const rows = await authz.sql`
    SELECT
      id, admin_account_id, actor_name_snapshot, actor_email_snapshot,
      action, resource_type, resource_id, outcome, reason_code, request_id, created_at
    FROM admin_audit_logs
    WHERE
      (${outcome} = 'all' OR outcome = ${outcome})
      AND (${cursor.createdAt}::timestamptz IS NULL OR (created_at, id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid))
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit + 1}
  `;

  return json({ ok: true, ...paginate(rows, limit), filters: { outcome } });
}

async function admins(request, env, url) {
  const authz = await authorize(request, env, "admin_accounts.view");
  if (authz.response) return authz.response;

  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  if (cursor === null) return json({ ok: false, code: "INVALID_CURSOR" }, 400);

  const rows = await authz.sql`
    SELECT
      a.id, a.name, a.email, a.status, a.mfa_required,
      (a.mfa_enrolled_at IS NOT NULL) AS mfa_enrolled,
      a.must_rotate_password, a.last_login_at, a.created_at,
      COALESCE(
        ARRAY_AGG(ar.role_key ORDER BY ar.role_key) FILTER (WHERE ar.role_key IS NOT NULL),
        ARRAY[]::varchar[]
      ) AS roles
    FROM admin_accounts a
    LEFT JOIN admin_account_roles aar ON aar.admin_account_id = a.id
    LEFT JOIN admin_roles ar ON ar.id = aar.role_id AND ar.is_active = TRUE
    WHERE
      (${cursor.createdAt}::timestamptz IS NULL OR (a.created_at, a.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid))
    GROUP BY a.id
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ${limit + 1}
  `;

  return json({ ok: true, ...paginate(rows, limit) });
}

async function changeUserStatus(request, env, userId) {
  const parsed = await parseSmallJson(request);
  if (parsed.error) return parsed.error;
  if (typeof parsed.body.active !== "boolean") return json({ ok: false, code: "INVALID_STATUS" }, 400);
  const reason = validReason(parsed.body.reason);
  if (!reason) return json({ ok: false, code: "REASON_REQUIRED", error: `Alasan wajib ${MIN_REASON}-${MAX_REASON} karakter.` }, 400);

  const permission = parsed.body.active ? "users.reactivate" : "users.suspend";
  const authz = await authorize(request, env, permission, { touch: false });
  if (authz.response) return authz.response;
  const signals = await auditSignals(request);

  const rows = await authz.sql`
    WITH updated AS (
      UPDATE users
      SET is_active = ${parsed.body.active}, updated_at = NOW()
      WHERE id = ${userId}::uuid
        AND is_active IS DISTINCT FROM ${parsed.body.active}
      RETURNING id, name, email, is_active
    ),
    revoked AS (
      DELETE FROM sessions
      WHERE user_id IN (SELECT id FROM updated)
        AND ${parsed.body.active} = FALSE
      RETURNING id
    ),
    logged AS (
      INSERT INTO admin_audit_logs (
        admin_account_id, actor_name_snapshot, actor_email_snapshot,
        action, resource_type, resource_id, outcome, reason_code,
        request_id, ip_hash, user_agent_hash, metadata
      )
      SELECT
        ${authz.session.id}, ${authz.session.name}, ${authz.session.email},
        'admin.user.status.change', 'user', u.id::text, 'success',
        ${parsed.body.active ? "user_reactivated" : "user_suspended"},
        ${signals.requestId}, ${signals.ipHash}, ${signals.userAgentHash},
        jsonb_build_object('reason', ${reason}, 'active', u.is_active)
      FROM updated u
      RETURNING id
    )
    SELECT u.id, u.name, u.email, u.is_active,
      (SELECT COUNT(*)::int FROM revoked) AS revoked_sessions
    FROM updated u
  `;

  if (!rows[0]) return json({ ok: false, code: "NO_STATE_CHANGE", error: "Pengguna tidak ditemukan atau statusnya sudah sama." }, 409);
  return json({ ok: true, user: rows[0] });
}

async function changeStore(request, env, storeId) {
  const parsed = await parseSmallJson(request);
  if (parsed.error) return parsed.error;
  const action = String(parsed.body.action || "");
  const permissionMap = {
    verify: "stores.verify",
    suspend: "stores.suspend",
    reactivate: "stores.reactivate"
  };
  const permission = permissionMap[action];
  if (!permission) return json({ ok: false, code: "INVALID_ACTION" }, 400);
  const reason = validReason(parsed.body.reason);
  if (!reason) return json({ ok: false, code: "REASON_REQUIRED", error: `Alasan wajib ${MIN_REASON}-${MAX_REASON} karakter.` }, 400);

  const authz = await authorize(request, env, permission, { touch: false });
  if (authz.response) return authz.response;
  const signals = await auditSignals(request);

  const rows = await authz.sql`
    WITH updated AS (
      UPDATE stores
      SET
        verification_status = CASE WHEN ${action} = 'verify' THEN 'verified'::store_verification_status ELSE verification_status END,
        verified_at = CASE WHEN ${action} = 'verify' THEN NOW() ELSE verified_at END,
        is_active = CASE WHEN ${action} = 'suspend' THEN FALSE WHEN ${action} = 'reactivate' THEN TRUE ELSE is_active END,
        updated_at = NOW()
      WHERE id = ${storeId}::uuid
        AND (
          (${action} = 'verify' AND verification_status <> 'verified') OR
          (${action} = 'suspend' AND is_active = TRUE) OR
          (${action} = 'reactivate' AND is_active = FALSE)
        )
      RETURNING id, name, verification_status::text AS verification_status, is_active, verified_at
    ),
    logged AS (
      INSERT INTO admin_audit_logs (
        admin_account_id, actor_name_snapshot, actor_email_snapshot,
        action, resource_type, resource_id, outcome, reason_code,
        request_id, ip_hash, user_agent_hash, metadata
      )
      SELECT
        ${authz.session.id}, ${authz.session.name}, ${authz.session.email},
        'admin.store.action', 'store', s.id::text, 'success', ${`store_${action}`},
        ${signals.requestId}, ${signals.ipHash}, ${signals.userAgentHash},
        jsonb_build_object('reason', ${reason}, 'action', ${action})
      FROM updated s
      RETURNING id
    )
    SELECT * FROM updated
  `;

  if (!rows[0]) return json({ ok: false, code: "NO_STATE_CHANGE", error: "Toko tidak ditemukan atau statusnya sudah sesuai." }, 409);
  return json({ ok: true, store: rows[0] });
}

async function changeContentStatus(request, env, { table, resource, id, active, permission, reason }) {
  const authz = await authorize(request, env, permission, { touch: false });
  if (authz.response) return authz.response;
  const signals = await auditSignals(request);

  if (table === "products") {
    const rows = await authz.sql`
      WITH updated AS (
        UPDATE products
        SET is_active = ${active}, updated_at = NOW()
        WHERE id = ${id}::uuid AND is_active IS DISTINCT FROM ${active}
        RETURNING id, name, is_active
      ),
      logged AS (
        INSERT INTO admin_audit_logs (
          admin_account_id, actor_name_snapshot, actor_email_snapshot,
          action, resource_type, resource_id, outcome, reason_code,
          request_id, ip_hash, user_agent_hash, metadata
        )
        SELECT ${authz.session.id}, ${authz.session.name}, ${authz.session.email},
          'admin.product.status.change', ${resource}, p.id::text, 'success',
          ${active ? "product_restored" : "product_suspended"},
          ${signals.requestId}, ${signals.ipHash}, ${signals.userAgentHash},
          jsonb_build_object('reason', ${reason}, 'active', p.is_active)
        FROM updated p RETURNING id
      )
      SELECT * FROM updated
    `;
    return rows[0] ? json({ ok: true, product: rows[0] }) : json({ ok: false, code: "NO_STATE_CHANGE" }, 409);
  }

  const rows = await authz.sql`
    WITH updated AS (
      UPDATE posts
      SET is_active = ${active}, updated_at = NOW()
      WHERE id = ${id}::uuid AND is_active IS DISTINCT FROM ${active}
      RETURNING id, is_active
    ),
    logged AS (
      INSERT INTO admin_audit_logs (
        admin_account_id, actor_name_snapshot, actor_email_snapshot,
        action, resource_type, resource_id, outcome, reason_code,
        request_id, ip_hash, user_agent_hash, metadata
      )
      SELECT ${authz.session.id}, ${authz.session.name}, ${authz.session.email},
        'admin.post.status.change', ${resource}, p.id::text, 'success',
        ${active ? "post_restored" : "post_suspended"},
        ${signals.requestId}, ${signals.ipHash}, ${signals.userAgentHash},
        jsonb_build_object('reason', ${reason}, 'active', p.is_active)
      FROM updated p RETURNING id
    )
    SELECT * FROM updated
  `;
  return rows[0] ? json({ ok: true, post: rows[0] }) : json({ ok: false, code: "NO_STATE_CHANGE" }, 409);
}

async function changeProductStatus(request, env, productId) {
  const parsed = await parseSmallJson(request);
  if (parsed.error) return parsed.error;
  if (typeof parsed.body.active !== "boolean") return json({ ok: false, code: "INVALID_STATUS" }, 400);
  const reason = validReason(parsed.body.reason);
  if (!reason) return json({ ok: false, code: "REASON_REQUIRED", error: `Alasan wajib ${MIN_REASON}-${MAX_REASON} karakter.` }, 400);
  return changeContentStatus(request, env, {
    table: "products", resource: "product", id: productId,
    active: parsed.body.active,
    permission: parsed.body.active ? "products.restore" : "products.suspend",
    reason
  });
}

async function changePostStatus(request, env, postId) {
  const parsed = await parseSmallJson(request);
  if (parsed.error) return parsed.error;
  if (typeof parsed.body.active !== "boolean") return json({ ok: false, code: "INVALID_STATUS" }, 400);
  const reason = validReason(parsed.body.reason);
  if (!reason) return json({ ok: false, code: "REASON_REQUIRED", error: `Alasan wajib ${MIN_REASON}-${MAX_REASON} karakter.` }, 400);
  return changeContentStatus(request, env, {
    table: "posts", resource: "post", id: postId,
    active: parsed.body.active,
    permission: parsed.body.active ? "posts.restore" : "posts.suspend",
    reason
  });
}

export async function handleAdminControlApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/admin/control/")) return null;

  try {
    if (request.method === "GET" && url.pathname === "/api/admin/control/overview") return overview(request, env);
    if (request.method === "GET" && url.pathname === "/api/admin/control/users") return users(request, env, url);
    if (request.method === "GET" && url.pathname === "/api/admin/control/stores") return stores(request, env, url);
    if (request.method === "GET" && url.pathname === "/api/admin/control/products") return products(request, env, url);
    if (request.method === "GET" && url.pathname === "/api/admin/control/posts") return posts(request, env, url);
    if (request.method === "GET" && url.pathname === "/api/admin/control/orders") return orders(request, env, url);
    if (request.method === "GET" && url.pathname === "/api/admin/control/reviews") return reviews(request, env, url);
    if (request.method === "GET" && url.pathname === "/api/admin/control/audit") return audit(request, env, url);
    if (request.method === "GET" && url.pathname === "/api/admin/control/admins") return admins(request, env, url);

    if (["PATCH", "POST", "PUT", "DELETE"].includes(request.method) && !sameOrigin(request)) {
      return json({ ok: false, code: "ORIGIN_REJECTED", error: "Origin tidak valid." }, 403);
    }

    const userMatch = url.pathname.match(/^\/api\/admin\/control\/users\/([0-9a-f-]{36})\/status$/i);
    if (request.method === "PATCH" && userMatch && UUID_PATTERN.test(userMatch[1])) {
      return changeUserStatus(request, env, userMatch[1]);
    }

    const storeMatch = url.pathname.match(/^\/api\/admin\/control\/stores\/([0-9a-f-]{36})\/action$/i);
    if (request.method === "PATCH" && storeMatch && UUID_PATTERN.test(storeMatch[1])) {
      return changeStore(request, env, storeMatch[1]);
    }

    const productMatch = url.pathname.match(/^\/api\/admin\/control\/products\/([0-9a-f-]{36})\/status$/i);
    if (request.method === "PATCH" && productMatch && UUID_PATTERN.test(productMatch[1])) {
      return changeProductStatus(request, env, productMatch[1]);
    }

    const postMatch = url.pathname.match(/^\/api\/admin\/control\/posts\/([0-9a-f-]{36})\/status$/i);
    if (request.method === "PATCH" && postMatch && UUID_PATTERN.test(postMatch[1])) {
      return changePostStatus(request, env, postMatch[1]);
    }

    return json({ ok: false, code: "NOT_FOUND", error: "Admin control route tidak ditemukan." }, 404);
  } catch (error) {
    console.error("Admin control error:", error);
    return json({ ok: false, code: "ADMIN_CONTROL_ERROR", error: "Layanan admin sementara tidak tersedia." }, 500);
  }
}

export const adminControlPolicy = Object.freeze({
  pagination: "keyset_created_at_id",
  default_limit: DEFAULT_LIMIT,
  max_limit: MAX_LIMIT,
  mutation_reason_min: MIN_REASON,
  mutation_reason_max: MAX_REASON,
  reports_source_required: "moderation_reports"
});
