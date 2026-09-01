'use strict';

/* =========================================================
   PASAR UMKM - ACCOUNT PROFILE HARDENING
   Data resilience + profile highlight layout.
   Loaded after app.js so stable core code stays untouched.
   ========================================================= */

(() => {
  if (typeof openAccount !== 'function') {
    console.error(
      '[Pasar UMKM] Account resilience patch gagal: openAccount tidak ditemukan.'
    );
    return;
  }


  /* =======================================================
     PROFILE HIGHLIGHTS LAYOUT
     3 item = 3 kolom, 4 item = 4 kolom, tetap satu baris.
     ======================================================= */

  if (!document.getElementById('accountProfileLayoutStyles')) {
    const style =
      document.createElement('style');

    style.id =
      'accountProfileLayoutStyles';

    style.textContent = `
      .social-account-page .social-account-highlights {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(62px, 1fr));
        align-items: start;
        gap: 8px;
        width: 100%;
        overflow: visible;
      }

      .social-account-page .social-account-highlight {
        width: 100%;
        min-width: 0;
        justify-self: stretch;
      }

      .social-account-page .social-account-highlight-ring {
        margin-inline: auto;
      }

      .social-account-page .social-account-highlight-label {
        width: 100%;
        text-align: center;
      }

      @media (max-width: 360px) {
        .social-account-page .social-account-highlights {
          gap: 6px;
          grid-template-columns: repeat(auto-fit, minmax(58px, 1fr));
        }
      }
    `;

    document.head.appendChild(style);
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
