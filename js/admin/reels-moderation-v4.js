import { adminApi, AdminApiError } from './api.js?v=7.0.0';

const root = document.getElementById('reelsModerationRoot');
const statusSelect = document.getElementById('reportStatus');
const refreshButton = document.getElementById('refreshReports');
const actionDialog = document.getElementById('reportActionDialog');
const stepUpDialog = document.getElementById('reelsStepUpDialog');
let access = null;
let reports = [];
let pendingAction = null;

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function permissionSet() {
  return new Set((access?.permissions || []).map(item => item.key || item.permission_key));
}

function statusLabel(value) {
  return ({ open: 'Terbuka', reviewing: 'Ditinjau', resolved: 'Selesai', dismissed: 'Ditolak' })[value] || value;
}

function render() {
  if (!root) return;
  const open = reports.filter(item => item.status === 'open').length;
  const reviewing = reports.filter(item => item.status === 'reviewing').length;
  const resolved = reports.filter(item => item.status === 'resolved').length;
  const dismissed = reports.filter(item => item.status === 'dismissed').length;
  root.innerHTML = `
    <section class="reels-admin-summary">
      <div class="reels-admin-kpi"><b>${open}</b><span>Laporan terbuka</span></div>
      <div class="reels-admin-kpi"><b>${reviewing}</b><span>Sedang ditinjau</span></div>
      <div class="reels-admin-kpi"><b>${resolved}</b><span>Diselesaikan</span></div>
      <div class="reels-admin-kpi"><b>${dismissed}</b><span>Ditolak</span></div>
    </section>
    <section class="reels-admin-list">
      ${reports.length ? reports.map(reportCard).join('') : '<div class="reels-admin-empty"><strong>Tidak ada laporan pada filter ini.</strong><p>Semoga bukan karena semua orang terlalu sibuk membuat masalah di tempat lain.</p></div>'}
    </section>`;
}

function reportCard(report) {
  const canResolve = permissionSet().has('reports.resolve') && ['open', 'reviewing'].includes(report.status);
  const poster = report.cover_url
    ? `<img src="${esc(report.cover_url)}" alt="Cover Reels">`
    : `<video src="${esc(report.video_url || '')}" muted playsinline preload="metadata"></video>`;
  return `
    <article class="reels-report-card" data-report-id="${esc(report.id)}">
      <div class="reels-report-media">${poster}</div>
      <div class="reels-report-copy">
        <h2>${esc(report.creator_name || 'Pembuat Reels')}</h2>
        <p>${esc(report.caption || 'Reels tanpa caption')}</p>
        <p><strong>Laporan:</strong> ${esc(report.details || 'Tidak ada detail tambahan.')}</p>
        <div class="reels-report-meta">
          <span class="reels-report-pill ${esc(report.status)}">${esc(statusLabel(report.status))}</span>
          <span class="reels-report-pill">${esc(report.category)}</span>
          <span class="reels-report-pill">Pelapor: ${esc(report.reporter_name || 'Pengguna')}</span>
          <span class="reels-report-pill">${new Date(report.created_at).toLocaleString('id-ID')}</span>
        </div>
      </div>
      <div class="reels-report-card-actions">
        <a class="reels-admin-button" href="/r/${encodeURIComponent(report.reel_id)}" target="_blank" rel="noopener">Lihat Reels</a>
        ${canResolve ? `<button class="reels-admin-button primary" data-report-action="resolve" data-report-id="${esc(report.id)}">Selesaikan</button><button class="reels-admin-button" data-report-action="dismiss" data-report-id="${esc(report.id)}">Tolak laporan</button><button class="reels-admin-button danger" data-report-action="deactivate" data-report-id="${esc(report.id)}">Nonaktifkan Reels</button>` : ''}
      </div>
    </article>`;
}

