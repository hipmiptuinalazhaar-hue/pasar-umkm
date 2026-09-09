import { neon } from "@neondatabase/serverless";

const CATEGORY_EDGE_TTL_SECONDS = 30;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function categoryCacheKey(request) {
  const url = new URL(request.url);
  return new Request(`${url.origin}/api/categories`, { method: "GET" });
}

function clientResponseFromCached(cached) {
  const response = new Response(cached.body, cached);
  response.headers.set("Cache-Control", "no-store");
  return response;
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
      if (cached) return clientResponseFromCached(cached);
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
    });

    if (edgeCache) {
      try {
        const cachedCopy = response.clone();
        cachedCopy.headers.set(
          "Cache-Control",
          `public, max-age=${CATEGORY_EDGE_TTL_SECONDS}`
        );
        await edgeCache.put(cacheKey, cachedCopy);
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
