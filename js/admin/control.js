import { adminApi, AdminApiError, setAdminStepUpHandler } from "./api.js?v=7.0.0";

const NAV_ITEMS = Object.freeze([
  { key: "overview", label: "Overview", displayLabel: "Dashboard", permission: "dashboard.view", view: "overview", group: "main", icon: "dashboard" },
  { key: "operations", label: "Operations", displayLabel: "Operasional", permission: "dashboard.view", view: "operations", group: "main", icon: "activity" },
  { key: "support", label: "Customer Support", displayLabel: "Dukungan", permission: "support.view", view: "support", group: "service", icon: "support" },
  { key: "growth", label: "Growth", displayLabel: "Pertumbuhan", permission: "growth.view", view: "growth", group: "service", icon: "growth" },
  { key: "users", label: "Users", displayLabel: "Pengguna", permission: "users.view", view: "records", group: "marketplace", icon: "users" },
  { key: "stores", label: "Stores", displayLabel: "Toko", permission: "stores.view", view: "records", group: "marketplace", icon: "store" },
  { key: "products", label: "Products", displayLabel: "Produk", permission: "products.view", view: "records", group: "marketplace", icon: "box" },
  { key: "posts", label: "Posts", displayLabel: "Konten", permission: "posts.view", view: "records", group: "marketplace", icon: "content" },
  { key: "orders", label: "Orders", displayLabel: "Pesanan", permission: "orders.view", view: "records", group: "marketplace", icon: "orders" },
  { key: "reviews", label: "Reviews", displayLabel: "Ulasan", permission: "reviews.view", view: "records", group: "marketplace", icon: "star" },
  { key: "audit", label: "Audit", displayLabel: "Audit", permission: "audit_logs.view", view: "records", group: "system", icon: "audit" },
  { key: "access", label: "Access", displayLabel: "Akses Admin", permission: "admin_accounts.view", view: "records", group: "system", icon: "access" },
  { key: "security", label: "Security", displayLabel: "Keamanan", permission: null, view: "security", group: "system", icon: "shield" }
]);

const NAV_GROUPS = Object.freeze([
  { key: "main", label: "Utama" },
  { key: "service", label: "Layanan & Growth" },
  { key: "marketplace", label: "Marketplace" },
  { key: "system", label: "Sistem" }
]);

const ICONS = Object.freeze({
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  activity: '<path d="M4 18V9"/><path d="M10 18V5"/><path d="M16 18v-7"/><path d="M22 18V3"/>',
  support: '<path d="M4 13a8 8 0 0 1 16 0"/><path d="M4 13v4a2 2 0 0 0 2 2h2v-7H4Z"/><path d="M20 13v4a2 2 0 0 1-2 2h-2v-7h4Z"/><path d="M16 19c0 1.1-.9 2-2 2h-2"/>',
  growth: '<path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="m3 6 6-3 5 4 7-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  store: '<path d="M3 9 5 3h14l2 6"/><path d="M5 13v8h14v-8"/><path d="M9 21v-6h6v6"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
  box: '<path d="m21 8-9 5-9-5"/><path d="m3 8 9-5 9 5v8l-9 5-9-5Z"/><path d="M12 13v8"/>',
  content: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 15 3-3 2 2 3-4 3 5"/><circle cx="8.5" cy="8.5" r="1.5"/>',
  orders: '<path d="M6 2h12l2 5H4Z"/><path d="M5 7v14h14V7"/><path d="M9 11h6"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2l-5-4.9 6.9-1Z"/>',
  audit: '<path d="M9 3h6l1 2h3v16H5V5h3Z"/><path d="M9 11h6"/><path d="M9 15h6"/>',
  access: '<circle cx="9" cy="7" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M19 8v6"/><path d="M16 11h6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  external: '<path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
  logout: '<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>'
});

let routeAbort = null;

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function iconSvg(name) {
  return `<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.dashboard}</svg>`;
}

