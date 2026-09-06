import fs from "node:fs";
import path from "node:path";
import { isLegacyCompatibilityRoute } from "../src/legacy-compat-router.js";

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
const compatibility = read("src/legacy-compat-router.js");
const auth = read("src/public-auth-api.js");
const category = read("src/category-api.js");
const srcFiles = fs.readdirSync(path.join(root, "src"))
  .filter(name => name.endsWith(".js"));

expect(!entry.includes('from "./worker.js"'), "worker-entry no longer imports the legacy monolith directly");
expect(entry.includes('from "./legacy-compat-router.js"'), "worker-entry delegates legacy compatibility through one boundary module");
expect(entry.includes("await handleLegacyCompatibility(request, env, ctx)"), "legacy compatibility is an explicit routing stage");
expect(!entry.includes("legacyWorker.fetch"), "worker-entry has no catch-all legacyWorker.fetch escape hatch");
expect(
  entry.includes('if (url.pathname.startsWith("/api/"))') && entry.includes('code: "API_NOT_FOUND"'),
  "unknown APIs terminate in the modern router with an explicit 404 contract"
);
expect(entry.includes("return env.ASSETS.fetch(request);"), "static traffic is served directly by the modern entrypoint");

const importOwners = srcFiles.filter(name =>
  read(path.join("src", name)).includes('from "./worker.js"')
);
expect(
  importOwners.length === 1 && importOwners[0] === "legacy-compat-router.js",
  "legacy worker has exactly one import owner"
);
expect(compatibility.includes("const EXACT_ROUTES = new Set"), "legacy compatibility uses a visible method-aware allowlist");
expect(stat("src/legacy-compat-router.js").size <= 4_500, "legacy compatibility boundary stays small enough to audit");

expect(
  entry.includes('from "./public-auth-api.js"') && entry.includes("await handlePublicAuthApi(request, env)"),
  "public authentication has a modular route owner"
);
expect(
  entry.includes('from "./category-api.js"') && entry.includes("await handleCategoryApi(request, env)"),
  "public categories have a modular route owner"
);
expect(!compatibility.includes("/api/auth/"), "public auth routes have been retired from legacy compatibility");
expect(!compatibility.includes("/api/categories"), "categories route has been retired from legacy compatibility");
expect(stat("src/public-auth-api.js").size <= 12_000, "public auth module stays within a focused module budget");
expect(stat("src/category-api.js").size <= 4_000, "category module stays within a focused module budget");

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
expect(category.includes("id,") && category.includes("slug,") && category.includes("is_home"), "category response preserves the public catalog fields");

const request = (method, pathname) => new Request(`https://p4.test${pathname}`, { method });
const allowed = [
  ["GET", "/api/stores/me"],
  ["POST", "/api/stores"],
  ["GET", "/api/products/me"],
  ["POST", "/api/products"],
  ["PATCH", "/api/products/11111111-1111-4111-8111-111111111111"],
  ["DELETE", "/api/products/11111111-1111-4111-8111-111111111111"],
  ["GET", "/api/posts"],
  ["POST", "/api/posts"],
  ["DELETE", "/api/posts/11111111-1111-4111-8111-111111111111"],
  ["POST", "/api/uploads/product-image"],
  ["POST", "/api/uploads/post-image"]
];

for (const [method, pathname] of allowed) {
  expect(
    isLegacyCompatibilityRoute(request(method, pathname)),
    `${method} ${pathname} remains explicitly compatible until extracted`
  );
}

const forbidden = [
  ["GET", "/api/health"],
  ["GET", "/api/categories"],
  ["POST", "/api/categories"],
  ["POST", "/api/auth/register"],
  ["POST", "/api/auth/login"],
  ["GET", "/api/auth/me"],
  ["POST", "/api/auth/logout"],
  ["GET", "/api/stores"],
  ["GET", "/api/products"],
  ["GET", "/api/posts/11111111-1111-4111-8111-111111111111/comments"],
  ["POST", "/api/products/11111111-1111-4111-8111-111111111111/comments"],
  ["DELETE", "/api/comments/11111111-1111-4111-8111-111111111111"],
  ["DELETE", "/api/product-comments/11111111-1111-4111-8111-111111111111"],
  ["GET", "/api/commerce/search?q=kopi"],
  ["GET", "/api/admin/auth/me"],
  ["GET", "/api/definitely-unknown"],
  ["GET", "/"]
];

for (const [method, pathname] of forbidden) {
  expect(
    !isLegacyCompatibilityRoute(request(method, pathname)),
    `${method} ${pathname} cannot fall through to the legacy monolith`
  );
}

const authStage = entry.indexOf("const publicAuthResponse = await handlePublicAuthApi");
const categoryStage = entry.indexOf("const categoryResponse = await handleCategoryApi");
const legacyStage = entry.indexOf("const legacyResponse = await handleLegacyCompatibility");
const assets = entry.lastIndexOf("return env.ASSETS.fetch(request);");
expect(
  authStage !== -1 && categoryStage !== -1 && legacyStage > authStage && legacyStage > categoryStage && assets > legacyStage,
  "modular auth/category ownership runs before legacy compatibility and static ownership"
);

if (failures.length) {
  console.error(`\nP4 architecture boundary failed with ${failures.length} violation(s).`);
  process.exit(1);
}

console.log("\nP4 architecture boundary contract: PASS");
