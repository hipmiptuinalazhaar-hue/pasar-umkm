const encoder = new TextEncoder();
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const SECRET_BYTES = 20;
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const TOTP_ALGORITHM = "SHA1";
const TOTP_CRYPTO_HASH = "SHA-1";
const RECOVERY_COUNT = 10;
const RECOVERY_SYMBOLS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function keepLowBits(value, bits) {
  if (bits <= 0) return 0;
  return value & ((1 << bits) - 1);
}

function toBase32(bytes) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
      value = keepLowBits(value, bits);
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function fromBase32(input) {
  const clean = String(input || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("INVALID_BASE32");
    value = (value << 5) | index;
    bits += 5;
    while (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
      value = keepLowBits(value, bits);
    }
  }
  return new Uint8Array(bytes);
}

function normalizeRecoveryCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function constantTimeEqual(a, b) {
  const left = encoder.encode(String(a || ""));
  const right = encoder.encode(String(b || ""));
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

async function rawMasterKey(env) {
  const value = String(env.ADMIN_MFA_ENCRYPTION_KEY || "").trim();
  if (!value) {
    const error = new Error("ADMIN_MFA_ENCRYPTION_KEY missing");
    error.code = "ADMIN_MFA_CONFIG_REQUIRED";
    throw error;
  }
  let bytes;
  try {
    bytes = fromBase64Url(value);
  } catch {
    bytes = new Uint8Array();
  }
  if (bytes.length !== 32) {
    const error = new Error("ADMIN_MFA_ENCRYPTION_KEY must be 32 bytes base64url");
    error.code = "ADMIN_MFA_CONFIG_INVALID";
    throw error;
  }
  return bytes;
}

async function deriveKey(env, info, algorithm, usages) {
  const raw = await rawMasterKey(env);
  const base = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({
    name: "HKDF",
    hash: "SHA-256",
    salt: encoder.encode("pasar-umkm-admin-mfa-v1"),
    info: encoder.encode(info)
  }, base, algorithm, false, usages);
}

async function encryptionKey(env) {
  return deriveKey(env, "totp-secret-encryption", { name: "AES-GCM", length: 256 }, ["encrypt", "decrypt"]);
}

async function recoveryHmacKey(env) {
  return deriveKey(env, "recovery-code-hmac", { name: "HMAC", hash: "SHA-256", length: 256 }, ["sign"]);
}

export function generateTotpSecret() {
  return toBase32(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)));
}

export async function encryptTotpSecret(env, adminId, secretBase32) {
  const key = await encryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = encoder.encode(`pasar-umkm:${adminId}:totp:v1`);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, key, encoder.encode(secretBase32));
  return { ciphertext: base64Url(new Uint8Array(ciphertext)), iv: base64Url(iv), keyVersion: 1 };
}

export async function decryptTotpSecret(env, adminId, ciphertext, iv) {
  const key = await encryptionKey(env);
  const aad = encoder.encode(`pasar-umkm:${adminId}:totp:v1`);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(iv), additionalData: aad, tagLength: 128 }, key, fromBase64Url(ciphertext));
  return new TextDecoder().decode(plaintext);
}

async function totpAtStep(secretBase32, step) {
  const secret = fromBase32(secretBase32);
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: TOTP_CRYPTO_HASH }, false, ["sign"]);
  const counter = new Uint8Array(8);
  let value = BigInt(step);
  for (let i = 7; i >= 0; i -= 1) {
    counter[i] = Number(value & 255n);
    value >>= 8n;
  }
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(binary % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, "0");
}

export async function verifyTotp(secretBase32, candidate, { now = Date.now(), window = 1, lastUsedStep = -1 } = {}) {
  const code = String(candidate || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: "format" };
  const currentStep = Math.floor(now / 1000 / TOTP_PERIOD);
  for (let delta = -window; delta <= window; delta += 1) {
    const step = currentStep + delta;
    if (step <= Number(lastUsedStep ?? -1)) continue;
    const expected = await totpAtStep(secretBase32, step);
    if (constantTimeEqual(expected, code)) return { ok: true, step };
  }
  return { ok: false, reason: "invalid_or_replayed" };
}

export function buildOtpAuthUri(email, secret) {
  const issuer = "Pasar UMKM";
  const label = `${issuer}:${String(email || "admin")}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: TOTP_ALGORITHM,
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD)
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export function generateRecoveryCodes() {
  const codes = [];
  for (let i = 0; i < RECOVERY_COUNT; i += 1) {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    let raw = "";
    for (let j = 0; j < 20; j += 1) raw += RECOVERY_SYMBOLS[bytes[j] % RECOVERY_SYMBOLS.length];
    codes.push(raw.match(/.{1,5}/g).join("-"));
  }
  return codes;
}

export async function hashRecoveryCode(env, code) {
  const normalized = normalizeRecoveryCode(code);
  if (normalized.length !== 20) return null;
  const key = await recoveryHmacKey(env);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(normalized));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function assertMfaConfig(env) {
  await rawMasterKey(env);
  return true;
}

export const adminMfaCryptoPolicy = Object.freeze({
  secret_bytes: SECRET_BYTES,
  algorithm: TOTP_ALGORITHM,
  crypto_hash: TOTP_CRYPTO_HASH,
  digits: TOTP_DIGITS,
  period_seconds: TOTP_PERIOD,
  recovery_codes: RECOVERY_COUNT,
  encryption: "AES-256-GCM",
  key_derivation: "HKDF-SHA-256",
  recovery_hash: "HMAC-SHA-256"
});
