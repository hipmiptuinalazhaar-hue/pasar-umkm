import { neon } from "@neondatabase/serverless";

const SESSION_COOKIE = "__Host-pasar_umkm_session";

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

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeOptionalText(value, maxLength) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  return text.slice(0, maxLength);
}

function normalizeAvatarUrl(value) {
  const text = normalizeOptionalText(value, 2000);

  if (!text) {
    return null;
  }

  let parsed;

  try {
    parsed = new URL(text);
  } catch {
    throw new Error("URL foto profil tidak valid.");
  }

  if (
    parsed.protocol !== "https:" &&
    parsed.protocol !== "http:"
  ) {
    throw new Error("URL foto profil harus menggunakan http atau https.");
  }

  return parsed.toString();
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
      u.email,
      u.role,
      u.avatar_url
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

export async function handleProfileApi(request, env) {
  const url = new URL(request.url);

  if (url.pathname !== "/api/profile") {
    return null;
  }

  if (request.method !== "PATCH") {
    return Response.json(
      {
        ok: false,
        error: "Metode tidak diizinkan."
      },
      {
        status: 405,
        headers: {
          "Cache-Control": "no-store",
          "Allow": "PATCH"
        }
      }
    );
  }

  try {
    const sql = neon(env.DATABASE_URL);
    const currentUser = await getAuthenticatedUser(sql, request);

    if (!currentUser) {
      return Response.json(
        {
          ok: false,
          error: "Silakan masuk kembali untuk mengubah profil."
        },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store"
          }
        }
      );
    }

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return Response.json(
        {
          ok: false,
          error: "Data profil tidak valid."
        },
        {
          status: 400,
          headers: {
            "Cache-Control": "no-store"
          }
        }
      );
    }

    const name = String(
      hasOwn(body, "name")
        ? body.name
        : currentUser.name
    ).trim();

    if (name.length < 2 || name.length > 100) {
      return Response.json(
        {
          ok: false,
          error: "Nama profil harus 2 sampai 100 karakter."
        },
        {
          status: 400,
          headers: {
            "Cache-Control": "no-store"
          }
        }
      );
    }

    const avatarUrl = hasOwn(body, "avatar_url")
      ? normalizeAvatarUrl(body.avatar_url)
      : currentUser.avatar_url;

    const isSeller =
      currentUser.role === "seller" ||
      currentUser.role === "admin";

    let currentStore = null;

    if (isSeller) {
      const stores = await sql`
        SELECT
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
          latitude,
          longitude,
          verification_status,
          verified_at,
          is_active,
          created_at,
          updated_at
        FROM stores
        WHERE owner_id = ${currentUser.id}
        LIMIT 1
      `;

      currentStore = stores[0] || null;
    }

    const storeInput =
      body.store && typeof body.store === "object"
        ? body.store
        : {};

    const description = currentStore
      ? (
          hasOwn(storeInput, "description")
            ? normalizeOptionalText(storeInput.description, 1200)
            : currentStore.description
        )
      : null;

    const district = currentStore
      ? (
          hasOwn(storeInput, "district")
            ? normalizeOptionalText(storeInput.district, 100)
            : currentStore.district
        )
      : null;

    const city = currentStore
      ? (
          hasOwn(storeInput, "city")
            ? normalizeOptionalText(storeInput.city, 100)
            : currentStore.city
        )
      : null;

    const province = currentStore
      ? (
          hasOwn(storeInput, "province")
            ? normalizeOptionalText(storeInput.province, 100)
            : currentStore.province
        )
      : null;

    const result = await sql`
      WITH updated_user AS (
        UPDATE users
        SET
          name = ${name},
          avatar_url = ${avatarUrl},
          updated_at = NOW()
        WHERE id = ${currentUser.id}
        RETURNING
          id,
          name,
          email,
          role,
          avatar_url,
          updated_at
      ),
      updated_store AS (
        UPDATE stores
        SET
          description = ${description},
          district = ${district},
          city = ${city},
          province = ${province},
          updated_at = NOW()
        WHERE
          owner_id = ${currentUser.id}
          AND ${Boolean(currentStore)} = TRUE
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
          latitude,
          longitude,
          verification_status,
          verified_at,
          is_active,
          created_at,
          updated_at
      )
      SELECT
        row_to_json(updated_user) AS user,
        (
          SELECT row_to_json(updated_store)
          FROM updated_store
        ) AS store
      FROM updated_user
    `;

    const updated = result[0];

    if (!updated?.user) {
      throw new Error("Profil gagal diperbarui.");
    }

    return Response.json(
      {
        ok: true,
        message: "Profil berhasil diperbarui.",
        user: updated.user,
        store: updated.store || null
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("Profile update error:", error);

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Profil belum dapat diperbarui."
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }
}
