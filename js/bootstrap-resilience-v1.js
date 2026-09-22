'use strict';

(() => {
  if (window.PasarBootstrapResilience?.version === '1.0') return;

  const MAX_BLOCKING_LOADER_MS = 4500;
  let released = false;
  let timer = 0;

  function release(reason = 'soft-timeout') {
    if (released) return false;
    const loader = document.getElementById('appLoading');
    if (!loader || loader.hidden) return false;

    released = true;
    loader.hidden = true;
    loader.setAttribute('aria-hidden', 'true');
    document.documentElement.dataset.bootstrapResilience = reason;
    return true;
  }

  function arm() {
    clearTimeout(timer);
    timer = window.setTimeout(() => release('soft-timeout'), MAX_BLOCKING_LOADER_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arm, { once: true });
  } else {
    arm();
  }

  window.addEventListener('error', () => {
    window.setTimeout(() => release('runtime-error'), 0);
  }, { passive: true });

  window.addEventListener('unhandledrejection', () => {
    window.setTimeout(() => release('runtime-rejection'), 0);
  }, { passive: true });

  window.PasarBootstrapResilience = Object.freeze({
    version: '1.0',
    max_blocking_loader_ms: MAX_BLOCKING_LOADER_MS,
    release
  });
})();
