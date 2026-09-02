import { neon } from "@neondatabase/serverless";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;
const MAX_CURSOR_LENGTH = 768;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class CatalogRequestError extends Error {
  constructor(message, code = "INVALID_CATALOG_REQUEST") {
    super(message);
    this.name = "CatalogRequestError";
    this.code = code;
  }
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function positiveInt(value, fallback, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = normalized.length % 4;
  const binary = atob(normalized + (padding ? "=".repeat(4 - padding) : ""));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function encodeCursor(payload) {
  const jsonText = JSON.stringify({ v: 1, ...payload });
  return bytesToBase64Url(new TextEncoder().encode(jsonText));
}

function decodeCursor(raw, expectedKind) {
  if (!raw) return null;

  const value = String(raw).trim();
  if (!value || value.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new CatalogRequestError("Cursor katalog tidak valid.", "INVALID_CURSOR");
  }

  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(base64UrlToBytes(value));
    const payload = JSON.parse(decoded);

    if (!payload || payload.v !== 1 || payload.k !== expectedKind) {
      throw new Error("cursor metadata mismatch");
    }

    return payload;
  } catch (error) {
    if (error instanceof CatalogRequestError) throw error;
    throw new CatalogRequestError("Cursor katalog tidak valid.", "INVALID_CURSOR");
  }
}

function productCursor(raw) {
  const cursor = decodeCursor(raw, "products");
  if (!cursor) return null;

  const createdAt = new Date(String(cursor.t || ""));
  const id = String(cursor.i || "").toLowerCase();

  if (!Number.isFinite(createdAt.getTime()) || !UUID_PATTERN.test(id)) {
    throw new CatalogRequestError("Cursor produk tidak valid.", "INVALID_CURSOR");
  }

  return {
    createdAt: createdAt.toISOString(),
    id
  };
}

function storeCursor(raw) {
  const cursor = decodeCursor(raw, "stores");
  if (!cursor) return null;

  const rank = Number(cursor.r);
  const name = String(cursor.n || "");
  const id = String(cursor.i || "").toLowerCase();

  if ((rank !== 0 && rank !== 1) || !name || name.length > 240 || !UUID_PATTERN.test(id)) {
    throw new CatalogRequestError("Cursor UMKM tidak valid.", "INVALID_CURSOR");
  }

  return { rank, name, id };
}

function requestPagination(url, kind) {
  const page = url.searchParams.get("page");
  if (page && page !== "1") {
    throw new CatalogRequestError(
      "Pagination berbasis page sudah tidak didukung. Gunakan next_cursor.",
      "CURSOR_REQUIRED"
    );
  }

  const limit = positiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
  const cursor = kind === "stores"
    ? storeCursor(url.searchParams.get("cursor"))
    : productCursor(url.searchParams.get("cursor"));

  return { limit, cursor };
}

function pagination(limit, hasNext, nextCursor) {
  return {
    mode: "cursor",
    limit,
    has_next: hasNext,
    next_cursor: hasNext ? nextCursor : null
  };
}

async function listStores(sql, url) {
  const { limit, cursor } = requestPagination(url, "stores");
  const queryLimit = limit + 1;

  const rows = cursor
    ? await sql`
      WITH page AS (
        SELECT
          s.id,
          s.category_id,
          s.name,
          s.slug,
          s.description,
          s.logo_url,
          s.cover_url,
          s.phone,
          s.whatsapp,
          s.address,
          s.district,
          s.city,
          s.province,
          s.verification_status,
          s.verified_at,
          s.created_at,
          CASE WHEN s.verification_status = 'verified' THEN 0 ELSE 1 END AS verification_rank
        FROM stores s
        WHERE
          s.is_active = TRUE
          AND (
            CASE WHEN s.verification_status = 'verified' THEN 0 ELSE 1 END > ${cursor.rank}
            OR (
              CASE WHEN s.verification_status = 'verified' THEN 0 ELSE 1 END = ${cursor.rank}
              AND (
                s.name > ${cursor.name}
                OR (s.name = ${cursor.name} AND s.id > ${cursor.id}::uuid)
              )
            )
          )
        ORDER BY verification_rank ASC, s.name ASC, s.id ASC
        LIMIT ${queryLimit}
      )
      SELECT
        s.id,
        s.category_id,
        c.name AS category_name,
        s.name,
        s.slug,
        s.description,
        s.logo_url,
        s.cover_url,
        s.phone,
        s.whatsapp,
        s.address,
        s.district,
        s.city,
        s.province,
        s.verification_status,
        s.verified_at,
        s.created_at,
        COALESCE(pc.product_count, 0)::int AS product_count,
        s.verification_rank
      FROM page s
      LEFT JOIN categories c ON c.id = s.category_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS product_count
        FROM products p
        WHERE p.store_id = s.id AND p.is_active = TRUE
      ) pc ON TRUE
      ORDER BY s.verification_rank ASC, s.name ASC, s.id ASC
    `
    : await sql`
      WITH page AS (
        SELECT
          s.id,
          s.category_id,
          s.name,
          s.slug,
          s.description,
          s.logo_url,
          s.cover_url,
          s.phone,
          s.whatsapp,
          s.address,
          s.district,
          s.city,
          s.province,
          s.verification_status,
          s.verified_at,
          s.created_at,
          CASE WHEN s.verification_status = 'verified' THEN 0 ELSE 1 END AS verification_rank
        FROM stores s
        WHERE s.is_active = TRUE
        ORDER BY verification_rank ASC, s.name ASC, s.id ASC
        LIMIT ${queryLimit}
      )
      SELECT
        s.id,
        s.category_id,
        c.name AS category_name,
        s.name,
        s.slug,
        s.description,
        s.logo_url,
        s.cover_url,
        s.phone,
        s.whatsapp,
        s.address,
        s.district,
        s.city,
        s.province,
        s.verification_status,
        s.verified_at,
        s.created_at,
        COALESCE(pc.product_count, 0)::int AS product_count,
        s.verification_rank
      FROM page s
      LEFT JOIN categories c ON c.id = s.category_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS product_count
        FROM products p
        WHERE p.store_id = s.id AND p.is_active = TRUE
      ) pc ON TRUE
      ORDER BY s.verification_rank ASC, s.name ASC, s.id ASC
    `;

  const hasNext = rows.length > limit;
  const visible = hasNext ? rows.slice(0, limit) : rows;
  const last = visible.at(-1);
  const nextCursor = last
    ? encodeCursor({
        k: "stores",
        r: Number(last.verification_rank),
        n: String(last.name || ""),
        i: String(last.id)
      })
    : null;

  const stores = visible.map(({ verification_rank, ...store }) => store);

  return json({
    ok: true,
    count: stores.length,
    stores,
    pagination: pagination(limit, hasNext, nextCursor)
  });
}

async function listProducts(sql, url) {
  const { limit, cursor } = requestPagination(url, "products");
  const queryLimit = limit + 1;

  const rows = cursor
    ? await sql`
      WITH page AS (
        SELECT p.*
        FROM products p
        JOIN stores s ON s.id = p.store_id
        WHERE
          p.is_active = TRUE
          AND s.is_active = TRUE
          AND (p.created_at, p.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ${queryLimit}
      )
      SELECT
        p.id,
        p.store_id,
        p.category_id,
        c.name AS category_name,
        s.name AS store_name,
        s.logo_url AS store_logo_url,
        s.verification_status AS store_verification_status,
        p.name,
        p.slug,
        p.description,
        p.price,
        p.stock,
        p.unit,
        COALESCE(NULLIF(p.thumbnail_url, ''), first_image.image_url) AS image_url,
        p.is_featured,
        COALESCE(comment_counts.comments_count, 0)::int AS comments_count,
        p.created_at
      FROM page p
      JOIN stores s ON s.id = p.store_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN LATERAL (
        SELECT pi.image_url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.sort_order ASC, pi.created_at ASC, pi.id ASC
        LIMIT 1
      ) first_image ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS comments_count
        FROM product_comments pc
        WHERE pc.product_id = p.id AND pc.is_active = TRUE
      ) comment_counts ON TRUE
      ORDER BY p.created_at DESC, p.id DESC
    `
    : await sql`
      WITH page AS (
        SELECT p.*
        FROM products p
        JOIN stores s ON s.id = p.store_id
        WHERE p.is_active = TRUE AND s.is_active = TRUE
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ${queryLimit}
      )
      SELECT
        p.id,
        p.store_id,
        p.category_id,
        c.name AS category_name,
        s.name AS store_name,
        s.logo_url AS store_logo_url,
        s.verification_status AS store_verification_status,
        p.name,
        p.slug,
        p.description,
        p.price,
        p.stock,
        p.unit,
        COALESCE(NULLIF(p.thumbnail_url, ''), first_image.image_url) AS image_url,
        p.is_featured,
        COALESCE(comment_counts.comments_count, 0)::int AS comments_count,
        p.created_at
      FROM page p
      JOIN stores s ON s.id = p.store_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN LATERAL (
        SELECT pi.image_url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.sort_order ASC, pi.created_at ASC, pi.id ASC
        LIMIT 1
      ) first_image ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS comments_count
        FROM product_comments pc
        WHERE pc.product_id = p.id AND pc.is_active = TRUE
      ) comment_counts ON TRUE
      ORDER BY p.created_at DESC, p.id DESC
    `;

  const hasNext = rows.length > limit;
  const products = hasNext ? rows.slice(0, limit) : rows;
  const last = products.at(-1);
  const nextCursor = last
    ? encodeCursor({
        k: "products",
        t: new Date(last.created_at).toISOString(),
        i: String(last.id)
      })
    : null;

  return json({
    ok: true,
    count: products.length,
    products,
    pagination: pagination(limit, hasNext, nextCursor)
  });
}

export async function handlePublicCatalogApi(request, env) {
  if (request.method !== "GET") return null;

  const url = new URL(request.url);
  if (url.pathname !== "/api/stores" && url.pathname !== "/api/products") {
    return null;
  }

  try {
    const sql = neon(env.DATABASE_URL);
    return url.pathname === "/api/stores"
      ? await listStores(sql, url)
      : await listProducts(sql, url);
  } catch (error) {
    if (error instanceof CatalogRequestError) {
      return json({ ok: false, error: error.message, code: error.code }, 400);
    }

    console.error("Public catalog API error:", error);
    return json(
      {
        ok: false,
        error: url.pathname === "/api/stores"
          ? "Gagal memuat data UMKM."
          : "Gagal memuat produk."
      },
      500
    );
  }
}
