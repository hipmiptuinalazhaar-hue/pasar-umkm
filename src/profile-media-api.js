import { neon } from "@neondatabase/serverless";
import { ensureFunctionalityInfrastructure } from "./functionality-store.js";
import {
  destroyOwnedProfileMedia,
  parseOwnedProfileMediaUrl,
  profileMediaFolder,
  sha1Hex
} from "./profile-media-security.js";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const MAX_AVATAR_BYTES = 512 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;

  for (const cookie of cookieHeader.split(";")) {
    const [key, ...valueParts] = cookie.trim().split("=");
    if (key === name) return valueParts.join("=") || null;
  }

  return null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

async function getAuthenticatedUser(sql, request) {
  const sessionToken = getCookie(request, SESSION_COOKIE);
  if (!sessionToken) return null;

  const rows = await sql`
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.avatar_url
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE
      s.token_hash = encode(digest(${sessionToken}, 'sha256'), 'hex')
      AND s.expires_at > NOW()
      AND u.is_active = TRUE
    LIMIT 1
  `;

  return rows[0] || null;
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
    { ok: false, error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" }
    }
  );
}

async function uploadProfileMedia(env, userId, buffer, mimeType) {
  const cloudName = String(env.CLOUDINARY_CLOUD_NAME || "").trim();
  const apiKey = String(env.CLOUDINARY_API_KEY || "").trim();
  const apiSecret = String(env.CLOUDINARY_API_SECRET || "").trim();

  if (!cloudName || !apiKey || !apiSecret) {
    return { ok: false, response: jsonError("Konfigurasi foto profil belum tersedia.", 500) };
  }

  const folder = profileMediaFolder(userId);
  if (!folder) {
    return { ok: false, response: jsonError("Identitas foto profil tidak valid.", 400) };
  }

  const publicLeaf = crypto.randomUUID();
  const expectedPublicId = `${folder}/${publicLeaf}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sha1Hex(
    `folder=${folder}&public_id=${publicLeaf}&timestamp=${timestamp}${apiSecret}`
  );

  const extension =
    mimeType === "image/png" ? "png" :
    mimeType === "image/webp" ? "webp" : "jpg";

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), `avatar.${extension}`);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("public_id", publicLeaf);
  form.append("signature", signature);

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`;
  const providerResponse = await fetch(endpoint, { method: "POST", body: form });
  const data = await providerResponse.json().catch(() => ({}));

  if (
    !providerResponse.ok ||
    !data.secure_url ||
    String(data.public_id || "") !== expectedPublicId ||
    String(data.resource_type || "") !== "image"
  ) {
    console.error("Profile media provider upload failed:", { status: providerResponse.status });
    return { ok: false, response: jsonError("Foto profil gagal diunggah.", 502) };
  }

  const descriptor = parseOwnedProfileMediaUrl(data.secure_url, env, userId);
  if (!descriptor || descriptor.publicId !== expectedPublicId) {
    // public_id berasal dari nilai server-side yang kita generate sendiri.
    // Bersihkan asset walau URL provider ternyata malformed/tidak lolos parser.
    await destroyOwnedProfileMedia(env, { publicId: expectedPublicId }).catch(() => null);
    console.error("Profile media provider returned unexpected ownership metadata.");
    return { ok: false, response: jsonError("Foto profil gagal diverifikasi.", 502) };
  }

  return { ok: true, descriptor };
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
      await ensureFunctionalityInfrastructure(sql);

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
      console.error("Profile avatar legacy GET error:", error);
      return jsonError("Foto profil belum dapat dimuat.", 500);
    }
  }

  if (url.pathname !== "/api/profile/avatar") return null;

  if (request.method !== "PUT") {
    return new Response(
      JSON.stringify({ ok: false, error: "Metode tidak diizinkan." }),
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

  let uploadedDescriptor = null;

  try {
    const currentUser = await getAuthenticatedUser(sql, request);
    if (!currentUser) {
      return jsonError("Silakan masuk kembali untuk mengganti foto profil.", 401);
    }

    const mimeType = String(request.headers.get("Content-Type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return jsonError("Format foto harus JPG, PNG, atau WebP.", 415);
    }

    const declaredLength = Number(request.headers.get("Content-Length") || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_AVATAR_BYTES) {
      return jsonError("Ukuran foto profil terlalu besar.", 413);
    }

    const buffer = await request.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_AVATAR_BYTES) {
      return jsonError("Ukuran foto profil harus di bawah 512 KB setelah diproses.", 413);
    }

    const bytes = new Uint8Array(buffer);
    if (!matchesImageSignature(bytes, mimeType)) {
      return jsonError("Isi file tidak cocok dengan format gambar.", 400);
    }

    await ensureFunctionalityInfrastructure(sql);

    const uploaded = await uploadProfileMedia(
      env,
      currentUser.id,
      buffer,
      mimeType
    );

    if (!uploaded.ok) return uploaded.response;
    uploadedDescriptor = uploaded.descriptor;

    const previousDescriptor = parseOwnedProfileMediaUrl(
      currentUser.avatar_url,
      env,
      currentUser.id
    );

    const updatedUsers = await sql`
      UPDATE users
      SET
        avatar_url = ${uploadedDescriptor.url},
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

    if (!updatedUsers[0]) {
      await destroyOwnedProfileMedia(env, uploadedDescriptor).catch(() => null);
      uploadedDescriptor = null;
      return jsonError("Foto profil belum dapat disimpan.", 500);
    }

    // Database sekarang sudah menunjuk ke asset baru. Sejak titik ini,
    // outer catch tidak boleh membersihkan asset yang sudah committed.
    const committedDescriptor = uploadedDescriptor;
    uploadedDescriptor = null;

    if (
      previousDescriptor &&
      previousDescriptor.publicId !== committedDescriptor.publicId
    ) {
      await destroyOwnedProfileMedia(env, previousDescriptor).catch(error => {
        console.error("Old profile media cleanup failed:", error);
      });
    }

    return Response.json(
      {
        ok: true,
        message: "Foto profil berhasil diperbarui.",
        storage: "media_provider",
        user: updatedUsers[0]
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" }
      }
    );
  } catch (error) {
    console.error("Profile avatar PUT error:", error);

    if (uploadedDescriptor) {
      await destroyOwnedProfileMedia(env, uploadedDescriptor).catch(() => null);
    }

    return jsonError("Foto profil belum dapat disimpan.", 500);
  }
}
