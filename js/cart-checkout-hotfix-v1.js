'use strict';

(() => {
  if (window.PasarCartCheckoutHotfix?.version === '1.0') return;

  const doc = document;
  let syncTimer = 0;

  function checkoutButton() {
    return doc.querySelector(
      '.commerce-page .commerce-sticky [data-cart-v2-checkout], ' +
      '.commerce-page .commerce-sticky [data-commerce-action="checkout"]'
    );
  }

  function sync() {
    const cartPage = doc.querySelector('.commerce-page .commerce-cart-item[data-product-id]');
    if (!cartPage) return;

    if (!doc.querySelector('.commerce-cart-v2-toolbar')) {
      try { window.PasarCartCheckoutV2?.syncCartSelectionUI?.(); } catch {}
    }

    const button = checkoutButton();
    if (!button) return;

    if (button.hasAttribute('data-commerce-action')) {
      button.removeAttribute('data-commerce-action');
    }
    button.setAttribute('data-cart-v2-checkout', 'true');
  }

  function scheduleSync() {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(sync, 40);
  }

  doc.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-cart-v2-checkout]');
    if (!button) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (window.PasarP8Commerce?.openCheckout) {
      window.PasarP8Commerce.openCheckout();
      return;
    }

    location.assign('/checkout/');
  }, true);

  const observer = new MutationObserver(scheduleSync);
  observer.observe(doc.documentElement, { childList: true, subtree: true });

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', scheduleSync, { once: true });
  } else {
    scheduleSync();
  }

  window.PasarCartCheckoutHotfix = Object.freeze({ version: '1.0', sync });
})();