async function fetchJson(path, options = {}, allowStepUp = true) {
  const response = await fetch(path, {
    credentials: 'same-origin', cache: 'no-store', ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (allowStepUp && data.code === 'ADMIN_STEP_UP_REQUIRED') {
      const verified = await requestStepUp();
      if (verified) return fetchJson(path, options, false);
    }
    const error = new Error(data.error || 'Permintaan moderasi gagal.');
    error.code = data.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

async function loadReports() {
  refreshButton.disabled = true;
  root.innerHTML = '<div class="reels-admin-empty"><strong>Memuat laporan Reels...</strong></div>';
  try {
    const data = await fetchJson(`/api/admin/reels/v4/reports?status=${encodeURIComponent(statusSelect.value || 'open')}`);
    reports = Array.isArray(data.reports) ? data.reports : [];
    render();
  } catch (error) {
    root.innerHTML = `<div class="reels-admin-alert">${esc(error.message || 'Laporan belum dapat dimuat.')}</div>`;
  } finally {
    refreshButton.disabled = false;
  }
}

function requestStepUp() {
  return new Promise(resolve => {
    const form = stepUpDialog.querySelector('form');
    const code = form.elements.code;
    const method = form.elements.method;
    const errorBox = stepUpDialog.querySelector('[data-step-error]');
    errorBox.textContent = '';
    code.value = '';
    stepUpDialog.showModal();

    const finish = value => {
      form.removeEventListener('submit', submit);
      stepUpDialog.removeEventListener('cancel', cancel);
      resolve(value);
    };
    const cancel = event => {
      event.preventDefault();
      stepUpDialog.close();
      finish(false);
    };
    const submit = async event => {
      event.preventDefault();
      const value = String(code.value || '').trim();
      if (!value) return;
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await adminApi.stepUp(value, method.value || 'totp');
        stepUpDialog.close();
        finish(true);
      } catch (error) {
        errorBox.textContent = error instanceof AdminApiError ? error.message : 'Verifikasi keamanan gagal.';
      } finally {
        button.disabled = false;
      }
    };
    form.addEventListener('submit', submit);
    stepUpDialog.addEventListener('cancel', cancel);
  });
}

function openAction(reportId, action) {
  const labels = {
    resolve: ['Selesaikan laporan', 'Tandai laporan sebagai selesai setelah ditinjau.', 'resolved', false],
    dismiss: ['Tolak laporan', 'Tandai laporan sebagai tidak terbukti atau tidak perlu tindakan.', 'dismissed', false],
    deactivate: ['Nonaktifkan Reels', 'Selesaikan laporan sekaligus menonaktifkan Reels dari publik.', 'resolved', true]
  };
  const config = labels[action];
  if (!config) return;
  pendingAction = { reportId, status: config[2], deactivate: config[3] };
  actionDialog.querySelector('h2').textContent = config[0];
  actionDialog.querySelector('[data-dialog-copy]').textContent = config[1];
  actionDialog.querySelector('textarea').value = '';
  actionDialog.showModal();
}

async function resolveReport(note) {
  const current = pendingAction;
  if (!current) return;
  const button = actionDialog.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await fetchJson(`/api/admin/reels/v4/reports/${encodeURIComponent(current.reportId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ status: current.status, resolution_note: note, deactivate_reel: current.deactivate })
    });
    actionDialog.close();
    pendingAction = null;
    await loadReports();
  } catch (error) {
    actionDialog.querySelector('[data-action-error]').textContent = error.message || 'Tindakan moderasi gagal.';
  } finally {
    button.disabled = false;
  }
}

async function boot() {
  try {
    access = await adminApi.access();
    if (!permissionSet().has('reports.view')) {
      root.innerHTML = '<div class="reels-admin-alert">Akun admin ini tidak memiliki izin reports.view.</div>';
      return;
    }
    await loadReports();
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) {
      location.replace('/admin/');
      return;
    }
    root.innerHTML = `<div class="reels-admin-alert">${esc(error.message || 'Sesi admin belum siap.')}</div>`;
  }
}

refreshButton.addEventListener('click', loadReports);
statusSelect.addEventListener('change', loadReports);
document.addEventListener('click', event => {
  const button = event.target.closest('[data-report-action]');
  if (button) openAction(button.dataset.reportId, button.dataset.reportAction);
});
actionDialog.querySelector('form').addEventListener('submit', event => {
  event.preventDefault();
  const note = String(actionDialog.querySelector('textarea').value || '').trim();
  actionDialog.querySelector('[data-action-error]').textContent = '';
  if (note.length < 8) {
    actionDialog.querySelector('[data-action-error]').textContent = 'Catatan penyelesaian minimal 8 karakter.';
    return;
  }
  resolveReport(note);
});
actionDialog.querySelector('[data-cancel-action]').addEventListener('click', () => { pendingAction = null; actionDialog.close(); });

boot();
