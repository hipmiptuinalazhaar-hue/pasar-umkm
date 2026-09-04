import fs from 'node:fs';

const migrationPath = 'database/migrations/2026-09-05-admin-foundation.sql';
const workerPath = 'src/worker.js';

const migration = fs.readFileSync(migrationPath, 'utf8');
const worker = fs.readFileSync(workerPath, 'utf8');

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) {
    throw new Error(message);
  }
}

function requireAbsent(text, pattern, message) {
  if (pattern.test(text)) {
    throw new Error(message);
  }
}

const requiredTables = [
  'admin_accounts',
  'admin_roles',
  'admin_permissions',
  'admin_account_roles',
  'admin_role_permissions',
  'admin_sessions',
  'admin_audit_logs'
];

for (const table of requiredTables) {
  requireMatch(
    migration,
    new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\b`, 'i'),
    `Missing admin foundation table: ${table}`
  );
}

// Security boundary: privileged identities and sessions must not depend on
// public marketplace user/session rows. Human identity may overlap, DB identity may not.
requireAbsent(
  migration,
  /REFERENCES\s+(?:public\.)?users\s*\(/i,
  'Admin foundation must not foreign-key privileged identities to public users.'
);
requireAbsent(
  migration,
  /REFERENCES\s+(?:public\.)?sessions\s*\(/i,
  'Admin foundation must not foreign-key privileged sessions to public sessions.'
);

requireMatch(
  migration,
  /CREATE UNIQUE INDEX IF NOT EXISTS\s+uq_admin_accounts_email_normalized[\s\S]*?lower\s*\(\s*trim\s*\(\s*email\s*\)\s*\)/i,
  'Admin email uniqueness must be case-insensitive and trim-normalized.'
);
requireMatch(
  migration,
  /password_hash\s+TEXT\s+NOT NULL/i,
  'Admin accounts must store only a password hash field, never a plaintext password field.'
);
requireAbsent(
  migration,
  /\bpassword\s+(?:VARCHAR|TEXT|CHAR)\b/i,
  'Plaintext admin password column is forbidden.'
);
requireMatch(
  migration,
  /admin_sessions[\s\S]*?token_hash\s+TEXT\s+NOT NULL\s+UNIQUE/i,
  'Admin sessions must use a unique token hash.'
);
requireMatch(
  migration,
  /admin_sessions[\s\S]*?REFERENCES\s+admin_accounts\s*\(\s*id\s*\)/i,
  'Admin sessions must belong to isolated admin accounts.'
);
requireMatch(
  migration,
  /admin_sessions[\s\S]*?security_version\s+INTEGER\s+NOT NULL/i,
  'Admin sessions must snapshot the admin account security version.'
);
requireMatch(
  migration,
  /admin_audit_logs[\s\S]*?outcome\s+VARCHAR\(16\)\s+NOT NULL/i,
  'Admin audit records must capture an outcome.'
);
requireMatch(
  migration,
  /admin_audit_logs[\s\S]*?metadata\s+JSONB\s+NOT NULL/i,
  'Admin audit records must provide structured metadata.'
);
requireMatch(
  migration,
  /2026-09-05-admin-foundation/i,
  'Admin foundation migration must record its migration version.'
);

// Public registration boundary: registration must keep relying on the public
// users.role default and must never accept a requested admin role.
const registerStart = worker.indexOf('// AUTH REGISTER');
const loginStart = worker.indexOf('// AUTH LOGIN', registerStart + 1);

if (registerStart < 0 || loginStart < 0 || loginStart <= registerStart) {
  throw new Error('Could not isolate public registration handler for validation.');
}

const registerBlock = worker.slice(registerStart, loginStart);

requireAbsent(
  registerBlock,
  /body\s*(?:\.\s*role|\[\s*['"]role['"]\s*\])/i,
  'Public registration must not read a requested role.'
);

const insertMatch = registerBlock.match(
  /INSERT INTO\s+users\s*\(([^)]*)\)\s*VALUES/i
);

if (!insertMatch) {
  throw new Error('Could not validate the public registration users INSERT.');
}

const registrationColumns = insertMatch[1]
  .split(',')
  .map((column) => column.trim().toLowerCase())
  .filter(Boolean);

for (const requiredColumn of ['name', 'email', 'password_hash']) {
  if (!registrationColumns.includes(requiredColumn)) {
    throw new Error(`Public registration missing required column: ${requiredColumn}`);
  }
}

if (registrationColumns.includes('role')) {
  throw new Error('Public registration must not write users.role directly.');
}

console.log('Admin foundation validation passed.');
console.log(`Validated tables: ${requiredTables.join(', ')}`);
console.log('Validated boundary: public registration cannot request or write an admin role.');
