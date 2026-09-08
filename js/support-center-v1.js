const root = document.getElementById('supportRoot');

const CATEGORY_LABELS = Object.freeze({
  order: 'Pesanan',
  payment: 'Pembayaran',
  account_security: 'Akun & keamanan',
  seller_verification: 'Toko & verifikasi seller',
  product_report: 'Produk & laporan',
  complaint: 'Pengaduan',
  other: 'Lainnya'
});
const STATUS_LABELS = Object.freeze({
  waiting_support: 'Menunggu CS',
  in_progress: 'Sedang ditangani',
  waiting_user: 'Menunggu balasanmu',
  resolved: 'Selesai',
  closed: 'Ditutup'
});

const state = {
  tickets: [],
  orders: [],
  currentId: null,
  currentTicket: null,
  pollTimer: 0,
  polling: false
};

const esc = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function formatDate(value, detailed = false) {
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString('id-ID', detailed
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function statusClass(status) {
  return ({
    waiting_support: 'is-action',
    in_progress: 'is-progress',
    waiting_user: 'is-user',
    resolved: 'is-resolved',
    closed: 'is-closed'
  })[status] || '';
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.error || 'Customer Service tidak dapat dihubungi.');
    error.status = response.status;
    error.code = payload?.code || `HTTP_${response.status}`;
    throw error;
  }
  return payload || { ok: true };
}

