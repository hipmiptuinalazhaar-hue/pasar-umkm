'use strict';

/* =========================================================
   PASAR UMKM - ACCOUNT DATA RESILIENCE
   Store dan produk dimuat secara independen agar kegagalan
   satu request tidak menjatuhkan seluruh halaman profil.
   ========================================================= */

(() => {
  if (typeof openAccount !== 'function') {
    console.error(
      '[Pasar UMKM] Account resilience patch gagal: openAccount tidak ditemukan.'
    );
    return;
  }

  function loadStylesheet(selector, href, datasetKey) {
    if (document.querySelector(selector)) {
      return;
    }

    const stylesheet =
      document.createElement('link');

    stylesheet.rel = 'stylesheet';
    stylesheet.href = href;
    stylesheet.dataset[datasetKey] = 'true';

    document.head.appendChild(stylesheet);
  }

  function loadScript(selector, src, datasetKey) {
    if (document.querySelector(selector)) {
      return;
    }

    const script =
      document.createElement('script');

    script.src = src;
    script.async = false;
    script.dataset[datasetKey] = 'true';

    document.head.appendChild(script);
  }

  loadStylesheet(
    'link[data-profile-responsive="true"]',
    'css/profile-responsive.css?v=1.0',
    'profileResponsive'
  );

  loadStylesheet(
    'link[data-profile-edit-style="true"]',
    'css/profile-edit.css?v=3.0',
    'profileEditStyle'
  );

  loadStylesheet(
    'link[data-profile-premium-style="true"]',
    'css/profile-premium.css?v=1.2',
    'profilePremiumStyle'
  );

  loadStylesheet(
    'link[data-social-core-style="true"]',
    'css/social-core.css?v=1.0',
    'socialCoreStyle'
  );

  loadStylesheet(
    'link[data-notification-core-style="true"]',
    'css/notification-core.css?v=1.0',
    'notificationCoreStyle'
  );

  loadScript(
    'script[data-profile-edit-module="true"]',
    'js/profile-edit.js?v=3.0',
    'profileEditModule'
  );

  loadScript(
    'script[data-profile-identity-module="true"]',
    'js/profile-identity.js?v=2.0',
    'profileIdentityModule'
  );

  loadScript(
    'script[data-profile-title-center-module="true"]',
    'js/profile-title-center.js?v=1.0',
    'profileTitleCenterModule'
  );

  loadScript(
    'script[data-social-core-module="true"]',
    'js/social-core.js?v=1.0',
    'socialCoreModule'
  );

  loadScript(
    'script[data-like-core-module="true"]',
    'js/like-core.js?v=1.0',
    'likeCoreModule'
  );

  loadScript(
    'script[data-social-shell-module="true"]',
    'js/social-shell.js?v=1.1',
    'socialShellModule'
  );

  loadScript(
    'script[data-notification-core-module="true"]',
    'js/notification-core.js?v=1.0',
    'notificationCoreModule'
  );

  openAccount = async function resilientOpenAccount() {
    if (!STATE.user) {
      openLogin();
      return;
    }

    closeBottomSheet();
    closeSideMenu();

    STATE.activeNav = 'account';
    updateNavigation();

    const app =
      document.querySelector('.app');

    app?.classList.add(
      'account-profile-active'
    );

    if (DOM.storiesSection) {
      DOM.storiesSection.hidden = true;
    }

    if (DOM.homeDiscovery) {
      DOM.homeDiscovery.hidden = true;
    }

    if (!DOM.feed) {
      return;
    }

    DOM.feed.innerHTML = `
      <section class="social-account-page">
        <section class="social-account-empty">
          <div class="social-account-empty-icon">
            <i class="ph ph-user-circle"></i>
          </div>
          <strong>Memuat profil</strong>
          <p>Menyiapkan halaman akun Anda.</p>
        </section>
      </section>
    `;

    let store = STATE.currentStore || null;

    if (
      STATE.user.role === 'seller' ||
      STATE.user.role === 'admin'
    ) {
      const [storeResult, productsResult] =
        await Promise.allSettled([
          loadCurrentAccountStore(),
          loadCurrentAccountProducts()
        ]);

      if (storeResult.status === 'fulfilled') {
        store = storeResult.value;
        STATE.currentStore = storeResult.value;
      } else {
        console.error(
          '[Pasar UMKM] Account store load error:',
          storeResult.reason
        );
        store = STATE.currentStore || null;
      }

      if (productsResult.status === 'fulfilled') {
        STATE.accountProducts =
          Array.isArray(productsResult.value)
            ? productsResult.value
            : [];
      } else {
        console.error(
          '[Pasar UMKM] Account products load error:',
          productsResult.reason
        );
        STATE.accountProducts = [];
      }
    } else {
      STATE.accountProducts = [];
    }

    renderSocialAccountProfile(store);

    if (
      typeof window.decorateOwnProfileContacts ===
      'function'
    ) {
      window.decorateOwnProfileContacts();
    }

    if (
      typeof window.decorateOwnProfileSocial ===
      'function'
    ) {
      window.decorateOwnProfileSocial();
    }

    if (
      typeof window.centerProfileTitle ===
      'function'
    ) {
      window.centerProfileTitle();
    }

    if (
      typeof window.syncSocialShell ===
      'function'
    ) {
      window.syncSocialShell();
    }

    if (
      typeof window.hydratePersistentLikes ===
      'function'
    ) {
      window.hydratePersistentLikes();
    }

    if (
      typeof window.refreshNotificationBadge ===
      'function'
    ) {
      window.refreshNotificationBadge();
    }

    window.scrollTo({
      top: 0,
      behavior: 'auto'
    });
  };
})();
