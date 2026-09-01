import { neon } from "@neondatabase/serverless";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const MAX_AVATAR_BYTES = 512 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

let mediaTableReady = false;

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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

async function ensureProfileMediaTable(sql) {
  if (mediaTableReady) {
    return;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS user_profile_media (
      user_id UUID PRIMARY KEY
        REFERENCES users(id)
        ON DELETE CASCADE,
      image_data BYTEA NOT NULL,
      mime_type VARCHAR(30) NOT NULL,
      byte_size INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT user_profile_media_mime_check
        CHECK (
          mime_type IN (
            'image/jpeg',
            'image/png',
            'image/webp'
          )
        ),
      CONSTRAINT user_profile_media_size_check
        CHECK (
          byte_size > 0
          AND byte_size <= 524288
        )
    )
  `;

  mediaTableReady = true;
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

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(
      offset,
      Math.min(offset + chunkSize, bytes.length)
    );

    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function matchesImageSignature(bytes, mimeType) {
  if (mimeType === "image/jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }

  if (mimeType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }

  if (mimeType === "image/webp") {
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }

  return false;
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

export async function handleProfileMediaApi(request, env) {
  const url = new URL(request.url);
  const sql = neon(env.DATABASE_URL);

  const publicAvatarMatch = url.pathname.match(
    /^\/api\/profile\/avatar\/([0-9a-f-]{36})$/i
  );

  if (publicAvatarMatch && request.method === "GET") {
    const userId = publicAvatarMatch[1];

    if (!isUuid(userId)) {
      return jsonError("Foto profil tidak ditemukan.", 404);
    }

    try {
      await ensureProfileMediaTable(sql);

      const rows = await sql`
        SELECT
          mime_type,
          byte_size,
          encode(image_data, 'base64') AS image_base64,
          updated_at
        FROM user_profile_media
        WHERE user_id = ${userId}
        LIMIT 1
      `;

      const media = rows[0];

      if (!media?.image_base64) {
        return jsonError("Foto profil tidak ditemukan.", 404);
      }

      const bytes = base64ToBytes(media.image_base64);

      return new Response(bytes, {
        status: 200,
        headers: {
          "Content-Type": media.mime_type,
          "Content-Length": String(bytes.byteLength),
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff"
        }
      });
    } catch (error) {
      console.error("Profile avatar GET error:", error);
      return jsonError("Foto profil belum dapat dimuat.", 500);
    }
  }

  if (url.pathname !== "/api/profile/avatar") {
    return null;
  }

  if (request.method !== "PUT") {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Metode tidak diizinkan."
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Allow": "PUT"
        }
      }
    );
  }

  try {
    const currentUser = await getAuthenticatedUser(sql, request);

    if (!currentUser) {
      return jsonError(
        "Silakan masuk kembali untuk mengganti foto profil.",
        401
      );
    }

    const mimeType = String(
      request.headers.get("Content-Type") || ""
    )
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return jsonError(
        "Format foto harus JPG, PNG, atau WebP.",
        415
      );
    }

    const declaredLength = Number(
      request.headers.get("Content-Length") || 0
    );

    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_AVATAR_BYTES
    ) {
      return jsonError(
        "Ukuran foto profil terlalu besar.",
        413
      );
    }

    const buffer = await request.arrayBuffer();

    if (
      buffer.byteLength === 0 ||
      buffer.byteLength > MAX_AVATAR_BYTES
    ) {
      return jsonError(
        "Ukuran foto profil harus di bawah 512 KB setelah diproses.",
        413
      );
    }

    const bytes = new Uint8Array(buffer);

    if (!matchesImageSignature(bytes, mimeType)) {
      return jsonError(
        "Isi file tidak cocok dengan format gambar.",
        400
      );
    }

    await ensureProfileMediaTable(sql);

    const imageBase64 = arrayBufferToBase64(buffer);

    await sql`
      INSERT INTO user_profile_media (
        user_id,
        image_data,
        mime_type,
        byte_size,
        updated_at
      )
      VALUES (
        ${currentUser.id},
        decode(${imageBase64}, 'base64'),
        ${mimeType},
        ${buffer.byteLength},
        NOW()
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        image_data = EXCLUDED.image_data,
        mime_type = EXCLUDED.mime_type,
        byte_size = EXCLUDED.byte_size,
        updated_at = NOW()
    `;

    const version = Date.now().toString(36);
    const avatarUrl =
      `/api/profile/avatar/${currentUser.id}?v=${version}`;

    const updatedUsers = await sql`
      UPDATE users
      SET
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
    `;

    return Response.json(
      {
        ok: true,
        message: "Foto profil berhasil diperbarui.",
        user: updatedUsers[0]
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("Profile avatar PUT error:", error);

    return jsonError(
      "Foto profil belum dapat disimpan.",
      500
    );
  }
}
