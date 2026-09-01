'use strict';

/* =========================================================
   PASAR UMKM - PROFILE TITLE TRUE CENTER
   Memusatkan judul profil terhadap viewport aktual, bukan
   sekadar terhadap susunan tombol di dalam topbar.
   ========================================================= */

(() => {
  let frameId = 0;

  function getProfileTitle(topbar) {
    if (!topbar) {
      return null;
    }

    return (
      topbar.querySelector('.social-account-username') ||
      Array.from(topbar.children).find(
        element => element.tagName === 'STRONG'
      ) ||
      null
    );
  }

  function centerProfileTitle() {
    const topbar = document.querySelector(
      '.social-account-page .social-account-topbar'
    );

    const title = getProfileTitle(topbar);

    if (!topbar || !title) {
      return;
    }

    const topbarRect =
      topbar.getBoundingClientRect();

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
    if (frameId) {
      cancelAnimationFrame(frameId);
    }

    frameId = requestAnimationFrame(() => {
      frameId = 0;
      centerProfileTitle();
    });
  }

  const observer = new MutationObserver(() => {
    scheduleCentering();
  });

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
    'orientationchange',
    scheduleCentering,
    { passive: true }
  );

  document.addEventListener(
    'visibilitychange',
    () => {
      if (!document.hidden) {
        scheduleCentering();
      }
    }
  );

  window.centerProfileTitle =
    centerProfileTitle;

  scheduleCentering();
})();
