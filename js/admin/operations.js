import { adminApi } from "./api.js?v=6.1.0";

const number = new Intl.NumberFormat("id-ID");
const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

const STATUS_LABELS = Object.freeze({
  resolved: "Selesai",
  approved: "Disetujui",
  verified: "Terverifikasi",
  open: "Terbuka",
  pending: "Menunggu",
  reviewing: "Ditinjau",
  seller_response: "Respons penjual",
  admin_review: "Tinjauan admin",
  dismissed: "Ditutup",
  rejected: "Ditolak"
});

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function safeNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
  const date = new Date(value || 0);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function metric(label, value, detail = "") {
  return `<div class="metric-item"><span class="metric-label">${escapeHtml(label)}</span><span class="metric-value">${escapeHtml(value)}</span>${detail ? `<span class="metric-detail">${escapeHtml(detail)}</span>` : ""}</div>`;
}

function statusBadge(value) {
  const status = String(value || "unknown");
  const positive = ["resolved", "approved", "verified"].includes(status);
  const warning = ["open", "pending", "reviewing", "seller_response", "admin_review"].includes(status);
  const negative = ["dismissed", "rejected"].includes(status);
  return `<span class="status ${positive ? "status-success" : warning ? "status-warning" : negative ? "status-danger" : "status-info"}">${escapeHtml(STATUS_LABELS[status] || status.replaceAll("_", " "))}</span>`;
}

function empty(label) {
  return `<li class="access-item"><div class="access-name"><strong>Tidak ada ${escapeHtml(label)}</strong><span>Antrian saat ini kosong.</span></div></li>`;
}

function reportRow(item, canResolve) {
  return `<li class="access-item">
    <div class="access-name"><strong>${escapeHtml(item.category)} · ${escapeHtml(item.subject_type)}</strong><span>${escapeHtml(item.details)}</span><small>Dilaporkan oleh ${escapeHtml(item.reporter_name || "Pengguna")} · ${formatDate(item.created_at)}</small></div>
    <div class="view-actions">${statusBadge(item.status)}${canResolve ? `<button class="row-action" type="button" data-kind="reports" data-id="${escapeHtml(item.id)}" data-action="reviewing">Tinjau</button><button class="row-action row-action-positive" type="button" data-kind="reports" data-id="${escapeHtml(item.id)}" data-action="resolved">Selesaikan</button><button class="row-action row-action-danger" type="button" data-kind="reports" data-id="${escapeHtml(item.id)}" data-action="dismissed">Tutup</button>` : ""}</div>
  </li>`;
}

function disputeRow(item, canResolve) {
  return `<li class="access-item">
    <div class="access-name"><strong>${escapeHtml(item.order_number)} · ${escapeHtml(item.reason_code)}</strong><span>${escapeHtml(item.description)}</span><small>${escapeHtml(item.buyer_name)} → ${escapeHtml(item.store_name)} · ${formatDate(item.created_at)}</small>${item.seller_response ? `<small><strong>Respons penjual:</strong> ${escapeHtml(item.seller_response)}</small>` : ""}</div>
    <div class="view-actions">${statusBadge(item.status)}${canResolve ? `<button class="row-action" type="button" data-kind="disputes" data-id="${escapeHtml(item.id)}" data-action="admin_review">Tinjau</button><button class="row-action row-action-positive" type="button" data-kind="disputes" data-id="${escapeHtml(item.id)}" data-action="resolved">Selesaikan</button><button class="row-action row-action-danger" type="button" data-kind="disputes" data-id="${escapeHtml(item.id)}" data-action="rejected">Tolak</button>` : ""}</div>
  </li>`;
}

function verificationRow(item, canVerify) {
  return `<li class="access-item">
    <div class="access-name"><strong>${escapeHtml(item.business_name)}</strong><span>${escapeHtml(item.owner_name)} · ${escapeHtml(item.contact_phone)} · ${escapeHtml(item.business_address)}</span><small>${escapeHtml(item.store_name)}${item.registration_number ? ` · Nomor registrasi: ${escapeHtml(item.registration_number)}` : ""}</small>${item.evidence_note ? `<small>${escapeHtml(item.evidence_note)}</small>` : ""}</div>
    <div class="view-actions">${statusBadge(item.status)}${canVerify ? `<button class="row-action row-action-positive" type="button" data-kind="verifications" data-id="${escapeHtml(item.id)}" data-action="approve">Setujui</button><button class="row-action row-action-danger" type="button" data-kind="verifications" data-id="${escapeHtml(item.id)}" data-action="reject">Tolak</button>` : ""}</div>
  </li>`;
}

