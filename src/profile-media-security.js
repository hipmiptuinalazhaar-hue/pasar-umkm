const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_ROOT = ["pasar-umkm", "profile"];

function normalizedUuid(value) {
  const id = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}

function decodeSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

export function profileMediaFolder(userId) {
  const user = normalizedUuid(userId);
  if (!user) return null;
  return `${PROFILE_ROOT.join("/")}/${user}`;
}

export async function sha1Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function parseOwnedProfileMediaUrl(value, env, userId) {
  const cloudName = String(env?.CLOUDINARY_CLOUD_NAME || "").trim();
  const user = normalizedUuid(userId);
  if (!cloudName || !user) return null;

  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    return null;
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "res.cloudinary.com" ||
    parsed.username ||
    parsed.password
  ) {
    return null;
  }

  const segments = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map(decodeSegment);

  if (segments.length < 8) return null;
  if (segments[0] !== cloudName || segments[1] !== "image" || segments[2] !== "upload") {
    return null;
  }

  let assetSegments = segments.slice(3);
  if (/^v\d+$/.test(assetSegments[0] || "")) {
    assetSegments = assetSegments.slice(1);
  }

  if (
    assetSegments.length !== 4 ||
    assetSegments[0] !== PROFILE_ROOT[0] ||
    assetSegments[1] !== PROFILE_ROOT[1] ||
    assetSegments[2] !== user
  ) {
    return null;
  }

  const encodedLeaf = assetSegments[3];
  const dot = encodedLeaf.lastIndexOf(".");
  const leaf = dot > 0 ? encodedLeaf.slice(0, dot) : encodedLeaf;
  if (!UUID_PATTERN.test(leaf)) return null;

  return {
    url: parsed.toString(),
    publicId: `${PROFILE_ROOT.join("/")}/${user}/${leaf}`,
    userId: user
  };
}

export async function destroyOwnedProfileMedia(env, descriptor) {
  if (!descriptor?.publicId) {
    return { ok: false, reason: "invalid_descriptor" };
  }

  const cloudName = String(env?.CLOUDINARY_CLOUD_NAME || "").trim();
  const apiKey = String(env?.CLOUDINARY_API_KEY || "").trim();
  const apiSecret = String(env?.CLOUDINARY_API_SECRET || "").trim();

  if (!cloudName || !apiKey || !apiSecret) {
    return { ok: false, reason: "provider_not_configured" };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sha1Hex(
    `invalidate=true&public_id=${descriptor.publicId}&timestamp=${timestamp}${apiSecret}`
  );

  const form = new FormData();
  form.append("public_id", descriptor.publicId);
  form.append("timestamp", String(timestamp));
  form.append("api_key", apiKey);
  form.append("invalidate", "true");
  form.append("signature", signature);

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/destroy`;
  const response = await fetch(endpoint, { method: "POST", body: form });
  const data = await response.json().catch(() => ({}));
  const result = String(data?.result || "").toLowerCase();

  if (response.ok && (result === "ok" || result === "not found")) {
    return { ok: true, result };
  }

  console.error("Profile media provider cleanup failed:", { status: response.status });
  return { ok: false, reason: "provider_cleanup_failed" };
}
