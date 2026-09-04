import fs from 'node:fs';

const authPath = 'src/admin-auth-api.js';
const rateLimitPath = 'src/rate-limit.js';
const workerPath = 'src/worker-entry.js';

const auth = fs.readFileSync(authPath, 'utf8');
const rateLimit = fs.readFileSync(rateLimitPath, 'utf8');
const worker = fs.readFileSync(workerPath, 'utf8');

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message);
}

function requireAbsent(text, pattern, message) {
  if (pattern.test(text)) throw new Error(message);
}

for (const route of [
  '/api/admin/auth/login',
  '/api/admin/auth/rotate-password',
  '/api/admin/auth/me',
  '/api/admin/auth/logout',
  '/api/admin/auth/revoke-all'
]) {
  requireMatch(auth, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Missing admin auth route: ${route}`);
}

requireMatch(auth, /__Host-pasar_umkm_admin/, 'Admin auth must use its own __Host cookie namespace.');
requireMatch(auth, /HttpOnly/, 'Admin cookie must be HttpOnly.');
requireMatch(auth, /Secure/, 'Admin cookie must be Secure.');
requireMatch(auth, /SameSite=Strict/, 'Admin cookie must use SameSite=Strict.');
requireMatch(auth, /Path=\//, 'Admin __Host cookie must use Path=/.');
requireAbsent(auth, /__Host-pasar_umkm_session/, 'Admin auth must never read or write the public marketplace session cookie.');

requireMatch(auth, /getRandomValues\(new Uint8Array\(32\)\)/, 'Admin session token must have 256 bits of randomness.');
requireMatch(auth, /digest\("SHA-256"/, 'Admin session tokens and risk identifiers must be SHA-256 hashed.');
requireMatch(auth, /INSERT INTO admin_sessions[\s\S]*token_hash/, 'Admin session persistence must store token_hash.');
requireAbsent(auth, /INSERT INTO admin_sessions[\s\S]*\btoken\s*,/i, 'Raw admin session tokens must never be stored.');

requireMatch(auth, /SESSION_IDLE_MINUTES\s*=\s*30/, 'Admin idle timeout must remain 30 minutes.');
requireMatch(auth, /SESSION_ABSOLUTE_HOURS\s*=\s*8/, 'Admin absolute session timeout must remain 8 hours.');
requireMatch(auth, /security_version/, 'Admin sessions must enforce security_version revocation.');
requireMatch(auth, /revoked_at/, 'Admin sessions must support explicit revocation.');

requireMatch(auth, /must_rotate_password/, 'Bootstrap password rotation must be enforced.');
requireMatch(auth, /MIN_NEW_PASSWORD_BYTES\s*=\s*14/, 'Admin replacement password floor must remain at least 14 bytes.');
requireMatch(auth, /gen_salt\('bf',\s*12\)/, 'Admin passwords must continue using bcrypt cost 12.');
requireMatch(auth, /PASSWORD_ROTATION_REQUIRED/, 'Login must gate bootstrap credentials behind rotation.');

requireMatch(auth, /mfa_required/, 'Admin auth must consult the MFA requirement.');
requireMatch(auth, /mfa_verified_at/, 'Admin sessions must carry MFA verification state.');
requireMatch(auth, /MFA_ENROLLMENT_REQUIRED/, 'Admin auth must stop at MFA enrollment when required.');
requireMatch(auth, /MFA_REQUIRED/, 'Admin auth must refuse privileged sessions without MFA verification.');
requireAbsent(auth, /mfa_required\s*=\s*FALSE/i, 'Phase 3 must not weaken the account MFA requirement.');
requireAbsent(auth, /SET[\s\S]{0,120}mfa_enrolled_at\s*=/i, 'Phase 3 must not self-enroll MFA.');

requireMatch(auth, /admin_audit_logs/, 'Admin auth events must write to the privileged audit log.');
for (const action of [
  'admin.login',
  'admin.password.rotate',
  'admin.logout',
  'admin.sessions.revoke_all'
]) {
  requireMatch(auth, new RegExp(action.replaceAll('.', '\\.')), `Missing audit action: ${action}`);
}
requireMatch(auth, /ipHash/, 'Admin audit/session risk data must use hashed IP identifiers.');
requireMatch(auth, /userAgentHash/, 'Admin audit/session risk data must use hashed user-agent identifiers.');
requireAbsent(auth, /actor_ip|raw_ip|ip_address/i, 'Admin auth must not persist raw IP fields.');

requireAbsent(auth, /\bFROM\s+users\b|\bJOIN\s+users\b|\bINSERT\s+INTO\s+users\b/i, 'Admin authentication must remain independent from public users.');
requireAbsent(auth, /\bFROM\s+sessions\b|\bJOIN\s+sessions\b|\bINSERT\s+INTO\s+sessions\b/i, 'Admin authentication must remain independent from public sessions.');
requireAbsent(auth, /capryanagusto8@gmail\.com/i, 'Personal admin identity must never be hardcoded in runtime auth source.');

for (const rule of [
  'admin-auth-login',
  'admin-auth-rotate-password',
  'admin-auth-session-write'
]) {
  requireMatch(rateLimit, new RegExp(rule), `Missing admin rate-limit rule: ${rule}`);
}
requireMatch(rateLimit, /__Host-pasar_umkm_admin/, 'Admin session write rate-limit must key the admin cookie namespace.');

requireMatch(worker, /handleAdminAuthApi/, 'Worker entry must own a dedicated admin auth handler.');
const adminIndex = worker.indexOf('handleAdminAuthApi(request, env)');
const publicBootstrapIndex = worker.indexOf('ensureNotificationInfrastructure(env)');
if (adminIndex < 0 || publicBootstrapIndex < 0 || adminIndex > publicBootstrapIndex) {
  throw new Error('Admin auth must execute before unrelated public feature infrastructure bootstraps.');
}

console.log('Admin authentication security validation passed.');
console.log('Validated: isolated cookie/session namespace, forced password rotation, MFA fail-closed gate, revocation, audit, rate limits, and runtime ownership.');
