const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_LEGACY_LEAF = /^[A-Za-z0-9_-]{6,180}$/;
const CHAT_ROOT = ["pasar-umkm", "chat"];

function normalizedUuid(value) {
  const id = String(value || "").trim().toLowerCase();
  return UUID_PATTERN.test(id) ? id : null;
}

function decodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

export function chatMediaFolder(conversationId, userId) {
  const conversation = normalizedUuid(conversationId);
  const user = normalizedUuid(userId);
  if (!conversation || !user) return null;
  return `${CHAT_ROOT.join("/")}/${conversation}/${user}`;
}

export async function sha1Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function parseOwnedChatMediaUrl(
  value,
  env,
  { conversationId, userId, kind = null, allowLegacy = false } = {}
) {
  const cloudName = String(env?.CLOUDINARY_CLOUD_NAME || "").trim();
  const conversation = normalizedUuid(conversationId);
  const user = normalizedUuid(userId);

  if (!cloudName || !user) return null;
  if (!allowLegacy && !conversation) return null;

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
    .map(decodePathSegment);

  if (segments.length < 8) return null;
  if (segments[0] !== cloudName) return null;

  const resourceType = segments[1];
  const deliveryType = segments[2];
  if (!["image", "video"].includes(resourceType) || deliveryType !== "upload") {
    return null;
  }

  if (kind === "image" && resourceType !== "image") return null;
  if (kind === "audio" && resourceType !== "video") return null;

  let assetSegments = segments.slice(3);
  if (/^v\d+$/.test(assetSegments[0] || "")) {
    assetSegments = assetSegments.slice(1);
  }

  if (assetSegments.length < 4) return null;
  if (assetSegments[0] !== CHAT_ROOT[0] || assetSegments[1] !== CHAT_ROOT[1]) {
    return null;
  }

  let legacy = false;
  let ownerIndex;
  let leafIndex;

  if (
    conversation &&
    assetSegments[2] === conversation &&
    assetSegments[3] === user
  ) {
    ownerIndex = 3;
    leafIndex = 4;
  } else if (
    allowLegacy &&
    assetSegments[2] === user
  ) {
    legacy = true;
    ownerIndex = 2;
    leafIndex = 3;
  } else {
    return null;
  }

  if (ownerIndex < 0 || assetSegments.length !== leafIndex + 1) return null;

  const encodedLeaf = assetSegments[leafIndex];
  const dot = encodedLeaf.lastIndexOf(".");
  const leaf = dot > 0 ? encodedLeaf.slice(0, dot) : encodedLeaf;

  if (legacy) {
    if (!SAFE_LEGACY_LEAF.test(leaf)) return null;
  } else if (!UUID_PATTERN.test(leaf)) {
    return null;
  }

  const publicIdSegments = assetSegments.slice(0, leafIndex);
  publicIdSegments.push(leaf);
  const publicId = publicIdSegments.join("/");

  return {
    url: parsed.toString(),
    publicId,
    resourceType,
    legacy,
    conversationId: conversation,
    userId: user
  };
}

export async function destroyOwnedChatMedia(env, descriptor) {
  if (!descriptor?.publicId || !descriptor?.resourceType) {
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

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${descriptor.resourceType}/destroy`;
  const response = await fetch(endpoint, { method: "POST", body: form });
  const data = await response.json().catch(() => ({}));
  const result = String(data?.result || "").toLowerCase();

  if (response.ok && (result === "ok" || result === "not found")) {
    return { ok: true, result };
  }

  console.error("Chat media provider cleanup failed:", {
    status: response.status,
    resource_type: descriptor.resourceType
  });

  return { ok: false, reason: "provider_cleanup_failed" };
}
