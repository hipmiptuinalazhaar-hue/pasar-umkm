import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const passes = [];

function requireMatch(label, content, matcher) {
  const ok = matcher instanceof RegExp ? matcher.test(content) : content.includes(matcher);
  (ok ? passes : failures).push(label);
}

function requireAbsent(label, content, matcher) {
  const ok = matcher instanceof RegExp ? !matcher.test(content) : !content.includes(matcher);
  (ok ? passes : failures).push(label);
}

function syntax(file) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (result.status === 0) passes.push(`syntax:${file}`);
  else failures.push(`syntax:${file}\n${result.stderr || result.stdout}`);
}

const api = read('src/public-auth-api.js');
const email = read('src/auth-email.js');
const limiter = read('src/rate-limit.js');
const migration = read('database/migrations/2026-09-08-auth-security-v2.sql');
const frontend = read('js/auth-security-v2.js');
const runtimeLoader = read('js/p8-commerce-integration.js');
const css = read('css/auth-security-v2.css');

for (const file of ['src/public-auth-api.js', 'src/auth-email.js', 'src/rate-limit.js', 'js/auth-security-v2.js', 'js/p8-commerce-integration.js']) syntax(file);

requireMatch('register-start-route', api, '/api/auth/register');
requireMatch('register-verify-route', api, '/api/auth/register/verify');
requireMatch('register-resend-route', api, '/api/auth/register/resend');
requireMatch('forgot-route', api, '/api/auth/password/forgot');
requireMatch('password-verify-route', api, '/api/auth/password/verify');
requireMatch('password-reset-route', api, '/api/auth/password/reset');
requireMatch('otp-hmac-pepper', api, /HMAC[\s\S]*AUTH_OTP_PEPPER|AUTH_OTP_PEPPER[\s\S]*HMAC/);
requireMatch('constant-time-compare', api, 'constantTimeEqual');
requireMatch('secure-otp-generator', api, 'crypto.getRandomValues');
requireMatch('otp-expiry', api, "INTERVAL '10 minutes'");
requireMatch('attempt-limit', api, 'OTP_MAX_ATTEMPTS');
requireMatch('session-revocation', api, /DELETE FROM sessions WHERE user_id/);
requireMatch('verified-login-only', api, /email_verified = TRUE/);
requireMatch('generic-recovery-response', api, 'Jika email tersebut terdaftar, kode pemulihan telah dikirim.');
requireMatch('audit-events', api, 'user_auth_audit_events');
requireAbsent('no-otp-console-log', api, /console\.(log|info|debug)\([^\n]*(code|otp)/i);

requireMatch('resend-endpoint', email, 'https://api.resend.com/emails');
requireMatch('resend-bearer-auth', email, 'Authorization: `Bearer ${env.RESEND_API_KEY}`');
requireMatch('email-idempotency', email, 'Idempotency-Key');
requireMatch('email-plain-text', email, 'text,');
requireMatch('email-html', email, 'html,');
requireAbsent('no-hardcoded-resend-secret', email, /re_[A-Za-z0-9]{16,}/);

for (const name of [
  'auth-register-verify',
  'auth-register-resend',
  'auth-password-forgot',
  'auth-password-verify',
  'auth-password-reset'
]) requireMatch(`limiter:${name}`, limiter, name);
requireMatch('limiter-challenge-identity', limiter, 'body?.challenge_id');

requireMatch('migration-challenges', migration, 'CREATE TABLE IF NOT EXISTS user_auth_challenges');
requireMatch('migration-audit', migration, 'CREATE TABLE IF NOT EXISTS user_auth_audit_events');
requireMatch('migration-verified-at', migration, 'email_verified_at');
requireMatch('migration-password-changed', migration, 'password_changed_at');
requireMatch('migration-legacy-backfill', migration, 'email_verified = TRUE');
requireMatch('migration-marker', migration, '2026-09-08-auth-security-v2');
requireAbsent('challenge-no-plaintext-code-column', migration, /\bcode\s+(TEXT|VARCHAR|CHAR)/i);
requireMatch('challenge-hash-column', migration, 'code_hash TEXT NOT NULL');

requireMatch('frontend-one-time-code', frontend, 'autocomplete="one-time-code"');
requireMatch('frontend-forgot-password', frontend, 'Lupa kata sandi?');
requireMatch('frontend-register-verify', frontend, '/api/auth/register/verify');
requireMatch('frontend-register-resend', frontend, '/api/auth/register/resend');
requireMatch('frontend-recovery-verify', frontend, '/api/auth/password/verify');
requireMatch('frontend-reset', frontend, '/api/auth/password/reset');
requireMatch('frontend-session-complete', frontend, 'completeSession');
requireMatch('frontend-style-owner', css, '.auth-v2-shell');
requireMatch('runtime-auth-loader', runtimeLoader, 'js/auth-security-v2.js?v=1.0');

console.log(`Auth Security V2 validator: ${passes.length} checks passed.`);
if (failures.length) {
  console.error(`Auth Security V2 validator: ${failures.length} checks failed:`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log('Auth Security V2 contract is internally consistent.');
