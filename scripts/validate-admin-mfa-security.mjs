import fs from 'node:fs';
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotp
} from '../src/admin-mfa-crypto.js';

const read = path => fs.readFileSync(path, 'utf8');
const migration = read('database/migrations/2026-09-05-admin-mfa-security.sql');
const cryptoSource = read('src/admin-mfa-crypto.js');
const core = read('src/admin-security-core.js');
const mfaApi = read('src/admin-mfa-api.js');
const sessionApi = read('src/admin-session-security-api.js');
const auth = read('src/admin-auth-api.js');
const authorization = read('src/admin-authorization.js');
const rateLimit = read('src/rate-limit.js');
const html = read('admin/index.html');
const app = read('js/admin/app.js');
const api = read('js/admin/api.js');
const control = read('js/admin/control.js');
const securityUi = read('js/admin/security.js');
const securityCss = read('css/admin-security.css');
const headers = read('_headers');
const wrangler = read('wrangler.jsonc');

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message);
}
function requireAbsent(text, pattern, message) {
  if (pattern.test(text)) throw new Error(message);
}
function requireUnder(path, maxBytes) {
  const bytes = fs.statSync(path).size;
  if (bytes > maxBytes) throw new Error(`${path} exceeds budget: ${bytes} > ${maxBytes}`);
}

for (const contract of [
  /ADD COLUMN IF NOT EXISTS step_up_verified_at TIMESTAMPTZ/i,
  /ADD COLUMN IF NOT EXISTS auth_method VARCHAR\(32\)/i,
  /CREATE TABLE IF NOT EXISTS admin_mfa_totp/i,
  /secret_ciphertext TEXT NOT NULL/i,
  /secret_iv VARCHAR\(64\) NOT NULL/i,
  /last_used_step BIGINT NOT NULL DEFAULT -1/i,
  /CREATE TABLE IF NOT EXISTS admin_recovery_codes/i,
  /code_hash CHAR\(64\) NOT NULL/i,
  /used_at TIMESTAMPTZ/i,
  /CREATE TABLE IF NOT EXISTS admin_auth_challenges/i,
  /max_attempts SMALLINT NOT NULL DEFAULT 5/i,
  /expires_at TIMESTAMPTZ NOT NULL/i,
  /2026-09-05-admin-mfa-security/i
]) requireMatch(migration, contract, `Missing Phase 6 schema contract: ${contract}`);

requireAbsent(migration, /INSERT\s+INTO\s+admin_mfa_totp/i, 'Migration must never seed an MFA secret.');
requireAbsent(migration, /INSERT\s+INTO\s+admin_recovery_codes/i, 'Migration must never seed recovery credentials.');
requireAbsent(migration, /capryanagusto8@gmail\.com/i, 'Migration must remain account-agnostic.');

for (const contract of [
  /ADMIN_MFA_ENCRYPTION_KEY/,
  /name:\s*"AES-GCM"/,
  /length:\s*256/,
  /name:\s*"HKDF"/,
  /hash:\s*"SHA-256"/,
  /recovery-code-hmac/,
  /TOTP_ALGORITHM\s*=\s*"SHA1"/,
  /TOTP_DIGITS\s*=\s*6/,
  /TOTP_PERIOD\s*=\s*30/,
  /SECRET_BYTES\s*=\s*20/,
  /lastUsedStep/,
  /invalid_or_replayed/
]) requireMatch(cryptoSource, contract, `Missing MFA crypto contract: ${contract}`);

