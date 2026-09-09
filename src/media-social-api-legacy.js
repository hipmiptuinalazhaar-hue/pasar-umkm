import { neon } from "@neondatabase/serverless";
import { ensureMediaSocialInfrastructure } from "./media-social-store.js";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REEL_BYTES = 45 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime"
]);

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function fail(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";

  for (const piece of header.split(";")) {
    const [key, ...value] = piece.trim().split("=");
    if (key === name) return value.join("=") || null;
  }

  return null;
}

function uuid(value) {
  const id = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}

function cleanText(value, max) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

async function currentUser(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const rows = await sql`
    SELECT
      u.id,
      u.name,
      u.avatar_url,
      u.role
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

async function currentStore(sql, userId) {
  const rows = await sql`
    SELECT id, name, logo_url, verification_status
    FROM stores
    WHERE owner_id = ${userId} AND is_active = TRUE
    ORDER BY created_at ASC
    LIMIT 1
  `;

  return rows[0] || null;
}

async function requireUser(sql, request) {
  const user = await currentUser(sql, request);
  return user || null;
}

async function sha1Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function uploadVideoToCloudinary(file, env) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Konfigurasi media video belum tersedia.");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "pasar-umkm/reels";
  const signature = await sha1Hex(
    `folder=${folder}&timestamp=${timestamp}${apiSecret}`
  );

  const form = new FormData();
  form.append("file", file, file.name || "reel.mp4");
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("signature", signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/video/upload`,
    {
      method: "POST",
      body: form
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.secure_url) {
    console.error("Cloudinary reel upload error:", data);
    throw new Error(
      data?.error?.message || "Video gagal diunggah."
    );
  }

  return {
    url: data.secure_url,
    public_id: data.public_id || null,
    duration: Number(data.duration || 0) || null,
    width: Number(data.width || 0) || null,
    height: Number(data.height || 0) || null,
    bytes: Number(data.bytes || 0) || null
  };
}

async function addNotification(
  sql,
  {
    recipientId,
    actorId,
    type,
    title,
    message,
    entityType,
    entityId
  }
) {
  if (!recipientId || !actorId || String(recipientId) === String(actorId)) {
    return;
  }

  await sql`
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      target_type,
      target_id,
      actor_user_id,
      entity_type,
      entity_id,
      is_read,
      created_at
    )
    VALUES (
      ${recipientId},
      ${type},
      ${title},
      ${message},
      ${entityType},
      ${entityId},
      ${actorId},
      ${entityType},
      ${entityId},
      FALSE,
      NOW()
    )
  `;
}

async function listReels(sql, request, url) {
  const viewer = await currentUser(sql, request);
  const requestedUserId = uuid(url.searchParams.get("user_id"));
  const requestedStoreId = uuid(url.searchParams.get("store_id"));
  const limit = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get("limit") || 30) || 30)
  );

  const reels = await sql`
    SELECT
      r.id,
      r.user_id,
      r.store_id,
      r.video_url,
      r.caption,
      r.created_at,
      u.name AS user_name,
      u.avatar_url AS user_avatar_url,
      s.name AS store_name,
      s.logo_url AS store_logo_url,
      s.verification_status,
      (
        SELECT COUNT(*)::int
        FROM reel_likes rl
        WHERE rl.reel_id = r.id
      ) AS likes_count,
      (
        SELECT COUNT(*)::int
        FROM reel_comments rc
        WHERE rc.reel_id = r.id AND rc.is_active = TRUE
      ) AS comments_count,
      CASE
        WHEN ${viewer?.id || null}::uuid IS NULL THEN FALSE
        ELSE EXISTS (
          SELECT 1
          FROM reel_likes rl
          WHERE rl.reel_id = r.id
            AND rl.user_id = ${viewer?.id || null}::uuid
        )
      END AS viewer_liked
    FROM reels r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN stores s ON s.id = r.store_id
    WHERE
      r.is_active = TRUE
      AND u.is_active = TRUE
      AND (${requestedUserId}::uuid IS NULL OR r.user_id = ${requestedUserId}::uuid)
      AND (${requestedStoreId}::uuid IS NULL OR r.store_id = ${requestedStoreId}::uuid)
    ORDER BY r.created_at DESC
    LIMIT ${limit}
  `;

  return json({ ok: true, count: reels.length, reels });
}

