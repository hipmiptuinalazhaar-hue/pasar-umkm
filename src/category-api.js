import { neon } from "@neondatabase/serverless";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function handleCategoryApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/categories" || request.method !== "GET") {
    return null;
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

    return json({
      ok: true,
      count: categories.length,
      categories
    });
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
