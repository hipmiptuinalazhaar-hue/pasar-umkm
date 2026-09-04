import { adminApi, AdminApiError } from "./api.js?v=5.0.0";

const number = new Intl.NumberFormat("id-ID");
const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function statusClass(value) {
  const normalized = String(value || "").toLowerCase();
  if (["active", "verified", "completed", "success", "true"].includes(normalized)) return "status-success";
  if (["pending", "processing", "ready", "confirmed"].includes(normalized)) return "status-warning";
  if (["inactive", "suspended", "rejected", "cancelled", "denied", "failure", "false"].includes(normalized)) return "status-danger";
  return "status-info";
}

function badge(value, label = null) {
  return `<span class="status ${statusClass(value)}">${escapeHtml(label ?? value ?? "—")}</span>`;
}

function routeParams() {
  const hash = location.hash.replace(/^#\/?/, "");
  const question = hash.indexOf("?");
  return new URLSearchParams(question >= 0 ? hash.slice(question + 1) : "");
}

function setRouteParams(route, updates) {
  const params = routeParams();
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === "" || value === "all") params.delete(key);
    else params.set(key, String(value));
  }
  const query = params.toString();
  const next = `#/${route}${query ? `?${query}` : ""}`;
  if (location.hash === next) return;
  location.hash = next;
}

function actionButton(action, id, label, tone = "") {
  return `<button class="row-action ${tone}" type="button" data-admin-action="${action}" data-id="${escapeHtml(id)}">${escapeHtml(label)}</button>`;
}

function allowed(context, permission) {
  return context.permissionSet.has(permission);
}

function usersRow(item, context) {
  const actions = [];
  if (item.is_active && allowed(context, "users.suspend")) actions.push(actionButton("user-suspend", item.id, "Suspend", "row-action-danger"));
  if (!item.is_active && allowed(context, "users.reactivate")) actions.push(actionButton("user-reactivate", item.id, "Reactivate", "row-action-positive"));
  return `<li class="data-row">
    <div class="data-primary"><p class="data-title">${escapeHtml(item.name)}</p><p class="data-subtitle">${escapeHtml(item.email)}</p></div>
    <div class="data-meta">
      ${badge(item.is_active ? "active" : "suspended", item.is_active ? "Active" : "Suspended")}
      <span>Role: ${escapeHtml(item.role)}</span>
      <span>${item.email_verified ? "Email verified" : "Email belum verified"}</span>
      <span>${item.has_store ? `Store: ${escapeHtml(item.store_name || "Ada")}` : "Tanpa store"}</span>
      <span>Dibuat ${formatDate(item.created_at)}</span>
    </div>
    <div class="data-actions">${actions.join("")}</div>
  </li>`;
}

function storesRow(item, context) {
  const actions = [];
  if (item.verification_status !== "verified" && allowed(context, "stores.verify")) actions.push(actionButton("store-verify", item.id, "Verify", "row-action-positive"));
  if (item.is_active && allowed(context, "stores.suspend")) actions.push(actionButton("store-suspend", item.id, "Suspend", "row-action-danger"));
  if (!item.is_active && allowed(context, "stores.reactivate")) actions.push(actionButton("store-reactivate", item.id, "Reactivate", "row-action-positive"));
  return `<li class="data-row">
    <div class="data-primary"><p class="data-title">${escapeHtml(item.name)}</p><p class="data-subtitle">Owner: ${escapeHtml(item.owner_name)} · ${escapeHtml(item.owner_email)}</p></div>
    <div class="data-meta">
      ${badge(item.verification_status)} ${badge(item.is_active ? "active" : "inactive", item.is_active ? "Active" : "Inactive")}
      <span>${number.format(Number(item.product_count || 0))} produk</span>
      <span>${number.format(Number(item.order_count || 0))} order</span>
      <span>${escapeHtml([item.city, item.province].filter(Boolean).join(", ") || "Lokasi belum diisi")}</span>
    </div>
    <div class="data-actions">${actions.join("")}</div>
  </li>`;
}

function productsRow(item, context) {
  const actions = [];
  if (item.is_active && allowed(context, "products.suspend")) actions.push(actionButton("product-suspend", item.id, "Suspend", "row-action-danger"));
  if (!item.is_active && allowed(context, "products.restore")) actions.push(actionButton("product-restore", item.id, "Restore", "row-action-positive"));
  return `<li class="data-row">
    <div class="data-primary"><p class="data-title">${escapeHtml(item.name)}</p><p class="data-subtitle">${escapeHtml(item.store_name)}</p></div>
    <div class="data-meta">
      ${badge(item.is_active ? "active" : "inactive", item.is_active ? "Active" : "Inactive")}
      <span>${currency.format(Number(item.price || 0))}</span>
      <span>Stok ${number.format(Number(item.stock || 0))} ${escapeHtml(item.unit || "")}</span>
      ${item.is_featured ? "<span>Featured</span>" : ""}
    </div>
    <div class="data-actions">${actions.join("")}</div>
  </li>`;
}

