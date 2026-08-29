import { neon } from "@neondatabase/serverless";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ==========================================
    // API HEALTH CHECK + DATABASE TEST
    // ==========================================
    if (url.pathname === "/api/health") {
      try {
        const sql = neon(env.DATABASE_URL);

        const result = await sql`
          SELECT
            current_database() AS database,
            (
              SELECT COUNT(*)::int
              FROM information_schema.tables
              WHERE table_schema = 'public'
            ) AS tables
        `;

        return Response.json({
          ok: true,
          app: "Pasar UMKM",
          backend: "Cloudflare Workers",
          database: {
            connected: true,
            name: result[0].database,
            tables: result[0].tables
          }
        });
      } catch (error) {
        console.error("Database connection error:", error);

        return Response.json(
          {
            ok: false,
            app: "Pasar UMKM",
            database: {
              connected: false
            },
            error: "Database connection failed"
          },
          { status: 500 }
        );
      }
    }

    // ==========================================
    // API CATEGORIES
    // ==========================================
    if (url.pathname === "/api/categories" && request.method === "GET") {
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

        return Response.json({
          ok: true,
          count: categories.length,
          categories
        });
      } catch (error) {
        console.error("Categories API error:", error);

        return Response.json(
          {
            ok: false,
            error: "Failed to load categories"
          },
          { status: 500 }
        );
      }
    }

    // ==========================================
    // STATIC WEBSITE
    // ==========================================
    return env.ASSETS.fetch(request);
  }
};
