import { neon } from "@neondatabase/serverless";
import { requireAdminPermission } from "./admin-authorization.js";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const V4_MIGRATION = "2026-09-09-reels-commerce-v4";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REEL_BYTES = 45 * 1024 * 1024;
const MAX_REEL_SECONDS = 180;
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const REPORT_CATEGORIES = new Set(["spam","fraud","prohibited_item","harassment","sexual_content","violence","misleading","copyright","other"]);
const EVENT_TYPES = new Set(["impression","play","view","watch","complete","replay","pause","share","save","repost","profile_click","store_click","product_click","chat_click","add_to_cart","order"]);
const isolateBuckets = new Map();

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
function escapeHtml(value) {
  return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}
async function digest(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const out = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(out)].map(v => v.toString(16).padStart(2,"0")).join("");
}
async function currentUser(sql, request) {
  const token = cookie(request, SESSION_COOKIE);
  if (!token) return null;
  const rows = await sql`
    SELECT u.id,u.name,u.avatar_url,u.role
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=encode(digest(${token},'sha256'),'hex')
      AND s.expires_at>NOW() AND u.is_active=TRUE
    LIMIT 1`;
  return rows[0] || null;
}
async function requireUser(sql, request) {
  const user = await currentUser(sql, request);
  return user ? { user } : { response: fail("Silakan masuk terlebih dahulu.", 401, "AUTH_REQUIRED") };
}
async function ensureV4(sql) {
  const rows = await sql`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=${V4_MIGRATION}) AS ready`;
  return rows[0]?.ready === true;
}
function decodeOffset(cursor) {
  if (!cursor) return 0;
  try {
    const raw = atob(String(cursor).replace(/-/g,"+").replace(/_/g,"/"));
    const parsed = JSON.parse(raw);
    return Math.max(0, Math.min(100000, Number(parsed?.offset || 0) || 0));
  } catch { return 0; }
}
function encodeOffset(offset) {
  return btoa(JSON.stringify({ offset })).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function clientIp(request) { return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown"; }
async function enforceV4Limit(request, env, key, limit, windowMs, edgeBinding = "EDGE_WRITE_LIMITER") {
  const session = cookie(request, SESSION_COOKIE) || clientIp(request);
  const identity = (await digest(session)).slice(0, 24);
  const bucketKey = `${key}:${identity}`;
  const now = Date.now();
  const bucket = isolateBuckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) isolateBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
  else {
    bucket.count += 1;
    isolateBuckets.set(bucketKey, bucket);
    if (bucket.count > limit) return fail("Terlalu banyak permintaan. Coba lagi sebentar.", 429, "RATE_LIMITED");
  }
  const edge = env?.[edgeBinding];
  if (edge && typeof edge.limit === "function") {
    try {
      const result = await edge.limit({ key: `reels-v4:${key}:${identity}` });
      if (result?.success === false) return fail("Terlalu banyak permintaan. Coba lagi sebentar.", 429, "RATE_LIMITED");
    } catch { /* isolate limiter remains active */ }
  }
  return null;
}
async function sha1(value) {
  const bytes = new TextEncoder().encode(value);
  const out = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(out)].map(v => v.toString(16).padStart(2,"0")).join("");
}
function cloudinaryCover(env, publicId, second = 0) {
  if (!env.CLOUDINARY_CLOUD_NAME || !publicId) return null;
  const t = Math.max(0, Number(second || 0) || 0).toFixed(2).replace(/\.00$/,"");
  return `https://res.cloudinary.com/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/video/upload/so_${t},c_fill,g_auto,w_720,h_1280,q_auto,f_jpg/${publicId}.jpg`;
}
async function uploadVideo(file, env) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME, apiKey = env.CLOUDINARY_API_KEY, apiSecret = env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw new Error("Konfigurasi media video belum tersedia.");
  if (!(file instanceof File)) throw new Error("Pilih video terlebih dahulu.");
  if (!VIDEO_TYPES.has(String(file.type || "").toLowerCase())) throw new Error("Format video harus MP4, WebM, atau MOV.");
  if (!file.size || file.size > MAX_REEL_BYTES) throw new Error("Ukuran video maksimal 45 MB.");
  const timestamp = Math.floor(Date.now()/1000), folder = "pasar-umkm/reels-v4";
  const signature = await sha1(`folder=${folder}&timestamp=${timestamp}${apiSecret}`);
  const form = new FormData();
  form.append("file", file, file.name || "reel.mp4"); form.append("api_key", apiKey); form.append("timestamp", String(timestamp)); form.append("folder", folder); form.append("signature", signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/video/upload`, { method:"POST", body:form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.secure_url) throw new Error(data?.error?.message || "Video gagal diunggah.");
  if (Number(data.duration || 0) > MAX_REEL_SECONDS) throw new Error("Durasi Reels maksimal 3 menit.");
  return { url:data.secure_url, publicId:data.public_id || null, duration:Number(data.duration || 0) || null, width:Number(data.width || 0) || null, height:Number(data.height || 0) || null, bytes:Number(data.bytes || 0) || null };
}
async function ownedStore(sql, userId) {
  const rows = await sql`SELECT id,name,logo_url,address,city,verification_status FROM stores WHERE owner_id=${userId} AND is_active=TRUE ORDER BY created_at ASC LIMIT 1`;
  return rows[0] || null;
}
async function validateOwnedProduct(sql, storeId, productId) {
  if (!productId) return null;
  const id = validUuid(productId); if (!id || !storeId) return null;
  const rows = await sql`SELECT id,name,price,thumbnail_url,stock FROM products WHERE id=${id}::uuid AND store_id=${storeId}::uuid AND is_active=TRUE LIMIT 1`;
  return rows[0] || null;
}

async function listFeed(sql, request, url) {
  const viewer = await currentUser(sql, request);
  const rawMode = String(url.searchParams.get("mode") || "for-you").toLowerCase();
  const mode = ["for-you","following","local"].includes(rawMode) ? rawMode : "for-you";
  const city = clean(url.searchParams.get("city") || "Lubuklinggau", 100) || "Lubuklinggau";
  const limit = Math.min(16, Math.max(4, Number(url.searchParams.get("limit") || 8) || 8));
  const offset = decodeOffset(url.searchParams.get("cursor"));
  const viewerId = viewer?.id || null;
  const rows = await sql`
    WITH enriched AS (
      SELECT r.id,r.user_id,r.store_id,r.video_url,r.cover_url,r.caption,r.created_at,r.updated_at,
             r.duration_seconds,r.width,r.height,r.bytes,r.location_text,r.trim_start_seconds,r.trim_end_seconds,
             r.crop_mode,r.audio_mode,r.original_audio_label,r.product_id,r.remix_of_reel_id,r.template_of_reel_id,r.allow_comments,
             u.name AS user_name,u.avatar_url AS user_avatar_url,
             s.name AS store_name,s.logo_url AS store_logo_url,s.city AS store_city,s.address AS store_address,s.verification_status,
             p.name AS product_name,p.price AS product_price,p.thumbnail_url AS product_thumbnail_url,p.stock AS product_stock,p.slug AS product_slug,
             (SELECT COUNT(*)::int FROM reel_likes x WHERE x.reel_id=r.id) AS likes_count,
             (SELECT COUNT(*)::int FROM reel_comments x WHERE x.reel_id=r.id AND x.is_active=TRUE) AS comments_count,
             (SELECT COUNT(*)::int FROM reel_saves x WHERE x.reel_id=r.id) AS saves_count,
             (SELECT COUNT(*)::int FROM reel_reposts x WHERE x.reel_id=r.id) AS reposts_count,
             CASE WHEN ${viewerId}::uuid IS NULL THEN FALSE ELSE EXISTS(SELECT 1 FROM reel_likes x WHERE x.reel_id=r.id AND x.user_id=${viewerId}::uuid) END AS viewer_liked,
             CASE WHEN ${viewerId}::uuid IS NULL THEN FALSE ELSE EXISTS(SELECT 1 FROM reel_saves x WHERE x.reel_id=r.id AND x.user_id=${viewerId}::uuid) END AS viewer_saved,
             CASE WHEN ${viewerId}::uuid IS NULL THEN FALSE ELSE EXISTS(SELECT 1 FROM reel_reposts x WHERE x.reel_id=r.id AND x.user_id=${viewerId}::uuid) END AS viewer_reposted,
             CASE WHEN ${viewerId}::uuid IS NULL THEN FALSE ELSE EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=${viewerId}::uuid AND f.following_id=r.user_id) END AS viewer_follows,
             (LOWER(COALESCE(s.city,''))=LOWER(${city})) AS local_match
      FROM reels r
      JOIN users u ON u.id=r.user_id AND u.is_active=TRUE
      LEFT JOIN stores s ON s.id=r.store_id AND s.is_active=TRUE
      LEFT JOIN products p ON p.id=r.product_id AND p.is_active=TRUE
      WHERE r.is_active=TRUE AND r.visibility='public'
        AND (${viewerId}::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM reel_viewer_preferences vp WHERE vp.reel_id=r.id AND vp.user_id=${viewerId}::uuid AND vp.preference IN ('hidden','not_interested')))
        AND (${mode} <> 'following' OR (${viewerId}::uuid IS NOT NULL AND EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=${viewerId}::uuid AND f.following_id=r.user_id)))
        AND (${mode} <> 'local' OR LOWER(COALESCE(s.city,''))=LOWER(${city}))
    ), ranked AS (
      SELECT *,
        (CASE WHEN viewer_follows THEN 30 ELSE 0 END + CASE WHEN local_match THEN 18 ELSE 0 END
         + LN(1+likes_count)*4 + LN(1+saves_count)*5 + LN(1+comments_count)*3
         + GREATEST(0, 14 - EXTRACT(EPOCH FROM (NOW()-created_at))/86400.0))::numeric(12,4) AS rank_score,
        CASE WHEN viewer_follows THEN 'Karena Anda mengikuti pembuatnya'
             WHEN local_match THEN 'UMKM lokal di area Anda'
             WHEN saves_count>likes_count AND saves_count>0 THEN 'Banyak disimpan pengguna'
             WHEN likes_count+comments_count>=5 THEN 'Sedang mendapat interaksi'
             ELSE 'Reels terbaru dari UMKM' END AS recommendation_reason
      FROM enriched
    )
    SELECT * FROM ranked
    ORDER BY CASE WHEN ${mode}='for-you' THEN rank_score ELSE 0 END DESC, created_at DESC, id DESC
    LIMIT ${limit + 1} OFFSET ${offset}`;
  const hasMore = rows.length > limit;
  const reels = hasMore ? rows.slice(0, limit) : rows;
  return json({ ok:true, mode, count:reels.length, reels, next_cursor:hasMore ? encodeOffset(offset + limit) : null, ranking:{ transparent:true, signals:["following","locality","freshness","likes","comments","saves"], paid_boost:false } });
}

async function reelDetail(sql, request, id) {
  const viewer = await currentUser(sql, request), viewerId = viewer?.id || null;
  const rows = await sql`
    SELECT r.*,u.name AS user_name,u.avatar_url AS user_avatar_url,
      s.name AS store_name,s.logo_url AS store_logo_url,s.city AS store_city,s.address AS store_address,s.verification_status,
      p.name AS product_name,p.price AS product_price,p.thumbnail_url AS product_thumbnail_url,p.stock AS product_stock,p.slug AS product_slug,
      (SELECT COUNT(*)::int FROM reel_likes x WHERE x.reel_id=r.id) AS likes_count,
      (SELECT COUNT(*)::int FROM reel_comments x WHERE x.reel_id=r.id AND x.is_active=TRUE) AS comments_count,
      (SELECT COUNT(*)::int FROM reel_saves x WHERE x.reel_id=r.id) AS saves_count,
      (SELECT COUNT(*)::int FROM reel_reposts x WHERE x.reel_id=r.id) AS reposts_count,
      CASE WHEN ${viewerId}::uuid IS NULL THEN FALSE ELSE EXISTS(SELECT 1 FROM reel_likes x WHERE x.reel_id=r.id AND x.user_id=${viewerId}::uuid) END AS viewer_liked,
      CASE WHEN ${viewerId}::uuid IS NULL THEN FALSE ELSE EXISTS(SELECT 1 FROM reel_saves x WHERE x.reel_id=r.id AND x.user_id=${viewerId}::uuid) END AS viewer_saved,
      CASE WHEN ${viewerId}::uuid IS NULL THEN FALSE ELSE EXISTS(SELECT 1 FROM reel_reposts x WHERE x.reel_id=r.id AND x.user_id=${viewerId}::uuid) END AS viewer_reposted
    FROM reels r JOIN users u ON u.id=r.user_id
    LEFT JOIN stores s ON s.id=r.store_id LEFT JOIN products p ON p.id=r.product_id
    WHERE r.id=${id}::uuid AND r.is_active=TRUE AND (r.visibility='public' OR r.user_id=${viewerId}::uuid) LIMIT 1`;
  return rows[0] || null;
}

async function createReel(sql, request, env, { draft=false }={}) {
  const auth = await requireUser(sql, request); if (auth.response) return auth.response;
  const limited = await enforceV4Limit(request, env, draft ? "draft-upload" : "upload", draft ? 20 : 10, 60*60*1000); if (limited) return limited;
  const form = await request.formData().catch(() => null); if (!form) return fail("Data Reels tidak valid.");
  const file = form.get("file");
  let uploaded;
  try { uploaded = await uploadVideo(file, env); } catch (error) { return fail(error.message || "Video gagal diunggah.", 400, "MEDIA_INVALID"); }
  const store = await ownedStore(sql, auth.user.id);
  const product = await validateOwnedProduct(sql, store?.id, form.get("product_id"));
  const caption = clean(form.get("caption"), 2200);
  const location = clean(form.get("location_text"), 180) || store?.city || null;
  const trimStart = Math.max(0, Number(form.get("trim_start") || 0) || 0);
  const requestedEnd = Number(form.get("trim_end") || 0) || null;
  const trimEnd = requestedEnd && uploaded.duration ? Math.min(requestedEnd, uploaded.duration) : uploaded.duration;
  if (uploaded.duration && (trimStart >= uploaded.duration || (trimEnd && trimEnd <= trimStart))) return fail("Rentang trim video tidak valid.", 400, "INVALID_TRIM");
  const cropMode = form.get("crop_mode") === "contain" ? "contain" : "cover";
  const audioMode = form.get("audio_mode") === "muted" ? "muted" : "original";
  const coverSecond = Math.max(trimStart, Math.min(Number(form.get("cover_second") || trimStart) || trimStart, trimEnd || uploaded.duration || trimStart));
  const coverUrl = cloudinaryCover(env, uploaded.publicId, coverSecond);
  const remixId = validUuid(form.get("remix_of_reel_id"));
  const templateId = validUuid(form.get("template_of_reel_id"));
  if (draft) {
    const rows = await sql`INSERT INTO reel_drafts(user_id,store_id,product_id,video_url,cloudinary_public_id,cover_url,caption,location_text,trim_start_seconds,trim_end_seconds,crop_mode,audio_mode,remix_of_reel_id,template_of_reel_id,duration_seconds,width,height,bytes)
      VALUES(${auth.user.id},${store?.id || null},${product?.id || null},${uploaded.url},${uploaded.publicId},${coverUrl},${caption},${location},${trimStart},${trimEnd},${cropMode},${audioMode},${remixId},${templateId},${uploaded.duration},${uploaded.width},${uploaded.height},${uploaded.bytes}) RETURNING *`;
    return json({ ok:true, draft:rows[0] }, 201);
  }
  const rows = await sql`INSERT INTO reels(user_id,store_id,video_url,cloudinary_public_id,caption,product_id,cover_url,duration_seconds,width,height,bytes,location_text,trim_start_seconds,trim_end_seconds,crop_mode,audio_mode,original_audio_label,remix_of_reel_id,template_of_reel_id,allow_comments,visibility)
    VALUES(${auth.user.id},${store?.id || null},${uploaded.url},${uploaded.publicId},${caption},${product?.id || null},${coverUrl},${uploaded.duration},${uploaded.width},${uploaded.height},${uploaded.bytes},${location},${trimStart},${trimEnd},${cropMode},${audioMode},'Original audio',${remixId},${templateId},TRUE,'public') RETURNING *`;
  return json({ ok:true, reel:{...rows[0], user_name:auth.user.name, user_avatar_url:auth.user.avatar_url, store_name:store?.name || null, product_name:product?.name || null, product_price:product?.price || null, likes_count:0,comments_count:0,saves_count:0,reposts_count:0,viewer_liked:false,viewer_saved:false,viewer_reposted:false} }, 201);
}

async function updateOrDeleteReel(sql, request, id) {
  const auth = await requireUser(sql, request); if (auth.response) return auth.response;
  if (request.method === "DELETE") {
    const rows = await sql`UPDATE reels SET is_active=FALSE,updated_at=NOW() WHERE id=${id}::uuid AND user_id=${auth.user.id} RETURNING id`;
    return rows[0] ? json({ok:true,deleted:true}) : fail("Reels tidak ditemukan atau bukan milik Anda.",404,"NOT_FOUND");
  }
  const body = await request.json().catch(() => null); if (!body) return fail("Data perubahan tidak valid.");
  const store = await ownedStore(sql, auth.user.id);
  const product = body.product_id === null ? null : await validateOwnedProduct(sql, store?.id, body.product_id);
  const caption = clean(body.caption,2200);
  const location = clean(body.location_text,180);
  const allowComments = body.allow_comments !== false;
  const rows = await sql`UPDATE reels SET caption=${caption},location_text=${location},product_id=${product?.id || null},allow_comments=${allowComments},updated_at=NOW() WHERE id=${id}::uuid AND user_id=${auth.user.id} AND is_active=TRUE RETURNING *`;
  return rows[0] ? json({ok:true,reel:rows[0]}) : fail("Reels tidak ditemukan atau bukan milik Anda.",404,"NOT_FOUND");
}

async function toggleLike(sql, request, id) {
  const auth = await requireUser(sql, request); if (auth.response) return auth.response;
  if (request.method === "POST") await sql`INSERT INTO reel_likes(reel_id,user_id) VALUES(${id}::uuid,${auth.user.id}) ON CONFLICT DO NOTHING`;
  else await sql`DELETE FROM reel_likes WHERE reel_id=${id}::uuid AND user_id=${auth.user.id}`;
  const count = await sql`SELECT COUNT(*)::int AS count FROM reel_likes WHERE reel_id=${id}::uuid`;
  return json({ok:true,liked:request.method==="POST",likes_count:count[0]?.count || 0});
}
async function toggleSimple(sql, request, id, table) {
  const auth = await requireUser(sql, request); if (auth.response) return auth.response;
  if (table === "reel_saves") {
    if (request.method === "POST") await sql`INSERT INTO reel_saves(reel_id,user_id) VALUES(${id}::uuid,${auth.user.id}) ON CONFLICT DO NOTHING`;
    else await sql`DELETE FROM reel_saves WHERE reel_id=${id}::uuid AND user_id=${auth.user.id}`;
    const count=await sql`SELECT COUNT(*)::int AS count FROM reel_saves WHERE reel_id=${id}::uuid`;
    return json({ok:true,saved:request.method==="POST",saves_count:count[0]?.count || 0});
  }
  if (request.method === "POST") await sql`INSERT INTO reel_reposts(reel_id,user_id) VALUES(${id}::uuid,${auth.user.id}) ON CONFLICT DO NOTHING`;
  else await sql`DELETE FROM reel_reposts WHERE reel_id=${id}::uuid AND user_id=${auth.user.id}`;
  const count=await sql`SELECT COUNT(*)::int AS count FROM reel_reposts WHERE reel_id=${id}::uuid`;
  return json({ok:true,reposted:request.method==="POST",reposts_count:count[0]?.count || 0});
}

async function comments(sql, request, id, url) {
  const reelRows = await sql`SELECT id,user_id,allow_comments FROM reels WHERE id=${id}::uuid AND is_active=TRUE LIMIT 1`; const reel=reelRows[0];
  if (!reel) return fail("Reels tidak ditemukan.",404,"NOT_FOUND");
  if (request.method === "GET") {
    const limit=Math.min(50,Math.max(10,Number(url.searchParams.get("limit")||30)||30));
    const beforeRaw=clean(url.searchParams.get("before"),80); const before=beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw).toISOString() : new Date("9999-12-31T23:59:59.999Z").toISOString();
    const rows=await sql`SELECT rc.id,rc.reel_id,rc.user_id,rc.body,rc.created_at,u.name AS user_name,u.avatar_url AS user_avatar_url FROM reel_comments rc JOIN users u ON u.id=rc.user_id AND u.is_active=TRUE WHERE rc.reel_id=${id}::uuid AND rc.is_active=TRUE AND rc.created_at<${before}::timestamptz ORDER BY rc.created_at DESC,rc.id DESC LIMIT ${limit+1}`;
    const hasMore=rows.length>limit, page=hasMore?rows.slice(0,limit):rows;
    return json({ok:true,comments:page,count:page.length,next_before:hasMore?page[page.length-1]?.created_at:null});
  }
  if (!reel.allow_comments) return fail("Komentar dinonaktifkan oleh pembuat Reels.",409,"COMMENTS_DISABLED");
  const auth=await requireUser(sql,request); if(auth.response)return auth.response;
  const body=await request.json().catch(()=>null), text=clean(body?.body,1000); if(!text)return fail("Komentar tidak boleh kosong.");
  const rows=await sql`INSERT INTO reel_comments(reel_id,user_id,body) VALUES(${id}::uuid,${auth.user.id},${text}) RETURNING id,reel_id,user_id,body,created_at`;
  return json({ok:true,comment:{...rows[0],user_name:auth.user.name,user_avatar_url:auth.user.avatar_url}},201);
}

async function preference(sql, request, id) {
  const auth=await requireUser(sql,request); if(auth.response)return auth.response;
  const body=await request.json().catch(()=>null); const value=["not_interested","hidden"].includes(body?.preference)?body.preference:null;
  if(!value)return fail("Preferensi tidak valid.");
  await sql`INSERT INTO reel_viewer_preferences(reel_id,user_id,preference) VALUES(${id}::uuid,${auth.user.id},${value}) ON CONFLICT(reel_id,user_id) DO UPDATE SET preference=EXCLUDED.preference,updated_at=NOW()`;
  return json({ok:true,preference:value});
}
async function report(sql, request, id) {
  const auth=await requireUser(sql,request); if(auth.response)return auth.response;
  const body=await request.json().catch(()=>null), category=String(body?.category||""); const details=clean(body?.details,1000);
  if(!REPORT_CATEGORIES.has(category))return fail("Kategori laporan tidak valid.");
  try {
    const rows=await sql`INSERT INTO reel_reports(reel_id,reporter_user_id,category,details) VALUES(${id}::uuid,${auth.user.id},${category},${details}) RETURNING id,status,created_at`;
    return json({ok:true,report:rows[0]},201);
  } catch(error) { if(error?.code==="23505")return fail("Laporan aktif untuk Reels ini sudah ada.",409,"REPORT_ALREADY_OPEN"); throw error; }
}

async function recordEvents(sql, request) {
  const viewer=await currentUser(sql,request); const body=await request.json().catch(()=>null); const events=Array.isArray(body?.events)?body.events.slice(0,20):[];
  if(!events.length)return fail("Event Reels kosong.");
  const anonymous=viewer?null:(await digest(request.headers.get("X-Reel-Anonymous-Key") || clientIp(request))).slice(0,48);
  let accepted=0;
  for(const item of events){ const id=validUuid(item?.reel_id),type=String(item?.event_type||""); if(!id||!EVENT_TYPES.has(type))continue; const watch=Math.max(0,Math.min(3600000,Number(item?.watch_ms||0)||0)); const metadata=JSON.stringify(item?.metadata && typeof item.metadata==="object" ? item.metadata : {}); await sql`INSERT INTO reel_events(reel_id,user_id,anonymous_key_hash,event_type,watch_ms,metadata) VALUES(${id}::uuid,${viewer?.id || null},${anonymous},${type},${watch},CAST(${metadata} AS jsonb))`; accepted++; }
  return json({ok:true,accepted});
}

async function creatorProducts(sql, request) {
  const auth=await requireUser(sql,request); if(auth.response)return auth.response; const store=await ownedStore(sql,auth.user.id);
  if(!store)return json({ok:true,store:null,products:[]});
  const products=await sql`SELECT id,name,price,stock,thumbnail_url,slug FROM products WHERE store_id=${store.id} AND is_active=TRUE ORDER BY updated_at DESC LIMIT 100`;
  return json({ok:true,store,products});
}
async function listDrafts(sql, request) {
  const auth=await requireUser(sql,request); if(auth.response)return auth.response;
  const rows=await sql`SELECT d.*,p.name AS product_name,p.price AS product_price FROM reel_drafts d LEFT JOIN products p ON p.id=d.product_id WHERE d.user_id=${auth.user.id} ORDER BY d.updated_at DESC LIMIT 50`;
  return json({ok:true,drafts:rows});
}
async function deleteDraft(sql, request, id) {
  const auth=await requireUser(sql,request); if(auth.response)return auth.response; const rows=await sql`DELETE FROM reel_drafts WHERE id=${id}::uuid AND user_id=${auth.user.id} RETURNING id`; return rows[0]?json({ok:true,deleted:true}):fail("Draft tidak ditemukan.",404,"NOT_FOUND");
}
async function analytics(sql, request) {
  const auth=await requireUser(sql,request); if(auth.response)return auth.response;
  const rows=await sql`
    SELECT r.id,r.caption,r.cover_url,r.created_at,
      COUNT(*) FILTER(WHERE e.event_type='impression')::int AS impressions,
      COUNT(*) FILTER(WHERE e.event_type='view')::int AS views,
      COUNT(*) FILTER(WHERE e.event_type='complete')::int AS completions,
      COUNT(*) FILTER(WHERE e.event_type='replay')::int AS replays,
      COALESCE(SUM(e.watch_ms) FILTER(WHERE e.event_type='watch'),0)::bigint AS watch_ms,
      COUNT(*) FILTER(WHERE e.event_type='product_click')::int AS product_clicks,
      COUNT(*) FILTER(WHERE e.event_type='chat_click')::int AS chat_clicks,
      COUNT(*) FILTER(WHERE e.event_type='add_to_cart')::int AS add_to_cart,
      COUNT(*) FILTER(WHERE e.event_type='order')::int AS orders,
      (SELECT COUNT(*)::int FROM reel_likes x WHERE x.reel_id=r.id) AS likes,
      (SELECT COUNT(*)::int FROM reel_saves x WHERE x.reel_id=r.id) AS saves,
      (SELECT COUNT(*)::int FROM reel_reposts x WHERE x.reel_id=r.id) AS reposts
    FROM reels r LEFT JOIN reel_events e ON e.reel_id=r.id
    WHERE r.user_id=${auth.user.id} AND r.is_active=TRUE
    GROUP BY r.id ORDER BY r.created_at DESC LIMIT 100`;
  return json({ok:true,reels:rows});
}

async function adminReports(request, env, url) {
  const access=await requireAdminPermission(request,env,"reports.view"); if(!access.ok)return access.response;
  const status=clean(url.searchParams.get("status"),24) || "open";
  const rows=await access.sql`SELECT rr.id,rr.reel_id,rr.category,rr.details,rr.status,rr.created_at,rr.updated_at,u.name AS reporter_name,r.caption,r.cover_url,r.video_url,creator.name AS creator_name FROM reel_reports rr JOIN users u ON u.id=rr.reporter_user_id JOIN reels r ON r.id=rr.reel_id JOIN users creator ON creator.id=r.user_id WHERE (${status}='all' OR rr.status=${status}) ORDER BY rr.created_at DESC LIMIT 100`;
  return json({ok:true,reports:rows});
}
async function resolveAdminReport(request, env, id) {
  const access=await requireAdminPermission(request,env,"reports.resolve"); if(!access.ok)return access.response;
  const body=await request.json().catch(()=>null), status=["resolved","dismissed"].includes(body?.status)?body.status:null, note=clean(body?.resolution_note,1000);
  if(!status||!note)return fail("Status dan catatan penyelesaian wajib diisi.");
  const rows=await access.sql`UPDATE reel_reports SET status=${status},resolution_note=${note},resolved_by_admin_id=${access.session.id},resolved_at=NOW(),updated_at=NOW() WHERE id=${id}::uuid AND status IN('open','reviewing') RETURNING *`;
  if(!rows[0])return fail("Laporan tidak ditemukan atau sudah selesai.",404,"NOT_FOUND");
  if(body?.deactivate_reel===true) await access.sql`UPDATE reels SET is_active=FALSE,updated_at=NOW() WHERE id=${rows[0].reel_id}`;
  return json({ok:true,report:rows[0],reel_deactivated:body?.deactivate_reel===true});
}

async function sharePage(sql, id, request) {
  const rows=await sql`SELECT r.id,r.caption,r.video_url,r.cover_url,u.name AS creator_name,s.name AS store_name,p.name AS product_name,p.price AS product_price FROM reels r JOIN users u ON u.id=r.user_id LEFT JOIN stores s ON s.id=r.store_id LEFT JOIN products p ON p.id=r.product_id WHERE r.id=${id}::uuid AND r.is_active=TRUE AND r.visibility='public' LIMIT 1`;
  const reel=rows[0]; if(!reel)return new Response("Reels tidak ditemukan",{status:404,headers:{"Content-Type":"text/plain; charset=utf-8"}});
  const origin=new URL(request.url).origin, target=`${origin}/#reel=${id}`;
  const title=clean(reel.product_name ? `${reel.product_name} · ${reel.store_name || reel.creator_name}` : `Reels · ${reel.store_name || reel.creator_name}`,120) || "Reels Pasar UMKM";
  const description=clean(reel.caption,180) || "Temukan produk dan cerita UMKM lokal di Pasar UMKM.";
  const image=reel.cover_url || "";
  const html=`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta property="og:type" content="video.other"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}">${image?`<meta property="og:image" content="${escapeHtml(image)}">`:""}<meta property="og:video" content="${escapeHtml(reel.video_url)}"><meta property="og:url" content="${escapeHtml(request.url)}"><meta name="twitter:card" content="summary_large_image"><link rel="canonical" href="${escapeHtml(request.url)}"><meta http-equiv="refresh" content="0;url=${escapeHtml(target)}"></head><body><p><a href="${escapeHtml(target)}">Buka Reels di Pasar UMKM</a></p></body></html>`;
  return new Response(html,{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"public, max-age=300"}});
}

