import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const exists = file => fs.existsSync(path.join(root, file));
const size = file => fs.statSync(path.join(root, file)).size;
const failures = [];
const expect = (condition, message) => {
  if (condition) console.log(`P4 ARCH PASS: ${message}`);
  else { failures.push(message); console.error(`P4 ARCH FAIL: ${message}`); }
};

const entry = read("src/worker-entry.js");
const auth = read("src/public-auth-api.js");
const authV2 = read("src/public-auth-security-v2-api.js");
const category = read("src/category-api.js");
const seller = read("src/seller-catalog-api.js");
const posts = read("src/post-core-api.js");
const upload = read("src/image-upload-api.js");
const media = read("src/media-social-api.js");

expect(!exists("src/worker.js"), "legacy worker monolith has been removed from active source");
expect(!exists("src/legacy-compat-router.js"), "legacy compatibility router has been removed");
expect(!entry.includes("legacyWorker"), "worker-entry contains no legacy runtime escape hatch");
expect(!entry.includes("handleLegacyCompatibility"), "worker-entry contains no compatibility routing stage");

const srcFiles = fs.readdirSync(path.join(root, "src")).filter(name => name.endsWith(".js"));
const legacyReferences = srcFiles.filter(name => {
  const text = read(path.join("src", name));
  return text.includes('"./worker.js"') || text.includes('"./legacy-compat-router.js"');
});
expect(legacyReferences.length === 0, "no active source imports retired legacy worker modules");

for (const [modulePath, importMarker, callMarker, label] of [
  ["src/public-auth-api.js", 'from "./public-auth-api.js"', "await handlePublicAuthApi(request, env)", "public authentication"],
  ["src/category-api.js", 'from "./category-api.js"', "await handleCategoryApi(request, env)", "categories"],
  ["src/seller-catalog-api.js", 'from "./seller-catalog-api.js"', "await handleSellerCatalogApi(request, env)", "seller catalog"],
  ["src/post-core-api.js", 'from "./post-core-api.js"', "await handlePostCoreApi(request, env)", "post core"],
  ["src/image-upload-api.js", 'from "./image-upload-api.js"', "await handleImageUploadApi(request, env)", "image uploads"]
]) {
  expect(exists(modulePath), `${label} module exists`);
  expect(entry.includes(importMarker) && entry.includes(callMarker), `${label} has an explicit runtime owner`);
}

expect(entry.includes('if (url.pathname.startsWith("/api/")) return apiNotFound();') && entry.includes('code: "API_NOT_FOUND"'), "unknown APIs terminate fail-closed in the modern router");
expect(entry.includes("return env.ASSETS.fetch(request);"), "static assets remain owned by the modern entrypoint");

expect(auth.includes("crypto.getRandomValues(new Uint8Array(32))"), "login session tokens keep 256 bits of cryptographic randomness");
expect(auth.includes("password_hash = crypt(${password}, password_hash)"), "login verifies against the stored bcrypt hash");
expect(auth.includes("encode(digest(${token}, 'sha256'), 'hex')"), "public session tokens are hashed for storage and lookup");
expect(auth.includes("HttpOnly; Secure; SameSite=Lax"), "public session cookies remain hardened");
expect(auth.includes("const MAX_SESSION_AGE = 604800"), "public sessions retain seven-day browser expiry");
expect(auth.includes("Max-Age=0"), "invalid and logout paths clear browser sessions");
expect(auth.includes("DELETE FROM sessions"), "logout revokes server-side sessions");
expect(auth.includes("handlePublicAuthSecurityV2Api"), "registration and recovery delegate to Auth Security V2");
expect(!auth.includes("registration_manual"), "core auth has no manual verified-registration bypass");

expect(authV2.includes("gen_salt('bf', 12)"), "registration pending password uses bcrypt cost 12");
expect(authV2.includes('return "register-start"'), "Auth V2 owns registration start");
expect(authV2.includes('return "register-verify"'), "Auth V2 owns registration verification");
expect(authV2.includes("FOR UPDATE"), "Auth V2 locks verification challenges");
expect(authV2.includes('INSERT INTO users(name,email,password_hash,email_verified,email_verified_at,last_login_at)'), "verified flow owns user creation");
expect(authV2.includes('INSERT INTO sessions(user_id,token_hash,expires_at)'), "verified flow owns first authenticated session creation");
expect(authV2.includes('await client.query("BEGIN")') && authV2.includes('await client.query("COMMIT")'), "Auth V2 account/reset writes are transactional");
expect(!authV2.includes("CLOUDINARY_API_SECRET") && !authV2.includes("DATABASE_URL ="), "Auth V2 embeds no infrastructure secret");

