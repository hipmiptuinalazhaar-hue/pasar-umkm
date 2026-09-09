import { AdminApiError } from './api.js?v=7.0.0';

const STATUS_OPTIONS = Object.freeze([
  ['open', 'Terbuka'],
  ['reviewing', 'Ditinjau'],
  ['resolved', 'Selesai'],
  ['dismissed', 'Ditolak']
]);

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function permissions(access) {
  return new Set((access?.permissions || []).map(item => item.key || item.permission_key).filter(Boolean));
}

function statusLabel(value) {
  return Object.fromEntries(STATUS_OPTIONS)[value] || value || 'Terbuka';
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new AdminApiError(data.error || 'Permintaan moderasi Reels gagal.', response.status, data.code, data);
    throw error;
  }
  return data;
}

function reportCard(report, canResolve) {
  const media = report.cover_url
    ? `<img src="${esc(report.cover_url)}" alt="Cover Reels" loading="lazy">`
    : `<video src="${esc(report.video_url || '')}" muted playsinline preload="metadata" aria-label="Preview Reels"></video>`;
  const actions = canResolve && ['open', 'reviewing'].includes(report.status)
    ? `<button class="reels-admin-button primary" data-reels-admin-action="resolve" data-report-id="${esc(report.id)}">Selesaikan</button>
       <button class="reels-admin-button" data-reels-admin-action="dismiss" data-report-id="${esc(report.id)}">Tolak laporan</button>
       <button class="reels-admin-button danger" data-reels-admin-action="deactivate" data-report-id="${esc(report.id)}">Nonaktifkan Reels</button>`
    : '';
  return `<article class="reels-report-card" data-report-id="${esc(report.id)}">
    <div class="reels-report-media">${media}</div>
    <div class="reels-report-copy">
      <div class="reels-report-title-row"><h2>${esc(report.creator_name || 'Pembuat Reels')}</h2><span class="reels-report-pill ${esc(report.status || 'open')}">${esc(statusLabel(report.status))}</span></div>
      <p class="reels-report-caption">${esc(report.caption || 'Reels tanpa caption')}</p>
      <p><strong>Laporan:</strong> ${esc(report.details || 'Tidak ada detail tambahan.')}</p>
      <div class="reels-report-meta">
        <span class="reels-report-pill">${esc(report.category || 'lainnya')}</span>
        <span class="reels-report-pill">Pelapor: ${esc(report.reporter_name || 'Pengguna')}</span>
        <span class="reels-report-pill">${report.created_at ? new Date(report.created_at).toLocaleString('id-ID') : '-'}</span>
      </div>
    </div>
    <div class="reels-report-card-actions">
      <a class="reels-admin-button" href="/r/${encodeURIComponent(report.reel_id)}" target="_blank" rel="noopener">Lihat Reels</a>
      ${actions}
    </div>
  </article>`;
}

function renderSummary(host, reports, status, canResolve) {
  const counts = {
    open: reports.filter(item => item.status === 'open').length,
    reviewing: reports.filter(item => item.status === 'reviewing').length,
    resolved: reports.filter(item => item.status === 'resolved').length,
    dismissed: reports.filter(item => item.status === 'dismissed').length
  };
  host.innerHTML = `<section class="reels-admin-view">
    <header class="view-header reels-admin-view-head">
      <div><p class="eyebrow">Trust & Safety</p><h1>Moderasi Reels</h1><p>Kelola laporan konten video dengan permission terpisah, step-up MFA, dan jejak audit.</p></div>
      <div class="reels-admin-actions">
        <label class="sr-only" for="reelsReportStatus">Status laporan</label>
        <select class="reels-admin-select" id="reelsReportStatus">${STATUS_OPTIONS.map(([value, label]) => `<option value="${value}" ${value === status ? 'selected' : ''}>${label}</option>`).join('')}</select>
        <button class="reels-admin-button" id="refreshReelsReports" type="button">Muat ulang</button>
      </div>
    </header>
    <section class="reels-admin-summary" aria-label="Ringkasan laporan">
      <div class="reels-admin-kpi"><b>${counts.open}</b><span>Terbuka pada hasil ini</span></div>
      <div class="reels-admin-kpi"><b>${counts.reviewing}</b><span>Sedang ditinjau</span></div>
      <div class="reels-admin-kpi"><b>${counts.resolved}</b><span>Diselesaikan</span></div>
      <div class="reels-admin-kpi"><b>${counts.dismissed}</b><span>Ditolak</span></div>
    </section>
    ${!canResolve ? '<div class="reels-admin-alert">Akun ini dapat melihat laporan, tetapi tidak memiliki izin reports.resolve untuk mengambil tindakan.</div>' : ''}
    <section class="reels-admin-list" id="reelsReportsList">
      ${reports.length ? reports.map(item => reportCard(item, canResolve)).join('') : '<div class="reels-admin-empty"><strong>Tidak ada laporan pada filter ini.</strong><p>Antrean moderasi sedang bersih.</p></div>'}
    </section>
  </section>`;
}

