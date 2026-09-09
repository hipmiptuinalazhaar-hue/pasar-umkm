import { neon } from "@neondatabase/serverless";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const BASE_MIGRATION = "2026-09-09-reels-commerce-v4";
const ADVANCED_MIGRATION = "2026-09-09-reels-advanced-creator-v4";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSITIONS = new Set(["top", "center", "bottom"]);
const SIZES = new Set(["small", "medium", "large"]);
const BUILTIN_AUDIO = new Set(["original", "muted"]);

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function fail(error, status = 400, code = "INVALID_REQUEST") {
  return json({ ok: false, error, code }, status);
}

function getCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const item of raw.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return parts.join("=") || null;
  }
  return null;
}

function uuid(value) {
  const id = String(value || "").trim().toLowerCase();
  return UUID.test(id) ? id : null;
}

async function currentUser(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const rows = await sql`
    SELECT u.id, u.name, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = encode(digest(${token}, 'sha256'), 'hex')
      AND s.expires_at > NOW()
      AND u.is_active = TRUE
    LIMIT 1
  `;
  return rows[0] || null;
}

async function ready(sql) {
  const rows = await sql`
    SELECT COUNT(*)::int AS count
    FROM schema_migrations
    WHERE version = ANY(${[BASE_MIGRATION, ADVANCED_MIGRATION]}::text[])
  `;
  return Number(rows[0]?.count || 0) === 2;
}

