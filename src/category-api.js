import { neon } from "@neondatabase/serverless";

const CATEGORY_CACHE_TTL_SECONDS = 30;

function json(data, status = 200, { cacheable = false } = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": cacheable
        ? `public, max-age=${CATEGORY_CACHE_TTL_SECONDS}`
        : "no-store"
    }
  });
}

function categoryCacheKey(request) {
  const url = new URL(request.url);
  return new Request(`${url.origin}/api/categories`, { method: "GET" });
}

export async function handleCategoryApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/categories" || request.method !== "GET") {
    return null;
  }

  const edgeCache = globalThis.caches?.default || null;
  const cacheKey = categoryCacheKey(request);

  if (edgeCache) {
    try {
      const cached = await edgeCache.match(cacheKey);
      if (cached) return cached;
    } catch (error) {
      console.warn("Categories edge cache read error:", error);
    }
  }

  try {
    const sql = neon(env.DATABASE_URL);
    const categories = await sql`
      SELECT
        id,
        name,
        slug,
        icon,
        sort_order,
        is_home
      FROM categories
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, name ASC
    `;

    const response = json({
      ok: true,
      count: categories.length,
      categories
    }, 200, { cacheable: true });

    if (edgeCache) {
      try {
        await edgeCache.put(cacheKey, response.clone());
      } catch (error) {
        console.warn("Categories edge cache write error:", error);
      }
    }

    return response;
  } catch (error) {
    console.error("Categories API error:", error);
    return json(
      {
        ok: false,
        error: "Failed to load categories"
      },
      500
    );
  }
}
