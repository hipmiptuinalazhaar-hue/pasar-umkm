import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const requestSecurity = read('src/request-security.js');
const adminAuthorization = read('src/admin-authorization.js');
const adminSecurity = read('src/admin-security-core.js');
const authShared = read('src/auth-security-v2-shared.js');
const upload = read('src/image-upload-api.js');
const chatMedia = read('src/chat-media-security.js');
const profileMedia = read('src/profile-media-security.js');
const orders = read('src/orders-api-v2.js');
const rateLimit = read('src/rate-limit.js');
const wrangler = read('wrangler.jsonc');
const headers = read('_headers');

const assertions = [
  ['cross-origin state changes are rejected', requestSecurity.includes('requestOrigin !== url.origin') && requestSecurity.includes('ORIGIN_REJECTED')],
  ['cookie writes require browser provenance', requestSecurity.includes('BROWSER_PROVENANCE_REQUIRED') && requestSecurity.includes('hasSessionCookie(request)')],
  ['legacy public admin route is disabled', requestSecurity.includes('PUBLIC_ADMIN_ROUTE_DISABLED') && requestSecurity.includes('/api/commerce/admin')],
  ['admin authorization is database-backed', adminAuthorization.includes('permission_source: "database_role_grants"')],
  ['admin has no super-admin bypass', adminAuthorization.includes('super_admin_bypass: false')],
  ['sensitive admin permissions require fresh step-up', adminAuthorization.includes('ADMIN_STEP_UP_REQUIRED') && adminAuthorization.includes('isStepUpFresh')],
  ['admin session tokens are stored hashed', adminSecurity.includes('const tokenHash = await sha256Hex(rawToken)') && adminSecurity.includes('WHERE s.token_hash = ${tokenHash}')],
  ['admin cookie is host-only secure httponly strict', adminSecurity.includes('__Host-pasar_umkm_admin') && adminSecurity.includes('HttpOnly; Secure; SameSite=Strict')],
  ['admin sessions enforce idle and absolute expiry', adminSecurity.includes('SESSION_IDLE_MINUTES = 30') && adminSecurity.includes('SESSION_ABSOLUTE_HOURS = 8')],
  ['public auth uses cryptographic randomness', authShared.includes('crypto.getRandomValues')],
  ['public OTP hashing requires a strong pepper', authShared.includes('AUTH_OTP_PEPPER') && authShared.includes('normalized.length < 32')],
  ['public auth comparisons are constant-time', authShared.includes('constantTimeEqual')],
  ['image upload MIME allowlist exists', upload.includes('image/jpeg') && upload.includes('image/png') && upload.includes('image/webp')],
  ['image uploads are size limited', upload.includes('MAX_IMAGE_BYTES = 5 * 1024 * 1024') && upload.includes('MAX_QRIS_BYTES = 3 * 1024 * 1024')],
  ['image uploads verify file signatures', upload.includes('matchesImageSignature') && upload.includes('hasExpectedImageSignature')],
  ['provider upload errors are not exposed to clients', !upload.includes('cloudinary_error:') && !upload.includes('cloudinary_status:')],
  ['seller uploads are owner-scoped', upload.includes('WHERE owner_id = ${user.id}')],
  ['chat media URLs are ownership scoped', chatMedia.includes('assetSegments[2] === conversation') && chatMedia.includes('assetSegments[3] === user')],
  ['profile media URLs are ownership scoped', profileMedia.includes('assetSegments[2] !== user')],
  ['buyer order reads are owner-scoped', orders.includes('WHERE o.buyer_id = ${auth.user.id}')],
  ['seller order reads are store-scoped', orders.includes('WHERE o.store_id = ${store.id}')],
  ['checkout locks cart and stock rows', orders.includes('FOR UPDATE') && orders.includes('stock >= $1')],
  ['application rate limiting exists', rateLimit.includes('rate') || rateLimit.includes('Rate')],
  ['edge auth limiter configured', wrangler.includes('EDGE_AUTH_LIMITER') && wrangler.includes('"limit": 20')],
  ['edge write limiter configured', wrangler.includes('EDGE_WRITE_LIMITER') && wrangler.includes('"limit": 120')],
  ['edge read limiter configured', wrangler.includes('EDGE_READ_LIMITER') && wrangler.includes('"limit": 600')],
  ['CSP blocks object embedding', headers.includes("object-src 'none'")],
  ['CSP blocks inline event handlers', headers.includes("script-src-attr 'none'")],
  ['HSTS is present', headers.toLowerCase().includes('strict-transport-security')],
  ['framing is denied', headers.toLowerCase().includes('x-frame-options: deny') || headers.toLowerCase().includes("frame-ancestors 'none'"))
];

const failed = assertions.filter(([, ok]) => !ok);
for (const [name, ok] of assertions) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);

if (failed.length) {
  console.error(`P9 offensive security contract failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}

console.log(`P9 offensive security contract passed (${assertions.length}/${assertions.length}).`);