function postsRow(item, context) {
  const actions = [];
  if (item.is_active && allowed(context, "posts.suspend")) actions.push(actionButton("post-suspend", item.id, "Suspend", "row-action-danger"));
  if (!item.is_active && allowed(context, "posts.restore")) actions.push(actionButton("post-restore", item.id, "Restore", "row-action-positive"));
  return `<li class="data-row">
    <div class="data-primary"><p class="data-title">${escapeHtml(item.store_name)}</p><p class="data-subtitle">${escapeHtml(item.caption || "Tanpa caption")}</p></div>
    <div class="data-meta">${badge(item.is_active ? "active" : "inactive", item.is_active ? "Active" : "Inactive")}<span>${formatDate(item.created_at)}</span></div>
    <div class="data-actions">${actions.join("")}</div>
  </li>`;
}

function ordersRow(item) {
  return `<li class="data-row">
    <div class="data-primary"><p class="data-title">${escapeHtml(item.order_number)}</p><p class="data-subtitle">${escapeHtml(item.buyer_name)} → ${escapeHtml(item.store_name)}</p></div>
    <div class="data-meta">${badge(item.status)}<span>${currency.format(Number(item.total || 0))}</span><span>${formatDate(item.created_at)}</span></div>
    <div class="data-actions"></div>
  </li>`;
}

function reviewsRow(item) {
  return `<li class="data-row">
    <div class="data-primary"><p class="data-title">${escapeHtml(item.subject_name)}</p><p class="data-subtitle">${escapeHtml(item.review || "Tanpa ulasan teks")}</p></div>
    <div class="data-meta">${badge("info", `${number.format(Number(item.rating || 0))}/5`)}<span>${escapeHtml(item.subject_type)}</span><span>oleh ${escapeHtml(item.user_name)}</span><span>${formatDate(item.created_at)}</span></div>
    <div class="data-actions"></div>
  </li>`;
}

function auditRow(item) {
  return `<li class="data-row">
    <div class="data-primary"><p class="data-title">${escapeHtml(item.action)}</p><p class="data-subtitle">${escapeHtml(item.actor_name_snapshot || "System bootstrap")} · ${escapeHtml(item.actor_email_snapshot || "no actor email")}</p></div>
    <div class="data-meta">${badge(item.outcome)}<span>${escapeHtml(item.resource_type || "—")}: ${escapeHtml(item.resource_id || "—")}</span><span>${escapeHtml(item.reason_code || "no_reason_code")}</span><span>${formatDate(item.created_at)}</span></div>
    <div class="data-actions"></div>
  </li>`;
}

function adminsRow(item) {
  return `<li class="data-row">
    <div class="data-primary"><p class="data-title">${escapeHtml(item.name)}</p><p class="data-subtitle">${escapeHtml(item.email)}</p></div>
    <div class="data-meta">${badge(item.status)}<span>${escapeHtml((item.roles || []).join(", ") || "No active role")}</span><span>${item.mfa_enrolled ? "MFA enrolled" : "MFA belum enrolled"}</span><span>${item.must_rotate_password ? "Password rotation required" : "Password rotated"}</span><span>Last login ${formatDate(item.last_login_at)}</span></div>
    <div class="data-actions"></div>
  </li>`;
}

