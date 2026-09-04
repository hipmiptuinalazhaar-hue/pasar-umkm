import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const auth = read('src/admin-auth-api.js');
const core = read('src/admin-security-core.js');
const mfa = read('src/admin-mfa-api.js');
const sessionSecurity = read('src/admin-session-security-api.js');
const rateLimit = read('src/rate-limit.js');
const worker = read('src/worker-entry.js');
const securitySurface = `${auth}\n${core}\n${mfa}\n${sessionSecurity}`;

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

requireMatch(core, /__Host-pasar_umkm_admin/, 'Admin auth must use its own __Host cookie namespace.');
requireMatch(core, /HttpOnly/, 'Admin cookie must be HttpOnly.');
requireMatch(core, /Secure/, 'Admin cookie must be Secure.');
requireMatch(core, /SameSite=Strict/, 'Admin cookie must use SameSite=Strict.');
requireMatch(core, /Path=\//, 'Admin __Host cookie must use Path=/.');
requireMatch(core, /__Host-pasar_umkm_admin_challenge/, 'MFA challenge must use an isolated __Host cookie.');
requireAbsent(securitySurface, /__Host-pasar_umkm_session/, 'Admin security must never read or write the public marketplace session cookie.');

requireMatch(core, /createOpaqueToken\(size\s*=\s*32\)/, 'Opaque admin tokens must default to 256 bits of randomness.');
requireMatch(core, /digest\("SHA-256"/, 'Admin session tokens and risk identifiers must be SHA-256 hashed.');
requireMatch(core, /INSERT INTO admin_sessions[\s\S]*token_hash/, 'Admin session persistence must store token_hash.');
requireAbsent(core, /INSERT INTO admin_sessions[\s\S]*\btoken\s*,/i, 'Raw admin session tokens must never be stored.');

requireMatch(core, /SESSION_IDLE_MINUTES\s*=\s*30/, 'Admin idle timeout must remain 30 minutes.');
requireMatch(core, /SESSION_ABSOLUTE_HOURS\s*=\s*8/, 'Admin absolute session timeout must remain 8 hours.');
requireMatch(core, /security_version/, 'Admin sessions must enforce security_version revocation.');
requireMatch(core, /revoked_at/, 'Admin sessions must support explicit revocation.');
requireMatch(core, /mfa_verified_at/, 'Authenticated admin sessions must carry MFA verification state.');

requireMatch(auth, /must_rotate_password/, 'Bootstrap password rotation must be enforced.');
requireMatch(auth, /MIN_NEW_PASSWORD_BYTES\s*=\s*14/, 'Admin replacement password floor must remain at least 14 bytes.');
requireMatch(auth, /gen_salt\('bf',\s*12\)/, 'Admin passwords must continue using bcrypt cost 12.');
requireMatch(auth, /PASSWORD_ROTATION_REQUIRED/, 'Login must gate bootstrap credentials behind rotation.');

requireMatch(auth, /mfa_required/, 'Admin password auth must consult the MFA requirement.');
requireMatch(auth, /MFA_ENROLLMENT_REQUIRED/, 'Admin auth must route unenrolled accounts to MFA enrollment.');
requireMatch(auth, /MFA_REQUIRED/, 'Admin auth must route enrolled accounts to MFA verification.');
requireMatch(auth, /issueMfaChallenge/, 'Password success must issue a short-lived MFA challenge instead of a privileged session.');
requireAbsent(auth, /(?:SET|,)\s*mfa_required\s*=\s*FALSE/i, 'Runtime auth must never assign the account MFA requirement to false.');

for (const source of [auth, mfa, sessionSecurity]) {
  requireMatch(source, /admin_audit_logs/, 'Every admin security module must preserve privileged audit logging.');
}
for (const action of ['admin.login', 'admin.password.rotate', 'admin.logout', 'admin.sessions.revoke_all']) {
  requireMatch(auth, new RegExp(action.replaceAll('.', '\\.')), `Missing audit action: ${action}`);
}
requireMatch(securitySurface, /ipHash/, 'Admin audit/session risk data must use hashed IP identifiers.');
requireMatch(securitySurface, /userAgentHash/, 'Admin audit/session risk data must use hashed user-agent identifiers.');
requireAbsent(securitySurface, /actor_ip|raw_ip|ip_address/i, 'Admin security must not persist raw IP fields.');

requireAbsent(securitySurface, /\bFROM\s+users\b|\bJOIN\s+users\b|\bINSERT\s+INTO\s+users\b/i, 'Admin authentication must remain independent from public users.');
requireAbsent(securitySurface, /\bFROM\s+sessions\b|\bJOIN\s+sessions\b|\bINSERT\s+INTO\s+sessions\b/i, 'Admin authentication must remain independent from public sessions.');
requireAbsent(securitySurface, /capryanagusto8@gmail\.com/i, 'Personal admin identity must never be hardcoded in runtime auth source.');

for (const rule of [
  'admin-auth-login', 'admin-auth-rotate-password', 'admin-auth-session-write',
  'admin-mfa-challenge-write', 'admin-step-up-write', 'admin-security-read', 'admin-security-write'
]) {
  requireMatch(rateLimit, new RegExp(rule), `Missing admin security rate-limit rule: ${rule}`);
}
requireMatch(rateLimit, /__Host-pasar_umkm_admin/, 'Admin session rate limits must key the admin cookie namespace.');
requireMatch(rateLimit, /__Host-pasar_umkm_admin_challenge/, 'MFA challenge rate limits must key the challenge cookie namespace.');

requireMatch(worker, /handleAdminAuthApi/, 'Worker entry must own a dedicated admin auth handler.');
const adminIndex = worker.indexOf('handleAdminAuthApi(request, env)');
const publicBootstrapIndex = worker.indexOf('ensureNotificationInfrastructure(env)');
if (adminIndex < 0 || publicBootstrapIndex < 0 || adminIndex > publicBootstrapIndex) {
  throw new Error('Admin auth must execute before unrelated public feature infrastructure bootstraps.');
}

console.log('Admin authentication security validation passed.');
console.log('Validated: isolated credentials, challenge-gated MFA, forced password rotation, session revocation, audit, rate limits, and runtime ownership.');
