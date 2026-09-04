export class AdminApiError extends Error {
  constructor(message, { status = 0, code = "UNKNOWN_ERROR", payload = null } = {}) {
    super(message || "Permintaan admin gagal.");
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

const STEP_UP_HANDLER_KEY = "__PASAR_UMKM_ADMIN_STEP_UP_HANDLER__";

export function setAdminStepUpHandler(handler) {
  globalThis[STEP_UP_HANDLER_KEY] = typeof handler === "function" ? handler : null;
}

async function request(path, options = {}, allowStepUpRetry = true) {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }

  if (!response.ok) {
    const code = payload?.code || `HTTP_${response.status}`;
    const stepUpHandler = globalThis[STEP_UP_HANDLER_KEY];
    if (allowStepUpRetry && code === "ADMIN_STEP_UP_REQUIRED" && typeof stepUpHandler === "function" && path !== "/api/admin/auth/step-up") {
      const verified = await stepUpHandler(payload);
      if (verified) return request(path, options, false);
    }
    throw new AdminApiError(payload?.error || payload?.message || "Permintaan admin gagal.", {
      status: response.status,
      code,
      payload
    });
  }
  return payload || { ok: true };
}

function queryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}

export const adminApi = Object.freeze({
  session() { return request("/api/admin/auth/me"); },
  login(email, password) { return request("/api/admin/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }); },
  rotatePassword(email, currentPassword, newPassword) { return request("/api/admin/auth/rotate-password", { method: "POST", body: JSON.stringify({ email, current_password: currentPassword, new_password: newPassword }) }); },
  mfaEnrollStart() { return request("/api/admin/auth/mfa/enroll/start", { method: "POST", body: "{}" }); },
  mfaEnrollVerify(code) { return request("/api/admin/auth/mfa/enroll/verify", { method: "POST", body: JSON.stringify({ code }) }); },
  mfaVerify(code, method = "totp") { return request("/api/admin/auth/mfa/verify", { method: "POST", body: JSON.stringify({ code, method }) }); },
  stepUp(code, method = "totp") { return request("/api/admin/auth/step-up", { method: "POST", body: JSON.stringify({ code, method }) }, false); },
  mfaStatus() { return request("/api/admin/auth/mfa/status"); },
  regenerateRecoveryCodes() { return request("/api/admin/auth/mfa/recovery/regenerate", { method: "POST", body: "{}" }); },
  securitySessions() { return request("/api/admin/security/sessions"); },
  revokeSecuritySession(id) { return request(`/api/admin/security/sessions/${encodeURIComponent(id)}/revoke`, { method: "POST", body: "{}" }); },
  securityEvents() { return request("/api/admin/security/events"); },
  logout() { return request("/api/admin/auth/logout", { method: "POST", body: "{}" }); },
  revokeAll() { return request("/api/admin/auth/revoke-all", { method: "POST", body: "{}" }); },
  access() { return request("/api/admin/access/me"); },
  control(resource, params = {}, { signal } = {}) { return request(`/api/admin/control/${resource}${queryString(params)}`, { signal }); },
  changeUserStatus(id, active, reason) { return request(`/api/admin/control/users/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify({ active, reason }) }); },
  storeAction(id, action, reason) { return request(`/api/admin/control/stores/${encodeURIComponent(id)}/action`, { method: "PATCH", body: JSON.stringify({ action, reason }) }); },
  changeProductStatus(id, active, reason) { return request(`/api/admin/control/products/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify({ active, reason }) }); },
  changePostStatus(id, active, reason) { return request(`/api/admin/control/posts/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify({ active, reason }) }); }
});
