'use strict';

(() => {
  if (window.PasarPerformanceV10C?.version === '10.3') return;

  const doc = document;
  const SELECTION_KEY = 'pasar_cart_selection_v2';
  const CART_IDS_KEY = 'pasar_cart_selection_v10c_ids';
  const CHECKOUT_SELECTOR = [
    '[data-cart-v2-checkout]',
    '[data-action="checkout"]',
    '[data-function-action="checkout-open"]',
    '[data-commerce-action="checkout"]'
  ].join(',');

  let reconcileFrame = 0;
  let feedObserver = null;
  let videoObserver = null;
  let interactionObserver = null;
  let migratedSelections = 0;
  let checkoutRepairs = 0;
  let deferredCards = 0;
  let pausedVideos = 0;
  let maxInteractionMs = 0;
  let interactionCount = 0;
  let hiddenAt = 0;
  let hiddenMs = 0;

  function uniqueIds(values) {
    return [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))];
  }

  function domCartIds() {
    return uniqueIds(
      [...doc.querySelectorAll('.commerce-cart-item[data-product-id]')]
        .map(node => node.dataset.productId)
    );
  }

  function stateCartIds() {
    try {
      if (typeof STATE === 'undefined' || !Array.isArray(STATE.cart)) return [];
      return uniqueIds(STATE.cart.map(row => row?.productId || row?.product?.id));
    } catch {
      return [];
    }
  }

  function currentCartIds() {
    const fromDom = domCartIds();
    return fromDom.length ? fromDom : stateCartIds();
  }

  function readArray(key) {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(key) || 'null');
      return Array.isArray(parsed) ? uniqueIds(parsed) : null;
    } catch {
      return null;
    }
  }

  function writeSelection(selected, ids) {
    const cleanIds = uniqueIds(ids);
    const allowed = new Set(cleanIds);
    const cleanSelection = uniqueIds(selected).filter(id => allowed.has(id));
    try {
      sessionStorage.setItem(SELECTION_KEY, JSON.stringify(cleanSelection));
      sessionStorage.setItem(CART_IDS_KEY, JSON.stringify(cleanIds));
    } catch {}
    return new Set(cleanSelection);
  }

  function migrateSelection(ids) {
    const currentIds = uniqueIds(ids);
    if (!currentIds.length) return new Set();

    const storedSelection = readArray(SELECTION_KEY);
    const knownIds = readArray(CART_IDS_KEY);
    const currentSet = new Set(currentIds);

    // V10-C migration rule: an old empty array without cart identity is stale,
    // not proof that the user intentionally deselected the current cart.
    if (knownIds === null || storedSelection === null) {
      migratedSelections += 1;
      return writeSelection(currentIds, currentIds);
    }

    const knownSet = new Set(knownIds);
    const sameCart = currentIds.length === knownIds.length
      && currentIds.every(id => knownSet.has(id));

    if (sameCart) {
      return writeSelection(storedSelection.filter(id => currentSet.has(id)), currentIds);
    }

    // Preserve an explicit "select none" choice after V10-C has recorded
    // the cart identity. Otherwise preserve selected existing items and select
    // newly-added products by default.
    if (storedSelection.length === 0) {
      return writeSelection([], currentIds);
    }

    const selectedSet = new Set(storedSelection);
    const next = currentIds.filter(id => selectedSet.has(id) || !knownSet.has(id));
    return writeSelection(next, currentIds);
  }

  function selectionFromControls(ids) {
    const allowed = new Set(ids);
    const controls = [...doc.querySelectorAll('.commerce-page [data-cart-v2-item]')];
    if (!controls.length) return null;
    return uniqueIds(
      controls
        .filter(control => control.checked)
        .map(control => control.dataset.cartV2Item)
        .filter(id => allowed.has(String(id || '')))
    );
  }

  function repairCheckoutState() {
    const ids = currentCartIds();
    if (!ids.length) return;

    let selected = migrateSelection(ids);
    const explicit = selectionFromControls(ids);
    if (explicit !== null) selected = writeSelection(explicit, ids);

    const selectedCount = selected.size;
    for (const button of doc.querySelectorAll(CHECKOUT_SELECTOR)) {
      if (!button.closest('.commerce-page, #feed, .sheet-content')) continue;
      const staleDisabled = button.disabled && selectedCount > 0;
      if (staleDisabled) {
        button.disabled = false;
        button.setAttribute('aria-disabled', 'false');
        checkoutRepairs += 1;
      }
      if (selectedCount > 0 && !button.hasAttribute('data-v10c-checkout-ready')) {
        button.dataset.v10cCheckoutReady = 'true';
      }
    }

    // Prime the commerce owner as soon as a real checkout CTA exists. This
    // removes the click-time network race while keeping P8 out of first paint.
    if (
      doc.querySelector(CHECKOUT_SELECTOR) &&
      window.PasarP8Commerce?.version !== '1.2'
    ) {
      window.PasarPerformanceV10?.load?.('commerce').catch(() => null);
    }
  }

  function installRenderContainment() {
    if (doc.getElementById('performanceV10CStyle')) return;
    const style = doc.createElement('style');
    style.id = 'performanceV10CStyle';
    style.textContent = `
      .v10c-deferred-render {
        content-visibility: auto;
        contain-intrinsic-size: auto 560px;
      }
      body.v10c-background-paused * {
        animation-play-state: paused !important;
      }
    `;
    doc.head.appendChild(style);
  }

  function classifyFeedCards() {
    const feed = doc.getElementById('feed');
    if (!feed) return;
    const cards = [...feed.children].filter(node =>
      node instanceof HTMLElement &&
      (node.matches('.post-card, .product-card, .commerce-store-group') || node.querySelector?.('.post-card'))
    );

    cards.forEach((card, index) => {
      if (index < 6 || card.classList.contains('chat-v7-page') || card.classList.contains('social-account-page')) {
        card.classList.remove('v10c-deferred-render');
        return;
      }
      if (!card.classList.contains('v10c-deferred-render')) {
        card.classList.add('v10c-deferred-render');
        deferredCards += 1;
      }
    });
  }

  function ensureVideoObserver() {
    if (videoObserver || !('IntersectionObserver' in window)) return videoObserver;
    videoObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const video = entry.target;
        if (!(video instanceof HTMLVideoElement)) continue;
        if (entry.isIntersecting || entry.intersectionRatio > 0) {
          if (video.preload === 'none' && !window.PasarPerformanceV10?.capability?.().constrained) {
            video.preload = 'metadata';
          }
          continue;
        }
        if (!video.paused) {
          video.pause();
          pausedVideos += 1;
        }
        video.preload = 'none';
      }
    }, { rootMargin: '240px 0px', threshold: 0.01 });
    return videoObserver;
  }

  function observeVideos(root = doc) {
    const observer = ensureVideoObserver();
    if (!observer) return;
    const videos = root instanceof HTMLVideoElement
      ? [root]
      : [...root.querySelectorAll?.('video') || []];
    for (const video of videos) {
      if (video.dataset.v10cObserved === 'true') continue;
      video.dataset.v10cObserved = 'true';
      observer.observe(video);
    }
  }

  function reconcileRuntime() {
    reconcileFrame = 0;
    installRenderContainment();
    repairCheckoutState();
    classifyFeedCards();
    observeVideos(doc.getElementById('feed') || doc);
  }

  function scheduleReconcile() {
    if (reconcileFrame) return;
    reconcileFrame = requestAnimationFrame(reconcileRuntime);
  }

  function installScopedMutationObserver() {
    const feed = doc.getElementById('feed');
    const sheet = doc.getElementById('sheetContent');
    if (!feed && !sheet) return;

    feedObserver?.disconnect();
    feedObserver = new MutationObserver(records => {
      let relevant = false;
      for (const record of records) {
        if (!record.addedNodes.length && !record.removedNodes.length) continue;
        relevant = true;
        for (const node of record.addedNodes) {
          if (node instanceof HTMLVideoElement) observeVideos(node);
          else if (node instanceof Element) observeVideos(node);
        }
      }
      if (relevant) scheduleReconcile();
    });

    if (feed) feedObserver.observe(feed, { childList: true, subtree: true });
    if (sheet) feedObserver.observe(sheet, { childList: true, subtree: true });
  }

  function persistExplicitSelection(event) {
    const target = event.target?.closest?.('[data-cart-v2-item],[data-cart-v2-store],[data-cart-v2-all]');
    if (!target || !target.closest('.commerce-page')) return;
    queueMicrotask(() => {
      const ids = currentCartIds();
      if (!ids.length) return;
      const explicit = selectionFromControls(ids);
      if (explicit !== null) writeSelection(explicit, ids);
      scheduleReconcile();
    });
  }

  function installInteractionObserver() {
    if (!('PerformanceObserver' in window)) return;
    try {
      interactionObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const duration = Number(entry.duration || 0);
          if (!duration) continue;
          interactionCount += 1;
          maxInteractionMs = Math.max(maxInteractionMs, Math.round(duration));
        }
      });
      interactionObserver.observe({ type: 'event', buffered: true, durationThreshold: 40 });
    } catch {}
  }

  function pauseBackgroundWork() {
    if (doc.hidden) {
      hiddenAt = performance.now();
      doc.body?.classList.add('v10c-background-paused');
      for (const video of doc.querySelectorAll('video')) {
        if (!video.paused) {
          video.pause();
          pausedVideos += 1;
        }
      }
      return;
    }

    if (hiddenAt) {
      hiddenMs += Math.max(0, performance.now() - hiddenAt);
      hiddenAt = 0;
    }
    doc.body?.classList.remove('v10c-background-paused');
    scheduleReconcile();
  }

  function boot() {
    installRenderContainment();
    installScopedMutationObserver();
    installInteractionObserver();
    doc.addEventListener('change', persistExplicitSelection, true);
    doc.addEventListener('visibilitychange', pauseBackgroundWork, { passive: true });
    window.addEventListener('pageshow', scheduleReconcile, { passive: true });
    window.addEventListener('online', scheduleReconcile, { passive: true });
    observeVideos(doc);
    reconcileRuntime();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.PasarPerformanceV10C = Object.freeze({
    version: '10.3',
    reconcile: scheduleReconcile,
    repairCheckout: repairCheckoutState,
    getDiagnostics: () => Object.freeze({
      migrated_selections: migratedSelections,
      checkout_repairs: checkoutRepairs,
      deferred_cards: deferredCards,
      paused_videos: pausedVideos,
      interaction_count: interactionCount,
      max_interaction_ms: maxInteractionMs,
      background_hidden_ms: Math.round(hiddenMs + (hiddenAt ? performance.now() - hiddenAt : 0))
    })
  });
})();
