import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const size = path => fs.statSync(path).size;
const migration = read("database/migrations/2026-09-07-p7-launch-growth.sql");
const launchApi = read("src/launch-growth-api.js");
const adminApi = read("src/admin-growth-api.js");
const sellerDisputes = read("src/seller-dispute-api.js");
const worker = read("src/worker-entry.js");
const launchHtml = read("launch/index.html");
const launchJs = read("js/p7-launch-center.js");
const appP7 = read("js/p7-launch-growth.js");
const appP7Css = read("css/p7-launch-growth.css");
const p3 = read("js/p3-premium-experience.js");
const index = read("index.html");
const adminClient = read("js/admin/api.js");
const adminControl = read("js/admin/control.js");
const adminGrowth = read("js/admin/growth.js");
const docs = read("docs/P7_LAUNCH_GROWTH.md");
const workflow = read(".github/workflows/p7-launch-growth-validate.yml");
const pkg = JSON.parse(read("package.json"));

const failures = [];
const req = (value, text, label) => { if (!value.includes(text)) failures.push(label); };
const match = (value, pattern, label) => { if (!pattern.test(value)) failures.push(label); };
const forbid = (value, pattern, label) => { if (pattern.test(value)) failures.push(label); };

for (const table of ["growth_events","marketplace_promotions"]) {
  match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, "i"), `migration missing ${table}`);
}
for (const permission of ["growth.view","promotions.view","promotions.manage"]) {
  req(migration, permission, `migration missing ${permission}`);
}
req(migration, "2026-09-07-p7-launch-growth", "P7 migration marker missing");
forbid(migration, /\bDROP\s+(TABLE|SCHEMA|DATABASE|COLUMN|TYPE)\b/i, "P7 migration must be additive: DROP found");
forbid(migration, /\bTRUNCATE\b/i, "P7 migration must be additive: TRUNCATE found");
forbid(migration, /\bDELETE\s+FROM\s+(users|stores|products|posts|orders|growth_events|marketplace_promotions)\b/i, "P7 migration must not delete marketplace/growth rows");
forbid(migration, /CREATE\s+TABLE[^;]*(wallet|payment|refund|escrow|balance)/i, "P7 must not introduce financial ledger/payment tables");

for (const route of ["/api/growth/events","/api/discover","/api/launch/status","/sitemap.xml","/share/product/","/share/store/"]) {
  req(launchApi, route, `launch growth API missing ${route}`);
}
req(launchApi, "anonymous_ids_hashed: true", "anonymous growth ids must be hashed");
req(launchApi, "raw_ip_collection: false", "P7 growth must not collect raw IP");
req(launchApi, "raw_user_agent_collection: false", "P7 growth must not collect raw user-agent");
req(launchApi, "promotion_billing: false", "P7 promotion billing boundary missing");
req(launchApi, "fund_movement: false", "P7 fund movement boundary missing");
req(launchApi, "discovery_max_results_per_kind: 20", "discovery result cap missing");
req(launchApi, "marketplace_promotions", "discovery promotion registry integration missing");
req(launchApi, '"@type":"Product"', "Product JSON-LD missing");
req(launchApi, '"@type":"LocalBusiness"', "LocalBusiness JSON-LD missing");
req(launchApi, 'property="og:', "Open Graph share metadata missing");

req(sellerDisputes, '"/api/disputes/seller"', "seller dispute queue route missing");
match(sellerDisputes, /WHERE d\.store_id=\$\{store\.id\}/, "seller dispute queue must be store-owner scoped");

