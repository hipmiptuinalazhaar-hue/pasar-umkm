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
    'css/profile-edit.css?v=2.0',
    'profileEditStyle'
  );

  loadStylesheet(
    'link[data-profile-premium-style="true"]',
    'css/profile-premium.css?v=1.0',
    'profilePremiumStyle'
  );

  loadScript(
    'script[data-profile-edit-module="true"]',
    'js/profile-edit.js?v=2.0',
    'profileEditModule'
  );

  loadScript(
    'script[data-profile-identity-module="true"]',
    'js/profile-identity.js?v=1.0',
    'profileIdentityModule'
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

    let store =
      STATE.currentStore || null;

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

    window.scrollTo({
      top: 0,
      behavior: 'auto'
    });
  };
})();
