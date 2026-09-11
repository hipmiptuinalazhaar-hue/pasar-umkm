'use strict';

(() => {
  if (window.PasarP2FinalUX?.version === '2.0') return;

  const doc = document;
  let lastTrigger = null;
  let activeModal = null;

  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'textarea:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function visible(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.hidden) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function focusables(root) {
    return Array.from(root?.querySelectorAll?.(focusableSelector) || []).filter(visible);
  }

  function currentModal() {
    const sheet = doc.getElementById('bottomSheet');
    if (sheet && visible(sheet)) return sheet;

    const search = doc.getElementById('searchOverlay');
    if (search && visible(search)) return search;

    const side = doc.getElementById('sideMenu');
    if (side && visible(side)) return side;

    return null;
  }

  function syncExpandedState() {
    const sideOpen = visible(doc.getElementById('sideMenu'));
    const searchOpen = visible(doc.getElementById('searchOverlay'));

    doc.getElementById('menuButton')?.setAttribute('aria-expanded', String(sideOpen));
    doc.getElementById('headerSearchButton')?.setAttribute('aria-expanded', String(searchOpen));

    const nav = doc.querySelectorAll('#appNavigation [data-nav]');
    nav.forEach(item => {
      if (item.classList.contains('active')) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  }

  function syncModalFocus() {
    const modal = currentModal();
    if (modal === activeModal) return;

    if (!modal) {
      activeModal = null;
      if (lastTrigger && doc.contains(lastTrigger) && visible(lastTrigger)) {
        queueMicrotask(() => lastTrigger.focus({ preventScroll: true }));
      }
      lastTrigger = null;
      return;
    }

    activeModal = modal;
    modal.setAttribute('aria-modal', modal.getAttribute('role') === 'dialog' ? 'true' : modal.getAttribute('aria-modal') || 'true');

    queueMicrotask(() => {
      const preferred = modal.querySelector('[autofocus], input, textarea, select, button, [href]');
      if (preferred instanceof HTMLElement && visible(preferred)) {
        preferred.focus({ preventScroll: true });
      }
    });
  }

  function closeTopLayer() {
    const sheet = doc.getElementById('bottomSheet');
    if (sheet && visible(sheet) && typeof window.closeBottomSheet === 'function') {
      window.closeBottomSheet();
      return true;
    }

    const search = doc.getElementById('searchOverlay');
    if (search && visible(search) && typeof window.closeSearch === 'function') {
      window.closeSearch();
      return true;
    }

    const side = doc.getElementById('sideMenu');
    if (side && visible(side) && typeof window.closeSideMenu === 'function') {
      window.closeSideMenu();
      return true;
    }

    return false;
  }

  function trapTab(event) {
    if (event.key !== 'Tab') return;
    const modal = currentModal();
    if (!modal) return;

    const nodes = focusables(modal);
    if (!nodes.length) {
      event.preventDefault();
      return;
    }

    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = doc.activeElement;

    if (event.shiftKey && (active === first || !modal.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function installSkipLink() {
    if (doc.querySelector('.skip-link')) return;
    const main = doc.querySelector('.app-main');
    if (!main) return;
    if (!main.id) main.id = 'mainContent';

    const link = doc.createElement('a');
    link.className = 'skip-link';
    link.href = `#${main.id}`;
    link.textContent = 'Lewati ke konten utama';
    doc.body.prepend(link);
  }

  function hardenDynamicImages(root = doc) {
    root.querySelectorAll?.('img:not([decoding])').forEach(image => {
      image.decoding = 'async';
    });

    root.querySelectorAll?.('img:not([alt])').forEach(image => {
      image.alt = '';
    });
  }

  function onReady() {
    installSkipLink();
    hardenDynamicImages();
    syncExpandedState();
    syncModalFocus();
    doc.documentElement.classList.add('p2-final-ready');
  }

  doc.addEventListener('pointerdown', event => {
    const trigger = event.target?.closest?.('button,a,[role="button"],[data-action],[data-nav],[data-menu-action]');
    if (trigger instanceof HTMLElement) lastTrigger = trigger;
  }, { capture: true, passive: true });

  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape' && closeTopLayer()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    trapTab(event);
  }, true);

  const observer = new MutationObserver(mutations => {
    let shouldSync = false;
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') shouldSync = true;
      for (const node of mutation.addedNodes || []) {
        if (node instanceof Element) hardenDynamicImages(node);
      }
    }
    if (shouldSync || mutations.some(mutation => mutation.addedNodes?.length)) {
      queueMicrotask(() => {
        syncExpandedState();
        syncModalFocus();
      });
    }
  });

  const boot = () => {
    onReady();
    observer.observe(doc.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden', 'class', 'aria-hidden']
    });
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.PasarP2FinalUX = Object.freeze({
    version: '2.0',
    sync: () => {
      syncExpandedState();
      syncModalFocus();
    }
  });
})();
