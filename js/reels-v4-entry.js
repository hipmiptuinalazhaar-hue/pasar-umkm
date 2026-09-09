'use strict';

(() => {
  if (window.PasarReelsV4Entry?.version === '4.0') return;

  const jobs = new Map();

  function loadStyle(key, href) {
    const selector = `link[data-reels-v4-entry-style="${key}"]`;
    const existing = document.querySelector(selector);
    if (existing) return Promise.resolve(existing);
    if (jobs.has(`style:${key}`)) return jobs.get(`style:${key}`);
    const job = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.reelsV4EntryStyle = key;
      link.onload = () => resolve(link);
      link.onerror = () => reject(new Error(`Gagal memuat stylesheet Reels: ${key}`));
      document.head.appendChild(link);
    }).catch(error => {
      jobs.delete(`style:${key}`);
      throw error;
    });
    jobs.set(`style:${key}`, job);
    return job;
  }

  function loadScript(key, src, ready) {
    if (ready?.()) return Promise.resolve(ready());
    if (jobs.has(`script:${key}`)) return jobs.get(`script:${key}`);
    const job = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset.reelsV4EntryScript = key;
      script.onload = () => resolve(ready?.() || true);
      script.onerror = () => reject(new Error(`Gagal memuat runtime Reels: ${key}`));
      document.body.appendChild(script);
    }).catch(error => {
      jobs.delete(`script:${key}`);
      throw error;
    });
    jobs.set(`script:${key}`, job);
    return job;
  }

  const ready = (async () => {
    await Promise.all([
      loadStyle('core', 'css/reels-commerce-v4.css?v=745d6c5c0ee8'),
      loadStyle('advanced', 'css/reels-advanced-creator-v4.css?v=adb3c840d989')
    ]);
    await loadScript('core', 'js/reels-commerce-v4.js?v=a9072a74975a', () => window.PasarReelsV4?.version === '4.0');
    await loadScript('advanced', 'js/reels-advanced-creator-v4.js?v=7fe91292a02a', () => window.PasarReelsAdvancedV4?.version === '4.0');
    return window.PasarReelsV4;
  })().catch(error => {
    console.error('[Pasar UMKM] Reels V4 entry error:', error);
    throw error;
  });

  window.PasarReelsV4Entry = Object.freeze({ version: '4.0', ready });
})();
