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

    // Semua URL selain /api/* tetap mengambil website statis.
    return env.ASSETS.fetch(request);
  }
};
