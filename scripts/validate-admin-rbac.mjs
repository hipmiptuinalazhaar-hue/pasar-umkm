import fs from 'node:fs';

const migration = fs.readFileSync('database/migrations/2026-09-05-admin-rbac-permissions.sql', 'utf8');
const authorization = fs.readFileSync('src/admin-authorization.js', 'utf8');
const accessApi = fs.readFileSync('src/admin-access-api.js', 'utf8');
const worker = fs.readFileSync('src/worker-entry.js', 'utf8');
const rateLimit = fs.readFileSync('src/rate-limit.js', 'utf8');

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message);
}

function requireAbsent(text, pattern, message) {
  if (pattern.test(text)) throw new Error(message);
}

const requiredRoles = [
  'super_admin',
  'moderator',
  'verifier',
  'support',
  'operations'
];

const requiredPermissions = [
  'dashboard.view',
  'users.view', 'users.suspend', 'users.reactivate',
  'stores.view', 'stores.verify', 'stores.suspend', 'stores.reactivate',
  'products.view', 'products.moderate', 'products.suspend', 'products.restore',
  'posts.view', 'posts.moderate', 'posts.suspend', 'posts.restore',
  'orders.view', 'orders.support',
  'reports.view', 'reports.resolve',
  'reviews.view', 'reviews.moderate',
  'admin_accounts.view', 'admin_accounts.create', 'admin_accounts.suspend', 'admin_accounts.assign_role',
  'roles.view', 'roles.manage',
  'audit_logs.view',
  'system.view', 'system.manage'
];

for (const role of requiredRoles) {
  requireMatch(migration, new RegExp(`['\"]${role}['\"]`), `Missing canonical admin role: ${role}`);
}

for (const permission of requiredPermissions) {
  requireMatch(migration, new RegExp(`['\"]${permission.replace('.', '\\.')}['\"]`), `Missing admin permission: ${permission}`);
}

requireMatch(
  migration,
  /CROSS JOIN\s+admin_permissions[\s\S]*?ar\.role_key\s*=\s*'super_admin'[\s\S]*?ap\.is_active\s*=\s*TRUE/i,
  'Super Admin must receive every active permission through explicit DB grants.'
);

requireAbsent(
  migration,
  /INSERT INTO\s+admin_account_roles/i,
  'Phase 4 migration must not assign roles to individual admin accounts.'
);
requireAbsent(
  migration,
  /INSERT INTO\s+admin_accounts/i,
  'Phase 4 migration must not create privileged identities.'
);
requireAbsent(
  migration,
  /INSERT INTO\s+admin_sessions/i,
  'Phase 4 migration must not create admin sessions.'
);
requireAbsent(
  migration,
  /permission_key[^\n]*['\"]\*['\"]/i,
  'Wildcard permissions are forbidden; permissions must remain explicit.'
);

for (const sensitivePermission of [
  'orders.view',
  'admin_accounts.assign_role',
  'roles.manage',
  'audit_logs.view',
  'system.manage'
]) {
  const escaped = sensitivePermission.replace('.', '\\.');
  requireMatch(
    migration,
    new RegExp(`['\"]${escaped}['\"][\\s\\S]{0,260}?TRUE\\s*,\\s*TRUE`, 'i'),
    `Sensitive permission must be flagged is_sensitive=true: ${sensitivePermission}`
  );
}

requireMatch(
  authorization,
  /export\s+async\s+function\s+requireAdminPermission\b/,
  'Missing reusable server-side permission guard.'
);
requireMatch(
  authorization,
  /permissionSet\.has\(permissionKey\)/,
  'Authorization must evaluate explicit permission grants.'
);
requireMatch(
  authorization,
  /ADMIN_PERMISSION_DENIED/,
  'Missing fail-closed permission denial response.'
);
requireMatch(
  authorization,
  /'admin\.authorization'/,
  'Permission denials must be auditable.'
);
requireMatch(
  authorization,
  /ar\.is_active\s*=\s*TRUE[\s\S]*?ap\.is_active\s*=\s*TRUE/i,
  'RBAC resolution must ignore inactive roles and permissions.'
);
requireMatch(
  authorization,
  /super_admin_bypass:\s*false/,
  'Super Admin role bypass must remain disabled.'
);
requireAbsent(
  authorization,
  /role_key\s*===?\s*['\"]super_admin['\"]|roles?\.includes\(\s*['\"]super_admin['\"]\s*\)/i,
  'Application code must not bypass permissions based on the Super Admin role string.'
);

requireMatch(
  accessApi,
  /GET[\s\S]*?\/api\/admin\/access\/me/,
  'Missing authenticated admin capability endpoint.'
);
requireAbsent(
  accessApi,
  /request\.method\s*===?\s*['\"](?:POST|PUT|PATCH|DELETE)['\"]/i,
  'Phase 4 access API must remain read-only.'
);

const adminAccessIndex = worker.indexOf('handleAdminAccessApi');
const publicBootstrapIndex = worker.indexOf('ensureNotificationInfrastructure(env)');
if (adminAccessIndex < 0 || publicBootstrapIndex < 0 || adminAccessIndex > publicBootstrapIndex) {
  throw new Error('Admin RBAC runtime must execute before unrelated public feature bootstrap.');
}

requireMatch(
  rateLimit,
  /name:\s*['\"]admin-access-read['\"][\s\S]*?limit:\s*120[\s\S]*?includeAdminSession:\s*true/i,
  'Admin access capability reads must have a dedicated session-aware rate limit.'
);

requireMatch(
  migration,
  /2026-09-05-admin-rbac-permissions/,
  'RBAC migration version must be recorded.'
);

console.log('Admin RBAC validation passed.');
console.log(`Validated roles: ${requiredRoles.length}`);
console.log(`Validated permissions: ${requiredPermissions.length}`);
console.log('Validated policy: explicit grants, least privilege, no Super Admin bypass, read-only capability API.');
