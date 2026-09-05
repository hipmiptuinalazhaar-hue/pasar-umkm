import fs from 'node:fs';
import { enforceRequestSecurity } from '../src/request-security.js';

const read = path => fs.readFileSync(path, 'utf8');
const failures = [];
const fail = message => failures.push(message);
const requireText = (text, marker, label) => {
  if (!text.includes(marker)) fail(`missing ${label}: ${marker}`);
};
const forbidText = (text, marker, label) => {
  if (text.includes(marker)) fail(`forbidden ${label}: ${marker}`);
};

const worker = read('src/worker-entry.js');
const requestSecurity = read('src/request-security.js');
const comments = read('src/comment-api.js');
const storeManagement = read('src/store-management-api.js');
const functionality = read('src/functionality-api.js');
const migration = read('database/migrations/2026-09-05-final-security-hardening.sql');
const adminAuth = read('src/admin-auth-api.js');
const adminAuthorization = read('src/admin-authorization.js');
const adminSecurity = read('src/admin-security-core.js');
const adminMfa = read('src/admin-mfa-api.js');
const chatMedia = read('src/chat-media-api-v2.js');
const chatActions = read('src/chat-message-action-api.js');
const profileMedia = read('src/profile-media-api.js');
const observability = read('src/observability.js');
const docs = read('docs/FINAL_SECURITY_AUDIT_D.md');

for (const [marker, label] of [
  ['const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])', 'safe method allowlist'],
  ['const TRUSTED_FETCH_SITES = new Set(["same-origin", "none"])', 'fetch metadata allowlist'],
  ['request.headers.get("Origin")', 'Origin enforcement'],
  ['request.headers.get("Sec-Fetch-Site")', 'Fetch Metadata enforcement'],
  ['PUBLIC_ADMIN_ROUTE_DISABLED', 'legacy public-admin route denial'],
  ['LEGACY_PUBLIC_ADMIN_PREFIX = "/api/commerce/admin"', 'legacy public-admin route prefix'],
]) requireText(requestSecurity, marker, label);

for (const [marker, label] of [
  ['import { enforceRequestSecurity } from "./request-security.js";', 'request-security import'],
  ['const securityResponse = enforceRequestSecurity(request);', 'request-security invocation'],
  ['const FINAL_SECURITY_MIGRATION = "2026-09-05-final-security-hardening";', 'security migration version'],
  ['final_security_applied: finalSecurityApplied', 'health security migration state'],
]) requireText(worker, marker, label);

const securityIndex = worker.indexOf('const securityResponse = enforceRequestSecurity(request);');
const rateLimitIndex = worker.indexOf('const rateLimitResponse = await enforceRateLimit(request);');
if (securityIndex < 0 || rateLimitIndex < 0 || securityIndex > rateLimitIndex) {
  fail('request security must execute before rate limiting and API dispatch');
}

forbidText(comments, 'user.role === "admin"', 'public-admin comment bypass');
forbidText(storeManagement, 'user.role !== "seller" && user.role !== "admin"', 'public-admin store bypass');
requireText(storeManagement, 'if (user.role !== "seller")', 'seller-only store management');

for (const [marker, label] of [
  ["WHERE role = 'admin'::user_role", 'migration public-admin preflight'],
  ['ck_users_public_role_isolation', 'public role isolation constraint'],
  ["CHECK (role IN ('buyer'::user_role, 'seller'::user_role))", 'buyer/seller-only DB constraint'],
  ["'2026-09-05-final-security-hardening'", 'migration ledger version'],
]) requireText(migration, marker, label);

// Historical compatibility code may still mention public admin. It must be fenced
// by both the outer route denial and the DB invariant until Bagian E removes it.
requireText(functionality, 'url.pathname.startsWith("/api/commerce/admin")', 'legacy admin compatibility route exists for explicit fencing');
requireText(requestSecurity, 'url.pathname.startsWith(LEGACY_PUBLIC_ADMIN_PREFIX)', 'outer legacy admin route fence');

