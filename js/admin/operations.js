import { adminApi } from "./api.js?v=6.1.0";

const number = new Intl.NumberFormat("id-ID");
const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function safeNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metric(label, value, detail = "") {
  return `<div class="metric-item"><span class="metric-label">${escapeHtml(label)}</span><span class="metric-value">${escapeHtml(value)}</span>${detail ? `<span class="metric-detail">${escapeHtml(detail)}</span>` : ""}</div>`;
}

function statusBadge(value) {
  const status = String(value || "unknown");
  const positive = ["resolved","approved","verified"].includes(status);
  const warning = ["open","pending","reviewing","seller_response","admin_review"].includes(status);
  return `<span class="status ${positive ? "status-success" : warning ? "status-info" : ""}">${escapeHtml(status.replaceAll("_", " "))}</span>`;
}

function empty(label) {
  return `<li class="access-item"><div class="access-name"><strong>Tidak ada ${escapeHtml(label)}</strong><span>Antrian saat ini kosong.</span></div></li>`;
}

function reportRow(item, canResolve) {
  return `<li class="access-item">
    <div class="access-name"><strong>${escapeHtml(item.category)} · ${escapeHtml(item.subject_type)}</strong><span>${escapeHtml(item.details)}</span><small>${escapeHtml(item.reporter_name || "Pengguna")} · ${new Date(item.created_at).toLocaleString("id-ID")}</small></div>
    <div class="view-actions">${statusBadge(item.status)}${canResolve ? `<button class="row-action" type="button" data-kind="reports" data-id="${escapeHtml(item.id)}" data-action="reviewing">Review</button><button class="row-action" type="button" data-kind="reports" data-id="${escapeHtml(item.id)}" data-action="resolved">Resolve</button><button class="row-action" type="button" data-kind="reports" data-id="${escapeHtml(item.id)}" data-action="dismissed">Dismiss</button>` : ""}</div>
  </li>`;
}

function disputeRow(item, canResolve) {
  return `<li class="access-item">
    <div class="access-name"><strong>${escapeHtml(item.order_number)} · ${escapeHtml(item.reason_code)}</strong><span>${escapeHtml(item.description)}</span><small>${escapeHtml(item.buyer_name)} → ${escapeHtml(item.store_name)} · ${new Date(item.created_at).toLocaleString("id-ID")}</small>${item.seller_response ? `<small><strong>Seller:</strong> ${escapeHtml(item.seller_response)}</small>` : ""}</div>
    <div class="view-actions">${statusBadge(item.status)}${canResolve ? `<button class="row-action" type="button" data-kind="disputes" data-id="${escapeHtml(item.id)}" data-action="admin_review">Review</button><button class="row-action" type="button" data-kind="disputes" data-id="${escapeHtml(item.id)}" data-action="resolved">Resolve</button><button class="row-action" type="button" data-kind="disputes" data-id="${escapeHtml(item.id)}" data-action="rejected">Reject</button>` : ""}</div>
  </li>`;
}

function verificationRow(item, canVerify) {
  return `<li class="access-item">
    <div class="access-name"><strong>${escapeHtml(item.business_name)}</strong><span>${escapeHtml(item.owner_name)} · ${escapeHtml(item.contact_phone)} · ${escapeHtml(item.business_address)}</span><small>${escapeHtml(item.store_name)}${item.registration_number ? ` · Reg: ${escapeHtml(item.registration_number)}` : ""}</small>${item.evidence_note ? `<small>${escapeHtml(item.evidence_note)}</small>` : ""}</div>
    <div class="view-actions">${statusBadge(item.status)}${canVerify ? `<button class="row-action" type="button" data-kind="verifications" data-id="${escapeHtml(item.id)}" data-action="approve">Approve</button><button class="row-action" type="button" data-kind="verifications" data-id="${escapeHtml(item.id)}" data-action="reject">Reject</button>` : ""}</div>
  </li>`;
}

function actionCopy(kind, action) {
  if (kind === "reports") {
    if (action === "reviewing") return { title: "Mulai review laporan", copy: "Tandai laporan sedang diperiksa?", requireReason: false, tone: "positive" };
    if (action === "resolved") return { title: "Selesaikan laporan", copy: "Catat keputusan dan alasan penyelesaian laporan.", requireReason: true, tone: "positive" };
    return { title: "Tolak laporan", copy: "Catat alasan laporan ditutup tanpa tindakan lebih lanjut.", requireReason: true, tone: "danger" };
  }
  if (kind === "disputes") {
    if (action === "admin_review") return { title: "Ambil review sengketa", copy: "Pindahkan kasus ke peninjauan admin. Tidak ada dana yang dipindahkan.", requireReason: false, tone: "positive" };
    if (action === "resolved") return { title: "Selesaikan sengketa", copy: "Catat keputusan kasus. Tindakan ini tidak melakukan refund atau pemindahan dana.", requireReason: true, tone: "positive" };
    return { title: "Tolak sengketa", copy: "Catat alasan kasus ditolak. Tidak ada dana yang dipindahkan.", requireReason: true, tone: "danger" };
  }
  if (action === "approve") return { title: "Verifikasi UMKM", copy: "Setujui pengajuan dan tampilkan toko sebagai terverifikasi.", requireReason: true, tone: "positive" };
  return { title: "Tolak verifikasi", copy: "Tolak pengajuan verifikasi dan catat alasan pemeriksaan.", requireReason: true, tone: "danger" };
}

