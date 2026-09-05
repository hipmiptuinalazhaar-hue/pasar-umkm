import fs from 'node:fs';

const source = fs.readFileSync('src/admin-control-api.js', 'utf8');

const typedReasons = source.match(/jsonb_build_object\('reason',\s*\$\{reason\}::text/g) || [];
if (typedReasons.length !== 4) {
  throw new Error(`Expected 4 explicitly typed admin audit reason parameters, found ${typedReasons.length}.`);
}

if (/jsonb_build_object\('reason',\s*\$\{reason\}(?!::text)/.test(source)) {
  throw new Error('Admin audit JSON contains an untyped reason parameter; PostgreSQL may fail polymorphic type inference.');
}

if (!/jsonb_build_object\('reason',\s*\$\{reason\}::text,\s*'action',\s*\$\{action\}::text\)/.test(source)) {
  throw new Error('Store audit metadata must explicitly cast both reason and action to text.');
}

console.log('Admin audit parameter typing regression passed.');
console.log('Validated: user/store/product/post audit reasons are typed, and store action is typed for jsonb_build_object.');
