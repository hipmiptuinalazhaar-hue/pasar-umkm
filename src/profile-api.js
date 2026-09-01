import { neon } from "@neondatabase/serverless";
import {
  getStoreSocialLinks,
  normalizeSocialUrl,
  upsertStoreSocialLinks
} from "./profile-social-store.js";

const SESSION_COOKIE = "__Host-pasar_umkm_session";

class ProfileValidationError extends Error {}

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

  if (text.startsWith("/api/profile/avatar/")) {
    return text;
  }

  let parsed;

  try {
    parsed = new URL(text);
  } catch {
    throw new ProfileValidationError(
      "URL foto profil tidak valid."
    );
  }

  if (
    parsed.protocol !== "https:" &&
    parsed.protocol !== "http:"
  ) {
    throw new ProfileValidationError(
      "URL foto profil harus menggunakan http atau https."
    );
  }

  return parsed.toString();
}

function normalizeWhatsapp(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return null;
  }

  let digits = raw.replace(/\D/g, "");

  if (digits.startsWith("0")) {
    digits = `62${digits.slice(1)}`;
  } else if (digits.startsWith("8")) {
    digits = `62${digits}`;
  }

  if (
    !digits.startsWith("62") ||
    digits.length < 10 ||
    digits.length > 15
  ) {
    throw new ProfileValidationError(
      "Nomor WhatsApp tidak valid. Gunakan nomor Indonesia aktif."
    );
  }

  return `+${digits}`;
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

async function getCurrentStore(sql, userId) {
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
    WHERE owner_id = ${userId}
    LIMIT 1
  `;

  return stores[0] || null;
}

function jsonError(message, status) {
  return Response.json(
    {
      ok: false,
      error: message
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function handleProfileApi(request, env) {
  const url = new URL(request.url);

  if (url.pathname !== "/api/profile") {
    return null;
  }

  try {
    const sql = neon(env.DATABASE_URL);
    const currentUser = await getAuthenticatedUser(sql, request);

    if (!currentUser) {
      return jsonError(
        "Silakan masuk kembali untuk mengelola profil.",
        401
      );
    }

    const isSeller =
      currentUser.role === "seller" ||
      currentUser.role === "admin";

    const currentStore = isSeller
      ? await getCurrentStore(sql, currentUser.id)
      : null;

    if (request.method === "GET") {
      let store = currentStore;

      if (store) {
        const social = await getStoreSocialLinks(
          sql,
          store.id
        );

        store = {
          ...store,
          instagram_url: social.instagram_url || null,
          tiktok_url: social.tiktok_url || null
        };
      }

      return Response.json(
        {
          ok: true,
          user: currentUser,
          store
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store"
          }
        }
      );
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
            "Allow": "GET, PATCH"
          }
        }
      );
    }

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return jsonError(
        "Data profil tidak valid.",
        400
      );
    }

    const name = String(
      hasOwn(body, "name")
        ? body.name
        : currentUser.name
    ).trim();

    if (name.length < 2 || name.length > 100) {
      return jsonError(
        "Nama profil harus 2 sampai 100 karakter.",
        400
      );
    }

    const avatarUrl = hasOwn(body, "avatar_url")
      ? normalizeAvatarUrl(body.avatar_url)
      : currentUser.avatar_url;

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

    const whatsapp = currentStore
      ? (
          hasOwn(storeInput, "whatsapp")
            ? normalizeWhatsapp(storeInput.whatsapp)
            : currentStore.whatsapp
        )
      : null;

    let currentSocial = {
      instagram_url: null,
      tiktok_url: null
    };

    if (currentStore) {
      currentSocial = await getStoreSocialLinks(
        sql,
        currentStore.id
      );
    }

    let instagramUrl = currentSocial.instagram_url || null;
    let tiktokUrl = currentSocial.tiktok_url || null;

    try {
      if (hasOwn(storeInput, "instagram_url")) {
        instagramUrl = normalizeSocialUrl(
          storeInput.instagram_url,
          "instagram"
        );
      }

      if (hasOwn(storeInput, "tiktok_url")) {
        tiktokUrl = normalizeSocialUrl(
          storeInput.tiktok_url,
          "tiktok"
        );
      }
    } catch (error) {
      throw new ProfileValidationError(
        error?.message ||
        "Akun sosial media tidak valid."
      );
    }

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
          whatsapp = ${whatsapp},
          updated_at = NOW()
        WHERE owner_id = ${currentUser.id}
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
      throw new Error("Profile update returned no user row.");
    }

    let updatedStore = updated.store || null;

    if (updatedStore) {
      const social = await upsertStoreSocialLinks(
        sql,
        updatedStore.id,
        instagramUrl,
        tiktokUrl
      );

      updatedStore = {
        ...updatedStore,
        instagram_url: social.instagram_url || null,
        tiktok_url: social.tiktok_url || null
      };
    }

    return Response.json(
      {
        ok: true,
        message: "Profil berhasil diperbarui.",
        user: updated.user,
        store: updatedStore
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

    const isValidationError =
      error instanceof ProfileValidationError;

    return jsonError(
      isValidationError
        ? error.message
        : "Profil belum dapat diperbarui.",
      isValidationError ? 400 : 500
    );
  }
}
