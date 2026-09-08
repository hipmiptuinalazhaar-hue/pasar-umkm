'use strict';

/* Pasar UMKM P5 - Trust & Conversion Intelligence.
   This layer renders observable marketplace evidence. It never invents a trust score
   and never promises guarantees that are not enforced by the transaction system. */
(() => {
  if (window.PasarP5Trust?.version === '1.0') return;

  const doc = document;
  const MAX_IDS = 100;
  const REFRESH_TTL = 30_000;
  const TRUST = {
    products: new Map(),
    stores: new Map(),
    methodology: null,
    loading: false,
    timer: 0,
    cacheKey: '',
    fetchedAt: 0,
    lastProductId: ''
  };

  function ensureStyle() {
    if (doc.querySelector('link[data-p5-trust-style="true"]')) return;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/p5-trust-conversion.css?v=1.0';
    link.dataset.p5TrustStyle = 'true';
    doc.head.appendChild(link);
  }

  function esc(value) {
    if (typeof window.escapeHTML === 'function') return window.escapeHTML(String(value ?? ''));
    const span = doc.createElement('span');
    span.textContent = String(value ?? '');
    return span.innerHTML;
  }

  function number(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function integer(value) {
    return Math.max(0, Math.trunc(number(value)));
  }

  function id(value) {
    return String(value || '').trim();
  }

  function formatCount(value) {
    return integer(value).toLocaleString('id-ID');
  }

  function formatRating(value) {
    const score = Math.max(0, Math.min(5, number(value)));
    return score.toFixed(1).replace(/\.0$/, '');
  }

  function postById(postId) {
    if (typeof DATA === 'undefined' || !Array.isArray(DATA.posts)) return null;
    return DATA.posts.find(post => id(post?.id) === id(postId)) || null;
  }

  function postByProductId(productId) {
    if (typeof DATA === 'undefined' || !Array.isArray(DATA.posts)) return null;
    return DATA.posts.find(post => id(post?.product?.id) === id(productId)) || null;
  }

  function adoptIntent(source = window.__PUMKM_P5_INTENT__) {
    if (!source || typeof source !== 'object') return;
    const direct = id(source.productId);
    if (direct) {
      TRUST.lastProductId = direct;
      return;
    }
    const post = postById(source.postId);
    if (post?.product?.id) TRUST.lastProductId = id(post.product.id);
  }

  function rememberProductIntent(target) {
    const trigger = target?.closest?.(
      '[data-action="product-detail"],[data-commerce-action="product-detail"],.post-card.is-product-post'
    );
    if (!trigger) return;
    const direct = id(trigger.dataset.productId);
    const card = trigger.matches('.post-card') ? trigger : trigger.closest('.post-card');
    const post = postById(card?.dataset?.postId);
    TRUST.lastProductId = direct || id(post?.product?.id) || TRUST.lastProductId;
  }

  function cartStoreIds() {
    if (typeof STATE === 'undefined' || !Array.isArray(STATE.cart)) return [];
    const result = new Set();
    for (const row of STATE.cart) {
      const storeId = id(row?.product?.storeId || row?.product?.store_id || row?.storeId || row?.store_id);
      if (storeId) result.add(storeId);
    }
    return [...result];
  }

  function collectIds() {
    const productIds = new Set();
    const storeIds = new Set();

    if (typeof DATA !== 'undefined' && Array.isArray(DATA.posts)) {
      for (const post of DATA.posts) {
        if (post?.product?.id) productIds.add(id(post.product.id));
        if (post?.store?.id) storeIds.add(id(post.store.id));
      }
    }

    if (typeof STATE !== 'undefined' && STATE.currentStore?.id) {
      storeIds.add(id(STATE.currentStore.id));
    }

    for (const storeId of cartStoreIds()) storeIds.add(storeId);
    if (TRUST.lastProductId) productIds.add(TRUST.lastProductId);

    doc.querySelectorAll('[data-store-id]').forEach(node => {
      const storeId = id(node.dataset.storeId);
      if (storeId) storeIds.add(storeId);
    });

    return {
      productIds: [...productIds].filter(Boolean).slice(0, MAX_IDS),
      storeIds: [...storeIds].filter(Boolean).slice(0, MAX_IDS)
    };
  }

  function requestKey(ids) {
    return `${[...ids.productIds].sort().join(',')}|${[...ids.storeIds].sort().join(',')}`;
  }

  async function fetchEvidence(ids) {
    const params = new URLSearchParams();
    if (ids.productIds.length) params.set('product_ids', ids.productIds.join(','));
    if (ids.storeIds.length) params.set('store_ids', ids.storeIds.join(','));
    const response = await fetch(`/api/ratings/summaries?${params.toString()}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) throw new Error(data.error || 'Bukti transaksi belum dapat dimuat.');
    return data;
  }

  function storeHasEvidence(summary) {
    return Boolean(
      summary?.is_verified ||
      integer(summary?.verified_rating_count) ||
      integer(summary?.completed_orders) ||
      integer(summary?.sold_count)
    );
  }

  function productHasEvidence(summary, store) {
    return Boolean(
      integer(summary?.verified_rating_count) ||
      integer(summary?.sold_count) ||
      store?.is_verified
    );
  }

  function verificationChip(summary) {
    return summary?.is_verified
      ? '<span class="p5-trust-chip is-verified"><i class="ph-fill ph-seal-check" aria-hidden="true"></i>UMKM terverifikasi</span>'
      : '';
  }

  function ratingChip(summary) {
    const count = integer(summary?.verified_rating_count);
    if (!count) return '';
    return `<span class="p5-trust-chip"><i class="ph-fill ph-star" aria-hidden="true"></i>${formatRating(summary.average_rating)}/5 <small>${formatCount(count)} rating pembelian</small></span>`;
  }

  function soldChip(summary) {
    const sold = integer(summary?.sold_count);
    return sold
      ? `<span class="p5-trust-chip"><i class="ph ph-bag-check" aria-hidden="true"></i>${formatCount(sold)} terjual</span>`
      : '';
  }

  function productForCard(card) {
    const post = postById(card?.dataset?.postId);
    return post?.product || null;
  }

  function storeForCard(card) {
    const post = postById(card?.dataset?.postId);
    return post?.store || null;
  }

  function decorateProductCards() {
    doc.querySelectorAll('.post-card.is-product-post').forEach(card => {
      const product = productForCard(card);
      const store = storeForCard(card);
      if (!product?.id) return;
      const productSummary = TRUST.products.get(id(product.id));
      const storeSummary = store?.id ? TRUST.stores.get(id(store.id)) : null;
      let line = card.querySelector('[data-p5-product-trust]');
      if (!productHasEvidence(productSummary, storeSummary)) {
        line?.remove();
        return;
      }
      if (!line) {
        line = doc.createElement('div');
        line.className = 'p5-product-trust';
        line.dataset.p5ProductTrust = 'true';
        const info = card.querySelector('.ig-product-info');
        const anchor = info?.querySelector('.ig-product-buttons');
        if (info) anchor ? info.insertBefore(line, anchor) : info.appendChild(line);
      }
      if (!line) return;
      line.innerHTML = [verificationChip(storeSummary), ratingChip(productSummary), soldChip(productSummary)]
        .filter(Boolean)
        .join('');
    });
  }

  function methodologyMarkup() {
    return `
      <details class="p5-trust-method">
        <summary>Cara indikator dihitung</summary>
        <p>Rating hanya dihitung dari pesanan yang selesai. Tingkat penyelesaian memakai pesanan terminal: selesai dibanding selesai + dibatalkan, dan baru ditampilkan setelah minimal 5 transaksi terminal.</p>
      </details>
    `;
  }

  function storePanelMarkup(summary, compact = false) {
    if (!summary) return '';
    const completed = integer(summary.completed_orders);
    const sold = integer(summary.sold_count);
    const ratingCount = integer(summary.verified_rating_count);
    const rateEligible = summary.completion_rate_eligible === true;
    const rate = rateEligible ? integer(summary.completion_rate) : null;
    const evidence = storeHasEvidence(summary);

    return `
      <section class="p5-trust-panel ${compact ? 'is-compact' : ''}" data-p5-store-panel>
        <div class="p5-trust-head">
          <span class="p5-trust-icon"><i class="ph ph-shield-check" aria-hidden="true"></i></span>
          <span><strong>Indikator kepercayaan</strong><small>${evidence ? 'Berdasarkan aktivitas nyata di Pasar UMKM' : 'Riwayat transaksi masih terbatas'}</small></span>
        </div>
        <div class="p5-trust-chips">
          ${verificationChip(summary)}
          ${ratingChip(summary)}
        </div>
        <div class="p5-trust-stats">
          <span><strong>${formatCount(completed)}</strong><small>pesanan selesai</small></span>
          <span><strong>${formatCount(sold)}</strong><small>produk terjual</small></span>
          ${rateEligible ? `<span><strong>${rate}%</strong><small>penyelesaian</small></span>` : ''}
          ${ratingCount ? `<span><strong>${formatCount(ratingCount)}</strong><small>rating terverifikasi</small></span>` : ''}
        </div>
        ${methodologyMarkup()}
      </section>
    `;
  }

  function upsertStorePanel(root, storeId) {
    if (!root || !storeId) return;
    const summary = TRUST.stores.get(id(storeId));
    let panel = root.querySelector(':scope > [data-p5-store-panel]');
    if (!summary) {
      panel?.remove();
      return;
    }
    const markup = storePanelMarkup(summary);
    if (panel) {
      const holder = doc.createElement('div');
      holder.innerHTML = markup.trim();
      panel.replaceWith(holder.firstElementChild);
    } else {
      root.insertAdjacentHTML('beforeend', markup);
    }
  }

  function decorateStoreProfiles() {
    doc.querySelectorAll('.social-universal-profile[data-store-id]').forEach(page => {
      const host = page.querySelector('.social-profile-copy');
      upsertStorePanel(host, page.dataset.storeId);
    });

    if (typeof STATE !== 'undefined' && STATE.currentStore?.id) {
      const page = doc.querySelector('.social-account-page:not(.public-seller-profile)');
      const host = page?.querySelector('.social-account-bio');
      upsertStorePanel(host, STATE.currentStore.id);
    }
  }

  function currentProductSummary() {
    adoptIntent();
    if (!TRUST.lastProductId) return null;
    const product = TRUST.products.get(TRUST.lastProductId) || null;
    if (!product) return null;
    const store = product.store_id ? TRUST.stores.get(id(product.store_id)) || null : null;
    return { product, store };
  }

  function decorateProductDetail() {
    const body = doc.querySelector('.commerce-page .commerce-detail-body');
    if (!body) return;
    const current = currentProductSummary();
    let panel = body.querySelector('[data-p5-product-detail-trust]');
    if (!current || !productHasEvidence(current.product, current.store)) {
      panel?.remove();
      return;
    }
    const chips = [verificationChip(current.store), ratingChip(current.product), soldChip(current.product)]
      .filter(Boolean)
      .join('');
    const markup = `
      <section class="p5-product-detail-trust" data-p5-product-detail-trust>
        <div class="p5-trust-head"><span class="p5-trust-icon"><i class="ph ph-shield-check" aria-hidden="true"></i></span><span><strong>Belanja dengan bukti</strong><small>Indikator berasal dari transaksi di platform</small></span></div>
        <div class="p5-trust-chips">${chips}</div>
        ${current.store ? methodologyMarkup() : ''}
      </section>
    `;
    if (panel) panel.outerHTML = markup;
    else body.insertAdjacentHTML('beforeend', markup);
  }

  function checkoutStoreSummary() {
    const storeIds = cartStoreIds();
    if (storeIds.length !== 1) return null;
    return TRUST.stores.get(storeIds[0]) || null;
  }

  function decorateCheckout() {
    const form = doc.querySelector('#commerceCheckoutForm');
    if (!form) return;
    const content = form.closest('.commerce-content') || form.parentElement;
    if (!content) return;
    let panel = content.querySelector('[data-p5-checkout-trust]');
    const storeIds = cartStoreIds();
    const single = checkoutStoreSummary();
    const verifiedCount = storeIds.reduce(
      (sum, storeId) => sum + (TRUST.stores.get(storeId)?.is_verified ? 1 : 0),
      0
    );
    const markup = single
      ? storePanelMarkup(single, true).replace('data-p5-store-panel', 'data-p5-checkout-trust')
      : `
        <section class="p5-trust-panel is-compact" data-p5-checkout-trust>
          <div class="p5-trust-head"><span class="p5-trust-icon"><i class="ph ph-shield-check" aria-hidden="true"></i></span><span><strong>Bukti sebelum checkout</strong><small>Data reputasi berasal dari transaksi yang tercatat di Pasar UMKM</small></span></div>
          <div class="p5-trust-chips">${storeIds.length ? `<span class="p5-trust-chip"><i class="ph ph-storefront" aria-hidden="true"></i>${verifiedCount}/${storeIds.length} UMKM terverifikasi</span>` : ''}</div>
          ${methodologyMarkup()}
        </section>
      `;
    if (panel) panel.outerHTML = markup;
    else content.insertAdjacentHTML('afterbegin', markup);
  }

  function decorate() {
    decorateProductCards();
    decorateStoreProfiles();
    decorateProductDetail();
    decorateCheckout();
  }

  async function refresh(force = false) {
    if (TRUST.loading) return;
    adoptIntent();
    const ids = collectIds();
    if (!ids.productIds.length && !ids.storeIds.length) {
      decorate();
      return;
    }

    const key = requestKey(ids);
    if (!force && key === TRUST.cacheKey && Date.now() - TRUST.fetchedAt < REFRESH_TTL) {
      decorate();
      return;
    }

    TRUST.loading = true;
    try {
      const data = await fetchEvidence(ids);
      TRUST.products.clear();
      TRUST.stores.clear();
      for (const item of data.products || []) TRUST.products.set(id(item.product_id), item);
      for (const item of data.stores || []) TRUST.stores.set(id(item.store_id), item);
      TRUST.methodology = data.methodology || null;
      TRUST.cacheKey = key;
      TRUST.fetchedAt = Date.now();
      decorate();

      const missingStores = [...TRUST.products.values()]
        .map(item => id(item.store_id))
        .filter(storeId => storeId && !ids.storeIds.includes(storeId));
      if (missingStores.length) {
        TRUST.cacheKey = '';
        scheduleRefresh(true);
      }

      window.dispatchEvent(new CustomEvent('pasar:p5-trust-updated', {
        detail: { evidenceVersion: data.evidence_version || 'p5-v1' }
      }));
    } catch (error) {
      console.error('[Pasar UMKM] P5 trust evidence error:', error);
    } finally {
      TRUST.loading = false;
    }
  }

  function scheduleRefresh(force = false) {
    clearTimeout(TRUST.timer);
    TRUST.timer = setTimeout(() => refresh(force), 180);
  }

  doc.addEventListener('pointerdown', event => {
    rememberProductIntent(event.target);
    if (TRUST.lastProductId) scheduleRefresh();
  }, { capture: true, passive: true });

  const observer = new MutationObserver(() => {
    decorate();
    scheduleRefresh();
  });
  observer.observe(doc.body, { childList: true, subtree: true });

  ensureStyle();
  adoptIntent();

  window.PasarP5Trust = Object.freeze({
    version: '1.0',
    refresh: () => refresh(true),
    evidence: (type, value) => type === 'store'
      ? TRUST.stores.get(id(value)) || null
      : TRUST.products.get(id(value)) || null,
    methodology: () => TRUST.methodology
  });

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', () => scheduleRefresh(true), { once: true });
  } else {
    scheduleRefresh(true);
  }
})();
