'use strict';

(() => {
  if (window.PasarInstantShellV11?.version === '11.2') return;

  const doc = document;
  let authPromise = null;
  let trustObserver = null;

  function paintNavigationShell() {
    try {
      if (typeof window.cacheDOM === 'function') window.cacheDOM();
      if (typeof window.renderSidebar === 'function') window.renderSidebar();
      if (typeof window.renderAccount === 'function') window.renderAccount();
      if (typeof window.updateNavigation === 'function') window.updateNavigation();
      if (typeof window.updateHeaderBadges === 'function') window.updateHeaderBadges();
      if (typeof window.updateCartBadge === 'function') window.updateCartBadge();
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

    // Start session recovery before the normal application bootstrap asks for it.
    wrapped().catch(() => null);
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

    trustObserver = new MutationObserver(() => {
      if (!refresh()) return;
      trustObserver?.disconnect();
      trustObserver = null;
    });

    trustObserver.observe(doc.body, { childList: true, subtree: true });

    window.addEventListener('load', () => {
      refresh();
      trustObserver?.disconnect();
      trustObserver = null;
    }, { once: true, passive: true });
  }

  memoizeAndPrewarmSession();

  const onReady = () => {
    // Paint static navigation immediately. Seller-only entries are repainted as soon
    // as the session promise resolves, instead of waiting for catalog/feed requests.
    paintNavigationShell();
    accelerateTrustEvidence();
  };

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
  }

  window.PasarInstantShellV11 = Object.freeze({
    version: '11.2',
    repaint: paintNavigationShell,
    session: () => authPromise
  });
})();
