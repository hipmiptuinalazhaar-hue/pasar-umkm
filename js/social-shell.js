'use strict';

/* =========================================================
   PASAR UMKM - SOCIAL VIEW SHELL
   Menjaga profil publik dan pesan memakai shell full profile,
   sehingga app header lama tidak bertumpuk dengan topbar sosial.
   ========================================================= */

(() => {
  function syncSocialShell() {
    const socialView = document.querySelector(
      '.social-universal-profile, .social-messages-page, .social-conversation-page'
    );

    if (!socialView) {
      return;
    }

    document
      .querySelector('.app')
      ?.classList.add('account-profile-active');
  }

  const observer = new MutationObserver(
    syncSocialShell
  );

  observer.observe(
    document.body,
    {
      childList: true,
      subtree: true
    }
  );

  document.addEventListener(
    'DOMContentLoaded',
    syncSocialShell,
    { once: true }
  );

  window.syncSocialShell = syncSocialShell;
})();
