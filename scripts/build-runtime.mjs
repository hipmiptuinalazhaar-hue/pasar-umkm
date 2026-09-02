import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const JS_SOURCE = "js/app.js";
const JS_RUNTIME = "js/app.runtime.js";
const CSS_SOURCE = "css/style.css";
const CSS_RUNTIME = "css/style.runtime.css";
const INDEX = "index.html";
const ASSETS_IGNORE = ".assetsignore";

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

const jsVersion = await sha12(JS_RUNTIME);
const cssVersion = await sha12(CSS_RUNTIME);
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

index = index
  .replace(cssPattern, `css/style.runtime.css?v=${cssVersion}`)
  .replace(jsPattern, `js/app.runtime.js?v=${jsVersion}`)
  .replace(
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

console.log(`runtime-js-cache-key=${jsVersion}`);
console.log(`runtime-css-cache-key=${cssVersion}`);
