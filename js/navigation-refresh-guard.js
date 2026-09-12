'use strict';

/* PASAR UMKM - NAVIGATION / INITIAL RENDER GUARD v2.1 */
(() => {
  const doc = document;
  const hash = String(location.hash || '');
  const navigationEntry = performance.getEntriesByType?.('navigation')?.[0] || null;
  const legacyReload = performance.navigation && performance.navigation.type === 1;
  const isReload = navigationEntry?.type === 'reload' || legacyReload;
  if (hash.startsWith('#profile=') && isReload) history.replaceState(null, '', `${location.pathname}${location.search}`);

  function finalSideLink(href, icon, label, key) {
    const link = doc.createElement('a');
    link.className = 'p7-side-link'; link.href = href; link.dataset[key] = 'true';
    link.innerHTML = `<i class="ph ph-${icon}" aria-hidden="true"></i><span>${label}</span>`;
    return link;
  }

  function ensureFinalNavigation() {
    const host = doc.getElementById('sideMenuContent');
    if (!host) return false;
    if (!host.querySelector('[data-p7-launch-link]')) host.appendChild(finalSideLink('/launch/', 'rocket-launch', 'Pusat Penjual', 'p7LaunchLink'));
    if (!host.querySelector('[data-p7-legal-link]')) host.appendChild(finalSideLink('/legal/', 'shield-check', 'Trust Center', 'p7LegalLink'));
    if (!host.querySelector('[data-p8-purchases-link]')) host.appendChild(finalSideLink('/purchases/', 'package', 'Pembelian Saya', 'p8PurchasesLink'));
    return true;
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

  doc.addEventListener('click', event => {
    const home = event.target?.closest?.('#appNavigation [data-nav="home"]');
    if (!home) return;
    const alreadyHome = typeof STATE !== 'undefined' ? STATE.activeNav === 'home' && !STATE.activeCategory : home.classList.contains('active');
    if (!alreadyHome) return;
    event.preventDefault(); event.stopImmediatePropagation(); refreshHome();
  }, true);

  const boot = () => {
    ensureFinalNavigation();
    const host = doc.getElementById('sideMenuContent');
    if (host && 'MutationObserver' in window) new MutationObserver(ensureFinalNavigation).observe(host, { childList: true });
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.PasarNavigationRefreshGuard = Object.freeze({ version: '2.1', ensureFinalNavigation, refreshHome });
})();
