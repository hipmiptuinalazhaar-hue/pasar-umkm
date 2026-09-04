import { adminApi, AdminApiError } from "./api.js?v=5.0.0";

const NAV_ITEMS = Object.freeze([
  { key: "overview", label: "Overview", permission: "dashboard.view", view: "overview" },
  { key: "users", label: "Users", permission: "users.view", view: "records" },
  { key: "stores", label: "Stores", permission: "stores.view", view: "records" },
  { key: "products", label: "Products", permission: "products.view", view: "records" },
  { key: "posts", label: "Posts", permission: "posts.view", view: "records" },
  { key: "orders", label: "Orders", permission: "orders.view", view: "records" },
  { key: "reviews", label: "Reviews", permission: "reviews.view", view: "records" },
  { key: "audit", label: "Audit", permission: "audit_logs.view", view: "records" },
  { key: "access", label: "Access", permission: "admin_accounts.view", view: "records" }
]);

let routeAbort = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function currentRoute() {
  const value = location.hash.replace(/^#\/?/, "").split("?")[0].trim();
  return value || "overview";
}

function roleLabel(access) {
  return access.roles?.map(role => role.name).join(", ") || "Administrator";
}

function sessionLabel(access) {
  const expiry = access.session?.idle_expires_at ? new Date(access.session.idle_expires_at) : null;
  if (!expiry || !Number.isFinite(expiry.getTime())) return "Session aktif";
  return `Idle timeout ${expiry.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;
}

function navMarkup(items, current, className) {
  return items.map(item => `
    <a class="nav-link ${className || ""}" href="#/${item.key}" data-route="${item.key}" ${item.key === current ? 'aria-current="page"' : ""}>
      ${escapeHtml(item.label)}
    </a>
  `).join("");
}

function buildShell(root, access, items, current) {
  root.innerHTML = `
    <aside class="control-sidebar">
      <div class="sidebar-brand">
        <img src="/assets/logo.webp" width="42" height="42" alt="">
        <div>
          <strong>Pasar UMKM</strong>
          <span>Control Center</span>
        </div>
      </div>
      <nav class="sidebar-nav" aria-label="Navigasi admin">
        ${navMarkup(items, current)}
      </nav>
      <div class="sidebar-account">
        <strong>${escapeHtml(access.admin.name)}</strong>
        <span>${escapeHtml(roleLabel(access))}</span>
        <button class="button sidebar-logout" id="desktopLogout" type="button">Keluar</button>
      </div>
    </aside>

    <main class="control-main">
      <header class="control-topbar">
        <div class="topbar-brand">
          <img class="topbar-logo" src="/assets/logo.webp" width="36" height="36" alt="">
          <div class="topbar-title">
            <strong>${escapeHtml(access.admin.name)}</strong>
            <span>${escapeHtml(sessionLabel(access))}</span>
          </div>
        </div>
        <button class="button button-secondary" id="mobileLogout" type="button">Keluar</button>
      </header>
      <nav class="mobile-nav" aria-label="Navigasi admin mobile">
        ${navMarkup(items, current)}
      </nav>
      <div class="control-content" id="viewHost"></div>
    </main>
  `;
}

function syncNav(route) {
  document.querySelectorAll("[data-route]").forEach(link => {
    if (link.dataset.route === route) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function loadingView(host) {
  host.innerHTML = `
    <div class="view-header">
      <div>
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-line"></div>
      </div>
    </div>
    <div class="data-shell">
      <div class="skeleton skeleton-field"></div>
      <div class="skeleton skeleton-field"></div>
      <div class="skeleton skeleton-field"></div>
    </div>
  `;
}

function createActionConfirmer() {
  const dialog = document.getElementById("actionDialog");
  const form = document.getElementById("actionDialogForm");
  const title = document.getElementById("actionDialogTitle");
  const copy = document.getElementById("actionDialogCopy");
  const reason = document.getElementById("actionReason");
  const confirmButton = document.getElementById("actionConfirmButton");
  let pending = null;

  form.addEventListener("submit", event => {
    const submitter = event.submitter;
    if (!pending || submitter?.value !== "confirm") {
      pending?.resolve(null);
      pending = null;
      return;
    }

    event.preventDefault();
    const value = reason.value.trim();
    if (value.length < 8) {
      reason.setCustomValidity("Tuliskan alasan minimal 8 karakter.");
      reason.reportValidity();
      return;
    }
    reason.setCustomValidity("");
    const resolve = pending.resolve;
    pending = null;
    dialog.close("confirm");
    resolve(value);
  });

  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    pending?.resolve(null);
    pending = null;
    dialog.close("cancel");
  });

  return ({ title: nextTitle, copy: nextCopy, confirmLabel = "Konfirmasi", tone = "danger" }) => {
    if (pending) pending.resolve(null);
    title.textContent = nextTitle;
    copy.textContent = nextCopy;
    reason.value = "";
    reason.setCustomValidity("");
    confirmButton.textContent = confirmLabel;
    confirmButton.className = `button ${tone === "positive" ? "button-primary" : "button-danger"}`;
    dialog.showModal();
    queueMicrotask(() => reason.focus());
    return new Promise(resolve => {
      pending = { resolve };
    });
  };
}

async function renderRoute({ access, items, host, confirmAction, onSessionExpired }) {
  let route = currentRoute();
  const item = items.find(entry => entry.key === route) || items[0];
  if (!item) {
    host.innerHTML = `<div class="empty-state"><strong>Tidak ada capability admin.</strong><p>Akun ini belum memiliki permission aktif.</p></div>`;
    return;
  }

  if (route !== item.key) {
    history.replaceState(null, "", `#/${item.key}`);
    route = item.key;
  }

  syncNav(route);
  loadingView(host);
  routeAbort?.abort();
  routeAbort = new AbortController();

  const context = {
    host,
    route,
    access,
    permissionSet: new Set(access.permissions.map(item => item.key)),
    signal: routeAbort.signal,
    confirmAction,
    onSessionExpired,
    refresh: () => renderRoute({ access, items, host, confirmAction, onSessionExpired })
  };

  try {
    if (item.view === "overview") {
      const module = await import("./overview.js?v=5.0.0");
      await module.renderOverview(context);
    } else {
      const module = await import("./records.js?v=5.0.0");
      await module.renderRecords(context);
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
    if (error instanceof AdminApiError && error.status === 401) {
      onSessionExpired();
      return;
    }
    host.innerHTML = `
      <div class="error-state">
        <strong>Data admin tidak dapat dimuat.</strong>
        <p>${escapeHtml(error?.message || "Terjadi kesalahan saat memuat Control Center.")}</p>
      </div>
    `;
  }
}

export async function mountControlCenter({ root, onSessionExpired }) {
  const access = await adminApi.access();
  const permissionSet = new Set(access.permissions.map(permission => permission.key));
  const items = NAV_ITEMS.filter(item => permissionSet.has(item.permission));
  const initial = items.find(item => item.key === currentRoute())?.key || items[0]?.key || "overview";

  if (!location.hash || !items.some(item => item.key === currentRoute())) {
    history.replaceState(null, "", `#/${initial}`);
  }

  buildShell(root, access, items, initial);
  const host = document.getElementById("viewHost");
  const confirmAction = createActionConfirmer();
  const expireSession = () => {
    routeAbort?.abort();
    routeAbort = null;
    window.onhashchange = null;
    onSessionExpired();
  };

  const logout = async button => {
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "Keluar…";
    try {
      await adminApi.logout();
    } finally {
      button.textContent = original;
      expireSession();
    }
  };

  document.getElementById("desktopLogout")?.addEventListener("click", event => logout(event.currentTarget));
  document.getElementById("mobileLogout")?.addEventListener("click", event => logout(event.currentTarget));

  const routeHandler = () => renderRoute({ access, items, host, confirmAction, onSessionExpired: expireSession });
  window.onhashchange = routeHandler;
  await routeHandler();
}
