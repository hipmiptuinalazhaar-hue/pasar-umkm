'use strict';

(() => {
  if (window.PasarUIConsistency?.version === '1.0') return;

  const doc = document;
  let syncingMenu = false;
  let homeRefreshPending = false;

  const menuButton = (action, icon, label) => `
    <button type="button" class="menu-sheet-btn" data-menu-action="${action}">
      <i class="ph ph-${icon}" aria-hidden="true"></i>
      <span>${label}</span>
    </button>`;

  const menuLink = (href, icon, label, attr) => `
    <a class="menu-sheet-btn p7-side-link" href="${href}" ${attr}="true">
      <i class="ph ph-${icon}" aria-hidden="true"></i>
      <span>${label}</span>
    </a>`;

  function finalBaseMenu() {
    return [
      menuButton('home', 'house', 'Beranda'),
      menuButton('categories', 'squares-four', 'Semua Kategori'),
      menuButton('stores', 'storefront', 'Jelajahi UMKM'),
      menuLink('/purchases/', 'receipt', 'Pesanan Saya', 'data-p8-purchases-link'),
      menuButton('favorites', 'heart', 'Favorit'),
      menuLink('/launch/', 'rocket-launch', 'Pusat Penjual', 'data-p7-launch-link'),
      menuLink('/legal/', 'shield-check', 'Trust Center', 'data-p7-legal-link'),
      menuButton('about', 'info', 'Tentang Pasar UMKM'),
      menuButton('help', 'question', 'Bantuan')
    ].join('');
  }

  function createLink(href, icon, label, datasetKey) {
    const link = doc.createElement('a');
    link.className = 'menu-sheet-btn p7-side-link';
    link.href = href;
    link.dataset[datasetKey] = 'true';
    link.innerHTML = `<i class="ph ph-${icon}" aria-hidden="true"></i><span>${label}</span>`;
    return link;
  }

  function syncMenu() {
    if (syncingMenu) return;
    const host = doc.getElementById('sideMenuContent');
    if (!host) return;

    syncingMenu = true;
    try {
      if (!host.children.length) host.innerHTML = finalBaseMenu();

      const legacyOrders = host.querySelector('button[data-menu-action="orders"]');
      const currentPurchases = host.querySelector('[data-p8-purchases-link]');
      if (legacyOrders) {
        const replacement = createLink('/purchases/', 'receipt', 'Pesanan Saya', 'p8PurchasesLink');
        legacyOrders.replaceWith(replacement);
        if (currentPurchases && currentPurchases !== replacement) currentPurchases.remove();
      } else if (currentPurchases) {
        currentPurchases.classList.add('menu-sheet-btn', 'p7-side-link');
        currentPurchases.setAttribute('href', '/purchases/');
        const label = currentPurchases.querySelector('span');
        if (label) label.textContent = 'Pesanan Saya';
      }

      if (!host.querySelector('[data-p7-launch-link]')) {
        host.appendChild(createLink('/launch/', 'rocket-launch', 'Pusat Penjual', 'p7LaunchLink'));
      }
      if (!host.querySelector('[data-p7-legal-link]')) {
        host.appendChild(createLink('/legal/', 'shield-check', 'Trust Center', 'p7LegalLink'));
      }
    } finally {
      syncingMenu = false;
    }
  }

  function preloadCommerce() {
    const load = () => window.PasarPerformanceV10?.load?.('commerce')?.catch?.(() => null);
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', load, { once: true });
    else load();
  }

  async function refreshHome(button) {
    if (homeRefreshPending) return;
    homeRefreshPending = true;
    button?.setAttribute('aria-busy', 'true');

    try {
      window.PasarPerformanceV10?.clearPublicCache?.();
      try {
        if (typeof STATE !== 'undefined') STATE.activeCategory = null;
      } catch {}

      if (typeof window.navigate === 'function') window.navigate('home');

      if (typeof window.loadInitialData === 'function') {
        await window.loadInitialData();
        const stillHome = (() => {
          try { return typeof STATE === 'undefined' || STATE.activeNav === 'home'; }
          catch { return true; }
        })();
        if (stillHome && typeof window.renderApplication === 'function') window.renderApplication();
      } else {
        window.location.reload();
        return;
      }

      const stillHome = (() => {
        try { return typeof STATE === 'undefined' || STATE.activeNav === 'home'; }
        catch { return true; }
      })();
      if (stillHome) window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error('[Pasar UMKM] Home refresh error:', error);
      window.showToast?.('Beranda belum dapat diperbarui. Coba lagi.');
    } finally {
      homeRefreshPending = false;
      button?.removeAttribute('aria-busy');
    }
  }

  function install() {
    syncMenu();
    const host = doc.getElementById('sideMenuContent');
    if (host) {
      new MutationObserver(syncMenu).observe(host, { childList: true });
    }

    doc.addEventListener('click', event => {
      const home = event.target?.closest?.('#appNavigation [data-nav="home"]');
      if (!home) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      refreshHome(home);
    }, true);

    preloadCommerce();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', install, { once: true });
  else install();

  window.PasarUIConsistency = Object.freeze({
    version: '1.0',
    syncMenu,
    refreshHome: () => refreshHome(doc.querySelector('#appNavigation [data-nav="home"]'))
  });
})();