const CONFIG = Object.freeze({
  users: { title: "Users", description: "Akun marketplace publik. Suspend user langsung mencabut session publik aktif.", resource: "users", search: "Cari nama atau email", filter: { key: "state", options: [["all", "Semua"], ["active", "Active"], ["suspended", "Suspended"]] }, render: usersRow },
  stores: { title: "Stores", description: "Status merchant, verifikasi UMKM, aktivitas toko, dan konteks owner.", resource: "stores", search: "Cari toko atau email owner", filter: { key: "verification", options: [["all", "Semua"], ["pending", "Pending"], ["verified", "Verified"], ["rejected", "Rejected"]] }, render: storesRow },
  products: { title: "Products", description: "Katalog produk lintas toko dengan kontrol suspend/restore yang ter-audit.", resource: "products", search: "Cari produk atau toko", filter: { key: "state", options: [["all", "Semua"], ["active", "Active"], ["inactive", "Inactive"]] }, render: productsRow },
  posts: { title: "Social Posts", description: "Konten social-commerce. Hanya tindakan yang benar-benar didukung backend yang ditampilkan.", resource: "posts", filter: { key: "state", options: [["all", "Semua"], ["active", "Active"], ["inactive", "Inactive"]] }, render: postsRow },
  orders: { title: "Orders", description: "Konteks order tanpa mengekspos nomor telepon atau alamat pengiriman di list view.", resource: "orders", search: "Cari nomor order, buyer, atau toko", filter: { key: "status", options: [["all", "Semua"], ["pending", "Pending"], ["confirmed", "Confirmed"], ["processing", "Processing"], ["ready", "Ready"], ["completed", "Completed"], ["cancelled", "Cancelled"]] }, render: ordersRow },
  reviews: { title: "Reviews", description: "Rating store dan produk dari data transaksi yang sudah tersedia.", resource: "reviews", filter: { key: "type", options: [["all", "Semua"], ["store", "Store"], ["product", "Product"]] }, render: reviewsRow },
  audit: { title: "Audit Log", description: "Jejak tindakan privileged. IP hash dan User-Agent hash sengaja tidak diekspos di list UI.", resource: "audit", filter: { key: "outcome", options: [["all", "Semua"], ["success", "Success"], ["denied", "Denied"], ["failure", "Failure"]] }, render: auditRow },
  access: { title: "Admin Access", description: "Identitas admin internal dan role aktif. Pembuatan admin/role assignment belum ditampilkan sebelum flow keamanan lanjutan siap.", resource: "admins", render: adminsRow }
});

function toolbar(config, params) {
  const search = config.search
    ? `<form class="toolbar-search" id="recordSearchForm"><input class="field-input" id="recordSearch" type="search" inputmode="search" maxlength="80" value="${escapeHtml(params.get("q") || "")}" placeholder="${escapeHtml(config.search)}" aria-label="${escapeHtml(config.search)}"></form>`
    : "<div></div>";
  const filters = config.filter
    ? `<div class="toolbar-filters" aria-label="Filter ${escapeHtml(config.title)}">${config.filter.options.map(([value, label]) => {
        const active = (params.get(config.filter.key) || "all") === value;
        return `<button class="filter-button" type="button" data-filter-key="${config.filter.key}" data-filter-value="${value}" aria-pressed="${active}">${escapeHtml(label)}</button>`;
      }).join("")}</div>`
    : "<div></div>";
  return `<div class="toolbar">${search}${filters}</div>`;
}

function pageParams(config, params, cursor = null) {
  const result = { limit: 24 };
  if (config.search && params.get("q")) result.q = params.get("q");
  if (config.filter && params.get(config.filter.key)) result[config.filter.key] = params.get(config.filter.key);
  if (cursor) result.cursor = cursor;
  return result;
}

function showNotice(host, message, tone = "info") {
  let notice = host.querySelector("#viewNotice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "viewNotice";
    const header = host.querySelector(".view-header");
    header?.insertAdjacentElement("afterend", notice);
  }
  notice.className = `view-notice view-notice-${tone}`;
  notice.setAttribute("role", tone === "error" ? "alert" : "status");
  notice.textContent = message;
}

const ACTIONS = Object.freeze({
  "user-suspend": { title: "Suspend pengguna?", copy: "Pengguna tidak dapat menggunakan akun sampai direaktivasi. Session publik aktif akan dicabut.", label: "Suspend user", tone: "danger", run: (id, reason) => adminApi.changeUserStatus(id, false, reason) },
  "user-reactivate": { title: "Reactivate pengguna?", copy: "Pengguna akan kembali diizinkan menggunakan akun marketplace.", label: "Reactivate", tone: "positive", run: (id, reason) => adminApi.changeUserStatus(id, true, reason) },
  "store-verify": { title: "Verifikasi toko?", copy: "Status verifikasi toko akan berubah menjadi verified dan waktu verifikasi dicatat.", label: "Verify store", tone: "positive", run: (id, reason) => adminApi.storeAction(id, "verify", reason) },
  "store-suspend": { title: "Suspend toko?", copy: "Toko akan dinonaktifkan dari status operasional sampai direaktivasi.", label: "Suspend store", tone: "danger", run: (id, reason) => adminApi.storeAction(id, "suspend", reason) },
  "store-reactivate": { title: "Reactivate toko?", copy: "Toko akan kembali aktif. Status verifikasi tidak diubah oleh tindakan ini.", label: "Reactivate", tone: "positive", run: (id, reason) => adminApi.storeAction(id, "reactivate", reason) },
  "product-suspend": { title: "Suspend produk?", copy: "Produk akan ditandai tidak aktif sampai di-restore oleh admin yang berwenang.", label: "Suspend product", tone: "danger", run: (id, reason) => adminApi.changeProductStatus(id, false, reason) },
  "product-restore": { title: "Restore produk?", copy: "Produk akan kembali aktif di katalog sesuai aturan publik yang berlaku.", label: "Restore product", tone: "positive", run: (id, reason) => adminApi.changeProductStatus(id, true, reason) },
  "post-suspend": { title: "Suspend post?", copy: "Post social-commerce akan dinonaktifkan sampai di-restore.", label: "Suspend post", tone: "danger", run: (id, reason) => adminApi.changePostStatus(id, false, reason) },
  "post-restore": { title: "Restore post?", copy: "Post social-commerce akan kembali aktif.", label: "Restore post", tone: "positive", run: (id, reason) => adminApi.changePostStatus(id, true, reason) }
});

