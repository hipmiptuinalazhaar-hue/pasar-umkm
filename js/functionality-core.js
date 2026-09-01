'use strict';

/* =========================================================
   PASAR UMKM - FUNCTIONALITY CORE
   Fokus fungsi: saved server-side, cart, checkout, orders,
   search universal, seller/admin management, stories, help.
   ========================================================= */

(() => {
  if (
    typeof STATE === 'undefined' ||
    typeof DATA === 'undefined'
  ) {
    console.error(
      '[Pasar UMKM] Functionality core gagal dimuat: state aplikasi tidak tersedia.'
    );
    return;
  }

  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const FUNCTIONAL = {
    savedPending: new Set(),
    savedHydratedSignature: '',
    cart: null,
    searchTimer: null,
    searchSequence: 0,
    orders: [],
    sellerOrders: [],
    storiesLoaded: false
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
    return typeof formatRupiah === 'function'
      ? formatRupiah(Number(value || 0))
      : `Rp${Number(value || 0).toLocaleString('id-ID')}`;
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

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(options.body);
    }

    const response = await fetch(path, config);
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok !== true) {
      const error = new Error(
        data.error ||
        'Permintaan belum dapat diproses.'
      );

      error.status = response.status;
      throw error;
    }

    return data;
  }

  function requireLogin(message = 'Masuk terlebih dahulu.') {
    if (STATE.user) {
      return true;
    }

    if (typeof showToast === 'function') {
      showToast(message);
    }

    if (typeof openLogin === 'function') {
      openLogin();
    }

    return false;
  }

  /* =======================================================
     SAVED / FAVORITES SERVER-SIDE
     ======================================================= */

  function findPost(postId) {
    if (typeof window.findPost === 'function') {
      return window.findPost(postId);
    }

    if (typeof findPost === 'function') {
      return findPost(postId);
    }

    return Array.isArray(DATA.posts)
      ? DATA.posts.find(item =>
          String(item.id || '') === String(postId || '')
        )
      : null;
  }

  function savedTarget(postId) {
    const post = Array.isArray(DATA.posts)
      ? DATA.posts.find(item =>
          String(item.id || '') === String(postId || '')
        )
      : null;

    if (!post) {
      return null;
    }

    if (post.product?.id) {
      const id = String(post.product.id || '').trim();

      return UUID_PATTERN.test(id)
        ? {
            post,
            postId: String(postId),
            kind: 'product',
            id
          }
        : null;
    }

    const id = String(
      post.backendId ||
      post.id ||
      ''
    )
      .replace(/^post-/, '')
      .trim();

    return UUID_PATTERN.test(id)
      ? {
          post,
          postId: String(postId),
          kind: 'post',
          id
        }
      : null;
  }

  function allSavedStateItems() {
    const seen = new Set();
    const result = [];

    for (const post of DATA.posts || []) {
      const target = savedTarget(post.id);

      if (!target) {
        continue;
      }

      const key = `${target.kind}:${target.id}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push({
        kind: target.kind,
        id: target.id,
        postId: target.postId
      });
    }

    return result;
  }

  async function hydrateSaved(options = {}) {
    if (!STATE.user) {
      return false;
    }

    const items = allSavedStateItems();

    if (!items.length) {
      return false;
    }

    const signature = items
      .map(item => `${item.kind}:${item.id}`)
      .sort()
      .join('|');

    if (
      signature === FUNCTIONAL.savedHydratedSignature &&
      options.force !== true
    ) {
      return true;
    }

    try {
      const data = await request(
        '/api/commerce/saved/state',
        {
          method: 'POST',
          body: {
            items: items.map(({ kind, id }) => ({ kind, id }))
          }
        }
      );

      const lookup = new Map(
        items.map(item => [
          `${item.kind}:${item.id}`,
          item.postId
        ])
      );

      for (const item of data.items || []) {
        const postId = lookup.get(`${item.kind}:${item.id}`);

        if (!postId) {
          continue;
        }

        if (item.saved) {
          STATE.savedPosts.add(postId);
        } else {
          STATE.savedPosts.delete(postId);
        }

        if (typeof refreshPostInteractionUI === 'function') {
          refreshPostInteractionUI(postId);
        }
      }

      FUNCTIONAL.savedHydratedSignature = signature;

      if (typeof saveLocalState === 'function') {
        saveLocalState();
      }

      return true;
    } catch (error) {
      console.error(
        '[Pasar UMKM] Saved hydration error:',
        error
      );
      return false;
    }
  }

  async function persistentToggleSave(postId) {
    const target = savedTarget(postId);

    if (!target) {
      return;
    }

    if (!requireLogin('Masuk untuk menyimpan postingan atau produk.')) {
      return;
    }

    const key = `${target.kind}:${target.id}`;

    if (FUNCTIONAL.savedPending.has(key)) {
      return;
    }

    const wasSaved = STATE.savedPosts.has(target.postId);
    const shouldSave = !wasSaved;

    FUNCTIONAL.savedPending.add(key);

    if (shouldSave) {
      STATE.savedPosts.add(target.postId);
    } else {
      STATE.savedPosts.delete(target.postId);
    }

    if (typeof refreshPostInteractionUI === 'function') {
      refreshPostInteractionUI(target.postId);
    }

    try {
      const data = await request(
        `/api/commerce/saved/${target.kind}/${encodeURIComponent(target.id)}`,
        {
          method: shouldSave
            ? 'POST'
            : 'DELETE'
        }
      );

      if (data.saved) {
        STATE.savedPosts.add(target.postId);
      } else {
        STATE.savedPosts.delete(target.postId);
      }

      if (typeof saveLocalState === 'function') {
        saveLocalState();
      }

      if (typeof refreshPostInteractionUI === 'function') {
        refreshPostInteractionUI(target.postId);
      }

      if (typeof showToast === 'function') {
        showToast(
          data.saved
            ? 'Disimpan ke favorit.'
            : 'Dihapus dari favorit.'
        );
      }
    } catch (error) {
      if (wasSaved) {
        STATE.savedPosts.add(target.postId);
      } else {
        STATE.savedPosts.delete(target.postId);
      }

      if (typeof refreshPostInteractionUI === 'function') {
        refreshPostInteractionUI(target.postId);
      }

      if (typeof showToast === 'function') {
        showToast(error.message || 'Favorit belum dapat diperbarui.');
      }
    } finally {
      FUNCTIONAL.savedPending.delete(key);
    }
  }

  if (typeof toggleSave === 'function') {
    toggleSave = function functionalityToggleSave(postId) {
      persistentToggleSave(postId);
    };
  }

  /* =======================================================
     CART SERVER-SIDE
     ======================================================= */

  function syncCartState(cart) {
    FUNCTIONAL.cart = cart || {
      items: [],
      item_count: 0,
      total: 0
    };

    STATE.cart = (cart?.items || []).map(item => ({
      productId: String(item.product_id || ''),
      quantity: Number(item.quantity || 0),
      product: {
        id: String(item.product_id || ''),
        name: item.name || 'Produk',
        description: item.description || '',
        price: Number(item.price || 0),
        stock: Number(item.stock || 0),
        unit: item.unit || '',
        image: item.image_url || ASSETS.logo,
        storeId: item.store_id || '',
        storeName: item.store_name || ''
      }
    }));

    if (typeof saveLocalState === 'function') {
      saveLocalState();
    }

    if (typeof updateCartBadge === 'function') {
      updateCartBadge();
    }
  }

  async function loadServerCart() {
    if (!STATE.user) {
      syncCartState({ items: [], item_count: 0, total: 0 });
      return FUNCTIONAL.cart;
    }

    const data = await request('/api/commerce/cart');
    syncCartState(data.cart);
    return data.cart;
  }

  async function functionalAddToCart(productId, options = {}) {
    if (!requireLogin('Masuk untuk menambahkan produk ke keranjang.')) {
      return false;
    }

    try {
      const data = await request(
        '/api/commerce/cart/items',
        {
          method: 'POST',
          body: {
            product_id: productId,
            quantity: 1
          }
        }
      );

      syncCartState(data.cart);

      if (!options.silent && typeof showToast === 'function') {
        showToast('Ditambahkan ke keranjang.');
      }

      return true;
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'Produk belum dapat dimasukkan ke keranjang.');
      }
      return false;
    }
  }

  if (typeof addToCart === 'function') {
    addToCart = function serverAddToCart(productId) {
      functionalAddToCart(productId);
    };
  }

  if (typeof buyNow === 'function') {
    buyNow = async function serverBuyNow(productId) {
      const added = await functionalAddToCart(
        productId,
        { silent: true }
      );

      if (added) {
        await openFunctionalCart();
      }
    };
  }

  function cartItemTemplate(item) {
    return `
      <section class="product-card" data-commerce-cart-item="${esc(item.product_id)}">
        <img
          src="${esc(item.image_url || ASSETS.logo)}"
          alt="${esc(item.name || 'Produk')}"
          class="product-img"
        >

        <div class="product-info">
          <div class="product-name">${esc(item.name || 'Produk')}</div>
          <div class="product-price">${money(item.price)}</div>
          <div class="product-meta">
            ${esc(item.store_name || '')} · Stok ${Number(item.stock || 0)}
          </div>
          <div class="product-meta">
            Jumlah: ${Number(item.quantity || 0)}
          </div>
        </div>

        <div class="product-actions">
          <button
            type="button"
            class="btn-icon"
            data-function-action="cart-minus"
            data-product-id="${esc(item.product_id)}"
            data-quantity="${Number(item.quantity || 0)}"
            aria-label="Kurangi"
          >
            <i class="ph ph-minus"></i>
          </button>

          <button
            type="button"
            class="btn-icon"
            data-function-action="cart-plus"
            data-product-id="${esc(item.product_id)}"
            data-quantity="${Number(item.quantity || 0)}"
            aria-label="Tambah"
          >
            <i class="ph ph-plus"></i>
          </button>

          <button
            type="button"
            class="btn-icon"
            data-function-action="cart-remove"
            data-product-id="${esc(item.product_id)}"
            aria-label="Hapus"
          >
            <i class="ph ph-trash"></i>
          </button>
        </div>
      </section>
    `;
  }

  async function openFunctionalCart() {
    if (!requireLogin('Masuk untuk melihat keranjang.')) {
      return;
    }

    if (typeof openBottomSheet !== 'function') {
      return;
    }

    openBottomSheet(
      `
        <h2 id="sheetTitle">Keranjang</h2>
        <section class="empty-state">
          <i class="ph ph-spinner-gap"></i>
          <strong class="empty-state-title">Memuat keranjang...</strong>
        </section>
      `,
      'cart'
    );

    try {
      const cart = await loadServerCart();

      if (!cart.items.length) {
        openBottomSheet(
          `
            <h2 id="sheetTitle">Keranjang</h2>
            <section class="empty-state">
              <i class="ph ph-shopping-cart-simple"></i>
              <strong class="empty-state-title">Keranjang masih kosong</strong>
              <p class="empty-state-text">Produk yang kamu pilih akan tersimpan di akunmu.</p>
            </section>
          `,
          'cart'
        );
        return;
      }

      openBottomSheet(
        `
          <h2 id="sheetTitle">Keranjang</h2>

          ${cart.items.map(cartItemTemplate).join('')}

          <section class="product-card">
            <div class="product-info">
              <div class="product-badge">Total</div>
              <div class="product-price">${money(cart.total)}</div>
            </div>

            <button
              type="button"
              class="btn-primary"
              data-function-action="checkout-open"
            >
              Checkout
            </button>
          </section>

          <button
            type="button"
            class="menu-sheet-btn"
            data-function-action="cart-clear"
          >
            <i class="ph ph-trash"></i>
            Kosongkan keranjang
          </button>
        `,
        'cart'
      );
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'Keranjang belum dapat dimuat.');
      }
    }
  }

  if (typeof openCart === 'function') {
    openCart = function serverOpenCart() {
      openFunctionalCart();
    };
  }

  async function setCartQuantity(productId, quantity) {
    if (quantity <= 0) {
      return removeCartItem(productId);
    }

    try {
      const data = await request(
        `/api/commerce/cart/items/${encodeURIComponent(productId)}`,
        {
          method: 'PATCH',
          body: { quantity }
        }
      );

      syncCartState(data.cart);
      await openFunctionalCart();
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'Jumlah belum dapat diperbarui.');
      }
    }
  }

  async function removeCartItem(productId) {
    try {
      const data = await request(
        `/api/commerce/cart/items/${encodeURIComponent(productId)}`,
        { method: 'DELETE' }
      );

      syncCartState(data.cart);
      await openFunctionalCart();
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'Produk belum dapat dihapus.');
      }
    }
  }

  async function clearServerCart() {
    try {
      const data = await request(
        '/api/commerce/cart',
        { method: 'DELETE' }
      );

      syncCartState(data.cart);

      if (typeof closeBottomSheet === 'function') {
        closeBottomSheet();
      }

      if (typeof showToast === 'function') {
        showToast('Keranjang dikosongkan.');
      }
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'Keranjang belum dapat dikosongkan.');
      }
    }
  }

  if (typeof changeCartQuantity === 'function') {
    changeCartQuantity = function serverChangeCartQuantity(productId, delta) {
      const item = STATE.cart.find(candidate =>
        String(candidate.productId) === String(productId)
      );

      if (!item) {
        return;
      }

      setCartQuantity(
        productId,
        Number(item.quantity || 0) + Number(delta || 0)
      );
    };
  }

  if (typeof removeFromCart === 'function') {
    removeFromCart = function serverRemoveFromCart(productId) {
      removeCartItem(productId);
    };
  }

  if (typeof clearCart === 'function') {
    clearCart = function serverClearCart() {
      clearServerCart();
    };
  }

  if (typeof calculateCartTotal === 'function') {
    calculateCartTotal = function serverCartTotal() {
      return Number(FUNCTIONAL.cart?.total || 0);
    };
  }

  /* =======================================================
     CHECKOUT + BUYER ORDERS
     ======================================================= */

  function openCheckoutForm() {
    if (!requireLogin('Masuk terlebih dahulu untuk checkout.')) {
      return;
    }

    const total = Number(FUNCTIONAL.cart?.total || calculateCartTotal?.() || 0);

    openBottomSheet(
      `
        <section class="auth-shell">
          <h2 id="sheetTitle">Checkout</h2>

          <p class="empty-state-text">
            Total pesanan: <strong>${money(total)}</strong>
          </p>

          <form id="commerceCheckoutForm" autocomplete="on">
            <div class="auth-field">
              <label for="checkoutName">Nama penerima</label>
              <input
                id="checkoutName"
                name="customer_name"
                class="auth-input"
                value="${esc(STATE.user?.name || '')}"
                required
              >
            </div>

            <div class="auth-field">
              <label for="checkoutPhone">Nomor WhatsApp / telepon</label>
              <input
                id="checkoutPhone"
                name="customer_phone"
                class="auth-input"
                inputmode="tel"
                value="${esc(STATE.user?.phone || '')}"
                required
              >
            </div>

            <div class="auth-field">
              <label for="checkoutAddress">Alamat pengantaran</label>
              <textarea
                id="checkoutAddress"
                name="delivery_address"
                class="auth-input"
                rows="3"
                required
              ></textarea>
            </div>

            <div class="auth-field">
              <label for="checkoutNotes">Catatan</label>
              <textarea
                id="checkoutNotes"
                name="notes"
                class="auth-input"
                rows="2"
              ></textarea>
            </div>

            <button
              type="submit"
              class="btn-primary"
              style="width:100%;margin-top:12px;"
            >
              Buat Pesanan
            </button>
          </form>
        </section>
      `,
      'checkout'
    );
  }

  if (typeof checkout === 'function') {
    checkout = function functionalCheckout() {
      openCheckoutForm();
    };
  }

  async function submitCheckout(form) {
    const button = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);

    if (button) {
      button.disabled = true;
      button.textContent = 'Memproses...';
    }

    try {
      const data = await request(
        '/api/commerce/checkout',
        {
          method: 'POST',
          body: {
            customer_name: formData.get('customer_name'),
            customer_phone: formData.get('customer_phone'),
            delivery_address: formData.get('delivery_address'),
            notes: formData.get('notes')
          }
        }
      );

      syncCartState({ items: [], item_count: 0, total: 0 });

      if (typeof showToast === 'function') {
        showToast(
          data.orders?.length > 1
            ? `${data.orders.length} pesanan berhasil dibuat.`
            : 'Pesanan berhasil dibuat.'
        );
      }

      await openBuyerOrders();

      if (typeof window.refreshNotificationBadge === 'function') {
        window.refreshNotificationBadge();
      }
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'Checkout belum dapat diproses.');
      }

      if (button) {
        button.disabled = false;
        button.textContent = 'Buat Pesanan';
      }
    }
  }

  const ORDER_LABELS = {
    pending: 'Menunggu konfirmasi',
    confirmed: 'Dikonfirmasi',
    processing: 'Diproses',
    ready: 'Siap',
    completed: 'Selesai',
    cancelled: 'Dibatalkan'
  };

  function orderItemsTemplate(order) {
    return (order.items || [])
      .map(item => `
        <div class="product-meta">
          ${esc(item.product_name)} × ${Number(item.quantity || 0)}
          · ${money(item.subtotal)}
        </div>
      `)
      .join('');
  }

  function buyerOrderTemplate(order) {
    const canCancel = order.status === 'pending';

    return `
      <section class="product-card" data-order-id="${esc(order.id)}">
        <div class="product-info">
          <div class="product-badge">${esc(ORDER_LABELS[order.status] || order.status)}</div>
          <div class="product-name">${esc(order.store_name || 'UMKM')}</div>
          <div class="product-meta">${esc(order.order_number || '')}</div>
          ${orderItemsTemplate(order)}
          <div class="product-price" style="margin-top:6px;">${money(order.total)}</div>
        </div>

        ${canCancel ? `
          <button
            type="button"
            class="menu-sheet-btn"
            data-function-action="order-status"
            data-order-id="${esc(order.id)}"
            data-order-status="cancelled"
          >
            Batalkan Pesanan
          </button>
        ` : ''}
      </section>
    `;
  }

  async function openBuyerOrders(options = {}) {
    if (!requireLogin('Masuk untuk melihat pesanan.')) {
      return;
    }

    openBottomSheet(
      `
        <h2 id="sheetTitle">Pesanan Saya</h2>
        <section class="empty-state">
          <i class="ph ph-spinner-gap"></i>
          <strong class="empty-state-title">Memuat pesanan...</strong>
        </section>
      `,
      'orders'
    );

    try {
      const data = await request('/api/commerce/orders?scope=buyer');
      FUNCTIONAL.orders = data.orders || [];

      const orders = options.orderId
        ? [
            ...FUNCTIONAL.orders.filter(order => String(order.id) === String(options.orderId)),
            ...FUNCTIONAL.orders.filter(order => String(order.id) !== String(options.orderId))
          ]
        : FUNCTIONAL.orders;

      openBottomSheet(
        `
          <h2 id="sheetTitle">Pesanan Saya</h2>
          ${
            orders.length
              ? orders.map(buyerOrderTemplate).join('')
              : `
                <section class="empty-state">
                  <i class="ph ph-receipt"></i>
                  <strong class="empty-state-title">Belum ada pesanan</strong>
                  <p class="empty-state-text">Pesanan yang dibuat akan muncul di sini.</p>
                </section>
              `
          }
        `,
        'orders'
      );
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'Pesanan belum dapat dimuat.');
      }
    }
  }

  if (typeof openOrders === 'function') {
    openOrders = function functionalOrders() {
      openBuyerOrders();
    };
  }

  async function updateOrderStatus(orderId, status, scope = 'buyer') {
    try {
      await request(
        `/api/commerce/orders/${encodeURIComponent(orderId)}/status`,
        {
          method: 'PATCH',
          body: { status }
        }
      );

      if (typeof showToast === 'function') {
        showToast('Status pesanan diperbarui.');
      }

      if (scope === 'seller') {
        await openSellerOrders();
      } else {
        await openBuyerOrders({ orderId });
      }

      if (typeof window.refreshNotificationBadge === 'function') {
        window.refreshNotificationBadge();
      }
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'Status pesanan belum dapat diubah.');
      }
    }
  }

  /* =======================================================
     SELLER MANAGEMENT
     ======================================================= */

  async function openSellerDashboard() {
    if (!requireLogin('Masuk untuk mengelola UMKM.')) {
      return;
    }

    openBottomSheet(
      `
        <h2 id="sheetTitle">Kelola Toko</h2>
        <section class="empty-state">
          <i class="ph ph-spinner-gap"></i>
          <strong class="empty-state-title">Memuat UMKM...</strong>
        </section>
      `,
      'seller-store'
    );

    try {
      const data = await request('/api/commerce/seller/summary');
      const summary = data.summary || {};
      const store = data.store || {};

      openBottomSheet(
        `
          <h2 id="sheetTitle">Kelola Toko</h2>

          <section class="product-card">
            <div class="product-info">
              <div class="product-name">${esc(store.name || 'UMKM')}</div>
              <div class="product-meta">Status: ${esc(store.verification_status || 'pending')}</div>
              <div class="product-meta">${esc([store.district, store.city].filter(Boolean).join(', '))}</div>
            </div>
          </section>

          <section class="product-card">
            <div class="product-info">
              <div class="product-meta">Produk aktif: ${Number(summary.product_count || 0)}</div>
              <div class="product-meta">Postingan: ${Number(summary.post_count || 0)}</div>
              <div class="product-meta">Pesanan aktif: ${Number(summary.active_order_count || 0)}</div>
              <div class="product-meta">Menunggu konfirmasi: ${Number(summary.pending_order_count || 0)}</div>
              <div class="product-price">Omzet selesai: ${money(summary.completed_revenue)}</div>
            </div>
          </section>

          <button type="button" class="menu-sheet-btn" data-function-action="seller-orders-open">
            <i class="ph ph-receipt"></i>
            Pesanan Masuk
          </button>

          <button type="button" class="menu-sheet-btn" data-function-action="seller-products-open">
            <i class="ph ph-package"></i>
            Produk Saya
          </button>

          <button type="button" class="menu-sheet-btn" data-function-action="seller-profile-edit">
            <i class="ph ph-pencil-simple"></i>
            Edit Profil & Kontak
          </button>
        `,
        'seller-store'
      );
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'Data UMKM belum dapat dimuat.');
      }
    }
  }

  if (typeof openSellerStore === 'function') {
    openSellerStore = function functionalSellerStore() {
      openSellerDashboard();
    };
  }

  async function openSellerProductsPage() {
    if (!requireLogin('Masuk untuk mengelola produk.')) {
      return;
    }

    try {
      const products = typeof loadCurrentAccountProducts === 'function'
        ? await loadCurrentAccountProducts()
        : [];

      STATE.accountProducts = Array.isArray(products) ? products : [];

      openBottomSheet(
        `
          <h2 id="sheetTitle">Produk Saya</h2>

          <button
            type="button"
            class="btn-primary"
            data-action="product-create"
            style="width:100%;margin-bottom:12px;"
          >
            <i class="ph ph-plus"></i>
            Tambah Produk
          </button>

          ${
            STATE.accountProducts.length
              ? STATE.accountProducts.map(product => `
                  <section class="product-card">
                    <img
                      src="${esc(product.image_url || product.thumbnail_url || ASSETS.logo)}"
                      alt="${esc(product.name || 'Produk')}"
                      class="product-img"
                    >

                    <div class="product-info">
                      <div class="product-name">${esc(product.name || 'Produk')}</div>
                      <div class="product-price">${money(product.price)}</div>
                      <div class="product-meta">Stok ${Number(product.stock || 0)} ${esc(product.unit || '')}</div>
                    </div>

                    <div class="product-actions">
                      <button
                        type="button"
                        class="btn-icon"
                        data-action="product-edit"
                        data-product-id="${esc(product.id)}"
                        aria-label="Edit produk"
                      >
                        <i class="ph ph-pencil-simple"></i>
                      </button>

                      <button
                        type="button"
                        class="btn-icon"
                        data-action="product-delete-confirm"
                        data-product-id="${esc(product.id)}"
                        aria-label="Hapus produk"
                      >
                        <i class="ph ph-trash"></i>
                      </button>
                    </div>
                  </section>
                `).join('')
              : `
                <section class="empty-state">
                  <i class="ph ph-package"></i>
                  <strong class="empty-state-title">Belum ada produk</strong>
                </section>
              `
          }
        `,
        'seller-products'
      );
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'Produk belum dapat dimuat.');
      }
    }
  }

  if (typeof openSellerProducts === 'function') {
    openSellerProducts = function functionalSellerProducts() {
      openSellerProductsPage();
    };
  }

  function sellerOrderTemplate(order) {
    let nextButtons = '';

    const button = (status, label) => `
      <button
        type="button"
        class="menu-sheet-btn"
        data-function-action="seller-order-status"
        data-order-id="${esc(order.id)}"
        data-order-status="${esc(status)}"
      >${esc(label)}</button>
    `;

    if (order.status === 'pending') {
      nextButtons = button('confirmed', 'Konfirmasi Pesanan') + button('cancelled', 'Tolak / Batalkan');
    } else if (order.status === 'confirmed') {
      nextButtons = button('processing', 'Mulai Proses') + button('cancelled', 'Batalkan');
    } else if (order.status === 'processing') {
      nextButtons = button('ready', 'Tandai Siap') + button('cancelled', 'Batalkan');
    } else if (order.status === 'ready') {
      nextButtons = button('completed', 'Selesaikan Pesanan');
    }

    return `
      <section class="product-card">
        <div class="product-info">
          <div class="product-badge">${esc(ORDER_LABELS[order.status] || order.status)}</div>
          <div class="product-name">${esc(order.buyer_name || 'Pembeli')}</div>
          <div class="product-meta">${esc(order.order_number || '')}</div>
          <div class="product-meta">${esc(order.customer_phone || '')}</div>
          <div class="product-meta">${esc(order.delivery_address || '')}</div>
          ${orderItemsTemplate(order)}
          <div class="product-price" style="margin-top:6px;">${money(order.total)}</div>
        </div>
        ${nextButtons}
      </section>
    `;
  }

  async function openSellerOrders() {
    if (!requireLogin('Masuk untuk melihat pesanan UMKM.')) {
      return;
    }

    try {
      const data = await request('/api/commerce/orders?scope=seller');
      FUNCTIONAL.sellerOrders = data.orders || [];

      openBottomSheet(
        `
          <h2 id="sheetTitle">Pesanan Masuk</h2>
          ${
            FUNCTIONAL.sellerOrders.length
              ? FUNCTIONAL.sellerOrders.map(sellerOrderTemplate).join('')
              : `
                <section class="empty-state">
                  <i class="ph ph-receipt"></i>
                  <strong class="empty-state-title">Belum ada pesanan</strong>
                </section>
              `
          }
        `,
        'seller-orders'
      );
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'Pesanan UMKM belum dapat dimuat.');
      }
    }
  }

  /* =======================================================
     ADMIN MANAGEMENT
     ======================================================= */

  async function openAdminPanel() {
    if (!requireLogin('Masuk sebagai admin untuk membuka panel.')) {
      return;
    }

    try {
      const data = await request('/api/commerce/admin/summary');
      const summary = data.summary || {};

      openBottomSheet(
        `
          <h2 id="sheetTitle">Panel Pengelola</h2>

          <section class="product-card">
            <div class="product-info">
              <div class="product-meta">Pengguna aktif: ${Number(summary.active_users || 0)}</div>
              <div class="product-meta">UMKM aktif: ${Number(summary.active_stores || 0)}</div>
              <div class="product-meta">Menunggu verifikasi: ${Number(summary.pending_stores || 0)}</div>
              <div class="product-meta">Produk aktif: ${Number(summary.active_products || 0)}</div>
              <div class="product-meta">Total pesanan: ${Number(summary.order_count || 0)}</div>
              <div class="product-price">GMV selesai: ${money(summary.completed_gmv)}</div>
            </div>
          </section>

          <h3 style="margin:14px 0 8px;">UMKM menunggu verifikasi</h3>

          ${
            (data.pending_stores || []).length
              ? data.pending_stores.map(store => `
                  <section class="product-card">
                    <div class="product-info">
                      <div class="product-name">${esc(store.name || 'UMKM')}</div>
                      <div class="product-meta">Pemilik: ${esc(store.owner_name || '')}</div>
                      <div class="product-meta">${esc([store.district, store.city].filter(Boolean).join(', '))}</div>
                    </div>

                    <button
                      type="button"
                      class="btn-primary"
                      data-function-action="admin-store-status"
                      data-store-id="${esc(store.id)}"
                      data-store-status="verified"
                    >Verifikasi</button>

                    <button
                      type="button"
                      class="menu-sheet-btn"
                      data-function-action="admin-store-status"
                      data-store-id="${esc(store.id)}"
                      data-store-status="rejected"
                    >Tolak</button>
                  </section>
                `).join('')
              : '<p class="empty-state-text">Tidak ada UMKM yang menunggu verifikasi.</p>'
          }
        `,
        'admin'
      );
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'Panel admin belum dapat dimuat.');
      }
    }
  }

  if (typeof openAdmin === 'function') {
    openAdmin = function functionalAdmin() {
      openAdminPanel();
    };
  }

  async function updateAdminStore(storeId, status) {
    try {
      await request(
        `/api/commerce/admin/stores/${encodeURIComponent(storeId)}`,
        {
          method: 'PATCH',
          body: { verification_status: status }
        }
      );

      if (typeof showToast === 'function') {
        showToast('Status UMKM diperbarui.');
      }

      await openAdminPanel();
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'Status UMKM belum dapat diperbarui.');
      }
    }
  }

  /* =======================================================
     UNIVERSAL SEARCH
     ======================================================= */

  function universalSearchResult(data, query) {
    if (!DOM.searchResults) {
      return;
    }

    const categories = (CATEGORIES || [])
      .filter(category =>
        String(category.name || '')
          .toLowerCase()
          .includes(String(query || '').toLowerCase())
      );

    const section = (title, rows) => rows.length
      ? `
          <section class="search-result-group">
            <div class="search-result-group-head">
              <span>${esc(title)}</span>
              <small>${rows.length}</small>
            </div>
            <div class="search-result-group-list">${rows.join('')}</div>
          </section>
        `
      : '';

    const categoryRows = categories.map(category => `
      <button
        type="button"
        class="menu-sheet-btn"
        data-function-action="search-category"
        data-category-id="${esc(category.id)}"
      >
        <i class="ph ph-${esc(category.icon || 'tag')}"></i>
        ${esc(category.name)}
      </button>
    `);

    const userRows = (data.users || []).map(user => `
      <button
        type="button"
        class="menu-sheet-btn"
        data-function-action="search-user"
        data-user-id="${esc(user.id)}"
      >
        <i class="ph ph-user-circle"></i>
        <span>${esc(user.name || 'Pengguna')}${user.store_name ? ` · ${esc(user.store_name)}` : ''}</span>
      </button>
    `);

    const storeRows = (data.stores || []).map(store => `
      <button
        type="button"
        class="menu-sheet-btn"
        data-function-action="search-store"
        data-store-id="${esc(store.id)}"
      >
        <i class="ph ph-storefront"></i>
        <span>${esc(store.name || 'UMKM')}</span>
      </button>
    `);

    const productRows = (data.products || []).map(product => `
      <button
        type="button"
        class="menu-sheet-btn"
        data-function-action="search-product"
        data-product-id="${esc(product.id)}"
      >
        <i class="ph ph-shopping-bag-open"></i>
        <span>${esc(product.name || 'Produk')} · ${money(product.price)}</span>
      </button>
    `);

    const postRows = (data.posts || []).map(post => `
      <button
        type="button"
        class="menu-sheet-btn"
        data-function-action="search-post"
        data-backend-post-id="${esc(post.id)}"
      >
        <i class="ph ph-image"></i>
        <span>${esc(post.store_name || 'UMKM')} · ${esc(String(post.caption || '').slice(0, 70))}</span>
      </button>
    `);

    const html = [
      section('Kategori', categoryRows),
      section('Pengguna', userRows),
      section('UMKM', storeRows),
      section('Produk', productRows),
      section('Postingan', postRows)
    ].join('');

    DOM.searchResults.innerHTML = html || `
      <section class="empty-state">
        <i class="ph ph-magnifying-glass"></i>
        <strong class="empty-state-title">Tidak ditemukan</strong>
        <p class="empty-state-text">Tidak ada hasil untuk “${esc(query)}”.</p>
      </section>
    `;
  }

  async function universalSearch(query) {
    const currentSequence = ++FUNCTIONAL.searchSequence;

    try {
      const data = await request(
        `/api/commerce/search?q=${encodeURIComponent(query)}`
      );

      if (currentSequence !== FUNCTIONAL.searchSequence) {
        return;
      }

      universalSearchResult(data, query);
    } catch (error) {
      if (currentSequence !== FUNCTIONAL.searchSequence) {
        return;
      }

      if (DOM.searchResults) {
        DOM.searchResults.innerHTML = `
          <section class="empty-state">
            <i class="ph ph-warning-circle"></i>
            <strong class="empty-state-title">Pencarian gagal</strong>
            <p class="empty-state-text">${esc(error.message || 'Coba lagi.')}</p>
          </section>
        `;
      }
    }
  }

  function handleSearchCapture(event) {
    if (event.target?.id !== 'searchInput') {
      return;
    }

    event.stopImmediatePropagation();

    const query = String(event.target.value || '').trim();
    STATE.searchQuery = query;

    if (DOM.searchClearButton) {
      DOM.searchClearButton.hidden = query.length === 0;
    }

    clearTimeout(FUNCTIONAL.searchTimer);

    if (query.length < 2) {
      if (typeof renderSearchHint === 'function') {
        renderSearchHint();
      }
      return;
    }

    FUNCTIONAL.searchTimer = setTimeout(
      () => universalSearch(query),
      220
    );
  }

  /* =======================================================
     STORIES
     ======================================================= */

  async function loadStories() {
    try {
      const data = await request('/api/commerce/stories');

      DATA.stories = (data.stories || []).map(story => ({
        id: String(story.id || ''),
        userId: String(story.user_id || ''),
        storeId: String(story.store_id || ''),
        name: story.store_name || story.name || 'Pengguna',
        avatar: story.store_logo_url || story.avatar_url || ASSETS.logo,
        image: story.image_url || '',
        caption: story.caption || '',
        createdAt: story.created_at,
        expiresAt: story.expires_at,
        unread: true
      }));

      FUNCTIONAL.storiesLoaded = true;

      if (typeof renderStories === 'function') {
        renderStories();
      }
    } catch (error) {
      console.error('[Pasar UMKM] Stories load error:', error);
    }
  }

  if (typeof openStory === 'function') {
    openStory = function functionalOpenStory(storyId) {
      const story = (DATA.stories || []).find(item =>
        String(item.id) === String(storyId)
      );

      if (!story) {
        return;
      }

      const mine =
        STATE.user &&
        String(story.userId || '') === String(STATE.user.id || '');

      openBottomSheet(
        `
          <h2 id="sheetTitle">${esc(story.name || 'Cerita')}</h2>

          ${story.image ? `
            <img
              src="${esc(story.image)}"
              alt="Cerita ${esc(story.name || '')}"
              style="width:100%;max-height:62dvh;object-fit:contain;border-radius:14px;"
            >
          ` : ''}

          ${story.caption ? `
            <p class="empty-state-text" style="margin-top:12px;">${esc(story.caption)}</p>
          ` : ''}

          ${mine ? `
            <button
              type="button"
              class="menu-sheet-btn"
              data-function-action="story-delete"
              data-story-id="${esc(story.id)}"
            >
              <i class="ph ph-trash"></i>
              Hapus Cerita
            </button>
          ` : ''}
        `,
        'story'
      );
    };
  }

  if (typeof openAddStory === 'function') {
    openAddStory = function functionalAddStory() {
      if (!requireLogin('Masuk untuk membuat cerita.')) {
        return;
      }

      if (
        STATE.user.role !== 'seller' &&
        STATE.user.role !== 'admin'
      ) {
        if (typeof showToast === 'function') {
          showToast('Cerita saat ini tersedia untuk pemilik UMKM.');
        }
        return;
      }

      openBottomSheet(
        `
          <section class="auth-shell">
            <h2 id="sheetTitle">Buat Cerita</h2>

            <form id="commerceStoryForm">
              <div class="auth-field">
                <label for="storyFile">Foto cerita</label>
                <input
                  id="storyFile"
                  name="file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  class="auth-input"
                >
              </div>

              <div class="auth-field">
                <label for="storyCaption">Teks</label>
                <textarea
                  id="storyCaption"
                  name="caption"
                  class="auth-input"
                  rows="3"
                  maxlength="500"
                ></textarea>
              </div>

              <button type="submit" class="btn-primary" style="width:100%;margin-top:12px;">
                Publikasikan Cerita
              </button>
            </form>
          </section>
        `,
        'add-story'
      );
    };
  }

  async function submitStory(form) {
    const file = form.querySelector('[name="file"]')?.files?.[0] || null;
    const caption = String(
      form.querySelector('[name="caption"]')?.value || ''
    ).trim();
    const button = form.querySelector('button[type="submit"]');

    if (!file && !caption) {
      if (typeof showToast === 'function') {
        showToast('Pilih foto atau tulis cerita.');
      }
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = 'Mengunggah...';
    }

    try {
      let imageUrl = '';

      if (file) {
        const uploadBody = new FormData();
        uploadBody.append('file', file);

        const response = await fetch(
          '/api/uploads/post-image',
          {
            method: 'POST',
            credentials: 'include',
            body: uploadBody
          }
        );

        const upload = await response.json().catch(() => ({}));

        if (!response.ok || upload.ok !== true || !upload.image?.url) {
          throw new Error(upload.error || 'Foto cerita gagal diunggah.');
        }

        imageUrl = upload.image.url;
      }

      await request(
        '/api/commerce/stories',
        {
          method: 'POST',
          body: {
            image_url: imageUrl,
            caption
          }
        }
      );

      if (typeof closeBottomSheet === 'function') {
        closeBottomSheet();
      }

      await loadStories();

      if (typeof showToast === 'function') {
        showToast('Cerita dipublikasikan selama 24 jam.');
      }
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'Cerita belum dapat dibuat.');
      }

      if (button) {
        button.disabled = false;
        button.textContent = 'Publikasikan Cerita';
      }
    }
  }

  async function deleteStory(storyId) {
    try {
      await request(
        `/api/commerce/stories/${encodeURIComponent(storyId)}`,
        { method: 'DELETE' }
      );

      if (typeof closeBottomSheet === 'function') {
        closeBottomSheet();
      }

      await loadStories();

      if (typeof showToast === 'function') {
        showToast('Cerita dihapus.');
      }
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'Cerita belum dapat dihapus.');
      }
    }
  }

  /* =======================================================
     HELP
     ======================================================= */

  function showHelpTopic(title, icon, text) {
    openBottomSheet(
      `
        <h2 id="sheetTitle">${esc(title)}</h2>
        <section class="empty-state">
          <i class="ph ph-${esc(icon)}"></i>
          <p class="empty-state-text">${esc(text)}</p>
        </section>
      `,
      'help-topic'
    );
  }

  if (typeof openHelp === 'function') {
    openHelp = function functionalHelp() {
      openBottomSheet(
        `
          <h2 id="sheetTitle">Pusat Bantuan</h2>

          <button type="button" class="menu-sheet-btn" data-function-action="help-shopping">
            <i class="ph ph-shopping-bag"></i> Cara berbelanja
          </button>
          <button type="button" class="menu-sheet-btn" data-function-action="help-store">
            <i class="ph ph-storefront"></i> Cara mendaftarkan UMKM
          </button>
          <button type="button" class="menu-sheet-btn" data-function-action="help-security">
            <i class="ph ph-shield-check"></i> Keamanan akun
          </button>
          <button type="button" class="menu-sheet-btn" data-function-action="help-faq">
            <i class="ph ph-question"></i> Pertanyaan umum
          </button>
        `,
        'help'
      );
    };
  }

  /* =======================================================
     EVENT ROUTER
     ======================================================= */

  document.addEventListener(
    'input',
    handleSearchCapture,
    true
  );

  document.addEventListener(
    'submit',
    event => {
      if (event.target?.id === 'commerceCheckoutForm') {
        event.preventDefault();
        event.stopImmediatePropagation();
        submitCheckout(event.target);
        return;
      }

      if (event.target?.id === 'commerceStoryForm') {
        event.preventDefault();
        event.stopImmediatePropagation();
        submitStory(event.target);
      }
    },
    true
  );

  document.addEventListener(
    'click',
    event => {
      const element = event.target.closest('[data-function-action]');

      if (!element) {
        return;
      }

      const action = element.dataset.functionAction;

      event.preventDefault();
      event.stopPropagation();

      switch (action) {
        case 'cart-plus':
          setCartQuantity(
            element.dataset.productId,
            Number(element.dataset.quantity || 0) + 1
          );
          break;

        case 'cart-minus':
          setCartQuantity(
            element.dataset.productId,
            Number(element.dataset.quantity || 0) - 1
          );
          break;

        case 'cart-remove':
          removeCartItem(element.dataset.productId);
          break;

        case 'cart-clear':
          clearServerCart();
          break;

        case 'checkout-open':
          openCheckoutForm();
          break;

        case 'order-status':
          updateOrderStatus(
            element.dataset.orderId,
            element.dataset.orderStatus,
            'buyer'
          );
          break;

        case 'seller-order-status':
          updateOrderStatus(
            element.dataset.orderId,
            element.dataset.orderStatus,
            'seller'
          );
          break;

        case 'seller-orders-open':
          openSellerOrders();
          break;

        case 'seller-products-open':
          openSellerProductsPage();
          break;

        case 'seller-profile-edit':
          if (typeof openAccountEditInfo === 'function') {
            openAccountEditInfo();
          }
          break;

        case 'admin-store-status':
          updateAdminStore(
            element.dataset.storeId,
            element.dataset.storeStatus
          );
          break;

        case 'search-category':
          if (typeof closeSearch === 'function') closeSearch();
          if (typeof openCategory === 'function') {
            openCategory(element.dataset.categoryId);
          }
          break;

        case 'search-user':
          if (typeof closeSearch === 'function') closeSearch();
          window.openUserProfile?.(element.dataset.userId);
          break;

        case 'search-store':
          if (typeof closeSearch === 'function') closeSearch();
          if (typeof openSellerProfile === 'function') {
            openSellerProfile(element.dataset.storeId);
          }
          break;

        case 'search-product':
          if (typeof closeSearch === 'function') closeSearch();
          if (typeof openProductDetail === 'function') {
            openProductDetail(element.dataset.productId);
          }
          break;

        case 'search-post': {
          if (typeof closeSearch === 'function') closeSearch();
          const backendId = element.dataset.backendPostId;
          const post = (DATA.posts || []).find(item =>
            String(item.backendId || '') === String(backendId) ||
            String(item.id || '') === `post-${backendId}`
          );

          if (typeof navigate === 'function') {
            navigate('home');
          }

          if (post && typeof scrollToPost === 'function') {
            setTimeout(() => scrollToPost(post.id), 60);
          } else if (typeof showToast === 'function') {
            showToast('Postingan belum tersedia di feed saat ini.');
          }
          break;
        }

        case 'story-delete':
          deleteStory(element.dataset.storyId);
          break;

        case 'help-shopping':
          showHelpTopic(
            'Cara berbelanja',
            'shopping-bag',
            'Cari produk, buka detail, tambahkan ke keranjang, lalu checkout. Pesanan dapat dipantau dari menu Pesanan Saya.'
          );
          break;

        case 'help-store':
          showHelpTopic(
            'Cara mendaftarkan UMKM',
            'storefront',
            'Masuk ke akun, pilih Mulai Jual, lengkapi data UMKM, lalu tambahkan produk dan postingan dari menu penjual.'
          );
          break;

        case 'help-security':
          showHelpTopic(
            'Keamanan akun',
            'shield-check',
            'Jangan membagikan kata sandi. Sesi akun disimpan melalui cookie aman dan tindakan penting membutuhkan autentikasi.'
          );
          break;

        case 'help-faq':
          showHelpTopic(
            'Pertanyaan umum',
            'question',
            'Gunakan pencarian untuk menemukan pengguna, UMKM, produk, dan postingan. Hubungi penjual melalui pesan atau kontak yang tersedia di profil.'
          );
          break;

        default:
          break;
      }
    },
    true
  );

  /* =======================================================
     PUBLIC HOOKS + BOOT
     ======================================================= */

  window.openCommerceOrder = function openCommerceOrder(orderId) {
    openBuyerOrders({ orderId });
  };

  window.openSellerCommerceOrders = openSellerOrders;
  window.hydratePersistentSaved = hydrateSaved;
  window.reloadCommerceCart = loadServerCart;
  window.reloadStories = loadStories;

  async function waitForReady() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (
        typeof DOM !== 'undefined' &&
        DOM.feed &&
        !STATE.loading
      ) {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await Promise.allSettled([
      STATE.user ? loadServerCart() : Promise.resolve(),
      STATE.user ? hydrateSaved({ force: true }) : Promise.resolve(),
      loadStories()
    ]);
  }

  document.addEventListener(
    'visibilitychange',
    () => {
      if (!document.hidden) {
        if (STATE.user) {
          loadServerCart().catch(() => null);
          hydrateSaved({ force: true }).catch(() => null);
        }
        loadStories().catch(() => null);
      }
    }
  );

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => setTimeout(waitForReady, 0),
      { once: true }
    );
  } else {
    setTimeout(waitForReady, 0);
  }
})();
