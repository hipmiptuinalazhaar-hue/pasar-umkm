import fs from 'node:fs';

const records = fs.readFileSync('js/admin/records.js', 'utf8');
if (!/^import \{ adminApi, AdminApiError \} from "\.\/api\.js\?v=6\.0\.0";/m.test(records)) {
  throw new Error('Record actions must use the Phase 6 admin API cache boundary.');
}
if (!/"store-verify"[\s\S]*?adminApi\.storeAction\(id, "verify", reason\)/.test(records)) {
  throw new Error('Store verify action must remain owned by the shared admin API.');
}

const storeId = '60313c0d-9c04-405c-a6a6-efe0a465e260';
const requests = [];
let storeAttempts = 0;
let stepUps = 0;

globalThis.fetch = async (path, options = {}) => {
  requests.push({ path: String(path), method: options.method || 'GET', body: options.body || null });
  if (String(path) !== `/api/admin/control/stores/${storeId}/action`) {
    throw new Error(`Unexpected request path: ${path}`);
  }
  storeAttempts += 1;
  if (storeAttempts === 1) {
    return Response.json({
      ok: false,
      code: 'ADMIN_STEP_UP_REQUIRED',
      required_permission: 'stores.verify',
      step_up_valid_for_minutes: 10
    }, { status: 428 });
  }
  if (storeAttempts === 2) {
    return Response.json({
      ok: true,
      store: { id: storeId, verification_status: 'verified' }
    });
  }
  throw new Error('Sensitive mutation retried more than once.');
};

const { adminApi, setAdminStepUpHandler } = await import(`../js/admin/api.js?regression=${Date.now()}`);
setAdminStepUpHandler(async payload => {
  stepUps += 1;
  if (payload?.required_permission !== 'stores.verify') {
    throw new Error('Step-up context lost the required permission.');
  }
  return true;
});

const result = await adminApi.storeAction(storeId, 'verify', 'Verifikasi toko UMKM');
setAdminStepUpHandler(null);

if (stepUps !== 1) throw new Error(`Expected exactly one MFA step-up, got ${stepUps}.`);
if (storeAttempts !== 2) throw new Error(`Expected one original request plus one retry, got ${storeAttempts}.`);
if (result?.store?.verification_status !== 'verified') throw new Error('Verified store response was not returned after step-up.');
if (requests.some(request => request.method !== 'PATCH')) throw new Error('Store verify retry must preserve PATCH method.');
if (requests[0]?.body !== requests[1]?.body) throw new Error('Store verify retry must preserve the original mutation body.');
const body = JSON.parse(requests[1].body);
if (body.action !== 'verify' || body.reason !== 'Verifikasi toko UMKM') {
  throw new Error('Store verify retry changed the action or audit reason.');
}

console.log('Admin store verify step-up retry regression passed.');
console.log('Validated: Phase 6 API boundary, one MFA step-up, one bounded retry, preserved PATCH body, verified result.');
