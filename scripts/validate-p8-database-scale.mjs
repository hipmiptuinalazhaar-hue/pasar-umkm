import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const catalog = read('src/public-catalog-api.js');
const scaleSql = read('database/staging/p8-scale-audit.sql');
const docs = read('docs/P8_DATABASE_SCALE_AUDIT.md');
const release = read('docs/LOCAL_RELEASE_PROCESS.md');
const probe = read('scripts/p8-production-scale-probe.mjs');
const pkg = JSON.parse(read('package.json'));

const checks = [];
const requireCheck = (condition, message) => {
  if (!condition) throw new Error(`P8 SCALE FAIL: ${message}`);
  checks.push(message);
  console.log(`P8 SCALE PASS: ${message}`);
};
const forbid = (pattern, value, message) => requireCheck(!pattern.test(value), message);

requireCheck(catalog.includes('const DEFAULT_LIMIT = 24'), 'public catalog keeps bounded default limit');
requireCheck(catalog.includes('const MAX_LIMIT = 50'), 'public catalog keeps hard maximum page size');
requireCheck(catalog.includes('mode: "cursor"'), 'public catalog exposes cursor pagination contract');
requireCheck(catalog.includes('(p.created_at, p.id) <'), 'products use keyset tuple cursor');
requireCheck(catalog.includes('ORDER BY p.created_at DESC, p.id DESC'), 'products keep deterministic keyset ordering');
requireCheck(catalog.includes('verification_rank ASC, s.name ASC, s.id ASC'), 'stores keep deterministic composite ordering');
requireCheck(catalog.includes('url.searchParams.get("cursor")'), 'catalog accepts opaque cursor input');
requireCheck(catalog.includes('CURSOR_REQUIRED'), 'legacy deep page pagination is rejected');
requireCheck(catalog.includes('MAX_CURSOR_LENGTH'), 'cursor input has bounded length');

for (const marker of ['pg_database_size(current_database())','pg_stat_user_tables','pg_stat_user_indexes',"state = 'active'",'l.granted = false',"extname = 'pg_stat_statements'"]) {
  requireCheck(scaleSql.includes(marker), `read-only audit contains ${marker}`);
}
forbid(/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|VACUUM\s+FULL|REINDEX)\b/i, scaleSql.replace(/^--.*$/gm, ''), 'P8 SQL audit contains no DML/destructive DDL');

for (const marker of ['Index policy','Index retirement policy','Query-plan policy','Pagination policy','Transaction policy','Vacuum and bloat policy','Capacity policy','Production read-only certification','P8 exit criteria']) {
  requireCheck(docs.includes(marker), `P8 runbook documents ${marker}`);
}
requireCheck(docs.includes('100k rows'), 'P8 defines public-read row-count re-audit threshold');
requireCheck(docs.includes('50k rows'), 'P8 defines transaction-table re-audit threshold');
requireCheck(docs.includes('1 GB'), 'P8 defines table-size re-audit threshold');
requireCheck(docs.includes('500 MB'), 'P8 defines index-size re-audit threshold');
requireCheck(docs.includes('30 hari'), 'P8 requires evidence window before index retirement');
requireCheck(docs.includes('long-running query >5 menit: 0'), 'P8 records long-running-query baseline');
requireCheck(docs.includes('active locks saat audit: 0'), 'P8 records lock baseline');

requireCheck(probe.includes("method: 'GET'"), 'P8 production probe is read-only');
forbid(/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i, probe, 'P8 production probe contains no mutation method');
requireCheck(probe.includes("certifyCollection('products'"), 'P8 probe certifies product cursor behavior');
requireCheck(probe.includes("certifyCollection('stores'"), 'P8 probe certifies store cursor behavior');
requireCheck(probe.includes('duplicate ids across cursor pages'), 'P8 probe blocks cross-page duplicate regression');
requireCheck(probe.includes('p95LimitMs'), 'P8 probe enforces latency ceiling');
requireCheck(probe.includes('production_mutations: 0'), 'P8 report attests zero production mutations');

requireCheck(release.includes('npm run release:predeploy'), 'local release process includes predeploy validation');
requireCheck(release.includes('npm run release:postdeploy'), 'local release process includes postdeploy verification');
requireCheck(release.includes('GitHub Actions tidak digunakan'), 'P8 certification uses no-Actions release model');
requireCheck(pkg.scripts?.['test:p8-scale'] === 'node scripts/validate-p8-database-scale.mjs', 'package exposes distinct P8 scale contract');
requireCheck(pkg.scripts?.['probe:p8-scale-production'] === 'node scripts/p8-production-scale-probe.mjs', 'package exposes P8 live scale probe');
requireCheck(String(pkg.scripts?.validate || '').includes('npm run test:p8-scale'), 'canonical validation includes P8 database scale contract');
requireCheck(String(pkg.scripts?.['validate:p8-scale-certification'] || '').includes('probe:p8-scale-production'), 'P8 certification script includes production scale probe');
requireCheck(String(pkg.scripts?.['release:postdeploy'] || '').includes('probe:p8-scale-production'), 'postdeploy gate runs P8 scale probe');

console.log(`\nP8 database scale contract: PASS (${checks.length} checks)`);
