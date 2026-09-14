import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const runbook = read("docs/P7_FINAL_LAUNCH_READINESS.md");
const p6 = read("docs/P6_OBSERVABILITY_RELIABILITY.md");
const release = read("docs/LOCAL_RELEASE_PROCESS.md");
const obs = read("src/observability.js");
const worker = read("src/worker-entry.js");
const wrangler = read("wrangler.jsonc");
const probe = read("scripts/p7-production-launch-probe.mjs");
const browser = read("scripts/browser-release-smoke.mjs");
const critical = read("scripts/browser-p5-critical-surfaces-v2.mjs");
const load = read("scripts/load-smoke-v1.mjs");

const failures = [];
const need = (value, text, label) => { if (!value.includes(text)) failures.push(label); };
const match = (value, regex, label) => { if (!regex.test(value)) failures.push(label); };

for (const marker of [
  "P7 Final Launch Readiness & Operational Hardening",
  "Release gate",
  "SEV-1",
  "Application rollback procedure",
  "Database recovery policy",
  "Backup posture verified during P7",
  "Go / No-Go",
  "production branch swap/reset requires explicit owner approval"
]) need(runbook, marker, `runbook missing: ${marker}`);
need(runbook, "p6-pre-release-2026-09-07", "verified backup anchor must be documented");
need(runbook, "external service-plan constraint", "backup plan limitation must be explicit");
need(runbook, "The P7 certification is read-only against production", "production certification must be read-only");

need(p6, "X-Request-Id", "P6 correlation contract missing");
need(p6, "Server-Timing", "P6 latency contract missing");
need(obs, "OBSERVABILITY_POLICY_VERSION", "observability policy version missing");
need(obs, 'correlation_header: "X-Request-Id"', "observability correlation header contract missing");
need(obs, 'latency_header: "Server-Timing"', "observability latency header contract missing");
need(obs, 'sanitize_api_server_errors: true', "global API error sanitization contract missing");
need(worker, 'url.pathname === "/api/health"', "health route missing");
need(worker, "observeRequest(request, env, ctx, routeRequest)", "worker observability wrapper missing");
need(wrangler, '"observability"', "Cloudflare observability config missing");
need(wrangler, '"invocation_logs": true', "Cloudflare invocation logs must remain enabled");
need(wrangler, '"main": "src/security-worker-entry.js"', "Cloudflare must enter through security worker");

for (const marker of [
  "/api/health",
  "/api/admin/auth/me",
  "/api/admin/support/tickets",
  "/api/profile",
  "/api/support/tickets",
  "/robots.txt",
  "/sitemap.xml",
  "X-Request-Id",
  "Server-Timing",
  "operational_ready",
  "launch_ready",
  "commerce_ready",
  "payment_profile_ready",
  "support_ready"
]) need(probe, marker, `P7 production probe missing: ${marker}`);
match(probe, /method:\s*["']GET["']/, "P7 production probe must stay GET/read-only");
if (/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/.test(probe)) failures.push("P7 production probe must not mutate production");

need(browser, 'Page.captureScreenshot', 'browser release smoke must capture rendered output');
need(critical, "new Set(['POST', 'PUT', 'PATCH', 'DELETE'])", 'critical browser smoke must identify mutating methods');
need(critical, "Fetch.failRequest", 'critical browser smoke must block state-changing network calls');
need(load, 'LOAD_P95_LIMIT_MS', 'load smoke must enforce p95 ceiling');

need(release, 'npm run release:predeploy', 'local predeploy gate missing');
need(release, 'Cloudflare', 'Cloudflare deployment step missing');
need(release, 'npm run release:postdeploy', 'local postdeploy gate missing');
need(release, 'Stateful authenticated smoke', 'staging-only stateful E2E rule missing');
need(release, 'GitHub Actions tidak digunakan', 'no-Actions release policy missing');

if (pkg.scripts?.["test:p7-final"] !== "node scripts/validate-p7-final-launch-readiness.mjs") failures.push("package test:p7-final script missing");
if (pkg.scripts?.["probe:p7-production"] !== "node scripts/p7-production-launch-probe.mjs") failures.push("package probe:p7-production script missing");
if (!String(pkg.scripts?.validate || "").includes("npm run test:p7-final")) failures.push("canonical validate must include P7 final contract");
if (!String(pkg.scripts?.["release:postdeploy"] || "").includes("probe:p7-production")) failures.push("postdeploy gate must run P7 production probe");

if (failures.length) {
  console.error(`P7 final launch readiness validation failed (${failures.length}):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log("P7 final launch readiness contract: PASS");
console.log("- local deterministic release gate and Cloudflare deployment handoff");
console.log("- incident/rollback/database recovery runbook");
console.log("- read-only production probes and browser/load certification");
