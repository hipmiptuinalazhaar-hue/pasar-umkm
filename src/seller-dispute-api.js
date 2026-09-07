import { neon } from "@neondatabase/serverless";

const SESSION_COOKIE = "__Host-pasar_umkm_session";

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control":"no-store, max-age=0", "X-Content-Type-Options":"nosniff" }
  });
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}

async function sellerDisputes(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return json({ ok:false, code:"AUTH_REQUIRED", error:"Silakan login terlebih dahulu." }, 401);
  const sql = neon(env.DATABASE_URL);
  const users = await sql`
    SELECT u.id FROM sessions sess
    JOIN users u ON u.id=sess.user_id
    WHERE sess.token_hash=encode(digest(${token},'sha256'),'hex')
      AND sess.expires_at>NOW() AND u.is_active=TRUE
    LIMIT 1
  `;
  const user = users[0];
  if (!user) return json({ ok:false, code:"AUTH_REQUIRED", error:"Session tidak valid." }, 401);
  const stores = await sql`SELECT id, name FROM stores WHERE owner_id=${user.id} ORDER BY created_at ASC LIMIT 1`;
  const store = stores[0];
  if (!store) return json({ ok:true, store:null, disputes:[] });
  const rows = await sql`
    SELECT d.id, d.order_id, d.reason_code, d.description, d.status,
      d.seller_response, d.resolution_note, d.resolved_at, d.created_at, d.updated_at,
      o.order_number, o.total, o.status::text AS order_status,
      u.name AS buyer_name
    FROM order_disputes d
    JOIN orders o ON o.id=d.order_id
    JOIN users u ON u.id=d.buyer_id
    WHERE d.store_id=${store.id}
    ORDER BY CASE d.status WHEN 'open' THEN 0 WHEN 'admin_review' THEN 1 WHEN 'seller_response' THEN 2 ELSE 3 END,
      d.created_at DESC, d.id DESC
    LIMIT 100
  `;
  return json({ ok:true, store, disputes:rows });
}

export async function handleSellerDisputeApi(request, env) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/disputes/seller") return sellerDisputes(request, env);
  return null;
}