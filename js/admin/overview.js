import { adminApi } from "./api.js?v=6.0.0";

const number = new Intl.NumberFormat("id-ID");
const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

const ICONS = Object.freeze({
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
  store: '<path d="M3 9 5 3h14l2 6"/><path d="M5 13v8h14v-8"/><path d="M9 21v-6h6v6"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
  box: '<path d="m21 8-9 5-9-5"/><path d="m3 8 9-5 9 5v8l-9 5-9-5Z"/><path d="M12 13v8"/>',
  order: '<path d="M6 2h12l2 5H4Z"/><path d="M5 7v14h14V7"/><path d="M9 11h6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>'
});

function safeNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function icon(name) {
  return `<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.order}</svg>`;
}

function metric(label, value, detail, iconName) {
  return `<article class="overview-metric"><div class="overview-metric-head"><span class="metric-label">${label}</span><span class="overview-metric-icon">${icon(iconName)}</span></div><span class="metric-value">${value}</span><span class="metric-detail">${detail}</span></article>`;
}

function queue(label, detail, count, href) {
  return `<li class="queue-item"><div class="queue-name"><strong>${label}</strong><span>${detail}</span></div><div class="queue-side"><span class="queue-count">${number.format(count)}</span><a class="row-action" href="${href}">Tinjau</a></div></li>`;
}

function commerceRow(label, detail, value) {
  return `<li class="access-item"><div class="access-name"><strong>${label}</strong><span>${detail}</span></div><strong>${value}</strong></li>`;
}

export async function renderOverview({ host, access, signal }) {
  const payload = await adminApi.control("overview", {}, { signal });
  const data = payload.overview || {};
  const sensitiveCount = access.permissions.filter(permission => permission.sensitive).length;
  const sessionSecurity = access.session?.mfa_verified ? { label: "MFA terverifikasi", className: "status-success" } : { label: "Sesi aktif", className: "status-info" };
  const activeProducts = safeNumber(data.products_active);
  const totalProducts = safeNumber(data.products_total);
  const completedValue = safeNumber(data.completed_order_value);

  host.innerHTML = `
    <header class="view-header">
      <div><p class="eyebrow">Marketplace overview</p><h1 class="view-title">Dashboard operasional</h1><p class="view-description">Pantau aktivitas utama Pasar UMKM, antrian yang membutuhkan tindakan, dan kondisi perdagangan dari data produksi yang tersedia.</p></div>
      <div class="view-actions"><span class="status ${sessionSecurity.className}">${sessionSecurity.label}</span></div>
    </header>

    <section class="overview-metrics" aria-label="Ringkasan marketplace">
      ${metric("Pengguna", number.format(safeNumber(data.users_total)), `${number.format(safeNumber(data.users_new_7d))} pengguna baru dalam 7 hari`, "users")}
      ${metric("Toko", number.format(safeNumber(data.stores_total)), `${number.format(safeNumber(data.stores_pending_verification))} menunggu verifikasi`, "store")}
      ${metric("Produk aktif", number.format(activeProducts), `${number.format(totalProducts)} total produk terdaftar`, "box")}
      ${metric("Pesanan", number.format(safeNumber(data.orders_total)), `${currency.format(completedValue)} nilai pesanan selesai`, "order")}
    </section>

    <div class="overview-layout">
      <section class="overview-card" aria-labelledby="attentionTitle">
        <div class="overview-card-head"><div><h2 class="overview-card-title" id="attentionTitle">Perlu perhatian</h2><p class="overview-card-copy">Antrian operasional yang dapat ditindaklanjuti administrator.</p></div></div>
        <ul class="queue-list">
          ${queue("Verifikasi toko", "Toko dengan status verifikasi pending", safeNumber(data.stores_pending_verification), "#/stores?verification=pending")}
          ${queue("Pesanan pending", "Pesanan yang belum bergerak dari status pending", safeNumber(data.orders_pending), "#/orders?status=pending")}
          ${queue("Produk nonaktif", "Produk yang saat ini tidak aktif", safeNumber(data.products_inactive), "#/products?state=inactive")}
          ${queue("Konten nonaktif", "Konten social-commerce yang sedang tidak aktif", safeNumber(data.posts_inactive), "#/posts?state=inactive")}
        </ul>
      </section>

      <section class="overview-card" aria-labelledby="commerceTitle">
        <div class="overview-card-head"><div><h2 class="overview-card-title" id="commerceTitle">Perdagangan & kepercayaan</h2><p class="overview-card-copy">Status transaksi dan sinyal kualitas yang tercatat di sistem.</p></div></div>
        <ul class="access-list">
          ${commerceRow("Pesanan selesai", "Pesanan berstatus completed", number.format(safeNumber(data.orders_completed)))}
          ${commerceRow("Pesanan dibatalkan", "Pesanan berstatus cancelled", number.format(safeNumber(data.orders_cancelled)))}
          ${commerceRow("Rating tercatat", "Rating toko dan produk", number.format(safeNumber(data.reviews_total)))}
          ${commerceRow("Rata-rata rating", "Rata-rata seluruh rating yang tersedia", data.rating_average == null ? "—" : Number(data.rating_average).toFixed(2))}
        </ul>
      </section>
    </div>

    <section class="overview-security" aria-label="Konteks keamanan">
      <span class="overview-security-icon">${icon("shield")}</span>
      <div><strong>${access.roles.map(role => role.name).join(", ")}</strong><p>${access.permissions.length} permission aktif. ${sensitiveCount} permission sensitif tetap membutuhkan verifikasi MFA yang masih fresh sebelum tindakan dijalankan.</p></div>
    </section>`;
}
