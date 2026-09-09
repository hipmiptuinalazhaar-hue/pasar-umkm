import { adminApi, AdminApiError } from "./api.js?v=6.0.0";

const number = new Intl.NumberFormat("id-ID");
const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0
});

const STATUS_LABELS = Object.freeze({
  active: "Aktif",
  inactive: "Nonaktif",
  suspended: "Ditangguhkan",
  pending: "Menunggu",
  verified: "Terverifikasi",
  rejected: "Ditolak",
  confirmed: "Dikonfirmasi",
  processing: "Diproses",
  ready: "Siap",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  success: "Berhasil",
  denied: "Ditolak",
  failure: "Gagal"
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
  const normalized = String(value ?? "").toLowerCase();
  const display = label ?? STATUS_LABELS[normalized] ?? value ?? "—";
  return `<span class="status ${statusClass(value)}">${escapeHtml(display)}</span>`;
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
  if (item.is_active && allowed(context, "users.suspend")) actions.push(actionButton("user-suspend", item.id, "Tangguhkan", "row-action-danger"));
  if (!item.is_active && allowed(context, "users.reactivate")) actions.push(actionButton("user-reactivate", item.id, "Aktifkan kembali", "row-action-positive"));
  return `<li class="data-row">
    <div class="data-primary"><p class="data-title">${escapeHtml(item.name)}</p><p class="data-subtitle">${escapeHtml(item.email)}</p></div>
    <div class="data-meta">
      ${badge(item.is_active ? "active" : "suspended")}
      <span>Peran: ${escapeHtml(item.role)}</span>
      <span>${item.email_verified ? "Email terverifikasi" : "Email belum terverifikasi"}</span>
      <span>${item.has_store ? `Toko: ${escapeHtml(item.store_name || "Ada")}` : "Belum memiliki toko"}</span>
      <span>Dibuat ${formatDate(item.created_at)}</span>
    </div>
    <div class="data-actions">${actions.join("")}</div>
  </li>`;
}

function storesRow(item, context) {
  const actions = [];
  if (item.verification_status !== "verified" && allowed(context, "stores.verify")) actions.push(actionButton("store-verify", item.id, "Verifikasi", "row-action-positive"));
  if (item.is_active && allowed(context, "stores.suspend")) actions.push(actionButton("store-suspend", item.id, "Tangguhkan", "row-action-danger"));
  if (!item.is_active && allowed(context, "stores.reactivate")) actions.push(actionButton("store-reactivate", item.id, "Aktifkan kembali", "row-action-positive"));
  return `<li class="data-row">
    <div class="data-primary"><p class="data-title">${escapeHtml(item.name)}</p><p class="data-subtitle">Pemilik: ${escapeHtml(item.owner_name)} · ${escapeHtml(item.owner_email)}</p></div>
    <div class="data-meta">
      ${badge(item.verification_status)} ${badge(item.is_active ? "active" : "inactive")}
      <span>${number.format(Number(item.product_count || 0))} produk</span>
      <span>${number.format(Number(item.order_count || 0))} pesanan</span>
      <span>${escapeHtml([item.city, item.province].filter(Boolean).join(", ") || "Lokasi belum diisi")}</span>
    </div>
    <div class="data-actions">${actions.join("")}</div>
  </li>`;
}

function productsRow(item, context) {
  const actions = [];
  if (item.is_active && allowed(context, "products.suspend")) actions.push(actionButton("product-suspend", item.id, "Nonaktifkan", "row-action-danger"));
  if (!item.is_active && allowed(context, "products.restore")) actions.push(actionButton("product-restore", item.id, "Pulihkan", "row-action-positive"));
  return `<li class="data-row">
    <div class="data-primary"><p class="data-title">${escapeHtml(item.name)}</p><p class="data-subtitle">${escapeHtml(item.store_name)}</p></div>
    <div class="data-meta">
      ${badge(item.is_active ? "active" : "inactive")}
      <span>${currency.format(Number(item.price || 0))}</span>
      <span>Stok ${number.format(Number(item.stock || 0))} ${escapeHtml(item.unit || "")}</span>
      ${item.is_featured ? "<span>Unggulan</span>" : ""}
    </div>
    <div class="data-actions">${actions.join("")}</div>
  </li>`;
}

function postsRow(item, context) {
  const actions = [];
  if (item.is_active && allowed(context, "posts.suspend")) actions.push(actionButton("post-suspend", item.id, "Nonaktifkan", "row-action-danger"));
  if (!item.is_active && allowed(context, "posts.restore")) actions.push(actionButton("post-restore", item.id, "Pulihkan", "row-action-positive"));
  return `<li class="data-row">
    <div class="data-primary"><p class="data-title">${escapeHtml(item.store_name)}</p><p class="data-subtitle">${escapeHtml(item.caption || "Tanpa caption")}</p></div>
    <div class="data-meta">${badge(item.is_active ? "active" : "inactive")}<span>${formatDate(item.created_at)}</span></div>
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
  const subjectLabel = item.subject_type === "store" ? "Toko" : item.subject_type === "product" ? "Produk" : item.subject_type;
  return `<li class="data-row">
    <div class="data-primary"><p class="data-title">${escapeHtml(item.subject_name)}</p><p class="data-subtitle">${escapeHtml(item.review || "Tanpa ulasan teks")}</p></div>
    <div class="data-meta">${badge("info", `${number.format(Number(item.rating || 0))}/5`)}<span>${escapeHtml(subjectLabel)}</span><span>oleh ${escapeHtml(item.user_name)}</span><span>${formatDate(item.created_at)}</span></div>
    <div class="data-actions"></div>
  </li>`;
}

function auditRow(item) {
  return `<li class="data-row">
    <div class="data-primary"><p class="data-title">${escapeHtml(item.action)}</p><p class="data-subtitle">${escapeHtml(item.actor_name_snapshot || "Bootstrap sistem")} · ${escapeHtml(item.actor_email_snapshot || "tanpa email aktor")}</p></div>
    <div class="data-meta">${badge(item.outcome)}<span>${escapeHtml(item.resource_type || "—")}: ${escapeHtml(item.resource_id || "—")}</span><span>${escapeHtml(item.reason_code || "tanpa_kode_alasan")}</span><span>${formatDate(item.created_at)}</span></div>
    <div class="data-actions"></div>
  </li>`;
}

function adminsRow(item) {
  return `<li class="data-row">
    <div class="data-primary"><p class="data-title">${escapeHtml(item.name)}</p><p class="data-subtitle">${escapeHtml(item.email)}</p></div>
    <div class="data-meta">${badge(item.status)}<span>${escapeHtml((item.roles || []).join(", ") || "Belum ada peran aktif")}</span><span>${item.mfa_enrolled ? "MFA aktif" : "MFA belum aktif"}</span><span>${item.must_rotate_password ? "Perlu mengganti kata sandi" : "Kata sandi sudah diperbarui"}</span><span>Login terakhir ${formatDate(item.last_login_at)}</span></div>
    <div class="data-actions"></div>
  </li>`;
}

const CONFIG = Object.freeze({
  users: { title: "Users", displayTitle: "Pengguna", description: "Kelola akun marketplace publik dan status aksesnya. Penangguhan pengguna langsung mencabut sesi publik aktif.", resource: "users", search: "Cari nama atau email", filter: { key: "state", options: [["all", "Semua"], ["active", "Aktif"], ["suspended", "Ditangguhkan"]] }, render: usersRow },
  stores: { title: "Stores", displayTitle: "Toko", description: "Pantau merchant, status verifikasi UMKM, aktivitas toko, dan identitas pemilik yang relevan.", resource: "stores", search: "Cari toko atau email pemilik", filter: { key: "verification", options: [["all", "Semua"], ["pending", "Menunggu"], ["verified", "Terverifikasi"], ["rejected", "Ditolak"]] }, render: storesRow },
  products: { title: "Products", displayTitle: "Produk", description: "Kelola katalog lintas toko dengan tindakan moderasi yang tercatat ke audit log.", resource: "products", search: "Cari produk atau toko", filter: { key: "state", options: [["all", "Semua"], ["active", "Aktif"], ["inactive", "Nonaktif"]] }, render: productsRow },
  posts: { title: "Social Posts", displayTitle: "Konten", description: "Moderasi konten social-commerce dengan tindakan yang benar-benar didukung backend.", resource: "posts", filter: { key: "state", options: [["all", "Semua"], ["active", "Aktif"], ["inactive", "Nonaktif"]] }, render: postsRow },
  orders: { title: "Orders", displayTitle: "Pesanan", description: "Pantau status dan nilai pesanan tanpa mengekspos nomor telepon atau alamat pengiriman pada daftar utama.", resource: "orders", search: "Cari nomor pesanan, pembeli, atau toko", filter: { key: "status", options: [["all", "Semua"], ["pending", "Menunggu"], ["confirmed", "Dikonfirmasi"], ["processing", "Diproses"], ["ready", "Siap"], ["completed", "Selesai"], ["cancelled", "Dibatalkan"]] }, render: ordersRow },
  reviews: { title: "Reviews", displayTitle: "Ulasan", description: "Tinjau rating toko dan produk dari data transaksi yang tersedia.", resource: "reviews", filter: { key: "type", options: [["all", "Semua"], ["store", "Toko"], ["product", "Produk"]] }, render: reviewsRow },
  audit: { title: "Audit Log", displayTitle: "Audit Log", description: "Jejak tindakan administratif. Hash IP dan User-Agent sengaja tidak diekspos pada daftar utama.", resource: "audit", filter: { key: "outcome", options: [["all", "Semua"], ["success", "Berhasil"], ["denied", "Ditolak"], ["failure", "Gagal"]] }, render: auditRow },
  access: { title: "Admin Access", displayTitle: "Akses Admin", description: "Identitas administrator dan peran aktif. Pembuatan admin serta assignment role tetap dibatasi sampai alur keamanan terkait siap.", resource: "admins", render: adminsRow }
});

function toolbar(config, params) {
  const displayTitle = config.displayTitle || config.title;
  const search = config.search
    ? `<form class="toolbar-search" id="recordSearchForm"><input class="field-input" id="recordSearch" type="search" inputmode="search" maxlength="80" value="${escapeHtml(params.get("q") || "")}" placeholder="${escapeHtml(config.search)}" aria-label="${escapeHtml(config.search)}"></form>`
    : "<div></div>";
  const filters = config.filter
    ? `<div class="toolbar-filters" aria-label="Filter ${escapeHtml(displayTitle)}">${config.filter.options.map(([value, label]) => {
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
  "user-suspend": { title: "Tangguhkan pengguna?", copy: "Pengguna tidak dapat memakai akun sampai diaktifkan kembali. Sesi publik aktif akan dicabut.", label: "Tangguhkan", tone: "danger", run: (id, reason) => adminApi.changeUserStatus(id, false, reason) },
  "user-reactivate": { title: "Aktifkan kembali pengguna?", copy: "Pengguna akan kembali diizinkan menggunakan akun marketplace.", label: "Aktifkan kembali", tone: "positive", run: (id, reason) => adminApi.changeUserStatus(id, true, reason) },
  "store-verify": { title: "Verifikasi toko?", copy: "Status verifikasi toko akan berubah menjadi verified dan waktu verifikasi dicatat.", label: "Verifikasi toko", tone: "positive", run: (id, reason) => adminApi.storeAction(id, "verify", reason) },
  "store-suspend": { title: "Tangguhkan toko?", copy: "Toko akan dinonaktifkan dari operasional sampai diaktifkan kembali.", label: "Tangguhkan toko", tone: "danger", run: (id, reason) => adminApi.storeAction(id, "suspend", reason) },
  "store-reactivate": { title: "Aktifkan kembali toko?", copy: "Toko akan kembali aktif. Status verifikasi tidak diubah oleh tindakan ini.", label: "Aktifkan kembali", tone: "positive", run: (id, reason) => adminApi.storeAction(id, "reactivate", reason) },
  "product-suspend": { title: "Nonaktifkan produk?", copy: "Produk akan ditandai tidak aktif sampai dipulihkan oleh admin yang berwenang.", label: "Nonaktifkan produk", tone: "danger", run: (id, reason) => adminApi.changeProductStatus(id, false, reason) },
  "product-restore": { title: "Pulihkan produk?", copy: "Produk akan kembali aktif di katalog sesuai aturan publik yang berlaku.", label: "Pulihkan produk", tone: "positive", run: (id, reason) => adminApi.changeProductStatus(id, true, reason) },
  "post-suspend": { title: "Nonaktifkan konten?", copy: "Konten social-commerce akan dinonaktifkan sampai dipulihkan.", label: "Nonaktifkan konten", tone: "danger", run: (id, reason) => adminApi.changePostStatus(id, false, reason) },
  "post-restore": { title: "Pulihkan konten?", copy: "Konten social-commerce akan kembali aktif.", label: "Pulihkan konten", tone: "positive", run: (id, reason) => adminApi.changePostStatus(id, true, reason) }
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
  const displayTitle = config.displayTitle || config.title;
  const params = routeParams();
  const payload = await adminApi.control(config.resource, pageParams(config, params), { signal: context.signal });

  context.host.innerHTML = `
    <header class="view-header">
      <div><p class="eyebrow">Manajemen marketplace</p><h1 class="view-title">${escapeHtml(displayTitle)}</h1><p class="view-description">${escapeHtml(config.description)}</p></div>
    </header>
    ${toolbar(config, params)}
    <section class="data-shell" aria-label="Data ${escapeHtml(displayTitle)}">
      <ul class="data-list" id="recordList">${(payload.items || []).map(item => config.render(item, context)).join("")}</ul>
      ${(payload.items || []).length === 0 ? `<div class="empty-state"><strong>Belum ada data.</strong><p>Tidak ada data ${escapeHtml(displayTitle.toLowerCase())} yang cocok dengan filter saat ini.</p></div>` : ""}
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