function parseOverlaySource(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeOverlays(value) {
  const source = parseOverlaySource(value);
  if (source.length > 6) throw new Error("Maksimal 6 teks overlay per Reels.");
  return source.map((item, index) => {
    const text = String(item?.text || "").trim().slice(0, 120);
    if (!text) throw new Error(`Teks overlay ${index + 1} kosong.`);
    const position = POSITIONS.has(String(item?.position || "")) ? String(item.position) : "center";
    const size = SIZES.has(String(item?.size || "")) ? String(item.size) : "medium";
    const start = Math.max(0, Math.min(180, Number(item?.start || 0) || 0));
    const requestedEnd = Number(item?.end);
    const end = Number.isFinite(requestedEnd) && requestedEnd > start
      ? Math.min(180, requestedEnd)
      : Math.min(180, start + 5);
    if (end <= start) throw new Error(`Durasi overlay ${index + 1} tidak valid.`);
    return { text, position, size, start, end };
  });
}

async function resolveAudio(sql, requestedKey) {
  const key = String(requestedKey || "original").trim().toLowerCase();
  if (BUILTIN_AUDIO.has(key)) {
    return {
      key,
      label: key === "muted" ? "Tanpa audio" : "Original audio",
      mode: key === "muted" ? "muted" : "original",
      synthetic: false
    };
  }
  const rows = await sql`
    SELECT track_key, label, bpm, synth_profile, license_type, attribution
    FROM reel_audio_library
    WHERE track_key=${key} AND is_active=TRUE
    LIMIT 1
  `;
  if (!rows[0]) throw new Error("Audio library tidak valid atau sudah tidak aktif.");
  return {
    key: rows[0].track_key,
    label: rows[0].label,
    mode: "muted",
    synthetic: true,
    bpm: rows[0].bpm,
    synth_profile: rows[0].synth_profile,
    license_type: rows[0].license_type,
    attribution: rows[0].attribution
  };
}

async function audioLibrary(sql) {
  const rows = await sql`
    SELECT track_key, label, description, bpm, synth_profile, license_type, attribution
    FROM reel_audio_library
    WHERE is_active=TRUE
    ORDER BY sort_order ASC, label ASC
  `;
  return json({
    ok: true,
    tracks: [
      { track_key: "original", label: "Original audio", description: "Gunakan audio asli dari video.", license_type: "creator-owned" },
      { track_key: "muted", label: "Tanpa audio", description: "Publikasikan video tanpa suara.", license_type: "none" },
      ...rows
    ],
    policy: {
      external_copyrighted_catalog: false,
      platform_generated_tracks: true,
      disclosure: "Track Pasar dibuat secara sintetis oleh platform dan tidak mengambil musik pihak ketiga."
    }
  });
}

async function metadata(sql, request, url) {
  const viewer = await currentUser(sql, request);
  const ids = String(url.searchParams.get("ids") || "")
    .split(",")
    .map(uuid)
    .filter(Boolean)
    .slice(0, 30);
  if (!ids.length) return json({ ok: true, metadata: [] });
  const rows = await sql`
    SELECT r.id, r.user_id, r.text_overlays, r.audio_track_key, r.audio_track_label, r.audio_mix,
           r.audio_mode, r.template_of_reel_id, r.remix_of_reel_id,
           al.bpm, al.synth_profile, al.license_type, al.attribution
    FROM reels r
    LEFT JOIN reel_audio_library al ON al.track_key=r.audio_track_key AND al.is_active=TRUE
    WHERE r.id = ANY(${ids}::uuid[])
      AND r.is_active=TRUE
      AND (r.visibility='public' OR r.user_id=${viewer?.id || null}::uuid)
  `;
  return json({ ok: true, metadata: rows });
}

async function saveReelAdvanced(sql, request, reelId) {
  const user = await currentUser(sql, request);
  if (!user) return fail("Silakan masuk terlebih dahulu.", 401, "AUTH_REQUIRED");
  const body = await request.json().catch(() => null);
  if (!body) return fail("Data advanced creator tidak valid.");
  let overlays;
  let audio;
  try {
    overlays = normalizeOverlays(body.text_overlays || []);
    audio = await resolveAudio(sql, body.audio_track_key || "original");
  } catch (error) {
    return fail(error.message || "Data advanced creator tidak valid.");
  }
  const mix = Math.max(0, Math.min(1, Number(body.audio_mix ?? 1) || 0));
  const rows = await sql`
    UPDATE reels
    SET text_overlays=CAST(${JSON.stringify(overlays)} AS jsonb),
        audio_track_key=${audio.synthetic ? audio.key : null},
        audio_track_label=${audio.synthetic ? audio.label : null},
        audio_mix=${mix},
        audio_mode=${audio.mode},
        original_audio_label=${audio.synthetic ? audio.label : "Original audio"},
        updated_at=NOW()
    WHERE id=${reelId}::uuid AND user_id=${user.id} AND is_active=TRUE
    RETURNING id, text_overlays, audio_track_key, audio_track_label, audio_mix, audio_mode, original_audio_label
  `;
  if (!rows[0]) return fail("Reels tidak ditemukan atau bukan milik Anda.", 404, "NOT_FOUND");
  return json({ ok: true, reel: rows[0], audio });
}

async function saveDraftAdvanced(sql, request, draftId) {
  const user = await currentUser(sql, request);
  if (!user) return fail("Silakan masuk terlebih dahulu.", 401, "AUTH_REQUIRED");
  const body = await request.json().catch(() => null);
  if (!body) return fail("Data advanced creator tidak valid.");
  let overlays;
  let audio;
  try {
    overlays = normalizeOverlays(body.text_overlays || []);
    audio = await resolveAudio(sql, body.audio_track_key || "original");
  } catch (error) {
    return fail(error.message || "Data advanced creator tidak valid.");
  }
  const mix = Math.max(0, Math.min(1, Number(body.audio_mix ?? 1) || 0));
  const rows = await sql`
    UPDATE reel_drafts
    SET text_overlays=CAST(${JSON.stringify(overlays)} AS jsonb),
        audio_track_key=${audio.synthetic ? audio.key : null},
        audio_track_label=${audio.synthetic ? audio.label : null},
        audio_mix=${mix},
        audio_mode=${audio.mode},
        updated_at=NOW()
    WHERE id=${draftId}::uuid AND user_id=${user.id}
    RETURNING id, text_overlays, audio_track_key, audio_track_label, audio_mix, audio_mode
  `;
  if (!rows[0]) return fail("Draft tidak ditemukan atau bukan milik Anda.", 404, "NOT_FOUND");
  return json({ ok: true, draft: rows[0], audio });
}

export async function handleReelsAdvancedV4Api(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/api/reels/v4/advanced")) return null;
  try {
    const sql = neon(env.DATABASE_URL);
    if (!(await ready(sql))) return fail("Advanced Creator Reels V4 belum siap.", 503, "REELS_ADVANCED_SCHEMA_NOT_READY");
    if (path === "/api/reels/v4/advanced/audio-library" && request.method === "GET") return audioLibrary(sql);
    if (path === "/api/reels/v4/advanced/metadata" && request.method === "GET") return metadata(sql, request, url);
    const reelMatch = path.match(/^\/api\/reels\/v4\/advanced\/reels\/([0-9a-f-]{36})$/i);
    if (reelMatch && request.method === "PUT") return saveReelAdvanced(sql, request, reelMatch[1]);
    const draftMatch = path.match(/^\/api\/reels\/v4\/advanced\/drafts\/([0-9a-f-]{36})$/i);
    if (draftMatch && request.method === "PUT") return saveDraftAdvanced(sql, request, draftMatch[1]);
    return fail("Endpoint Advanced Creator Reels V4 tidak ditemukan.", 404, "API_NOT_FOUND");
  } catch (error) {
    console.error("Reels Advanced V4 API error:", error);
    return fail("Advanced Creator Reels sedang mengalami gangguan.", 500, "REELS_ADVANCED_ERROR");
  }
}
