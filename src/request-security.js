const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const TRUSTED_FETCH_SITES = new Set(["same-origin", "none"]);
const LEGACY_PUBLIC_ADMIN_PREFIX = "/api/commerce/admin";

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

function originDenied() {
  return jsonDenied(
    "Permintaan lintas-origin tidak diizinkan.",
    "ORIGIN_REJECTED"
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

  return null;
}

export const requestSecurityPolicy = Object.freeze({
  protected_prefix: "/api/",
  protected_methods: ["POST", "PUT", "PATCH", "DELETE"],
  trusted_fetch_sites: [...TRUSTED_FETCH_SITES],
  legacy_public_admin_prefix: LEGACY_PUBLIC_ADMIN_PREFIX,
  missing_browser_metadata_allowed: true,
  client_origin_must_match_request_origin: true,
  public_admin_routes_disabled: true
});