function currentRoute() {
  const value = location.hash.replace(/^#\/?/, "").split("?")[0].trim();
  return value || "overview";
}

function roleLabel(access) { return access.roles?.map(role => role.name).join(", ") || "Administrator"; }

function sessionLabel(access) {
  const expiry = access.session?.idle_expires_at ? new Date(access.session.idle_expires_at) : null;
  if (!expiry || !Number.isFinite(expiry.getTime())) return "Sesi aktif";
  return `Timeout ${expiry.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;
}

function initials(value) {
  return String(value || "A").trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase() || "A";
}

function displayLabel(item) {
  return item?.displayLabel || item?.label || "Dashboard";
}

function navMarkup(items, current, className = "") {
  return items.map(item => `<a class="nav-link ${className}" href="#/${item.key}" data-route="${item.key}" data-route-label="${escapeHtml(displayLabel(item))}" ${item.key === current ? 'aria-current="page"' : ""}>${iconSvg(item.icon)}<span class="nav-label">${escapeHtml(displayLabel(item))}</span></a>`).join("");
}

function sidebarNavMarkup(items, current) {
  return NAV_GROUPS.map(group => {
    const groupItems = items.filter(item => item.group === group.key);
    if (!groupItems.length) return "";
    return `<section class="sidebar-nav-group" aria-label="${escapeHtml(group.label)}"><p class="sidebar-nav-label">${escapeHtml(group.label)}</p><div class="sidebar-nav-items">${navMarkup(groupItems, current)}</div></section>`;
  }).join("");
}

function buildShell(root, access, items, current) {
  const currentItem = items.find(item => item.key === current) || items[0];
  const name = escapeHtml(access.admin.name);
  const role = escapeHtml(roleLabel(access));
  const session = escapeHtml(sessionLabel(access));
  const avatar = escapeHtml(initials(access.admin.name));
  root.innerHTML = `
    <aside class="control-sidebar">
      <div class="sidebar-brand"><img src="/assets/logo.webp" width="42" height="42" alt=""><div><strong>Pasar UMKM</strong><span>Admin Console</span></div></div>
      <nav class="sidebar-nav" aria-label="Navigasi admin">${sidebarNavMarkup(items, current)}</nav>
      <div class="sidebar-account">
        <div class="sidebar-account-row"><span class="admin-avatar" aria-hidden="true">${avatar}</span><div class="sidebar-account-copy"><strong>${name}</strong><span>${role}</span></div></div>
        <button class="button sidebar-logout" id="desktopLogout" type="button">${iconSvg("logout")}<span>Keluar dari admin</span></button>
      </div>
    </aside>
    <main class="control-main">
      <header class="control-topbar">
        <div class="topbar-brand"><img class="topbar-logo" src="/assets/logo.webp" width="36" height="36" alt=""><div class="topbar-title"><strong>Pasar UMKM Admin</strong><span>${session}</span></div></div>
        <div class="topbar-context"><span>Admin Console</span><strong id="topbarRouteTitle">${escapeHtml(displayLabel(currentItem))}</strong></div>
        <div class="topbar-actions">
          <a class="topbar-market-link" href="/" target="_blank" rel="noopener">${iconSvg("external")}<span>Marketplace</span></a>
          <div class="topbar-account"><span class="admin-avatar" aria-hidden="true">${avatar}</span><div class="topbar-account-copy"><strong>${name}</strong><span>${session}</span></div></div>
          <button class="button button-secondary mobile-logout" id="mobileLogout" type="button" aria-label="Keluar dari admin">${iconSvg("logout")}</button>
        </div>
      </header>
      <nav class="mobile-nav" aria-label="Navigasi admin mobile">${navMarkup(items, current)}</nav>
      <div class="control-content" id="viewHost"></div>
    </main>`;
}

function syncNav(route) {
  let routeLabel = "Dashboard";
  document.querySelectorAll("[data-route]").forEach(link => {
    if (route === link.dataset.route) {
      link.setAttribute("aria-current", "page");
      routeLabel = link.dataset.routeLabel || routeLabel;
    } else {
      link.removeAttribute("aria-current");
    }
  });
  const title = document.getElementById("topbarRouteTitle");
  if (title) title.textContent = routeLabel;
}

function loadingView(host) {
  host.innerHTML = `<div class="view-header"><div><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-line"></div></div></div><div class="data-shell"><div class="skeleton skeleton-field"></div><div class="skeleton skeleton-field"></div><div class="skeleton skeleton-field"></div></div>`;
}

function createActionConfirmer() {
  const dialog = document.getElementById("actionDialog");
  const form = document.getElementById("actionDialogForm");
  const title = document.getElementById("actionDialogTitle");
  const copy = document.getElementById("actionDialogCopy");
  const reason = document.getElementById("actionReason");
  const reasonLabel = form.querySelector('label[for="actionReason"]');
  const reasonHint = form.querySelector(".field-hint");
  const confirmButton = document.getElementById("actionConfirmButton");
  let pending = null;
  let reasonRequired = true;

  form.addEventListener("submit", event => {
    const submitter = event.submitter;
    if (!pending || submitter?.value !== "confirm") {
      pending?.resolve(null);
      pending = null;
      return;
    }
    event.preventDefault();
    const value = reason.value.trim();
    if (reasonRequired && value.length < 8) {
      reason.setCustomValidity("Tuliskan alasan minimal 8 karakter.");
      reason.reportValidity();
      return;
    }
    reason.setCustomValidity("");
    const resolve = pending.resolve;
    pending = null;
    dialog.close("confirm");
    resolve(reasonRequired ? value : "");
  });

  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    pending?.resolve(null);
    pending = null;
    dialog.close("cancel");
  });

  return ({ title: nextTitle, copy: nextCopy, confirmLabel = "Konfirmasi", tone = "danger", requireReason = true }) => {
    if (pending) pending.resolve(null);
    reasonRequired = requireReason;
    title.textContent = nextTitle;
    copy.textContent = nextCopy;
    reason.value = "";
    reason.required = requireReason;
    reason.hidden = !requireReason;
    if (reasonLabel) reasonLabel.hidden = !requireReason;
    if (reasonHint) reasonHint.hidden = !requireReason;
    reason.setCustomValidity("");
    confirmButton.textContent = confirmLabel;
    confirmButton.className = `button ${tone === "positive" ? "button-primary" : "button-danger"}`;
    dialog.showModal();
    queueMicrotask(() => (requireReason ? reason : confirmButton).focus());
    return new Promise(resolve => { pending = { resolve }; });
  };
}

