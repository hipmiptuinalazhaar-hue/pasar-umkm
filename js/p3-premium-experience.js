'use strict';

(() => {
  const doc = document;
  const root = doc.documentElement;
  const body = doc.body;
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  root.dataset.p3Experience = '2';

  function byId(id) {
    return doc.getElementById(id);
  }

  function setExpanded(button, expanded) {
    if (!button) return;
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  function isOpen(node) {
    return Boolean(node && !node.hidden && node.getAttribute('aria-hidden') !== 'true');
  }

  function visibleFocusable(surface) {
    if (!surface) return [];
    return [...surface.querySelectorAll(FOCUSABLE)].filter(node => {
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
      return node.getClientRects().length > 0;
    });
  }

  function trapFocus(event, surface) {
    if (event.key !== 'Tab' || !isOpen(surface)) return;
    const nodes = visibleFocusable(surface);
    if (!nodes.length) {
      event.preventDefault();
      surface.focus?.({ preventScroll: true });
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && doc.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && doc.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  function installNavigationA11y() {
    const nav = byId('appNavigation');
    if (!nav) return;

    let lastLabel = '';
    const announcer = doc.createElement('div');
    announcer.className = 'p3-route-status p3-sr-only';
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');
    body.appendChild(announcer);

    const sync = () => {
      const items = nav.querySelectorAll('.nav-item[data-nav]');
      let activeLabel = '';
      for (const item of items) {
        const active = item.classList.contains('active');
        if (active) {
          item.setAttribute('aria-current', 'page');
          activeLabel = String(item.getAttribute('aria-label') || item.textContent || '').replace(/\s+/g, ' ').trim();
        } else item.removeAttribute('aria-current');
      }
      if (activeLabel && activeLabel !== lastLabel) {
        lastLabel = activeLabel;
        window.setTimeout(() => {
          announcer.textContent = `Halaman ${activeLabel} dibuka.`;
        }, 40);
      }
    };

    sync();
    new MutationObserver(sync).observe(nav, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  function installDialogA11y({ overlayId, openerId, closerId, initialFocusId, label }) {
    const overlay = byId(overlayId);
    const opener = byId(openerId);
    const closer = byId(closerId);
    const initial = initialFocusId ? byId(initialFocusId) : closer;
    if (!overlay || !opener) return;

    opener.setAttribute('aria-controls', overlayId);
    opener.setAttribute('aria-haspopup', 'dialog');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    if (label) overlay.setAttribute('aria-label', label);
    if (!overlay.hasAttribute('tabindex')) overlay.setAttribute('tabindex', '-1');

    let wasOpen = false;
    const sync = () => {
      const open = isOpen(overlay);
      setExpanded(opener, open);
      if (open && !wasOpen) {
        requestAnimationFrame(() => (initial || visibleFocusable(overlay)[0] || overlay).focus?.({ preventScroll: true }));
      } else if (!open && wasOpen && doc.activeElement && overlay.contains(doc.activeElement)) {
        opener.focus({ preventScroll: true });
      }
      wasOpen = open;
    };

    sync();
    new MutationObserver(sync).observe(overlay, {
      attributes: true,
      attributeFilter: ['hidden', 'aria-hidden']
    });

    doc.addEventListener('keydown', event => {
      if (!isOpen(overlay)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closer?.click();
        return;
      }
      trapFocus(event, overlay);
    });
  }

  function installConnectivityStatus() {
    if (doc.querySelector('.p3-connectivity')) return;
    const status = doc.createElement('div');
    status.className = 'p3-connectivity';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    status.dataset.visible = 'false';
    status.dataset.state = navigator.onLine ? 'online' : 'offline';

    const dot = doc.createElement('span');
    dot.className = 'p3-connectivity-dot';
    dot.setAttribute('aria-hidden', 'true');

    const text = doc.createElement('span');
    status.append(dot, text);
    body.appendChild(status);

    let hideTimer = 0;
    const show = (message, state, sticky = false) => {
      clearTimeout(hideTimer);
      text.textContent = message;
      status.dataset.state = state;
      status.dataset.visible = 'true';
      if (!sticky) {
        hideTimer = window.setTimeout(() => {
          status.dataset.visible = 'false';
        }, 2600);
      }
    };

    const offline = () => show('Koneksi terputus. Konten yang sudah dimuat tetap dapat dilihat.', 'offline', true);
    const online = () => show('Koneksi kembali aktif.', 'online');

    window.addEventListener('offline', offline, { passive: true });
    window.addEventListener('online', online, { passive: true });
    if (!navigator.onLine) offline();
  }

  function installLoadingSemantics() {
    const loading = byId('appLoading');
    if (!loading) return;
    loading.setAttribute('role', 'status');
    loading.setAttribute('aria-live', 'polite');
    loading.setAttribute('aria-busy', loading.hidden ? 'false' : 'true');

    let label = loading.querySelector('.p3-sr-only');
    if (!label) {
      label = doc.createElement('span');
      label.className = 'p3-sr-only';
      label.textContent = 'Sedang memuat konten.';
      loading.appendChild(label);
    }

    const sync = () => {
      loading.setAttribute('aria-hidden', loading.hidden ? 'true' : 'false');
      loading.setAttribute('aria-busy', loading.hidden ? 'false' : 'true');
    };
    sync();
    new MutationObserver(sync).observe(loading, { attributes: true, attributeFilter: ['hidden'] });
  }

  function installSkipLink() {
    const main = doc.querySelector('.app-main');
    if (!main || doc.querySelector('.p3-skip-link')) return;
    if (!main.id) main.id = 'mainContent';
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');

    const link = doc.createElement('a');
    link.className = 'p3-skip-link';
    link.href = `#${main.id}`;
    link.textContent = 'Lewati ke konten utama';
    link.addEventListener('click', () => requestAnimationFrame(() => main.focus({ preventScroll: true })));
    body.insertBefore(link, body.firstChild);
  }

  function installPointerIntent() {
    doc.addEventListener('pointerdown', event => {
      const target = event.target?.closest?.('button,[role="button"],a');
      if (target) target.dataset.p3Pressed = 'true';
    }, { passive: true, capture: true });

    const clear = event => event.target?.closest?.('[data-p3-pressed="true"]')?.removeAttribute('data-p3-pressed');
    doc.addEventListener('pointerup', clear, { passive: true, capture: true });
    doc.addEventListener('pointercancel', clear, { passive: true, capture: true });
  }

  function loadCartCheckoutHotfix() {
    if (window.PasarCartCheckoutHotfix?.version === '1.2' || doc.querySelector('script[data-cart-checkout-hotfix="true"]')) return;
    const script = doc.createElement('script');
    script.src = 'js/cart-checkout-hotfix-v1.js?v=1.2';
    script.async = true;
    script.dataset.cartCheckoutHotfix = 'true';
    body.appendChild(script);
  }

  function loadV1Completion() {
    if (window.PasarV1Completion?.version === '1.0' || doc.querySelector('script[data-v1-completion="true"]')) return;
    const script = doc.createElement('script');
    script.src = 'js/v1-completion.js?v=1.0';
    script.async = true;
    script.dataset.v1Completion = 'true';
    body.appendChild(script);
  }

  function loadP8Commerce() {
    if (window.PasarP8Commerce?.version === '1.2' || doc.querySelector('script[data-p8-commerce="true"]')) {
      loadV1Completion();
      return;
    }
    const script = doc.createElement('script');
    script.src = 'js/p8-commerce-integration.js?v=1.2';
    script.async = true;
    script.dataset.p8Commerce = 'true';
    script.onload = loadV1Completion;
    body.appendChild(script);
  }

  function loadP7LaunchGrowth() {
    if (window.PasarP7Growth?.version === '1.0' || doc.querySelector('script[data-p7-launch-growth="true"]')) {
      loadP8Commerce();
      return;
    }
    if (!doc.querySelector('link[data-p7-launch-growth-style="true"]')) {
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'css/p7-launch-growth.css?v=1.0';
      link.dataset.p7LaunchGrowthStyle = 'true';
      doc.head.appendChild(link);
    }
    const script = doc.createElement('script');
    script.src = 'js/p7-launch-growth.js?v=1.0';
    script.async = true;
    script.dataset.p7LaunchGrowth = 'true';
    script.onload = loadP8Commerce;
    body.appendChild(script);
  }

  function init() {
    installSkipLink();
    installNavigationA11y();
    installDialogA11y({ overlayId: 'sideMenu', openerId: 'menuButton', closerId: 'closeMenuButton', label: 'Menu utama Pasar UMKM' });
    installDialogA11y({ overlayId: 'searchOverlay', openerId: 'headerSearchButton', closerId: 'closeSearchButton', initialFocusId: 'searchInput', label: 'Pencarian Pasar UMKM' });
    installConnectivityStatus();
    installLoadingSemantics();
    installPointerIntent();
    loadCartCheckoutHotfix();
    loadP8Commerce();
    root.dataset.p3Ready = 'true';
    window.setTimeout(loadP7LaunchGrowth, 0);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.PasarP3Experience = Object.freeze({
    version: '1.0',
    revision: '2.0',
    ready: () => root.dataset.p3Ready === 'true'
  });
})();