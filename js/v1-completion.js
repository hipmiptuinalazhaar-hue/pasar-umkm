'use strict';

(() => {
  if (window.PasarV1Completion?.version === '1.0') return;

  const doc = document;
  const SELECTION_KEY = 'pasar_cart_selection_v2';
  const cache = {
    sellerAt: 0,
    recommendationsAt: 0,
    sellerLoading: false,
    recommendationsLoading: false
  };
  const money = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  });

  function ensureStyle() {
    if (doc.querySelector('link[data-v1-completion-style]')) return;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/v1-completion.css?v=1.1';
    link.dataset.v1CompletionStyle = 'true';
    doc.head.appendChild(link);
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'include',
      cache: 'no-store',
      ...options,
      headers: { Accept: 'application/json', ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const ageMinutes = value => Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));

  function ageLabel(value) {
    const minutes = ageMinutes(value);
    if (minutes < 60) return `${minutes} mnt`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} jam`;
    return `${Math.floor(hours / 24)} hari`;
  }

  function selection() {
    try {
      const value = JSON.parse(sessionStorage.getItem(SELECTION_KEY) || '[]');
      return Array.isArray(value) ? [...new Set(value.map(String))] : [];
    } catch {
      return [];
    }
  }

  function sellerStatusLabel(status) {
    return ({
      pending: 'Perlu dikonfirmasi',
      confirmed: 'Mulai diproses',
      processing: 'Siapkan pesanan',
      ready: 'Siap diselesaikan'
    })[status] || 'Periksa pesanan';
  }

  function sellerStatusIcon(status) {
    return ({
      pending: 'bell-ringing',
      confirmed: 'cooking-pot',
      processing: 'package',
      ready: 'check-circle'
    })[status] || 'receipt';
  }

  function settingsHealth(settings = {}) {
    const fulfillment = Boolean(
      settings.pickup_enabled ||
      settings.seller_delivery_enabled ||
      settings.local_courier_enabled
    );
    const payment = Boolean(
      settings.cod_enabled ||
      settings.pay_at_store_enabled ||
      settings.bank_transfer_enabled ||
      settings.merchant_qris_enabled
    );
    return {
      fulfillment,
      payment,
      responseTargetMinutes: Math.max(15, number(settings.response_sla_minutes) || 240)
    };
  }

  function sellerOpsMarkup({ orders, products, settings, store }) {
    const health = settingsHealth(settings);
    const rows = Array.isArray(orders) ? orders : [];
    const stockRows = Array.isArray(products) ? products : [];
    const pending = rows.filter(order => order.status === 'pending');
    const active = rows.filter(order => ['pending', 'confirmed', 'processing', 'ready'].includes(order.status));
    const completed = rows.filter(order => order.status === 'completed');
    const cancelled = rows.filter(order => order.status === 'cancelled');
    const low = stockRows.filter(product => product.is_active !== false && number(product.stock) > 0 && number(product.stock) <= 5);
    const out = stockRows.filter(product => product.is_active !== false && number(product.stock) <= 0);
    const overdue = pending.filter(order => ageMinutes(order.created_at) > health.responseTargetMinutes);
    const revenue = completed.reduce((sum, order) => sum + number(order.total), 0);
    const terminal = completed.length + cancelled.length;
    const completion = terminal >= 5 ? Math.round((completed.length / terminal) * 100) : null;
    const attention = active.length + low.length + out.length;
    const queue = active
      .slice()
      .sort((a, b) => {
        const weight = value => ({ pending: 0, confirmed: 1, processing: 2, ready: 3 })[value] ?? 9;
        return weight(a.status) - weight(b.status) || new Date(a.created_at) - new Date(b.created_at);
      })
      .slice(0, 4);

    return `
      <section class="v1-seller-ops" data-v1-seller-ops>
        <div class="v1-seller-head">
          <div>
            <h2>Tindakan hari ini</h2>
            <p>${attention ? `${attention} hal membutuhkan perhatian toko.` : 'Tidak ada pekerjaan mendesak saat ini.'}</p>
          </div>
          <span class="v1-attention ${attention ? 'has-work' : ''}" aria-label="${attention} tindakan perlu diperiksa">${attention}</span>
        </div>

        <div class="v1-metrics">
          <button type="button" data-v1-orders>
            <small>Pesanan aktif</small>
            <strong>${active.length}</strong>
            <span>${pending.length} menunggu</span>
          </button>
          <button type="button" data-v1-products>
            <small>Stok menipis</small>
            <strong>${low.length + out.length}</strong>
            <span>${out.length} habis</span>
          </button>
          <div>
            <small>Omzet selesai</small>
            <strong>${money.format(revenue)}</strong>
            <span>${completed.length} order</span>
          </div>
          <div>
            <small>Penyelesaian</small>
            <strong>${completion == null ? 'Belum cukup data' : `${completion}%`}</strong>
            <span>${terminal} pesanan selesai/batal</span>
          </div>
        </div>

        ${overdue.length ? `
          <div class="v1-alert">
            <i class="ph ph-warning-circle" aria-hidden="true"></i>
            <span>
              <strong>${overdue.length} pesanan belum dikonfirmasi tepat waktu.</strong>
              <small>Target respons toko ${health.responseTargetMinutes} menit. Prioritaskan pesanan tertua.</small>
            </span>
          </div>` : ''}

        ${queue.length ? `
          <div class="v1-queue">
            <div class="v1-section-title">
              <strong>Antrean tindakan</strong>
              <button type="button" data-v1-orders>Lihat semua</button>
            </div>
            ${queue.map(order => `
              <button type="button" class="v1-queue-row" data-v1-orders>
                <span class="v1-queue-icon"><i class="ph ph-${sellerStatusIcon(order.status)}"></i></span>
                <span>
                  <strong>${esc(order.order_number || 'Pesanan')}</strong>
                  <small>${sellerStatusLabel(order.status)} · ${ageLabel(order.created_at)}</small>
                </span>
                <span>${money.format(number(order.total))}</span>
              </button>`).join('')}
          </div>` : ''}

        <div class="v1-health">
          <strong>Kesiapan toko</strong>
          <span class="${store?.verification_status === 'verified' ? 'ok' : ''}">
            <i class="ph ${store?.verification_status === 'verified' ? 'ph-check-circle' : 'ph-clock'}"></i>Verifikasi
          </span>
          <span class="${health.fulfillment ? 'ok' : ''}">
            <i class="ph ${health.fulfillment ? 'ph-check-circle' : 'ph-warning'}"></i>Pengiriman
          </span>
          <span class="${health.payment ? 'ok' : ''}">
            <i class="ph ${health.payment ? 'ph-check-circle' : 'ph-warning'}"></i>Pembayaran
          </span>
        </div>
      </section>`;
  }

  async function enhanceSellerCenter() {
    const menu = doc.querySelector('.commerce-menu-list[aria-label="Menu Seller Center"]');
    if (!menu) return;
    const host = menu.closest('.commerce-content');
    if (!host || host.querySelector('[data-v1-seller-ops]') || cache.sellerLoading) return;
    if (Date.now() - cache.sellerAt < 1200) return;

    cache.sellerLoading = true;
    try {
      const [ordersData, productsData, settingsData] = await Promise.all([
        api('/api/commerce/orders?scope=seller'),
        api('/api/products/me'),
        api('/api/commerce/fulfillment/settings/me').catch(() => ({ settings: {} }))
      ]);
      if (!doc.contains(menu)) return;

      const wrapper = doc.createElement('div');
      wrapper.innerHTML = sellerOpsMarkup({
        orders: ordersData.orders || [],
        products: productsData.products || [],
        settings: settingsData.settings || {},
        store: productsData.store || (typeof STATE !== 'undefined' ? STATE.currentStore : null)
      }).trim();
      menu.parentElement?.insertBefore(wrapper.firstElementChild, menu);
      cache.sellerAt = Date.now();
    } catch (error) {
      if (error.status !== 401 && error.status !== 403) {
        console.warn('[Pasar UMKM] seller operations:', error);
      }
    } finally {
      cache.sellerLoading = false;
    }
  }

  function networkConstrained() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return Boolean(connection?.saveData || ['slow-2g', '2g'].includes(String(connection?.effectiveType || '')));
  }

  function rankingScore(product, productEvidence, storeEvidence) {
    const sold = number(productEvidence?.sold_count);
    const rating = number(productEvidence?.average_rating);
    const count = number(productEvidence?.rating_count || productEvidence?.verified_rating_count);
    const verified = storeEvidence?.is_verified === true || product.store_verification_status === 'verified';
    const fresh = Date.now() - new Date(product.created_at || 0).getTime() < 30 * 86400000;
    return (
      (verified ? 10 : 0) +
      (product.is_featured ? 4 : 0) +
      Math.min(sold, 50) * 0.4 +
      rating * 2 +
      Math.min(count, 20) * 0.3 +
      (fresh ? 2 : 0)
    );
  }

  function recommendationReason(product, productEvidence, storeEvidence) {
    if (storeEvidence?.is_verified === true || product.store_verification_status === 'verified') return 'UMKM terverifikasi';
    if (number(productEvidence?.sold_count) > 0) return `${number(productEvidence.sold_count).toLocaleString('id-ID')} terjual`;
    if (number(productEvidence?.average_rating) > 0) return `Rating ${number(productEvidence.average_rating).toFixed(1)}`;
    return product.is_featured ? 'Pilihan marketplace' : 'Produk lokal aktif';
  }

  function recommendationCard(item, productEvidence, storeEvidence) {
    const productId = esc(item.id);
    const name = esc(item.name || 'Produk');
    const image = esc(item.image_url || '/assets/logo.webp');
    const storeName = esc(item.store_name || 'UMKM Lokal');
    const reason = esc(recommendationReason(item, productEvidence, storeEvidence));
    const stock = Math.max(0, number(item.stock));

    return `
      <article class="v1-rec-card" data-v1-rec-product="${productId}">
        <button
          type="button"
          class="v1-rec-main"
          data-commerce-action="product-detail"
          data-product-id="${productId}"
          aria-label="Lihat ${name}"
        >
          <span class="v1-rec-image">
            <img src="${image}" alt="${name}" loading="lazy" decoding="async">
          </span>
          <span class="v1-rec-copy">
            <small>${reason}</small>
            <strong>${name}</strong>
            <span>${money.format(number(item.price))}</span>
            <em>${storeName}</em>
            <span class="v1-rec-stock">Stok ${stock}</span>
          </span>
        </button>
        <div class="v1-rec-actions" aria-label="Aksi ${name}">
          <button
            type="button"
            class="v1-rec-cart"
            data-commerce-action="add-cart"
            data-product-id="${productId}"
            aria-label="Masukkan ${name} ke keranjang"
          ><i class="ph ph-shopping-cart-simple" aria-hidden="true"></i><span>Keranjang</span></button>
          <button
            type="button"
            class="v1-rec-buy"
            data-commerce-action="buy-now"
            data-product-id="${productId}"
          ><span>Beli</span></button>
        </div>
      </article>`;
  }

  async function enhanceDiscovery() {
    const home = doc.getElementById('homeDiscovery');
    if (!home || home.hidden || home.querySelector('[data-v1-recommendations]') || cache.recommendationsLoading) return;
    if (Date.now() - cache.recommendationsAt < 30000) return;

    const constrained = networkConstrained();
    const candidateLimit = constrained ? 6 : 16;
    const recommendationLimit = constrained ? 4 : 8;

    cache.recommendationsLoading = true;
    try {
      const discovery = await api(`/api/discover?kind=products&sort=relevance&limit=${candidateLimit}`);
      const candidates = Array.isArray(discovery.products)
        ? discovery.products.filter(item => number(item.stock) > 0)
        : [];
      if (!candidates.length) return;

      const productIds = candidates.map(item => item.id).filter(Boolean);
      const storeIds = [...new Set(candidates.map(item => item.store_id).filter(Boolean))];
      const params = new URLSearchParams();
      params.set('product_ids', productIds.join(','));
      params.set('store_ids', storeIds.join(','));

      const evidence = await api(`/api/ratings/summaries?${params}`);
      const products = new Map((evidence.products || []).map(item => [String(item.product_id), item]));
      const stores = new Map((evidence.stores || []).map(item => [String(item.store_id), item]));
      const ranked = candidates
        .map(item => ({
          item,
          score: rankingScore(item, products.get(String(item.id)), stores.get(String(item.store_id)))
        }))
        .sort((a, b) => b.score - a.score || String(a.item.name).localeCompare(String(b.item.name), 'id'))
        .slice(0, recommendationLimit);

      if (!ranked.length || !doc.contains(home)) return;

      const section = doc.createElement('section');
      section.className = 'v1-recommendations';
      section.dataset.v1Recommendations = 'true';
      section.innerHTML = `
        <div class="v1-rec-head">
          <div>
            <h2>Rekomendasi marketplace</h2>
            <p>Diranking dari verifikasi, transaksi selesai, rating pembelian, dan ketersediaan produk.</p>
          </div>
          <button type="button" data-action="search" aria-label="Cari produk lain">
            <i class="ph ph-magnifying-glass"></i>
          </button>
        </div>
        <div class="v1-rec-grid">
          ${ranked.map(({ item }) => recommendationCard(
            item,
            products.get(String(item.id)),
            stores.get(String(item.store_id))
          )).join('')}
        </div>
        <details class="v1-ranking-method">
          <summary>Mengapa produk ini muncul?</summary>
          <p>Urutan mempertimbangkan status UMKM, penjualan selesai, rating pembeli, produk unggulan, produk baru, dan stok yang masih tersedia.</p>
        </details>`;

      home.appendChild(section);
      cache.recommendationsAt = Date.now();
    } catch (error) {
      console.warn('[Pasar UMKM] recommendations:', error);
    } finally {
      cache.recommendationsLoading = false;
    }
  }

  function cartSelectionFromDom() {
    const checked = [...doc.querySelectorAll('[data-cart-v2-select-item]:checked')]
      .map(input => String(input.dataset.productId || input.closest('[data-product-id]')?.dataset.productId || ''))
      .filter(Boolean);
    return checked.length ? [...new Set(checked)] : selection();
  }

  async function enhanceCartSafety() {
    const button = doc.querySelector('[data-cart-v2-checkout]');
    if (!button) return;
    const page = button.closest('.commerce-page') || doc.querySelector('.commerce-page');
    if (!page) return;

    let panel = page.querySelector('[data-v1-cart-safety]');
    if (!panel) {
      panel = doc.createElement('section');
      panel.className = 'v1-cart-safety';
      panel.dataset.v1CartSafety = 'true';
      panel.setAttribute('role', 'status');
      panel.setAttribute('aria-live', 'polite');
      const content = page.querySelector('.commerce-content');
      content?.appendChild(panel);
    }

    const ids = cartSelectionFromDom();
    if (!ids.length) {
      panel.classList.remove('is-ready');
      panel.innerHTML = '<i class="ph ph-info"></i><span><strong>Belum ada produk dipilih</strong><small>Centang produk yang ingin dibeli sebelum checkout.</small></span>';
      return;
    }

    try {
      const data = await api('/api/commerce/cart');
      const items = data.cart?.items || [];
      const map = new Map(items.map(item => [String(item.product_id), item]));
      const missing = ids.filter(id => !map.has(id));
      const stockIssue = ids.filter(id => {
        const item = map.get(id);
        return item && item.stock != null && number(item.quantity) > number(item.stock);
      });
      const ready = !missing.length && !stockIssue.length;

      panel.classList.toggle('is-ready', ready);
      panel.innerHTML = ready
        ? `<i class="ph ph-shield-check"></i><span><strong>${ids.length} produk siap di-checkout</strong><small>Stok akan diperiksa sekali lagi saat pesanan dibuat.</small></span>`
        : `<i class="ph ph-warning-circle"></i><span><strong>Pilihan keranjang berubah</strong><small>${missing.length ? `${missing.length} produk tidak lagi ada di keranjang. ` : ''}${stockIssue.length ? `${stockIssue.length} produk melebihi stok tersedia.` : ''}</small></span>`;
      button.disabled = !ready;
    } catch {
      panel.classList.remove('is-ready');
      panel.innerHTML = '<i class="ph ph-wifi-slash"></i><span><strong>Status keranjang belum dapat diperiksa</strong><small>Checkout tetap akan memeriksa ketersediaan stok sebelum pesanan dibuat.</small></span>';
    }
  }

  function handleClick(event) {
    if (event.target.closest('[data-v1-orders]')) {
      event.preventDefault();
      window.PasarCommerce?.openOrders?.('seller');
      return;
    }

    if (event.target.closest('[data-v1-products]')) {
      event.preventDefault();
      doc.querySelector('[data-commerce-route="products"]')?.click();
    }
  }

  let timer = 0;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      enhanceSellerCenter();
      enhanceDiscovery();
      enhanceCartSafety();
    }, 90);
  }

  ensureStyle();
  doc.addEventListener('click', handleClick, true);
  doc.addEventListener('change', event => {
    if (event.target.matches('[data-cart-v2-select-item],[data-cart-v2-select-store],[data-cart-v2-select-all]')) {
      setTimeout(enhanceCartSafety, 0);
    }
  }, true);

  new MutationObserver(schedule).observe(doc.body, { childList: true, subtree: true });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();

  window.PasarV1Completion = Object.freeze({
    version: '1.0',
    revision: '1.2',
    refreshSeller: () => {
      cache.sellerAt = 0;
      return enhanceSellerCenter();
    },
    refreshDiscovery: () => {
      cache.recommendationsAt = 0;
      return enhanceDiscovery();
    },
    refreshCartSafety: enhanceCartSafety
  });
})();