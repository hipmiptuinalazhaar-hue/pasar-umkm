import { neon } from "@neondatabase/serverless";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const V4_MIGRATION = "2026-09-09-reels-commerce-v4";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REEL_BYTES = 45 * 1024 * 1024;
const MAX_REEL_SECONDS = 180;
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const buckets = new Map();

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff", ...headers } });
}
function fail(error, status = 400, code = "INVALID_REQUEST") { return json({ ok: false, error, code }, status); }
function clean(value, max = 1000) { const text = String(value ?? "").trim(); return text ? text.slice(0, max) : null; }
function validUuid(value) { const id = String(value || "").trim().toLowerCase(); return UUID.test(id) ? id : null; }
function cookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const item of raw.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return parts.join("=") || null;
  }
  return null;
}
async function digest(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const out = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(out)].map(v => v.toString(16).padStart(2, "0")).join("");
}
async function sha1(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const out = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(out)].map(v => v.toString(16).padStart(2, "0")).join("");
}
function clientIp(request) { return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown"; }

async function currentUser(sql, request) {
  const token = cookie(request, SESSION_COOKIE);
  if (!token) return null;
  const rows = await sql`
    SELECT u.id,u.name,u.avatar_url,u.role
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=encode(digest(${token},'sha256'),'hex')
      AND s.expires_at>NOW() AND u.is_active=TRUE
    LIMIT 1
  `;
  return rows[0] || null;
}
async function ensureV4(sql) {
  const rows = await sql`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=${V4_MIGRATION}) AS ready`;
  return rows[0]?.ready === true;
}
async function ownedStore(sql, userId) {
  const rows = await sql`
    SELECT id,name,logo_url,address,city,verification_status
    FROM stores WHERE owner_id=${userId} AND is_active=TRUE
    ORDER BY created_at ASC LIMIT 1
  `;
  return rows[0] || null;
}
async function validateOwnedProduct(sql, storeId, productId) {
  if (!productId) return null;
  const id = validUuid(productId);
  if (!id || !storeId) return null;
  const rows = await sql`
    SELECT id,name,price,thumbnail_url,stock
    FROM products
    WHERE id=${id}::uuid AND store_id=${storeId}::uuid AND is_active=TRUE
    LIMIT 1
  `;
  return rows[0] || null;
}

async function enforceUploadLimit(request, env, draft) {
  const identitySource = cookie(request, SESSION_COOKIE) || clientIp(request);
  const identity = (await digest(identitySource)).slice(0, 24);
  const key = `${draft ? "draft" : "publish"}:${identity}`;
  const now = Date.now();
  const current = buckets.get(key);
  const limit = draft ? 20 : 10;
  if (!current || current.resetAt <= now) buckets.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 });
  else {
    current.count += 1;
    buckets.set(key, current);
    if (current.count > limit) return fail("Terlalu banyak upload. Coba lagi nanti.", 429, "RATE_LIMITED");
  }
  const edge = env?.EDGE_WRITE_LIMITER;
  if (edge && typeof edge.limit === "function") {
    try {
      const result = await edge.limit({ key: `reels-v4-secure:${identity}` });
      if (result?.success === false) return fail("Terlalu banyak upload. Coba lagi nanti.", 429, "RATE_LIMITED");
    } catch { /* local bucket still protects the isolate */ }
  }
  return null;
}

async function detectVideoContainer(file) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") return "iso-bmff";
  return null;
}

