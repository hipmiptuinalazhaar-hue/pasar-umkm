'use strict';

/* =========================================================
   PASAR UMKM - PROFILE TITLE TRUE CENTER
   Profil sendiri mengikuti topbar lokal. Profil publik memakai
   pusat viewport aktual agar judul benar-benar seperti Instagram.
   ========================================================= */

(() => {
  let frameId = 0;

  function getProfilePage() {
    return document.querySelector('.social-account-page');
  }

  function getProfileTitle(topbar) {
    if (!topbar) return null;

    return (
      topbar.querySelector('.social-account-username') ||
      topbar.querySelector('.social-profile-title') ||
      Array.from(topbar.children).find(
        element => element.tagName === 'STRONG'
      ) ||
      null
    );
  }

  function normalizeProfileSpacing(page) {
    if (!page) return;

    const description = page.querySelector(
      '.social-profile-description, .social-account-description'
    );

    if (description) {
      const cleanText = description.textContent.trim();

      if (description.textContent !== cleanText) {
        description.textContent = cleanText;
      }

      Object.assign(description.style, {
        marginTop: '8px',
        marginBottom: '0'
      });
    }

    const rating = page.querySelector('.store-rating-line');

    if (rating) {
      Object.assign(rating.style, {
        marginTop: '8px',
        marginBottom: '0',
        lineHeight: '1.25'
      });
    }
  }

  function centerProfileTitle() {
    const page = getProfilePage();
    const topbar = page?.querySelector('.social-account-topbar');
    const title = getProfileTitle(topbar);

    if (!page || !topbar || !title) return;

    normalizeProfileSpacing(page);

    const isPublic = page.classList.contains('public-seller-profile');
    const topbarRect = topbar.getBoundingClientRect();

    if (isPublic) {
      /*
       * Profil publik sebelumnya bisa terlihat beberapa puluh pixel
       * bergeser karena kombinasi grid, padding, dan override CSS.
       * Fixed terhadap viewport membuat pusatnya selalu 50vw.
       */
      const top = topbarRect.top + (topbarRect.height / 2);

      Object.assign(title.style, {
        position: 'fixed',
        left: '50vw',
        right: 'auto',
        top: `${top}px`,
        transform: 'translate(-50%, -50%)',
        width: 'min(58vw, 300px)',
        maxWidth: 'calc(100vw - 132px)',
        margin: '0',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        pointerEvents: 'none',
        zIndex: '21'
      });

      if (typeof DOM !== 'undefined') {
        if (DOM.storiesSection) DOM.storiesSection.hidden = true;
        if (DOM.homeDiscovery) DOM.homeDiscovery.hidden = true;
      }
    } else {
      const viewportWidth =
        document.documentElement.clientWidth ||
        window.innerWidth ||
        topbarRect.width;

      const targetLeft =
        (viewportWidth / 2) - topbarRect.left;

      Object.assign(title.style, {
        position: 'absolute',
        left: `${targetLeft}px`,
        right: 'auto',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'auto',
        maxWidth: 'calc(100% - 132px)',
        margin: '0',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        pointerEvents: 'none',
        zIndex: '1'
      });
    }

    const strong =
      title.matches('strong')
        ? title
        : title.querySelector('strong');

    if (strong) {
      Object.assign(strong.style, {
        display: 'block',
        width: '100%',
        margin: '0',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      });
    }
  }

  function scheduleCentering() {
    if (frameId) cancelAnimationFrame(frameId);

    frameId = requestAnimationFrame(() => {
      frameId = 0;
      centerProfileTitle();
    });
  }

  const observer = new MutationObserver(scheduleCentering);

  observer.observe(
    document.body,
    {
      childList: true,
      subtree: true
    }
  );

  window.addEventListener(
    'resize',
    scheduleCentering,
    { passive: true }
  );

  window.addEventListener(
    'scroll',
    scheduleCentering,
    { passive: true }
  );

  window.addEventListener(
    'orientationchange',
    scheduleCentering,
    { passive: true }
  );

  document.addEventListener(
    'visibilitychange',
    () => {
      if (!document.hidden) scheduleCentering();
    }
  );

  window.centerProfileTitle = centerProfileTitle;
  scheduleCentering();
})();
