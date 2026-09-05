import { neon } from "@neondatabase/serverless";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function jsonError(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie");

  if (!header) {
    return null;
  }

  for (const cookie of header.split(";")) {
    const [key, ...valueParts] = cookie.trim().split("=");

    if (key === name) {
      return valueParts.join("=") || null;
    }
  }

  return null;
}

async function getUser(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);

  if (!token) {
    return null;
  }

  const rows = await sql`
    SELECT
      u.id,
      u.name,
      u.role
    FROM sessions ss
    JOIN users u ON u.id = ss.user_id
    WHERE
      ss.token_hash = encode(
        digest(${token}, 'sha256'),
        'hex'
      )
      AND ss.expires_at > NOW()
      AND u.is_active = TRUE
    LIMIT 1
  `;

  return rows[0] || null;
}

function clean(value, max) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

function normalizeWhatsapp(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return null;
  }

  let digits = raw.replace(/\D/g, '');

  if (digits.startsWith('0')) {
    digits = `62${digits.slice(1)}`;
  } else if (digits.startsWith('8')) {
    digits = `62${digits}`;
  }

  if (!digits.startsWith('62') || digits.length < 10 || digits.length > 15) {
    throw new Error('Nomor WhatsApp tidak valid.');
  }

  return `+${digits}`;
}

async function getStore(sql, userId) {
  const rows = await sql`
    SELECT
      s.id,
      s.owner_id,
      s.category_id,
      c.name AS category_name,
      s.name,
      s.slug,
      s.description,
      s.logo_url,
      s.cover_url,
      s.phone,
      s.whatsapp,
      s.email,
      s.address,
      s.district,
      s.city,
      s.province,
      s.verification_status,
      s.verified_at,
      s.is_active,
      s.created_at,
      s.updated_at
    FROM stores s
    LEFT JOIN categories c ON c.id = s.category_id
    WHERE s.owner_id = ${userId}
    ORDER BY s.created_at ASC
    LIMIT 1
  `;

  return rows[0] || null;
}

export async function handleStoreManagementApi(request, env) {
  const url = new URL(request.url);

  if (url.pathname !== "/api/store-management") {
    return null;
  }

  try {
    const sql = neon(env.DATABASE_URL);
    const user = await getUser(sql, request);

    if (!user) {
      return jsonError("Silakan masuk terlebih dahulu.", 401);
    }

    if (user.role !== "seller") {
      return jsonError("Akun bukan pemilik UMKM.", 403);
    }

    const store = await getStore(sql, user.id);

    if (!store) {
      return jsonError("UMKM belum ditemukan.", 404);
    }

    if (request.method === "GET") {
      return json({ ok: true, store });
    }

    if (request.method !== "PATCH") {
      return jsonError("Metode tidak diizinkan.", 405);
    }

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return jsonError("Data UMKM tidak valid.", 400);
    }

    const name = clean(body.name ?? store.name, 150);
    const categoryId = body.category_id
      ? String(body.category_id).trim()
      : null;
    const description = clean(body.description, 2000);
    const phone = clean(body.phone, 30);
    const whatsapp = normalizeWhatsapp(body.whatsapp);
    const email = clean(body.email, 255);
    const address = clean(body.address, 1200);
    const district = clean(body.district, 100);
    const city = clean(body.city, 100);
    const province = clean(body.province, 100);

    if (!name || name.length < 3) {
      return jsonError("Nama UMKM minimal 3 karakter.", 400);
    }

    if (categoryId) {
      if (!UUID_PATTERN.test(categoryId)) {
        return jsonError("Kategori tidak valid.", 400);
      }

      const categories = await sql`
        SELECT id
        FROM categories
        WHERE
          id = ${categoryId}::uuid
          AND is_active = TRUE
        LIMIT 1
      `;

      if (!categories[0]) {
        return jsonError("Kategori tidak ditemukan.", 400);
      }
    }

    if (
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return jsonError("Email UMKM tidak valid.", 400);
    }

    const rows = await sql`
      UPDATE stores
      SET
        category_id = ${categoryId}::uuid,
        name = ${name},
        description = ${description},
        phone = ${phone},
        whatsapp = ${whatsapp},
        email = ${email},
        address = ${address},
        district = ${district},
        city = ${city},
        province = ${province},
        updated_at = NOW()
      WHERE id = ${store.id}
      RETURNING
        id,
        owner_id,
        category_id,
        name,
        slug,
        description,
        logo_url,
        cover_url,
        phone,
        whatsapp,
        email,
        address,
        district,
        city,
        province,
        verification_status,
        verified_at,
        is_active,
        created_at,
        updated_at
    `;

    return json({
      ok: true,
      message: "Data UMKM berhasil diperbarui.",
      store: rows[0]
    });
  } catch (error) {
    console.error("Store management API error:", error);

    return jsonError(
      error?.message || "Data UMKM belum dapat diperbarui.",
      500
    );
  }
}
