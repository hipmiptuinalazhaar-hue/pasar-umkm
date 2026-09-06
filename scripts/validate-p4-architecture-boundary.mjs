import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const stat = file => fs.statSync(path.join(root, file));

const failures = [];
const expect = (condition, message) => {
  if (condition) console.log(`P4 ARCH PASS: ${message}`);
  else {
    failures.push(message);
    console.error(`P4 ARCH FAIL: ${message}`);
  }
};

const entry = read("src/worker-entry.js");
const auth = read("src/public-auth-api.js");
const category = read("src/category-api.js");
const seller = read("src/seller-catalog-api.js");
const posts = read("src/post-core-api.js");
const uploads = read("src/image-upload-api.js");
const srcFiles = fs.readdirSync(path.join(root, "src")).filter(name => name.endsWith(".js"));

expect(!fs.existsSync(path.join(root, "src/legacy-compat-router.js")), "legacy compatibility router is retired");
expect(!entry.includes("handleLegacyCompatibility"), "worker-entry has no legacy compatibility routing stage");
expect(!entry.includes('from "./worker.js"'), "worker-entry does not import the legacy monolith");
expect(!entry.includes("legacyWorker.fetch"), "worker-entry has no legacy escape hatch");

const legacyImportOwners = srcFiles.filter(name =>
  read(path.join("src", name)).includes('from "./worker.js"')
);
expect(legacyImportOwners.length === 0, "no runtime source imports worker.js");
expect(fs.existsSync(path.join(root, "src/worker.js")), "legacy worker remains source-only for audit history during P4 transition");

expect(
  entry.includes('code: "API_NOT_FOUND"') && entry.includes('if (url.pathname.startsWith("/api/"))'),
  "unknown API routes terminate fail-closed in worker-entry"
);
expect(entry.includes("return env.ASSETS.fetch(request);"), "static asset ownership remains explicit in worker-entry");

const ownerContracts = [
  ["public-auth-api.js", "handlePublicAuthApi", auth, 12_000],
  ["category-api.js", "handleCategoryApi", category, 4_000],
  ["seller-catalog-api.js", "handleSellerCatalogApi", seller, 24_000],
  ["post-core-api.js", "handlePostCoreApi", posts, 12_000],
  ["image-upload-api.js", "handleImageUploadApi", uploads, 12_000]
];

for (const [file, handler, source, budget] of ownerContracts) {
  expect(entry.includes(`from "./${file}"`), `${file} is imported by the modern entrypoint`);
  expect(entry.includes(`await ${handler}(request, env)`), `${handler} owns a routing stage`);
  expect(stat(`src/${file}`).size <= budget, `${file} stays within its focused module budget`);
  expect(!source.includes('from "./worker.js"'), `${file} is independent from the legacy monolith`);
}

expect(auth.includes("crypto.getRandomValues(new Uint8Array(32))"), "session tokens keep 256 bits of cryptographic randomness");
expect(auth.includes("gen_salt('bf', 12)"), "registration keeps bcrypt cost 12");
expect(auth.includes("password_hash = crypt(${password}, password_hash)"), "login verifies password against the stored bcrypt hash");
expect(auth.includes("encode(digest(${token}, 'sha256'), 'hex')"), "session tokens are hashed before database lookup/storage");
expect(auth.includes("HttpOnly; Secure; SameSite=Lax"), "public session cookie remains HttpOnly, Secure, and SameSite=Lax");
expect(auth.includes("const MAX_SESSION_AGE = 604800"), "public session lifetime remains seven days");
expect(auth.includes("Max-Age=0"), "invalid/logout sessions clear the browser cookie");
expect(auth.includes("SET last_used_at = NOW()"), "authenticated session reads refresh last-used telemetry");
expect(auth.includes("DELETE FROM sessions"), "logout revokes the server-side session");
expect(!auth.includes("DATABASE_URL =") && !auth.includes("CLOUDINARY_API_SECRET"), "auth module contains no embedded infrastructure secrets");

expect(category.includes("WHERE is_active = TRUE"), "categories expose active catalog entries only");
expect(category.includes("ORDER BY sort_order ASC, name ASC"), "category ordering remains deterministic");

for (const contract of [
  'url.pathname === "/api/stores/me"',
  'url.pathname === "/api/stores"',
  'url.pathname === "/api/products/me"',
  'url.pathname === "/api/products"',
  '/^\\/api\\/products\\/([^/]+)$/'
]) {
  expect(seller.includes(contract), `seller catalog preserves route contract ${contract}`);
}
expect(seller.includes("owner_id = ${userId}"), "seller store ownership remains server-side");
expect(seller.includes("store_id = ${owner.store.id}"), "product mutations remain scoped to the authenticated seller store");
expect(seller.includes("SET is_active = FALSE"), "product deletion remains a reversible soft delete");
expect(seller.includes("UUID_PATTERN"), "seller product mutations validate UUID identifiers");
expect(seller.includes("crypto.randomUUID()"), "new store/product slugs retain collision-resistant suffixes");
expect(seller.includes("is_active = TRUE"), "seller catalog preserves active-record guards");

expect(posts.includes('url.pathname === "/api/posts"'), "post core owns public list/create routes");
expect(posts.includes('/^\\/api\\/posts\\/([^/]+)$/'), "post core owns exact delete route matching");
expect(posts.includes("user.role !== \"seller\""), "post creation/deletion remains seller/admin restricted");
expect(posts.includes("store_id = ${stores[0].id}"), "post deletion remains store-owner scoped");
expect(posts.includes("SET is_active = FALSE"), "post deletion remains a soft delete");
expect(posts.includes('imageUrl.startsWith("https://res.cloudinary.com/")'), "post image URLs remain constrained to Cloudinary delivery");

expect(uploads.includes("const MAX_IMAGE_BYTES = 5 * 1024 * 1024"), "business image uploads keep a 5 MB hard limit");
expect(uploads.includes('"image/jpeg"') && uploads.includes('"image/png"') && uploads.includes('"image/webp"'), "business image uploads keep the image MIME allowlist");
expect(uploads.includes("user.role !== \"seller\""), "business image uploads remain seller/admin restricted");
expect(uploads.includes("WHERE owner_id = ${user.id}"), "business image uploads verify store ownership server-side");
expect(uploads.includes("env.CLOUDINARY_API_SECRET"), "Cloudinary secret is read only from Worker environment bindings");
expect(!uploads.includes("CLOUDINARY_API_SECRET ="), "Cloudinary secret is never embedded in source");
expect(uploads.includes("crypto.randomUUID()"), "business upload public IDs remain collision-resistant");

const routeOrder = [
  "const publicAuthResponse = await handlePublicAuthApi",
  "const categoryResponse = await handleCategoryApi",
  "const sellerCatalogResponse = await handleSellerCatalogApi",
  "const postCoreResponse = await handlePostCoreApi",
  "const imageUploadResponse = await handleImageUploadApi"
].map(marker => entry.indexOf(marker));
const api404 = entry.lastIndexOf("return apiNotFound()");
expect(routeOrder.every(index => index !== -1 && index < api404), "all extracted core routes execute before fail-closed API termination");

if (failures.length) {
  console.error(`\nP4 architecture retirement failed with ${failures.length} violation(s).`);
  process.exit(1);
}

console.log("\nP4 legacy runtime retirement contract: PASS");