function toast(message) {
  let node = document.getElementById('supportToast');
  if (!node) {
    node = document.createElement('div');
    node.id = 'supportToast';
    node.className = 'support-toast';
    node.setAttribute('role', 'status');
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.hidden = false;
  clearTimeout(node._timer);
  node._timer = setTimeout(() => { node.hidden = true; }, 2800);
}

function stopPolling() {
  clearTimeout(state.pollTimer);
  state.pollTimer = 0;
}

function schedulePolling() {
  stopPolling();
  if (!state.currentId) return;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const delay = connection?.saveData ? 15000 : 6000;
  state.pollTimer = setTimeout(async () => {
    if (document.visibilityState === 'visible' && !document.querySelector('.support-composer textarea:focus')) {
      await refreshThread().catch(() => null);
    }
    schedulePolling();
  }, delay);
}

function renderLogin() {
  stopPolling();
  root.innerHTML = `
    <section class="support-login">
      <img src="/assets/logo.webp" alt="Pasar UMKM">
      <h1>Masuk untuk menghubungi CS</h1>
      <p>Percakapan bantuan bersifat privat dan terhubung dengan akun Pasar UMKM agar tim dapat memeriksa konteks pesanan atau toko dengan aman.</p>
      <a class="support-button support-button-primary" href="/">Kembali dan masuk ke Pasar UMKM</a>
    </section>`;
}

function ticketCard(ticket) {
  const order = ticket.order_number ? ` · ${esc(ticket.order_number)}` : '';
  return `
    <button class="support-ticket" type="button" data-open-ticket="${esc(ticket.id)}">
      <span class="support-ticket-main">
        <strong>${esc(ticket.subject)}</strong>
        <small>${esc(ticket.code)}${order} · diperbarui ${esc(formatDate(ticket.updated_at))}</small>
      </span>
      ${ticket.unread ? '<span class="support-unread" aria-label="Ada balasan baru">!</span>' : '<span></span>'}
      <span class="support-ticket-meta">
        <span class="support-pill ${statusClass(ticket.status)}">${esc(STATUS_LABELS[ticket.status] || ticket.status)}</span>
        <span class="support-pill">${esc(CATEGORY_LABELS[ticket.category] || ticket.category)}</span>
      </span>
    </button>`;
}

function renderHome() {
  stopPolling();
  state.currentId = null;
  state.currentTicket = null;
  const active = state.tickets.filter(ticket => !['resolved', 'closed'].includes(ticket.status));
  const unread = state.tickets.filter(ticket => ticket.unread).length;
  root.innerHTML = `
    <section class="support-hero">
      <span class="support-hero-badge">Bantuan resmi Pasar UMKM</span>
      <h1>Ada masalah? Ceritakan ke Customer Service.</h1>
      <p>Gunakan CS untuk bantuan pesanan, pembayaran langsung buyer-seller, keamanan akun, verifikasi toko, laporan produk, atau pengaduan. Percakapan ini terpisah dari chat buyer dan seller.</p>
      <div class="support-hero-actions">
        <button class="support-button support-button-primary" type="button" data-new-ticket>Mulai chat dengan CS</button>
        ${unread ? `<span class="support-pill is-action">${unread} balasan baru</span>` : ''}
        ${active.length ? `<span class="support-pill">${active.length} tiket aktif</span>` : ''}
      </div>
      <div class="support-security-note"><strong>Keamanan:</strong><span>Customer Service tidak pernah meminta password, OTP, PIN, atau recovery code. Jangan kirim data rahasia melalui chat.</span></div>
    </section>

    <section class="support-section">
      <div class="support-section-head"><h2>Percakapan bantuan</h2><span>${state.tickets.length} tiket</span></div>
      ${state.tickets.length
        ? `<div class="support-ticket-list">${state.tickets.map(ticketCard).join('')}</div>`
        : `<div class="support-empty"><strong>Belum ada percakapan dengan CS.</strong><p>Buat tiket hanya ketika kamu memang membutuhkan bantuan. Ini membuat antrean tetap cepat untuk semua pengguna.</p></div>`}
    </section>`;
}

async function loadOrders() {
  try {
    const data = await api('/api/commerce/orders?scope=buyer');
    state.orders = Array.isArray(data.orders) ? data.orders.slice(0, 50) : [];
  } catch {
    state.orders = [];
  }
}

function renderNewTicket() {
  stopPolling();
  state.currentId = null;
  const orderOptions = state.orders.map(order => {
    const number = order.order_number || order.id;
    return `<option value="${esc(order.id)}">${esc(number)} · ${esc(order.status || 'pesanan')}</option>`;
  }).join('');
  root.innerHTML = `
    <section class="support-form-card">
      <button class="support-button" type="button" data-support-home>← Semua tiket</button>
      <h1 style="margin-top:15px">Mulai chat dengan CS</h1>
      <p>Pilih kategori yang paling sesuai agar tiket langsung masuk ke konteks penanganan yang benar.</p>
      <form class="support-form" id="newSupportTicket" novalidate>
        <div class="support-field">
          <label for="supportCategory">Kategori masalah</label>
          <select id="supportCategory" required>
            ${Object.entries(CATEGORY_LABELS).map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join('')}
          </select>
        </div>
        <div class="support-field">
          <label for="supportOrder">Pesanan terkait <span style="font-weight:500">(opsional)</span></label>
          <select id="supportOrder"><option value="">Tidak terkait pesanan tertentu</option>${orderOptions}</select>
          <small>Jika dipilih, CS hanya menerima referensi pesanan yang memang terhubung dengan akunmu.</small>
        </div>
        <div class="support-field">
          <label for="supportSubject">Judul masalah</label>
          <input id="supportSubject" maxlength="140" minlength="4" placeholder="Contoh: Pesanan belum diproses seller" required>
        </div>
        <div class="support-field">
          <label for="supportMessage">Jelaskan masalah</label>
          <textarea id="supportMessage" maxlength="4000" minlength="2" placeholder="Tuliskan kronologi singkat dan hasil yang kamu harapkan." required></textarea>
          <small>Jangan tulis password, OTP, PIN, atau recovery code. Untuk bukti yang sensitif, CS akan memberi instruksi kanal resmi bila memang diperlukan.</small>
        </div>
        <p class="support-error" id="supportFormError" role="alert" hidden></p>
        <div class="support-form-actions">
          <button class="support-button" type="button" data-support-home>Batal</button>
          <button class="support-button support-button-primary" id="supportCreateButton" type="submit">Kirim ke Customer Service</button>
        </div>
      </form>
    </section>`;

  document.getElementById('newSupportTicket').addEventListener('submit', createTicket);
}

function renderMessages(messages) {
  if (!messages?.length) return '<div class="support-empty"><strong>Percakapan belum memiliki pesan.</strong></div>';
  return messages.map(message => {
    const own = message.sender_type === 'user';
    const system = message.sender_type === 'system';
    return `
      <article class="support-message ${own ? 'is-user' : system ? 'is-system' : ''}" data-support-message="${esc(message.id)}">
        <strong>${esc(own ? 'Kamu' : message.sender_label || 'Customer Service')}</strong>
        ${message.message ? `<p>${esc(message.message)}</p>` : ''}
        <time datetime="${esc(message.created_at)}">${esc(formatDate(message.created_at, true))}</time>
      </article>`;
  }).join('');
}

function renderThread(data) {
  const ticket = data.ticket;
  state.currentTicket = ticket;
  state.currentId = ticket.id;
  const closed = ticket.status === 'closed';
  const statusLabel = STATUS_LABELS[ticket.status] || ticket.status;
  root.innerHTML = `
    <section class="support-thread">
      <header class="support-thread-head">
        <div class="support-thread-top">
          <div>
            <div class="support-thread-code">${esc(ticket.code)}</div>
            <h1>${esc(ticket.subject)}</h1>
          </div>
          <span class="support-pill ${statusClass(ticket.status)}" data-thread-status>${esc(statusLabel)}</span>
        </div>
        <div class="support-thread-sub">
          <span>${esc(CATEGORY_LABELS[ticket.category] || ticket.category)}</span>
          ${ticket.order_number ? `<span>• Pesanan ${esc(ticket.order_number)}</span>` : ''}
          ${ticket.store_name ? `<span>• ${esc(ticket.store_name)}</span>` : ''}
        </div>
        <div class="support-thread-actions">
          <button class="support-button" type="button" data-support-home>← Semua tiket</button>
          ${closed ? '' : '<button class="support-button support-button-danger" type="button" data-close-ticket>Tutup tiket</button>'}
        </div>
      </header>

      <div class="support-messages" id="supportMessages" aria-live="polite">${renderMessages(data.messages)}</div>

      ${closed ? `
        <div class="support-empty"><strong>Tiket telah ditutup.</strong><p>Jika muncul masalah baru, buat tiket bantuan baru agar riwayat kasus tetap jelas.</p></div>` : `
        <form class="support-composer" id="supportComposer">
          <textarea id="supportReply" maxlength="4000" placeholder="Tulis pesan untuk Customer Service…" aria-label="Pesan untuk Customer Service" required></textarea>
          <div class="support-composer-row">
            <small>Jangan bagikan password atau OTP.</small>
            <button class="support-button support-button-primary" id="supportSendButton" type="submit">Kirim</button>
          </div>
        </form>`}
    </section>`;
  document.getElementById('supportComposer')?.addEventListener('submit', sendReply);
  schedulePolling();
  queueMicrotask(() => {
    const messages = document.getElementById('supportMessages');
    messages?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  });
}

async function loadHome() {
  stopPolling();
  try {
    const [tickets] = await Promise.all([api('/api/support/tickets'), loadOrders()]);
    state.tickets = tickets.tickets || [];
    renderHome();
  } catch (error) {
    if (error.status === 401) { renderLogin(); return; }
    root.innerHTML = `<div class="support-empty"><strong>Customer Service belum dapat dimuat.</strong><p>${esc(error.message)}</p><button class="support-button" type="button" data-retry-support style="margin-top:12px">Coba lagi</button></div>`;
  }
}

async function openTicket(id) {
  stopPolling();
  state.currentId = id;
  root.innerHTML = `<section class="support-loading"><div class="support-skeleton support-skeleton-title"></div><div class="support-skeleton support-skeleton-card"></div><div class="support-skeleton support-skeleton-card"></div></section>`;
  try {
    const data = await api(`/api/support/tickets/${encodeURIComponent(id)}`);
    const local = state.tickets.find(ticket => ticket.id === id);
    if (local) local.unread = false;
    renderThread(data);
  } catch (error) {
    if (error.status === 401) { renderLogin(); return; }
    toast(error.message);
    await loadHome();
  }
}

async function refreshThread() {
  if (!state.currentId || state.polling) return;
  state.polling = true;
  try {
    const data = await api(`/api/support/tickets/${encodeURIComponent(state.currentId)}`);
    if (!state.currentId || data.ticket.id !== state.currentId) return;
    state.currentTicket = data.ticket;
    const messages = document.getElementById('supportMessages');
    if (messages) messages.innerHTML = renderMessages(data.messages);
    const status = document.querySelector('[data-thread-status]');
    if (status) {
      status.textContent = STATUS_LABELS[data.ticket.status] || data.ticket.status;
      status.className = `support-pill ${statusClass(data.ticket.status)}`;
    }
    if (data.ticket.status === 'closed' && document.getElementById('supportComposer')) renderThread(data);
  } finally {
    state.polling = false;
  }
}

async function createTicket(event) {
  event.preventDefault();
  const button = document.getElementById('supportCreateButton');
  const errorBox = document.getElementById('supportFormError');
  const payload = {
    category: document.getElementById('supportCategory').value,
    order_id: document.getElementById('supportOrder').value || null,
    subject: document.getElementById('supportSubject').value.trim(),
    message: document.getElementById('supportMessage').value.trim()
  };
  errorBox.hidden = true;
  button.disabled = true;
  button.textContent = 'Mengirim…';
  try {
    const result = await api('/api/support/tickets', { method: 'POST', body: JSON.stringify(payload) });
    toast('Tiket berhasil dikirim ke Customer Service.');
    await openTicket(result.ticket.id);
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = 'Kirim ke Customer Service';
  }
}

async function sendReply(event) {
  event.preventDefault();
  if (!state.currentId) return;
  const input = document.getElementById('supportReply');
  const button = document.getElementById('supportSendButton');
  const message = input.value.trim();
  if (!message) return;
  button.disabled = true;
  input.disabled = true;
  try {
    await api(`/api/support/tickets/${encodeURIComponent(state.currentId)}/messages`, {
      method: 'POST', body: JSON.stringify({ message })
    });
    input.value = '';
    await refreshThread();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    input.disabled = false;
    input.focus();
  }
}

async function closeCurrentTicket() {
  if (!state.currentId) return;
  if (!confirm('Tutup tiket bantuan ini? Kamu tidak dapat mengirim pesan lagi setelah tiket ditutup.')) return;
  try {
    await api(`/api/support/tickets/${encodeURIComponent(state.currentId)}/close`, { method: 'POST', body: '{}' });
    toast('Tiket ditutup.');
    await openTicket(state.currentId);
  } catch (error) {
    toast(error.message);
  }
}

root.addEventListener('click', event => {
  const ticket = event.target.closest('[data-open-ticket]');
  if (ticket) { openTicket(ticket.dataset.openTicket); return; }
  if (event.target.closest('[data-new-ticket]')) { renderNewTicket(); return; }
  if (event.target.closest('[data-support-home]')) { loadHome(); return; }
  if (event.target.closest('[data-close-ticket]')) { closeCurrentTicket(); return; }
  if (event.target.closest('[data-retry-support]')) { loadHome(); }
});

window.addEventListener('pagehide', stopPolling);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.currentId) refreshThread().catch(() => null);
});

loadHome();
