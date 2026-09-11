import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const runbook = read("docs/P7_FINAL_LAUNCH_READINESS.md");
const p6 = read("docs/P6_OBSERVABILITY_RELIABILITY.md");
const obs = read("src/observability.js");
const worker = read("src/worker-entry.js");
const wrangler = read("wrangler.jsonc");
const workflow = read(".github/workflows/p7-final-launch-readiness.yml");
const probe = read("scripts/p7-production-launch-probe.mjs");

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
need(worker, 'url.pathname === "/api/health"', "health route missing");
need(worker, "observeRequest(request, env, ctx, routeRequest)", "worker observability wrapper missing");
need(wrangler, '"observability"', "Cloudflare observability config missing");
need(wrangler, '"invocation_logs": true', "Cloudflare invocation logs must remain enabled");

for (const marker of [
  "P7 Final Launch Readiness",
  "npm run test:p7-final",
  "npm run validate",
  "node scripts/wait-cloudflare-deploy.mjs",
  "node scripts/post-deploy-smoke.mjs",
  "node scripts/p6-production-reliability-probe.mjs",
  "node scripts/p7-production-launch-probe.mjs",
  "node scripts/browser-release-smoke.mjs",
  "node scripts/browser-p5-critical-surfaces-v2.mjs",
  "node scripts/load-smoke-v1.mjs"
]) need(workflow, marker, `P7 workflow missing: ${marker}`);

need(workflow, "git diff --exit-code", "P7 workflow must verify deterministic build drift");
need(workflow, "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", "checkout action must be SHA-pinned");
need(workflow, "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020", "setup-node action must be SHA-pinned");

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

if (pkg.scripts?.["test:p7-final"] !== "node scripts/validate-p7-final-launch-readiness.mjs") failures.push("package test:p7-final script missing");
if (pkg.scripts?.["probe:p7-production"] !== "node scripts/p7-production-launch-probe.mjs") failures.push("package probe:p7-production script missing");
if (!String(pkg.scripts?.validate || "").includes("npm run test:p7-final")) failures.push("canonical validate must include P7 final contract");

if (failures.length) {
  console.error(`P7 final launch readiness validation failed (${failures.length}):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("P7 final launch readiness contract: PASS");
console.log("- deterministic release and exact-deploy gate");
console.log("- incident severity and application rollback runbook");
console.log("- database recovery safety and verified snapshot posture");
console.log("- P6 observability handoff and diagnostic headers");
console.log("- production probe, browser, privacy and load certification wired");
