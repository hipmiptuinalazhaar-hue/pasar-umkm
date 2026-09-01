import { neon } from "@neondatabase/serverless";
import { ensureStoreSocialLinksTable } from "./profile-social-store.js";

export async function handlePublicProfileApi(request, env) {
  const url = new URL(request.url);

  if (
    url.pathname !== "/api/public-profiles" ||
    request.method !== "GET"
  ) {
    return null;
  }

  try {
    const sql = neon(env.DATABASE_URL);

    await ensureStoreSocialLinksTable(sql);

    const profiles = await sql`
      SELECT
        s.id AS store_id,
        s.name AS store_name,
        s.slug AS store_slug,
        s.description,
        s.logo_url,
        s.cover_url,
        s.phone,
        s.whatsapp,
        s.address,
        s.district,
        s.city,
        s.province,
        s.verification_status,
        sl.instagram_url,
        sl.tiktok_url,
        u.id AS user_id,
        u.name AS user_name,
        u.avatar_url AS user_avatar_url,
        u.role AS user_role
      FROM stores s
      JOIN users u
        ON u.id = s.owner_id
      LEFT JOIN store_social_links sl
        ON sl.store_id = s.id
      WHERE
        s.is_active = TRUE
        AND u.is_active = TRUE
      ORDER BY s.created_at DESC
    `;

    return Response.json(
      {
        ok: true,
        count: profiles.length,
        profiles
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("Public profile API error:", error);

    return Response.json(
      {
        ok: false,
        error: "Profil publik belum dapat dimuat."
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }
}
