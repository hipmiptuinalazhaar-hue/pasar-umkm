import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(root, rel));

const pkg = JSON.parse(read('package.json'));
const wrangler = read('wrangler.jsonc');
const securityDoc = read('docs/P9_OFFENSIVE_SECURITY_AUDIT.md');
const finalDoc = read('docs/P10_FINAL_PRODUCTION_COMPLETION.md');
const releaseDoc = read('docs/LOCAL_RELEASE_PROCESS.md');
const deployWaiter = read('scripts/wait-cloudflare-deploy.mjs');

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'p5-browser-results' || entry.name.endsWith('-results')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(?:js|mjs|json|jsonc|yml|yaml|html|css|md)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

const conflictMarkers = [];
for (const file of sourceFiles(root)) {
  const text = fs.readFileSync(file, 'utf8');
  if (/^(?:<<<<<<<|>>>>>>>|\|\|\|\|\|\|\|) /m.test(text)) conflictMarkers.push(path.relative(root, file));
}

const validate = String(pkg.scripts?.validate || '');
const certification = String(pkg.scripts?.['validate:p10-certification'] || '');
const predeploy = String(pkg.scripts?.['release:predeploy'] || '');
const attest = String(pkg.scripts?.['release:attest-cloudflare'] || '');
const postdeploy = String(pkg.scripts?.['release:postdeploy'] || '');
const activeWorkflowDir = path.join(root, '.github', 'workflows');
const activeWorkflows = fs.existsSync(activeWorkflowDir)
  ? fs.readdirSync(activeWorkflowDir).filter(name => /\.ya?ml$/i.test(name))
  : [];

const assertions = [
  ['Node module mode is explicit', pkg.type === 'module'],
  ['Node 22 engine remains pinned', pkg.engines?.node === '>=22 <23'],
  ['dependency surface remains minimal', Object.keys(pkg.dependencies || {}).length <= 2 && Object.keys(pkg.devDependencies || {}).length <= 2],
  ['Auth V2 behavioral gate is canonical', validate.includes('test:auth-v2')],
  ['route ownership gate is canonical', validate.includes('test:route-ownership')],
  ['security boundary gate is canonical', validate.includes('test:security-boundary')],
  ['P9 static security gate is canonical', validate.includes('test:p9-security')],
  ['P10 final contract is canonical', validate.includes('test:p10-final')],
  ['P9 source validator exists', exists('scripts/validate-p9-offensive-security.mjs')],
  ['P9 production probe exists', exists('scripts/p9-production-security-probe.mjs')],
  ['Auth V2 contract validator exists', exists('scripts/validate-auth-security-v2-contract.mjs')],
  ['route ownership validator exists', exists('scripts/validate-route-ownership-v2.mjs')],
  ['security boundary validator exists', exists('scripts/validate-security-boundary-v2.mjs')],
  ['local release documentation exists', exists('docs/LOCAL_RELEASE_PROCESS.md')],
  ['predeploy builds runtime and validates', predeploy.includes('build:runtime') && predeploy.includes('validate')],
  ['exact-SHA Cloudflare attestation script is exposed', attest === 'node scripts/wait-cloudflare-deploy.mjs'],
  ['postdeploy begins with exact-SHA attestation', postdeploy.startsWith('npm run release:attest-cloudflare &&')],
  ['Cloudflare waiter identifies official integration', deployWaiter.includes("cloudflare-workers-and-pages")],
  ['Cloudflare waiter verifies exact head SHA', deployWaiter.includes('String(check.head_sha).toLowerCase() === sha.toLowerCase()')],
  ['Cloudflare waiter requires completed successful deployment', deployWaiter.includes("check.status === 'completed' && check.conclusion === 'success'")],
  ['postdeploy runs HTTP smoke', postdeploy.includes('smoke:post-deploy')],
  ['postdeploy runs reliability regression', postdeploy.includes('probe:p6-production')],
  ['postdeploy runs launch regression', postdeploy.includes('probe:p7-production')],
  ['postdeploy runs scale regression', postdeploy.includes('probe:p8-scale-production')],
  ['postdeploy runs offensive security probe', postdeploy.includes('probe:p9-security')],
  ['P10 certification composes local pre/post deploy gates', certification.includes('release:predeploy') && certification.includes('release:postdeploy')],
  ['GitHub Actions are not an active release dependency', activeWorkflows.length === 0],
  ['Cloudflare observability remains enabled', wrangler.includes('"observability"') && wrangler.includes('"enabled": true')],
  ['P9 documentation declares non-destructive scope', securityDoc.includes('non-destructive')],
  ['P10 documentation defines completion evidence', finalDoc.includes('100% engineering completion')],
  ['release docs explicitly record no-Actions policy', releaseDoc.includes('GitHub Actions tidak digunakan')],
  ['release docs require exact-SHA Cloudflare attestation', releaseDoc.includes('npm run release:attest-cloudflare')],
  ['release docs require post-deploy verification', releaseDoc.includes('npm run release:postdeploy')],
  ['repository contains no unresolved merge markers', conflictMarkers.length === 0]
];

const failed = assertions.filter(([, ok]) => !ok);
for (const [name, ok] of assertions) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (activeWorkflows.length) console.error(`Active workflows unexpectedly present: ${activeWorkflows.join(', ')}`);
if (conflictMarkers.length) console.error(`Merge markers: ${conflictMarkers.join(', ')}`);

if (failed.length) {
  console.error(`P10 final completion contract failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}

console.log(`P10 final completion contract passed (${assertions.length}/${assertions.length}).`);