async function createReel(sql, request, env) {
  const user = await requireUser(sql, request);
  if (!user) return fail("Silakan masuk terlebih dahulu.", 401);

  const form = await request.formData().catch(() => null);
  if (!form) return fail("Data reels tidak valid.", 400);

  const file = form.get("file");
  const caption = cleanText(form.get("caption"), 2200);

  if (!(file instanceof File)) {
    return fail("Pilih video terlebih dahulu.", 400);
  }

  if (!ALLOWED_VIDEO_TYPES.has(String(file.type || "").toLowerCase())) {
    return fail("Format video harus MP4, WebM, atau MOV.", 415);
  }

  if (!file.size || file.size > MAX_REEL_BYTES) {
    return fail("Ukuran video maksimal 45 MB.", 413);
  }

  const store = await currentStore(sql, user.id);
  const uploaded = await uploadVideoToCloudinary(file, env);

  const rows = await sql`
    INSERT INTO reels (
      user_id,
      store_id,
      video_url,
      cloudinary_public_id,
      caption
    )
    VALUES (
      ${user.id},
      ${store?.id || null},
      ${uploaded.url},
      ${uploaded.public_id},
      ${caption}
    )
    RETURNING *
  `;

  return json(
    {
      ok: true,
      message: "Reels berhasil dipublikasikan.",
      reel: {
        ...rows[0],
        user_name: user.name,
        user_avatar_url: user.avatar_url,
        store_name: store?.name || null,
        store_logo_url: store?.logo_url || null,
        verification_status: store?.verification_status || null,
        likes_count: 0,
        comments_count: 0,
        viewer_liked: false,
        media: uploaded
      }
    },
    201
  );
}

async function reelById(sql, reelId) {
  const rows = await sql`
    SELECT r.id, r.user_id, r.store_id, r.video_url, r.caption, r.created_at,
           u.name AS user_name, u.avatar_url AS user_avatar_url,
           s.name AS store_name, s.logo_url AS store_logo_url,
           s.verification_status
    FROM reels r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN stores s ON s.id = r.store_id
    WHERE r.id = ${reelId}::uuid AND r.is_active = TRUE
    LIMIT 1
  `;

  return rows[0] || null;
}

async function handleReelLike(sql, request, reelId) {
  const user = await requireUser(sql, request);
  if (!user) return fail("Silakan masuk terlebih dahulu.", 401);

  const reel = await reelById(sql, reelId);
  if (!reel) return fail("Reels tidak ditemukan.", 404);

  if (request.method === "POST") {
    const inserted = await sql`
      INSERT INTO reel_likes (reel_id, user_id)
      VALUES (${reelId}::uuid, ${user.id})
      ON CONFLICT DO NOTHING
      RETURNING reel_id
    `;

    if (inserted[0]) {
      await addNotification(sql, {
        recipientId: reel.user_id,
        actorId: user.id,
        type: "reel",
        title: "Reels disukai",
        message: `${user.name || "Seseorang"} menyukai reels Anda.`,
        entityType: "reel",
        entityId: reel.id
      });
    }
  } else if (request.method === "DELETE") {
    await sql`
      DELETE FROM reel_likes
      WHERE reel_id = ${reelId}::uuid AND user_id = ${user.id}
    `;
  } else {
    return fail("Metode tidak diizinkan.", 405);
  }

  const counts = await sql`
    SELECT COUNT(*)::int AS likes_count
    FROM reel_likes
    WHERE reel_id = ${reelId}::uuid
  `;

  return json({
    ok: true,
    liked: request.method === "POST",
    likes_count: counts[0]?.likes_count || 0
  });
}

async function listReelComments(sql, reelId) {
  return await sql`
    SELECT
      rc.id,
      rc.reel_id,
      rc.user_id,
      rc.body,
      rc.created_at,
      u.name AS user_name,
      u.avatar_url AS user_avatar_url
    FROM reel_comments rc
    JOIN users u ON u.id = rc.user_id
    WHERE rc.reel_id = ${reelId}::uuid
      AND rc.is_active = TRUE
      AND u.is_active = TRUE
    ORDER BY rc.created_at ASC
    LIMIT 100
  `;
}

async function handleReelComments(sql, request, reelId) {
  const reel = await reelById(sql, reelId);
  if (!reel) return fail("Reels tidak ditemukan.", 404);

  if (request.method === "GET") {
    const comments = await listReelComments(sql, reelId);
    return json({ ok: true, comments, count: comments.length });
  }

  if (request.method !== "POST") {
    return fail("Metode tidak diizinkan.", 405);
  }

  const user = await requireUser(sql, request);
  if (!user) return fail("Silakan masuk terlebih dahulu.", 401);

  const body = await request.json().catch(() => null);
  const text = cleanText(body?.body, 1000);
  if (!text) return fail("Komentar tidak boleh kosong.", 400);

  const rows = await sql`
    INSERT INTO reel_comments (reel_id, user_id, body)
    VALUES (${reelId}::uuid, ${user.id}, ${text})
    RETURNING id, reel_id, user_id, body, created_at
  `;

  await addNotification(sql, {
    recipientId: reel.user_id,
    actorId: user.id,
    type: "reel",
    title: "Komentar reels",
    message: `${user.name || "Seseorang"} mengomentari reels Anda.`,
    entityType: "reel",
    entityId: reel.id
  });

  return json(
    {
      ok: true,
      comment: {
        ...rows[0],
        user_name: user.name,
        user_avatar_url: user.avatar_url
      }
    },
    201
  );
}