expect(category.includes("WHERE is_active = TRUE"), "categories expose active records only");
expect(category.includes("ORDER BY sort_order ASC, name ASC"), "category ordering stays deterministic");

for (const route of ["/api/stores/me", "/api/stores", "/api/products/me", "/api/products"]) {
  expect(seller.includes(route), `seller module owns ${route}`);
}
expect(seller.includes("store_id = ${owner.store.id}"), "product mutations remain store-owner scoped");
expect(seller.includes("SET is_active = FALSE, updated_at = NOW()"), "product deletion remains a soft delete");
expect(seller.includes("UUID_PATTERN.test"), "seller product mutations validate UUIDs");
expect(seller.includes("WHERE id = ${categoryId}::uuid AND is_active = TRUE"), "seller product category validation remains server-side");

expect(posts.includes('url.pathname === "/api/posts"'), "post feed/create routes have a modern owner");
expect(posts.includes("request.method === \"DELETE\""), "post deletion has a modern owner");
expect(posts.includes("WHERE owner_id = ${user.id}"), "post mutations resolve seller ownership server-side");
expect(posts.includes("SET is_active = FALSE, updated_at = NOW()"), "post deletion remains a soft delete");
expect(posts.includes('imageUrl.startsWith("https://res.cloudinary.com/")'), "post image URLs retain provider validation");

expect(upload.includes('new Set(["image/jpeg", "image/png", "image/webp"])'), "image upload MIME allowlist remains explicit");
expect(upload.includes("const MAX_IMAGE_BYTES = 5 * 1024 * 1024"), "image upload remains capped at 5 MB");
expect(upload.includes("matchesImageSignature"), "image upload validates magic signatures");
expect(upload.includes("WHERE owner_id = ${user.id}"), "image upload resolves store ownership server-side");
expect(upload.includes("env.CLOUDINARY_API_SECRET"), "image upload reads Cloudinary secret only from runtime environment");
expect(upload.includes("crypto.randomUUID()"), "image upload public IDs remain collision-resistant");

expect(media.includes('handleReelsV4SecureCreateApi'), "Reels create has an explicit secure boundary");
expect(media.includes('SERVER_AUTHORITATIVE_EVENT'), "client cannot assert server-authoritative transaction event");

expect(size("src/public-auth-api.js") <= 12_000, "public auth stays within focused module budget");
expect(size("src/public-auth-security-v2-api.js") <= 32_000, "Auth V2 stays within bounded security module budget");
expect(size("src/category-api.js") <= 4_000, "category module stays within focused module budget");
expect(size("src/seller-catalog-api.js") <= 24_000, "seller catalog stays within bounded module budget");
expect(size("src/post-core-api.js") <= 12_000, "post core stays within focused module budget");
expect(size("src/image-upload-api.js") <= 12_000, "image upload stays within focused module budget");

const order = [
  "const publicAuthResponse = await handlePublicAuthApi",
  "const categoryResponse = await handleCategoryApi",
  "const sellerCatalogResponse = await handleSellerCatalogApi",
  "const postCoreResponse = await handlePostCoreApi",
  "const imageUploadResponse = await handleImageUploadApi"
].map(marker => entry.indexOf(marker));
const api404 = entry.lastIndexOf('code: "API_NOT_FOUND"');
const assets = entry.lastIndexOf("return env.ASSETS.fetch(request);");
expect(order.every(index => index !== -1), "all modular domains are present in the route chain");
expect(assets > Math.max(...order), "static ownership follows all modular API stages");
expect(api404 !== -1, "modern API 404 contract remains present");

if (failures.length) {
  console.error(`\nP4 architecture retirement failed with ${failures.length} violation(s).`);
  process.exit(1);
}
console.log("\nP4 architecture and Auth V2 ownership contract: PASS");
