import fs from 'node:fs';

const migrationPath = 'database/migrations/2026-09-05-admin-bootstrap-policy.sql';
const runbookPath = 'docs/ADMIN_BOOTSTRAP.md';

const migration = fs.readFileSync(migrationPath, 'utf8');
const runbook = fs.readFileSync(runbookPath, 'utf8');

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message);
}

function requireAbsent(text, pattern, message) {
  if (pattern.test(text)) throw new Error(message);
}

requireMatch(
  migration,
  /WHERE\s+version\s*=\s*'2026-09-05-admin-foundation'/i,
  'Phase 2 migration must require the admin foundation migration.'
);

requireMatch(
  migration,
  /ADD COLUMN IF NOT EXISTS\s+must_rotate_password\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+TRUE/i,
  'Bootstrap accounts must require password rotation by default.'
);

requireMatch(
  migration,
  /ADD COLUMN IF NOT EXISTS\s+password_changed_at\s+TIMESTAMPTZ/i,
  'Admin accounts must record password rotation time.'
);

requireMatch(
  migration,
  /INSERT INTO\s+admin_roles[\s\S]*?'super_admin'[\s\S]*?TRUE[\s\S]*?TRUE/i,
  'Phase 2 must seed an active system super_admin role.'
);

requireMatch(
  migration,
  /ON CONFLICT\s*\(\s*role_key\s*\)/i,
  'Super Admin role seeding must be idempotent.'
);

requireAbsent(
  migration,
  /INSERT INTO\s+admin_accounts/i,
  'Account-specific bootstrap credentials must never be stored in a source-controlled migration.'
);

requireAbsent(
  migration,
  /INSERT INTO\s+admin_permissions/i,
  'Phase 2 must not seed RBAC permissions. Phase 4 owns permission catalogue.'
);

requireAbsent(
  migration,
  /INSERT INTO\s+admin_sessions/i,
  'Phase 2 must not create privileged sessions.'
);

requireAbsent(
  migration,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  'Personal admin email must not be hardcoded into Phase 2 migration.'
);

requireMatch(
  migration,
  /2026-09-05-admin-bootstrap-policy/i,
  'Phase 2 migration must record its migration version.'
);

for (const contract of [
  /pending_activation/i,
  /mfa_required/i,
  /must_rotate_password/i,
  /admin\.bootstrap/i,
  /no admin session/i,
  /public `users` and public `sessions` rows were not modified/i
]) {
  requireMatch(
    runbook,
    contract,
    `Bootstrap runbook missing required contract: ${contract}`
  );
}

requireAbsent(
  runbook,
  /capryanagusto8@gmail\.com/i,
  'Personal admin email must not be committed to the bootstrap runbook.'
);

console.log('Admin bootstrap validation passed.');
console.log('Validated: system role seed, credential rotation, no hardcoded account secrets, no permission/session scope creep.');
