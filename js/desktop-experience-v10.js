'use strict';

(() => {
  if (window.PasarDesktopExperienceV10?.version === '10.2') return;

  const mq = window.matchMedia('(min-width:1024px)');

  function ensureBrandPanel() {
    if (!mq.matches) return null;
    const hero = document.querySelector('#homeDiscovery .market-hero');
    if (!hero) return null;

    hero.querySelector('.desktop-hero-showcase')?.remove();

    let panel = hero.querySelector('.desktop-hero-brand-panel');
    if (panel) return panel;

    panel = document.createElement('aside');
    panel.className = 'desktop-hero-brand-panel';
    panel.setAttribute('aria-label', 'Pasar UMKM Lubuklinggau');
    panel.innerHTML = '<img class="desktop-hero-brand-logo" src="/assets/logo.webp?v=2.0" alt="Pasar UMKM Lubuklinggau" decoding="async" fetchpriority="high">';
    hero.appendChild(panel);
    return panel;
  }

  function apply() {
    document.documentElement.classList.toggle('desktop-v10', mq.matches);
    if (mq.matches) ensureBrandPanel();
  }

  mq.addEventListener?.('change', apply);
  document.addEventListener('DOMContentLoaded', apply, { once: true });
  if (document.readyState !== 'loading') apply();

  window.PasarDesktopExperienceV10 = Object.freeze({
    version: '10.2',
    refresh: apply
  });
})();
