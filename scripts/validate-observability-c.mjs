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
  ['return safeCfRay(request) || crypto.randomUUID();', 'trusted Cloudflare/UUID request correlation'],
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
  ['method: request.method,\n        route,', 'sanitized route field'],
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
  ['request.headers.get("X-Request-Id")', 'client-controlled request id trust'],
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
  'admin_audit_logs.request_id',
]) {
  requireText(docs, marker, `runbook ${marker}`);
}

const observabilityBytes = fs.statSync(observabilityPath).size;
if (observabilityBytes > 16_000) {
  fail(`observability core exceeds source budget: ${observabilityBytes} > 16000`);
}

const { observeRequest } = await import('../src/observability.js');
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};
const captured = [];

try {
  console.log = line => captured.push(String(line));
  console.warn = line => captured.push(String(line));
  console.error = line => captured.push(String(line));

  const secretId = '60313c0d-9c04-405c-a6a6-efe0a465e260';
  const successRequest = new Request(
    `https://pasar.invalid/api/commerce/orders/${secretId}?email=private@example.com`,
    {
      headers: {
        'CF-Ray': 'abc123-SIN',
        'X-Request-Id': 'attacker-controlled-id',
      },
    },
  );
  const successResponse = await observeRequest(
    successRequest,
    { OBSERVABILITY_SUCCESS_SAMPLE_RATE: '1' },
    {},
    async () => Response.json({ ok: true }),
  );

  if (successResponse.headers.get('X-Request-Id') !== 'abc123-SIN') {
    fail('CF-Ray was not reused as trusted request correlation id');
  }
  if (!successResponse.headers.get('Server-Timing')?.startsWith('app;dur=')) {
    fail('Server-Timing response header missing from observed request');
  }

  const successLog = captured.find(line => line.includes('api.request.completed')) || '';
  if (!successLog) fail('sampled successful request did not emit structured event');
  if (successLog.includes(secretId) || successLog.includes('private@example.com')) {
    fail('dynamic path/query data leaked into structured telemetry');
  }
  if (successLog) {
    const event = JSON.parse(successLog);
    if (event.route !== '/api/commerce/orders/*') fail(`unexpected sanitized route: ${event.route}`);
    if (event.request_id !== 'abc123-SIN') fail('structured event request_id does not match response correlation id');
  }

  captured.length = 0;
  const authRequest = new Request('https://pasar.invalid/api/auth/login', {
    method: 'POST',
    headers: { 'CF-Ray': 'auth123-SIN' },
  });
  await observeRequest(
    authRequest,
    { OBSERVABILITY_CLIENT_ERROR_SAMPLE_RATE: '0' },
    {},
    async () => Response.json({ ok: false, code: 'INVALID_CREDENTIALS' }, { status: 401 }),
  );
  const authLog = captured.find(line => line.includes('api.auth.denied')) || '';
  if (!authLog) fail('auth 401 was not always logged');
  if (authLog && JSON.parse(authLog).error_code !== 'INVALID_CREDENTIALS') {
    fail('safe backend error code was not preserved');
  }

  captured.length = 0;
  const exceptionRequest = new Request('https://pasar.invalid/api/commerce/checkout', {
    headers: { 'X-Request-Id': 'attacker-controlled-id' },
  });
  const exceptionResponse = await observeRequest(
    exceptionRequest,
    {},
    {},
    async () => {
      throw new TypeError('secret checkout payload must never reach telemetry');
    },
  );
  const generatedId = exceptionResponse.headers.get('X-Request-Id');
  if (!generatedId || generatedId === 'attacker-controlled-id') {
    fail('client-controlled X-Request-Id was trusted');
  }
  const exceptionLog = captured.find(line => line.includes('api.request.exception')) || '';
  if (!exceptionLog) fail('unhandled exception was not logged');
  if (exceptionLog.includes('secret checkout payload')) fail('raw exception message leaked into telemetry');
  if (exceptionLog && JSON.parse(exceptionLog).error_class !== 'TypeError') {
    fail('sanitized exception class missing');
  }
  const exceptionPayload = await exceptionResponse.json();
  if (exceptionResponse.status !== 500 || exceptionPayload.code !== 'INTERNAL_ERROR') {
    fail('unhandled exception did not fail closed with generic INTERNAL_ERROR');
  }
} finally {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
}

if (!process.exitCode) {
  console.log(`Observability C validation passed. Core: ${observabilityBytes} / 16000 bytes.`);
}
