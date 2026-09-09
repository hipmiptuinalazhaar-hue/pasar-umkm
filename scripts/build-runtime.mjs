import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const JS_SOURCE = "js/app.js";
const JS_RUNTIME = "js/app.runtime.js";
const CSS_SOURCE = "css/style.css";
const CSS_RUNTIME = "css/style.runtime.css";
const INDEX = "index.html";
const ASSETS_IGNORE = ".assetsignore";
const TOKENS = "css/tokens.css";
const V10_BOOT = "js/performance-v10-a.js";
const REELS_BOOT = "js/reel-profile-separation.js";
const REELS_ENTRY = "js/reels-v4-entry.js";

const CRITICAL_ASSETS = [
  TOKENS,
  CSS_RUNTIME,
  "css/mobile-foundation-v2.css",
  "css/home-feed-v3.css",
  "css/tablet-desktop-v2.css",
  "css/public-experience-v9.css",
  V10_BOOT,
  JS_RUNTIME
];

const LAZY_BOOT_ASSETS = [
  "js/performance-v10-b.js",
  "js/performance-v10-c.js",
  REELS_ENTRY,
  "js/chat-single-render-v6.js",
  "js/p8-commerce-integration.js",
  "js/account-resilience.js",
  "js/profile-saved.js"
];

const REELS_GRAPH_ASSETS = [
  "css/reels-commerce-v4.css",
  "css/reels-advanced-creator-v4.css",
  "js/reels-commerce-v4.js",
  "js/reels-advanced-creator-v4.js"
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
  console.log(`${source}: ${sourceSize} -> ${runtimeSize} bytes (${(reduction * 100).toFixed(1)}% smaller)`);
  if (runtimeSize >= sourceSize) throw new Error(`${runtime} tidak lebih kecil dari source.`);
  if (reduction < minimum) {
    throw new Error(`${runtime} reduction ${(reduction * 100).toFixed(1)}% di bawah target ${(minimum * 100).toFixed(0)}%.`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stampVersion(text, assetPath, version) {
  const pattern = new RegExp(`${escapeRegExp(assetPath)}\\?v=[^&\"')]+`, "g");
  return text.replace(pattern, `${assetPath}?v=${version}`);
}

async function stampTokenImports() {
  let tokens = await readFile(TOKENS, "utf8");
  for (const dependency of ["css/mobile-foundation-v2.css", "css/ui-polish-v1.css"]) {
    const version = await sha12(dependency);
    const relativePath = `./${dependency.slice(4)}`;
    tokens = stampVersion(tokens, relativePath, version);
    console.log(`asset-cache-key ${dependency}=${version}`);
  }
  await writeFile(TOKENS, tokens, "utf8");
}

async function stampReelsGraph(path, label) {
  let boot = await readFile(path, "utf8");
  for (const assetPath of REELS_GRAPH_ASSETS) {
    const version = await sha12(assetPath);
    boot = stampVersion(boot, assetPath, version);
    console.log(`${label}-cache-key ${assetPath}=${version}`);
  }
  await writeFile(path, boot, "utf8");
}

async function stampLazyBootGraph() {
  let boot = await readFile(V10_BOOT, "utf8");
  for (const assetPath of LAZY_BOOT_ASSETS) {
    const version = await sha12(assetPath);
    boot = stampVersion(boot, assetPath, version);
    console.log(`lazy-cache-key ${assetPath}=${version}`);
  }
  await writeFile(V10_BOOT, boot, "utf8");
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

// Fingerprint nested dependencies before hashing their parent entrypoints.
await stampTokenImports();
await stampReelsGraph(REELS_BOOT, "reels-profile");
await stampReelsGraph(REELS_ENTRY, "reels-entry");
await stampLazyBootGraph();

let index = await readFile(INDEX, "utf8");
const cssPattern = /css\/style(?:\.runtime)?\.css\?v=[^"']+/g;
const jsPattern = /js\/app(?:\.runtime)?\.js\?v=[^"']+/g;
const cssMatches = index.match(cssPattern) || [];
const jsMatches = index.match(jsPattern) || [];
if (cssMatches.length !== 1 || jsMatches.length !== 1) {
  throw new Error(`Index runtime reference tidak unik: css=${cssMatches.length}, js=${jsMatches.length}.`);
}

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

const fingerprints = new Map();
for (const assetPath of CRITICAL_ASSETS) fingerprints.set(assetPath, await sha12(assetPath));
for (const [assetPath, version] of fingerprints) index = stampVersion(index, assetPath, version);

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

for (const [assetPath, version] of fingerprints) console.log(`asset-cache-key ${assetPath}=${version}`);
