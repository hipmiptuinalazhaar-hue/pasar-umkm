import legacyWorker from "./worker.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EXACT_ROUTES = new Set([
  "GET /api/categories",
  "GET /api/stores/me",
  "POST /api/stores",
  "GET /api/products/me",
  "POST /api/products",
  "POST /api/auth/register",
  "POST /api/auth/login",
  "GET /api/auth/me",
  "POST /api/auth/logout",
  "GET /api/posts",
  "POST /api/posts",
  "POST /api/uploads/product-image",
  "POST /api/uploads/post-image"
]);

function dynamicLegacyRoute(method, pathname) {
  if (method === "PATCH" || method === "DELETE") {
    const productMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
    if (productMatch && UUID_PATTERN.test(productMatch[1])) {
      return true;
    }
  }

  if (method === "DELETE") {
    const postMatch = pathname.match(/^\/api\/posts\/([^/]+)$/);
    if (postMatch && UUID_PATTERN.test(postMatch[1])) {
      return true;
    }
  }

  return false;
}

export function isLegacyCompatibilityRoute(request) {
  const url = new URL(request.url);
  const method = String(request.method || "GET").toUpperCase();
  const key = `${method} ${url.pathname}`;

  return EXACT_ROUTES.has(key) || dynamicLegacyRoute(method, url.pathname);
}

export async function handleLegacyCompatibility(request, env, ctx) {
  if (!isLegacyCompatibilityRoute(request)) {
    return null;
  }

  return legacyWorker.fetch(request, env, ctx);
}