async function renderRoute({ access, items, host, confirmAction, onSessionExpired, requestStepUp, allowStepUpRetry = true }) {
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
    permissionSet: new Set(access.permissions.map(permission => permission.key)),
    signal: routeAbort.signal,
    confirmAction,
    requestStepUp,
    onSessionExpired,
    refresh: () => renderRoute({ access, items, host, confirmAction, onSessionExpired, requestStepUp })
  };

  try {
    if (item.view === "overview") {
      const module = await import("./overview.js?v=6.0.0");
      await module.renderOverview(context);
    } else if (item.view === "operations") {
      const module = await import("./operations.js?v=6.1.0");
      await module.renderOperations(context);
    } else if (item.view === "support") {
      const module = await import("./support.js?v=1.0.0");
      await module.renderSupport(context);
    } else if (item.view === "growth") {
      const module = await import("./growth.js?v=7.0.0");
      await module.renderGrowth(context);
    } else if (item.view === "security") {
      const module = await import("./security.js?v=6.0.0");
      await module.renderSecurity(context);
    } else {
      const module = await import("./records.js?v=6.0.0");
      await module.renderRecords(context);
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
    if (error instanceof AdminApiError && error.status === 401) {
      onSessionExpired();
      return;
    }
    if (allowStepUpRetry && error instanceof AdminApiError && error.code === "ADMIN_STEP_UP_REQUIRED") {
      const verified = await requestStepUp();
      if (verified) {
        await renderRoute({ access, items, host, confirmAction, onSessionExpired, requestStepUp, allowStepUpRetry: false });
        return;
      }
    }
    host.innerHTML = `<div class="error-state"><strong>Data admin tidak dapat dimuat.</strong><p>${escapeHtml(error?.message || "Terjadi kesalahan saat memuat Admin Console.")}</p></div>`;
  }
}

export async function mountControlCenter({ root, onSessionExpired, requestStepUp }) {
  setAdminStepUpHandler(requestStepUp);
  const access = await adminApi.access();
  const permissionSet = new Set(access.permissions.map(permission => permission.key));
  const items = NAV_ITEMS.filter(item => !item.permission || permissionSet.has(item.permission));
  const initial = items.find(item => item.key === currentRoute())?.key || items[0]?.key || "security";
  if (!location.hash || !items.some(item => item.key === currentRoute())) history.replaceState(null, "", `#/${initial}`);

  buildShell(root, access, items, initial);
  const host = document.getElementById("viewHost");
  const confirmAction = createActionConfirmer();
  const expireSession = () => {
    routeAbort?.abort();
    routeAbort = null;
    window.onhashchange = null;
    setAdminStepUpHandler(null);
    onSessionExpired();
  };

  const logout = async button => {
    button.disabled = true;
    const original = button.innerHTML;
    button.textContent = "Keluar…";
    try { await adminApi.logout(); } finally {
      button.innerHTML = original;
      expireSession();
    }
  };

  document.getElementById("desktopLogout")?.addEventListener("click", event => logout(event.currentTarget));
  document.getElementById("mobileLogout")?.addEventListener("click", event => logout(event.currentTarget));
  const routeHandler = () => renderRoute({ access, items, host, confirmAction, onSessionExpired: expireSession, requestStepUp });
  window.onhashchange = routeHandler;
  await routeHandler();
}
