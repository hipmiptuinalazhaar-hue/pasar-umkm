import fs from "node:fs";
import path from "node:path";
import { isLegacyCompatibilityRoute } from "../src/legacy-compat-router.js";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const stat = file => fs.statSync(path.join(root, file));

const failures = [];
const expect = (condition, message) => {
  if (condition) {
    console.log(`P4 ARCH PASS: ${message}`);
  } else {
    failures.push(message);
    console.error(`P4 ARCH FAIL: ${message}`);
  }
};

const entry = read("src/worker-entry.js");
const compatibility = read("src/legacy-compat-router.js");
const srcFiles = fs.readdirSync(path.join(root, "src"))
  .filter(name => name.endsWith(".js"));

expect(
  !entry.includes('from "./worker.js"'),
  "worker-entry no longer imports the legacy monolith directly"
);
expect(
  entry.includes('from "./legacy-compat-router.js"'),
  "worker-entry delegates legacy compatibility through one boundary module"
);
expect(
  entry.includes("await handleLegacyCompatibility(request, env, ctx)"),
  "legacy compatibility is an explicit routing stage"
);
expect(
  !entry.includes("legacyWorker.fetch"),
  "worker-entry has no catch-all legacyWorker.fetch escape hatch"
);
expect(
  entry.includes('if (url.pathname.startsWith("/api/"))') &&
    entry.includes('code: "API_NOT_FOUND"'),
  "unknown APIs terminate in the modern router with an explicit 404 contract"
);
expect(
  entry.includes("return env.ASSETS.fetch(request);"),
  "static traffic is served directly by the modern entrypoint"
);

const importOwners = srcFiles.filter(name =>
  read(path.join("src", name)).includes('from "./worker.js"')
);
expect(
  importOwners.length === 1 && importOwners[0] === "legacy-compat-router.js",
  "legacy worker has exactly one import owner"
);
expect(
  compatibility.includes("const EXACT_ROUTES = new Set"),
  "legacy compatibility uses a visible method-aware allowlist"
);
expect(
  stat("src/legacy-compat-router.js").size <= 4_500,
  "legacy compatibility boundary stays small enough to audit"
);

const request = (method, pathname) => new Request(`https://p4.test${pathname}`, { method });
const allowed = [
  ["GET", "/api/categories"],
  ["GET", "/api/stores/me"],
  ["POST", "/api/stores"],
  ["GET", "/api/products/me"],
  ["POST", "/api/products"],
  ["PATCH", "/api/products/11111111-1111-4111-8111-111111111111"],
  ["DELETE", "/api/products/11111111-1111-4111-8111-111111111111"],
  ["POST", "/api/auth/register"],
  ["POST", "/api/auth/login"],
  ["GET", "/api/auth/me"],
  ["POST", "/api/auth/logout"],
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
  ["GET", "/api/stores"],
  ["GET", "/api/products"],
  ["GET", "/api/posts/11111111-1111-4111-8111-111111111111/comments"],
  ["POST", "/api/products/11111111-1111-4111-8111-111111111111/comments"],
  ["DELETE", "/api/comments/11111111-1111-4111-8111-111111111111"],
  ["DELETE", "/api/product-comments/11111111-1111-4111-8111-111111111111"],
  ["GET", "/api/commerce/search?q=kopi"],
  ["GET", "/api/admin/auth/me"],
  ["GET", "/api/definitely-unknown"],
  ["POST", "/api/categories"],
  ["GET", "/"]
];

for (const [method, pathname] of forbidden) {
  expect(
    !isLegacyCompatibilityRoute(request(method, pathname)),
    `${method} ${pathname} cannot fall through to the legacy monolith`
  );
}

const modernNotFound = entry.indexOf("const legacyResponse = await handleLegacyCompatibility");
const api404 = entry.indexOf('code: "API_NOT_FOUND"');
const assets = entry.lastIndexOf("return env.ASSETS.fetch(request);");
expect(
  modernNotFound !== -1 && api404 !== -1 && assets > modernNotFound,
  "legacy boundary, modern API termination, and static asset ownership are all explicit"
);

if (failures.length) {
  console.error(`\nP4 architecture boundary failed with ${failures.length} violation(s).`);
  process.exit(1);
}

console.log("\nP4 architecture boundary contract: PASS");
