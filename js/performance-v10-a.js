'use strict';

(() => {
  if (window.PasarPerformanceV10?.version === '10.1') return;

  const doc = document;
  const jobs = new Map();
  const replaying = new WeakSet();
  const publicPaths = new Set(['/api/categories', '/api/stores', '/api/products', '/api/posts']);
  const responseCache = new Map();
  const PUBLIC_CACHE_TTL_MS = 20_000;
  let warmRequests = 0;
  let replayCount = 0;
  let lazyLoads = 0;
  let lcp = 0;
  let cls = 0;
  let longTasks = 0;

  const ASSETS = Object.freeze({
    chat: 'js/chat-single-render-v6.js?v=LAZY_CHAT_HASH',
    commerce: 'js/p8-commerce-integration.js?v=LAZY_COMMERCE_HASH',
    saved: 'js/profile-saved.js?v=LAZY_SAVED_HASH'
  });

  function capability() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    const effectiveType = String(connection?.effectiveType || '').toLowerCase();
    const saveData = Boolean(connection?.saveData);
    const cores = Number(navigator.hardwareConcurrency || 0);
    const memory = Number(navigator.deviceMemory || 0);
    const constrained = saveData || ['slow-2g', '2g'].includes(effectiveType);
    const lowEnd = (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4);
    return Object.freeze({ effectiveType, saveData, cores, memory, constrained, lowEnd });
  }

  function publicKey(input, init) {
    try {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url, location.href);
      if (url.origin !== location.origin || String(request.method || 'GET').toUpperCase() !== 'GET') return null;
      return publicPaths.has(url.pathname) ? `${url.pathname}${url.search}` : null;
    } catch {
      return null;
    }
  }

  const rawFetch = window.fetch.bind(window);
  window.fetch = async function v10Fetch(input, init) {
    const key = publicKey(input, init);
    if (!key) return rawFetch(input, init);
    const now = Date.now();
    const cached = responseCache.get(key);
    if (cached?.expiresAt > now) {
      try {
        return (await cached.promise).clone();
      } catch {
        responseCache.delete(key);
      }
    }
    const promise = rawFetch(input, init)
      .then(response => {
        if (!response.ok) responseCache.delete(key);
        return response;
      })
      .catch(error => {
        responseCache.delete(key);
        throw error;
      });
    responseCache.set(key, { expiresAt: now + PUBLIC_CACHE_TTL_MS, promise });
    return (await promise).clone();
  };

  function warmPublicBootstrap() {
    const network = capability();
    const paths = network.constrained || network.lowEnd
      ? ['/api/categories']
      : network.effectiveType === '3g'
        ? ['/api/categories', '/api/stores']
        : [...publicPaths];
    const init = { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' }, cache: 'no-store' };
    for (const path of paths) {
      warmRequests += 1;
      window.fetch(path, init).catch(() => null);
    }
  }

  function loadScript(name, ready) {
    if (ready?.()) return Promise.resolve(ready());
    if (jobs.has(name)) return jobs.get(name);
    const src = ASSETS[name];
    if (!src) return Promise.reject(new Error(`Unknown V10 asset: ${name}`));
    const job = new Promise((resolve, reject) => {
      const script = doc.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.v10Lazy = name;
      script.onload = () => {
        lazyLoads += 1;
        resolve(ready?.() || true);
      };
      script.onerror = () => reject(new Error(`Gagal memuat ${name}.`));
      doc.body.appendChild(script);
    }).catch(error => {
      jobs.delete(name);
      throw error;
    });
    jobs.set(name, job);
    return job;
  }

  const loaders = Object.freeze({
    chat: () => loadScript('chat', () => typeof window.ensurePasarChatV7 === 'function'),
    commerce: () => loadScript('commerce', () => window.PasarP8Commerce?.version === '1.2'),
    saved: () => loadScript('saved', () => typeof window.hydratePersistentSaved === 'function')
  });

  function installIntentGate({ selector, ready, loader, label }) {
    const prewarm = event => {
      const target = event.target?.closest?.(selector);
      if (target && !ready()) loader().catch(() => null);
    };
    doc.addEventListener('pointerdown', prewarm, { capture: true, passive: true });
    doc.addEventListener('focusin', prewarm, true);
    doc.addEventListener('click', async event => {
      const target = event.target?.closest?.(selector);
      if (!target || ready() || replaying.has(target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      target.setAttribute('aria-busy', 'true');
      try {
        await loader();
        replayCount += 1;
        replaying.add(target);
        target.click();
        queueMicrotask(() => replaying.delete(target));
      } catch (error) {
        console.error(`[Pasar UMKM] V10 ${label} bootstrap error:`, error);
        window.showToast?.('Fitur belum dapat dibuka. Coba lagi.');
      } finally {
        target.removeAttribute('aria-busy');
      }
    }, true);
  }

  installIntentGate({
    selector: '[data-action="messages"],[data-social-action="message-user"],[data-social-action="open-conversation"]',
    ready: () => typeof window.ensurePasarChatV7 === 'function',
    loader: loaders.chat,
    label: 'chat'
  });

  installIntentGate({
    selector: [
      '[data-action="buy-now"]',
      '[data-commerce-action="buy-now"]',
      '[data-cart-v2-checkout]',
      '[data-action="checkout"]',
      '[data-function-action="checkout-open"]',
      '[data-commerce-action="checkout"]',
      '[data-action="post-create"]',
      '[data-nav="cart"]',
      '[data-nav="account"]',
      '.post-card.is-product-post .ig-product-media',
      '.post-card[data-post-id^="post-"] .ig-product-media'
    ].join(','),
    ready: () => window.PasarP8Commerce?.version === '1.2',
    loader: loaders.commerce,
    label: 'commerce'
  });

  installIntentGate({
    selector: '[data-menu-action="favorites"],[data-action="save"],[data-nav="account"]',
    ready: () => typeof window.hydratePersistentSaved === 'function',
    loader: loaders.saved,
    label: 'saved'
  });

  function observeVitals() {
    if (!('PerformanceObserver' in window)) return;
    try {
      new PerformanceObserver(list => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) lcp = Math.round(last.startTime || 0);
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) cls += Number(entry.value || 0);
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
    try {
      new PerformanceObserver(list => { longTasks += list.getEntries().length; })
        .observe({ type: 'longtask', buffered: true });
    } catch {}
  }

  function scheduleWarmup() {
    const run = () => {
      if (doc.visibilityState === 'hidden') return;
      const device = capability();
      if (device.constrained || device.lowEnd || device.effectiveType === '3g') return;
      const task = () => loaders.saved().catch(() => null);
      if ('requestIdleCallback' in window) requestIdleCallback(task, { timeout: 5000 });
      else setTimeout(task, 1800);
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
  }

  observeVitals();
  warmPublicBootstrap();
  scheduleWarmup();

  window.PasarP2Performance = Object.freeze({
    version: '2.0',
    networkCapability: capability,
    getDiagnostics: () => Object.freeze({
      warm_requests: warmRequests,
      cache_entries: responseCache.size,
      network: capability()
    })
  });

  window.PasarPerformanceV10 = Object.freeze({
    version: '10.1',
    capability,
    load: name => loaders[name]?.() || Promise.reject(new Error(`Unknown V10 feature: ${name}`)),
    getDiagnostics: () => Object.freeze({
      capability: capability(),
      warm_requests: warmRequests,
      cache_entries: responseCache.size,
      lazy_loads: lazyLoads,
      replayed_intents: replayCount,
      lcp_ms: lcp,
      cls: Number(cls.toFixed(4)),
      long_tasks: longTasks
    })
  });
})();
