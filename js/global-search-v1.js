'use strict';

(() => {
  if (window.PasarGlobalSearch?.version === '1.0') return;

  const MIN_LENGTH = 2;
  const DEBOUNCE_MS = 280;
  const TIMEOUT_MS = 7000;
  let timer = 0;
  let sequence = 0;
  let controller = null;

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function money(value) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency', currency: 'IDR', maximumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  function host() { return document.getElementById('searchResults'); }

  function setClear(query) {
    const button = document.getElementById('searchClearButton');
    if (button) button.hidden = !query;
  }

  function loading(query) {
    const root = host();
    if (!root) return;
    root.innerHTML = `
      <section class="empty-state">
        <i class="ph ph-circle-notch" aria-hidden="true"></i>
        <strong class="empty-state-title">Mencari di seluruh Pasar UMKM</strong>
        <p class="empty-state-text">Mencari “${esc(query)}” di produk, UMKM, pengguna, dan kategori.</p>
      </section>`;
  }

  function errorState(message) {
    const root = host();
    if (!root) return;
    root.innerHTML = `
      <section class="empty-state">
        <i class="ph ph-warning-circle" aria-hidden="true"></i>
        <strong class="empty-state-title">Pencarian terganggu</strong>
        <p class="empty-state-text">${esc(message || 'Pencarian belum dapat dimuat.')}</p>
      </section>`;
  }

  function normalizeStore(raw) {
    return {
      id: String(raw.id || raw.store_id || ''),
      categoryId: String(raw.category_id || ''),
      category: String(raw.category_name || ''),
      name: String(raw.name || raw.store_name || ''),
      slug: String(raw.slug || raw.store_slug || ''),
      description: String(raw.description || ''),
      logo: String(raw.logo_url || raw.store_logo_url || ''),
      cover: String(raw.cover_url || ''),
      phone: '', whatsapp: '', address: '',
      district: String(raw.district || ''),
      city: String(raw.city || ''),
      province: String(raw.province || ''),
      verificationStatus: String(raw.verification_status || 'pending'),
      verifiedAt: raw.verified_at || null,
      productCount: Number(raw.product_count || 0),
      createdAt: raw.created_at || null
    };
  }

  function hydrate(data) {
    const appData = window.PasarUMKM?.getData?.();
    if (!appData) return;

    const storeMap = new Map((appData.stores || []).map(store => [String(store.id), store]));
    for (const raw of data.results?.stores || []) {
      const store = normalizeStore(raw);
      if (store.id && !storeMap.has(store.id)) {
        appData.stores.push(store);
        storeMap.set(store.id, store);
      }
    }
    for (const profile of data.results?.profiles || []) {
      const store = normalizeStore(profile);
      if (store.id && !storeMap.has(store.id)) {
        appData.stores.push(store);
        storeMap.set(store.id, store);
      }
    }

    const productIds = new Set((appData.posts || []).map(post => String(post.product?.id || '')).filter(Boolean));
    for (const product of data.results?.products || []) {
      const id = String(product.id || '');
      if (!id || productIds.has(id)) continue;
      const storeId = String(product.store_id || '');
      if (storeId && !storeMap.has(storeId)) {
        const store = normalizeStore({
          id: storeId, name: product.store_name, logo_url: product.store_logo_url,
          verification_status: product.store_verification_status
        });
        appData.stores.push(store);
        storeMap.set(storeId, store);
      }
      appData.posts.push({
        id: `product-${id}`,
        store: {
          id: storeId,
          name: product.store_name || 'UMKM Lokal',
          avatar: product.store_logo_url || 'assets/logo.webp',
          verified: product.store_verification_status === 'verified'
        },
        caption: product.description || '',
        createdAt: product.created_at || null,
        commentsCount: 0,
        product: {
          id, name: product.name || 'Produk UMKM',
          image: product.image_url || 'assets/logo.webp',
          category: product.category_name || '',
          categoryId: product.category_id || '',
          price: Number(product.price || 0),
          stock: Number(product.stock || 0),
          unit: product.unit || ''
        }
      });
      productIds.add(id);
    }
  }

  function group(title, count, body) {
    if (!body) return '';
    return `<section class="search-result-group">
      <div class="search-result-group-head"><span>${esc(title)}</span><small>${Number(count) || 0}</small></div>
      <div class="search-result-group-list">${body}</div>
    </section>`;
  }

  function render(data, query) {
    const root = host();
    if (!root) return;
    const results = data.results || {};
    const categories = Array.isArray(results.categories) ? results.categories : [];
    const products = Array.isArray(results.products) ? results.products : [];
    const stores = Array.isArray(results.stores) ? results.stores : [];
    const profiles = Array.isArray(results.profiles) ? results.profiles : [];

    hydrate(data);

    const categoryHtml = categories.map(category => `
      <button type="button" class="menu-sheet-btn" data-global-search-result="true"
        data-action="category" data-category-id="${esc(category.id)}">
        <i class="ph ph-${esc(category.icon || 'tag')}" aria-hidden="true"></i>
        <span>${esc(category.name)}</span>
      </button>`).join('');

    const productHtml = products.map(product => `
      <button type="button" class="search-product-result" data-global-search-result="true"
        data-action="product-detail" data-product-id="${esc(product.id)}">
        <div class="search-product-thumb"><img src="${esc(product.image_url || product.store_logo_url || 'assets/logo.webp')}"
          alt="${esc(product.name || 'Produk UMKM')}" loading="lazy" decoding="async"></div>
        <div class="search-product-copy">
          <strong class="search-product-name">${esc(product.name || 'Produk UMKM')}</strong>
          <span class="search-product-store">${esc(product.store_name || 'UMKM Lokal')}</span>
          <span class="search-product-price">${money(product.price)}</span>
        </div>
        <i class="ph ph-caret-right search-product-arrow" aria-hidden="true"></i>
      </button>`).join('');

    const storeHtml = stores.map(store => {
      const location = [store.district, store.city].filter(Boolean).join(', ');
      return `
        <button type="button" class="search-product-result" data-global-search-result="true"
          data-action="seller-profile" data-store-id="${esc(store.id)}">
          <div class="search-product-thumb"><img src="${esc(store.logo_url || 'assets/logo.webp')}"
            alt="${esc(store.name || 'UMKM')}" loading="lazy" decoding="async"></div>
          <div class="search-product-copy">
            <strong class="search-product-name">${esc(store.name || 'UMKM Lokal')}</strong>
            <span class="search-product-store">${esc(store.category_name || 'UMKM')}${location ? ' · ' + esc(location) : ''}</span>
            <span class="search-product-price">${Number(store.product_count || 0)} produk</span>
          </div>
          <i class="ph ph-caret-right search-product-arrow" aria-hidden="true"></i>
        </button>`;
    }).join('');

    const profileHtml = profiles.map(profile => `
      <button type="button" class="search-product-result" data-global-search-result="true"
        data-action="seller-profile" data-store-id="${esc(profile.store_id)}">
        <div class="search-product-thumb"><img src="${esc(profile.user_avatar_url || profile.store_logo_url || 'assets/logo.webp')}"
          alt="${esc(profile.user_name || 'Pengguna')}" loading="lazy" decoding="async"></div>
        <div class="search-product-copy">
          <strong class="search-product-name">${esc(profile.user_name || 'Pengguna')}</strong>
          <span class="search-product-store">${esc(profile.store_name || 'UMKM Lokal')}</span>
          <span class="search-product-price">Profil publik</span>
        </div>
        <i class="ph ph-caret-right search-product-arrow" aria-hidden="true"></i>
      </button>`).join('');

    const html = [
      group('Kategori', categories.length, categoryHtml),
      group('Produk', products.length, productHtml),
      group('UMKM', stores.length, storeHtml),
      group('Pengguna', profiles.length, profileHtml)
    ].join('');

    root.innerHTML = html || `
      <section class="empty-state">
        <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
        <strong class="empty-state-title">Tidak ditemukan</strong>
        <p class="empty-state-text">Tidak ada hasil untuk “${esc(query)}”.</p>
      </section>`;
  }

  async function requestSearch(query, requestSequence) {
    controller?.abort();
    controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=8`, {
        method: 'GET', credentials: 'include', headers: { Accept: 'application/json' },
        cache: 'no-store', signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (requestSequence !== sequence) return;
      if (!response.ok || data.ok !== true) throw new Error(data.error || 'Pencarian belum dapat dimuat.');
      render(data, query);
    } catch (error) {
      if (requestSequence !== sequence || error?.name === 'AbortError') return;
      errorState(error?.message);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function globalInput(event) {
    const query = String(event?.target?.value || '').trim();
    setClear(query);
    window.clearTimeout(timer);
    sequence += 1;
    controller?.abort();
    if (query.length < MIN_LENGTH) {
      window.renderSearchHint?.();
      return;
    }
    const requestSequence = sequence;
    loading(query);
    timer = window.setTimeout(() => requestSearch(query, requestSequence), DEBOUNCE_MS);
  }

  document.addEventListener('click', event => {
    if (!event.target?.closest?.('[data-global-search-result="true"]')) return;
    window.closeSearch?.();
  }, true);

  window.handleSearchInput = globalInput;
  window.renderSearchResults = query => globalInput({ target: { value: String(query || '') } });
  window.PasarGlobalSearch = Object.freeze({
    version: '1.0',
    search(query) {
      const value = String(query || '').trim();
      if (value.length < MIN_LENGTH) return Promise.resolve(false);
      const requestSequence = ++sequence;
      return requestSearch(value, requestSequence);
    }
  });
})();
