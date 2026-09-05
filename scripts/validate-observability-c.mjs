import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const fail = message => {
  console.error(`Observability C validation failed: ${message}`);
  process.exitCode = 1;
};
const requireText = (text, marker, label) => {
  if (!text.includes(marker)) fail(`missing ${label}: ${marker}`);
};
const forbidText = (text, marker, label) => {
  if (text.includes(marker)) fail(`forbidden ${label}: ${marker}`);
};

const observabilityPath = 'src/observability.js';
const workerPath = 'src/worker-entry.js';
const wranglerPath = 'wrangler.jsonc';
const docsPath = 'docs/OBSERVABILITY_MONITORING_C.md';

const observability = read(observabilityPath);
const worker = read(workerPath);
const wrangler = read(wranglerPath);
const docs = read(docsPath);

for (const [marker, label] of [
  ['DEFAULT_SUCCESS_SAMPLE_RATE = 0.10', 'success sampling default'],
  ['DEFAULT_CLIENT_ERROR_SAMPLE_RATE = 0.25', 'client-error sampling default'],
  ['DEFAULT_SLOW_REQUEST_MS = 1500', 'slow request threshold'],
  ['crypto.randomUUID()', 'server-side request id'],
  ['"X-Request-Id"', 'request correlation header'],
  ['"Server-Timing"', 'server timing header'],
  ['"api.request.failed"', '5xx event'],
  ['"api.request.exception"', 'exception event'],
  ['"api.rate_limited"', 'rate-limit event'],
  ['"api.auth.denied"', 'auth-denied event'],
  ['"api.request.slow"', 'slow-request event'],
  ['status >= 500 || status === 429', 'always-log critical status policy'],
  ['durationMs >= slowMs', 'always-log slow request policy'],
  ['error_class: safeErrorClass(error)', 'sanitized exception class'],
  ['route: route', 'sanitized route field'],
  ['return path.startsWith("/api/") ? "/api/other" : "worker/other"', 'redacted unknown route fallback'],
  ['raw_path_logged: false', 'privacy policy raw path'],
  ['query_string_logged: false', 'privacy policy query'],
  ['request_body_logged: false', 'privacy policy body'],
  ['cookies_logged: false', 'privacy policy cookie'],
  ['user_agent_logged: false', 'privacy policy user agent'],
  ['ip_address_logged: false', 'privacy policy IP'],
]) {
  requireText(observability, marker, label);
}

for (const [marker, label] of [
  ['error.message', 'raw error message logging'],
  ['error.stack', 'raw error stack logging'],
  ['"Cookie"', 'cookie access in observability owner'],
  ['"Authorization"', 'authorization access in observability owner'],
  ['"User-Agent"', 'user-agent access in observability owner'],
  ['"CF-Connecting-IP"', 'raw IP access in observability owner'],
  ['"X-Forwarded-For"', 'forwarded IP access in observability owner'],
  ['url.search', 'query-string access in observability owner'],
  ['request.json(', 'request body parsing in observability owner'],
  ['request.text(', 'request body parsing in observability owner'],
]) {
  forbidText(observability, marker, label);
}

for (const [marker, label] of [
  ['import { observeRequest } from "./observability.js";', 'worker observability import'],
  ['async function routeRequest(request, env, ctx)', 'single existing router extraction'],
  ['return observeRequest(request, env, ctx, routeRequest);', 'worker lifecycle wrapper'],
  ['code: "HEALTH_DATABASE_ERROR"', 'health error code'],
  ['code: "SCHEMA_NOT_READY"', 'schema error code'],
]) {
  requireText(worker, marker, label);
}

forbidText(worker, 'console.error("Health diagnostic error:', 'raw health exception logging');
forbidText(worker, 'console.error("Production schema verification failed:', 'raw schema exception logging');
forbidText(worker, 'window.fetch =', 'client fetch ownership leakage');

for (const [marker, label] of [
  ['"observability": {', 'Cloudflare observability config'],
  ['"enabled": true', 'Cloudflare observability enabled'],
  ['"invocation_logs": true', 'invocation logs enabled'],
  ['"head_sampling_rate": 1', 'Cloudflare invocation sampling'],
]) {
  requireText(wrangler, marker, label);
}

for (const marker of [
  'X-Request-Id',
  'api.request.failed',
  'api.rate_limited',
  'api.auth.denied',
  'Privacy boundary',
  'Recommended production alert thresholds',
]) {
  requireText(docs, marker, `runbook ${marker}`);
}

const observabilityBytes = fs.statSync(observabilityPath).size;
if (observabilityBytes > 16_000) {
  fail(`observability core exceeds source budget: ${observabilityBytes} > 16000`);
}

if (!process.exitCode) {
  console.log(`Observability C validation passed. Core: ${observabilityBytes} / 16000 bytes.`);
}
