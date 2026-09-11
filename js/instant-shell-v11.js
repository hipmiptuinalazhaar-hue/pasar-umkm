'use strict';

(() => {
  if (window.PasarInstantShellV11?.version === '11.3') return;

  const doc = document;
  const BOOTSTRAP_PATHS = Object.freeze([
    '/api/categories',
    '/api/stores?limit=24',
    '/api/products?limit=24',
    '/api/posts'
  ]);

  let authPromise = null;
  let trustObserver = null;
  let bootstrapWarmPromise = null;
  let shellPaints = 0;
  let warmStartedAt = 0;
  let warmFinishedAt = 0;

  function paintNavigationShell() {
    try {
      if (typeof window.cacheDOM === 'function') window.cacheDOM();
      if (typeof window.renderSidebar === 'function') window.renderSidebar();
      if (typeof window.renderAccount === 'function') window.renderAccount();
      if (typeof window.updateNavigation === 'function') window.updateNavigation();
      if (typeof window.updateHeaderBadges === 'function') window.updateHeaderBadges();
      if (typeof window.updateCartBadge === 'function') window.updateCartBadge();
      shellPaints += 1;
    } catch (error) {
      console.warn('[Pasar UMKM] V11 instant shell paint:', error);
    }
  }

  function memoizeAndPrewarmSession() {
    const original = window.restoreAuthSession;
    if (typeof original !== 'function' || original.__pumkmV11Memoized) return;

    const wrapped = function restoreAuthSessionV11() {
      if (!authPromise) {
        authPromise = Promise.resolve()
          .then(() => original())
          .finally(() => {
            queueMicrotask(paintNavigationShell);
          });
      }
      return authPromise;
    };

    wrapped.__pumkmV11Memoized = true;
    window.restoreAuthSession = wrapped;

    // Session recovery starts before the normal bootstrap asks for it. The result is
    // still authoritative server state; nothing sensitive is persisted client-side.
    wrapped().catch(() => null);
  }

  function prewarmRequiredMarketplaceData() {
    if (bootstrapWarmPromise) return bootstrapWarmPromise;
    warmStartedAt = performance.now();

    const init = {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    };

    // These exact requests are required by loadInitialData anyway. Starting them in
    // parallel removes the old categories -> stores -> products/posts waterfall.
    // Performance V10-A coalesces identical requests, so the normal bootstrap reuses
    // the in-flight/cached responses instead of creating duplicate network traffic.
    bootstrapWarmPromise = Promise.allSettled(
      BOOTSTRAP_PATHS.map(path => window.fetch(path, init))
    ).finally(() => {
      warmFinishedAt = performance.now();
    });

    return bootstrapWarmPromise;
  }

  function accelerateTrustEvidence() {
    const refresh = () => {
      const trust = window.PasarP5Trust;
      if (!trust?.refresh) return false;
      const hasTarget = doc.querySelector('.post-card.is-product-post,[data-store-id]');
      if (!hasTarget) return false;
      trust.refresh();
      return true;
    };

    if (refresh()) return;

    const root = doc.getElementById('feed') || doc.body;
    trustObserver = new MutationObserver(() => {
      if (!refresh()) return;
      trustObserver?.disconnect();
      trustObserver = null;
    });

    trustObserver.observe(root, { childList: true, subtree: true });

    window.addEventListener('load', () => {
      refresh();
      trustObserver?.disconnect();
      trustObserver = null;
    }, { once: true, passive: true });
  }

  memoizeAndPrewarmSession();
  prewarmRequiredMarketplaceData().catch(() => null);

  const onReady = () => {
    // Paint static navigation immediately. Seller-only entries repaint as soon as the
    // session promise resolves instead of waiting for catalog/feed hydration.
    paintNavigationShell();
    accelerateTrustEvidence();

    // V1 owns recommendations and seller operational cards. If already eager-loaded,
    // ask it to hydrate immediately instead of waiting for its MutationObserver timer.
    window.PasarV1Completion?.refreshDiscovery?.();
    window.PasarV1Completion?.refreshSeller?.();
  };

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
  }

  window.PasarInstantShellV11 = Object.freeze({
    version: '11.3',
    repaint: paintNavigationShell,
    session: () => authPromise,
    warm: prewarmRequiredMarketplaceData,
    diagnostics: () => Object.freeze({
      shell_paints: shellPaints,
      warm_started_ms: Math.round(warmStartedAt || 0),
      warm_finished_ms: Math.round(warmFinishedAt || 0),
      warm_duration_ms: warmFinishedAt && warmStartedAt
        ? Math.round(warmFinishedAt - warmStartedAt)
        : null,
      bootstrap_paths: BOOTSTRAP_PATHS.length
    })
  });
})();
