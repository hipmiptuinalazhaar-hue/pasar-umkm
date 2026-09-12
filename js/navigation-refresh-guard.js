'use strict';

/* PASAR UMKM - NAVIGATION / INITIAL RENDER GUARD v2.2 */
(() => {
  const doc = document;
  const hash = String(location.hash || '');
  const navigationEntry = performance.getEntriesByType?.('navigation')?.[0] || null;
  const legacyReload = performance.navigation && performance.navigation.type === 1;
  const isReload = navigationEntry?.type === 'reload' || legacyReload;
  if (hash.startsWith('#profile=') && isReload) history.replaceState(null, '', `${location.pathname}${location.search}`);

  const STYLE_ASSETS = Object.freeze([
    ['commerceCoreStyle', 'css/commerce-experience-v2.css?v=2.1'],
    ['p7NavigationStyle', 'css/p7-launch-growth.css?v=1.0']
  ]);
  let commerceJob = null;

  function ensureStyle(key, href) {
    const selector = `link[data-${key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}="true"]`;
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

  function finalSideLink(href, icon, label, key) {
    const link = doc.createElement('a');
    link.className = 'menu-sheet-btn p7-side-link';
    link.href = href;
    link.dataset[key] = 'true';
    link.innerHTML = `<i class="ph ph-${icon}" aria-hidden="true"></i><span>${label}</span>`;
    return link;
  }

  function normalizeFinalLinks(host) {
    host.querySelectorAll('[data-p7-launch-link],[data-p7-legal-link],[data-p8-purchases-link]').forEach(link => {
      link.classList.add('menu-sheet-btn', 'p7-side-link');
    });
  }

  function ensureFinalNavigation() {
    const host = doc.getElementById('sideMenuContent');
    if (!host) return false;
    if (!host.querySelector('[data-p7-launch-link]')) host.appendChild(finalSideLink('/launch/', 'rocket-launch', 'Pusat Penjual', 'p7LaunchLink'));
    if (!host.querySelector('[data-p7-legal-link]')) host.appendChild(finalSideLink('/legal/', 'shield-check', 'Trust Center', 'p7LegalLink'));
    if (!host.querySelector('[data-p8-purchases-link]')) host.appendChild(finalSideLink('/purchases/', 'package', 'Pembelian Saya', 'p8PurchasesLink'));
    normalizeFinalLinks(host);
    return true;
  }

  function ensureModernCommerce() {
    if (window.PasarCommerce?.version === '2.1') return Promise.resolve(window.PasarCommerce);
    if (commerceJob) return commerceJob;

    ensureCriticalStyles();
    commerceJob = new Promise((resolve, reject) => {
      const existing = doc.querySelector('script[data-commerce-core-v2="true"]');
      if (existing) {
        const started = Date.now();
        const poll = () => {
          if (window.PasarCommerce?.version === '2.1') return resolve(window.PasarCommerce);
          if (Date.now() - started > 6000) return reject(new Error('Commerce runtime timeout.'));
          setTimeout(poll, 30);
        };
        poll();
        return;
      }

      const script = doc.createElement('script');
      script.src = 'js/commerce-experience-v2.js?v=2.1';
      script.async = true;
      script.dataset.commerceCoreV2 = 'true';
      script.onload = () => {
        if (window.PasarCommerce?.version === '2.1') resolve(window.PasarCommerce);
        else reject(new Error('Commerce runtime tidak terinisialisasi.'));
      };
      script.onerror = () => reject(new Error('Commerce runtime gagal dimuat.'));
      (doc.body || doc.head).appendChild(script);
    }).catch(error => {
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
      window.PasarP8Commerce?.installLinks?.();
      window.PasarCartCheckoutV2?.syncCartSelectionUI?.();
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
    const originalFetch = window.fetch;
    const nonce = Date.now().toString(36);
    window.fetch = function freshHomeFetch(input, init) {
      try {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url, location.href);
        if (url.origin === location.origin && ['/api/categories','/api/stores','/api/products','/api/posts'].includes(url.pathname)) {
          url.searchParams.set('_refresh', nonce);
          if (input instanceof Request) return originalFetch(new Request(url.href, request), init);
          return originalFetch(url.href, init);
        }
      } catch {}
      return originalFetch(input, init);
    };
    try {
      window.closeBottomSheet?.(); window.closeSideMenu?.();
      if (typeof window.navigate === 'function') window.navigate('home');
      if (typeof window.loadInitialData === 'function') {
        await window.loadInitialData();
        window.renderApplication?.();
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

  doc.addEventListener('pointerdown', event => {
    const commerceTarget = event.target?.closest?.('#appNavigation [data-nav="cart"],#appNavigation [data-nav="sell"],[data-menu-action="store"],[data-menu-action="seller-products"],[data-menu-action="orders"]');
    if (commerceTarget) ensureModernCommerce().catch(() => null);
  }, { capture: true, passive: true });

  doc.addEventListener('click', event => {
    const home = event.target?.closest?.('#appNavigation [data-nav="home"]');
    if (home) {
      const alreadyHome = typeof STATE !== 'undefined' ? STATE.activeNav === 'home' && !STATE.activeCategory : home.classList.contains('active');
      if (alreadyHome) {
        event.preventDefault(); event.stopImmediatePropagation(); refreshHome();
        return;
      }
    }

    const commerceTarget = event.target?.closest?.('#appNavigation [data-nav="cart"],#appNavigation [data-nav="sell"],[data-menu-action="store"],[data-menu-action="seller-products"],[data-menu-action="orders"]');
    if (!commerceTarget) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openModernCommerceIntent(commerceTarget);
  }, true);

  const boot = () => {
    ensureCriticalStyles();
    ensureFinalNavigation();
    ensureModernCommerce().catch(error => console.warn('[Pasar UMKM] Commerce prewarm:', error));
    const host = doc.getElementById('sideMenuContent');
    if (host && 'MutationObserver' in window) new MutationObserver(ensureFinalNavigation).observe(host, { childList: true });
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();

  window.PasarNavigationRefreshGuard = Object.freeze({
    version: '2.2',
    ensureFinalNavigation,
    ensureModernCommerce,
    refreshHome
  });
})();
