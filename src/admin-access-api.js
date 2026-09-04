import {
  getAdminAccessContext,
  adminAuthorizationPolicy
} from "./admin-authorization.js";

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Pragma": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function groupPermissions(permissions) {
  const grouped = {};

  for (const permission of permissions) {
    if (!grouped[permission.resource]) grouped[permission.resource] = [];
    grouped[permission.resource].push({
      key: permission.key,
      action: permission.action,
      sensitive: permission.sensitive
    });
  }

  return grouped;
}

export async function handleAdminAccessApi(request, env) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/admin/access/")) return null;

  try {
    if (request.method === "GET" && url.pathname === "/api/admin/access/me") {
      const context = await getAdminAccessContext(request, env);
      if (!context.ok) return context.response;

      const admin = context.session;

      return json({
        ok: true,
        authenticated: true,
        policy_version: adminAuthorizationPolicy.version,
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email
        },
        roles: context.access.roles,
        permissions: context.access.permissions,
        capabilities: groupPermissions(context.access.permissions),
        session: {
          expires_at: admin.expires_at,
          idle_expires_at: admin.idle_expires_at,
          mfa_verified: Boolean(admin.mfa_verified_at)
        }
      });
    }

    return json({
      ok: false,
      error: "Admin access route tidak ditemukan.",
      code: "NOT_FOUND"
    }, 404);
  } catch (error) {
    console.error("Admin access error:", error);
    return json({
      ok: false,
      error: "Layanan otorisasi admin sementara tidak tersedia.",
      code: "ADMIN_ACCESS_ERROR"
    }, 500);
  }
}