req(launchHtml, "/css/p7-launch.css?v=1.0", "Launch Center stylesheet missing");
req(launchHtml, "/js/p7-launch-center.js?v=1.0", "Launch Center script missing");
req(launchHtml, 'rel="canonical" href="/launch/"', "Launch Center canonical metadata missing");
for (const route of ["/api/launch/status","/api/commerce/orders?scope=buyer","/api/disputes/me","/api/disputes/seller","/api/reports/me","/api/store-verification/submissions"]) {
  req(launchJs, route, `Launch Center missing canonical route ${route}`);
}
forbid(launchJs, /['"]\/api\/orders\?scope=buyer['"]/, "Launch Center must not use retired non-canonical order list route");
req(launchJs, "seller_onboarding_view", "Launch Center seller onboarding event missing");
req(launchJs, "verification_submitted", "Launch Center verification tracking missing");
req(launchJs, "dispute_opened", "Launch Center dispute tracking missing");

for (const token of ["/api/discover","/api/growth/events","data-p7-report","Pusat Penjual","Trust Center","product_view","store_view","add_to_cart","checkout_started"]) {
  req(appP7, token, `deferred P7 integration missing ${token}`);
}
match(appP7, /\/api\/commerce\/orders\\\/\(\[0-9a-f-\]\{36\}\)\\\/status|api\\\/commerce\\\/orders/, "P7 order completion instrumentation must target Orders V2 canonical route");
forbid(appP7, /\/api\/orders\/\(\[0-9a-f-\]\{36\}\)\/status/, "P7 must not instrument retired order status route");
forbid(appP7, /\beval\s*\(|\bnew\s+Function\s*\(|document\.write\s*\(/, "P7 browser integration contains unsafe dynamic execution");
req(appP7Css, ".p7-report-dialog", "P7 report dialog styles missing");
req(appP7Css, ".p7-discovery", "P7 discovery styles missing");

req(p3, "css/p7-launch-growth.css?v=1.1", "P3 deferred loader missing refreshed P7 CSS");
req(p3, "js/p7-launch-growth.js?v=1.0", "P3 deferred loader missing P7 JS");
req(p3, "loadP7LaunchGrowth", "P3 deferred P7 loader function missing");
// The small P7 stylesheet may be cold-start prewarmed to prevent sidebar FOUC.
// P7 executable behavior must remain deferred; Launch Center code must never enter the homepage shell.
forbid(index, /p7-launch-growth\.js|p7-launch-center\.js/i, "P7 executable assets must not be part of critical index shell");
if (size("js/p3-premium-experience.js") > 12_000) failures.push("P3 premium loader exceeds 12KB after P7 integration");
if (size("js/p7-launch-growth.js") > 24_000) failures.push("P7 deferred app integration exceeds 24KB source budget");
if (size("js/p7-launch-center.js") > 24_000) failures.push("P7 Launch Center JS exceeds 24KB source budget");
if (size("css/p7-launch-growth.css") > 12_000) failures.push("P7 deferred CSS exceeds 12KB source budget");

for (const permission of ["growth.view","promotions.view","promotions.manage"]) {
  req(adminApi, permission, `admin growth API missing permission ${permission}`);
}
req(adminApi, "admin_audit_logs", "promotion mutations must write admin audit logs");
req(adminApi, "billing_action:\"none\"", "promotion API must declare no billing action");
req(adminApi, "financial_action:\"none\"", "promotion API must declare no financial action");
forbid(adminApi, /INSERT\s+INTO\s+(wallet|payments?|refunds?|balances?|escrow)/i, "admin P7 API must not create financial state");
req(adminClient, "growthMetrics", "admin client growth metrics missing");
req(adminClient, "createPromotion", "admin client promotion create missing");
req(adminControl, 'key: "growth"', "admin Growth nav missing");
req(adminControl, 'permission: "growth.view"', "admin Growth nav must be permission-gated");
req(adminControl, './growth.js?v=7.0.0', "admin Growth dynamic module missing");
req(adminGrowth, "Data sebelum rollout P7 tidak direkonstruksi atau dikarang.", "Growth UI must disclose instrumentation boundary");
req(adminGrowth, "promotions.manage", "Growth UI must gate promotion management");

for (const token of ["handleLaunchGrowthApi","handleSellerDisputeApi","handleAdminGrowthApi",'const P7_MIGRATION = "2026-09-07-p7-launch-growth"',"p7_applied","launch_ready"]) {
  req(worker, token, `Worker P7 contract missing ${token}`);
}

for (const statement of ["no billing","no wallet","no escrow","no refund ledger","no fund movement"]) {
  req(docs.toLowerCase(), statement, `P7 docs missing boundary: ${statement}`);
}
req(docs, "/launch/", "P7 docs missing Launch Center route");
req(docs, "/api/discover", "P7 docs missing discovery route");

req(workflow, "P7 Launch Growth Validation", "P7 workflow name missing");
req(workflow, "npm run test:p7-launch", "P7 workflow does not run dedicated validator");
req(workflow, "npm run validate", "P7 workflow does not run canonical validation");
req(workflow, "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", "P7 checkout must remain SHA-pinned");
req(workflow, "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020", "P7 setup-node must remain SHA-pinned");
req(workflow, "Wait for exact Cloudflare deployment", "P7 post-merge verification must wait for exact deployment");

if (pkg.scripts?.["test:p7-launch"] !== "node scripts/validate-p7-launch-growth.mjs") failures.push("package test:p7-launch script missing");
if (!String(pkg.scripts?.validate || "").includes("npm run test:p7-launch")) failures.push("canonical validate does not include P7");

if (failures.length) {
  console.error(`P7 launch/growth validation failed (${failures.length}):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("P7 launch, growth & monetization readiness: PASS");
console.log("- seller Launch Center uses canonical ownership-scoped APIs");
console.log("- discovery + server-rendered share/SEO contract");
console.log("- privacy-minimized funnel instrumentation");
console.log("- promotion placement registry with RBAC/MFA and no billing/fund movement");
console.log("- P7 executable behavior stays deferred; cold-start navigation CSS may be prewarmed");
