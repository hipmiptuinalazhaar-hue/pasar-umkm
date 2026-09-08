'use strict';

(() => {
  if (window.PasarCartCheckoutHotfix?.version === '1.1') return;

  const doc = document;
  const SELECTION_KEY = 'pasar_cart_selection_v2';
  const CHECKOUT_SELECTOR = '[data-cart-v2-checkout],[data-commerce-action="checkout"]';
  let syncTimer = 0;

  function cartProductIds() {
    return [...doc.querySelectorAll('.commerce-page .commerce-cart-item[data-product-id]')]
      .map(node => String(node.dataset.productId || '').trim())
      .filter(Boolean);
  }

  function selectedIdsFromControls(productIds) {
    const controls = [...doc.querySelectorAll('.commerce-page .commerce-cart-item [data-cart-v2-item]')];
    if (!controls.length) return null;
    const allowed = new Set(productIds);
    return controls
      .filter(control => control.checked)
      .map(control => String(control.dataset.cartV2Item || control.closest('.commerce-cart-item')?.dataset.productId || '').trim())
      .filter(id => id && allowed.has(id));
  }

  function prepareSelection() {
    const productIds = cartProductIds();
    if (!productIds.length) return [];

    const explicit = selectedIdsFromControls(productIds);
    const selected = explicit === null ? productIds : explicit;
    sessionStorage.setItem(SELECTION_KEY, JSON.stringify(selected));
    return selected;
  }

  function checkoutButton() {
    return doc.querySelector(`.commerce-page .commerce-sticky ${CHECKOUT_SELECTOR}`);
  }

  function sync() {
    const cartPage = doc.querySelector('.commerce-page .commerce-cart-item[data-product-id]');
    if (!cartPage) return;

    try { window.PasarCartCheckoutV2?.syncCartSelectionUI?.(); } catch {}

    const button = checkoutButton();
    if (!button) return;

    button.setAttribute('data-cart-v2-checkout', 'true');

    const controls = doc.querySelectorAll('.commerce-page .commerce-cart-item [data-cart-v2-item]');
    if (!controls.length) {
      const selected = prepareSelection();
      if (selected.length) {
        button.disabled = false;
        button.setAttribute('aria-disabled', 'false');
      }
    }
  }

  function scheduleSync() {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(sync, 40);
  }

  window.addEventListener('click', event => {
    const button = event.target?.closest?.(CHECKOUT_SELECTOR);
    if (!button || !button.closest('.commerce-page .commerce-sticky')) return;

    const productIds = cartProductIds();
    const selected = prepareSelection();

    event.preventDefault();
    event.stopImmediatePropagation();

    if (productIds.length && !selected.length) {
      window.showToast?.('Pilih minimal satu produk untuk checkout.');
      return;
    }

    location.assign('/checkout/index.html');
  }, true);

  const observer = new MutationObserver(scheduleSync);
  observer.observe(doc.documentElement, { childList: true, subtree: true });

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', scheduleSync, { once: true });
  } else {
    scheduleSync();
  }

  window.PasarCartCheckoutHotfix = Object.freeze({ version: '1.1', sync, prepareSelection });
})();