async function storyDetail(sql, request, storyId) {
  const viewer = await currentUser(sql, request);

  const rows = await sql`
    SELECT
      st.id,
      st.user_id,
      st.store_id,
      st.image_url,
      st.caption,
      st.created_at,
      st.expires_at,
      u.name AS user_name,
      u.avatar_url AS user_avatar_url,
      s.name AS store_name,
      s.logo_url AS store_logo_url,
      (
        SELECT COUNT(*)::int
        FROM story_likes sl
        WHERE sl.story_id = st.id
      ) AS likes_count,
      (
        SELECT COUNT(*)::int
        FROM story_comments sc
        WHERE sc.story_id = st.id AND sc.is_active = TRUE
      ) AS comments_count,
      CASE
        WHEN ${viewer?.id || null}::uuid IS NULL THEN FALSE
        ELSE EXISTS (
          SELECT 1
          FROM story_likes sl
          WHERE sl.story_id = st.id
            AND sl.user_id = ${viewer?.id || null}::uuid
        )
      END AS viewer_liked
    FROM stories st
    JOIN users u ON u.id = st.user_id
    LEFT JOIN stores s ON s.id = st.store_id
    WHERE
      st.id = ${storyId}::uuid
      AND st.is_active = TRUE
      AND st.expires_at > NOW()
      AND u.is_active = TRUE
    LIMIT 1
  `;

  return rows[0] || null;
}

async function createStoryV2(sql, request) {
  const user = await requireUser(sql, request);
  if (!user) return fail("Silakan masuk terlebih dahulu.", 401);

  const body = await request.json().catch(() => null);
  if (!body) return fail("Data cerita tidak valid.", 400);

  const imageUrl = cleanText(body.image_url, 2000);
  const caption = cleanText(body.caption, 1000);

  if (!imageUrl && !caption) {
    return fail("Cerita harus berisi foto atau teks.", 400);
  }

  if (imageUrl && !/^https:\/\//i.test(imageUrl)) {
    return fail("Foto cerita tidak valid.", 400);
  }

  const store = await currentStore(sql, user.id);
  const rows = await sql`
    INSERT INTO stories (user_id, store_id, image_url, caption)
    VALUES (${user.id}, ${store?.id || null}, ${imageUrl}, ${caption})
    RETURNING *
  `;

  return json(
    {
      ok: true,
      story: {
        ...rows[0],
        user_name: user.name,
        user_avatar_url: user.avatar_url,
        store_name: store?.name || null,
        store_logo_url: store?.logo_url || null,
        likes_count: 0,
        comments_count: 0,
        viewer_liked: false
      }
    },
    201
  );
}

async function handleStoryLike(sql, request, storyId) {
  const user = await requireUser(sql, request);
  if (!user) return fail("Silakan masuk terlebih dahulu.", 401);

  const story = await storyDetail(sql, request, storyId);
  if (!story) return fail("Cerita tidak ditemukan atau sudah berakhir.", 404);

  if (request.method === "POST") {
    const inserted = await sql`
      INSERT INTO story_likes (story_id, user_id)
      VALUES (${storyId}::uuid, ${user.id})
      ON CONFLICT DO NOTHING
      RETURNING story_id
    `;

    if (inserted[0]) {
      await addNotification(sql, {
        recipientId: story.user_id,
        actorId: user.id,
        type: "story",
        title: "Cerita disukai",
        message: `${user.name || "Seseorang"} menyukai cerita Anda.`,
        entityType: "story",
        entityId: story.id
      });
    }
  } else if (request.method === "DELETE") {
    await sql`
      DELETE FROM story_likes
      WHERE story_id = ${storyId}::uuid AND user_id = ${user.id}
    `;
  } else {
    return fail("Metode tidak diizinkan.", 405);
  }

  const counts = await sql`
    SELECT COUNT(*)::int AS likes_count
    FROM story_likes
    WHERE story_id = ${storyId}::uuid
  `;

  return json({
    ok: true,
    liked: request.method === "POST",
    likes_count: counts[0]?.likes_count || 0
  });
}

