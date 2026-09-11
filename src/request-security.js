const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const TRUSTED_FETCH_SITES = new Set(["same-origin", "none"]);
const LEGACY_PUBLIC_ADMIN_PREFIX = "/api/commerce/admin";
const SESSION_COOKIE_NAMES = Object.freeze([
  "__Host-pasar_umkm_session",
  "__Host-pasar_umkm_admin",
  "__Host-pasar_umkm_admin_challenge"
]);
const SESSION_COOKIE_PATTERN = new RegExp(`(?:^|;\\s*)(?:${SESSION_COOKIE_NAMES.join("|")})=`);

function jsonDenied(error, code) {
  return Response.json(
    { ok: false, error, code },
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Pragma": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer"
      }
    }
  );
}

function originDenied(code = "ORIGIN_REJECTED") {
  return jsonDenied(
    "Permintaan lintas-origin tidak diizinkan.",
    code
  );
}

function legacyAdminDenied() {
  return jsonDenied(
    "Endpoint admin publik lama sudah dinonaktifkan.",
    "PUBLIC_ADMIN_ROUTE_DISABLED"
  );
}

function normalizeOrigin(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return "invalid";
  }
}

function hasSessionCookie(request) {
  return SESSION_COOKIE_PATTERN.test(String(request.headers.get("Cookie") || ""));
}

export function enforceRequestSecurity(request) {
  const url = new URL(request.url);

  if (url.pathname.startsWith(LEGACY_PUBLIC_ADMIN_PREFIX)) {
    return legacyAdminDenied();
  }

  if (!url.pathname.startsWith("/api/") || SAFE_METHODS.has(request.method)) {
    return null;
  }

  const requestOrigin = normalizeOrigin(request.headers.get("Origin"));
  if (requestOrigin && requestOrigin !== url.origin) {
    return originDenied();
  }

  const fetchSite = String(request.headers.get("Sec-Fetch-Site") || "")
    .trim()
    .toLowerCase();

  if (fetchSite && !TRUSTED_FETCH_SITES.has(fetchSite)) {
    return originDenied();
  }

  // Cookie-authenticated state changes must prove browser provenance. Modern
  // same-origin browsers send Origin and/or Sec-Fetch-Site on these requests.
  // Non-browser public API clients without session cookies remain compatible.
  if (hasSessionCookie(request) && !requestOrigin && !fetchSite) {
    return originDenied("BROWSER_PROVENANCE_REQUIRED");
  }

  return null;
}

export const requestSecurityPolicy = Object.freeze({
  protected_prefix: "/api/",
  protected_methods: ["POST", "PUT", "PATCH", "DELETE"],
  trusted_fetch_sites: [...TRUSTED_FETCH_SITES],
  legacy_public_admin_prefix: LEGACY_PUBLIC_ADMIN_PREFIX,
  session_cookie_names: [...SESSION_COOKIE_NAMES],
  missing_browser_metadata_allowed: "only_without_session_cookie",
  session_writes_require_browser_provenance: true,
  client_origin_must_match_request_origin: true,
  public_admin_routes_disabled: true
});