function actionCopy(kind, action) {
  if (kind === "reports") {
    if (action === "reviewing") return { title: "Mulai tinjau laporan", copy: "Tandai laporan sebagai sedang diperiksa?", requireReason: false, tone: "positive", label: "Mulai tinjau" };
    if (action === "resolved") return { title: "Selesaikan laporan", copy: "Catat keputusan dan alasan penyelesaian laporan.", requireReason: true, tone: "positive", label: "Selesaikan" };
    return { title: "Tutup laporan", copy: "Catat alasan laporan ditutup tanpa tindakan lebih lanjut.", requireReason: true, tone: "danger", label: "Tutup laporan" };
  }
  if (kind === "disputes") {
    if (action === "admin_review") return { title: "Ambil tinjauan sengketa", copy: "Pindahkan kasus ke peninjauan admin. Tidak ada dana yang dipindahkan.", requireReason: false, tone: "positive", label: "Ambil tinjauan" };
    if (action === "resolved") return { title: "Selesaikan sengketa", copy: "Catat keputusan kasus. Tindakan ini tidak melakukan refund atau pemindahan dana.", requireReason: true, tone: "positive", label: "Selesaikan" };
    return { title: "Tolak sengketa", copy: "Catat alasan kasus ditolak. Tidak ada dana yang dipindahkan.", requireReason: true, tone: "danger", label: "Tolak sengketa" };
  }
  if (action === "approve") return { title: "Verifikasi UMKM", copy: "Setujui pengajuan dan tampilkan toko sebagai terverifikasi.", requireReason: true, tone: "positive", label: "Setujui verifikasi" };
  return { title: "Tolak verifikasi", copy: "Tolak pengajuan verifikasi dan catat alasan pemeriksaan.", requireReason: true, tone: "danger", label: "Tolak verifikasi" };
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
  const disputes = (disputesPayload.disputes || []).filter(item => !["resolved", "rejected", "cancelled"].includes(item.status));
  const verifications = verificationsPayload.submissions || [];

  host.innerHTML = `
    <header class="view-header"><div><p class="eyebrow">Operasional marketplace</p><h1 class="view-title">Kepercayaan & penanganan kasus</h1><p class="view-description">Kelola verifikasi toko, laporan pengguna, dan sengketa pesanan dari satu antrian operasional. Keputusan sengketa tidak memindahkan dana.</p></div><div class="view-actions"><a class="row-action" href="/legal/" target="_blank" rel="noopener">Pusat Kepercayaan</a></div></header>
    <section class="metric-strip" aria-label="Metrik operasional">
      ${metric("UMKM terverifikasi", number.format(safeNumber(data.verified_stores)), `${number.format(safeNumber(data.pending_store_verification))} toko menunggu`)}
      ${metric("GMV 30 hari", currency.format(safeNumber(data.completed_gmv_30d)), `${number.format(safeNumber(data.completed_orders_30d))} pesanan selesai`)}
      ${metric("Pembeli aktif 30 hari", number.format(safeNumber(data.active_buyers_30d)), `${number.format(safeNumber(data.active_sellers_30d))} penjual menerima pesanan`)}
      ${metric("Tingkat selesai 30 hari", `${safeNumber(data.order_completion_rate_30d).toFixed(2)}%`, `${number.format(safeNumber(data.orders_30d))} total pesanan`)}
    </section>
    <section class="section-block" data-ops-section="store-verification"><div class="section-head"><div><h2 class="section-title">Verifikasi toko</h2><p class="section-copy">Pengajuan identitas usaha yang menunggu pemeriksaan administrator.</p></div><span class="queue-count">${number.format(safeNumber(data.pending_verification_cases))}</span></div><ul class="access-list">${verifications.length ? verifications.map(item => verificationRow(item, canVerify)).join("") : empty("pengajuan verifikasi")}</ul></section>
    <section class="section-block" data-ops-section="moderation-reports"><div class="section-head"><div><h2 class="section-title">Laporan moderasi</h2><p class="section-copy">Laporan pengguna adalah sinyal untuk ditinjau, bukan keputusan otomatis terhadap akun atau konten.</p></div><span class="queue-count">${number.format(safeNumber(data.open_reports))}</span></div><ul class="access-list">${reports.length ? reports.map(item => reportRow(item, canResolveReports)).join("") : empty("laporan terbuka")}</ul></section>
    <section class="section-block" data-ops-section="order-disputes"><div class="section-head"><div><h2 class="section-title">Sengketa pesanan</h2><p class="section-copy">Kasus pembeli dan penjual untuk mediasi operasional. Tidak ada settlement atau refund otomatis.</p></div><span class="queue-count">${number.format(safeNumber(data.open_disputes))}</span></div><ul class="access-list">${disputes.length ? disputes.map(item => disputeRow(item, canResolveDisputes)).join("") : empty("sengketa aktif")}</ul></section>
    <section class="security-note"><div><strong>Audit trail aktif</strong><p>${number.format(safeNumber(data.admin_actions_24h))} tindakan admin tercatat dalam 24 jam terakhir. Conversion traffic tidak ditampilkan sebelum denominator telemetry benar-benar tersedia.</p></div></section>`;

  host.querySelectorAll("[data-kind][data-action]").forEach(button => button.addEventListener("click", async () => {
    const kind = button.dataset.kind;
    const id = button.dataset.id;
    const action = button.dataset.action;
    const copy = actionCopy(kind, action);
    const reason = await confirmAction({ ...copy, confirmLabel: copy.label });
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