async function listStoryComments(sql, storyId) {
  return await sql`
    SELECT
      sc.id,
      sc.story_id,
      sc.user_id,
      sc.body,
      sc.created_at,
      u.name AS user_name,
      u.avatar_url AS user_avatar_url
    FROM story_comments sc
    JOIN users u ON u.id = sc.user_id
    WHERE sc.story_id = ${storyId}::uuid
      AND sc.is_active = TRUE
      AND u.is_active = TRUE
    ORDER BY sc.created_at ASC
    LIMIT 100
  `;
}

async function handleStoryComments(sql, request, storyId) {
  const story = await storyDetail(sql, request, storyId);
  if (!story) return fail("Cerita tidak ditemukan atau sudah berakhir.", 404);

  if (request.method === "GET") {
    const comments = await listStoryComments(sql, storyId);
    return json({ ok: true, comments, count: comments.length });
  }

  if (request.method !== "POST") {
    return fail("Metode tidak diizinkan.", 405);
  }

  const user = await requireUser(sql, request);
  if (!user) return fail("Silakan masuk terlebih dahulu.", 401);

  const body = await request.json().catch(() => null);
  const text = cleanText(body?.body, 500);
  if (!text) return fail("Komentar tidak boleh kosong.", 400);

  const rows = await sql`
    INSERT INTO story_comments (story_id, user_id, body)
    VALUES (${storyId}::uuid, ${user.id}, ${text})
    RETURNING id, story_id, user_id, body, created_at
  `;

  await addNotification(sql, {
    recipientId: story.user_id,
    actorId: user.id,
    type: "story",
    title: "Komentar cerita",
    message: `${user.name || "Seseorang"} mengomentari cerita Anda.`,
    entityType: "story",
    entityId: story.id
  });

  return json(
    {
      ok: true,
      comment: {
        ...rows[0],
        user_name: user.name,
        user_avatar_url: user.avatar_url
      }
    },
    201
  );
}

export async function handleMediaSocialApi(request, env) {
  const url = new URL(request.url);

  if (
    !url.pathname.startsWith("/api/reels") &&
    !url.pathname.startsWith("/api/story-v2")
  ) {
    return null;
  }

  try {
    const sql = neon(env.DATABASE_URL);
    await ensureMediaSocialInfrastructure(sql);

    if (url.pathname === "/api/reels" && request.method === "GET") {
      return await listReels(sql, request, url);
    }

    if (url.pathname === "/api/reels" && request.method === "POST") {
      return await createReel(sql, request, env);
    }

    const reelLike = url.pathname.match(/^\/api\/reels\/([0-9a-f-]{36})\/like$/i);
    if (reelLike) {
      const reelId = uuid(reelLike[1]);
      if (!reelId) return fail("Reels tidak valid.", 400);
      return await handleReelLike(sql, request, reelId);
    }

    const reelComments = url.pathname.match(/^\/api\/reels\/([0-9a-f-]{36})\/comments$/i);
    if (reelComments) {
      const reelId = uuid(reelComments[1]);
      if (!reelId) return fail("Reels tidak valid.", 400);
      return await handleReelComments(sql, request, reelId);
    }

    if (url.pathname === "/api/story-v2/stories" && request.method === "POST") {
      return await createStoryV2(sql, request);
    }

    const storyDetailMatch = url.pathname.match(/^\/api\/story-v2\/stories\/([0-9a-f-]{36})$/i);
    if (storyDetailMatch && request.method === "GET") {
      const storyId = uuid(storyDetailMatch[1]);
      if (!storyId) return fail("Cerita tidak valid.", 400);
      const story = await storyDetail(sql, request, storyId);
      if (!story) return fail("Cerita tidak ditemukan atau sudah berakhir.", 404);
      return json({ ok: true, story });
    }

    const storyLike = url.pathname.match(/^\/api\/story-v2\/stories\/([0-9a-f-]{36})\/like$/i);
    if (storyLike) {
      const storyId = uuid(storyLike[1]);
      if (!storyId) return fail("Cerita tidak valid.", 400);
      return await handleStoryLike(sql, request, storyId);
    }

    const storyComments = url.pathname.match(/^\/api\/story-v2\/stories\/([0-9a-f-]{36})\/comments$/i);
    if (storyComments) {
      const storyId = uuid(storyComments[1]);
      if (!storyId) return fail("Cerita tidak valid.", 400);
      return await handleStoryComments(sql, request, storyId);
    }

    return fail("Endpoint media sosial tidak ditemukan.", 404);
  } catch (error) {
    console.error("Media social API error:", error);
    return fail(error?.message || "Media sosial sedang mengalami gangguan.", 500);
  }
}