export async function handleReelsCommerceV4Api(request, env) {
  const url=new URL(request.url); const path=url.pathname;
  if(!path.startsWith("/api/reels/v4")&&!path.startsWith("/api/admin/reels/v4")&&!/^\/r\/[0-9a-f-]{36}$/i.test(path))return null;
  try {
    const sql=neon(env.DATABASE_URL);
    if(!(await ensureV4(sql))) return fail("Reels Commerce V4 belum siap di database.",503,"REELS_V4_SCHEMA_NOT_READY");
    const share=path.match(/^\/r\/([0-9a-f-]{36})$/i); if(share&&request.method==="GET")return sharePage(sql,share[1],request);
    if(path==="/api/reels/v4/feed"&&request.method==="GET")return listFeed(sql,request,url);
    if(path==="/api/reels/v4/creator-products"&&request.method==="GET")return creatorProducts(sql,request);
    if(path==="/api/reels/v4/events"&&request.method==="POST"){const limited=await enforceV4Limit(request,env,"events",240,10*60*1000,"EDGE_READ_LIMITER");return limited||recordEvents(sql,request);}
    if(path==="/api/reels/v4/analytics"&&request.method==="GET")return analytics(sql,request);
    if(path==="/api/reels/v4/drafts"&&request.method==="GET")return listDrafts(sql,request);
    if(path==="/api/reels/v4/drafts"&&request.method==="POST")return createReel(sql,request,env,{draft:true});
    if(path==="/api/reels/v4"&&request.method==="POST")return createReel(sql,request,env);
    if(path==="/api/admin/reels/v4/reports"&&request.method==="GET")return adminReports(request,env,url);
    const adminResolve=path.match(/^\/api\/admin\/reels\/v4\/reports\/([0-9a-f-]{36})\/resolve$/i); if(adminResolve&&request.method==="POST")return resolveAdminReport(request,env,adminResolve[1]);
    const draftDelete=path.match(/^\/api\/reels\/v4\/drafts\/([0-9a-f-]{36})$/i); if(draftDelete&&request.method==="DELETE")return deleteDraft(sql,request,draftDelete[1]);
    const commentsMatch=path.match(/^\/api\/reels\/v4\/([0-9a-f-]{36})\/comments$/i); if(commentsMatch&&["GET","POST"].includes(request.method))return comments(sql,request,commentsMatch[1],url);
    const likeMatch=path.match(/^\/api\/reels\/v4\/([0-9a-f-]{36})\/like$/i); if(likeMatch&&["POST","DELETE"].includes(request.method))return toggleLike(sql,request,likeMatch[1]);
    const saveMatch=path.match(/^\/api\/reels\/v4\/([0-9a-f-]{36})\/save$/i); if(saveMatch&&["POST","DELETE"].includes(request.method))return toggleSimple(sql,request,saveMatch[1],"reel_saves");
    const repostMatch=path.match(/^\/api\/reels\/v4\/([0-9a-f-]{36})\/repost$/i); if(repostMatch&&["POST","DELETE"].includes(request.method))return toggleSimple(sql,request,repostMatch[1],"reel_reposts");
    const prefMatch=path.match(/^\/api\/reels\/v4\/([0-9a-f-]{36})\/preference$/i); if(prefMatch&&request.method==="POST")return preference(sql,request,prefMatch[1]);
    const reportMatch=path.match(/^\/api\/reels\/v4\/([0-9a-f-]{36})\/report$/i); if(reportMatch&&request.method==="POST"){const limited=await enforceV4Limit(request,env,"report",20,60*60*1000);return limited||report(sql,request,reportMatch[1]);}
    const detailMatch=path.match(/^\/api\/reels\/v4\/([0-9a-f-]{36})$/i);
    if(detailMatch&&request.method==="GET"){const reel=await reelDetail(sql,request,detailMatch[1]);return reel?json({ok:true,reel}):fail("Reels tidak ditemukan.",404,"NOT_FOUND");}
    if(detailMatch&&["PATCH","DELETE"].includes(request.method))return updateOrDeleteReel(sql,request,detailMatch[1]);
    return fail("Endpoint Reels V4 tidak ditemukan.",404,"API_NOT_FOUND");
  } catch(error) {
    console.error("Reels Commerce V4 API error",error);
    return fail("Reels belum dapat diproses.",500,"REELS_V4_ERROR");
  }
}

export const reelsCommerceV4Policy=Object.freeze({version:"4.0",max_video_bytes:MAX_REEL_BYTES,max_duration_seconds:MAX_REEL_SECONDS,ranking_paid_boost:false,analytics_event_types:[...EVENT_TYPES],report_categories:[...REPORT_CATEGORIES]});
