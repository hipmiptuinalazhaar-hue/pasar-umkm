import { readFile } from "node:fs/promises";

const [index, css] = await Promise.all([
  readFile("index.html", "utf8"),
  readFile("css/public-experience-v9.css", "utf8")
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const v9Entry = '<style id="publicExperienceV9Entry">';
const responsiveLink = /<link\s+rel="stylesheet"\s+href="css\/tablet-desktop-v2\.css\?v=([0-9a-f]{12})"\s+media="screen and \(min-width: 768px\)">/;

assert(index.includes(v9Entry), "Public Experience V9 inline cascade entry is missing.");
assert(
  index.includes('@import url("css/public-experience-v9.css?v=9.0.0");'),
  "Public Experience V9 CSS is not imported by the final cascade entry."
);
assert(responsiveLink.test(index), "Responsive V2 must remain direct-linked with its deterministic fingerprint.");
assert(
  index.indexOf(v9Entry) > index.search(responsiveLink),
  "V9 final cascade entry must load after Responsive V2."
);

const firstPartyStyles = [...index.matchAll(/<link[^>]+href="css\//g)];
assert(
  firstPartyStyles.length === 5,
  `Critical shell must keep exactly five first-party stylesheets (${firstPartyStyles.length}).`
);

assert(
  index.includes("Belanja produk <span>UMKM Lubuklinggau</span> dengan lebih mudah."),
  "V9 marketplace hero copy is missing."
);

for (const contract of [
  "@media (max-width: 767px)",
  "@media (min-width: 768px)",
  "@media (min-width: 1024px)",
  "@media (min-width: 1280px)"
]) {
  assert(css.includes(contract), `Missing responsive contract: ${contract}`);
}

assert(
  /@media \(min-width: 768px\)[\s\S]*?\.app > \.app-navigation,[\s\S]*?top: var\(--v9-header-h\) !important;/.test(css),
  "Tablet navigation must live below the top header."
);
assert(
  /@media \(min-width: 1024px\)[\s\S]*?\.app > \.app-navigation,[\s\S]*?top: var\(--v9-header-h\) !important;/.test(css),
  "Desktop navigation must remain in the marketplace top shell."
);
assert(
  /@media \(min-width: 900px\) and \(max-width: 1279px\)[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important;/.test(css),
  "Tablet landscape / compact laptop must use a two-column feed."
);
assert(
  /@media \(min-width: 1280px\)[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) !important;/.test(css),
  "Expanded desktop must use a three-column feed."
);
assert(
  /\.is-product-post \.post-media,[\s\S]*?aspect-ratio: 1 \/ 1 !important;/.test(css),
  "Product feed media must use a stable square commerce frame."
);

assert(!/linear-gradient\s*\(/i.test(css), "V9 must not use decorative linear gradients.");
assert(!/radial-gradient\s*\(/i.test(css), "V9 must not use decorative radial gradients.");
assert(!/filter\s*:\s*blur\s*\(/i.test(css), "V9 must not use blur effects.");

const backdropValues = [...css.matchAll(/(?:-webkit-)?backdrop-filter\s*:\s*([^;}{]+)/gi)]
  .map(match => match[1].replace(/\s*!important\s*$/i, "").trim().toLowerCase());
const safeBackdropValues = new Set(["none", "initial", "unset"]);
assert(
  backdropValues.every(value => safeBackdropValues.has(value)),
  `V9 must disable backdrop filters rather than render glass effects (${backdropValues.join(", ")}).`
);

const pixelFontSizes = [...css.matchAll(/font-size\s*:\s*([0-9.]+)px/gi)].map(match => Number(match[1]));
assert(pixelFontSizes.length > 0, "V9 typography contract found no explicit pixel font sizes.");
assert(
  Math.min(...pixelFontSizes) >= 10,
  `V9 contains text smaller than 10px (${Math.min(...pixelFontSizes)}px).`
);
assert(
  !/box-shadow\s*:\s*0\s+\d{2,}px\s+\d{2,}px/i.test(css),
  "V9 contains oversized decorative elevation."
);

console.log("Public Experience V9 responsive contract: PASS");
