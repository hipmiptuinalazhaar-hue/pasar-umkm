import { neon } from "@neondatabase/serverless";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const piece of header.split(";")) {
    const [key, ...parts] = piece.trim().split("=");
    if (key === name) return parts.join("=") || null;
  }
  return null;
}

async function currentUser(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const rows = await sql`
    SELECT u.id
    FROM sessions s
    JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=encode(digest(${token},'sha256'),'hex')
      AND s.expires_at>NOW()
      AND u.is_active=TRUE
    LIMIT 1
  `;
  return rows[0] || null;
}

async function sha1Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function detectedImageType(file) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export async function handleStoryUploadApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/story-v2/upload-image" || request.method !== "POST") return null;

  try {
    const sql = neon(env.DATABASE_URL);
    const user = await currentUser(sql, request);
    if (!user) return json({ ok: false, error: "Silakan masuk terlebih dahulu.", code: "AUTH_REQUIRED" }, 401);

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return json({ ok: false, error: "Pilih foto terlebih dahulu.", code: "FILE_REQUIRED" }, 400);

    const declaredType = String(file.type || "").toLowerCase();
    if (!ALLOWED_TYPES.has(declaredType)) {
      return json({ ok: false, error: "Format foto harus JPG, PNG, atau WEBP.", code: "UNSUPPORTED_MEDIA_TYPE" }, 415);
    }
    if (!file.size || file.size > MAX_BYTES) {
      return json({ ok: false, error: "Ukuran foto maksimal 8 MB.", code: "FILE_TOO_LARGE" }, 413);
    }

    const detectedType = await detectedImageType(file);
    if (!detectedType || detectedType !== declaredType) {
      return json({ ok: false, error: "Isi file tidak cocok dengan format foto yang dipilih.", code: "INVALID_IMAGE_SIGNATURE" }, 415);
    }

    const cloudName = env.CLOUDINARY_CLOUD_NAME;
    const apiKey = env.CLOUDINARY_API_KEY;
    const apiSecret = env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      return json({ ok: false, error: "Konfigurasi upload foto belum tersedia.", code: "MEDIA_CONFIG_UNAVAILABLE" }, 503);
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "pasar-umkm/stories";
    const signature = await sha1Hex(`folder=${folder}&timestamp=${timestamp}${apiSecret}`);
    const upload = new FormData();
    upload.append("file", file, file.name || "story.jpg");
    upload.append("api_key", apiKey);
    upload.append("timestamp", String(timestamp));
    upload.append("folder", folder);
    upload.append("signature", signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
      { method: "POST", body: upload }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.secure_url) {
      console.error("Story image upload provider error:", response.status, data?.error?.http_code || "unknown");
      return json({ ok: false, error: "Foto cerita gagal diunggah.", code: "MEDIA_PROVIDER_ERROR" }, 502);
    }

    return json({
      ok: true,
      image: {
        url: data.secure_url,
        public_id: data.public_id || null,
        width: data.width || null,
        height: data.height || null,
        bytes: data.bytes || null
      }
    }, 201);
  } catch (error) {
    console.error("Story upload API error:", error?.code || error?.message || "unknown");
    return json({ ok: false, error: "Foto cerita belum dapat diunggah.", code: "STORY_UPLOAD_ERROR" }, 500);
  }
}
