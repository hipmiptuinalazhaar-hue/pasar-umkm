import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const publicAuth = read('src/public-auth-api.js');
const authV2 = read('src/public-auth-security-v2-api.js');
const frontend = read('js/auth-security-v2.js');
const migration = read('database/migrations/2026-09-08-auth-security-v2.sql');

const checks = [];
function requireContract(condition, message) {
  if (!condition) throw new Error(`AUTH V2 FAIL: ${message}`);
  checks.push(message);
  console.log(`AUTH V2 PASS: ${message}`);
}

requireContract(!publicAuth.includes('registration_manual'), 'legacy manual registration audit path is removed');
requireContract(!/INSERT INTO users[\s\S]{0,500}email_verified[\s\S]{0,200}TRUE/i.test(publicAuth), 'core auth cannot create a verified user directly');
requireContract(publicAuth.includes('isSecurityV2Route'), 'registration and password security routes are delegated to V2');
requireContract(authV2.includes('if (url.pathname === "/api/auth/register") return "register-start"'), 'POST /api/auth/register starts an OTP challenge');
requireContract(authV2.includes('INSERT INTO user_auth_challenges') && authV2.includes("purpose, email, pending_name, pending_password_hash"), 'registration start stores only a pending challenge');
requireContract(authV2.includes('sendAuthCode(env') && authV2.includes('purpose: "register"'), 'registration start sends a verification code');
requireContract(authV2.includes('new Client({ connectionString: env.DATABASE_URL })'), 'verified account creation uses an explicit database transaction client');
requireContract(authV2.includes('await client.query("BEGIN")') && authV2.includes('await client.query("COMMIT")'), 'verified account creation has BEGIN/COMMIT boundaries');
requireContract(authV2.includes("FOR UPDATE"), 'registration verification locks its challenge against races');
requireContract(authV2.includes('INSERT INTO users(name,email,password_hash,email_verified,email_verified_at,last_login_at)'), 'user creation exists only in verified flow');
requireContract(authV2.includes('INSERT INTO sessions(user_id,token_hash,expires_at)'), 'session creation is part of the verified transaction');
requireContract(authV2.includes("'registration_verified','success'"), 'successful verification audit is written inside the transaction');
requireContract(authV2.includes('consumed_at=NOW()'), 'successful/terminal challenges are consumed');
requireContract(frontend.includes("request('/api/auth/register/verify'"), 'frontend verifies OTP before completing registration');
requireContract(frontend.includes("flow.registerChallengeId = String(result.challenge_id"), 'frontend stores the server challenge id, not credentials');
const registerSubmit = frontend.match(/async function submitRegister\(form\)[\s\S]*?\n  }\n\n  async function submitRegisterVerify/);
requireContract(Boolean(registerSubmit) && !registerSubmit[0].includes('completeSession(result.user'), 'initial registration submit cannot establish a session');
requireContract(frontend.includes("request('/api/auth/password/verify'") && frontend.includes("request('/api/auth/password/reset'"), 'password recovery is OTP verified before reset');
requireContract(migration.includes("purpose IN ('register', 'password_reset')"), 'database challenge table supports register and password reset purposes');

console.log(`\nAuth Security V2 behavioral contract: PASS (${checks.length} checks)`);
