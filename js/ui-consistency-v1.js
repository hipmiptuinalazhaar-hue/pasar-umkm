'use strict';

(() => {
  if (window.PasarUIConsistency?.version === '1.0') return;

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
    const guard = getGuard();
    if (guard) return guard.ensureFinalNavigation();

    waitForGuard()
      .then(runtime => runtime.ensureFinalNavigation())
      .catch(() => null);

    return false;
  }

  function refreshHome() {
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
  syncMenu();

  window.PasarUIConsistency = Object.freeze({
    version: '1.0',
    syncMenu,
    refreshHome
  });
})();
