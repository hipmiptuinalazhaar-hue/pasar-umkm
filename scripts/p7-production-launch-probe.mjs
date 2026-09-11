import fs from "node:fs";
import path from "node:path";

const base = String(process.env.P7_BASE_URL || "https://pasar-umkm.hipmiptuinalazhaar.workers.dev").replace(/\/$/, "");
const timeoutMs = Math.max(1000, Number(process.env.P7_PROBE_TIMEOUT_MS || 12000));
const rounds = Math.max(1, Math.min(5, Number(process.env.P7_PROBE_ROUNDS || 3)));
const p95Limit = Math.max(250, Number(process.env.P7_P95_LIMIT_MS || 5000));
const outDir = "p7-launch-readiness-results";
fs.mkdirSync(outDir, { recursive: true });

const samples = [];
const failures = [];

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

async function request(name, pathname, expectedStatus, verify) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(base + pathname, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "Accept": "application/json,text/html;q=0.9,*/*;q=0.8" }
    });
    const duration = Math.round((performance.now() - started) * 10) / 10;
    const body = await response.text();
    const record = { name, pathname, status: response.status, duration_ms: duration };
    samples.push(record);
    if (response.status !== expectedStatus) throw new Error(`${name}: expected ${expectedStatus}, got ${response.status}`);
    if (verify) await verify(response, body);
    console.log(`P7 LAUNCH PASS ${name} status=${response.status} duration=${duration}ms`);
  } catch (error) {
    const duration = Math.round((performance.now() - started) * 10) / 10;
    const message = error?.name === "AbortError" ? `${name}: timeout after ${timeoutMs}ms` : `${name}: ${error?.message || error}`;
    failures.push(message);
    samples.push({ name, pathname, status: 0, duration_ms: duration, error: message });
    console.error(`P7 LAUNCH FAIL ${message}`);
  } finally {
    clearTimeout(timer);
  }
}

function requireHeader(response, name) {
  const value = response.headers.get(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function requireNoStoreNoIndex(response) {
  const cache = String(response.headers.get("cache-control") || "").toLowerCase();
  const robots = String(response.headers.get("x-robots-tag") || "").toLowerCase();
  if (!cache.includes("no-store")) throw new Error("private surface missing no-store");
  if (!robots.includes("noindex")) throw new Error("private surface missing noindex");
}

for (let round = 1; round <= rounds; round += 1) {
  await request(`round=${round} homepage`, "/", 200, async response => {
    const hsts = String(response.headers.get("strict-transport-security") || "");
    const nosniff = String(response.headers.get("x-content-type-options") || "").toLowerCase();
    if (!hsts.includes("max-age=")) throw new Error("homepage missing HSTS");
    if (nosniff !== "nosniff") throw new Error("homepage missing nosniff");
  });

  await request(`round=${round} health`, "/api/health", 200, async (response, body) => {
    requireHeader(response, "X-Request-Id");
    requireHeader(response, "Server-Timing");
    const cache = String(response.headers.get("cache-control") || "").toLowerCase();
    if (!cache.includes("no-store")) throw new Error("health must be no-store");
    const data = JSON.parse(body);
    if (data?.ok !== true || data?.database?.connected !== true) throw new Error("database health is not ready");
    for (const [key, value] of Object.entries({
      core_ready: data?.schema?.core_ready,
      operational_ready: data?.schema?.operational_ready,
      launch_ready: data?.schema?.launch_ready,
      commerce_ready: data?.schema?.commerce_ready,
      payment_profile_ready: data?.schema?.payment_profile_ready,
      support_ready: data?.schema?.support_ready
    })) {
      if (value !== true) throw new Error(`health ${key} is not true`);
    }
  });

  await request(`round=${round} robots`, "/robots.txt", 200, async (_response, body) => {
    if (!/Sitemap:/i.test(body) || !/Disallow:\s*\/api\//i.test(body)) throw new Error("robots contract missing");
  });

  await request(`round=${round} sitemap`, "/sitemap.xml", 200, async (_response, body) => {
    if (!/<sitemapindex\b/i.test(body)) throw new Error("sitemap index missing");
  });

  await request(`round=${round} unknown-api`, "/api/p7-launch-readiness-unknown", 404, async (response, body) => {
    requireHeader(response, "X-Request-Id");
    requireHeader(response, "Server-Timing");
    const data = JSON.parse(body);
    if (data?.code !== "API_NOT_FOUND") throw new Error("unknown API must fail with API_NOT_FOUND");
  });

  await request(`round=${round} public-auth-boundary`, "/api/profile", 401);
  await request(`round=${round} support-auth-boundary`, "/api/support/tickets", 401);
  await request(`round=${round} admin-auth-boundary`, "/api/admin/auth/me", 401);
  await request(`round=${round} admin-support-boundary`, "/api/admin/support/tickets", 401);
}

for (const privatePath of ["/checkout/", "/purchases/", "/seller-orders/", "/support/", "/admin/"]) {
  await request(`private ${privatePath}`, privatePath, 200, async response => requireNoStoreNoIndex(response));
}

const durations = samples.filter(item => item.status > 0).map(item => item.duration_ms);
const p95 = Math.round(percentile(durations, 95) * 10) / 10;
const max = durations.length ? Math.max(...durations) : 0;
const summary = {
  target: base,
  rounds,
  checks: samples.length,
  failures,
  success_rate: samples.length ? (samples.length - failures.length) / samples.length : 0,
  p95_ms: p95,
  max_ms: max,
  threshold_p95_ms: p95Limit,
  production_mutations: 0,
  generated_at: new Date().toISOString()
};

fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ summary, samples }, null, 2));

if (p95 > p95Limit) failures.push(`p95 ${p95}ms exceeds ${p95Limit}ms`);
if (failures.length) {
  console.error(`P7 production launch readiness: FAIL (${failures.length})`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`P7 production launch readiness: PASS ${samples.length}/${samples.length}; p95=${p95}ms; max=${max}ms; mutations=0`);
