'use strict';

(() => {
  if (typeof STATE === 'undefined' || typeof DATA === 'undefined') return;

  const RATING = {
    products: new Map(),
    stores: new Map(),
    loading: false,
    timer: null
  };

  function esc(value) {
    return typeof escapeHTML === 'function'
      ? escapeHTML(String(value ?? ''))
      : String(value ?? '');
  }

  async function api(path, options = {}) {
    const headers = { Accept: 'application/json' };
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
      throw new Error(data.error || 'Rating belum dapat diproses.');
    }

    return data;
  }

  function ratingText(summary) {
    const average = Number(summary?.average_rating || 0);
    const count = Number(summary?.rating_count || 0);
    const rounded = Math.max(0, Math.min(5, Math.round(average)));
    const stars = '★'.repeat(rounded) + '☆'.repeat(5 - rounded);

    return count > 0
      ? `${stars} ${average.toFixed(1)} (${count})`
      : '☆☆☆☆☆ Belum ada rating';
  }

  function setTextIfChanged(node, value) {
    if (node && node.textContent !== value) {
      node.textContent = value;
    }
  }

  function collectIds() {
    const productIds = new Set();
    const storeIds = new Set();

    for (const post of DATA.posts || []) {
      if (post?.product?.id) productIds.add(String(post.product.id));
      if (post?.store?.id) storeIds.add(String(post.store.id));
    }

    if (STATE.currentStore?.id) storeIds.add(String(STATE.currentStore.id));

    document
      .querySelectorAll('[data-store-id]')
      .forEach(node => {
        const id = String(node.dataset.storeId || '').trim();
        if (id) storeIds.add(id);
      });

    return {
      productIds: [...productIds].slice(0, 100),
      storeIds: [...storeIds].slice(0, 100)
    };
  }

  async function refreshSummaries() {
    if (RATING.loading) return;

    const { productIds, storeIds } = collectIds();
    if (!productIds.length && !storeIds.length) return;

    RATING.loading = true;

    try {
      const params = new URLSearchParams();
      if (productIds.length) params.set('product_ids', productIds.join(','));
      if (storeIds.length) params.set('store_ids', storeIds.join(','));

      const data = await api(`/api/ratings/summaries?${params.toString()}`);

      RATING.products.clear();
      RATING.stores.clear();

      for (const item of data.products || []) {
        RATING.products.set(String(item.product_id), item);
      }

      for (const item of data.stores || []) {
        RATING.stores.set(String(item.store_id), item);
      }

      decorate();
    } catch (error) {
      console.error('[Pasar UMKM] Rating summary error:', error);
    } finally {
      RATING.loading = false;
    }
  }

  function productForCard(card) {
    const postId = String(card?.dataset?.postId || '');
    return (DATA.posts || []).find(item => String(item.id || '') === postId)?.product || null;
  }

  function decorateProductRatings() {
    document
      .querySelectorAll('.post-card.is-product-post')
      .forEach(card => {
        const product = productForCard(card);
        if (!product?.id) return;

        const info = card.querySelector('.ig-product-info');
        if (!info) return;

        let line = info.querySelector('.product-rating-line');

        if (!line) {
          line = document.createElement('div');
          line.className = 'product-rating-line';

          const description = info.querySelector('.ig-product-description');
          const buttons = info.querySelector('.ig-product-buttons');

          if (description) info.insertBefore(line, description);
          else if (buttons) info.insertBefore(line, buttons);
          else info.appendChild(line);
        }

        setTextIfChanged(
          line,
          ratingText(RATING.products.get(String(product.id)))
        );
      });
  }

  function insertStoreRating(container, storeId, anchorSelector) {
    if (!container || !storeId) return;

    let line = container.querySelector('.store-rating-line');

    if (!line) {
      line = document.createElement('div');
      line.className = 'store-rating-line';

      const anchor = container.querySelector(anchorSelector);
      if (anchor) container.insertBefore(line, anchor);
      else container.appendChild(line);
    }

    setTextIfChanged(
      line,
      ratingText(RATING.stores.get(String(storeId)))
    );
  }

  function decorateStoreRatings() {
    const ownBio = document.querySelector(
      '.social-account-page:not(.public-seller-profile) .social-account-bio'
    );

    if (ownBio && STATE.currentStore?.id) {
      insertStoreRating(
        ownBio,
        String(STATE.currentStore.id),
        '.social-account-description'
      );
    }

    document
      .querySelectorAll('.social-universal-profile[data-store-id]')
      .forEach(page => {
        const storeId = String(page.dataset.storeId || '').trim();
        if (!storeId) return;

        insertStoreRating(
          page.querySelector('.social-profile-copy'),
          storeId,
          '.social-profile-description'
        );
      });
  }

  function decorateCompletedOrders() {
    document
      .querySelectorAll('.product-card[data-order-id]')
      .forEach(card => {
        const badge = card.querySelector('.product-badge');
        const isCompleted = badge?.textContent?.trim() === 'Selesai';

        if (!isCompleted || card.querySelector('[data-rating-order-id]')) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'menu-sheet-btn';
        button.dataset.ratingOrderId = String(card.dataset.orderId || '');
        button.innerHTML = '<i class="ph ph-star"></i> Beri / Ubah Rating';
        card.appendChild(button);
      });
  }

  function decorate() {
    decorateProductRatings();
    decorateStoreRatings();
    decorateCompletedOrders();
  }

  function ratingSelect(name, current = '') {
    return `
      <select class="auth-input" name="${esc(name)}" required>
        <option value="">Pilih rating</option>
        ${[5,4,3,2,1].map(value => `
          <option value="${value}" ${Number(current) === value ? 'selected' : ''}>
            ${'★'.repeat(value)}${'☆'.repeat(5-value)} - ${value}
          </option>
        `).join('')}
      </select>
    `;
  }

  async function openRatingForm(orderId) {
    if (!orderId || typeof openBottomSheet !== 'function') return;

    openBottomSheet(
      '<h2 id="sheetTitle">Rating Pesanan</h2><section class="empty-state"><i class="ph ph-spinner-gap"></i><strong class="empty-state-title">Memuat...</strong></section>',
      'rating'
    );

    try {
      const data = await api(`/api/ratings/order/${encodeURIComponent(orderId)}`);

      if (!data.eligible) {
        throw new Error('Rating hanya tersedia setelah pesanan selesai.');
      }

      const productRatings = new Map(
        (data.product_ratings || []).map(item => [String(item.product_id), item])
      );

      openBottomSheet(
        `
          <section class="auth-shell">
            <h2 id="sheetTitle">Rating Pesanan</h2>
            <p class="empty-state-text">${esc(data.order?.store_name || 'UMKM')} · ${esc(data.order?.order_number || '')}</p>

            <form id="orderRatingForm" data-order-id="${esc(orderId)}">
              <div class="auth-field">
                <label>Rating Toko</label>
                ${ratingSelect('store_rating', data.store_rating?.rating)}
              </div>

              <div class="auth-field">
                <label>Ulasan Toko</label>
                <textarea class="auth-input" name="store_review" rows="2" maxlength="1200">${esc(data.store_rating?.review || '')}</textarea>
              </div>

              ${(data.products || []).map(product => {
                const existing = productRatings.get(String(product.product_id));
                return `
                  <section class="product-card" data-rating-product-id="${esc(product.product_id)}">
                    <div class="product-info">
                      <div class="product-name">${esc(product.product_name || 'Produk')}</div>
                      <div class="auth-field">
                        <label>Rating Produk</label>
                        ${ratingSelect(`product_rating_${product.product_id}`, existing?.rating)}
                      </div>
                      <div class="auth-field">
                        <label>Ulasan Produk</label>
                        <textarea class="auth-input" name="product_review_${esc(product.product_id)}" rows="2" maxlength="1200">${esc(existing?.review || '')}</textarea>
                      </div>
                    </div>
                  </section>
                `;
              }).join('')}

              <button type="submit" class="btn-primary" style="width:100%;margin-top:12px;">
                Simpan Rating
              </button>
            </form>
          </section>
        `,
        'rating'
      );
    } catch (error) {
      if (typeof showToast === 'function') showToast(error.message);
      if (typeof closeBottomSheet === 'function') closeBottomSheet();
    }
  }

  async function submitRating(form) {
    const orderId = String(form.dataset.orderId || '');
    const button = form.querySelector('button[type="submit"]');
    const data = new FormData(form);

    const products = [...form.querySelectorAll('[data-rating-product-id]')]
      .map(section => {
        const productId = String(section.dataset.ratingProductId || '');
        return {
          product_id: productId,
          rating: Number(data.get(`product_rating_${productId}`)),
          review: data.get(`product_review_${productId}`) || ''
        };
      });

    if (button) {
      button.disabled = true;
      button.textContent = 'Menyimpan...';
    }

    try {
      await api(`/api/ratings/order/${encodeURIComponent(orderId)}`, {
        method: 'POST',
        body: {
          store_rating: Number(data.get('store_rating')),
          store_review: data.get('store_review') || '',
          products
        }
      });

      if (typeof closeBottomSheet === 'function') closeBottomSheet();
      if (typeof showToast === 'function') showToast('Rating berhasil disimpan.');
      await refreshSummaries();
    } catch (error) {
      if (typeof showToast === 'function') showToast(error.message);
      if (button) {
        button.disabled = false;
        button.textContent = 'Simpan Rating';
      }
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-rating-order-id]');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    openRatingForm(button.dataset.ratingOrderId);
  }, true);

  document.addEventListener('submit', event => {
    if (event.target?.id !== 'orderRatingForm') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    submitRating(event.target);
  }, true);

  const observer = new MutationObserver(() => {
    decorate();
    clearTimeout(RATING.timer);
    RATING.timer = setTimeout(refreshSummaries, 180);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  window.refreshRatingSummaries = refreshSummaries;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(refreshSummaries, 0), { once: true });
  } else {
    setTimeout(refreshSummaries, 0);
  }
})();