async function runAction(context, button) {
  const action = ACTIONS[button.dataset.adminAction];
  if (!action) return;
  const reason = await context.confirmAction({ title: action.title, copy: action.copy, confirmLabel: action.label, tone: action.tone });
  if (!reason) return;

  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Memproses…";
  button.setAttribute("aria-busy", "true");
  try {
    await action.run(button.dataset.id, reason);
    button.textContent = "Berhasil";
    await context.refresh();
    showNotice(context.host, "Tindakan berhasil dan sudah dicatat ke audit log.", "success");
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) {
      context.onSessionExpired();
      return;
    }
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = original;
    showNotice(context.host, error?.message || "Tindakan admin gagal diproses.", "error");
  }
}

export async function renderRecords(context) {
  const config = CONFIG[context.route];
  if (!config) throw new Error("View admin tidak dikenali.");
  const params = routeParams();
  const payload = await adminApi.control(config.resource, pageParams(config, params), { signal: context.signal });

  context.host.innerHTML = `
    <header class="view-header">
      <div><p class="eyebrow">Admin Control Center</p><h1 class="view-title">${escapeHtml(config.title)}</h1><p class="view-description">${escapeHtml(config.description)}</p></div>
    </header>
    ${toolbar(config, params)}
    <section class="data-shell" aria-label="${escapeHtml(config.title)} data">
      <ul class="data-list" id="recordList">${(payload.items || []).map(item => config.render(item, context)).join("")}</ul>
      ${(payload.items || []).length === 0 ? `<div class="empty-state"><strong>Belum ada data.</strong><p>Tidak ada ${escapeHtml(config.title.toLowerCase())} yang cocok dengan filter saat ini.</p></div>` : ""}
      <div class="load-more" id="loadMoreWrap" ${payload.page?.has_more ? "" : "hidden"}><button class="button button-secondary" id="loadMoreButton" type="button">Muat lebih banyak</button></div>
    </section>
  `;

  document.getElementById("recordSearchForm")?.addEventListener("submit", event => {
    event.preventDefault();
    setRouteParams(context.route, { q: document.getElementById("recordSearch").value.trim() });
  });

  context.host.querySelectorAll("[data-filter-key]").forEach(button => {
    button.addEventListener("click", () => setRouteParams(context.route, { [button.dataset.filterKey]: button.dataset.filterValue }));
  });

  context.host.onclick = event => {
    const button = event.target.closest("[data-admin-action]");
    if (button) runAction(context, button);
  };

  const loadMore = document.getElementById("loadMoreButton");
  if (loadMore && payload.page?.next_cursor) {
    let cursor = payload.page.next_cursor;
    loadMore.addEventListener("click", async () => {
      loadMore.disabled = true;
      loadMore.textContent = "Memuat…";
      try {
        const next = await adminApi.control(config.resource, pageParams(config, params, cursor), { signal: context.signal });
        document.getElementById("recordList").insertAdjacentHTML("beforeend", (next.items || []).map(item => config.render(item, context)).join(""));
        cursor = next.page?.next_cursor || null;
        if (!next.page?.has_more || !cursor) document.getElementById("loadMoreWrap").hidden = true;
        else {
          loadMore.disabled = false;
          loadMore.textContent = "Muat lebih banyak";
        }
      } catch (error) {
        if (error instanceof AdminApiError && error.status === 401) {
          context.onSessionExpired();
          return;
        }
        loadMore.disabled = false;
        loadMore.textContent = "Coba lagi";
        showNotice(context.host, error?.message || "Data lanjutan gagal dimuat.", "error");
      }
    });
  }
}
