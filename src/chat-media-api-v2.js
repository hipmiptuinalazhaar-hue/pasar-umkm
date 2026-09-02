import { Client, neon } from "@neondatabase/serverless";
import {
  chatMediaFolder,
  destroyOwnedChatMedia,
  parseOwnedChatMediaUrl,
  sha1Hex
} from "./chat-media-security.js";

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
const MAX_MULTIPART_BYTES = MAX_AUDIO_BYTES + 1024 * 1024;

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

async function currentUser(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const rows = await sql`
    SELECT u.id, u.name, u.avatar_url, u.role
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

async function withTransaction(env, work) {
  const client = new Client({ connectionString: env.DATABASE_URL });
  let started = false;

  try {
    await client.connect();
    await client.query("BEGIN");
    started = true;
    const result = await work(client);
    await client.query("COMMIT");
    started = false;
    return result;
  } catch (err) {
    if (started) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rich chat rollback failed:", rollbackError);
      }
    }
    throw err;
  } finally {
    try {
      await client.end();
    } catch (closeError) {
      console.error("Rich chat client close failed:", closeError);
    }
  }
}

function begins(bytes, signature) {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes, start, length) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

async function fileSignatureMatches(file, kind, type) {
  const bytes = new Uint8Array(await file.slice(0, 20).arrayBuffer());

  if (kind === "image") {
    if (type === "image/jpeg") return begins(bytes, [0xff, 0xd8, 0xff]);
    if (type === "image/png") {
      return begins(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    }
    if (type === "image/webp") {
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
    }
    return false;
  }

  if (type === "audio/webm") {
    return begins(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
  }
  if (type === "audio/ogg") {
    return ascii(bytes, 0, 4) === "OggS";
  }
  if (type === "audio/wav" || type === "audio/x-wav") {
    return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE";
  }
  if (type === "audio/mp4") {
    return ascii(bytes, 4, 4) === "ftyp";
  }
  if (type === "audio/mpeg") {
    return (
      ascii(bytes, 0, 3) === "ID3" ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    );
  }

  return false;
}

async function uploadMedia(sql, request, env, user) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
    return error("Ukuran unggahan terlalu besar.", 413);
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const kind = String(form?.get("kind") || "").trim().toLowerCase();
  const conversationId = uuid(form?.get("conversation_id"));

  if (!conversationId) return error("Percakapan upload tidak valid.", 400);
  if (!(await conversationForUser(sql, conversationId, user.id))) {
    return error("Percakapan tidak ditemukan.", 404);
  }

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

  if (!(await fileSignatureMatches(file, kind, type))) {
    return error("Isi file tidak sesuai dengan format media yang dikirim.", 415);
  }

  const cloudName = String(env.CLOUDINARY_CLOUD_NAME || "").trim();
  const apiKey = String(env.CLOUDINARY_API_KEY || "").trim();
  const apiSecret = String(env.CLOUDINARY_API_SECRET || "").trim();
  if (!cloudName || !apiKey || !apiSecret) {
    return error("Konfigurasi upload chat belum tersedia.", 500);
  }

  const folder = chatMediaFolder(conversationId, user.id);
  if (!folder) return error("Identitas media chat tidak valid.", 400);

  const publicLeaf = crypto.randomUUID();
  const expectedPublicId = `${folder}/${publicLeaf}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sha1Hex(
    `folder=${folder}&public_id=${publicLeaf}&timestamp=${timestamp}${apiSecret}`
  );

  const upload = new FormData();
  upload.append("file", file, file.name || (isAudio ? "voice.webm" : "chat.jpg"));
  upload.append("api_key", apiKey);
  upload.append("timestamp", String(timestamp));
  upload.append("folder", folder);
  upload.append("public_id", publicLeaf);
  upload.append("signature", signature);

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/auto/upload`;
  const response = await fetch(endpoint, { method: "POST", body: upload });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.secure_url) {
    console.error("Chat media provider upload failed:", { status: response.status });
    return error("Media chat gagal diunggah.", 502);
  }

  const expectedKind = isAudio ? "audio" : "image";
  const descriptor = parseOwnedChatMediaUrl(data.secure_url, env, {
    conversationId,
    userId: user.id,
    kind: expectedKind
  });

  if (!descriptor || String(data.public_id || "") !== expectedPublicId) {
    if (descriptor) await destroyOwnedChatMedia(env, descriptor).catch(() => null);
    console.error("Chat media provider returned unexpected ownership metadata.");
    return error("Media chat gagal diverifikasi.", 502);
  }

  return json(
    {
      ok: true,
      media: {
        kind: expectedKind,
        url: descriptor.url,
        bytes: Number(data.bytes || file.size),
        width: Number.isFinite(Number(data.width)) ? Number(data.width) : null,
        height: Number.isFinite(Number(data.height)) ? Number(data.height) : null,
        duration: Number.isFinite(Number(data.duration)) ? Number(data.duration) : null,
        original_filename: String(data.original_filename || file.name || "").slice(0, 180) || null,
        conversation_id: conversationId
      }
    },
    201
  );
}

async function sendRichMessage(request, env, conversationId, user) {
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
    const descriptor = parseOwnedChatMediaUrl(body?.media_url, env, {
      conversationId,
      userId: user.id,
      kind: type
    });
    if (!descriptor) {
      return error("Media bukan milik akun ini atau bukan untuk percakapan ini.", 403);
    }

    mediaUrl = descriptor.url;
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

  try {
    const message = await withTransaction(env, async client => {
      const conversation = await client.query(
        `
          SELECT id
          FROM direct_conversations
          WHERE
            id = $1::uuid
            AND (user_a_id = $2::uuid OR user_b_id = $2::uuid)
          LIMIT 1
          FOR SHARE
        `,
        [conversationId, user.id]
      );

      if (!conversation.rows[0]) {
        throw Object.assign(new Error("Percakapan tidak ditemukan."), { status: 404 });
      }

      if (mediaUrl) {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [mediaUrl]
        );

        const reused = await client.query(
          "SELECT id FROM direct_messages WHERE media_url = $1 LIMIT 1",
          [mediaUrl]
        );
        if (reused.rows[0]) {
          throw Object.assign(new Error("Media ini sudah digunakan pada pesan lain."), { status: 409 });
        }
      }

      const inserted = await client.query(
        `
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
          VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9)
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
        `,
        [
          conversationId,
          user.id,
          fallbackMessage,
          type,
          mediaUrl,
          mediaName,
          duration,
          latitude,
          longitude
        ]
      );

      await client.query(
        "UPDATE direct_conversations SET updated_at = NOW() WHERE id = $1::uuid",
        [conversationId]
      );

      return inserted.rows[0];
    });

    return json({ ok: true, message }, 201);
  } catch (err) {
    if (Number.isInteger(err?.status)) return error(err.message, err.status);
    if (err?.code === "40001" || err?.code === "40P01") {
      return error("Pesan sedang diproses bersamaan. Silakan coba lagi.", 409);
    }
    console.error("Rich message transaction failed:", err);
    return error("Pesan belum dapat dikirim.", 500);
  }
}

async function cleanupMedia(sql, request, env, user) {
  const body = await request.json().catch(() => null);
  const conversationId = uuid(body?.conversation_id);
  if (!conversationId) return error("Percakapan cleanup tidak valid.", 400);

  if (!(await conversationForUser(sql, conversationId, user.id))) {
    return error("Percakapan tidak ditemukan.", 404);
  }

  const descriptor = parseOwnedChatMediaUrl(body?.media_url, env, {
    conversationId,
    userId: user.id,
    kind: null,
    allowLegacy: false
  });
  if (!descriptor) return error("Media cleanup bukan milik akun ini.", 403);

  const referenced = await sql`
    SELECT id
    FROM direct_messages
    WHERE media_url = ${descriptor.url}
    LIMIT 1
  `;

  if (referenced[0]) {
    return error("Media sudah terikat pada pesan dan tidak dapat dibersihkan.", 409);
  }

  const removed = await destroyOwnedChatMedia(env, descriptor);
  if (!removed.ok) return error("Media belum dapat dibersihkan.", 502);

  return json({ ok: true, cleaned: true });
}

async function richMeta(sql, conversationId, user) {
  if (!(await conversationForUser(sql, conversationId, user.id))) {
    return error("Percakapan tidak ditemukan.", 404);
  }

  const messages = await sql`
    SELECT * FROM (
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
      ORDER BY dm.created_at DESC, dm.id DESC
      LIMIT 200
    ) recent
    ORDER BY recent.created_at ASC, recent.id ASC
  `;

  return json({
    ok: true,
    current_user_id: user.id,
    conversation_id: conversationId,
    messages
  });
}

export async function handleChatMediaApiV2(request, env) {
  const url = new URL(request.url);
  const uploadRoute = url.pathname === "/api/chat/media/upload" && request.method === "POST";
  const cleanupRoute = url.pathname === "/api/chat/media/cleanup" && request.method === "POST";
  const sendMatch = url.pathname.match(
    /^\/api\/chat\/conversations\/([0-9a-f-]{36})\/rich-message$/i
  );
  const metaMatch = url.pathname.match(
    /^\/api\/chat\/conversations\/([0-9a-f-]{36})\/rich-meta$/i
  );

  if (!uploadRoute && !cleanupRoute && !sendMatch && !metaMatch) return null;

  try {
    const sql = neon(env.DATABASE_URL);
    const user = await currentUser(sql, request);
    if (!user) return error("Silakan masuk terlebih dahulu.", 401);

    if (uploadRoute) return await uploadMedia(sql, request, env, user);
    if (cleanupRoute) return await cleanupMedia(sql, request, env, user);

    if (sendMatch && request.method === "POST") {
      const conversationId = uuid(sendMatch[1]);
      if (!conversationId) return error("Percakapan tidak valid.", 400);
      return await sendRichMessage(request, env, conversationId, user);
    }

    if (metaMatch && request.method === "GET") {
      const conversationId = uuid(metaMatch[1]);
      if (!conversationId) return error("Percakapan tidak valid.", 400);
      return await richMeta(sql, conversationId, user);
    }

    return error("Endpoint media chat tidak ditemukan.", 404);
  } catch (err) {
    console.error("Chat media v2 API error:", err);
    return error("Media chat sedang mengalami gangguan.", 500);
  }
}
