const DEFAULT_SUCCESS_SAMPLE_RATE = 0.10;
const DEFAULT_CLIENT_ERROR_SAMPLE_RATE = 0.25;
const DEFAULT_SLOW_REQUEST_MS = 1500;
const MAX_ERROR_CODE_LENGTH = 64;

const ROUTE_RULES = [
  [/^\/api\/health$/, "/api/health"],
  [/^\/api\/admin\/auth(?:\/|$)/, "/api/admin/auth/*"],
  [/^\/api\/admin\/security(?:\/|$)/, "/api/admin/security/*"],
  [/^\/api\/admin\/control(?:\/|$)/, "/api/admin/control/*"],
  [/^\/api\/admin\/access(?:\/|$)/, "/api/admin/access/*"],
  [/^\/api\/commerce\/checkout$/, "/api/commerce/checkout"],
  [/^\/api\/commerce\/cart(?:\/|$)/, "/api/commerce/cart/*"],
  [/^\/api\/commerce\/orders(?:\/|$)/, "/api/commerce/orders/*"],
  [/^\/api\/commerce(?:\/|$)/, "/api/commerce/*"],
  [/^\/api\/auth(?:\/|$)/, "/api/auth/*"],
  [/^\/api\/chat\/media(?:\/|$)/, "/api/chat/media/*"],
  [/^\/api\/chat(?:\/|$)/, "/api/chat/*"],
  [/^\/api\/profile\/avatar$/, "/api/profile/avatar"],
  [/^\/api\/profile(?:\/|$)/, "/api/profile/*"],
  [/^\/api\/products(?:\/|$)/, "/api/products/*"],
  [/^\/api\/stores(?:\/|$)/, "/api/stores/*"],
  [/^\/api\/posts(?:\/|$)/, "/api/posts/*"],
  [/^\/api\/comments(?:\/|$)/, "/api/comments/*"],
  [/^\/api\/product-comments(?:\/|$)/, "/api/product-comments/*"],
  [/^\/api\/notifications(?:\/|$)/, "/api/notifications/*"],
  [/^\/api\/story(?:-|\/|$)/, "/api/story/*"],
  [/^\/api\/ratings?(?:\/|$)/, "/api/ratings/*"],
  [/^\/api\/social(?:\/|$)/, "/api/social/*"]
];

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function routeKey(pathname) {
  const path = String(pathname || "");
  for (const [pattern, key] of ROUTE_RULES) {
    if (pattern.test(path)) return key;
  }
  return path.startsWith("/api/") ? "/api/other" : "worker/other";
}

function errorCodeFromValue(value, status) {
  const code = String(value || "").trim().toUpperCase();
  if (/^[A-Z0-9][A-Z0-9_:-]*$/.test(code) && code.length <= MAX_ERROR_CODE_LENGTH) {
    return code;
  }
  return `HTTP_${status}`;
}

async function responseErrorCode(response) {
  if (response.status < 400) return null;
  const fallback = `HTTP_${response.status}`;
  const type = response.headers.get("Content-Type") || "";
  if (!type.toLowerCase().includes("application/json")) return fallback;

  try {
    const payload = await response.clone().json();
    return errorCodeFromValue(payload?.code, response.status);
  } catch {
    return fallback;
  }
}

function safeCfRay(request) {
  const value = String(request.headers.get("CF-Ray") || "").trim();
  return /^[A-Za-z0-9-]{4,128}$/.test(value) ? value : null;
}

function requestId(request) {
  return safeCfRay(request) || crypto.randomUUID();
}

function safeColo(request) {
  const value = String(request.cf?.colo || "").trim().toUpperCase();
  return /^[A-Z0-9]{3,8}$/.test(value) ? value : null;
}

function safeErrorClass(error) {
  const name = String(error?.name || "Error").trim();
  return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name) ? name : "Error";
}

function eventLevel(status, event) {
  if (status >= 500 || event === "api.request.exception") return "error";
  if (status === 429 || event === "api.request.slow") return "warn";
  return "info";
}