requireAbsent(wrangler, /ADMIN_MFA_ENCRYPTION_KEY/i, 'MFA master key must be a Worker secret, never wrangler source configuration.');
requireAbsent(`${cryptoSource}\n${mfaApi}\n${auth}`, /ADMIN_MFA_ENCRYPTION_KEY\s*[:=]\s*['"][A-Za-z0-9_-]{20,}/, 'MFA master key must never be hardcoded.');
requireAbsent(mfaApi, /INSERT\s+INTO\s+admin_mfa_totp[\s\S]*?\bsecret\b(?!_ciphertext|_iv)/i, 'Plain TOTP secret must never be persisted.');
requireMatch(mfaApi, /secret_ciphertext/, 'MFA persistence must use encrypted secret material.');
requireMatch(mfaApi, /code_hash/, 'Recovery codes must be persisted only as hashes.');
requireMatch(mfaApi, /last_used_step\s*<\s*\$\{verified\.step\}/, 'TOTP database claim must reject replayed steps atomically.');

for (const route of [
  '/api/admin/auth/mfa/enroll/start',
  '/api/admin/auth/mfa/enroll/verify',
  '/api/admin/auth/mfa/verify',
  '/api/admin/auth/step-up',
  '/api/admin/auth/mfa/recovery/regenerate',
  '/api/admin/auth/mfa/status'
]) requireMatch(mfaApi, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Missing MFA endpoint: ${route}`);

requireMatch(core, /__Host-pasar_umkm_admin_challenge/, 'MFA challenge must use a dedicated __Host cookie.');
requireMatch(core, /HttpOnly; Secure; SameSite=Strict/, 'MFA challenge/admin cookies must be HttpOnly Secure SameSite Strict.');
requireMatch(core, /CHALLENGE_TTL_MINUTES\s*=\s*5/, 'Password-to-MFA challenge must be short lived.');
requireMatch(mfaApi, /MAX_CHALLENGE_ATTEMPTS\s*=\s*5/, 'MFA challenges must have a global database-backed attempt ceiling.');
requireMatch(mfaApi, /challenge\.user_agent_hash\s*!==\s*userAgentHash/, 'Challenge must bind to user-agent risk context.');
requireAbsent(mfaApi, /challenge\.ip_hash\s*!==\s*ipHash\s*\|\|/, 'Carrier IP drift must not hard-lock a valid mobile challenge.');

requireMatch(authorization, /permission\?\.sensitive\s*===\s*true[\s\S]*?!isStepUpFresh/, 'Sensitive permissions must require fresh step-up authentication.');
requireMatch(authorization, /ADMIN_STEP_UP_REQUIRED/, 'Sensitive authorization must fail closed with a step-up challenge.');
requireMatch(authorization, /super_admin_bypass:\s*false/, 'Super Admin must not bypass the step-up/RBAC pipeline.');
requireMatch(core, /STEP_UP_MAX_AGE_MINUTES\s*=\s*10/, 'Step-up window must remain short lived.');

for (const route of ['/api/admin/security/sessions', '/api/admin/security/events']) {
  requireMatch(sessionApi, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Missing security self-service endpoint: ${route}`);
}
requireAbsent(sessionApi, /SELECT[\s\S]{0,500}\bip_hash\b/i, 'Session UI API must not expose IP hashes.');
requireAbsent(sessionApi, /SELECT[\s\S]{0,500}\buser_agent_hash\b/i, 'Session UI API must not expose user-agent hashes.');
requireMatch(sessionApi, /LIMIT 50/, 'Session inventory must remain bounded.');
requireMatch(sessionApi, /LIMIT 30/, 'Security event history must remain bounded.');

for (const rule of ['admin-mfa-challenge-write', 'admin-step-up-write', 'admin-security-read', 'admin-security-write']) {
  requireMatch(rateLimit, new RegExp(rule), `Missing MFA/security rate limit: ${rule}`);
}

requireMatch(auth, /handleAdminMfaApi\(request, env\)/, 'MFA handler must stay inside isolated admin-auth ownership.');
requireMatch(auth, /handleAdminSessionSecurityApi\(request, env\)/, 'Session security handler must stay inside isolated admin-auth ownership.');
requireMatch(auth, /if \(admin\.mfa_required === true\) return mfaGate/, 'Password success must not directly create a privileged session when MFA is required.');
requireMatch(auth, /issueMfaChallenge/, 'Password auth must issue MFA challenge state.');

requireMatch(html, /admin-security\.css\?v=6\.0\.0/, 'Admin security CSS must use Phase 6 cache version.');
requireMatch(html, /app\.js\?v=6\.0\.0/, 'Admin entry JS must use Phase 6 cache version.');
requireMatch(app, /mfaEnrollStart/, 'First sign-in UI must implement real MFA enrollment.');
requireMatch(app, /mfaEnrollVerify/, 'First sign-in UI must verify TOTP before entry.');
requireMatch(app, /recovery_codes/, 'Recovery codes must have an explicit one-time display flow.');
requireMatch(app, /requestStepUp/, 'UI must support just-in-time step-up authentication.');
requireMatch(control, /key:\s*"security"/, 'Control Center must expose self-service Security workspace.');
requireMatch(control, /setAdminStepUpHandler/, 'Control Center must centralize step-up retry ownership.');
requireMatch(securityUi, /securitySessions\(\)/, 'Security workspace must show admin session inventory.');
requireMatch(securityUi, /securityEvents\(\)/, 'Security workspace must show bounded security events.');
requireMatch(securityUi, /regenerateRecoveryCodes/, 'Security workspace must support recovery-code rotation.');
requireAbsent(`${app}\n${securityUi}`, /Math\.random\(|mockData|dummyData|fakeStat/i, 'Security UI must never use fake production/security data.');
requireMatch(securityCss, /\.mfa-method/, 'MFA controls must have dedicated restrained styles.');
requireMatch(headers, /\/js\/admin\/\*[\s\S]*?Cache-Control:\s*no-store/i, 'Privileged admin JS must not be served across stale cache boundaries.');

requireUnder('src/admin-mfa-crypto.js', 18_000);
requireUnder('src/admin-mfa-api.js', 36_000);
requireUnder('src/admin-security-core.js', 16_000);
requireUnder('src/admin-session-security-api.js', 18_000);
requireUnder('js/admin/security.js', 20_000);
requireUnder('css/admin-security.css', 8_000);

// RFC 6238 SHA-1 test vector. RFC publishes 8 digits; the six-digit profile is the last 6 digits.
const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const vector = await verifyTotp(rfcSecret, '287082', { now: 59_000, window: 0, lastUsedStep: -1 });
if (!vector.ok || vector.step !== 1) throw new Error('TOTP implementation failed RFC 6238-derived vector.');
const replay = await verifyTotp(rfcSecret, '287082', { now: 59_000, window: 0, lastUsedStep: 1 });
if (replay.ok) throw new Error('TOTP replay protection failed.');

const generatedSecret = generateTotpSecret();
if (!/^[A-Z2-7]{32}$/.test(generatedSecret)) throw new Error('Generated TOTP secret must be 20-byte RFC4648 Base32.');

const testKeyBytes = Uint8Array.from({ length: 32 }, (_, i) => i);
let binary = '';
for (const byte of testKeyBytes) binary += String.fromCharCode(byte);
const testKey = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const env = { ADMIN_MFA_ENCRYPTION_KEY: testKey };
const encrypted = await encryptTotpSecret(env, '00000000-0000-0000-0000-000000000001', generatedSecret);
if (!encrypted.ciphertext || encrypted.ciphertext.includes(generatedSecret)) throw new Error('TOTP secret encryption contract failed.');
const decrypted = await decryptTotpSecret(env, '00000000-0000-0000-0000-000000000001', encrypted.ciphertext, encrypted.iv);
if (decrypted !== generatedSecret) throw new Error('Encrypted TOTP secret did not round-trip.');

const recoveryCodes = generateRecoveryCodes();
if (recoveryCodes.length !== 10 || new Set(recoveryCodes).size !== 10) throw new Error('Recovery code generation contract failed.');
const recoveryHash = await hashRecoveryCode(env, recoveryCodes[0]);
if (!/^[0-9a-f]{64}$/.test(recoveryHash) || recoveryHash.includes(recoveryCodes[0])) throw new Error('Recovery code HMAC contract failed.');

console.log('Admin MFA & advanced security validation passed.');
console.log('Validated: encrypted TOTP, replay protection, single-use recovery credentials, bounded challenges, step-up RBAC, session security, no stale privileged cache.');
