'use strict';

(() => {
  if (window.PasarPerformanceV10B?.version === '10.2') return;

  const doc = document;
  const priorFetch = window.fetch.bind(window);
  const responseCache = new Map();
  const mediaSeen = new WeakSet();
  const API_CACHE_RULES = new Map([
    ['/api/discover', 45_000],
    ['/api/ratings/summaries', 60_000]
  ]);
  const CLOUDINARY_HOST = 'res.cloudinary.com';
  const IMAGE_WIDTHS = Object.freeze([240, 320, 480, 640, 800, 960, 1280]);

  let cacheHits = 0;
  let cacheMisses = 0;
  let recommendationRewrites = 0;
  let optimizedImages = 0;
  let optimizedVideos = 0;
  let apiTransferBytes = 0;
  let cloudinaryHinted = false;

  function capability() {
    if (window.PasarPerformanceV10?.capability) return window.PasarPerformanceV10.capability();
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    const effectiveType = String(connection?.effectiveType || '').toLowerCase();
    const saveData = Boolean(connection?.saveData);
    const cores = Number(navigator.hardwareConcurrency || 0);
    const memory = Number(navigator.deviceMemory || 0);
    return Object.freeze({
      effectiveType,
      saveData,
      cores,
      memory,
      constrained: saveData || ['slow-2g', '2g'].includes(effectiveType),
      lowEnd: (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4)
    });
  }

  function recommendationLimit() {
    const device = capability();
    if (device.constrained) return 4;
    if (device.lowEnd || device.effectiveType === '3g') return 6;
    return 12;
  }

  function analyzePublicRequest(input, init) {
    try {
      const request = input instanceof Request ? input : new Request(input, init);
      const method = String(request.method || 'GET').toUpperCase();
      const url = new URL(request.url, location.href);
      if (url.origin !== location.origin || method !== 'GET') return null;

      const ttl = API_CACHE_RULES.get(url.pathname);
      if (!ttl) return null;

      let requestInput = input;
      if (
        url.pathname === '/api/discover' &&
        url.searchParams.get('kind') === 'products' &&
        (url.searchParams.get('sort') || 'relevance') === 'relevance' &&
        !url.searchParams.get('q') &&
        !url.searchParams.get('category') &&
        !url.searchParams.get('district')
      ) {
        const current = Math.max(1, Number.parseInt(url.searchParams.get('limit') || '12', 10) || 12);
        const bounded = Math.min(current, recommendationLimit());
        if (bounded !== current && !(input instanceof Request)) {
          url.searchParams.set('limit', String(bounded));
          requestInput = url.href;
          recommendationRewrites += 1;
        }
      }

      const keyUrl = requestInput instanceof Request
        ? new URL(requestInput.url, location.href)
        : new URL(String(requestInput), location.href);
      return { key: `${keyUrl.pathname}${keyUrl.search}`, ttl, input: requestInput };
    } catch {
      return null;
    }
  }

  window.fetch = async function v10bFetch(input, init) {
    const analyzed = analyzePublicRequest(input, init);
    if (!analyzed) return priorFetch(input, init);

    const now = Date.now();
    const cached = responseCache.get(analyzed.key);
    if (cached?.expiresAt > now) {
      try {
        cacheHits += 1;
        return (await cached.promise).clone();
      } catch {
        responseCache.delete(analyzed.key);
      }
    }

    cacheMisses += 1;
    const promise = priorFetch(analyzed.input, init)
      .then(response => {
        if (!response.ok) responseCache.delete(analyzed.key);
        return response;
      })
      .catch(error => {
        responseCache.delete(analyzed.key);
        throw error;
      });
    responseCache.set(analyzed.key, { expiresAt: now + analyzed.ttl, promise });
    return (await promise).clone();
  };

  function isCloudinary(raw) {
    try {
      const url = new URL(String(raw || ''), location.href);
      return url.protocol === 'https:' && url.hostname === CLOUDINARY_HOST && url.pathname.includes('/image/upload/');
    } catch {
      return false;
    }
  }

  function isProtectedQrMedia(node, raw) {
    const value = String(raw || '').toLowerCase();
    return value.includes('/qris/') || Boolean(node?.closest?.('[data-qris],[data-payment-qris],.qris-image,.payment-qris,.merchant-qris'));
  }

  function ensureCloudinaryPreconnect() {
    if (cloudinaryHinted) return;
    cloudinaryHinted = true;
    for (const [rel, crossOrigin] of [['dns-prefetch', false], ['preconnect', true]]) {
      const link = doc.createElement('link');
      link.rel = rel;
      link.href = 'https://res.cloudinary.com';
      if (crossOrigin) link.crossOrigin = 'anonymous';
      link.dataset.v10bCloudinaryHint = rel;
      doc.head.appendChild(link);
    }
  }

  function cloudinaryUrl(raw, width = 800) {
    if (!isCloudinary(raw)) return String(raw || '');
    try {
      const url = new URL(String(raw));
      const marker = '/image/upload/';
      const index = url.pathname.indexOf(marker);
      if (index < 0) return String(raw);
      const prefix = url.pathname.slice(0, index + marker.length);
      let suffix = url.pathname.slice(index + marker.length);
      const firstSegment = suffix.split('/')[0] || '';
      if (
        !/^v\d+$/.test(firstSegment) &&
        /(?:^|,)(?:f_|q_|c_|w_|h_|dpr_|ar_|g_)/.test(firstSegment)
      ) {
        suffix = suffix.slice(firstSegment.length + 1);
      }
      const boundedWidth = Math.min(1600, Math.max(120, Math.round(Number(width) || 800)));
      url.pathname = `${prefix}f_auto,q_auto:eco,c_limit,w_${boundedWidth},dpr_auto/${suffix}`;
      return url.href;
    } catch {
      return String(raw || '');
    }
  }

  function mediaSizes(node) {
    if (node.closest?.('.story-ring,.side-menu-head,.header-brand,.side-account-avatar')) return '64px';
    if (node.closest?.('.v1-rec-image,.product-thumb,.cart-item-image,[data-product-card]')) {
      return '(max-width: 767px) 45vw, (max-width: 1199px) 24vw, 240px';
    }
    if (node.closest?.('[data-store-card],.store-logo,.store-avatar')) return '(max-width: 767px) 96px, 120px';
    return '(max-width: 767px) 100vw, (max-width: 1199px) 50vw, 33vw';
  }

  function widthsForDevice() {
    const device = capability();
    if (device.constrained) return IMAGE_WIDTHS.filter(width => width <= 480);
    if (device.lowEnd || device.effectiveType === '3g') return IMAGE_WIDTHS.filter(width => width <= 800);
    return IMAGE_WIDTHS;
  }

  function preferredFallbackWidth(node) {
    const rect = node.getBoundingClientRect?.();
    const cssWidth = Math.max(1, Number(rect?.width || node.width || 0));
    const dpr = Math.min(2, Math.max(1, Number(window.devicePixelRatio || 1)));
    const device = capability();
    const ceiling = device.constrained ? 480 : (device.lowEnd || device.effectiveType === '3g') ? 800 : 960;
    return Math.min(ceiling, Math.max(240, Math.ceil(cssWidth * dpr / 80) * 80));
  }

  function optimizeImage(image) {
    if (!(image instanceof HTMLImageElement) || mediaSeen.has(image)) return;
    const raw = image.currentSrc || image.getAttribute('src') || '';
    if (!isCloudinary(raw) || isProtectedQrMedia(image, raw)) return;

    mediaSeen.add(image);
    ensureCloudinaryPreconnect();
    const widths = widthsForDevice();
    image.srcset = widths.map(width => `${cloudinaryUrl(raw, width)} ${width}w`).join(', ');
    image.sizes = image.getAttribute('sizes') || mediaSizes(image);
    image.src = cloudinaryUrl(raw, preferredFallbackWidth(image));
    image.decoding = 'async';

    const rect = image.getBoundingClientRect();
    const nearViewport = rect.top < window.innerHeight * 1.15 && rect.bottom > -120;
    image.loading = nearViewport ? 'eager' : 'lazy';
    image.fetchPriority = nearViewport ? 'auto' : 'low';
    image.dataset.v10bMedia = 'optimized';
    optimizedImages += 1;
  }

  function optimizeVideo(video) {
    if (!(video instanceof HTMLVideoElement) || mediaSeen.has(video)) return;
    mediaSeen.add(video);
    const device = capability();
    video.preload = device.constrained || device.lowEnd ? 'none' : 'metadata';
    video.playsInline = true;
    const poster = video.getAttribute('poster') || '';
    if (isCloudinary(poster) && !isProtectedQrMedia(video, poster)) {
      video.poster = cloudinaryUrl(poster, device.constrained ? 480 : device.lowEnd ? 640 : 960);
      ensureCloudinaryPreconnect();
    }
    video.dataset.v10bMedia = 'optimized';
    optimizedVideos += 1;
  }

  function optimizeTree(root) {
    if (!root) return;
    if (root instanceof HTMLImageElement) optimizeImage(root);
    else if (root instanceof HTMLVideoElement) optimizeVideo(root);
    root.querySelectorAll?.('img').forEach(optimizeImage);
    root.querySelectorAll?.('video').forEach(optimizeVideo);
  }

  function observeMedia() {
    optimizeTree(doc);
    if (!('MutationObserver' in window)) return;
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) optimizeTree(node);
        }
      }
    });
    observer.observe(doc.body, { childList: true, subtree: true });
  }

  function observeApiTransfers() {
    if (!('PerformanceObserver' in window)) return;
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          try {
            const url = new URL(entry.name, location.href);
            if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
              apiTransferBytes += Number(entry.transferSize || 0);
            }
          } catch {}
        }
      }).observe({ type: 'resource', buffered: true });
    } catch {}
  }

  function start() {
    observeMedia();
    observeApiTransfers();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.PasarPerformanceV10B = Object.freeze({
    version: '10.2',
    capability,
    recommendationLimit,
    optimizeImageUrl: cloudinaryUrl,
    refreshMedia: () => optimizeTree(doc),
    getDiagnostics: () => Object.freeze({
      cache_hits: cacheHits,
      cache_misses: cacheMisses,
      cache_entries: responseCache.size,
      recommendation_rewrites: recommendationRewrites,
      recommendation_limit: recommendationLimit(),
      optimized_images: optimizedImages,
      optimized_videos: optimizedVideos,
      api_transfer_bytes: apiTransferBytes,
      capability: capability()
    })
  });
})();
