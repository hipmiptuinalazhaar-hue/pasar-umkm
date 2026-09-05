const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const TRUSTED_FETCH_SITES = new Set(["same-origin", "none"]);

function denied() {
  return Response.json(
    {
      ok: false,
      error: "Permintaan lintas-origin tidak diizinkan.",
      code: "ORIGIN_REJECTED"
    },
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

function normalizeOrigin(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return "invalid";
  }
}

export function enforceApiWriteOrigin(request) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/") || SAFE_METHODS.has(request.method)) {
    return null;
  }

  const requestOrigin = normalizeOrigin(request.headers.get("Origin"));
  if (requestOrigin && requestOrigin !== url.origin) {
    return denied();
  }

  const fetchSite = String(request.headers.get("Sec-Fetch-Site") || "")
    .trim()
    .toLowerCase();

  if (fetchSite && !TRUSTED_FETCH_SITES.has(fetchSite)) {
    return denied();
  }

  return null;
}

export const requestSecurityPolicy = Object.freeze({
  protected_prefix: "/api/",
  protected_methods: ["POST", "PUT", "PATCH", "DELETE"],
  trusted_fetch_sites: [...TRUSTED_FETCH_SITES],
  missing_browser_metadata_allowed: true,
  client_origin_must_match_request_origin: true
});
