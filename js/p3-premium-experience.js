'use strict';

(() => {
  const doc = document;
  const root = doc.documentElement;
  const body = doc.body;

  root.dataset.p3Experience = '1';

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

  function installNavigationA11y() {
    const nav = byId('appNavigation');
    if (!nav) return;

    const sync = () => {
      const items = nav.querySelectorAll('.nav-item[data-nav]');
      for (const item of items) {
        const active = item.classList.contains('active');
        if (active) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      }
    };

    sync();
    new MutationObserver(sync).observe(nav, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  function installMenuA11y() {
    const overlay = byId('sideMenu');
    const opener = byId('menuButton');
    const closer = byId('closeMenuButton');
    if (!overlay || !opener) return;

    opener.setAttribute('aria-controls', 'sideMenu');
    opener.setAttribute('aria-haspopup', 'dialog');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    let wasOpen = false;
    const sync = () => {
      const open = isOpen(overlay);
      setExpanded(opener, open);
      if (open && !wasOpen) {
        requestAnimationFrame(() => closer?.focus({ preventScroll: true }));
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
  }

  function installSearchA11y() {
    const overlay = byId('searchOverlay');
    const opener = byId('headerSearchButton');
    const closer = byId('closeSearchButton');
    const input = byId('searchInput');
    if (!overlay || !opener) return;

    opener.setAttribute('aria-controls', 'searchOverlay');
    opener.setAttribute('aria-haspopup', 'dialog');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Pencarian Pasar UMKM');

    let wasOpen = false;
    const sync = () => {
      const open = isOpen(overlay);
      setExpanded(opener, open);
      if (open && !wasOpen) {
        requestAnimationFrame(() => input?.focus({ preventScroll: true }));
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
      if (event.key !== 'Escape' || !isOpen(overlay)) return;
      closer?.click();
    });
  }

  function installConnectivityStatus() {
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

    const offline = () => show(
      'Koneksi terputus. Konten yang sudah dimuat tetap dapat dilihat.',
      'offline',
      true
    );
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

    let label = loading.querySelector('.p3-sr-only');
    if (!label) {
      label = doc.createElement('span');
      label.className = 'p3-sr-only';
      label.textContent = 'Sedang memuat konten.';
      loading.appendChild(label);
    }

    const sync = () => loading.setAttribute('aria-hidden', loading.hidden ? 'true' : 'false');
    sync();
    new MutationObserver(sync).observe(loading, {
      attributes: true,
      attributeFilter: ['hidden']
    });
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
    link.addEventListener('click', () => {
      requestAnimationFrame(() => main.focus({ preventScroll: true }));
    });
    body.insertBefore(link, body.firstChild);
  }

  function installPointerIntent() {
    doc.addEventListener('pointerdown', event => {
      const target = event.target?.closest?.('button,[role="button"],a');
      if (!target) return;
      target.dataset.p3Pressed = 'true';
    }, { passive: true, capture: true });

    const clear = event => {
      const target = event.target?.closest?.('[data-p3-pressed="true"]');
      target?.removeAttribute('data-p3-pressed');
    };
    doc.addEventListener('pointerup', clear, { passive: true, capture: true });
    doc.addEventListener('pointercancel', clear, { passive: true, capture: true });
  }

  function init() {
    installSkipLink();
    installNavigationA11y();
    installMenuA11y();
    installSearchA11y();
    installConnectivityStatus();
    installLoadingSemantics();
    installPointerIntent();
    root.dataset.p3Ready = 'true';
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.PasarP3Experience = Object.freeze({
    version: '1.0',
    ready: () => root.dataset.p3Ready === 'true'
  });
})();