function emit(level, payload) {
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function shouldAlwaysLog({ status, route, durationMs, slowMs }) {
  if (status >= 500 || status === 429) return true;
  if (durationMs >= slowMs) return true;
  if ((status === 401 || status === 403) && (route === "/api/auth/*" || route === "/api/admin/auth/*")) return true;
  return false;
}

function sampleRateFor(status, env) {
  if (status >= 400) {
    return boundedNumber(env?.OBSERVABILITY_CLIENT_ERROR_SAMPLE_RATE, DEFAULT_CLIENT_ERROR_SAMPLE_RATE, 0, 1);
  }
  return boundedNumber(env?.OBSERVABILITY_SUCCESS_SAMPLE_RATE, DEFAULT_SUCCESS_SAMPLE_RATE, 0, 1);
}

function classifyEvent({ status, route, durationMs, slowMs }) {
  if (status >= 500) return "api.request.failed";
  if (status === 429) return "api.rate_limited";
  if ((status === 401 || status === 403) && (route === "/api/auth/*" || route === "/api/admin/auth/*")) {
    return "api.auth.denied";
  }
  if (durationMs >= slowMs) return "api.request.slow";
  return "api.request.completed";
}

function withDiagnosticHeaders(response, id, durationMs) {
  const headers = new Headers(response.headers);
  headers.set("X-Request-Id", id);
  headers.set("Server-Timing", `app;dur=${durationMs}`);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export async function observeRequest(request, env, ctx, handler) {
  const startedAt = performance.now();
  const id = requestId(request);
  const url = new URL(request.url);
  const route = routeKey(url.pathname);
  const cfRay = safeCfRay(request);
  const colo = safeColo(request);
  const slowMs = boundedNumber(env?.OBSERVABILITY_SLOW_REQUEST_MS, DEFAULT_SLOW_REQUEST_MS, 250, 30_000);

  try {
    const response = await handler(request, env, ctx);
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    const errorCode = await responseErrorCode(response);
    const event = classifyEvent({ status: response.status, route, durationMs, slowMs });
    const alwaysLog = shouldAlwaysLog({ status: response.status, route, durationMs, slowMs });
    const sampled = alwaysLog || Math.random() < sampleRateFor(response.status, env);

    if (sampled) {
      const level = eventLevel(response.status, event);
      emit(level, {
        ts: new Date().toISOString(),
        event,
        level,
        service: "pasar-umkm",
        request_id: id,
        cf_ray: cfRay,
        colo,
        method: request.method,
        route,
        status: response.status,
        duration_ms: durationMs,
        outcome: response.status < 400 ? "success" : "error",
        error_code: errorCode
      });
    }

    return withDiagnosticHeaders(response, id, durationMs);
  } catch (error) {
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    emit("error", {
      ts: new Date().toISOString(),
      event: "api.request.exception",
      level: "error",
      service: "pasar-umkm",
      request_id: id,
      cf_ray: cfRay,
      colo,
      method: request.method,
      route,
      status: 500,
      duration_ms: durationMs,
      outcome: "error",
      error_code: "UNHANDLED_EXCEPTION",
      error_class: safeErrorClass(error)
    });

    return Response.json(
      {
        ok: false,
        error: "Layanan sedang mengalami gangguan. Coba lagi beberapa saat.",
        code: "INTERNAL_ERROR"
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
          "X-Request-Id": id,
          "Server-Timing": `app;dur=${durationMs}`
        }
      }
    );
  }
}

export const observabilityPolicy = Object.freeze({
  success_sample_rate: DEFAULT_SUCCESS_SAMPLE_RATE,
  client_error_sample_rate: DEFAULT_CLIENT_ERROR_SAMPLE_RATE,
  slow_request_ms: DEFAULT_SLOW_REQUEST_MS,
  raw_path_logged: false,
  query_string_logged: false,
  request_body_logged: false,
  cookies_logged: false,
  user_agent_logged: false,
  ip_address_logged: false
});
