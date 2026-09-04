export class AdminApiError extends Error {
  constructor(message, { status = 0, code = "UNKNOWN_ERROR", payload = null } = {}) {
    super(message || "Permintaan admin gagal.");
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

async function request(path, options = {}) {
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
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new AdminApiError(
      payload?.error || payload?.message || "Permintaan admin gagal.",
      {
        status: response.status,
        code: payload?.code || `HTTP_${response.status}`,
        payload
      }
    );
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
  session() {
    return request("/api/admin/auth/me");
  },

  login(email, password) {
    return request("/api/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  },

  rotatePassword(email, currentPassword, newPassword) {
    return request("/api/admin/auth/rotate-password", {
      method: "POST",
      body: JSON.stringify({
        email,
        current_password: currentPassword,
        new_password: newPassword
      })
    });
  },

  logout() {
    return request("/api/admin/auth/logout", { method: "POST", body: "{}" });
  },

  revokeAll() {
    return request("/api/admin/auth/revoke-all", { method: "POST", body: "{}" });
  },

  access() {
    return request("/api/admin/access/me");
  },

  control(resource, params = {}, { signal } = {}) {
    return request(`/api/admin/control/${resource}${queryString(params)}`, { signal });
  },

  changeUserStatus(id, active, reason) {
    return request(`/api/admin/control/users/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ active, reason })
    });
  },

  storeAction(id, action, reason) {
    return request(`/api/admin/control/stores/${encodeURIComponent(id)}/action`, {
      method: "PATCH",
      body: JSON.stringify({ action, reason })
    });
  },

  changeProductStatus(id, active, reason) {
    return request(`/api/admin/control/products/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ active, reason })
    });
  },

  changePostStatus(id, active, reason) {
    return request(`/api/admin/control/posts/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ active, reason })
    });
  }
});
