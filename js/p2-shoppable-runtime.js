'use strict';

(() => {
  if (window.PasarP2ShoppableRuntime?.version === '1.0') return;

  const doc = document;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const MAX_TAGS = 5;
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

  const state = {
    postTags: new Map(),
    products: [],
    dialog: null,
    previousFocus: null,
    previewUrl: '',
    selected: new Map(),
    placingProductId: '',
    feedRefreshes: 0,
    enhancedPosts: 0,
    publishing: false
  };

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function rupiah(value) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency', currency: 'IDR', maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  async function request(path, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    const init = {
      method: options.method || 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    const response = await fetch(path, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) {
      const error = new Error(data.error || 'Permintaan belum dapat diproses.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function backendPostId(card) {
    const raw = String(card?.dataset?.postId || '').trim();
    if (UUID.test(raw)) return raw.toLowerCase();
    const candidate = raw.startsWith('post-') ? raw.slice(5) : '';
    return UUID.test(candidate) ? candidate.toLowerCase() : '';
  }

  function openProduct(productId) {
    const id = String(productId || '').trim();
    if (!id) return;
    if (typeof window.openProductDetail === 'function') {
      window.openProductDetail(id);
      return;
    }
    const trigger = doc.createElement('button');
    trigger.type = 'button';
    trigger.hidden = true;
    trigger.dataset.action = 'product-detail';
    trigger.dataset.productId = id;
    doc.body.appendChild(trigger);
    trigger.click();
    trigger.remove();
  }

  function stockLabel(tag) {
    const stock = Number(tag?.stock || 0);
    if (stock <= 0) return 'Stok habis';
    if (stock <= 5) return `Sisa ${stock}`;
    return `${stock} tersedia`;
  }

  function railMarkup(tags) {
    return `
      <section class="p2-shoppable-rail" aria-label="Produk dalam postingan">
        <div class="p2-shoppable-rail-head">
          <span><i class="ph ph-shopping-bag-open" aria-hidden="true"></i> Produk di postingan</span>
          <strong>${tags.length}</strong>
        </div>
        <div class="p2-shoppable-track">
          ${tags.map(tag => `
            <button type="button" class="p2-shoppable-item" data-p2-product-link="${esc(tag.product_id)}" aria-label="Lihat ${esc(tag.name)}">
              <span class="p2-shoppable-thumb">
                ${tag.image_url ? `<img src="${esc(tag.image_url)}" alt="" loading="lazy" decoding="async">` : '<i class="ph ph-package" aria-hidden="true"></i>'}
              </span>
              <span class="p2-shoppable-copy">
                <strong>${esc(tag.name || 'Produk UMKM')}</strong>
                <span>${esc(rupiah(tag.price))}</span>
                <small class="${Number(tag.stock || 0) <= 0 ? 'is-soldout' : ''}">${esc(stockLabel(tag))}</small>
              </span>
              <i class="ph ph-caret-right" aria-hidden="true"></i>
            </button>
          `).join('')}
        </div>
      </section>
    `;
  }

  function hotspotMarkup(tags) {
    return tags
      .filter(tag => (
        tag.anchor_x !== null &&
        tag.anchor_x !== undefined &&
        tag.anchor_y !== null &&
        tag.anchor_y !== undefined &&
        Number.isFinite(Number(tag.anchor_x)) &&
        Number.isFinite(Number(tag.anchor_y))
      ))
      .map((tag, index) => `
        <button
          type="button"
          class="p2-product-hotspot"
          data-p2-product-link="${esc(tag.product_id)}"
          style="left:${Math.max(0, Math.min(1, Number(tag.anchor_x))) * 100}%;top:${Math.max(0, Math.min(1, Number(tag.anchor_y))) * 100}%"
          aria-label="Lihat ${esc(tag.name)}"
        >
          <span>${index + 1}</span>
        </button>
      `).join('');
  }

  function enhancePostCard(card) {
    const postId = backendPostId(card);
    if (!postId) return false;
    const tags = state.postTags.get(postId) || [];

    card.querySelector('.p2-shoppable-rail')?.remove();
    card.querySelector('.p2-hotspot-layer')?.remove();
    card.classList.remove('p2-shoppable-post');
    if (!tags.length) return false;

    const media = card.querySelector('.post-media');
    const actions = card.querySelector('.post-actions');
    if (!media) return false;

    card.classList.add('p2-shoppable-post');
    const layer = doc.createElement('div');
    layer.className = 'p2-hotspot-layer';
    layer.setAttribute('aria-label', 'Titik produk');
    layer.innerHTML = hotspotMarkup(tags);
    media.appendChild(layer);

    const holder = doc.createElement('div');
    holder.innerHTML = railMarkup(tags).trim();
    const rail = holder.firstElementChild;
    if (actions) actions.before(rail);
    else media.after(rail);

    state.enhancedPosts += 1;
    return true;
  }

  function enhanceFeed(root = doc) {
    const cards = [];
    if (root instanceof HTMLElement && root.matches('.post-card[data-post-id]')) cards.push(root);
    if (root?.querySelectorAll) cards.push(...root.querySelectorAll('.post-card[data-post-id]'));
    let changed = 0;
    for (const card of cards) if (enhancePostCard(card)) changed += 1;
    return changed;
  }

  async function refreshFeedTags() {
    try {
      const data = await request('/api/posts');
      const next = new Map();
      for (const post of Array.isArray(data.posts) ? data.posts : []) {
        const id = String(post.id || '').toLowerCase();
        if (!UUID.test(id)) continue;
        const tags = Array.isArray(post.product_tags) ? post.product_tags.slice(0, MAX_TAGS) : [];
        next.set(id, tags);
      }
      state.postTags = next;
      state.feedRefreshes += 1;
      enhanceFeed();
      return next;
    } catch (error) {
      console.warn('[Pasar UMKM] P2 shoppable feed refresh gagal:', error);
      return state.postTags;
    }
  }

  function clearPreview() {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = '';
  }

  function selectedEntries() {
    return [...state.selected.values()];
  }

  function productById(id) {
    return state.products.find(product => String(product.id) === String(id)) || null;
  }

  function renderPins() {
    const preview = state.dialog?.querySelector('[data-p2-compose-preview]');
    if (!preview) return;
    preview.querySelector('.p2-compose-pin-layer')?.remove();
    const layer = doc.createElement('div');
    layer.className = 'p2-compose-pin-layer';
    for (const [index, entry] of selectedEntries().entries()) {
      if (!Number.isFinite(entry.anchor_x) || !Number.isFinite(entry.anchor_y)) continue;
      const pin = doc.createElement('span');
      pin.className = 'p2-compose-pin';
      pin.style.left = `${entry.anchor_x * 100}%`;
      pin.style.top = `${entry.anchor_y * 100}%`;
      pin.textContent = String(index + 1);
      pin.title = entry.product.name;
      layer.appendChild(pin);
    }
    preview.appendChild(layer);
  }

  function renderSelectionState() {
    const dialog = state.dialog;
    if (!dialog) return;
    const count = state.selected.size;
    const counter = dialog.querySelector('[data-p2-compose-count]');
    if (counter) counter.textContent = `${count}/${MAX_TAGS}`;

    dialog.querySelectorAll('[data-p2-compose-product]').forEach(input => {
      const id = String(input.value || '');
      input.checked = state.selected.has(id);
      input.disabled = !input.checked && count >= MAX_TAGS;
    });

    const selectedHost = dialog.querySelector('[data-p2-compose-selected]');
    if (selectedHost) {
      const entries = selectedEntries();
      selectedHost.innerHTML = entries.length ? entries.map((entry, index) => `
        <button type="button" class="p2-compose-selected-item ${state.placingProductId === entry.product.id ? 'is-placing' : ''}" data-p2-compose-place="${esc(entry.product.id)}">
          <span>${index + 1}</span>
          <strong>${esc(entry.product.name)}</strong>
          <small>${Number.isFinite(entry.anchor_x) ? 'Titik diatur' : 'Atur titik'}</small>
        </button>
      `).join('') : '<p class="p2-compose-empty-note">Pilih produk jika postingan ingin langsung bisa dibeli.</p>';
    }

    const hint = dialog.querySelector('[data-p2-compose-pin-hint]');
    if (hint) {
      const product = productById(state.placingProductId);
      hint.textContent = product
        ? `Ketuk posisi ${product.name} pada foto.`
        : count
          ? 'Opsional: pilih produk di bawah lalu ketuk posisinya pada foto.'
          : 'Produk dapat ditandai setelah dipilih.';
    }
    renderPins();
  }

  function productListMarkup(products) {
    if (!products.length) {
      return '<div class="p2-compose-products-empty"><i class="ph ph-package" aria-hidden="true"></i><strong>Belum ada produk aktif</strong><span>Postingan tetap dapat dibuat tanpa tag produk.</span></div>';
    }
    return products.map(product => `
      <label class="p2-compose-product-row">
        <input type="checkbox" value="${esc(product.id)}" data-p2-compose-product>
        <span class="p2-compose-product-thumb">
          ${product.image_url ? `<img src="${esc(product.image_url)}" alt="" loading="lazy" decoding="async">` : '<i class="ph ph-package" aria-hidden="true"></i>'}
        </span>
        <span class="p2-compose-product-copy">
          <strong>${esc(product.name)}</strong>
          <span>${esc(rupiah(product.price))}</span>
          <small>${esc(stockLabel(product))}</small>
        </span>
        <i class="ph ph-check-circle" aria-hidden="true"></i>
      </label>
    `).join('');
  }

  function dialogMarkup(products) {
    return `
      <div class="p2-compose-backdrop" data-p2-compose-close></div>
      <section class="p2-compose-dialog" role="dialog" aria-modal="true" aria-labelledby="p2ComposeTitle">
        <header class="p2-compose-head">
          <div>
            <span class="p2-compose-eyebrow">SOCIAL COMMERCE</span>
            <h2 id="p2ComposeTitle">Buat postingan</h2>
          </div>
          <button type="button" class="p2-compose-close" data-p2-compose-close aria-label="Tutup"><i class="ph ph-x" aria-hidden="true"></i></button>
        </header>

        <form class="p2-compose-form" data-p2-compose-form novalidate>
          <label class="p2-compose-field">
            <span>Caption</span>
            <textarea name="caption" maxlength="1000" rows="4" placeholder="Ceritakan produk, promo, atau aktivitas UMKM Anda..." required></textarea>
            <small><span data-p2-caption-count>0</span>/1000</small>
          </label>

          <div class="p2-compose-media-field">
            <div class="p2-compose-preview" data-p2-compose-preview>
              <div class="p2-compose-preview-empty" data-p2-preview-empty>
                <i class="ph ph-image-square" aria-hidden="true"></i>
                <strong>Tambahkan foto</strong>
                <span>JPG, PNG, atau WEBP. Maksimal 5 MB.</span>
              </div>
              <img data-p2-preview-image alt="Pratinjau postingan" hidden>
            </div>
            <label class="p2-compose-file-button">
              <input type="file" name="image" accept="image/jpeg,image/png,image/webp" required>
              <i class="ph ph-camera" aria-hidden="true"></i>
              <span>Pilih foto</span>
            </label>
          </div>

          <section class="p2-compose-tag-section">
            <div class="p2-compose-section-head">
              <div><strong>Tag produk</strong><span>Maksimal ${MAX_TAGS} produk</span></div>
              <b data-p2-compose-count>0/${MAX_TAGS}</b>
            </div>
            <div class="p2-compose-products" data-p2-compose-products>${productListMarkup(products)}</div>
          </section>

          <section class="p2-compose-hotspot-section">
            <div class="p2-compose-section-head">
              <div><strong>Titik produk pada foto</strong><span data-p2-compose-pin-hint>Produk dapat ditandai setelah dipilih.</span></div>
            </div>
            <div class="p2-compose-selected" data-p2-compose-selected></div>
          </section>

          <p class="p2-compose-error" data-p2-compose-error role="alert" hidden></p>

          <div class="p2-compose-actions">
            <button type="button" class="p2-compose-secondary" data-p2-compose-close>Batal</button>
            <button type="submit" class="p2-compose-primary" data-p2-compose-submit>
              <span>Publikasikan</span><i class="ph ph-paper-plane-tilt" aria-hidden="true"></i>
            </button>
          </div>
        </form>
      </section>
    `;
  }

  function showComposerError(message) {
    const node = state.dialog?.querySelector('[data-p2-compose-error]');
    if (!node) return;
    node.textContent = String(message || 'Terjadi kesalahan.');
    node.hidden = false;
  }

  function closeComposer() {
    if (!state.dialog) return;
    const dialog = state.dialog;
    state.dialog = null;
    state.selected.clear();
    state.placingProductId = '';
    state.publishing = false;
    clearPreview();
    dialog.remove();
    doc.documentElement.classList.remove('p2-compose-open');
    state.previousFocus?.focus?.({ preventScroll: true });
    state.previousFocus = null;
  }

  function focusables() {
    if (!state.dialog) return [];
    return [...state.dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      .filter(node => !node.hidden && node.offsetParent !== null);
  }

  function onDialogKeydown(event) {
    if (!state.dialog) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeComposer();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && doc.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && doc.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }

  async function loadSellerProducts() {
    const data = await request('/api/products/me');
    state.products = (Array.isArray(data.products) ? data.products : [])
      .filter(product => product?.id && product?.is_active !== false)
      .slice(0, 250);
    return state.products;
  }

  async function openComposer() {
    if (state.dialog) return state.dialog;
    state.previousFocus = doc.activeElement;
    state.selected.clear();
    state.placingProductId = '';

    let products = [];
    try {
      products = await loadSellerProducts();
    } catch (error) {
      if (error.status === 401) {
        window.showToast?.('Silakan masuk untuk membuat postingan.');
        return null;
      }
      if (error.status === 403) {
        window.showToast?.(error.message || 'Hanya pemilik UMKM yang dapat membuat postingan.');
        return null;
      }
      products = [];
    }

    const root = doc.createElement('div');
    root.className = 'p2-compose-root';
    root.innerHTML = dialogMarkup(products);
    doc.body.appendChild(root);
    state.dialog = root;
    doc.documentElement.classList.add('p2-compose-open');
    root.querySelector('textarea[name="caption"]')?.focus();
    return root;
  }

  async function publish(form) {
    if (state.publishing) return;
    const caption = String(form.elements.caption?.value || '').trim();
    const file = form.elements.image?.files?.[0] || null;
    if (!caption) return showComposerError('Caption wajib diisi.');
    if (!file) return showComposerError('Foto postingan wajib dipilih.');
    if (!ALLOWED_IMAGE_TYPES.has(String(file.type || '').toLowerCase())) return showComposerError('Format foto harus JPG, PNG, atau WEBP.');
    if (file.size > MAX_IMAGE_BYTES) return showComposerError('Ukuran foto maksimal 5 MB.');

    state.publishing = true;
    const submit = form.querySelector('[data-p2-compose-submit]');
    const original = submit?.innerHTML;
    if (submit) {
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
      submit.innerHTML = '<span>Mempublikasikan...</span><i class="ph ph-spinner-gap p2-compose-spin" aria-hidden="true"></i>';
    }

    try {
      const uploadBody = new FormData();
      uploadBody.append('file', file);
      const uploadResponse = await fetch('/api/uploads/post-image', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { Accept: 'application/json' }, body: uploadBody
      });
      const upload = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok || upload.ok !== true || !upload.image?.url) {
        throw new Error(upload.error || 'Foto gagal diunggah.');
      }

      const productTags = selectedEntries().map((entry, index) => ({
        product_id: entry.product.id,
        tag_order: index,
        anchor_x: Number.isFinite(entry.anchor_x) ? entry.anchor_x : null,
        anchor_y: Number.isFinite(entry.anchor_y) ? entry.anchor_y : null
      }));

      await request('/api/posts', {
        method: 'POST',
        body: { caption, image_url: upload.image.url, product_tags: productTags }
      });

      closeComposer();
      window.showToast?.(productTags.length ? 'Postingan shoppable berhasil dipublikasikan.' : 'Postingan berhasil dipublikasikan.');

      if (typeof window.loadInitialData === 'function' && typeof window.renderApplication === 'function') {
        await window.loadInitialData();
        window.renderApplication();
        await refreshFeedTags();
      } else {
        setTimeout(() => location.reload(), 240);
      }
    } catch (error) {
      showComposerError(error.message || 'Postingan belum dapat dipublikasikan.');
      state.publishing = false;
      if (submit) {
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
        submit.innerHTML = original || '<span>Publikasikan</span>';
      }
    }
  }

  doc.addEventListener('click', event => {
    const productLink = event.target?.closest?.('[data-p2-product-link]');
    if (productLink) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openProduct(productLink.dataset.p2ProductLink);
      return;
    }

    if (event.target?.closest?.('[data-p2-compose-close]')) {
      event.preventDefault();
      closeComposer();
      return;
    }

    const place = event.target?.closest?.('[data-p2-compose-place]');
    if (place && state.dialog) {
      event.preventDefault();
      const id = String(place.dataset.p2ComposePlace || '');
      state.placingProductId = state.placingProductId === id ? '' : id;
      renderSelectionState();
      return;
    }

    const preview = event.target?.closest?.('[data-p2-compose-preview]');
    if (preview && state.dialog && state.placingProductId && !event.target.closest('.p2-compose-pin')) {
      const image = preview.querySelector('[data-p2-preview-image]:not([hidden])');
      if (!image) return;
      const rect = image.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const entry = state.selected.get(state.placingProductId);
      if (!entry) return;
      entry.anchor_x = Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * 10_000) / 10_000;
      entry.anchor_y = Math.round(Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) * 10_000) / 10_000;
      state.placingProductId = '';
      renderSelectionState();
    }
  }, true);

  doc.addEventListener('change', event => {
    const checkbox = event.target?.closest?.('[data-p2-compose-product]');
    if (checkbox && state.dialog) {
      const id = String(checkbox.value || '');
      if (checkbox.checked) {
        if (state.selected.size >= MAX_TAGS) {
          checkbox.checked = false;
          window.showToast?.(`Maksimal ${MAX_TAGS} produk per postingan.`);
        } else {
          const product = productById(id);
          if (product) state.selected.set(id, { product, anchor_x: null, anchor_y: null });
        }
      } else {
        state.selected.delete(id);
        if (state.placingProductId === id) state.placingProductId = '';
      }
      renderSelectionState();
      return;
    }

    const input = event.target;
    if (input instanceof HTMLInputElement && input.type === 'file' && input.form?.matches('[data-p2-compose-form]')) {
      const file = input.files?.[0] || null;
      if (!file) return;
      if (!ALLOWED_IMAGE_TYPES.has(String(file.type || '').toLowerCase()) || file.size > MAX_IMAGE_BYTES) {
        input.value = '';
        showComposerError(file.size > MAX_IMAGE_BYTES ? 'Ukuran foto maksimal 5 MB.' : 'Format foto harus JPG, PNG, atau WEBP.');
        return;
      }
      clearPreview();
      state.previewUrl = URL.createObjectURL(file);
      for (const entry of state.selected.values()) { entry.anchor_x = null; entry.anchor_y = null; }
      const image = state.dialog?.querySelector('[data-p2-preview-image]');
      const empty = state.dialog?.querySelector('[data-p2-preview-empty]');
      if (image) { image.src = state.previewUrl; image.hidden = false; }
      if (empty) empty.hidden = true;
      renderSelectionState();
    }
  }, true);

  doc.addEventListener('input', event => {
    const textarea = event.target;
    if (!(textarea instanceof HTMLTextAreaElement) || !textarea.form?.matches('[data-p2-compose-form]')) return;
    const counter = state.dialog?.querySelector('[data-p2-caption-count]');
    if (counter) counter.textContent = String(textarea.value.length);
  }, true);

  doc.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-p2-compose-form]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    publish(form);
  }, true);

  doc.addEventListener('keydown', onDialogKeydown, true);

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes || []) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches?.('.post-card[data-post-id]') || node.querySelector?.('.post-card[data-post-id]')) enhanceFeed(node);
      }
    }
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true });

  refreshFeedTags();

  window.PasarP2ShoppableRuntime = Object.freeze({
    version: '1.0',
    openComposer,
    closeComposer,
    refreshFeedTags,
    enhanceFeed,
    getDiagnostics: () => Object.freeze({
      feed_refreshes: state.feedRefreshes,
      enhanced_posts: state.enhancedPosts,
      tagged_posts: state.postTags.size,
      seller_products: state.products.length
    })
  });
})();