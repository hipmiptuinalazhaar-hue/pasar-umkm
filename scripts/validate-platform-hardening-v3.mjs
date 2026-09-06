import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

const errors = [];
const fail = message => errors.push(message);
const read = path => readFileSync(path, 'utf8');

const required = [
  'index.html',
  'admin/index.html',
  '_headers',
  'wrangler.jsonc',
  'package.json',
  'src/worker-entry.js',
  'src/rate-limit.js',
  'src/request-security.js',
  'css/mobile-foundation-v2.css',
  'css/tablet-desktop-v2.css',
  'css/admin-control.css',
  'scripts/lint-syntax.mjs',
  'scripts/post-deploy-smoke.mjs',
  '.github/workflows/post-deploy-smoke.yml',
  'SECURITY.md',
  '.github/CODEOWNERS',
  'docs/REPOSITORY_GOVERNANCE.md'
];

for (const file of required) if (!existsSync(file)) fail(`Missing hardening file: ${file}`);

function collectFiles(root, predicate) {
  const output = [];
  if (!existsSync(root)) return output;
  const walk = path => {
    for (const entry of readdirSync(path)) {
      const full = `${path}/${entry}`;
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (predicate(full)) output.push(full);
    }
  };
  walk(root);
  return output;
}

function auditHtml(path) {
  const html = read(path);
  if (!/<html\b[^>]*\blang=["']id["']/i.test(html)) fail(`${path}: lang=id missing`);
  if (!/name=["']viewport["'][^>]*viewport-fit=cover/i.test(html)) fail(`${path}: viewport-fit=cover missing`);
  if (/\son(?:click|load|error|submit|change|input|keydown|keyup|touchstart|touchend)\s*=/i.test(html)) {
    fail(`${path}: inline DOM event handler found`);
  }
  if (/javascript\s*:/i.test(html)) fail(`${path}: javascript: URL found`);

  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map(match => match[1]);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) fail(`${path}: duplicate id=${id}`);
    seen.add(id);
  }

  for (const match of html.matchAll(/<button\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\btype=["'](?:button|submit|reset)["']/i.test(tag)) {
      fail(`${path}: button without explicit type: ${tag.slice(0, 140)}`);
    }
  }

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\balt=["'][^"']*["']/i.test(tag)) fail(`${path}: image without alt: ${tag.slice(0, 140)}`);
  }
}

if (existsSync('index.html')) auditHtml('index.html');
if (existsSync('admin/index.html')) auditHtml('admin/index.html');

for (const file of collectFiles('js', path => /\.js$/.test(path))) {
  const source = read(file);
  for (const match of source.matchAll(/<button\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\btype=["'](?:button|submit|reset)["']/i.test(tag)) {
      fail(`${file}: rendered button without explicit type: ${tag.slice(0, 140)}`);
    }
  }
  if (/javascript\s*:/i.test(source)) fail(`${file}: javascript: URL found`);
}

if (existsSync('css/mobile-foundation-v2.css')) {
  const css = read('css/mobile-foundation-v2.css');
  for (const marker of [
    '@media (max-width: 767px)',
    'font-size: 16px',
    'min-width: 44px',
    'min-height: 44px',
    'min-height: 48px',
    'env(safe-area-inset-top)',
    'env(safe-area-inset-bottom)',
    '@media (prefers-reduced-motion: reduce)'
  ]) if (!css.includes(marker)) fail(`mobile foundation missing contract: ${marker}`);
}

if (existsSync('css/tablet-desktop-v2.css')) {
  const css = read('css/tablet-desktop-v2.css');
  for (const marker of [
    '@media (min-width: 768px)',
    '@media (min-width: 900px) and (max-width: 1023px)',
    '@media (min-width: 1024px)',
    '@media (min-width: 1280px)',
    '@media (min-width: 1600px)',
    '--p5-feed-max: 720px',
    '--p5-work-max: 920px',
    '--p5-social-max: 860px',
    'minmax(0, 1fr)',
    'text-overflow: ellipsis',
    '@media (hover: hover) and (pointer: fine)',
    '@media (prefers-reduced-motion: reduce)'
  ]) if (!css.includes(marker)) fail(`tablet/desktop owner missing contract: ${marker}`);
}

if (existsSync('css/admin-control.css')) {
  const css = read('css/admin-control.css');
  for (const marker of [
    'min-width: 320px',
    'font-size: 16px',
    'min-height: 44px',
    'overflow-x: auto',
    'text-overflow: ellipsis',
    '@media (min-width: 600px)',
    '@media (min-width: 900px)',
    '@media (min-width: 1240px)',
    '@media (prefers-reduced-motion: reduce)'
  ]) if (!css.includes(marker)) fail(`admin responsive contract missing: ${marker}`);
}

if (existsSync('_headers')) {
  const headers = read('_headers');
  for (const marker of [
    'Content-Security-Policy:',
    "object-src 'none'",
    "base-uri 'self'",
    'Cross-Origin-Opener-Policy: same-origin',
    'X-Content-Type-Options: nosniff',
    'Referrer-Policy:'
  ]) if (!headers.includes(marker)) fail(`public security header missing: ${marker}`);
  if (headers.includes("'unsafe-eval'")) fail('CSP must not allow unsafe-eval');
}

if (existsSync('wrangler.jsonc')) {
  try {
    const wrangler = JSON.parse(read('wrangler.jsonc'));
    const rateLimits = Array.isArray(wrangler.ratelimits) ? wrangler.ratelimits : [];
    const names = new Set(rateLimits.map(item => item.name));
    for (const name of ['EDGE_AUTH_LIMITER', 'EDGE_WRITE_LIMITER', 'EDGE_READ_LIMITER']) {
      if (!names.has(name)) fail(`wrangler missing rate-limit binding: ${name}`);
    }
    for (const item of rateLimits) {
      if (![10, 60].includes(Number(item?.simple?.period))) fail(`Invalid Cloudflare rate-limit period for ${item.name}`);
      if (!(Number(item?.simple?.limit) > 0)) fail(`Invalid Cloudflare rate-limit limit for ${item.name}`);
    }
  } catch (error) {
    fail(`wrangler.jsonc is not parseable JSON: ${error.message}`);
  }
}

if (existsSync('src/rate-limit.js')) {
  const source = read('src/rate-limit.js');
  for (const marker of [
    'const buckets = new Map()',
    'EDGE_AUTH_LIMITER',
    'EDGE_WRITE_LIMITER',
    'EDGE_READ_LIMITER',
    'health-read',
    'binding.limit({ key })',
    'export async function enforceRateLimit(request, env = {})'
  ]) if (!source.includes(marker)) fail(`rate-limit owner missing contract: ${marker}`);
}

if (existsSync('src/worker-entry.js')) {
  const source = read('src/worker-entry.js');
  if (!source.includes('enforceRateLimit(request, env)')) fail('worker router does not pass env to rate limiter');
  const securityIndex = source.indexOf('const securityResponse = enforceRequestSecurity(request)');
  const rateIndex = source.indexOf('const rateLimitResponse = await enforceRateLimit(request, env)');
  const healthIndex = source.indexOf('if (url.pathname === "/api/health")');
  if (!(securityIndex >= 0 && rateIndex > securityIndex && healthIndex > rateIndex)) {
    fail('health endpoint must execute after request-security and rate-limit boundaries');
  }
  for (const forbidden of ['current_database()', 'public_tables', 'latest_migration']) {
    if (source.includes(forbidden)) fail(`health endpoint leaks internal metadata marker: ${forbidden}`);
  }
}

if (existsSync('package.json')) {
  const pkg = JSON.parse(read('package.json'));
  for (const script of ['build:runtime', 'lint', 'test', 'validate', 'smoke:production', 'smoke:post-deploy']) {
    if (!pkg.scripts?.[script]) fail(`package.json missing script: ${script}`);
  }
}

const legacyBudgets = [
  ['src/worker.js', 118066],
  ['js/app.js', 252582],
  ['css/style.css', 303124]
];
for (const [file, maxBytes] of legacyBudgets) {
  if (!existsSync(file)) continue;
  const bytes = statSync(file).size;
  if (bytes > maxBytes) fail(`legacy freeze violated: ${file} grew to ${bytes} bytes (max ${maxBytes})`);
}

for (const file of collectFiles('css', path => /\.css$/.test(path))) {
  const source = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
  const opens = (source.match(/\{/g) || []).length;
  const closes = (source.match(/\}/g) || []).length;
  if (opens !== closes) fail(`${file}: unbalanced CSS braces ${opens}/${closes}`);
}

if (errors.length) {
  console.error(`Platform Hardening V3 FAILED (${errors.length} issue${errors.length === 1 ? '' : 's'})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Platform Hardening V3 PASS: UI controls, responsive contracts, security boundaries, rate limits, CSP, governance files, and legacy freeze are intact.');
