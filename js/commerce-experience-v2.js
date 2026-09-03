'use strict';

/* =========================================================
   PASAR UMKM — COMMERCE EXPERIENCE V2
   Full-screen mobile commerce flows.
   This module is lazy-loaded by the P2 bootstrap.
   ========================================================= */

(() => {
  if (window.PasarCommerce?.version === '2.0') {
    return;
  }

  const ORDER_LABELS = Object.freeze({
    pending: 'Menunggu konfirmasi',
    confirmed: 'Dikonfirmasi',
    processing: 'Diproses',
    ready: 'Siap',
    completed: 'Selesai',
    cancelled: 'Dibatalkan'
  });

  const ORDER_SEQUENCE = [
    'pending',
    'confirmed',
    'processing',
    'ready',
    'completed'
  ];

  const STORE_DEFAULTS = {
    city: 'Lubuklinggau',
    province: 'Sumatera Selatan'
  };

  const COMMERCE = {
    active: false,
    originNav: 'home',
    history: [],
    cart: null,
    buyerOrders: [],
    sellerOrders: [],
    products: [],
    currentStore: null,
    sellerSummary: null,
    onboardingDraft: {},
    productSearch: ''
  };

  function esc(value) {
    if (typeof escapeHTML === 'function') {
      return escapeHTML(String(value ?? ''));
    }

    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function money(value) {
    if (typeof formatRupiah === 'function') {
      return formatRupiah(Number(value || 0));
    }

    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  function toast(message) {
    if (typeof showToast === 'function') {
      showToast(message);
    }
  }

  async function request(path, options = {}) {
    const headers = {
      Accept: 'application/json',
      ...(options.headers || {})
    };

    const config = {
      method: options.method || 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers
    };

    if (options.formData) {
      config.body = options.formData;
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(options.body);
    }

    const response = await fetch(path, config);
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok !== true) {
      const error = new Error(
        data.error || data.message || 'Permintaan belum dapat diproses.'
      );
      error.status = response.status;
      throw error;
    }

    return data;
  }

  function user() {
    return typeof STATE !== 'undefined'
      ? STATE.user
      : null;
  }

  function isSeller() {
    const role = user()?.role;
    return role === 'seller' || role === 'admin';
  }

  function requireLogin(message = 'Masuk terlebih dahulu.') {
    if (user()) {
      return true;
    }

    toast(message);
    if (typeof openLogin === 'function') {
      openLogin();
    }
    return false;
  }

  function appElement() {
    return document.querySelector('.app');
  }

  function feedElement() {
    return document.getElementById('feed');
  }

  function closeTransientUI() {
    if (typeof closeBottomSheet === 'function') {
      closeBottomSheet();
    }
    if (typeof closeSideMenu === 'function') {
      closeSideMenu();
    }
    if (typeof closeSearch === 'function' && typeof STATE !== 'undefined' && STATE.searchOpen) {
      closeSearch();
    }
  }

  function setActiveNav(nav) {
    if (typeof STATE !== 'undefined') {
      STATE.activeNav = nav;
    }
    if (typeof updateNavigation === 'function') {
      updateNavigation();
    }
  }

  function activateShell({ nav = 'account', hideNav = false } = {}) {
    const app = appElement();
    const feed = feedElement();

    if (!app || !feed) {
      return false;
    }

    if (!COMMERCE.active) {
      COMMERCE.originNav =
        typeof STATE !== 'undefined'
          ? String(STATE.activeNav || 'home')
          : 'home';
    }

    COMMERCE.active = true;

    app.classList.remove('account-profile-active');
    app.classList.add('commerce-view-active');
    app.classList.toggle('commerce-hide-nav', hideNav);

    const home = document.getElementById('homeDiscovery');
    const stories = document.getElementById('storiesSection');
    if (home) home.hidden = true;
    if (stories) stories.hidden = true;

    closeTransientUI();
    setActiveNav(nav);

    window.scrollTo({ top: 0, behavior: 'auto' });
    return true;
  }

  function cleanupShell() {
    const app = appElement();
    app?.classList.remove('commerce-view-active', 'commerce-hide-nav');
    COMMERCE.active = false;
    COMMERCE.history = [];
  }

  function restoreOrigin() {
    const origin = COMMERCE.originNav;
    cleanupShell();

    if (origin === 'account' && typeof openAccount === 'function') {
      openAccount();
      return;
    }

    if (typeof STATE !== 'undefined') {
      STATE.activeNav = 'home';
    }

    const home = document.getElementById('homeDiscovery');
    if (home) home.hidden = false;

    if (typeof renderStories === 'function') {
      renderStories();
    }
    if (typeof renderFeed === 'function') {
      renderFeed();
    }
    if (typeof updateNavigation === 'function') {
      updateNavigation();
    }

    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function leaveForNativeNavigation() {
    if (!COMMERCE.active) return;
    cleanupShell();
  }

  function headerTemplate({ title, eyebrow = '', back = true, action = '' }) {
    return `
      <header class="commerce-page-header ${back ? '' : 'no-back'}">
        ${back ? `
          <button
            type="button"
            class="commerce-back"
            data-commerce-action="back"
            aria-label="Kembali"
          >
            <i class="ph ph-arrow-left" aria-hidden="true"></i>
          </button>
        ` : ''}

        <div class="commerce-header-copy">
          ${eyebrow ? `<span class="commerce-eyebrow">${esc(eyebrow)}</span>` : ''}
          <h1 class="commerce-title">${esc(title)}</h1>
        </div>

        ${action || ''}
      </header>
    `;
  }

  function mountPage({
    title,
    eyebrow = '',
    body,
    footer = '',
    back = true,
    nav = 'account',
    hideNav = false,
    headerAction = ''
  }) {
    if (!activateShell({ nav, hideNav })) {
      return;
    }

    const feed = feedElement();
    feed.innerHTML = `
      <section class="commerce-page">
        ${headerTemplate({ title, eyebrow, back, action: headerAction })}
        ${body}
        ${footer}
      </section>
    `;
  }

  function loadingPage(title, options = {}) {
    mountPage({
      title,
      eyebrow: options.eyebrow || '',
      back: options.back !== false,
      nav: options.nav || 'account',
      hideNav: Boolean(options.hideNav),
      body: `
        <main class="commerce-content">
          <div class="commerce-skeleton"></div>
          <div class="commerce-skeleton" style="margin-top:10px;min-height:120px;"></div>
          <div class="commerce-skeleton" style="margin-top:10px;min-height:84px;"></div>
        </main>
      `
    });
  }

  function emptyState(icon, title, text, action = '') {
    return `
      <section class="commerce-empty">
        <div class="commerce-empty-icon">
          <i class="ph ph-${esc(icon)}" aria-hidden="true"></i>
        </div>
        <strong>${esc(title)}</strong>
        <p>${esc(text)}</p>
        ${action}
      </section>
    `;
  }

  function routeKey(route, params = {}) {
    return `${route}:${JSON.stringify(params)}`;
  }

  async function go(route, params = {}, options = {}) {
    const next = { route, params };

    if (!COMMERCE.active) {
      COMMERCE.history = [];
    }

    const current = COMMERCE.history.at(-1);
    if (options.replace && current) {
      COMMERCE.history[COMMERCE.history.length - 1] = next;
    } else if (!current || routeKey(current.route, current.params) !== routeKey(route, params)) {
      COMMERCE.history.push(next);
    }

    await renderRoute(route, params);
  }

  async function back() {
    if (COMMERCE.history.length > 1) {
      COMMERCE.history.pop();
      const previous = COMMERCE.history.at(-1);
      await renderRoute(previous.route, previous.params);
      return;
    }

    restoreOrigin();
  }

  async function renderRoute(route, params = {}) {
    switch (route) {
      case 'cart': return renderCartPage();
      case 'checkout': return renderCheckoutPage();
      case 'checkout-success': return renderCheckoutSuccess(params);
      case 'buyer-orders': return renderOrdersPage('buyer');
      case 'seller-orders': return renderOrdersPage('seller');
      case 'order-detail': return renderOrderDetail(params);
      case 'seller-center': return renderSellerCenter();
      case 'store-profile': return renderStoreProfile();
      case 'products': return renderProductsPage();
      case 'product-editor': return renderProductEditor(params.productId || '');
      case 'product-detail': return renderProductDetail(params.productId || '');
      case 'onboarding': return renderOnboarding(Number(params.step || 1));
      default: return renderCartPage();
    }
  }

  function syncCart(cart) {
    COMMERCE.cart = cart || { items: [], item_count: 0, total: 0 };

    if (typeof STATE !== 'undefined') {
      STATE.cart = (COMMERCE.cart.items || []).map(item => ({
        productId: String(item.product_id || ''),
        quantity: Number(item.quantity || 0),
        product: {
          id: String(item.product_id || ''),
          name: item.name || 'Produk',
          description: item.description || '',
          price: Number(item.price || 0),
          stock: Number(item.stock || 0),
          unit: item.unit || '',
          image: item.image_url || (typeof ASSETS !== 'undefined' ? ASSETS.logo : ''),
          storeId: item.store_id || '',
          storeName: item.store_name || ''
        }
      }));
    }

    if (typeof saveLocalState === 'function') {
      saveLocalState();
    }
    if (typeof updateCartBadge === 'function') {
      updateCartBadge();
    }
  }

  async function loadCart() {
    const data = await request('/api/commerce/cart');
    syncCart(data.cart);
    return COMMERCE.cart;
  }

  function groupCart(items) {
    const groups = new Map();

    for (const item of items || []) {
      const key = String(item.store_id || item.store_name || 'store');
      if (!groups.has(key)) {
        groups.set(key, {
          id: item.store_id || '',
          name: item.store_name || 'UMKM Lokal',
          items: []
        });
      }
      groups.get(key).items.push(item);
    }

    return [...groups.values()];
  }

  function cartItemTemplate(item) {
    return `
      <article class="commerce-cart-item" data-product-id="${esc(item.product_id)}">
        <div class="commerce-cart-media">
          <img
            src="${esc(item.image_url || (typeof ASSETS !== 'undefined' ? ASSETS.logo : ''))}"
            alt="${esc(item.name || 'Produk')}"
            loading="lazy"
            decoding="async"
          >
        </div>

        <div class="commerce-cart-copy">
          <strong class="commerce-cart-name">${esc(item.name || 'Produk')}</strong>
          <div class="commerce-cart-price">${money(item.price)}</div>
          <div class="commerce-cart-meta">Stok ${Number(item.stock || 0)} ${esc(item.unit || '')}</div>

          <div class="commerce-quantity-row" aria-label="Atur jumlah produk">
            <button
              type="button"
              data-commerce-action="cart-minus"
              data-product-id="${esc(item.product_id)}"
              data-quantity="${Number(item.quantity || 0)}"
              aria-label="Kurangi jumlah ${esc(item.name || 'produk')}"
            ><i class="ph ph-minus" aria-hidden="true"></i></button>

            <span class="commerce-quantity-value">${Number(item.quantity || 0)}</span>

            <button
              type="button"
              data-commerce-action="cart-plus"
              data-product-id="${esc(item.product_id)}"
              data-quantity="${Number(item.quantity || 0)}"
              aria-label="Tambah jumlah ${esc(item.name || 'produk')}"
            ><i class="ph ph-plus" aria-hidden="true"></i></button>

            <button
              type="button"
              class="commerce-remove"
              data-commerce-action="cart-remove"
              data-product-id="${esc(item.product_id)}"
              aria-label="Hapus ${esc(item.name || 'produk')} dari keranjang"
            ><i class="ph ph-trash" aria-hidden="true"></i></button>
          </div>
        </div>
      </article>
    `;
  }

  async function renderCartPage() {
    if (!requireLogin('Masuk untuk melihat keranjang.')) return;

    loadingPage('Keranjang', { back: false, nav: 'cart', eyebrow: 'Belanja' });

    try {
      const cart = await loadCart();

      if (!(cart.items || []).length) {
        mountPage({
          title: 'Keranjang',
          eyebrow: 'Belanja',
          back: false,
          nav: 'cart',
          body: emptyState(
            'shopping-cart-simple',
            'Keranjang masih kosong',
            'Produk yang kamu pilih akan tersimpan di akunmu.'
          )
        });
        return;
      }

      const groups = groupCart(cart.items);
      const body = `
        <main class="commerce-content with-sticky">
          ${groups.map(group => `
            <section class="commerce-store-group">
              <div class="commerce-store-head">
                <i class="ph ph-storefront" aria-hidden="true"></i>
                <span>${esc(group.name)}</span>
              </div>
              ${group.items.map(cartItemTemplate).join('')}
            </section>
          `).join('')}

          <button
            type="button"
            class="commerce-clear-cart"
            data-commerce-action="cart-clear"
          >Kosongkan keranjang</button>
        </main>
      `;

      const footer = `
        <footer class="commerce-sticky">
          <div class="commerce-sticky-copy">
            <span>Total</span>
            <strong>${money(cart.total)}</strong>
          </div>
          <button
            type="button"
            class="commerce-primary"
            data-commerce-action="checkout"
          >Checkout</button>
        </footer>
      `;

      mountPage({
        title: 'Keranjang',
        eyebrow: `${Number(cart.item_count || 0)} item`,
        back: false,
        nav: 'cart',
        body,
        footer
      });
    } catch (error) {
      toast(error.message || 'Keranjang belum dapat dimuat.');
    }
  }

  async function updateCartQuantity(productId, quantity) {
    try {
      let data;
      if (quantity <= 0) {
        data = await request(
          `/api/commerce/cart/items/${encodeURIComponent(productId)}`,
          { method: 'DELETE' }
        );
      } else {
        data = await request(
          `/api/commerce/cart/items/${encodeURIComponent(productId)}`,
          { method: 'PATCH', body: { quantity } }
        );
      }

      syncCart(data.cart);
      await renderCartPage();
    } catch (error) {
      toast(error.message || 'Keranjang belum dapat diperbarui.');
    }
  }

  async function clearCart() {
    try {
      const data = await request('/api/commerce/cart', { method: 'DELETE' });
      syncCart(data.cart);
      toast('Keranjang dikosongkan.');
      await renderCartPage();
    } catch (error) {
      toast(error.message || 'Keranjang belum dapat dikosongkan.');
    }
  }

  function checkoutItemsTemplate(cart) {
    return groupCart(cart.items).map(group => `
      <section class="commerce-section">
        <h2 class="commerce-section-title">${esc(group.name)}</h2>
        ${group.items.map(item => `
          <div class="commerce-order-mini">
            <div class="commerce-order-mini-media">
              <img src="${esc(item.image_url || (typeof ASSETS !== 'undefined' ? ASSETS.logo : ''))}" alt="${esc(item.name || 'Produk')}">
            </div>
            <div>
              <strong>${esc(item.name || 'Produk')}</strong>
              <span>${Number(item.quantity || 0)} × ${money(item.price)}</span>
            </div>
            <div class="commerce-order-mini-price">${money(Number(item.price || 0) * Number(item.quantity || 0))}</div>
          </div>
        `).join('')}
      </section>
    `).join('');
  }

  async function renderCheckoutPage() {
    if (!requireLogin('Masuk terlebih dahulu untuk checkout.')) return;

    loadingPage('Checkout', { nav: 'cart', hideNav: true, eyebrow: 'Konfirmasi pesanan' });

    try {
      const cart = COMMERCE.cart?.items?.length ? COMMERCE.cart : await loadCart();

      if (!(cart.items || []).length) {
        toast('Keranjang masih kosong.');
        await go('cart', {}, { replace: true });
        return;
      }

      const body = `
        <main class="commerce-content with-sticky">
          <section class="commerce-section">
            <h2 class="commerce-section-title">Penerima & pengantaran</h2>
            <p class="commerce-section-subtitle">Pastikan nomor yang dimasukkan dapat dihubungi oleh UMKM.</p>

            <form id="commerceCheckoutForm" class="commerce-form" autocomplete="on">
              <div class="commerce-field">
                <label class="commerce-label" for="commerceCheckoutName">Nama penerima</label>
                <input
                  id="commerceCheckoutName"
                  class="commerce-input"
                  name="customer_name"
                  value="${esc(user()?.name || '')}"
                  autocomplete="name"
                  required
                >
              </div>

              <div class="commerce-field">
                <label class="commerce-label" for="commerceCheckoutPhone">Nomor WhatsApp / telepon</label>
                <input
                  id="commerceCheckoutPhone"
                  class="commerce-input"
                  name="customer_phone"
                  inputmode="tel"
                  autocomplete="tel"
                  value="${esc(user()?.phone || '')}"
                  required
                >
              </div>

              <div class="commerce-field">
                <label class="commerce-label" for="commerceCheckoutAddress">Alamat pengantaran</label>
                <textarea
                  id="commerceCheckoutAddress"
                  class="commerce-textarea"
                  name="delivery_address"
                  rows="4"
                  autocomplete="street-address"
                  required
                ></textarea>
              </div>

              <div class="commerce-field">
                <label class="commerce-label" for="commerceCheckoutNotes">Catatan untuk UMKM <span aria-hidden="true">·</span> opsional</label>
                <textarea
                  id="commerceCheckoutNotes"
                  class="commerce-textarea"
                  name="notes"
                  rows="3"
                  placeholder="Contoh: antar setelah pukul 16.00"
                ></textarea>
              </div>
            </form>
          </section>

          ${checkoutItemsTemplate(cart)}

          <section class="commerce-section">
            <h2 class="commerce-section-title">Ringkasan pembayaran</h2>
            <div class="commerce-summary-line"><span>Subtotal produk</span><strong>${money(cart.total)}</strong></div>
            <div class="commerce-summary-line"><span>Biaya layanan</span><strong>Rp0</strong></div>
            <div class="commerce-summary-line total"><span>Total</span><strong>${money(cart.total)}</strong></div>
          </section>
        </main>
      `;

      const footer = `
        <footer class="commerce-sticky">
          <div class="commerce-sticky-copy">
            <span>Total</span>
            <strong>${money(cart.total)}</strong>
          </div>
          <button
            type="submit"
            form="commerceCheckoutForm"
            class="commerce-primary"
          >Buat Pesanan</button>
        </footer>
      `;

      mountPage({
        title: 'Checkout',
        eyebrow: 'Konfirmasi pesanan',
        nav: 'cart',
        hideNav: true,
        body,
        footer
      });
    } catch (error) {
      toast(error.message || 'Checkout belum dapat dimuat.');
    }
  }

  async function submitCheckout(form) {
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const submit = document.querySelector('[form="commerceCheckoutForm"]');
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Memproses...';
    }

    const values = new FormData(form);

    try {
      const data = await request('/api/commerce/checkout', {
        method: 'POST',
        body: {
          customer_name: values.get('customer_name'),
          customer_phone: values.get('customer_phone'),
          delivery_address: values.get('delivery_address'),
          notes: values.get('notes')
        }
      });

      syncCart({ items: [], item_count: 0, total: 0 });
      window.refreshNotificationBadge?.();

      await go('checkout-success', {
        count: Number(data.orders?.length || 1),
        orders: data.orders || []
      }, { replace: true });
    } catch (error) {
      toast(error.message || 'Checkout belum dapat diproses.');
      if (submit) {
        submit.disabled = false;
        submit.textContent = 'Buat Pesanan';
      }
    }
  }

  function renderCheckoutSuccess(params = {}) {
    const count = Number(params.count || 1);
    mountPage({
      title: 'Pesanan berhasil',
      eyebrow: 'Checkout selesai',
      nav: 'account',
      hideNav: false,
      back: false,
      body: `
        <main class="commerce-success">
          <div class="commerce-success-icon">
            <i class="ph ph-check" aria-hidden="true"></i>
          </div>
          <h2>${count > 1 ? `${count} pesanan berhasil dibuat` : 'Pesanan berhasil dibuat'}</h2>
          <p>Pesanan sudah diteruskan ke UMKM. Status berikutnya dapat dipantau dari halaman Pesanan Saya.</p>
          <button
            type="button"
            class="commerce-primary"
            data-commerce-action="buyer-orders"
          >Lihat Pesanan Saya</button>
        </main>
      `
    });
  }

  function statusClass(status) {
    return String(status || '').replace(/[^a-z-]/g, '');
  }

  function orderCardTemplate(order, scope) {
    const counterpart = scope === 'seller'
      ? (order.buyer_name || order.customer_name || 'Pembeli')
      : (order.store_name || 'UMKM Lokal');

    const itemCount = (order.items || []).reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0
    );

    return `
      <button
        type="button"
        class="commerce-order-card"
        data-commerce-action="order-detail"
        data-order-id="${esc(order.id)}"
        data-order-scope="${esc(scope)}"
      >
        <div class="commerce-order-card-head">
          <div>
            <span class="commerce-order-number">${esc(order.order_number || '')}</span>
            <h3>${esc(counterpart)}</h3>
          </div>
          <span class="commerce-order-status ${statusClass(order.status)}">${esc(ORDER_LABELS[order.status] || order.status)}</span>
        </div>
        <div class="commerce-order-card-total">
          <span>${itemCount} item</span>
          <strong>${money(order.total)}</strong>
        </div>
      </button>
    `;
  }

  async function renderOrdersPage(scope) {
    if (!requireLogin('Masuk untuk melihat pesanan.')) return;
    if (scope === 'seller' && !isSeller()) {
      toast('Fitur ini hanya tersedia untuk pemilik UMKM.');
      return;
    }

    loadingPage(
      scope === 'seller' ? 'Pesanan Masuk' : 'Pesanan Saya',
      { nav: 'account', eyebrow: scope === 'seller' ? 'Seller Center' : 'Transaksi' }
    );

    try {
      const data = await request(`/api/commerce/orders?scope=${scope}`);
      const orders = Array.isArray(data.orders) ? data.orders : [];

      if (scope === 'seller') COMMERCE.sellerOrders = orders;
      else COMMERCE.buyerOrders = orders;

      mountPage({
        title: scope === 'seller' ? 'Pesanan Masuk' : 'Pesanan Saya',
        eyebrow: scope === 'seller' ? 'Seller Center' : 'Transaksi',
        nav: 'account',
        body: orders.length
          ? `<main class="commerce-content"><div class="commerce-order-list">${orders.map(order => orderCardTemplate(order, scope)).join('')}</div></main>`
          : emptyState(
              'receipt',
              scope === 'seller' ? 'Belum ada pesanan masuk' : 'Belum ada pesanan',
              scope === 'seller'
                ? 'Pesanan dari pembeli akan muncul di sini.'
                : 'Pesanan yang kamu buat akan muncul di sini.'
            )
      });
    } catch (error) {
      toast(error.message || 'Pesanan belum dapat dimuat.');
    }
  }

  function findOrder(scope, orderId) {
    const list = scope === 'seller' ? COMMERCE.sellerOrders : COMMERCE.buyerOrders;
    return list.find(order => String(order.id) === String(orderId)) || null;
  }

  function orderItemsDetail(order) {
    return (order.items || []).map(item => `
      <div class="commerce-order-item">
        <span>${esc(item.product_name || 'Produk')} × ${Number(item.quantity || 0)}</span>
        <strong>${money(item.subtotal)}</strong>
      </div>
    `).join('');
  }

  function timelineTemplate(order) {
    if (order.status === 'cancelled') {
      return `
        <div class="commerce-timeline">
          <div class="commerce-timeline-step done">Pesanan dibuat</div>
          <div class="commerce-timeline-step current">Pesanan dibatalkan</div>
        </div>
      `;
    }

    const currentIndex = Math.max(0, ORDER_SEQUENCE.indexOf(order.status));
    return `
      <div class="commerce-timeline">
        ${ORDER_SEQUENCE.map((status, index) => `
          <div class="commerce-timeline-step ${index < currentIndex ? 'done' : ''} ${index === currentIndex ? 'current' : ''}">
            ${esc(ORDER_LABELS[status])}
          </div>
        `).join('')}
      </div>
    `;
  }

  function sellerNextStatus(status) {
    if (status === 'pending') return { status: 'confirmed', label: 'Konfirmasi Pesanan' };
    if (status === 'confirmed') return { status: 'processing', label: 'Mulai Proses' };
    if (status === 'processing') return { status: 'ready', label: 'Tandai Siap' };
    if (status === 'ready') return { status: 'completed', label: 'Selesaikan Pesanan' };
    return null;
  }

  async function renderOrderDetail(params) {
    const scope = params.scope === 'seller' ? 'seller' : 'buyer';
    let order = findOrder(scope, params.orderId);

    if (!order) {
      try {
        const data = await request(`/api/commerce/orders?scope=${scope}`);
        const orders = Array.isArray(data.orders) ? data.orders : [];
        if (scope === 'seller') COMMERCE.sellerOrders = orders;
        else COMMERCE.buyerOrders = orders;
        order = findOrder(scope, params.orderId);
      } catch (error) {
        toast(error.message || 'Pesanan belum dapat dimuat.');
        return;
      }
    }

    if (!order) {
      toast('Pesanan tidak ditemukan.');
      await back();
      return;
    }

    const next = scope === 'seller' ? sellerNextStatus(order.status) : null;
    const buyerCanCancel = scope === 'buyer' && order.status === 'pending';
    const sellerCanCancel = scope === 'seller' && ['pending', 'confirmed', 'processing'].includes(order.status);

    const footerActions = [];
    if (next) {
      footerActions.push(`
        <button
          type="button"
          class="commerce-primary"
          data-commerce-action="order-status"
          data-order-id="${esc(order.id)}"
          data-order-scope="seller"
          data-order-status="${esc(next.status)}"
        >${esc(next.label)}</button>
      `);
    }
    if (buyerCanCancel || sellerCanCancel) {
      footerActions.push(`
        <button
          type="button"
          class="commerce-danger-button"
          data-commerce-action="order-status"
          data-order-id="${esc(order.id)}"
          data-order-scope="${esc(scope)}"
          data-order-status="cancelled"
        >Batalkan</button>
      `);
    }

    mountPage({
      title: order.order_number || 'Detail Pesanan',
      eyebrow: scope === 'seller' ? 'Pesanan masuk' : 'Pesanan saya',
      nav: 'account',
      hideNav: Boolean(footerActions.length),
      body: `
        <main class="commerce-content ${footerActions.length ? 'with-sticky' : ''}">
          <section class="commerce-section">
            <h2 class="commerce-section-title">Status pesanan</h2>
            ${timelineTemplate(order)}
          </section>

          <section class="commerce-section">
            <h2 class="commerce-section-title">${scope === 'seller' ? 'Pembeli & pengantaran' : 'Informasi pesanan'}</h2>
            <div class="commerce-detail-pair"><span>Status</span><strong>${esc(ORDER_LABELS[order.status] || order.status)}</strong></div>
            ${scope === 'seller' ? `<div class="commerce-detail-pair"><span>Pembeli</span><strong>${esc(order.buyer_name || order.customer_name || '-')}</strong></div>` : `<div class="commerce-detail-pair"><span>UMKM</span><strong>${esc(order.store_name || 'UMKM Lokal')}</strong></div>`}
            <div class="commerce-detail-pair"><span>Telepon</span><strong>${esc(order.customer_phone || '-')}</strong></div>
            <div class="commerce-detail-pair"><span>Alamat</span><strong>${esc(order.delivery_address || '-')}</strong></div>
            ${order.notes ? `<div class="commerce-detail-pair"><span>Catatan</span><strong>${esc(order.notes)}</strong></div>` : ''}
          </section>

          <section class="commerce-section">
            <h2 class="commerce-section-title">Produk</h2>
            <div class="commerce-order-items">${orderItemsDetail(order)}</div>
            <div class="commerce-summary-line total"><span>Total</span><strong>${money(order.total)}</strong></div>
          </section>
        </main>
      `,
      footer: footerActions.length
        ? `<footer class="commerce-sticky">${footerActions.join('')}</footer>`
        : ''
    });
  }

  async function updateOrderStatus(orderId, status, scope) {
    try {
      await request(`/api/commerce/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PATCH',
        body: { status }
      });
      toast('Status pesanan diperbarui.');
      window.refreshNotificationBadge?.();

      const data = await request(`/api/commerce/orders?scope=${scope}`);
      const orders = Array.isArray(data.orders) ? data.orders : [];
      if (scope === 'seller') COMMERCE.sellerOrders = orders;
      else COMMERCE.buyerOrders = orders;

      await renderOrderDetail({ orderId, scope });
    } catch (error) {
      toast(error.message || 'Status pesanan belum dapat diubah.');
    }
  }

  async function renderSellerCenter() {
    if (!requireLogin('Masuk untuk mengelola UMKM.')) return;
    if (!isSeller()) {
      await go('onboarding', { step: 1 }, { replace: true });
      return;
    }

    loadingPage('Seller Center', { nav: 'account', eyebrow: 'Kelola usaha' });

    try {
      const data = await request('/api/commerce/seller/summary');
      const summary = data.summary || {};
      const store = data.store || {};
      COMMERCE.sellerSummary = summary;
      COMMERCE.currentStore = store;

      if (typeof STATE !== 'undefined') {
        STATE.currentStore = { ...(STATE.currentStore || {}), ...store };
      }

      const logo = store.logo_url
        ? `<img src="${esc(store.logo_url)}" alt="${esc(store.name || 'UMKM')}">`
        : '<i class="ph ph-storefront" aria-hidden="true"></i>';

      mountPage({
        title: 'Seller Center',
        eyebrow: 'Kelola usaha',
        nav: 'account',
        body: `
          <main class="commerce-content">
            <section class="commerce-store-identity">
              <div class="commerce-store-logo">${logo}</div>
              <div>
                <strong>${esc(store.name || 'UMKM')}</strong>
                <small>${esc([store.district, store.city].filter(Boolean).join(', ') || 'Lubuklinggau')}</small>
              </div>
              <span class="commerce-status">${esc(store.verification_status === 'verified' ? 'Terverifikasi' : 'Diproses')}</span>
            </section>

            <section class="commerce-metrics" aria-label="Ringkasan toko">
              <div class="commerce-metric"><span>Produk aktif</span><strong>${Number(summary.product_count || 0)}</strong></div>
              <div class="commerce-metric"><span>Pesanan aktif</span><strong>${Number(summary.active_order_count || 0)}</strong></div>
              <div class="commerce-metric"><span>Menunggu konfirmasi</span><strong>${Number(summary.pending_order_count || 0)}</strong></div>
              <div class="commerce-metric"><span>Omzet selesai</span><strong>${money(summary.completed_revenue)}</strong></div>
            </section>

            <nav class="commerce-menu-list" aria-label="Menu Seller Center">
              ${sellerMenuRow('receipt', 'Pesanan Masuk', 'Kelola status dan detail pesanan', 'seller-orders')}
              ${sellerMenuRow('package', 'Produk Saya', 'Tambah, edit, dan kelola stok produk', 'products')}
              ${sellerMenuRow('storefront', 'Profil Toko', 'Informasi usaha, kontak, dan lokasi', 'store-profile')}
            </nav>
          </main>
        `
      });
    } catch (error) {
      if (error.status === 404) {
        await go('onboarding', { step: 1 }, { replace: true });
        return;
      }
      toast(error.message || 'Seller Center belum dapat dimuat.');
    }
  }

  function sellerMenuRow(icon, title, description, route) {
    return `
      <button
        type="button"
        class="commerce-menu-row"
        data-commerce-action="route"
        data-commerce-route="${esc(route)}"
      >
        <span class="commerce-menu-icon"><i class="ph ph-${esc(icon)}" aria-hidden="true"></i></span>
        <span><strong>${esc(title)}</strong><small>${esc(description)}</small></span>
        <i class="ph ph-caret-right" aria-hidden="true"></i>
      </button>
    `;
  }

  function categoryOptions(selectedId = '') {
    const categories = typeof CATEGORIES !== 'undefined' && Array.isArray(CATEGORIES)
      ? CATEGORIES
      : [];

    return `
      <option value="">Tanpa kategori</option>
      ${categories.map(category => `
        <option value="${esc(category.id)}" ${String(category.id) === String(selectedId || '') ? 'selected' : ''}>${esc(category.name)}</option>
      `).join('')}
    `;
  }

  async function loadStoreManagement() {
    const data = await request('/api/store-management');
    COMMERCE.currentStore = data.store || null;
    if (typeof STATE !== 'undefined' && data.store) {
      STATE.currentStore = { ...(STATE.currentStore || {}), ...data.store };
    }
    return data.store || {};
  }

  async function renderStoreProfile() {
    if (!requireLogin('Masuk untuk mengelola toko.')) return;
    if (!isSeller()) {
      await go('onboarding', { step: 1 }, { replace: true });
      return;
    }

    loadingPage('Profil Toko', { nav: 'account', hideNav: true, eyebrow: 'Seller Center' });

    try {
      const store = await loadStoreManagement();

      mountPage({
        title: 'Profil Toko',
        eyebrow: 'Seller Center',
        nav: 'account',
        hideNav: true,
        body: `
          <main class="commerce-content with-sticky">
            <form id="commerceStoreForm" class="commerce-form">
              <section class="commerce-section">
                <h2 class="commerce-section-title">Informasi usaha</h2>
                <div class="commerce-field">
                  <label class="commerce-label" for="commerceStoreName">Nama UMKM</label>
                  <input id="commerceStoreName" class="commerce-input" name="name" maxlength="150" value="${esc(store.name || '')}" required>
                </div>
                <div class="commerce-field">
                  <label class="commerce-label" for="commerceStoreCategory">Kategori</label>
                  <select id="commerceStoreCategory" class="commerce-select" name="category_id">${categoryOptions(store.category_id)}</select>
                </div>
                <div class="commerce-field">
                  <label class="commerce-label" for="commerceStoreDescription">Deskripsi usaha</label>
                  <textarea id="commerceStoreDescription" class="commerce-textarea" name="description" maxlength="2000" rows="4">${esc(store.description || '')}</textarea>
                </div>
              </section>

              <section class="commerce-section">
                <h2 class="commerce-section-title">Kontak</h2>
                <div class="commerce-field">
                  <label class="commerce-label">Nomor telepon</label>
                  <input class="commerce-input" name="phone" inputmode="tel" maxlength="30" value="${esc(store.phone || '')}">
                </div>
                <div class="commerce-field">
                  <label class="commerce-label">WhatsApp</label>
                  <input class="commerce-input" name="whatsapp" inputmode="tel" maxlength="30" value="${esc(store.whatsapp || '')}">
                </div>
                <div class="commerce-field">
                  <label class="commerce-label">Email UMKM</label>
                  <input class="commerce-input" name="email" type="email" maxlength="255" value="${esc(store.email || '')}">
                </div>
              </section>

              <section class="commerce-section">
                <h2 class="commerce-section-title">Lokasi</h2>
                <div class="commerce-field">
                  <label class="commerce-label">Alamat lengkap</label>
                  <textarea class="commerce-textarea" name="address" maxlength="1200" rows="4">${esc(store.address || '')}</textarea>
                </div>
                <div class="commerce-field">
                  <label class="commerce-label">Kecamatan</label>
                  <input class="commerce-input" name="district" maxlength="100" value="${esc(store.district || '')}">
                </div>
                <div class="commerce-field-row">
                  <div class="commerce-field">
                    <label class="commerce-label">Kota</label>
                    <input class="commerce-input" name="city" maxlength="100" value="${esc(store.city || STORE_DEFAULTS.city)}">
                  </div>
                  <div class="commerce-field">
                    <label class="commerce-label">Provinsi</label>
                    <input class="commerce-input" name="province" maxlength="100" value="${esc(store.province || STORE_DEFAULTS.province)}">
                  </div>
                </div>
              </section>
            </form>
          </main>
        `,
        footer: `
          <footer class="commerce-sticky">
            <div class="commerce-sticky-copy"><span>Profil toko</span><strong>Simpan perubahan</strong></div>
            <button type="submit" form="commerceStoreForm" class="commerce-primary">Simpan</button>
          </footer>
        `
      });
    } catch (error) {
      toast(error.message || 'Profil toko belum dapat dimuat.');
    }
  }

  async function submitStoreProfile(form) {
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const button = document.querySelector('[form="commerceStoreForm"]');
    if (button) {
      button.disabled = true;
      button.textContent = 'Menyimpan...';
    }

    const values = new FormData(form);

    try {
      const data = await request('/api/store-management', {
        method: 'PATCH',
        body: {
          name: values.get('name'),
          category_id: values.get('category_id') || null,
          description: values.get('description'),
          phone: values.get('phone'),
          whatsapp: values.get('whatsapp'),
          email: values.get('email'),
          address: values.get('address'),
          district: values.get('district'),
          city: values.get('city'),
          province: values.get('province')
        }
      });

      COMMERCE.currentStore = data.store || null;
      if (typeof STATE !== 'undefined' && data.store) {
        STATE.currentStore = { ...(STATE.currentStore || {}), ...data.store };
      }
      toast('Data UMKM berhasil diperbarui.');
      window.refreshRatingSummaries?.();
      window.refreshPublicProfileIdentity?.();
      await back();
    } catch (error) {
      toast(error.message || 'Data UMKM belum dapat disimpan.');
      if (button) {
        button.disabled = false;
        button.textContent = 'Simpan';
      }
    }
  }

  async function loadProducts() {
    const data = await request('/api/products/me');
    COMMERCE.products = Array.isArray(data.products) ? data.products : [];
    if (typeof STATE !== 'undefined') {
      STATE.accountProducts = COMMERCE.products;
    }
    return COMMERCE.products;
  }

  function productRows(products) {
    if (!products.length) {
      return `
        <div class="commerce-empty" style="min-height:42vh;">
          <div class="commerce-empty-icon"><i class="ph ph-package" aria-hidden="true"></i></div>
          <strong>Belum ada produk</strong>
          <p>Tambahkan produk pertama untuk mulai mengisi etalase tokomu.</p>
        </div>
      `;
    }

    return products.map(product => `
      <button
        type="button"
        class="commerce-product-row"
        data-commerce-action="product-detail"
        data-product-id="${esc(product.id)}"
      >
        <span class="commerce-product-thumb">
          <img src="${esc(product.image_url || product.thumbnail_url || (typeof ASSETS !== 'undefined' ? ASSETS.logo : ''))}" alt="${esc(product.name || 'Produk')}" loading="lazy" decoding="async">
        </span>
        <span>
          <strong>${esc(product.name || 'Produk')}</strong>
          <span>${money(product.price)}</span>
          <small>Stok ${Number(product.stock || 0)} ${esc(product.unit || '')}${product.is_active === false ? ' · Nonaktif' : ''}</small>
        </span>
        <i class="ph ph-caret-right" aria-hidden="true"></i>
      </button>
    `).join('');
  }

  async function renderProductsPage() {
    if (!requireLogin('Masuk untuk mengelola produk.')) return;
    if (!isSeller()) {
      toast('Fitur ini hanya tersedia untuk pemilik UMKM.');
      return;
    }

    loadingPage('Produk Saya', { nav: 'account', eyebrow: 'Seller Center' });

    try {
      const products = await loadProducts();
      COMMERCE.productSearch = '';

      mountPage({
        title: 'Produk Saya',
        eyebrow: `${products.length} produk`,
        nav: 'account',
        headerAction: `
          <button type="button" class="commerce-header-action" data-commerce-action="product-create">
            <i class="ph ph-plus" aria-hidden="true"></i><span>Tambah</span>
          </button>
        `,
        body: `
          <main class="commerce-content">
            <div class="commerce-toolbar">
              <label class="commerce-search">
                <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
                <input class="commerce-input" type="search" data-commerce-product-search placeholder="Cari produk..." aria-label="Cari produk saya">
              </label>
            </div>
            <div class="commerce-product-list" data-commerce-product-list>${productRows(products)}</div>
          </main>
        `
      });
    } catch (error) {
      toast(error.message || 'Produk belum dapat dimuat.');
    }
  }

  function filterProducts(query) {
    COMMERCE.productSearch = String(query || '').trim().toLocaleLowerCase('id-ID');
    const filtered = COMMERCE.productSearch
      ? COMMERCE.products.filter(product => [
          product.name,
          product.category_name,
          product.description
        ].filter(Boolean).join(' ').toLocaleLowerCase('id-ID').includes(COMMERCE.productSearch))
      : COMMERCE.products;

    const list = document.querySelector('[data-commerce-product-list]');
    if (list) list.innerHTML = productRows(filtered);
  }

  function findProduct(productId) {
    const owned = COMMERCE.products.find(item => String(item.id) === String(productId)) ||
      (typeof STATE !== 'undefined' && Array.isArray(STATE.accountProducts)
        ? STATE.accountProducts.find(item => String(item.id) === String(productId))
        : null);

    if (owned) return { product: owned, owned: true };

    const publicPost = typeof DATA !== 'undefined' && Array.isArray(DATA.posts)
      ? DATA.posts.find(post => String(post.product?.id || '') === String(productId))
      : null;

    return publicPost?.product
      ? { product: publicPost.product, owned: false, store: publicPost.store }
      : null;
  }

  async function renderProductDetail(productId) {
    let found = findProduct(productId);

    if (!found && isSeller()) {
      try {
        await loadProducts();
        found = findProduct(productId);
      } catch {}
    }

    if (!found) {
      toast('Produk tidak ditemukan.');
      await back();
      return;
    }

    const { product, owned, store } = found;
    const image = product.image_url || product.thumbnail_url || product.image || (typeof ASSETS !== 'undefined' ? ASSETS.logo : '');
    const category = product.category_name || product.category || '';

    const footer = owned
      ? `
          <footer class="commerce-sticky">
            <div class="commerce-detail-actions" style="width:100%;">
              <button type="button" class="commerce-secondary" data-commerce-action="delete-product" data-product-id="${esc(product.id)}">Hapus</button>
              <button type="button" class="commerce-primary" data-commerce-action="product-edit" data-product-id="${esc(product.id)}">Edit Produk</button>
            </div>
          </footer>
        `
      : `
          <footer class="commerce-sticky">
            <div class="commerce-detail-actions" style="width:100%;">
              <button type="button" class="commerce-secondary" data-commerce-action="add-cart" data-product-id="${esc(product.id)}">Keranjang</button>
              <button type="button" class="commerce-primary" data-commerce-action="buy-now" data-product-id="${esc(product.id)}">Beli Sekarang</button>
            </div>
          </footer>
        `;

    mountPage({
      title: product.name || 'Detail Produk',
      eyebrow: owned ? 'Produk Saya' : (store?.name || 'Produk UMKM'),
      nav: owned ? 'account' : 'home',
      hideNav: true,
      body: `
        <div class="commerce-detail-media">
          <img src="${esc(image)}" alt="${esc(product.name || 'Produk UMKM')}">
        </div>
        <main class="commerce-detail-body">
          ${category ? `<span class="commerce-detail-category">${esc(category)}</span>` : ''}
          <h2 class="commerce-detail-name">${esc(product.name || 'Produk UMKM')}</h2>
          <div class="commerce-detail-price">${money(product.price)}</div>
          <div class="commerce-detail-meta">Stok ${Number(product.stock || 0)} ${esc(product.unit || '')}</div>
          ${product.description ? `<p class="commerce-detail-description">${esc(product.description)}</p>` : ''}
        </main>
      `,
      footer
    });
  }

  function productFormTemplate(product = null) {
    const editing = Boolean(product?.id);
    const image = product?.image_url || product?.thumbnail_url || '';

    return `
      <main class="commerce-content with-sticky">
        <form id="commerceProductForm" class="commerce-form" data-product-id="${esc(product?.id || '')}">
          <section class="commerce-section">
            <h2 class="commerce-section-title">Foto produk</h2>
            ${editing ? `
              <div class="commerce-image-picker">
                ${image ? `<img src="${esc(image)}" alt="${esc(product.name || 'Produk')}">` : '<span>Foto produk saat ini</span>'}
              </div>
              <small class="commerce-help">Penggantian foto produk akan masuk tahap media berikutnya. Data produk tetap dapat diedit sekarang.</small>
            ` : `
              <label class="commerce-image-picker" for="commerceProductImage">
                <span id="commerceProductPreview"><i class="ph ph-image-square" aria-hidden="true"></i><span>Pilih foto produk</span></span>
              </label>
              <input id="commerceProductImage" name="image" type="file" accept="image/jpeg,image/png,image/webp" hidden required>
              <small class="commerce-help">JPG, PNG, atau WEBP. Maksimal 5 MB.</small>
            `}
          </section>

          <section class="commerce-section">
            <h2 class="commerce-section-title">Informasi produk</h2>
            <div class="commerce-field">
              <label class="commerce-label">Nama produk</label>
              <input class="commerce-input" name="name" maxlength="150" value="${esc(product?.name || '')}" required>
            </div>
            <div class="commerce-field">
              <label class="commerce-label">Kategori</label>
              <select class="commerce-select" name="category_id">${categoryOptions(product?.category_id)}</select>
            </div>
            <div class="commerce-field">
              <label class="commerce-label">Deskripsi</label>
              <textarea class="commerce-textarea" name="description" rows="5" maxlength="2000">${esc(product?.description || '')}</textarea>
            </div>
          </section>

          <section class="commerce-section">
            <h2 class="commerce-section-title">Harga & stok</h2>
            <div class="commerce-field">
              <label class="commerce-label">Harga</label>
              <input class="commerce-input" name="price" type="number" inputmode="numeric" min="0" value="${esc(String(product?.price ?? ''))}" required>
            </div>
            <div class="commerce-field-row">
              <div class="commerce-field">
                <label class="commerce-label">Stok</label>
                <input class="commerce-input" name="stock" type="number" inputmode="numeric" min="0" step="1" value="${esc(String(product?.stock ?? ''))}" required>
              </div>
              <div class="commerce-field">
                <label class="commerce-label">Satuan</label>
                <input class="commerce-input" name="unit" maxlength="40" placeholder="pcs" value="${esc(product?.unit || '')}">
              </div>
            </div>
          </section>
        </form>
      </main>
    `;
  }

  async function renderProductEditor(productId = '') {
    if (!requireLogin('Masuk untuk mengelola produk.')) return;
    if (!isSeller()) {
      toast('Fitur ini hanya tersedia untuk pemilik UMKM.');
      return;
    }

    let product = null;
    if (productId) {
      product = findProduct(productId)?.product || null;
      if (!product) {
        try {
          await loadProducts();
          product = findProduct(productId)?.product || null;
        } catch {}
      }
    }

    mountPage({
      title: product ? 'Edit Produk' : 'Tambah Produk',
      eyebrow: 'Seller Center',
      nav: 'account',
      hideNav: true,
      body: productFormTemplate(product),
      footer: `
        <footer class="commerce-sticky">
          <div class="commerce-sticky-copy">
            <span>${product ? 'Perbarui informasi' : 'Terbitkan ke etalase'}</span>
            <strong>${product ? 'Simpan perubahan' : 'Tambah produk'}</strong>
          </div>
          <button type="submit" form="commerceProductForm" class="commerce-primary">${product ? 'Simpan' : 'Terbitkan'}</button>
        </footer>
      `
    });
  }

  async function submitProduct(form) {
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const productId = form.dataset.productId || '';
    const editing = Boolean(productId);
    const values = new FormData(form);
    const button = document.querySelector('[form="commerceProductForm"]');

    const name = String(values.get('name') || '').trim();
    const price = Number(values.get('price'));
    const stock = Number(values.get('stock'));

    if (name.length < 2) {
      toast('Nama produk minimal 2 karakter.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast('Harga produk tidak valid.');
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      toast('Stok produk tidak valid.');
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = editing ? 'Menyimpan...' : 'Mengunggah...';
    }

    try {
      const payload = {
        name,
        category_id: values.get('category_id') || null,
        price,
        stock,
        unit: String(values.get('unit') || '').trim(),
        description: String(values.get('description') || '').trim()
      };

      if (!editing) {
        const imageFile = values.get('image');
        if (!(imageFile instanceof File) || imageFile.size <= 0) {
          throw new Error('Pilih foto produk terlebih dahulu.');
        }
        if (imageFile.size > 5 * 1024 * 1024) {
          throw new Error('Ukuran foto maksimal 5 MB.');
        }

        const upload = new FormData();
        upload.append('file', imageFile);
        const uploadData = await request('/api/uploads/product-image', {
          method: 'POST',
          formData: upload
        });
        payload.thumbnail_url = uploadData.image?.url || null;

        if (button) button.textContent = 'Menyimpan...';
        await request('/api/products', { method: 'POST', body: payload });
        toast('Produk berhasil ditambahkan.');
      } else {
        await request(`/api/products/${encodeURIComponent(productId)}`, {
          method: 'PATCH',
          body: payload
        });
        toast('Produk berhasil diperbarui.');
      }

      await loadProducts();
      await back();
    } catch (error) {
      toast(error.message || 'Produk belum dapat disimpan.');
      if (button) {
        button.disabled = false;
        button.textContent = editing ? 'Simpan' : 'Terbitkan';
      }
    }
  }

  function previewProductImage(input) {
    const file = input.files?.[0];
    const preview = document.getElementById('commerceProductPreview');
    if (!file || !preview) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast('Foto harus JPG, PNG, atau WEBP.');
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast('Ukuran foto maksimal 5 MB.');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      preview.innerHTML = `<img src="${reader.result}" alt="Preview foto produk">`;
    };
    reader.readAsDataURL(file);
  }

  function confirmDeleteProduct(productId) {
    const product = findProduct(productId)?.product;
    if (!product) {
      toast('Produk tidak ditemukan.');
      return;
    }

    if (typeof openBottomSheet !== 'function') {
      return;
    }

    openBottomSheet(`
      <section class="auth-shell">
        <h2 id="sheetTitle">Hapus produk?</h2>
        <p class="auth-subtitle">${esc(product.name || 'Produk')} akan dinonaktifkan dari Pasar UMKM.</p>
        <button
          type="button"
          class="btn-primary"
          data-commerce-action="delete-product-confirmed"
          data-product-id="${esc(productId)}"
        >Hapus Produk</button>
        <button type="button" class="menu-sheet-btn" data-action="close-sheet">Batal</button>
      </section>
    `, 'commerce-product-delete');
  }

  async function deleteProduct(productId) {
    try {
      await request(`/api/products/${encodeURIComponent(productId)}`, { method: 'DELETE' });
      if (typeof closeBottomSheet === 'function') closeBottomSheet();
      toast('Produk berhasil dihapus.');
      await loadProducts();
      await go('products', {}, { replace: true });
    } catch (error) {
      toast(error.message || 'Produk belum dapat dihapus.');
    }
  }

  async function addCart(productId, silent = false) {
    if (!requireLogin('Masuk untuk menambahkan produk ke keranjang.')) return false;

    try {
      const data = await request('/api/commerce/cart/items', {
        method: 'POST',
        body: { product_id: productId, quantity: 1 }
      });
      syncCart(data.cart);
      if (!silent) toast('Ditambahkan ke keranjang.');
      return true;
    } catch (error) {
      toast(error.message || 'Produk belum dapat dimasukkan ke keranjang.');
      return false;
    }
  }

  function onboardingProgress(step) {
    return `
      <div class="commerce-progress" aria-label="Langkah ${step} dari 3">
        <span class="active"></span>
        <span class="${step >= 2 ? 'active' : ''}"></span>
        <span class="${step >= 3 ? 'active' : ''}"></span>
      </div>
    `;
  }

  function draft(name, fallback = '') {
    return COMMERCE.onboardingDraft[name] ?? fallback;
  }

  function renderOnboarding(step = 1) {
    if (!requireLogin('Masuk untuk mendaftarkan UMKM.')) return;
    if (isSeller()) {
      go('seller-center', {}, { replace: true });
      return;
    }

    const safeStep = Math.min(3, Math.max(1, step));
    let fields = '';
    let footerLabel = 'Lanjut';

    if (safeStep === 1) {
      fields = `
        <section class="commerce-section">
          <h2 class="commerce-section-title">Informasi usaha</h2>
          <p class="commerce-section-subtitle">Mulai dari identitas yang akan dilihat pembeli.</p>
          <form id="commerceOnboardingForm" class="commerce-form" data-onboarding-step="1">
            <div class="commerce-field">
              <label class="commerce-label">Nama UMKM</label>
              <input class="commerce-input" name="name" minlength="3" maxlength="150" value="${esc(draft('name'))}" required>
            </div>
            <div class="commerce-field">
              <label class="commerce-label">Kategori</label>
              <select class="commerce-select" name="category_id">${categoryOptions(draft('category_id'))}</select>
            </div>
            <div class="commerce-field">
              <label class="commerce-label">Deskripsi singkat</label>
              <textarea class="commerce-textarea" name="description" maxlength="2000" rows="4">${esc(draft('description'))}</textarea>
            </div>
          </form>
        </section>
      `;
    } else if (safeStep === 2) {
      fields = `
        <section class="commerce-section">
          <h2 class="commerce-section-title">Kontak usaha</h2>
          <p class="commerce-section-subtitle">Gunakan kontak yang memang aktif untuk menerima pertanyaan pembeli.</p>
          <form id="commerceOnboardingForm" class="commerce-form" data-onboarding-step="2">
            <div class="commerce-field">
              <label class="commerce-label">Nomor telepon</label>
              <input class="commerce-input" name="phone" inputmode="tel" maxlength="30" value="${esc(draft('phone', user()?.phone || ''))}">
            </div>
            <div class="commerce-field">
              <label class="commerce-label">WhatsApp</label>
              <input class="commerce-input" name="whatsapp" inputmode="tel" maxlength="30" value="${esc(draft('whatsapp'))}">
            </div>
            <div class="commerce-field">
              <label class="commerce-label">Email UMKM</label>
              <input class="commerce-input" name="email" type="email" maxlength="255" value="${esc(draft('email', user()?.email || ''))}">
            </div>
          </form>
        </section>
      `;
    } else {
      footerLabel = 'Daftarkan UMKM';
      fields = `
        <section class="commerce-section">
          <h2 class="commerce-section-title">Lokasi & konfirmasi</h2>
          <form id="commerceOnboardingForm" class="commerce-form" data-onboarding-step="3">
            <div class="commerce-field">
              <label class="commerce-label">Alamat lengkap</label>
              <textarea class="commerce-textarea" name="address" maxlength="1200" rows="4">${esc(draft('address'))}</textarea>
            </div>
            <div class="commerce-field">
              <label class="commerce-label">Kecamatan</label>
              <input class="commerce-input" name="district" maxlength="100" value="${esc(draft('district'))}">
            </div>
            <div class="commerce-field-row">
              <div class="commerce-field">
                <label class="commerce-label">Kota</label>
                <input class="commerce-input" name="city" maxlength="100" value="${esc(draft('city', STORE_DEFAULTS.city))}">
              </div>
              <div class="commerce-field">
                <label class="commerce-label">Provinsi</label>
                <input class="commerce-input" name="province" maxlength="100" value="${esc(draft('province', STORE_DEFAULTS.province))}">
              </div>
            </div>
          </form>

          <div style="margin-top:18px;">
            <div class="commerce-review-block"><small>Nama UMKM</small><strong>${esc(draft('name', 'Belum diisi'))}</strong></div>
            <div class="commerce-review-block"><small>Kategori</small><strong>${esc(categoryName(draft('category_id')) || 'Tanpa kategori')}</strong></div>
            <div class="commerce-review-block"><small>Kontak</small><strong>${esc(draft('whatsapp') || draft('phone') || 'Belum diisi')}</strong></div>
          </div>
        </section>
      `;
    }

    mountPage({
      title: 'Daftarkan UMKM',
      eyebrow: `Langkah ${safeStep} dari 3`,
      nav: 'account',
      hideNav: true,
      body: `
        <main class="commerce-content with-sticky">
          ${onboardingProgress(safeStep)}
          ${fields}
        </main>
      `,
      footer: `
        <footer class="commerce-sticky">
          <div class="commerce-sticky-copy"><span>Langkah ${safeStep} dari 3</span><strong>${safeStep === 3 ? 'Siap diterbitkan' : 'Lengkapi data usaha'}</strong></div>
          <button type="button" class="commerce-primary" data-commerce-action="onboarding-next" data-onboarding-step="${safeStep}">${footerLabel}</button>
        </footer>
      `
    });
  }

  function categoryName(id) {
    if (!id || typeof CATEGORIES === 'undefined' || !Array.isArray(CATEGORIES)) return '';
    return CATEGORIES.find(category => String(category.id) === String(id))?.name || '';
  }

  function saveOnboardingFields(step) {
    const form = document.getElementById('commerceOnboardingForm');
    if (!form || Number(form.dataset.onboardingStep) !== Number(step)) return false;
    if (!form.checkValidity()) {
      form.reportValidity();
      return false;
    }

    const values = new FormData(form);
    for (const [key, value] of values.entries()) {
      COMMERCE.onboardingDraft[key] = typeof value === 'string' ? value.trim() : value;
    }
    return true;
  }

  async function continueOnboarding(step) {
    if (!saveOnboardingFields(step)) return;

    if (step < 3) {
      await go('onboarding', { step: step + 1 }, { replace: true });
      return;
    }

    const button = document.querySelector('[data-commerce-action="onboarding-next"]');
    if (button) {
      button.disabled = true;
      button.textContent = 'Mendaftarkan...';
    }

    try {
      const create = await request('/api/stores', {
        method: 'POST',
        body: { name: COMMERCE.onboardingDraft.name }
      });

      if (create.user && typeof STATE !== 'undefined') {
        STATE.user = create.user;
      } else if (typeof restoreAuthSession === 'function') {
        await restoreAuthSession();
      }

      const detailPayload = {
        name: COMMERCE.onboardingDraft.name,
        category_id: COMMERCE.onboardingDraft.category_id || null,
        description: COMMERCE.onboardingDraft.description || '',
        phone: COMMERCE.onboardingDraft.phone || '',
        whatsapp: COMMERCE.onboardingDraft.whatsapp || '',
        email: COMMERCE.onboardingDraft.email || '',
        address: COMMERCE.onboardingDraft.address || '',
        district: COMMERCE.onboardingDraft.district || '',
        city: COMMERCE.onboardingDraft.city || STORE_DEFAULTS.city,
        province: COMMERCE.onboardingDraft.province || STORE_DEFAULTS.province
      };

      try {
        const detail = await request('/api/store-management', {
          method: 'PATCH',
          body: detailPayload
        });
        COMMERCE.currentStore = detail.store || create.store || null;
      } catch (profileError) {
        console.warn('[Pasar UMKM] Store created, profile completion deferred:', profileError);
        COMMERCE.currentStore = create.store || null;
      }

      if (typeof STATE !== 'undefined') {
        STATE.currentStore = COMMERCE.currentStore;
      }
      if (typeof loadStores === 'function') {
        await loadStores().catch(() => {});
      }
      if (typeof renderSidebar === 'function') renderSidebar();
      if (typeof updateNavigation === 'function') updateNavigation();

      COMMERCE.onboardingDraft = {};
      toast('UMKM berhasil didaftarkan.');
      await go('seller-center', {}, { replace: true });
    } catch (error) {
      toast(error.message || 'UMKM belum berhasil didaftarkan.');
      if (button) {
        button.disabled = false;
        button.textContent = 'Daftarkan UMKM';
      }
    }
  }

  function openSellerQuickActions() {
    if (!requireLogin('Masuk untuk membuat konten atau produk.')) return;

    if (!isSeller()) {
      go('onboarding', { step: 1 });
      return;
    }

    if (typeof openBottomSheet !== 'function') {
      go('seller-center');
      return;
    }

    openBottomSheet(`
      <h2 id="sheetTitle">Buat</h2>
      <button type="button" class="menu-sheet-btn" data-action="product-create">
        <i class="ph ph-package"></i> Tambah Produk
      </button>
      <button type="button" class="menu-sheet-btn" data-action="post-create">
        <i class="ph ph-camera"></i> Buat Postingan
      </button>
      <button type="button" class="menu-sheet-btn" data-menu-action="store">
        <i class="ph ph-storefront"></i> Seller Center
      </button>
    `, 'commerce-create');
  }

  async function handleIntent(element) {
    if (!element) return;

    const nav = element.dataset.nav;
    const menu = element.dataset.menuAction;
    const action = element.dataset.action;
    const functional = element.dataset.functionAction;
    const storeAction = element.dataset.storeManageAction;

    if (nav === 'cart') {
      await go('cart');
      return;
    }

    if (nav === 'sell' || action === 'sell') {
      openSellerQuickActions();
      return;
    }

    if (menu === 'store') {
      await go('seller-center');
      return;
    }

    if (menu === 'seller-products') {
      await go('products');
      return;
    }

    if (menu === 'orders') {
      await go('buyer-orders');
      return;
    }

    if (functional === 'checkout-open') {
      await go('checkout');
      return;
    }

    if (functional === 'seller-orders-open') {
      await go('seller-orders');
      return;
    }

    if (functional === 'seller-products-open') {
      await go('products');
      return;
    }

    if (functional === 'seller-profile-edit') {
      await go('store-profile');
      return;
    }

    if (storeAction === 'edit') {
      await go('store-profile');
      return;
    }
    if (storeAction === 'orders') {
      await go('seller-orders');
      return;
    }
    if (storeAction === 'products') {
      await go('products');
      return;
    }

    if (action === 'product-create') {
      await go('product-editor');
      return;
    }

    if (action === 'product-edit') {
      await go('product-editor', { productId: element.dataset.productId || '' });
      return;
    }

    if (action === 'product-detail') {
      await go('product-detail', { productId: element.dataset.productId || '' });
      return;
    }

    if (action === 'buy-now') {
      const productId = element.dataset.productId || '';
      if (productId && await addCart(productId, true)) {
        await go('checkout');
      }
    }
  }

  async function handleCommerceClick(event) {
    const externalNav = event.target.closest('[data-nav]');
    if (COMMERCE.active && externalNav && !['cart', 'sell'].includes(externalNav.dataset.nav)) {
      leaveForNativeNavigation();
      return;
    }

    const target = event.target.closest('[data-commerce-action]');
    if (!target) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const action = target.dataset.commerceAction;

    if (action === 'back') return back();
    if (action === 'route') return go(target.dataset.commerceRoute || 'seller-center');
    if (action === 'checkout') return go('checkout');
    if (action === 'buyer-orders') return go('buyer-orders', {}, { replace: true });
    if (action === 'seller-orders') return go('seller-orders');
    if (action === 'product-create') return go('product-editor');
    if (action === 'product-edit') return go('product-editor', { productId: target.dataset.productId || '' });
    if (action === 'product-detail') return go('product-detail', { productId: target.dataset.productId || '' });
    if (action === 'delete-product') return confirmDeleteProduct(target.dataset.productId || '');
    if (action === 'delete-product-confirmed') return deleteProduct(target.dataset.productId || '');
    if (action === 'add-cart') return addCart(target.dataset.productId || '');
    if (action === 'buy-now') {
      const productId = target.dataset.productId || '';
      if (productId && await addCart(productId, true)) return go('checkout');
      return;
    }
    if (action === 'cart-minus') return updateCartQuantity(target.dataset.productId || '', Number(target.dataset.quantity || 0) - 1);
    if (action === 'cart-plus') return updateCartQuantity(target.dataset.productId || '', Number(target.dataset.quantity || 0) + 1);
    if (action === 'cart-remove') return updateCartQuantity(target.dataset.productId || '', 0);
    if (action === 'cart-clear') return clearCart();
    if (action === 'order-detail') return go('order-detail', { orderId: target.dataset.orderId || '', scope: target.dataset.orderScope || 'buyer' });
    if (action === 'order-status') return updateOrderStatus(target.dataset.orderId || '', target.dataset.orderStatus || '', target.dataset.orderScope || 'buyer');
    if (action === 'onboarding-next') return continueOnboarding(Number(target.dataset.onboardingStep || 1));
  }

  function handleInput(event) {
    if (event.target.matches('[data-commerce-product-search]')) {
      filterProducts(event.target.value);
    }
  }

  function handleChange(event) {
    if (event.target.id === 'commerceProductImage') {
      previewProductImage(event.target);
    }
  }

  function handleSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    if (form.id === 'commerceCheckoutForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      submitCheckout(form);
      return;
    }

    if (form.id === 'commerceStoreForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      submitStoreProfile(form);
      return;
    }

    if (form.id === 'commerceProductForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      submitProduct(form);
    }
  }

  function takeOwnership() {
    try {
      if (typeof openCart === 'function') openCart = () => go('cart');
      if (typeof checkout === 'function') checkout = () => go('checkout');
      if (typeof openOrders === 'function') openOrders = () => go('buyer-orders');
      if (typeof openSellerStore === 'function') openSellerStore = () => go('seller-center');
      if (typeof openSellerProducts === 'function') openSellerProducts = () => go('products');
    } catch (error) {
      console.warn('[Pasar UMKM] Commerce ownership fallback active:', error);
    }

    window.openCommerceCart = () => go('cart');
    window.openBuyerCommerceOrders = () => go('buyer-orders');
    window.openSellerCommerceOrders = () => go('seller-orders');
    window.openCommerceSellerCenter = () => go('seller-center');
  }

  document.addEventListener('click', handleCommerceClick, true);
  document.addEventListener('input', handleInput, true);
  document.addEventListener('change', handleChange, true);
  document.addEventListener('submit', handleSubmit, true);

  window.PasarCommerce = Object.freeze({
    version: '2.0',
    handleIntent,
    openCart: () => go('cart'),
    openSellerCenter: () => go('seller-center'),
    openOrders: scope => go(scope === 'seller' ? 'seller-orders' : 'buyer-orders'),
    leave: restoreOrigin
  });

  takeOwnership();
})();
