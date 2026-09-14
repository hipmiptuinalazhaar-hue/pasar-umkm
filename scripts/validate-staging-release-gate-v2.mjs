import fs from "node:fs";

const requiredFiles = [
  "scripts/authenticated-smoke-v2.mjs",
  "database/staging/seed-smoke.sql",
  "docs/P2_STAGING_RELEASE_GATE.md",
  "docs/LOCAL_RELEASE_PROCESS.md",
  "src/worker-entry.js",
  "package.json"
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`P2 file missing: ${file}`);
}

const smoke = fs.readFileSync("scripts/authenticated-smoke-v2.mjs", "utf8");
const worker = fs.readFileSync("src/worker-entry.js", "utf8");
const seed = fs.readFileSync("database/staging/seed-smoke.sql", "utf8");
const docs = fs.readFileSync("docs/P2_STAGING_RELEASE_GATE.md", "utf8");
const releaseDocs = fs.readFileSync("docs/LOCAL_RELEASE_PROCESS.md", "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

function requireText(text, fragment, label) {
  if (!text.includes(fragment)) throw new Error(`${label}: missing ${fragment}`);
}

requireText(worker, 'env?.APP_ENV || "production"', "runtime environment fail-safe");
requireText(worker, "staging_environment", "staging database marker");
requireText(worker, "staging_database_attested", "health staging attestation");
requireText(smoke, 'expectedEnvironment === "staging"', "mutation environment boundary");
requireText(smoke, "staging_database_attested === true", "database attestation boundary");
requireText(smoke, "PRODUCTION_HOSTS", "production hostname denylist");
requireText(smoke, "Stateful authenticated smoke DILARANG", "production mutation refusal");

for (const endpoint of [
  "/api/auth/login",
  "/api/profile/me",
  "/api/stores/me",
  "/api/products/me",
  "/api/commerce/cart/items",
  "/api/commerce/checkout",
  "/api/commerce/orders?scope=buyer",
  "/api/commerce/orders?scope=seller",
  "/api/ratings/order/",
  "/api/notifications",
  "/api/social/follow/",
  "/api/social/conversations",
  "/api/social/unread-count",
  "/api/admin/auth/login",
  "/api/admin/auth/me",
  "/api/admin/access/me",
  "/api/admin/auth/logout"
]) requireText(smoke, endpoint, "authenticated E2E coverage");

requireText(smoke, '["confirmed", "processing", "ready", "completed"]', "seller order lifecycle");
requireText(smoke, "changed === false", "order idempotency assertion");
requireText(smoke, "super_admin", "admin RBAC assertion");

requireText(seed, "current_database() <> 'pasar_umkm_staging'", "staging database guard");
requireText(seed, "p2-e2e-isolated", "staging marker");
requireText(seed, ":'smoke_buyer_password'", "injected buyer credential");
requireText(seed, ":'smoke_seller_password'", "injected seller credential");
requireText(seed, ":'smoke_admin_password'", "injected admin credential");
requireText(seed, "crypt(:'smoke_admin_password', gen_salt('bf', 12))", "admin bcrypt seed");

for (const forbidden of [
  "hipmiptuinalazhaar@gmail.com",
  "pasar_umkm_app",
  "postgresql://",
  "postgres://"
]) {
  if (seed.toLowerCase().includes(forbidden.toLowerCase())) {
    throw new Error(`staging seed contains forbidden production/credential marker: ${forbidden}`);
  }
}

requireText(docs, "revert the bad merge", "rollback code contract");
requireText(docs, "Database changes are **not** automatically rolled backward", "rollback database contract");
requireText(releaseDocs, "Stateful authenticated smoke", "local release docs preserve staging-only mutation boundary");
requireText(releaseDocs, "APP_ENV=staging", "local release docs require staging runtime identity");
requireText(releaseDocs, "p2-e2e-isolated", "local release docs require staging database attestation");

if (packageJson.scripts?.["smoke:authenticated"] !== "node scripts/authenticated-smoke-v2.mjs") {
  throw new Error("smoke:authenticated must point to authenticated-smoke-v2.mjs");
}
if (packageJson.scripts?.["validate:staging-release"] !== "node scripts/validate-staging-release-gate-v2.mjs") {
  throw new Error("validate:staging-release script missing or incorrect");
}
if (!String(packageJson.scripts?.validate || "").includes("validate:staging-release")) {
  throw new Error("canonical npm validate must include P2 staging release validation");
}
if (!String(packageJson.scripts?.["release:predeploy"] || "").includes("npm run validate")) {
  throw new Error("release:predeploy must run canonical validation");
}

console.log("P2 staging release gate V2 contract: PASS");
