'use strict';

(() => {
  if (window.PasarCartCheckoutHotfix?.version === '1.2') return;

  const doc = document;
  const SELECTION_KEY = 'pasar_cart_selection_v2';
  const CHECKOUT_SELECTOR = '[data-cart-v2-checkout],[data-commerce-action="checkout"]';
  let syncTimer = 0;

  function ensureStyle() {
    if (doc.querySelector('link[data-cart-checkout-v2-style="true"],link[href*="cart-checkout-v2.css"]')) return;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/cart-checkout-v2.css?v=1.1';
    link.dataset.cartCheckoutV2Style = 'true';
    doc.head.appendChild(link);
  }

  function parseMoney(text) {
    const digits = String(text || '').replace(/[^0-9]/g, '');
    return Number(digits || 0);
  }

  function cartItems() {
    return [...doc.querySelectorAll('.commerce-page .commerce-cart-item[data-product-id]')]
      .map(node => ({
        node,
        id: String(node.dataset.productId || '').trim(),
        quantity: Math.max(0, Number(node.querySelector('.commerce-quantity-value')?.textContent || 0)),
        price: parseMoney(node.querySelector('.commerce-cart-price')?.textContent)
      }))
      .filter(item => item.id);
  }

  function readSelection(productIds) {
    const allowed = new Set(productIds);
    try {
      const parsed = JSON.parse(sessionStorage.getItem(SELECTION_KEY) || 'null');
      if (!Array.isArray(parsed)) return new Set(productIds);
      return new Set(parsed.map(String).filter(id => allowed.has(id)));
    } catch {
      return new Set(productIds);
    }
  }

  function writeSelection(values) {
    const clean = [...new Set((values || []).map(String).filter(Boolean))];
    sessionStorage.setItem(SELECTION_KEY, JSON.stringify(clean));
    return new Set(clean);
  }

  function ensureToolbar(page) {
    const content = page.querySelector('.commerce-content.with-sticky');
    if (!content) return null;
    let toolbar = content.querySelector('.commerce-cart-v2-toolbar');
    if (toolbar) return toolbar;

    toolbar = doc.createElement('div');
    toolbar.className = 'commerce-cart-v2-toolbar';
    toolbar.innerHTML = '<label class="commerce-cart-v2-selectall"><input class="commerce-cart-v2-check" type="checkbox" data-cart-v2-all aria-label="Pilih semua produk"><span>Pilih semua</span></label><span class="commerce-cart-v2-count" data-cart-v2-count></span>';
    content.prepend(toolbar);
    return toolbar;
  }

  function ensureStoreControl(group) {
    const head = group.querySelector('.commerce-store-head');
    if (!head) return null;
    let input = head.querySelector('[data-cart-v2-store]');
    if (!input) {
      const wrap = doc.createElement('label');
      wrap.className = 'commerce-cart-v2-store-check-wrap';
      wrap.innerHTML = '<input class="commerce-cart-v2-check" type="checkbox" data-cart-v2-store aria-label="Pilih semua produk toko ini">';
      head.prepend(wrap);
      head.classList.add('cart-v2-enhanced');
      input = wrap.querySelector('[data-cart-v2-store]');
    }
    const ids = [...group.querySelectorAll('.commerce-cart-item[data-product-id]')]
      .map(node => String(node.dataset.productId || '').trim())
      .filter(Boolean);
    input.dataset.productIds = ids.join(',');
    return input;
  }

  function ensureItemControl(item) {
    const node = item.node;
    let input = node.querySelector('[data-cart-v2-item]');
    if (!input) {
      const label = doc.createElement('label');
      label.className = 'commerce-cart-v2-item-select';
      label.innerHTML = `<input class="commerce-cart-v2-check" type="checkbox" data-cart-v2-item="${item.id}" aria-label="Pilih produk untuk checkout">`;
      node.prepend(label);
      node.classList.add('cart-v2-enhanced');
      input = label.querySelector('[data-cart-v2-item]');
    }
    return input;
  }

  function currentSelectionFromControls(productIds) {
    const controls = [...doc.querySelectorAll('.commerce-page [data-cart-v2-item]')];
    if (!controls.length) return null;
    const allowed = new Set(productIds);
    return new Set(controls
      .filter(control => control.checked)
      .map(control => String(control.dataset.cartV2Item || '').trim())
      .filter(id => id && allowed.has(id)));
  }

  function syncSelectionUI() {
    const page = doc.querySelector('.commerce-page');
    const items = cartItems();
    if (!page || !items.length) return;

    ensureStyle();
    ensureToolbar(page);

    const ids = items.map(item => item.id);
    let selected = readSelection(ids);

    for (const item of items) {
      const input = ensureItemControl(item);
      input.checked = selected.has(item.id);
      item.node.classList.toggle('is-unselected', !selected.has(item.id));
    }

    const groups = [...page.querySelectorAll('.commerce-store-group')];
    for (const group of groups) {
      const storeInput = ensureStoreControl(group);
      if (!storeInput) continue;
      const storeIds = String(storeInput.dataset.productIds || '').split(',').filter(Boolean);
      const selectedCount = storeIds.filter(id => selected.has(id)).length;
      storeInput.checked = storeIds.length > 0 && selectedCount === storeIds.length;
      storeInput.indeterminate = selectedCount > 0 && selectedCount < storeIds.length;
    }

    const all = page.querySelector('[data-cart-v2-all]');
    if (all) {
      all.checked = ids.length > 0 && selected.size === ids.length;
      all.indeterminate = selected.size > 0 && selected.size < ids.length;
    }

    const selectedItems = items.filter(item => selected.has(item.id));
    const selectedQuantity = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
    const selectedTotal = selectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const count = page.querySelector('[data-cart-v2-count]');
    if (count) count.textContent = `${selected.size} produk dipilih`;

    const sticky = page.querySelector('.commerce-sticky');
    if (sticky) {
      sticky.classList.add('cart-v2-sticky');
      const copy = sticky.querySelector('.commerce-sticky-copy');
      if (copy) {
        const html = `<span>Total ${selectedQuantity} item</span><strong>${new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(selectedTotal)}</strong>`;
        if (copy.innerHTML !== html) copy.innerHTML = html;
      }
      const button = sticky.querySelector(CHECKOUT_SELECTOR);
      if (button) {
        button.setAttribute('data-cart-v2-checkout', 'true');
        button.textContent = selected.size ? `Checkout (${selected.size})` : 'Checkout';
        button.disabled = selected.size === 0;
        button.setAttribute('aria-disabled', selected.size === 0 ? 'true' : 'false');
      }
    }

    writeSelection([...selected]);
  }

  function scheduleSync() {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(syncSelectionUI, 40);
  }

  function changeSelection(target) {
    const items = cartItems();
    const ids = items.map(item => item.id);
    if (!ids.length) return;
    let selected = readSelection(ids);

    if (target.matches('[data-cart-v2-all]')) {
      selected = target.checked ? new Set(ids) : new Set();
    } else if (target.matches('[data-cart-v2-store]')) {
      const storeIds = String(target.dataset.productIds || '').split(',').filter(Boolean);
      for (const id of storeIds) target.checked ? selected.add(id) : selected.delete(id);
    } else if (target.matches('[data-cart-v2-item]')) {
      const id = String(target.dataset.cartV2Item || '').trim();
      if (id) target.checked ? selected.add(id) : selected.delete(id);
    } else {
      return;
    }

    writeSelection([...selected]);
    syncSelectionUI();
  }

  function prepareSelection() {
    const items = cartItems();
    const ids = items.map(item => item.id);
    if (!ids.length) return [];
    const explicit = currentSelectionFromControls(ids);
    const selected = explicit === null ? readSelection(ids) : explicit;
    writeSelection([...selected]);
    return [...selected];
  }

  window.addEventListener('change', event => {
    const target = event.target?.closest?.('[data-cart-v2-item],[data-cart-v2-store],[data-cart-v2-all]');
    if (!target || !target.closest('.commerce-page')) return;
    changeSelection(target);
  }, true);

  window.addEventListener('click', event => {
    const button = event.target?.closest?.(CHECKOUT_SELECTOR);
    if (!button || !button.closest('.commerce-page .commerce-sticky')) return;

    const productIds = cartItems().map(item => item.id);
    const selected = prepareSelection();

    event.preventDefault();
    event.stopImmediatePropagation();

    if (productIds.length && !selected.length) {
      window.showToast?.('Pilih minimal satu produk untuk checkout.');
      syncSelectionUI();
      return;
    }

    location.assign('/checkout/index.html');
  }, true);

  const observer = new MutationObserver(scheduleSync);
  observer.observe(doc.documentElement, { childList: true, subtree: true });

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', scheduleSync, { once: true });
  else scheduleSync();

  window.PasarCartCheckoutHotfix = Object.freeze({ version: '1.2', sync: syncSelectionUI, prepareSelection });
})();