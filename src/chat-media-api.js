import { neon } from "@neondatabase/serverless";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav"
]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

let richChatReady = false;
let richChatPromise = null;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function error(message, status = 400) {
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

function uuid(value) {
  const id = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}

async function ensureRichChatSchema(sql) {
  if (richChatReady) return;
  if (richChatPromise) return richChatPromise;

  richChatPromise = (async () => {
    await sql`
      ALTER TABLE direct_messages
      ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) NOT NULL DEFAULT 'text'
    `;
    await sql`
      ALTER TABLE direct_messages
      ADD COLUMN IF NOT EXISTS media_url TEXT
    `;
    await sql`
      ALTER TABLE direct_messages
      ADD COLUMN IF NOT EXISTS media_name TEXT
    `;
    await sql`
      ALTER TABLE direct_messages
      ADD COLUMN IF NOT EXISTS media_duration_seconds INTEGER
    `;
    await sql`
      ALTER TABLE direct_messages
      ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION
    `;
    await sql`
      ALTER TABLE direct_messages
      ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION
    `;
    richChatReady = true;
  })();

  try {
    await richChatPromise;
  } finally {
    richChatPromise = null;
  }
}

async function currentUser(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const rows = await sql`
    SELECT u.id, u.name, u.avatar_url
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE
      s.token_hash = encode(digest(${token}, 'sha256'), 'hex')
      AND s.expires_at > NOW()
      AND u.is_active = TRUE
    LIMIT 1
  `;

  return rows[0] || null;
}

async function conversationForUser(sql, conversationId, userId) {
  const rows = await sql`
    SELECT id
    FROM direct_conversations
    WHERE
      id = ${conversationId}::uuid
      AND (user_a_id = ${userId} OR user_b_id = ${userId})
    LIMIT 1
  `;
  return rows[0] || null;
}

async function sha1Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function uploadMedia(request, env, user) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const kind = String(form?.get("kind") || "").trim().toLowerCase();

  if (!(file instanceof File)) {
    return error("Pilih media terlebih dahulu.", 400);
  }

  const type = String(file.type || "")
    .toLowerCase()
    .split(";")[0]
    .trim();
  const isImage = kind === "image" && IMAGE_TYPES.has(type);
  const isAudio = kind === "audio" && AUDIO_TYPES.has(type);

  if (!isImage && !isAudio) {
    return error(
      kind === "audio"
        ? "Format voice note belum didukung perangkat ini."
        : "Format foto harus JPG, PNG, atau WEBP.",
      415
    );
  }

  const maxBytes = isAudio ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
  if (!file.size || file.size > maxBytes) {
    return error(
      isAudio ? "Voice note maksimal 12 MB." : "Foto maksimal 8 MB.",
      413
    );
  }

  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return error("Konfigurasi upload chat belum tersedia.", 500);
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `pasar-umkm/chat/${user.id}`;
  const signature = await sha1Hex(
    `folder=${folder}&timestamp=${timestamp}${apiSecret}`
  );

  const upload = new FormData();
  upload.append("file", file, file.name || (isAudio ? "voice.webm" : "chat.jpg"));
  upload.append("api_key", apiKey);
  upload.append("timestamp", String(timestamp));
  upload.append("folder", folder);
  upload.append("signature", signature);

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/auto/upload`;
  const response = await fetch(endpoint, { method: "POST", body: upload });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.secure_url) {
    console.error("Chat media upload error:", data);
    return error(data?.error?.message || "Media chat gagal diunggah.", 502);
  }

  return json({
    ok: true,
    media: {
      kind: isAudio ? "audio" : "image",
      url: data.secure_url,
      public_id: data.public_id || null,
      bytes: data.bytes || file.size,
      width: data.width || null,
      height: data.height || null,
      duration: data.duration || null,
      original_filename: data.original_filename || file.name || null
    }
  }, 201);
}

function safeCloudinaryUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:" && parsed.hostname === "res.cloudinary.com"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

async function sendRichMessage(sql, request, conversationId, user) {
  const conversation = await conversationForUser(sql, conversationId, user.id);
  if (!conversation) return error("Percakapan tidak ditemukan.", 404);

  const body = await request.json().catch(() => null);
  const type = String(body?.type || "").trim().toLowerCase();

  if (!["image", "audio", "location"].includes(type)) {
    return error("Jenis pesan tidak valid.", 400);
  }

  let mediaUrl = null;
  let mediaName = null;
  let duration = null;
  let latitude = null;
  let longitude = null;
  let fallbackMessage = "";

  if (type === "image" || type === "audio") {
    mediaUrl = safeCloudinaryUrl(body?.media_url);
    if (!mediaUrl) return error("Media pesan tidak valid.", 400);

    mediaName = String(body?.media_name || "").trim().slice(0, 180) || null;
    duration = Number.isFinite(Number(body?.duration_seconds))
      ? Math.max(0, Math.min(600, Math.round(Number(body.duration_seconds))))
      : null;
    fallbackMessage = type === "image" ? "📷 Foto" : "🎤 Pesan suara";
  } else {
    latitude = Number(body?.latitude);
    longitude = Number(body?.longitude);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180
    ) {
      return error("Lokasi tidak valid.", 400);
    }

    fallbackMessage = "📍 Lokasi";
  }

  const rows = await sql`
    INSERT INTO direct_messages (
      conversation_id,
      sender_id,
      message,
      message_type,
      media_url,
      media_name,
      media_duration_seconds,
      latitude,
      longitude
    )
    VALUES (
      ${conversationId}::uuid,
      ${user.id},
      ${fallbackMessage},
      ${type},
      ${mediaUrl},
      ${mediaName},
      ${duration},
      ${latitude},
      ${longitude}
    )
    RETURNING
      id,
      conversation_id,
      sender_id,
      message,
      message_type,
      media_url,
      media_name,
      media_duration_seconds,
      latitude,
      longitude,
      created_at,
      is_read,
      read_at
  `;

  await sql`
    UPDATE direct_conversations
    SET updated_at = NOW()
    WHERE id = ${conversationId}::uuid
  `;

  return json({ ok: true, message: rows[0] }, 201);
}

async function richMeta(sql, request, conversationId, user) {
  const conversation = await conversationForUser(sql, conversationId, user.id);
  if (!conversation) return error("Percakapan tidak ditemukan.", 404);

  const messages = await sql`
    SELECT
      dm.id,
      dm.sender_id,
      dm.message,
      dm.message_type,
      dm.media_url,
      dm.media_name,
      dm.media_duration_seconds,
      dm.latitude,
      dm.longitude,
      dm.created_at,
      dm.is_read,
      dm.read_at
    FROM direct_messages dm
    LEFT JOIN direct_message_user_state mus
      ON mus.message_id = dm.id AND mus.user_id = ${user.id}
    LEFT JOIN direct_conversation_user_state cs
      ON cs.conversation_id = dm.conversation_id AND cs.user_id = ${user.id}
    WHERE
      dm.conversation_id = ${conversationId}::uuid
      AND COALESCE(mus.is_hidden, FALSE) = FALSE
      AND (cs.hidden_before IS NULL OR dm.created_at > cs.hidden_before)
    ORDER BY dm.created_at ASC
    LIMIT 200
  `;

  return json({
    ok: true,
    current_user_id: user.id,
    conversation_id: conversationId,
    messages
  });
}

export async function handleChatMediaApi(request, env) {
  const url = new URL(request.url);

  const uploadRoute = url.pathname === "/api/chat/media/upload" && request.method === "POST";
  const sendMatch = url.pathname.match(
    /^\/api\/chat\/conversations\/([0-9a-f-]{36})\/rich-message$/i
  );
  const metaMatch = url.pathname.match(
    /^\/api\/chat\/conversations\/([0-9a-f-]{36})\/rich-meta$/i
  );

  if (!uploadRoute && !sendMatch && !metaMatch) return null;

  try {
    const sql = neon(env.DATABASE_URL);
    await ensureRichChatSchema(sql);

    const user = await currentUser(sql, request);
    if (!user) return error("Silakan masuk terlebih dahulu.", 401);

    if (uploadRoute) {
      return await uploadMedia(request, env, user);
    }

    if (sendMatch && request.method === "POST") {
      const conversationId = uuid(sendMatch[1]);
      if (!conversationId) return error("Percakapan tidak valid.", 400);
      return await sendRichMessage(sql, request, conversationId, user);
    }

    if (metaMatch && request.method === "GET") {
      const conversationId = uuid(metaMatch[1]);
      if (!conversationId) return error("Percakapan tidak valid.", 400);
      return await richMeta(sql, request, conversationId, user);
    }

    return error("Endpoint media chat tidak ditemukan.", 404);
  } catch (err) {
    console.error("Chat media API error:", err);
    return error("Media chat sedang mengalami gangguan.", 500);
  }
}
