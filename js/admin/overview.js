import { adminApi } from "./api.js?v=5.0.0";

const number = new Intl.NumberFormat("id-ID");
const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0
});

function safeNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metric(label, value, detail = "") {
  return `
    <div class="metric-item">
      <span class="metric-label">${label}</span>
      <span class="metric-value">${value}</span>
      ${detail ? `<span class="metric-detail">${detail}</span>` : ""}
    </div>
  `;
}

function queue(label, detail, count, href) {
  return `
    <li class="queue-item">
      <div class="queue-name">
        <strong>${label}</strong>
        <span>${detail}</span>
      </div>
      <div>
        <span class="queue-count">${number.format(count)}</span>
        <a class="row-action" href="${href}">Buka</a>
      </div>
    </li>
  `;
}

export async function renderOverview({ host, access, signal }) {
  const payload = await adminApi.control("overview", {}, { signal });
  const data = payload.overview || {};
  const sensitiveCount = access.permissions.filter(permission => permission.sensitive).length;

  host.innerHTML = `
    <header class="view-header">
      <div>
        <p class="eyebrow">Operational Overview</p>
        <h1 class="view-title">Control Center</h1>
        <p class="view-description">Ringkasan real-time dari data marketplace yang tersedia. Tidak ada statistik placeholder atau estimasi buatan.</p>
      </div>
      <div class="view-actions">
        <span class="status status-success">Session MFA verified</span>
      </div>
    </header>

    <section class="metric-strip" aria-label="Ringkasan metrik">
      ${metric("Users", number.format(safeNumber(data.users_total)), `${number.format(safeNumber(data.users_new_7d))} baru dalam 7 hari`)}
      ${metric("Stores", number.format(safeNumber(data.stores_total)), `${number.format(safeNumber(data.stores_pending_verification))} menunggu verifikasi`)}
      ${metric("Products", number.format(safeNumber(data.products_total)), `${number.format(safeNumber(data.products_active))} aktif`)}
      ${metric("Orders", number.format(safeNumber(data.orders_total)), `${currency.format(safeNumber(data.completed_order_value))} completed value`)}
    </section>

    <section class="section-block">
      <div class="section-head">
        <div>
          <h2 class="section-title">Operational queues</h2>
          <p class="section-copy">Antrian nyata yang membutuhkan perhatian administrator.</p>
        </div>
      </div>
      <ul class="queue-list">
        ${queue("Store verification", "Toko dengan status pending", safeNumber(data.stores_pending_verification), "#/stores?verification=pending")}
        ${queue("Pending orders", "Order yang belum bergerak dari pending", safeNumber(data.orders_pending), "#/orders?status=pending")}
        ${queue("Inactive products", "Produk yang sedang tidak aktif", safeNumber(data.products_inactive), "#/products?state=inactive")}
        ${queue("Inactive social posts", "Post social-commerce yang tidak aktif", safeNumber(data.posts_inactive), "#/posts?state=inactive")}
      </ul>
    </section>

    <section class="section-block">
      <div class="section-head">
        <div>
          <h2 class="section-title">Commerce & trust</h2>
          <p class="section-copy">Kondisi transaksi dan sinyal kualitas yang berasal dari database produksi.</p>
        </div>
      </div>
      <ul class="access-list">
        <li class="access-item"><div class="access-name"><strong>Completed orders</strong><span>Order dengan status completed</span></div><strong>${number.format(safeNumber(data.orders_completed))}</strong></li>
        <li class="access-item"><div class="access-name"><strong>Cancelled orders</strong><span>Order dengan status cancelled</span></div><strong>${number.format(safeNumber(data.orders_cancelled))}</strong></li>
        <li class="access-item"><div class="access-name"><strong>Ratings recorded</strong><span>Store + product ratings</span></div><strong>${number.format(safeNumber(data.reviews_total))}</strong></li>
        <li class="access-item"><div class="access-name"><strong>Average rating</strong><span>Rata-rata seluruh rating yang tersedia</span></div><strong>${data.rating_average == null ? "—" : Number(data.rating_average).toFixed(2)}</strong></li>
      </ul>
    </section>

    <section class="security-note" aria-label="Security context">
      <div>
        <strong>${access.roles.map(role => role.name).join(", ")}</strong>
        <p>${access.permissions.length} permission aktif, ${sensitiveCount} di antaranya ditandai sensitive. Navigation dan API sama-sama mengikuti capability server.</p>
      </div>
    </section>
  `;
}
