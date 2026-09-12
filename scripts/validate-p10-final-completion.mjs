import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(root, rel));

const pkg = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/p10-final-production-certification.yml');
const wrangler = read('wrangler.jsonc');
const securityDoc = read('docs/P9_OFFENSIVE_SECURITY_AUDIT.md');
const finalDoc = read('docs/P10_FINAL_PRODUCTION_COMPLETION.md');

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
  if (/^(?:<<<<<<<|>>>>>>>|\|\|\|\|\|\|\|) /m.test(text)) {
    conflictMarkers.push(path.relative(root, file));
  }
}

const validate = String(pkg.scripts?.validate || '');
const certification = String(pkg.scripts?.['validate:p10-certification'] || '');
const assertions = [
  ['Node module mode is explicit', pkg.type === 'module'],
  ['Node 22 engine remains pinned', pkg.engines?.node === '>=22 <23'],
  ['dependency surface remains minimal', Object.keys(pkg.dependencies || {}).length <= 2 && Object.keys(pkg.devDependencies || {}).length <= 2],
  ['P9 static security gate is canonical', validate.includes('test:p9-security')],
  ['P10 final contract is canonical', validate.includes('test:p10-final')],
  ['P10 certification script exists', certification.includes('test:p10-final') && certification.includes('probe:p9-security')],
  ['P9 source validator exists', exists('scripts/validate-p9-offensive-security.mjs')],
  ['P9 production probe exists', exists('scripts/p9-production-security-probe.mjs')],
  ['P10 final workflow exists', exists('.github/workflows/p10-final-production-certification.yml')],
  ['P10 workflow runs canonical validation', workflow.includes('npm run validate')],
  ['P10 workflow proves deterministic runtime build', workflow.includes('npm run build:runtime') && workflow.includes('git diff --exit-code')],
  ['P10 workflow waits for exact Cloudflare deployment', workflow.includes('wait-cloudflare-deploy.mjs') && workflow.includes('CLOUDFLARE_SHA: ${{ github.sha }}')],
  ['P10 workflow runs post-deploy smoke', workflow.includes('post-deploy-smoke.mjs')],
  ['P10 workflow runs reliability regression', workflow.includes('p6-production-reliability-probe.mjs')],
  ['P10 workflow runs launch regression', workflow.includes('p7-production-launch-probe.mjs')],
  ['P10 workflow runs database-scale regression', workflow.includes('p8-production-scale-probe.mjs')],
  ['P10 workflow runs offensive-security production probe', workflow.includes('p9-production-security-probe.mjs')],
  ['P10 workflow runs real-browser viewport matrix', workflow.includes('browser-release-smoke.mjs')],
  ['P10 workflow runs critical browser surfaces', workflow.includes('browser-p5-critical-surfaces-v2.mjs')],
  ['P10 workflow runs read-only load smoke', workflow.includes('load-smoke-v1.mjs')],
  ['P10 workflow preserves certification evidence', workflow.includes('actions/upload-artifact@') && workflow.includes('retention-days: 30')],
  ['P10 workflow actions are SHA pinned', !/uses:\s+actions\/(?:checkout|setup-node|upload-artifact)@v\d+/i.test(workflow)],
  ['Cloudflare observability remains enabled', wrangler.includes('"observability"') && wrangler.includes('"enabled": true')],
  ['P9 documentation declares non-destructive scope', securityDoc.includes('non-destructive')],
  ['P10 documentation defines completion evidence', finalDoc.includes('100% engineering completion')],
  ['repository contains no unresolved merge markers', conflictMarkers.length === 0]
];

const failed = assertions.filter(([, ok]) => !ok);
for (const [name, ok] of assertions) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (conflictMarkers.length) console.error(`Merge markers: ${conflictMarkers.join(', ')}`);

if (failed.length) {
  console.error(`P10 final completion contract failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}

console.log(`P10 final completion contract passed (${assertions.length}/${assertions.length}).`);
