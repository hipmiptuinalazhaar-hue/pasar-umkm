import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const migration = read("database/migrations/2026-09-07-p6-operational-marketplace.sql");
const publicApi = read("src/marketplace-safety-api.js");
const adminApi = read("src/admin-operations-api.js");
const worker = read("src/worker-entry.js");
const authz = read("src/admin-authorization.js");
const legal = read("legal/index.html");
const runbook = read("docs/P6_OPERATIONAL_MARKETPLACE.md");
const workflow = read(".github/workflows/p6-operational-hardening-validate.yml");
const pkg = JSON.parse(read("package.json"));

const failures = [];
function requireMatch(value, pattern, label) {
  if (!pattern.test(value)) failures.push(label);
}
function requireText(value, text, label) {
  if (!value.includes(text)) failures.push(label);
}
function forbid(value, pattern, label) {
  if (pattern.test(value)) failures.push(label);
}

for (const table of ["moderation_reports","order_disputes","store_verification_submissions","marketplace_case_events"]) {
  requireMatch(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, "i"), `migration missing ${table}`);
}
requireText(migration, "2026-09-07-p6-operational-marketplace", "P6 migration marker missing");
requireText(migration, "disputes.view", "disputes.view permission missing");
requireText(migration, "disputes.resolve", "disputes.resolve permission missing");
forbid(migration, /\bDROP\s+(TABLE|SCHEMA|DATABASE|COLUMN|TYPE)\b/i, "P6 migration must be additive: DROP found");
forbid(migration, /\bTRUNCATE\b/i, "P6 migration must be additive: TRUNCATE found");
forbid(migration, /\bDELETE\s+FROM\s+(users|stores|products|posts|orders|admin_audit_logs)\b/i, "P6 migration must not delete production marketplace rows");

requireText(publicApi, "__Host-pasar_umkm_session", "public P6 API must use hardened session cookie");
requireMatch(publicApi, /token_hash\s*=\s*encode\(digest\(/, "public P6 authentication must hash session token");
for (const route of ["/api/reports","/api/reports/me","/api/disputes","/api/disputes/me","/api/store-verification/submissions"]) {
  requireText(publicApi, route, `public P6 route missing: ${route}`);
}
requireMatch(publicApi, /WHERE id=\$\{orderId\}::uuid AND buyer_id=\$\{auth\.user\.id\}/, "dispute creation must be buyer-owned");
requireMatch(publicApi, /s\.owner_id=\$\{auth\.user\.id\}/, "seller dispute response must be store-owner scoped");
requireMatch(publicApi, /WHERE id=\$\{storeId\}::uuid AND owner_id=\$\{auth\.user\.id\}/, "verification submission must be store-owner scoped");
requireText(publicApi, "REPORT_ALREADY_OPEN", "report active-deduplication contract missing");
requireText(publicApi, "DISPUTE_ALREADY_EXISTS", "one-dispute-per-order contract missing");
requireText(publicApi, "financial_action: \"none\"", "public dispute API must declare no financial action");
requireText(publicApi, "refunds_or_fund_moves: false", "public P6 contract must forbid fund movement");

for (const permission of ["reports.view","reports.resolve","disputes.view","disputes.resolve","stores.verify"]) {
  requireText(adminApi, permission, `admin operational permission missing: ${permission}`);
}
requireText(adminApi, "admin_audit_logs", "privileged P6 mutations must write admin audit logs");
requireText(adminApi, "marketplace_case_events", "admin P6 actions must append case events");
requireText(adminApi, "dispute_financial_actions: false", "admin dispute contract must forbid financial action");
requireText(adminApi, "traffic_conversion_rate_available: false", "analytics must not invent traffic conversion");
forbid(adminApi, /UPDATE\s+orders\s+SET\s+(total|subtotal|delivery_fee)/i, "P6 admin API must not mutate financial order totals");
forbid(adminApi, /INSERT\s+INTO\s+(wallet|payments?|refunds?|balances?)\b/i, "P6 admin API must not create financial ledger/payment state");

requireText(authz, "sensitive_permissions_require_fresh_step_up: true", "sensitive admin step-up contract missing");
requireText(worker, 'handleMarketplaceSafetyApi', "Worker does not import/route public P6 API");
requireText(worker, 'handleAdminOperationsApi', "Worker does not import/route admin P6 API");
requireText(worker, 'const P6_MIGRATION = "2026-09-07-p6-operational-marketplace"', "Worker P6 migration attestation missing");
requireText(worker, "operational_ready", "health operational readiness missing");
requireText(worker, "p6_applied", "health P6 migration status missing");

for (const heading of ["Kebijakan Privasi","Ketentuan Penggunaan","Kebijakan Penjual","Pedoman Komunitas","Laporan dan Moderasi","Kebijakan Sengketa Pesanan"]) {
  requireText(legal, heading, `Trust Center missing section: ${heading}`);
}
requireText(legal, "tidak menyatakan diri sebagai penyelenggara escrow", "Trust Center must state payment-intermediary boundary");
requireText(legal, "Penyelesaian kasus tidak otomatis memindahkan uang", "Trust Center must state dispute financial boundary");
requireText(runbook, "no fund movement", "P6 runbook financial boundary missing");
requireText(runbook, "Do not delete report/dispute/audit history", "P6 rollback retention rule missing");

requireText(workflow, "P6 Operational Marketplace Validation", "P6 workflow name missing");
requireText(workflow, "npm run test:p6-operations", "P6 workflow does not run P6 validator");
requireText(workflow, "npm run validate", "P6 workflow does not run canonical validation");
requireText(workflow, "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", "P6 checkout action must stay SHA-pinned");
requireText(workflow, "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020", "P6 setup-node action must stay SHA-pinned");

if (pkg.scripts?.["test:p6-operations"] !== "node scripts/validate-p6-operational-hardening.mjs") failures.push("package test:p6-operations script missing");
if (!String(pkg.scripts?.validate || "").includes("npm run test:p6-operations")) failures.push("canonical validate does not include P6");

if (failures.length) {
  console.error(`P6 operational hardening validation failed (${failures.length}):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("P6 operational marketplace hardening: PASS");
console.log("- additive report/dispute/verification schema contract");
console.log("- authenticated ownership-scoped public case workflows");
console.log("- RBAC + step-up + admin audit requirements");
console.log("- no automated financial settlement/refund mutation");
console.log("- Trust Center + recovery/runbook contract");
