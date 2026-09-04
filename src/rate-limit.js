const buckets = new Map();
let lastSweepAt = 0;

const RULES = [
  {
    name: "admin-auth-login",
    match: (request, url) => request.method === "POST" && url.pathname === "/api/admin/auth/login",
    limit: 5,
    windowMs: 15 * 60 * 1000,
    includeAccount: true
  },
  {
    name: "admin-auth-rotate-password",
    match: (request, url) => request.method === "POST" && url.pathname === "/api/admin/auth/rotate-password",
    limit: 5,
    windowMs: 30 * 60 * 1000,
    includeAccount: true
  },
  {
    name: "admin-mfa-challenge-write",
    match: (request, url) => request.method === "POST" && (
      url.pathname === "/api/admin/auth/mfa/enroll/start" ||
      url.pathname === "/api/admin/auth/mfa/enroll/verify" ||
      url.pathname === "/api/admin/auth/mfa/verify"
    ),
    limit: 10,
    windowMs: 5 * 60 * 1000,
    includeAdminChallenge: true
  },
  {
    name: "admin-step-up-write",
    match: (request, url) => request.method === "POST" && (
      url.pathname === "/api/admin/auth/step-up" ||
      url.pathname === "/api/admin/auth/mfa/recovery/regenerate"
    ),
    limit: 10,
    windowMs: 10 * 60 * 1000,
    includeAdminSession: true
  },
  {
    name: "admin-auth-session-write",
    match: (request, url) => request.method === "POST" && (
      url.pathname === "/api/admin/auth/logout" ||
      url.pathname === "/api/admin/auth/revoke-all"
    ),
    limit: 30,
    windowMs: 10 * 60 * 1000,
    includeAdminSession: true
  },
  {
    name: "admin-security-read",
    match: (request, url) => request.method === "GET" && (
      url.pathname === "/api/admin/auth/mfa/status" ||
      url.pathname.startsWith("/api/admin/security/")
    ),
    limit: 120,
    windowMs: 60 * 1000,
    includeAdminSession: true
  },
  {
    name: "admin-security-write",
    match: (request, url) => request.method === "POST" && url.pathname.startsWith("/api/admin/security/"),
    limit: 20,
    windowMs: 10 * 60 * 1000,
    includeAdminSession: true
  },
  {
    name: "admin-access-read",
    match: (request, url) => request.method === "GET" && url.pathname === "/api/admin/access/me",
    limit: 120,
    windowMs: 60 * 1000,
    includeAdminSession: true
  },
  {
    name: "admin-control-read",
    match: (request, url) => request.method === "GET" && url.pathname.startsWith("/api/admin/control/"),
    limit: 180,
    windowMs: 60 * 1000,
    includeAdminSession: true
  },
  {
    name: "admin-control-write",
    match: (request, url) => ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && url.pathname.startsWith("/api/admin/control/"),
    limit: 30,
    windowMs: 10 * 60 * 1000,
    includeAdminSession: true
  },
  {
    name: "auth-login",
    match: (request, url) => request.method === "POST" && url.pathname === "/api/auth/login",
    limit: 10,
    windowMs: 5 * 60 * 1000,
    includeAccount: true
  },
  {
    name: "auth-register",
    match: (request, url) => request.method === "POST" && url.pathname === "/api/auth/register",
    limit: 5,
    windowMs: 60 * 60 * 1000,
    includeAccount: true
  },
  {
    name: "public-catalog",
    match: (request, url) => request.method === "GET" && (
      url.pathname === "/api/products" ||
      url.pathname === "/api/stores"
    ),
    limit: 240,
    windowMs: 60 * 1000
  },
  {
    name: "story-upload",
    match: (request, url) => request.method === "POST" && url.pathname === "/api/story-v2/upload-image",
    limit: 30,
    windowMs: 10 * 60 * 1000,
    includeSession: true
  },
  {
    name: "chat-upload",
    match: (request, url) => request.method === "POST" && url.pathname === "/api/chat/media/upload",
    limit: 40,
    windowMs: 10 * 60 * 1000,
    includeSession: true
  },
  {
    name: "chat-media-cleanup",
    match: (request, url) => request.method === "POST" && url.pathname === "/api/chat/media/cleanup",
    limit: 30,
    windowMs: 10 * 60 * 1000,
    includeSession: true
  },
  {
    name: "comment-write",
    match: (request, url) => {
      if (request.method === "POST") {
        return /^\/api\/posts\/[0-9a-f-]{36}\/comments$/i.test(url.pathname) || /^\/api\/products\/[0-9a-f-]{36}\/comments$/i.test(url.pathname);
      }
      if (request.method === "DELETE") {
        return /^\/api\/comments\/[0-9a-f-]{36}$/i.test(url.pathname) || /^\/api\/product-comments\/[0-9a-f-]{36}$/i.test(url.pathname);
      }
      return false;
    },
    limit: 60,
    windowMs: 10 * 60 * 1000,
    includeSession: true
  },
  {
    name: "avatar-upload",
    match: (request, url) => request.method === "PUT" && url.pathname === "/api/profile/avatar",
    limit: 20,
    windowMs: 60 * 60 * 1000,
    includeSession: true
  }
];