async function destroyVideo(env, publicId) {
  if (!publicId || !env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return false;
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await sha1(`public_id=${publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`);
    const form = new FormData();
    form.append("public_id", publicId);
    form.append("timestamp", String(timestamp));
    form.append("api_key", env.CLOUDINARY_API_KEY);
    form.append("signature", signature);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/video/destroy`, { method: "POST", body: form });
    if (!response.ok) console.error("Reels orphan cleanup failed:", response.status);
    return response.ok;
  } catch (error) {
    console.error("Reels orphan cleanup error:", error?.message || "unknown");
    return false;
  }
}

function cloudinaryCover(env, publicId, second = 0) {
  if (!env.CLOUDINARY_CLOUD_NAME || !publicId) return null;
  const t = Math.max(0, Number(second || 0) || 0).toFixed(2).replace(/\.00$/, "");
  return `https://res.cloudinary.com/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/video/upload/so_${t},c_fill,g_auto,w_720,h_1280,q_auto,f_jpg/${publicId}.jpg`;
}

async function uploadVideo(file, env) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw Object.assign(new Error("MEDIA_CONFIG"), { publicStatus: 503, publicCode: "MEDIA_CONFIG_UNAVAILABLE", publicMessage: "Konfigurasi media video belum tersedia." });
  if (!(file instanceof File)) throw Object.assign(new Error("FILE_REQUIRED"), { publicCode: "FILE_REQUIRED", publicMessage: "Pilih video terlebih dahulu." });
  const declaredType = String(file.type || "").toLowerCase();
  if (!VIDEO_TYPES.has(declaredType)) throw Object.assign(new Error("TYPE_INVALID"), { publicStatus: 415, publicCode: "UNSUPPORTED_MEDIA_TYPE", publicMessage: "Format video harus MP4, WebM, atau MOV." });
  if (!file.size || file.size > MAX_REEL_BYTES) throw Object.assign(new Error("SIZE_INVALID"), { publicStatus: 413, publicCode: "FILE_TOO_LARGE", publicMessage: "Ukuran video maksimal 45 MB." });
  const container = await detectVideoContainer(file);
  const signatureMatches = declaredType === "video/webm" ? container === "webm" : container === "iso-bmff";
  if (!signatureMatches) throw Object.assign(new Error("SIGNATURE_INVALID"), { publicStatus: 415, publicCode: "INVALID_VIDEO_SIGNATURE", publicMessage: "Isi file tidak cocok dengan format video yang dipilih." });

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "pasar-umkm/reels-v4";
  const signature = await sha1(`folder=${folder}&timestamp=${timestamp}${apiSecret}`);
  const form = new FormData();
  form.append("file", file, file.name || "reel.mp4");
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("signature", signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/video/upload`, { method: "POST", body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.secure_url) {
    console.error("Reels upload provider error:", response.status, data?.error?.http_code || "unknown");
    throw Object.assign(new Error("UPLOAD_FAILED"), { publicStatus: 502, publicCode: "MEDIA_PROVIDER_ERROR", publicMessage: "Video gagal diunggah." });
  }

  const uploaded = {
    url: data.secure_url,
    publicId: data.public_id || null,
    duration: Number(data.duration || 0) || null,
    width: Number(data.width || 0) || null,
    height: Number(data.height || 0) || null,
    bytes: Number(data.bytes || 0) || null
  };
  if (uploaded.duration && uploaded.duration > MAX_REEL_SECONDS) {
    await destroyVideo(env, uploaded.publicId);
    throw Object.assign(new Error("DURATION_INVALID"), { publicCode: "VIDEO_TOO_LONG", publicMessage: "Durasi Reels maksimal 3 menit." });
  }
  return uploaded;
}

async function createSecure(sql, request, env, { draft = false } = {}) {
  const user = await currentUser(sql, request);
  if (!user) return fail("Silakan masuk terlebih dahulu.", 401, "AUTH_REQUIRED");
  const limited = await enforceUploadLimit(request, env, draft);
  if (limited) return limited;
  const form = await request.formData().catch(() => null);
  if (!form) return fail("Data Reels tidak valid.", 400, "INVALID_FORM");

  const store = await ownedStore(sql, user.id);
  const productIdInput = form.get("product_id");
  const product = await validateOwnedProduct(sql, store?.id, productIdInput);
  if (productIdInput && !product) return fail("Produk tidak valid atau bukan milik toko Anda.", 400, "INVALID_PRODUCT");

  const caption = clean(form.get("caption"), 2200);
  const location = clean(form.get("location_text"), 180) || store?.city || null;
  const trimStart = Math.max(0, Number(form.get("trim_start") || 0) || 0);
  const requestedEnd = Number(form.get("trim_end") || 0) || null;
  const cropMode = form.get("crop_mode") === "contain" ? "contain" : "cover";
  const audioMode = form.get("audio_mode") === "muted" ? "muted" : "original";
  const remixId = validUuid(form.get("remix_of_reel_id"));
  const templateId = validUuid(form.get("template_of_reel_id"));

  let uploaded = null;
  try {
    uploaded = await uploadVideo(form.get("file"), env);
    const trimEnd = requestedEnd && uploaded.duration ? Math.min(requestedEnd, uploaded.duration) : uploaded.duration;
    if (uploaded.duration && (trimStart >= uploaded.duration || (trimEnd && trimEnd <= trimStart))) {
      throw Object.assign(new Error("INVALID_TRIM"), { publicCode: "INVALID_TRIM", publicMessage: "Rentang trim video tidak valid." });
    }
    const coverSecond = Math.max(trimStart, Math.min(Number(form.get("cover_second") || trimStart) || trimStart, trimEnd || uploaded.duration || trimStart));
    const coverUrl = cloudinaryCover(env, uploaded.publicId, coverSecond);

    if (draft) {
      const rows = await sql`
        INSERT INTO reel_drafts(
          user_id,store_id,product_id,video_url,cloudinary_public_id,cover_url,caption,location_text,
          trim_start_seconds,trim_end_seconds,crop_mode,audio_mode,remix_of_reel_id,template_of_reel_id,
          duration_seconds,width,height,bytes
        ) VALUES(
          ${user.id},${store?.id || null},${product?.id || null},${uploaded.url},${uploaded.publicId},${coverUrl},${caption},${location},
          ${trimStart},${trimEnd},${cropMode},${audioMode},${remixId},${templateId},
          ${uploaded.duration},${uploaded.width},${uploaded.height},${uploaded.bytes}
        ) RETURNING *
      `;
      return json({ ok: true, draft: rows[0] }, 201);
    }

    const rows = await sql`
      INSERT INTO reels(
        user_id,store_id,video_url,cloudinary_public_id,caption,product_id,cover_url,duration_seconds,width,height,bytes,
        location_text,trim_start_seconds,trim_end_seconds,crop_mode,audio_mode,original_audio_label,
        remix_of_reel_id,template_of_reel_id,allow_comments,visibility
      ) VALUES(
        ${user.id},${store?.id || null},${uploaded.url},${uploaded.publicId},${caption},${product?.id || null},${coverUrl},${uploaded.duration},${uploaded.width},${uploaded.height},${uploaded.bytes},
        ${location},${trimStart},${trimEnd},${cropMode},${audioMode},'Original audio',${remixId},${templateId},TRUE,'public'
      ) RETURNING *
    `;
    return json({
      ok: true,
      reel: {
        ...rows[0], user_name: user.name, user_avatar_url: user.avatar_url,
        store_name: store?.name || null, product_name: product?.name || null, product_price: product?.price || null,
        likes_count: 0, comments_count: 0, saves_count: 0, reposts_count: 0,
        viewer_liked: false, viewer_saved: false, viewer_reposted: false
      }
    }, 201);
  } catch (error) {
    if (uploaded?.publicId) await destroyVideo(env, uploaded.publicId);
    console.error("Secure Reels create failed:", error?.code || error?.message || "unknown");
    if (error?.publicMessage) return fail(error.publicMessage, error.publicStatus || 400, error.publicCode || "MEDIA_INVALID");
    return fail("Reels belum dapat disimpan.", 500, "REELS_CREATE_ERROR");
  }
}

export async function handleReelsV4SecureCreateApi(request, env) {
  const url = new URL(request.url);
  const draft = url.pathname === "/api/reels/v4/drafts" && request.method === "POST";
  const publish = url.pathname === "/api/reels/v4" && request.method === "POST";
  if (!draft && !publish) return null;
  const sql = neon(env.DATABASE_URL);
  if (!(await ensureV4(sql))) return fail("Reels Commerce V4 belum siap di database.", 503, "REELS_V4_SCHEMA_NOT_READY");
  return createSecure(sql, request, env, { draft });
}
