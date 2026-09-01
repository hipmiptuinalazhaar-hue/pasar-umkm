'use strict';

/* =========================================================
   PASAR UMKM - SOCIAL VIEW SHELL
   Menjaga profil publik, pesan, dan notifikasi memakai shell
   full profile agar header lama tidak bertumpuk.
   ========================================================= */

(() => {
  function syncSocialShell() {
    const socialView = document.querySelector(
      '.social-universal-profile, .social-messages-page, .social-conversation-page, .social-notifications-page'
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