function clientAddress(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
}

async function digestKey(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest).slice(0, 16)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function accountHint(request) {
  try {
    const body = await request.clone().json();
    const raw = String(body?.email || body?.phone || body?.username || "").trim().toLowerCase().slice(0, 180);
    return raw ? digestKey(raw) : null;
  } catch {
    return null;
  }
}

async function cookieSessionHint(request, cookieName) {
  const cookie = request.headers.get("Cookie") || "";
  const escaped = cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return match?.[1] ? digestKey(match[1]) : null;
}

function sweep(now) {
  if (now - lastSweepAt < 60_000) return;
  lastSweepAt = now;
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}

function consume(key, limit, windowMs, now) {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt: next.resetAt };
  }
  current.count += 1;
  buckets.set(key, current);
  return { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}

function limited(rule, result) {
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return Response.json({ ok: false, error: "Terlalu banyak percobaan. Coba lagi setelah beberapa saat.", code: "RATE_LIMITED" }, {
    status: 429,
    headers: {
      "Cache-Control": "no-store",
      "Retry-After": String(retryAfter),
      "X-RateLimit-Limit": String(rule.limit),
      "X-RateLimit-Remaining": "0"
    }
  });
}

export async function enforceRateLimit(request) {
  const url = new URL(request.url);
  const rule = RULES.find(item => item.match(request, url));
  if (!rule) return null;
  const now = Date.now();
  sweep(now);
  const ipHash = await digestKey(clientAddress(request));
  const keys = [`${rule.name}:ip:${ipHash}`];
  if (rule.includeAccount) {
    const account = await accountHint(request);
    if (account) keys.push(`${rule.name}:acct:${account}`);
  }
  if (rule.includeSession) {
    const session = await cookieSessionHint(request, "__Host-pasar_umkm_session");
    if (session) keys.push(`${rule.name}:session:${session}`);
  }
  if (rule.includeAdminSession) {
    const adminSession = await cookieSessionHint(request, "__Host-pasar_umkm_admin");
    if (adminSession) keys.push(`${rule.name}:admin-session:${adminSession}`);
  }
  if (rule.includeAdminChallenge) {
    const adminChallenge = await cookieSessionHint(request, "__Host-pasar_umkm_admin_challenge");
    if (adminChallenge) keys.push(`${rule.name}:admin-challenge:${adminChallenge}`);
  }
  for (const key of keys) {
    const result = consume(key, rule.limit, rule.windowMs, now);
    if (!result.allowed) return limited(rule, result);
  }
  return null;
}

export const rateLimitPolicy = RULES.map(({ name, limit, windowMs }) => ({
  name,
  limit,
  window_seconds: Math.round(windowMs / 1000)
}));
