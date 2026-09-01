'use strict';

/* =========================================================
   PASAR UMKM - ACCOUNT DATA RESILIENCE
   Store dan produk dimuat secara independen agar kegagalan
   satu request tidak menjatuhkan seluruh halaman profil.
   Loaded after app.js so stable core code stays untouched.
   ========================================================= */

(() => {
  if (typeof openAccount !== 'function') {
    console.error(
      '[Pasar UMKM] Account resilience patch gagal: openAccount tidak ditemukan.'
    );
    return;
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
