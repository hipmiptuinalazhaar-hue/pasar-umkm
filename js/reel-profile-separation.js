'use strict';

(() => {
  function activeOwnTab(page) {
    return page
      ?.querySelector('.social-account-tab.active')
      ?.dataset?.tab || '';
  }

  function activePublicTab(page) {
    const active = page?.querySelector('.social-profile-tab.active');
    if (!active) return '';
    if (active.dataset.mediaAction === 'public-videos') return 'videos';
    return active.dataset.tab || '';
  }

  function normalizePublicTabColumns(page) {
    const tabs = page?.querySelector('.social-profile-tabs');
    if (!tabs) return;
    const count = Math.max(1, tabs.querySelectorAll('.social-profile-tab').length);
    tabs.style.gridTemplateColumns = `repeat(${count}, minmax(0, 1fr))`;
  }

  function cleanOwnProfile() {
    document
      .querySelectorAll('.social-account-page:not(.social-universal-profile)')
      .forEach(page => {
        if (activeOwnTab(page) === 'videos') return;
        page
          .querySelectorAll('#socialAccountContent [data-post-id^="reel-"]')
          .forEach(item => item.remove());
      });
  }

  function cleanPublicProfile() {
    document
      .querySelectorAll('.social-universal-profile')
      .forEach(page => {
        normalizePublicTabColumns(page);
        if (activePublicTab(page) === 'videos') return;
        page
          .querySelectorAll('.social-profile-grid [data-social-item-id^="reel-"]')
          .forEach(item => item.remove());
      });
  }

  function clean() {
    cleanOwnProfile();
    cleanPublicProfile();
  }

  function loadReelsCommerceV4() {
    if (!document.querySelector('link[data-reels-commerce-v4-style]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'css/reels-commerce-v4.css?v=4.0';
      link.dataset.reelsCommerceV4Style = 'true';
      document.head.appendChild(link);
    }

    if (!document.querySelector('script[data-reels-commerce-v4-script]')) {
      const script = document.createElement('script');
      script.src = 'js/reels-commerce-v4.js?v=4.0';
      script.async = false;
      script.dataset.reelsCommerceV4Script = 'true';
      script.onerror = () => console.error('[Pasar UMKM] Reels Commerce V4 gagal dimuat.');
      document.body.appendChild(script);
    }
  }

  const observer = new MutationObserver(clean);
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('click', event => {
    if (event.target.closest('.social-account-tab, .social-profile-tab')) {
      requestAnimationFrame(clean);
    }
  }, true);

  window.cleanReelsFromPhotoProfileGrids = clean;
  clean();
  loadReelsCommerceV4();
})();
