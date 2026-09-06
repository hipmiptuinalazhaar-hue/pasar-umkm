import { readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const roots = ['src', 'js', 'scripts'];
const files = [];

function walk(path) {
  for (const entry of readdirSync(path)) {
    const full = join(path, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    if (/\.(?:js|mjs)$/.test(entry)) files.push(full);
  }
}

for (const root of roots) walk(root);

const failures = [];
for (const file of files.sort()) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    const stderr = String(error?.stderr || error?.message || error).trim();
    failures.push(`${file}: ${stderr}`);
  }
}

if (failures.length) {
  console.error(`Syntax lint FAILED (${failures.length}/${files.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Syntax lint PASS: ${files.length} JavaScript/module files checked.`);
