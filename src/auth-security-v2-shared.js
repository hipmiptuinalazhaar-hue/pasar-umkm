import { assertAuthEmailConfigured } from "./auth-email.js";

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_SECONDS = 60;
export const OTP_MAX_RESENDS = 5;
export const RESET_TOKEN_TTL_MINUTES = 10;
export const RECOVERY_MESSAGE = "Jika email tersebut terdaftar, kode pemulihan telah dikirim.";
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const textEncoder = new TextEncoder();

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function validEmail(email) {
  return String(email || "").length <= 255 && EMAIL_PATTERN.test(String(email || ""));
}

export function validatePassword(password) {
  const passwordBytes = textEncoder.encode(String(password || "")).length;
  if (passwordBytes < 8) return "Kata sandi minimal 8 karakter.";
  if (passwordBytes > 72) return "Kata sandi terlalu panjang.";
  return null;
}

export function maskedEmail(email) {
  const [local = "", domain = ""] = String(email || "").split("@");
  if (!local || !domain) return "email Anda";
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(2, Math.min(6, local.length - visible.length)))}@${domain}`;
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function randomToken(byteLength = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export function createOtp() {
  const range = 1_000_000;
  const ceiling = Math.floor(0x100000000 / range) * range;
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= ceiling);
  return String(values[0] % range).padStart(6, "0");
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(String(value || "")));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret, value) {
  const normalized = String(secret || "");
  if (normalized.length < 32) throw new Error("AUTH_OTP_PEPPER belum dikonfigurasi dengan aman.");
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(normalized),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(String(value || "")));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function otpHash(env, challengeId, purpose, code) {
  return hmacHex(env?.AUTH_OTP_PEPPER, `${purpose}:${challengeId}:${code}`);
}

export function constantTimeEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

function requestId(request) {
  return String(request.headers.get("CF-Ray") || request.headers.get("X-Request-Id") || "").slice(0, 160) || null;
}

async function requestIpHash(request) {
  const value = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
  return sha256Hex(value);
}

export async function auditAuth(sql, request, { userId = null, email = "", eventType, outcome, metadata = {} }) {
  try {
    const emailHash = email ? await sha256Hex(normalizeEmail(email)) : null;
    const ipHash = await requestIpHash(request);
    const safeMetadata = JSON.stringify(metadata && typeof metadata === "object" ? metadata : {});
    await sql`
      INSERT INTO user_auth_audit_events (
        user_id, email_hash, event_type, outcome, request_id, ip_hash, metadata
      ) VALUES (
        ${userId}, ${emailHash}, ${eventType}, ${outcome}, ${requestId(request)}, ${ipHash}, ${safeMetadata}::jsonb
      )
    `;
  } catch (error) {
    console.warn("Public auth audit unavailable", eventType, error?.code || error?.message || "unknown");
  }
}

export function assertAuthV2Configured(env) {
  assertAuthEmailConfigured(env);
  if (String(env?.AUTH_OTP_PEPPER || "").length < 32) {
    throw new Error("AUTH_OTP_PEPPER belum dikonfigurasi dengan aman.");
  }
}

export function isAuthConfigurationError(error) {
  const message = String(error?.message || "");
  return message.includes("belum dikonfigurasi") || message.includes("Provider email");
}
