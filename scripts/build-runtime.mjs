import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { build } from "esbuild";

const JS_SOURCE = "js/app.js";
const JS_RUNTIME = "js/app.runtime.js";
const CSS_SOURCE = "css/style.css";
const CSS_RUNTIME = "css/style.runtime.css";
const INDEX = "index.html";
const ASSETS_IGNORE = ".assetsignore";

const DIAGNOSTIC_ASSETS = [
  "css/tokens.css",
  CSS_RUNTIME,
  "css/mobile-foundation-v2.css",
  "css/home-feed-v3.css",
  "css/tablet-desktop-v2.css",
  "css/public-experience-v9.css",
  "css/ui-polish-v1.css",
  "css/reels-commerce-v4.css",
  "css/reels-advanced-creator-v4.css",
  "js/performance-v10-a.js",
  "js/performance-v10-b.js",
  "js/performance-v10-c.js",
  "js/navigation-refresh-guard.js",
  "js/reel-profile-separation.js",
  "js/reels-v4-entry.js",
  "js/reels-commerce-v4.js",
  "js/reels-advanced-creator-v4.js",
  "js/chat-single-render-v6.js",
  "js/p8-commerce-integration.js",
  "js/account-resilience.js",
  "js/profile-saved.js",
  JS_RUNTIME
];

async function sha12(filePath) {
  const data = await readFile(filePath);
  return createHash("sha256").update(data).digest("hex").slice(0, 12);
}

async function size(filePath) {
  return (await stat(filePath)).size;
}

async function assertReduction(source, runtime, minimum) {
  const sourceSize = await size(source);
  const runtimeSize = await size(runtime);
  const reduction = (sourceSize - runtimeSize) / sourceSize;
  console.log(`${source}: ${sourceSize} -> ${runtimeSize} bytes (${(reduction * 100).toFixed(1)}% smaller)`);
  if (runtimeSize >= sourceSize) throw new Error(`${runtime} tidak lebih kecil dari source.`);
  if (reduction < minimum) {
    throw new Error(`${runtime} reduction ${(reduction * 100).toFixed(1)}% di bawah target ${(minimum * 100).toFixed(0)}%.`);
  }
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

const index = await readFile(INDEX, "utf8");
const cssPattern = /css\/style(?:\.runtime)?\.css\?v=[^"']+/g;
const jsPattern = /js\/app(?:\.runtime)?\.js\?v=[^"']+/g;
const cssMatches = index.match(cssPattern) || [];
const jsMatches = index.match(jsPattern) || [];
if (cssMatches.length !== 1 || jsMatches.length !== 1) {
  throw new Error(`Index runtime reference tidak unik: css=${cssMatches.length}, js=${jsMatches.length}.`);
}
if (!index.includes("css/style.runtime.css?v=")) throw new Error("index.html harus memakai style.runtime.css.");
if (!index.includes("js/app.runtime.js?v=")) throw new Error("index.html harus memakai app.runtime.js.");
if (index.includes("Pembelian Saya")) throw new Error("index.html masih memakai label legacy Pembelian Saya.");

for (const forbidden of [
  "js/performance-v10-b.js",
  "js/performance-v10-c.js",
  "js/reels-v4-entry.js",
  "js/chat-single-render-v6.js",
  "js/p8-commerce-integration.js",
  "js/account-resilience.js",
  "js/profile-saved.js"
]) {
  if (index.includes(`src=\"${forbidden}`)) throw new Error(`${forbidden} tidak boleh menjadi initial script V10-A.`);
}

const ignoreText = await readFile(ASSETS_IGNORE, "utf8");
const ignoreLines = new Set(ignoreText.split(/\r?\n/).filter(Boolean));
for (const required of [JS_SOURCE, CSS_SOURCE, "scripts/"]) {
  if (!ignoreLines.has(required)) throw new Error(`${ASSETS_IGNORE} wajib mengabaikan ${required}.`);
}

for (const assetPath of DIAGNOSTIC_ASSETS) {
  console.log(`asset-cache-diagnostic ${assetPath}=${await sha12(assetPath)}`);
}

console.log("Runtime build complete: generated runtime outputs only; tracked source was not rewritten.");
