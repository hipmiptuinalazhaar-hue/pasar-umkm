import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const publicAuth = read('src/public-auth-api.js');
const authV2 = read('src/public-auth-security-v2-api.js');
const frontend = read('js/auth-security-v2.js');
const limiter = read('src/rate-limit.js');

const checks = [];
function requireContract(condition, message) {
  if (!condition) throw new Error(`AUTH V2 FAIL: ${message}`);
  checks.push(message);
  console.log(`AUTH V2 PASS: ${message}`);
}

requireContract(publicAuth.includes('if (url.pathname === "/api/auth/register" && method === "POST") return "register"'), 'POST /api/auth/register is owned by core public auth');
requireContract(publicAuth.includes('async function register(sql, request)'), 'direct registration handler exists');
requireContract(publicAuth.includes('validatePassword(password)'), 'direct registration keeps password validation');
requireContract(publicAuth.includes("gen_salt('bf', 12)"), 'direct registration hashes passwords with bcrypt');
requireContract(publicAuth.includes('WITH created_user AS') && publicAuth.includes('created_session AS'), 'user and session creation share one atomic SQL statement');
requireContract(publicAuth.includes('registration_direct'), 'direct registration is audit logged');
requireContract(publicAuth.includes('email_verification_required: false'), 'audit metadata records that registration email verification is disabled');
requireContract(!publicAuth.includes('url.pathname.startsWith("/api/auth/register/")'), 'registration OTP child routes are not exposed by the public auth router');
requireContract(publicAuth.includes('url.pathname.startsWith("/api/auth/password/")'), 'password recovery remains delegated to the security V2 flow');
requireContract(publicAuth.includes('const MAX_BCRYPT_PASSWORD_BYTES = 72'), 'login enforces the bcrypt byte boundary');
requireContract(publicAuth.includes('WITH touched_user AS') && publicAuth.includes('INSERT INTO sessions (user_id, token_hash, expires_at)'), 'login session creation and last-login update remain atomic');

requireContract(frontend.includes("version: '2.1-direct'"), 'frontend advertises the direct-registration auth version');
requireContract(frontend.includes('Pendaftaran tidak memerlukan verifikasi email.'), 'registration UI clearly states that email verification is not required');
requireContract(frontend.includes('<span>Daftar sekarang</span>'), 'registration submits directly');
requireContract(!frontend.includes('register-verify'), 'registration OTP screen is removed from the frontend');
requireContract(!frontend.includes('/api/auth/register/verify'), 'frontend no longer calls registration OTP verification');
requireContract(!frontend.includes('/api/auth/register/resend'), 'frontend no longer calls registration OTP resend');
const registerSubmit = frontend.match(/async function submitRegister\(form\)[\s\S]*?\n  }\n\n  async function submitForgot/);
requireContract(Boolean(registerSubmit) && registerSubmit[0].includes('completeSession(result.user'), 'successful registration immediately establishes the returned session');

requireContract(authV2.includes('if (url.pathname === "/api/auth/password/forgot") return "password-forgot"'), 'password recovery start endpoint remains available');
requireContract(authV2.includes('if (url.pathname === "/api/auth/password/verify") return "password-verify"'), 'password recovery OTP verification remains available');
requireContract(authV2.includes('if (url.pathname === "/api/auth/password/reset") return "password-reset"'), 'password reset endpoint remains available');
requireContract(authV2.includes('purpose: "password_reset"'), 'recovery still sends a purpose-scoped email OTP');

requireContract(limiter.includes('name: "auth-register"') && limiter.includes('limit: 5'), 'direct registration remains rate limited');
requireContract(limiter.includes('name: "auth-password-forgot"'), 'password recovery remains rate limited');

console.log(`\nAuth direct-registration contract: PASS (${checks.length} checks)`);