for (const [marker, label] of [
  ['super_admin_bypass: false', 'RBAC no-bypass policy'],
  ['permission_source: "database_role_grants"', 'database permission source'],
  ['sensitive_permissions_require_fresh_step_up: true', 'sensitive permission step-up policy'],
]) requireText(adminAuthorization, marker, label);

for (const [marker, label] of [
  ['__Host-pasar_umkm_admin', 'host-only admin cookie'],
  ['SameSite=Strict', 'strict admin cookie same-site policy'],
  ['security_version', 'admin session security version'],
  ['idle_expires_at', 'admin idle expiry'],
  ['revoked_at', 'admin revocation'],
]) requireText(adminSecurity, marker, label);

requireText(adminAuth, 'if (admin.mfa_required === true) return mfaGate', 'MFA gate before privileged session');
requireText(adminMfa, 'mfa_required', 'MFA enforcement owner');
requireText(chatMedia, 'conversationForUser', 'chat conversation membership check');
requireText(chatMedia, 'parseOwnedChatMediaUrl', 'chat media ownership parser');
requireText(chatActions, 'String(message.sender_id) !== String(userId)', 'sender-only delete-everyone');
requireText(profileMedia, 'parseOwnedProfileMediaUrl', 'profile media ownership parser');

for (const marker of [
  'request_body_logged: false',
  'cookies_logged: false',
  'ip_address_logged: false',
]) requireText(observability, marker, `observability privacy ${marker}`);

for (const marker of [
  'Public → admin privilege escalation',
  'CSRF / cross-origin write',
  'Chat media ownership',
  'Database rollout',
]) requireText(docs, marker, `security audit docs ${marker}`);

async function assertResponse(request, expectedStatus, expectedCode, label) {
  const response = enforceRequestSecurity(request);
  if (!response) {
    fail(`${label}: expected security response`);
    return;
  }
  if (response.status !== expectedStatus) {
    fail(`${label}: expected status ${expectedStatus}, got ${response.status}`);
  }
  const payload = await response.clone().json().catch(() => ({}));
  if (payload.code !== expectedCode) {
    fail(`${label}: expected code ${expectedCode}, got ${payload.code}`);
  }
}

function assertAllowed(request, label) {
  const response = enforceRequestSecurity(request);
  if (response !== null) fail(`${label}: expected request to pass outer security guard`);
}

const app = 'https://pasar-umkm.example';
assertAllowed(new Request(`${app}/api/products`, { method: 'GET', headers: { Origin: app, 'Sec-Fetch-Site': 'same-origin' } }), 'safe GET');
assertAllowed(new Request(`${app}/api/commerce/cart/items`, { method: 'POST', headers: { Origin: app, 'Sec-Fetch-Site': 'same-origin' } }), 'same-origin POST');
assertAllowed(new Request(`${app}/api/commerce/cart/items`, { method: 'POST' }), 'trusted non-browser POST without browser metadata');
await assertResponse(new Request(`${app}/api/commerce/cart/items`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' } }), 403, 'ORIGIN_REJECTED', 'cross-origin POST');
await assertResponse(new Request(`${app}/api/commerce/cart/items`, { method: 'POST', headers: { 'Sec-Fetch-Site': 'same-site' } }), 403, 'ORIGIN_REJECTED', 'sibling-site POST');
await assertResponse(new Request(`${app}/api/commerce/admin/summary`, { method: 'GET', headers: { Origin: app, 'Sec-Fetch-Site': 'same-origin' } }), 403, 'PUBLIC_ADMIN_ROUTE_DISABLED', 'legacy public-admin GET');

const coreBytes = fs.statSync('src/request-security.js').size;
if (coreBytes > 8_000) fail(`request-security owner exceeds source budget: ${coreBytes} > 8000`);

if (failures.length) {
  for (const message of failures) console.error(`Final Security D validation failed: ${message}`);
  process.exit(1);
}

console.log(`Final Security D validation passed. Request-security core: ${coreBytes} / 8000 bytes.`);
