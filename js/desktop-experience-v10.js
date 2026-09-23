'use strict';

(() => {
  if (window.PasarDesktopExperienceV10?.version === '10.3.1') return;

  const mq = window.matchMedia('(min-width:1024px)');

  function ensurePremiumHero() {
    if (!mq.matches) return null;

    const hero = document.querySelector('#homeDiscovery .market-hero');
    const content = hero?.querySelector('.market-hero-content');
    if (!hero || !content) return null;

    hero.querySelector('.desktop-hero-showcase')?.remove();
    hero.querySelector('.desktop-hero-brand-panel')?.remove();
    hero.querySelector('.desktop-hero-premium')?.remove();
    content.querySelector('.desktop-hero-trustline')?.remove();

    const trustline = document.createElement('div');
    trustline.className = 'desktop-hero-trustline';
    trustline.setAttribute('aria-label', 'Keunggulan Pasar UMKM');
    trustline.innerHTML = [
      '<span><i class="ph ph-storefront" aria-hidden="true"></i>Produk lokal</span>',
      '<span><i class="ph ph-shield-check" aria-hidden="true"></i>Marketplace terstruktur</span>',
      '<span><i class="ph ph-map-pin" aria-hidden="true"></i>Lubuklinggau</span>'
    ].join('');
    content.appendChild(trustline);

    const panel = document.createElement('aside');
    panel.className = 'desktop-hero-premium';
    panel.setAttribute('aria-label', 'Pratinjau pengalaman Pasar UMKM');
    panel.innerHTML = `
      <div class="desktop-premium-glow desktop-premium-glow-a" aria-hidden="true"></div>
      <div class="desktop-premium-glow desktop-premium-glow-b" aria-hidden="true"></div>

      <div class="desktop-premium-window">
        <div class="desktop-premium-topbar">
          <div class="desktop-premium-brand">
            <img src="/assets/logo.webp?v=2.0" alt="Pasar UMKM Lubuklinggau" decoding="async">
          </div>
          <div class="desktop-premium-search" aria-hidden="true">
            <i class="ph ph-magnifying-glass"></i>
            <span>Cari produk & UMKM</span>
          </div>
          <div class="desktop-premium-avatar" aria-hidden="true">
            <i class="ph ph-user"></i>
          </div>
        </div>

        <div class="desktop-premium-body">
          <section class="desktop-premium-main">
            <div class="desktop-premium-kicker">Temukan yang lokal</div>
            <div class="desktop-premium-title-row">
              <strong>Jelajahi Pasar UMKM</strong>
              <span class="desktop-premium-chip">Lubuklinggau</span>
            </div>

            <div class="desktop-premium-categories">
              <article>
                <span class="desktop-premium-icon"><i class="ph ph-fork-knife"></i></span>
                <div><strong>Kuliner</strong><small>Makanan & minuman</small></div>
              </article>
              <article>
                <span class="desktop-premium-icon"><i class="ph ph-t-shirt"></i></span>
                <div><strong>Fashion</strong><small>Produk lokal pilihan</small></div>
              </article>
              <article>
                <span class="desktop-premium-icon"><i class="ph ph-briefcase"></i></span>
                <div><strong>Jasa</strong><small>Layanan untuk kebutuhanmu</small></div>
              </article>
            </div>

            <div class="desktop-premium-feature">
              <div class="desktop-premium-feature-copy">
                <span class="desktop-premium-eyebrow">EKOSISTEM LOKAL</span>
                <strong>Produk, toko, dan layanan dalam satu tempat.</strong>
                <p>Dirancang agar UMKM lebih mudah ditemukan dan pengguna lebih mudah menjelajah.</p>
              </div>
              <div class="desktop-premium-feature-art" aria-hidden="true">
                <div class="desktop-premium-orbit orbit-a"></div>
                <div class="desktop-premium-orbit orbit-b"></div>
                <div class="desktop-premium-core"><i class="ph ph-storefront"></i></div>
              </div>
            </div>
          </section>

          <aside class="desktop-premium-side">
            <div class="desktop-premium-status">
              <span class="desktop-premium-status-dot"></span>
              <div><strong>Pasar UMKM</strong><small>Platform aktif</small></div>
              <i class="ph ph-arrow-up-right"></i>
            </div>

            <div class="desktop-premium-side-card">
              <span class="desktop-premium-side-label">Jelajahi berdasarkan kebutuhan</span>
              <div class="desktop-premium-mini-list">
                <span><i class="ph ph-bag"></i>Belanja produk lokal</span>
                <span><i class="ph ph-storefront"></i>Temukan UMKM</span>
                <span><i class="ph ph-handshake"></i>Akses layanan</span>
              </div>
            </div>

            <div class="desktop-premium-cta">
              <div>
                <span>Mulai dari lokal</span>
                <strong>Dukung UMKM</strong>
              </div>
              <span class="desktop-premium-cta-icon"><i class="ph ph-arrow-up-right"></i></span>
            </div>
          </aside>
        </div>
      </div>

    `;

    hero.appendChild(panel);
    return panel;
  }

  function apply() {
    document.documentElement.classList.toggle('desktop-v10', mq.matches);
    if (mq.matches) ensurePremiumHero();
  }

  mq.addEventListener?.('change', apply);
  document.addEventListener('DOMContentLoaded', apply, { once: true });
  if (document.readyState !== 'loading') apply();

  window.PasarDesktopExperienceV10 = Object.freeze({
    version: '10.3.1',
    refresh: apply
  });
})();
