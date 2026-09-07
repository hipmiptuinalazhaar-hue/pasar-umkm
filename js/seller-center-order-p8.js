'use strict';

(() => {
  if (window.PasarSellerOrdersP8?.version === '1.0') return;

  const doc = document;
  let sellerOrders = [];
  let loadPromise = null;
  let activeOrderId = '';
  let refreshTimer = 0;

  const esc = value => String(value ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');

  const labels = {
    pickup: 'Ambil di toko', seller_delivery: 'Antar oleh seller', local_courier: 'Kurir lokal',
    awaiting_confirmation: 'Menunggu proses', ready_for_pickup: 'Siap diambil', in_transit: 'Dalam perjalanan',
    picked_up: 'Sudah diambil', delivered: 'Sudah diterima', cod: 'COD', pay_at_store: 'Bayar di toko',
    bank_transfer: 'Transfer rekening / e-wallet', merchant_qris: 'QRIS merchant'
  };

  const money = value => new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0
  }).format(Number(value || 0));

  const date = value => value ? new Date(value).toLocaleString('id-ID', {
    dateStyle: 'medium', timeStyle: 'short'
  }) : '—';

  async function api(path, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    const config = { credentials: 'include', cache: 'no-store', ...options, headers };
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      config.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }
    const response = await fetch(path, config);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || data.message || `HTTP ${response.status}`);
    return data;
  }

  function tell(message) {
    if (typeof window.showToast === 'function') window.showToast(message);
  }

  async function loadOrders(force = false) {
    if (loadPromise && !force) return loadPromise;
    loadPromise = api('/api/commerce/orders?scope=seller')
      .then(data => {
        sellerOrders = data.orders || [];
        return sellerOrders;
      })
      .finally(() => { loadPromise = null; });
    return loadPromise;
  }

  function pill(text) {
    return `<span class="scp8-order-pill">${esc(text || '—')}</span>`;
  }

  function buyerMapUrl(order) {
    const lat = Number(order?.delivery_latitude);
    const lng = Number(order?.delivery_longitude);
    return Number.isFinite(lat) && Number.isFinite(lng)
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : '';
  }

  async function enhanceOrderList() {
    const cards = [...doc.querySelectorAll('.commerce-order-card[data-order-scope="seller"]')];
    if (!cards.length) return;
    await loadOrders().catch(() => []);
    for (const card of cards) {
      if (card.querySelector('.scp8-order-meta')) continue;
      const order = sellerOrders.find(item => String(item.id) === String(card.dataset.orderId));
      if (!order) continue;
      const meta = doc.createElement('div');
      meta.className = 'scp8-order-meta';
      meta.innerHTML = `${pill(labels[order.fulfillment_method] || order.fulfillment_method)}${pill(labels[order.payment_method] || order.payment_method)}`;
      card.appendChild(meta);
    }
  }

  function orderFromPage() {
    if (activeOrderId) {
      const byId = sellerOrders.find(item => String(item.id) === String(activeOrderId));
      if (byId) return byId;
    }
    const title = doc.querySelector('.commerce-page .commerce-title')?.textContent?.trim();
    if (!title) return null;
    return sellerOrders.find(item => String(item.order_number || '').trim() === title) || null;
  }

  function nextFulfillment(order) {
    if (order.status !== 'ready' || order.fulfillment_status !== 'awaiting_confirmation') return null;
    return order.fulfillment_method === 'pickup' ? 'ready_for_pickup' : 'in_transit';
  }

  function deliveryFacts(order) {
    if (order.fulfillment_method === 'pickup') return '';
    const map = buyerMapUrl(order);
    const accuracy = Number(order.delivery_accuracy_m);
    return `
      <div class="scp8-delivery-address">
        <span>Alamat pembeli</span>
        <strong>${esc(order.delivery_address || 'Alamat belum tersedia')}</strong>
        ${order.delivery_landmark ? `<small>Patokan: ${esc(order.delivery_landmark)}</small>` : ''}
        ${map ? `<small>Titik GPS${Number.isFinite(accuracy) ? ` · akurasi ±${Math.round(accuracy)} m` : ''}</small>` : ''}
      </div>`;
  }

  function orderOps(order) {
    const next = nextFulfillment(order);
    const map = buyerMapUrl(order);
    return `
      <section id="sellerP8OrderOps" class="commerce-section scp8-order-ops">
        <div class="scp8-order-ops-head"><div><span class="commerce-eyebrow">P8 COMMERCE</span><h2 class="commerce-section-title">Pengiriman & Pembayaran</h2></div><i class="ph ph-truck"></i></div>
        <div class="scp8-order-facts">
          <div><span>Pengiriman</span><strong>${esc(labels[order.fulfillment_method] || order.fulfillment_method || '—')}</strong></div>
          <div><span>Status pengiriman</span><strong>${esc(labels[order.fulfillment_status] || order.fulfillment_status || '—')}</strong></div>
          <div><span>Pembayaran</span><strong>${esc(labels[order.payment_method] || order.payment_method || '—')}</strong></div>
          <div><span>Ongkir</span><strong>${money(order.delivery_fee)}</strong></div>
          ${order.estimated_fulfillment_at ? `<div><span>Estimasi</span><strong>${esc(date(order.estimated_fulfillment_at))}</strong></div>` : ''}
        </div>
        ${deliveryFacts(order)}
        <div class="scp8-order-actions">
          ${map ? `<a class="commerce-secondary-button" href="${map}" target="_blank" rel="noopener"><i class="ph ph-navigation-arrow"></i> Navigasi ke pembeli</a>` : ''}
          ${next ? `<button type="button" class="commerce-primary" data-seller-p8-fulfillment="${esc(next)}" data-order-id="${esc(order.id)}">${next === 'ready_for_pickup' ? 'Tandai siap diambil' : 'Mulai pengantaran'}</button>` : ''}
          <button type="button" class="commerce-secondary-button" data-seller-p8-timeline="${esc(order.id)}"><i class="ph ph-clock-counter-clockwise"></i> Timeline</button>
        </div>
        <div id="sellerP8Timeline" class="scp8-timeline" hidden></div>
      </section>`;
  }

  async function enhanceOrderDetail() {
    const page = doc.querySelector('.commerce-page');
    if (!page || doc.getElementById('sellerP8OrderOps')) return;
    const eyebrow = page.querySelector('.commerce-eyebrow')?.textContent?.trim().toLowerCase() || '';
    if (!eyebrow.includes('pesanan masuk')) return;
    await loadOrders().catch(() => []);
    const order = orderFromPage();
    if (!order) return;
    const content = page.querySelector('.commerce-content');
    if (!content) return;
    content.insertAdjacentHTML('beforeend', orderOps(order));
  }

  async function renderTimeline(orderId) {
    const host = doc.getElementById('sellerP8Timeline');
    if (!host) return;
    if (host.dataset.loaded === 'true') {
      host.hidden = !host.hidden;
      return;
    }
    host.hidden = false;
    host.innerHTML = '<p>Memuat timeline…</p>';
    try {
      const data = await api(`/api/commerce/orders/${encodeURIComponent(orderId)}/timeline`);
      const events = data.events || [];
      host.innerHTML = events.length ? events.map(event => `
        <div class="scp8-event">
          <strong>${esc(labels[event.to_state] || event.to_state || event.event_kind || 'Perubahan')}</strong>
          <small>${esc(date(event.created_at))}${event.actor_name ? ` · ${esc(event.actor_name)}` : ''}</small>
          ${event.note ? `<p>${esc(event.note)}</p>` : ''}
        </div>`).join('') : '<p>Belum ada timeline tambahan.</p>';
      host.dataset.loaded = 'true';
    } catch (error) {
      host.innerHTML = `<p>${esc(error.message)}</p>`;
    }
  }

  async function updateFulfillment(orderId, status, button) {
    button.disabled = true;
    try {
      await api(`/api/commerce/orders/${encodeURIComponent(orderId)}/fulfillment`, {
        method: 'PATCH', body: { status }
      });
      tell('Status pengiriman diperbarui.');
      await loadOrders(true);
      doc.getElementById('sellerP8OrderOps')?.remove();
      await enhanceOrderDetail();
    } catch (error) {
      tell(error.message || 'Status pengiriman belum dapat diperbarui.');
    } finally {
      button.disabled = false;
    }
  }

  function scheduleEnhance() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      enhanceOrderList().catch(() => null);
      enhanceOrderDetail().catch(() => null);
    }, 40);
  }

  doc.addEventListener('click', event => {
    const orderCard = event.target?.closest?.('.commerce-order-card[data-order-scope="seller"]');
    if (orderCard) activeOrderId = String(orderCard.dataset.orderId || '');

    const fulfillment = event.target?.closest?.('[data-seller-p8-fulfillment]');
    if (fulfillment) {
      event.preventDefault();
      event.stopImmediatePropagation();
      updateFulfillment(fulfillment.dataset.orderId, fulfillment.dataset.sellerP8Fulfillment, fulfillment);
      return;
    }

    const timeline = event.target?.closest?.('[data-seller-p8-timeline]');
    if (timeline) {
      event.preventDefault();
      event.stopImmediatePropagation();
      renderTimeline(timeline.dataset.sellerP8Timeline);
    }
  }, true);

  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  scheduleEnhance();

  window.PasarSellerOrdersP8 = Object.freeze({ version: '1.0', enhanceOrderList, enhanceOrderDetail });
})();