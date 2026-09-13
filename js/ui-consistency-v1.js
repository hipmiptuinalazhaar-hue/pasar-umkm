'use strict';

(() => {
  if (window.PasarUIConsistency?.version === '1.1') return;

  function cleanupLegacySeoArtifacts() {
    let removed = 0;

    document.querySelectorAll('[data-seo-directory="p3"]').forEach(node => {
      node.remove();
      removed += 1;
    });

    document.querySelectorAll('body > footer').forEach(footer => {
      const text = String(footer.textContent || '');
      const looksLikeLegacySeoFooter =
        footer.querySelector('a[href^="/jelajahi"],a[href^="/legal/"]') ||
        text.includes('Tentang pengembang') ||
        text.includes('Kebijakan pembeli');
      if (!looksLikeLegacySeoFooter) return;
      footer.remove();
      removed += 1;
    });

    return removed;
  }

  const getGuard = () => (
    window.PasarNavigationRefreshGuard?.version === '2.3'
      ? window.PasarNavigationRefreshGuard
      : null
  );

  function waitForGuard(timeout = 7000) {
    const ready = getGuard();
    if (ready) return Promise.resolve(ready);

    return new Promise((resolve, reject) => {
      const started = Date.now();
      const poll = () => {
        const guard = getGuard();
        if (guard) return resolve(guard);
        if (Date.now() - started >= timeout) {
          return reject(new Error('Navigation guard timeout.'));
        }
        setTimeout(poll, 30);
      };
      poll();
    });
  }

  function syncMenu() {
    cleanupLegacySeoArtifacts();
    const guard = getGuard();
    if (guard) return guard.ensureFinalNavigation();

    waitForGuard()
      .then(runtime => runtime.ensureFinalNavigation())
      .catch(() => null);

    return false;
  }

  function refreshHome() {
    cleanupLegacySeoArtifacts();
    const guard = getGuard();
    if (guard) return guard.refreshHome();

    return waitForGuard()
      .then(runtime => runtime.refreshHome())
      .catch(error => {
        console.error('[Pasar UMKM] Home refresh bridge:', error);
        window.showToast?.('Beranda belum dapat diperbarui. Coba lagi.');
      });
  }

  // Compatibility bridge only. Navigation listeners, MutationObservers and
  // commerce prewarming are intentionally owned by navigation-refresh-guard.
  // Keeping a single owner removes the refresh/menu race that previously made
  // the UI change after opening Account/Profile.
  cleanupLegacySeoArtifacts();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cleanupLegacySeoArtifacts, { once: true });
  }
  syncMenu();

  window.PasarUIConsistency = Object.freeze({
    version: '1.1',
    cleanupLegacySeoArtifacts,
    syncMenu,
    refreshHome
  });
})();