export async function renderOperations({ host, permissionSet, signal, confirmAction, refresh }) {
  const canReports = permissionSet.has("reports.view");
  const canResolveReports = permissionSet.has("reports.resolve");
  const canDisputes = permissionSet.has("disputes.view");
  const canResolveDisputes = permissionSet.has("disputes.resolve");
  const canVerifications = permissionSet.has("stores.view");
  const canVerify = permissionSet.has("stores.verify");

  const [metricsPayload, reportsPayload, disputesPayload, verificationsPayload] = await Promise.all([
    adminApi.operationsMetrics({ signal }),
    canReports ? adminApi.operations("reports", { status: "open", limit: 12 }, { signal }) : Promise.resolve({ reports: [] }),
    canDisputes ? adminApi.operations("disputes", { status: "all", limit: 12 }, { signal }) : Promise.resolve({ disputes: [] }),
    canVerifications ? adminApi.operations("verifications", { status: "pending", limit: 12 }, { signal }) : Promise.resolve({ submissions: [] })
  ]);

  const data = metricsPayload.metrics || {};
  const reports = reportsPayload.reports || [];
  const disputes = (disputesPayload.disputes || []).filter(item => !["resolved","rejected","cancelled"].includes(item.status));
  const verifications = verificationsPayload.submissions || [];

  host.innerHTML = `
    <header class="view-header"><div><p class="eyebrow">Marketplace Operations</p><h1 class="view-title">Trust & Case Operations</h1><p class="view-description">Antrian verifikasi, laporan, sengketa, dan metrik operasional dari database. Keputusan sengketa tidak memindahkan dana.</p></div><div class="view-actions"><a class="row-action" href="/legal/" target="_blank" rel="noopener">Trust Center</a></div></header>
    <section class="metric-strip" aria-label="Metrik operasional P6">
      ${metric("Verified UMKM", number.format(safeNumber(data.verified_stores)), `${number.format(safeNumber(data.pending_store_verification))} toko pending`)}
      ${metric("GMV 30d", currency.format(safeNumber(data.completed_gmv_30d)), `${number.format(safeNumber(data.completed_orders_30d))} order completed`)}
      ${metric("Active buyers 30d", number.format(safeNumber(data.active_buyers_30d)), `${number.format(safeNumber(data.active_sellers_30d))} seller dengan order`)}
      ${metric("Completion 30d", `${safeNumber(data.order_completion_rate_30d).toFixed(2)}%`, `${number.format(safeNumber(data.orders_30d))} order total`)}
    </section>
    <section class="section-block"><div class="section-head"><div><h2 class="section-title">Store verification</h2><p class="section-copy">Pengajuan identitas usaha yang menunggu pemeriksaan.</p></div><span class="queue-count">${number.format(safeNumber(data.pending_verification_cases))}</span></div><ul class="access-list">${verifications.length ? verifications.map(item => verificationRow(item, canVerify)).join("") : empty("pengajuan verifikasi")}</ul></section>
    <section class="section-block"><div class="section-head"><div><h2 class="section-title">Moderation reports</h2><p class="section-copy">Laporan pengguna adalah sinyal untuk ditinjau, bukan vonis otomatis.</p></div><span class="queue-count">${number.format(safeNumber(data.open_reports))}</span></div><ul class="access-list">${reports.length ? reports.map(item => reportRow(item, canResolveReports)).join("") : empty("laporan terbuka")}</ul></section>
    <section class="section-block"><div class="section-head"><div><h2 class="section-title">Order disputes</h2><p class="section-copy">Kasus buyer/seller untuk mediasi operasional. Tidak ada settlement otomatis.</p></div><span class="queue-count">${number.format(safeNumber(data.open_disputes))}</span></div><ul class="access-list">${disputes.length ? disputes.map(item => disputeRow(item, canResolveDisputes)).join("") : empty("sengketa aktif")}</ul></section>
    <section class="security-note"><div><strong>Audit trail aktif</strong><p>${number.format(safeNumber(data.admin_actions_24h))} aksi admin tercatat dalam 24 jam terakhir. Traffic conversion belum ditampilkan sampai telemetry denominator benar-benar tersedia.</p></div></section>`;

  host.querySelectorAll("[data-kind][data-action]").forEach(button => button.addEventListener("click", async () => {
    const kind = button.dataset.kind;
    const id = button.dataset.id;
    const action = button.dataset.action;
    const copy = actionCopy(kind, action);
    const reason = await confirmAction({ ...copy, confirmLabel: action.replaceAll("_", " ") });
    if (reason === null) return;
    button.disabled = true;
    try {
      if (kind === "reports") await adminApi.operationAction("reports", id, { status: action, resolution_note: reason });
      else if (kind === "disputes") await adminApi.operationAction("disputes", id, { status: action, resolution_note: reason });
      else await adminApi.operationAction("verifications", id, { action, review_note: reason });
      await refresh();
    } finally {
      button.disabled = false;
    }
  }));
}
