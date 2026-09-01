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


  /* =======================================================
     PROFILE RESPONSIVE STYLESHEET
     Style dipisahkan dari logic agar arsitektur tetap bersih.
     ======================================================= */

  if (
    !document.querySelector(
      'link[data-profile-responsive="true"]'
    )
  ) {
    const profileStylesheet =
      document.createElement('link');

    profileStylesheet.rel =
      'stylesheet';

    profileStylesheet.href =
      'css/profile-responsive.css?v=1.0';

    profileStylesheet.dataset.profileResponsive =
      'true';

    document.head.appendChild(
      profileStylesheet
    );
  }


  /* =======================================================
     EDIT PROFILE MODULE
     Dimuat sebagai modul kecil agar app.js tidak makin gemuk.
     ======================================================= */

  if (
    !document.querySelector(
      'link[data-profile-edit-style="true"]'
    )
  ) {
    const editStylesheet =
      document.createElement('link');

    editStylesheet.rel =
      'stylesheet';

    editStylesheet.href =
      'css/profile-edit.css?v=2.0';

    editStylesheet.dataset.profileEditStyle =
      'true';

    document.head.appendChild(
      editStylesheet
    );
  }

  if (
    !document.querySelector(
      'script[data-profile-edit-module="true"]'
    )
  ) {
    const editScript =
      document.createElement('script');

    editScript.src =
      'js/profile-edit.js?v=2.0';

    editScript.async = false;

    editScript.dataset.profileEditModule =
      'true';

    document.head.appendChild(
      editScript
    );
  }


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

          <strong>
            Memuat profil
          </strong>

          <p>
            Menyiapkan halaman akun Anda.
          </p>

        </section>

      </section>
    `;

    let store =
      STATE.currentStore || null;

    if (
      STATE.user.role === 'seller' ||
      STATE.user.role === 'admin'
    ) {
      const [
        storeResult,
        productsResult
      ] = await Promise.allSettled([
        loadCurrentAccountStore(),
        loadCurrentAccountProducts()
      ]);

      if (
        storeResult.status === 'fulfilled'
      ) {
        store =
          storeResult.value;

        STATE.currentStore =
          storeResult.value;
      } else {
        console.error(
          '[Pasar UMKM] Account store load error:',
          storeResult.reason
        );

        store =
          STATE.currentStore || null;
      }

      if (
        productsResult.status === 'fulfilled'
      ) {
        STATE.accountProducts =
          Array.isArray(
            productsResult.value
          )
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