function loading(host) {
  host.innerHTML = '<div class="loading-state"><strong>Memuat laporan Reels…</strong><p>Memeriksa antrean moderasi yang diizinkan untuk akun ini.</p></div>';
}

function errorView(host, error) {
  host.innerHTML = `<div class="error-state"><strong>Moderasi Reels belum dapat dimuat.</strong><p>${esc(error?.message || 'Terjadi gangguan pada layanan moderasi.')}</p></div>`;
}

async function mutateWithStepUp(context, reportId, payload) {
  try {
    return await api(`/api/admin/reels/v4/reports/${encodeURIComponent(reportId)}/resolve`, { method: 'POST', body: payload });
  } catch (error) {
    if (error instanceof AdminApiError && error.code === 'ADMIN_STEP_UP_REQUIRED') {
      const verified = await context.requestStepUp?.();
      if (!verified) throw error;
      return api(`/api/admin/reels/v4/reports/${encodeURIComponent(reportId)}/resolve`, { method: 'POST', body: payload });
    }
    throw error;
  }
}

async function askResolution(action, context) {
  const configs = {
    resolve: {
      title: 'Selesaikan laporan Reels',
      copy: 'Gunakan setelah laporan ditinjau dan tindakan yang tepat sudah ditentukan.',
      confirmLabel: 'Selesaikan laporan',
      tone: 'positive',
      status: 'resolved',
      deactivate_reel: false
    },
    dismiss: {
      title: 'Tolak laporan Reels',
      copy: 'Gunakan bila laporan tidak terbukti atau tidak memerlukan tindakan.',
      confirmLabel: 'Tolak laporan',
      tone: 'danger',
      status: 'dismissed',
      deactivate_reel: false
    },
    deactivate: {
      title: 'Nonaktifkan Reels',
      copy: 'Reels akan disembunyikan dari publik dan laporan ditandai selesai. Tindakan ini memerlukan step-up MFA.',
      confirmLabel: 'Nonaktifkan Reels',
      tone: 'danger',
      status: 'resolved',
      deactivate_reel: true
    }
  };
  const config = configs[action];
  if (!config) return null;
  const reason = await context.confirmAction?.({
    title: config.title,
    copy: config.copy,
    confirmLabel: config.confirmLabel,
    tone: config.tone,
    requireReason: true
  });
  if (!reason) return null;
  return { status: config.status, resolution_note: reason, deactivate_reel: config.deactivate_reel };
}

export async function renderReels(context) {
  const { host, access } = context;
  const perms = permissions(access);
  if (!perms.has('reports.view')) {
    host.innerHTML = '<div class="error-state"><strong>Akses ditolak.</strong><p>Akun ini tidak memiliki permission reports.view.</p></div>';
    return;
  }

  let status = 'open';
  let disposed = false;
  const canResolve = perms.has('reports.resolve');

  async function load() {
    loading(host);
    try {
      const data = await api(`/api/admin/reels/v4/reports?status=${encodeURIComponent(status)}`);
      if (disposed) return;
      const reports = Array.isArray(data.reports) ? data.reports : [];
      renderSummary(host, reports, status, canResolve);
      host.querySelector('#reelsReportStatus')?.addEventListener('change', event => {
        status = event.target.value || 'open';
        load();
      });
      host.querySelector('#refreshReelsReports')?.addEventListener('click', load);
      host.querySelectorAll('[data-reels-admin-action]').forEach(button => button.addEventListener('click', async () => {
        const action = button.dataset.reelsAdminAction;
        const reportId = button.dataset.reportId;
        if (!reportId || !canResolve) return;
        const payload = await askResolution(action, context);
        if (!payload) return;
        button.disabled = true;
        try {
          await mutateWithStepUp(context, reportId, payload);
          await load();
        } catch (error) {
          if (error instanceof AdminApiError && error.status === 401) {
            context.onSessionExpired?.();
            return;
          }
          const list = host.querySelector('#reelsReportsList');
          if (list) list.insertAdjacentHTML('afterbegin', `<div class="reels-admin-alert">${esc(error.message || 'Tindakan moderasi gagal.')}</div>`);
          button.disabled = false;
        }
      }));
    } catch (error) {
      if (disposed) return;
      if (error instanceof AdminApiError && error.status === 401) {
        context.onSessionExpired?.();
        return;
      }
      errorView(host, error);
    }
  }

  await load();
  return () => { disposed = true; };
}
