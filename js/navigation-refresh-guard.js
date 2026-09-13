'use strict';

/* PASAR UMKM - NAVIGATION / INITIAL RENDER GUARD v2.3 */
(() => {
  if (window.PasarNavigationRefreshGuard?.version === '2.3') return;

  const doc = document;
  const hash = String(location.hash || '');
  const navigationEntry = performance.getEntriesByType?.('navigation')?.[0] || null;
  const legacyReload = performance.navigation && performance.navigation.type === 1;
  const isReload = navigationEntry?.type === 'reload' || legacyReload;

  if (hash.startsWith('#profile=') && isReload) {
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  }

  const STYLE_ASSETS = Object.freeze([
    ['commerceCoreStyle', 'css/commerce-experience-v2.css?v=2.1'],
    ['cartCheckoutStyle', 'css/cart-checkout-v2.css?v=1.0'],
    ['p7NavigationStyle', 'css/p7-launch-growth.css?v=1.0']
  ]);

  let commerceJob = null;
  let coreAdapterInstalled = false;

  function dataSelector(key) {
    return `data-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
  }

  function ensureStyle(key, href) {
    const selector = `link[${dataSelector(key)}="true"]`;
    const existing = doc.querySelector(selector);
    if (existing) return existing;

    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset[key] = 'true';
    doc.head.appendChild(link);
    return link;
  }

  function ensureCriticalStyles() {
    for (const [key, href] of STYLE_ASSETS) ensureStyle(key, href);
  }

  function loadScript({ selector, src, datasetKey, ready }) {
    const readyValue = ready?.();
    if (readyValue) return Promise.resolve(readyValue);

    let script = doc.querySelector(selector);
    if (!script) {
      script = doc.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset[datasetKey] = 'true';
      (doc.body || doc.head).appendChild(script);
    }

    return new Promise((resolve, reject) => {
      const started = Date.now();
      const poll = () => {
        const value = ready?.();
        if (value) return resolve(value);
        if (Date.now() - started > 7000) {
          return reject(new Error(`Runtime timeout: ${src}`));
        }
        setTimeout(poll, 30);
      };
      poll();
    });
  }

  function menuButton(action, icon, label) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'menu-sheet-btn';
    button.dataset.menuAction = action;
    button.innerHTML = `<i class="ph ph-${icon}" aria-hidden="true"></i><span>${label}</span>`;
    return button;
  }

  function finalSideLink(href, icon, label, key) {
    const link = doc.createElement('a');
    link.className = 'menu-sheet-btn p7-side-link';
    link.href = href;
    link.dataset[key] = 'true';
    link.innerHTML = `<i class="ph ph-${icon}" aria-hidden="true"></i><span>${label}</span>`;
    return link;
  }

  function ensureMenuButton(host, action, icon, label) {
    let button = host.querySelector(`[data-menu-action="${action}"]`);
    if (!button) {
      button = menuButton(action, icon, label);
      host.appendChild(button);
    }
    button.classList.add('menu-sheet-btn');
    const labelNode = button.querySelector('span');
    if (labelNode) labelNode.textContent = label;
    return button;
  }

  function placePurchasesLink(host) {
    let purchases = host.querySelector('[data-p8-purchases-link]');
    const legacyOrders = host.querySelector('[data-menu-action="orders"]');

    if (!purchases) {
      purchases = finalSideLink('/purchases/', 'package', 'Pembelian Saya', 'p8PurchasesLink');
    }

    if (legacyOrders) {
      legacyOrders.replaceWith(purchases);
    } else if (!purchases.isConnected) {
      host.appendChild(purchases);
    }

    purchases.classList.add('menu-sheet-btn', 'p7-side-link');
    purchases.href = '/purchases/';
    const label = purchases.querySelector('span');
    if (label) label.textContent = 'Pembelian Saya';
    return purchases;
  }

  function ensureFinalNavigation() {
    const host = doc.getElementById('sideMenuContent');
    if (!host) return false;

    const home = ensureMenuButton(host, 'home', 'house', 'Beranda');
    const categories = ensureMenuButton(host, 'categories', 'squares-four', 'Semua Kategori');
    const stores = ensureMenuButton(host, 'stores', 'storefront', 'Jelajahi UMKM');
    const purchases = placePurchasesLink(host);
    const favorites = ensureMenuButton(host, 'favorites', 'heart', 'Favorit');

    let launch = host.querySelector('[data-p7-launch-link]');
    if (!launch) {
      launch = finalSideLink('/launch/', 'rocket-launch', 'Pusat Penjual', 'p7LaunchLink');
      host.appendChild(launch);
    }

    let legal = host.querySelector('[data-p7-legal-link]');
    if (!legal) {
      legal = finalSideLink('/legal/', 'shield-check', 'Trust Center', 'p7LegalLink');
      host.appendChild(legal);
    }

    const about = ensureMenuButton(host, 'about', 'info', 'Tentang Pasar UMKM');
    const help = ensureMenuButton(host, 'help', 'question', 'Bantuan');

    launch.classList.add('menu-sheet-btn', 'p7-side-link');
    legal.classList.add('menu-sheet-btn', 'p7-side-link');

    const sellerStore = host.querySelector('[data-menu-action="store"]');
    const sellerProducts = host.querySelector('[data-menu-action="seller-products"]');
    const admin = host.querySelector('[data-menu-action="admin"]');

    const ordered = [
      home,
      categories,
      stores,
      purchases,
      favorites,
      sellerStore,
      sellerProducts,
      admin,
      launch,
      legal,
      about,
      help
    ].filter(Boolean);

    for (const node of ordered) host.appendChild(node);
    return true;
  }

  async function ensureModernCommerce() {
    if (commerceJob) return commerceJob;
    ensureCriticalStyles();

    commerceJob = (async () => {
      // P8 is the canonical checkout owner. Load it first so the legacy
      // in-page checkout handler can never win the capture-listener race.
      await loadScript({
        selector: 'script[src*="js/p8-commerce-integration.js"]',
        src: 'js/p8-commerce-integration.js?v=fc3dcbac9b78',
        datasetKey: 'p8CommerceIntegration',
        ready: () => window.PasarP8Commerce?.version === '1.2' ? window.PasarP8Commerce : null
      });

      const commerce = await loadScript({
        selector: 'script[src*="js/commerce-experience-v2.js"]',
        src: 'js/commerce-experience-v2.js?v=2.1',
        datasetKey: 'commerceCoreV2',
        ready: () => window.PasarCommerce?.version === '2.1' ? window.PasarCommerce : null
      });

      window.PasarP8Commerce?.installLinks?.();
      ensureFinalNavigation();
      return commerce;
    })().catch(error => {
      commerceJob = null;
      throw error;
    });

    return commerceJob;
  }

  async function openModernCommerceIntent(target) {
    target.setAttribute('aria-busy', 'true');
    try {
      const commerce = await ensureModernCommerce();
      await commerce.handleIntent(target);
      requestAnimationFrame(() => window.PasarCartCheckoutV2?.syncCartSelectionUI?.());
    } catch (error) {
      console.error('[Pasar UMKM] Modern commerce bootstrap:', error);
      window.showToast?.('Fitur perdagangan belum dapat dibuka. Coba lagi.');
    } finally {
      target.removeAttribute('aria-busy');
    }
  }

  async function refreshHome() {
    if (window.__PUMKM_HOME_REFRESHING__) return;

    window.__PUMKM_HOME_REFRESHING__ = true;
    const button = doc.querySelector('#appNavigation [data-nav="home"]');
    button?.setAttribute('aria-busy', 'true');
    window.PasarPerformanceV10?.clearPublicCache?.();

    const originalFetch = window.fetch;
    const nonce = Date.now().toString(36);

    window.fetch = function freshHomeFetch(input, init) {
      try {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url, location.href);
        if (
          url.origin === location.origin &&
          ['/api/categories', '/api/stores', '/api/products', '/api/posts'].includes(url.pathname)
        ) {
          url.searchParams.set('_refresh', nonce);
          if (input instanceof Request) {
            return originalFetch(new Request(url.href, request), init);
          }
          return originalFetch(url.href, init);
        }
      } catch {}
      return originalFetch(input, init);
    };

    try {
      window.closeBottomSheet?.();
      window.closeSideMenu?.();

      if (typeof window.navigate === 'function') window.navigate('home');

      if (typeof window.loadInitialData === 'function') {
        await window.loadInitialData();
        window.renderApplication?.();
        ensureFinalNavigation();
        window.PasarP5Trust?.refresh?.();
        window.PasarV1Completion?.refreshDiscovery?.({ force: true });
        window.PasarInstantShellV11?.repaint?.();
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error('[Pasar UMKM] Home refresh:', error);
      window.showToast?.('Beranda belum dapat diperbarui. Coba lagi.');
    } finally {
      window.fetch = originalFetch;
      button?.removeAttribute('aria-busy');
      window.__PUMKM_HOME_REFRESHING__ = false;
    }
  }

  function installCoreAdapter() {
    if (coreAdapterInstalled) return true;
    if (typeof window.renderSidebar !== 'function') return false;

    const originalRenderSidebar = window.renderSidebar;
    if (!originalRenderSidebar.__pumkmFinalNavigationWrapped) {
      const wrapped = function renderSidebarWithFinalNavigation(...args) {
        const result = originalRenderSidebar.apply(this, args);
        ensureFinalNavigation();
        return result;
      };
      wrapped.__pumkmFinalNavigationWrapped = true;
      window.renderSidebar = wrapped;
    }

    coreAdapterInstalled = true;
    return true;
  }

  function scheduleCoreAdapter() {
    if (installCoreAdapter()) return;
    const started = Date.now();
    const poll = () => {
      if (installCoreAdapter()) return;
      if (Date.now() - started < 7000) setTimeout(poll, 25);
    };
    poll();
  }

  const COMMERCE_SELECTOR = [
    '#appNavigation [data-nav="cart"]',
    '#appNavigation [data-nav="sell"]',
    '[data-menu-action="store"]',
    '[data-menu-action="seller-products"]'
  ].join(',');

  doc.addEventListener('pointerdown', event => {
    const commerceTarget = event.target?.closest?.(COMMERCE_SELECTOR);
    if (commerceTarget) ensureModernCommerce().catch(() => null);
  }, { capture: true, passive: true });

  doc.addEventListener('click', event => {
    const home = event.target?.closest?.('#appNavigation [data-nav="home"]');
    if (home) {
      const alreadyHome = typeof STATE !== 'undefined'
        ? STATE.activeNav === 'home' && !STATE.activeCategory
        : home.classList.contains('active');

      if (alreadyHome) {
        event.preventDefault();
        event.stopImmediatePropagation();
        refreshHome();
        return;
      }
    }

    const purchases = event.target?.closest?.('[data-p8-purchases-link]');
    if (purchases) {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.closeSideMenu?.();
      location.assign('/purchases/');
      return;
    }

    const commerceTarget = event.target?.closest?.(COMMERCE_SELECTOR);
    if (!commerceTarget) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    openModernCommerceIntent(commerceTarget);
  }, true);

  ensureCriticalStyles();
  ensureFinalNavigation();
  scheduleCoreAdapter();

  const boot = () => {
    ensureFinalNavigation();
    scheduleCoreAdapter();
    ensureModernCommerce().catch(error => {
      console.warn('[Pasar UMKM] Commerce prewarm:', error);
    });

    const host = doc.getElementById('sideMenuContent');
    if (host && 'MutationObserver' in window) {
      new MutationObserver(() => ensureFinalNavigation()).observe(host, { childList: true });
    }
  };

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.PasarNavigationRefreshGuard = Object.freeze({
    version: '2.3',
    ensureFinalNavigation,
    ensureModernCommerce,
    refreshHome
  });
})();
