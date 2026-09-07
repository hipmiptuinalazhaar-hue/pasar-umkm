import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const JS_SOURCE = "js/app.js";
const JS_RUNTIME = "js/app.runtime.js";
const CSS_SOURCE = "css/style.css";
const CSS_RUNTIME = "css/style.runtime.css";
const INDEX = "index.html";
const ASSETS_IGNORE = ".assetsignore";

const CRITICAL_ASSETS = [
  "css/tokens.css",
  CSS_RUNTIME,
  "css/mobile-foundation-v2.css",
  "css/home-feed-v3.css",
  "css/tablet-desktop-v2.css",
  JS_RUNTIME,
  "js/chat-single-render-v6.js",
  "js/account-resilience.js",
  "js/profile-saved.js",
  "js/p8-commerce-integration.js"
];

async function sha12(path) {
  const data = await readFile(path);
  return createHash("sha256").update(data).digest("hex").slice(0, 12);
}

async function size(path) {
  return (await stat(path)).size;
}

async function assertReduction(source, runtime, minimum) {
  const sourceSize = await size(source);
  const runtimeSize = await size(runtime);
  const reduction = (sourceSize - runtimeSize) / sourceSize;

  console.log(
    `${source}: ${sourceSize} -> ${runtimeSize} bytes (${(reduction * 100).toFixed(1)}% smaller)`
  );

  if (runtimeSize >= sourceSize) {
    throw new Error(`${runtime} tidak lebih kecil dari source.`);
  }
  if (reduction < minimum) {
    throw new Error(
      `${runtime} reduction ${(reduction * 100).toFixed(1)}% di bawah target ${(minimum * 100).toFixed(0)}%.`
    );
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stampVersion(index, assetPath, version) {
  const pattern = new RegExp(`${escapeRegExp(assetPath)}\\?v=[^&\"']+`, "g");
  return index.replace(pattern, `${assetPath}?v=${version}`);
}

await build({
  entryPoints: [JS_SOURCE],
  outfile: JS_RUNTIME,
  bundle: false,
  minifyWhitespace: true,
  minifySyntax: true,
  minifyIdentifiers: false,
  target: ["es2022"],
  logLevel: "warning"
});

await build({
  entryPoints: [CSS_SOURCE],
  outfile: CSS_RUNTIME,
  bundle: false,
  minify: true,
  logLevel: "warning"
});

await assertReduction(JS_SOURCE, JS_RUNTIME, 0.20);
await assertReduction(CSS_SOURCE, CSS_RUNTIME, 0.15);

let index = await readFile(INDEX, "utf8");

const cssPattern = /css\/style(?:\.runtime)?\.css\?v=[^"']+/g;
const jsPattern = /js\/app(?:\.runtime)?\.js\?v=[^"']+/g;
const cssMatches = index.match(cssPattern) || [];
const jsMatches = index.match(jsPattern) || [];

if (cssMatches.length !== 1 || jsMatches.length !== 1) {
  throw new Error(
    `Index runtime reference tidak unik: css=${cssMatches.length}, js=${jsMatches.length}.`
  );
}

const fingerprints = new Map();
for (const assetPath of CRITICAL_ASSETS) {
  fingerprints.set(assetPath, await sha12(assetPath));
}

// Checkout routing is core commerce behavior, not a cosmetic enhancement. It is
// deployed as a critical deferred script so a stale lazy-loader can never route
// buyers back into the legacy checkout flow.
if (!index.includes('src="js/p8-commerce-integration.js?v=')) {
  const anchor = '  <script src="js/account-resilience.js';
  const p8Version = fingerprints.get("js/p8-commerce-integration.js");
  index = index.replace(
    anchor,
    `  <script src="js/p8-commerce-integration.js?v=${p8Version}" defer></script>\n${anchor}`
  );
}

for (const [assetPath, version] of fingerprints) {
  index = stampVersion(index, assetPath, version);
}

index = index.replace(
  '<script src="https://unpkg.com/@phosphor-icons/web"></script>',
  '<script src="https://unpkg.com/@phosphor-icons/web" defer></script>'
);

await writeFile(INDEX, index, "utf8");

const ignoreText = await readFile(ASSETS_IGNORE, "utf8");
const ignoreLines = ignoreText.split(/\r?\n/).filter(Boolean);
for (const required of [JS_SOURCE, CSS_SOURCE, "scripts/"]) {
  if (!ignoreLines.includes(required)) ignoreLines.push(required);
}
await writeFile(ASSETS_IGNORE, `${ignoreLines.join("\n")}\n`, "utf8");

for (const [assetPath, version] of fingerprints) {
  console.log(`asset-cache-key ${assetPath}=${version}`);
}
