import fs from 'node:fs';

const wrangler = fs.readFileSync('wrangler.jsonc', 'utf8');
const securityEntry = fs.readFileSync('src/security-worker-entry.js', 'utf8');
const worker = fs.readFileSync('src/worker-entry.js', 'utf8');
const observability = fs.readFileSync('src/observability.js', 'utf8');
const maintenance = fs.readFileSync('src/auth-maintenance.js', 'utf8');
const story = fs.readFileSync('src/story-upload-api.js', 'utf8');
const profile = fs.readFileSync('src/profile-api.js', 'utf8');
const headers = fs.readFileSync('_headers', 'utf8');

const checks = [];
function requireContract(condition, message) {
  if (!condition) throw new Error(`SECURITY BOUNDARY FAIL: ${message}`);
  checks.push(message);
  console.log(`SECURITY BOUNDARY PASS: ${message}`);
}

requireContract(wrangler.includes('"main": "src/security-worker-entry.js"'), 'Cloudflare entrypoint is the security wrapper');
requireContract(securityEntry.includes('crypto.getRandomValues(new Uint8Array(18))'), 'HTML CSP nonce is random per response');
requireContract(securityEntry.includes("script-src 'self' 'nonce-${nonce}'"), 'effective Worker CSP requires a nonce for inline scripts');
requireContract(!securityEntry.includes("script-src 'self' 'unsafe-inline'"), 'effective Worker script CSP does not allow unsafe-inline');
requireContract(securityEntry.includes("script-src-attr 'none'"), 'inline event-handler attributes are blocked');
requireContract(securityEntry.includes("connect-src 'self'"), 'Worker CSP restricts browser connections to same-origin');
requireContract(securityEntry.includes('function adminCsp(nonce)'), 'admin HTML has a dedicated CSP policy');
requireContract(securityEntry.includes("base-uri 'none'"), 'admin CSP forbids base URI injection');
requireContract(securityEntry.includes('admin ? "no-referrer" : "strict-origin-when-cross-origin"'), 'admin HTML keeps no-referrer policy');
requireContract(securityEntry.includes('camera=(), microphone=(), geolocation=()'), 'admin HTML disables camera, microphone, and geolocation');
requireContract(securityEntry.includes('admin_csp_isolated: true'), 'security policy exports admin CSP isolation invariant');
requireContract(headers.includes("connect-src 'self';"), 'static fallback CSP also restricts browser connections');
requireContract(observability.includes('sanitizeServerErrorResponse'), 'global response boundary sanitizes API server errors');
requireContract(observability.includes('response.status < 500'), 'client errors are not rewritten by the 5xx sanitizer');
requireContract(observability.includes('sanitize_api_server_errors: true'), 'observability policy declares 5xx sanitization');
requireContract(maintenance.includes('const CLEANUP_BATCH_SIZE = 500'), 'auth cleanup has an explicit per-table row budget');
requireContract(maintenance.includes('DELETE FROM sessions s') && maintenance.includes('LIMIT ${CLEANUP_BATCH_SIZE}'), 'expired public session cleanup is batch bounded');
requireContract(maintenance.includes("revoke_reason = COALESCE(s.revoke_reason, 'expired_cleanup')"), 'expired admin sessions are revoked rather than silently trusted');
requireContract(maintenance.includes('cleanup_batch_size: CLEANUP_BATCH_SIZE'), 'auth maintenance policy exports its cleanup batch budget');
requireContract(worker.includes('import { maybeCleanupAuthState } from "./auth-maintenance.js";'), 'auth maintenance is imported by the live Worker owner');
requireContract(worker.includes('ctx.waitUntil(maybeCleanupAuthState(maintenanceSql)'), 'auth maintenance is scheduled as non-blocking Worker background work');
requireContract(worker.includes('env?.DATABASE_URL && typeof ctx?.waitUntil === "function"'), 'auth maintenance is gated on runtime database and waitUntil availability');
requireContract(story.includes('detectedImageType') && story.includes('INVALID_IMAGE_SIGNATURE'), 'story upload checks magic signatures');
requireContract(profile.includes('ALLOWED_AVATAR_HOSTS') && profile.includes('res.cloudinary.com'), 'external avatars are host allowlisted');
requireContract(profile.includes('parsed.protocol !== "https:"'), 'external avatars require HTTPS');

console.log(`\nSecurity boundary V2 contract: PASS (${checks.length} checks)`);
