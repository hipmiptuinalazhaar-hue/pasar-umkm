import { neon } from "@neondatabase/serverless";

const SESSION_COOKIE = "__Host-pasar_umkm_session";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_QRIS_BYTES = 3 * 1024 * 1024;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const piece of header.split(";")) {
    const [key, ...parts] = piece.trim().split("=");
    if (key === name) return parts.join("=") || null;
  }
  return null;
}

async function sellerStore(sql, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) {
    return { response: json({ ok: false, error: "Silakan masuk terlebih dahulu." }, 401) };
  }

  const users = await sql`
    SELECT u.id, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE
      s.token_hash = encode(digest(${token}, 'sha256'), 'hex')
      AND s.expires_at > NOW()
      AND u.is_active = TRUE
    LIMIT 1
  `;
  const user = users[0];
  if (!user) {
    return { response: json({ ok: false, error: "Session tidak valid atau sudah berakhir." }, 401) };
  }

  if (user.role !== "seller" && user.role !== "admin") {
    return {
      response: json({ ok: false, error: "Hanya pemilik UMKM yang dapat mengunggah foto." }, 403)
    };
  }

  const stores = await sql`
    SELECT id
    FROM stores
    WHERE owner_id = ${user.id}
    LIMIT 1
  `;
  if (!stores[0]) {
    return { response: json({ ok: false, error: "UMKM belum ditemukan." }, 403) };
  }

  return { store: stores[0], response: null };
}

async function uploadImage(request, env, kind) {
  const sql = neon(env.DATABASE_URL);
  const context = await sellerStore(sql, request);
  if (context.response) return context.response;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return json({ ok: false, error: "Foto belum dipilih." }, 400);
  }

  const type = String(file.type || "").toLowerCase();
  if (!ALLOWED_TYPES.has(type)) {
    return json({ ok: false, error: "Format foto harus JPG, PNG, atau WEBP." }, 400);
  }
  const maxBytes = kind === "qris" ? MAX_QRIS_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxBytes) {
    return json({ ok: false, error: `Ukuran foto maksimal ${kind === "qris" ? 3 : 5} MB.` }, 400);
  }

  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    console.error("Cloudinary configuration missing");
    return json({ ok: false, error: "Penyimpanan foto belum dikonfigurasi." }, 500);
  }

  const uploadBody = new FormData();
  uploadBody.append("file", file);
  const publicId = kind === "qris"
    ? `pasar-umkm/qris/${context.store.id}/merchant-qris`
    : `pasar-umkm/${kind === "post" ? "posts" : "products"}/${context.store.id}/${crypto.randomUUID()}`;
  uploadBody.append("public_id", publicId);
  uploadBody.append("overwrite", kind === "qris" ? "true" : "false");
  if (kind === "qris") uploadBody.append("invalidate", "true");

  const credentials = btoa(`${apiKey}:${apiSecret}`);
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}` },
      body: uploadBody
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.secure_url) {
    console.error("Cloudinary image upload error:", data);
    return json(
      {
        ok: false,
        error: "Foto gagal diunggah.",
        cloudinary_status: response.status,
        cloudinary_error: data?.error?.message || "Cloudinary tidak memberikan detail error."
      },
      502
    );
  }

  return json(
    {
      ok: true,
      message: kind === "qris" ? "QRIS merchant berhasil diunggah." : "Foto berhasil diunggah.",
      image: {
        url: data.secure_url,
        public_id: data.public_id || null,
        width: data.width || null,
        height: data.height || null,
        format: data.format || null,
        bytes: data.bytes || null
      }
    },
    201
  );
}

export async function handleImageUploadApi(request, env) {
  if (request.method !== "POST") return null;

  const pathname = new URL(request.url).pathname;
  if (
    pathname !== "/api/uploads/product-image" &&
    pathname !== "/api/uploads/post-image" &&
    pathname !== "/api/uploads/qris-image"
  ) {
    return null;
  }

  try {
    const kind = pathname === "/api/uploads/post-image"
      ? "post"
      : pathname === "/api/uploads/qris-image"
        ? "qris"
        : "product";
    return await uploadImage(request, env, kind);
  } catch (error) {
    console.error("Image upload error:", error);
    return json({ ok: false, error: "Terjadi kesalahan saat mengunggah foto." }, 500);
  }
}
