'use strict';

(() => {
  if (typeof openAccount !== 'function') {
    console.error('[Pasar UMKM] Account resilience patch gagal: openAccount tidak ditemukan.');
    return;
  }

  function loadStylesheet(selector, href, datasetKey) {
    if (document.querySelector(selector)) return;

    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = href;
    stylesheet.dataset[datasetKey] = 'true';
    document.head.appendChild(stylesheet);
  }

  function loadScript(selector, src, datasetKey) {
    if (document.querySelector(selector)) return;

    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset[datasetKey] = 'true';
    document.head.appendChild(script);
  }

  loadStylesheet('link[data-profile-responsive="true"]', 'css/profile-responsive.css?v=1.0', 'profileResponsive');
  loadStylesheet('link[data-profile-edit-style="true"]', 'css/profile-edit.css?v=3.0', 'profileEditStyle');
  loadStylesheet('link[data-profile-premium-style="true"]', 'css/profile-premium.css?v=1.2', 'profilePremiumStyle');
  loadStylesheet('link[data-social-core-style="true"]', 'css/social-core.css?v=1.0', 'socialCoreStyle');
  loadStylesheet('link[data-notification-core-style="true"]', 'css/notification-core.css?v=1.0', 'notificationCoreStyle');
  loadStylesheet('link[data-media-experience-style="true"]', 'css/media-experience.css?v=1.0', 'mediaExperienceStyle');
  loadStylesheet('link[data-mention-autocomplete-style="true"]', 'css/mention-autocomplete.css?v=1.0', 'mentionAutocompleteStyle');

  loadScript('script[data-profile-edit-module="true"]', 'js/profile-edit.js?v=3.0', 'profileEditModule');
  loadScript('script[data-profile-identity-module="true"]', 'js/profile-identity.js?v=2.0', 'profileIdentityModule');
  loadScript('script[data-profile-title-center-module="true"]', 'js/profile-title-center.js?v=1.1', 'profileTitleCenterModule');

  /* Bersihkan deep-link lama lebih dulu saat browser melakukan reload. */
  loadScript('script[data-navigation-refresh-guard="true"]', 'js/navigation-refresh-guard.js?v=1.0', 'navigationRefreshGuard');

  loadScript('script[data-social-core-module="true"]', 'js/social-core.js?v=1.0', 'socialCoreModule');
  loadScript('script[data-like-core-module="true"]', 'js/like-core.js?v=1.1', 'likeCoreModule');
  loadScript('script[data-social-shell-module="true"]', 'js/social-shell.js?v=1.1', 'socialShellModule');

  /* Satu router notifikasi saja. Versi lama tidak dimuat lagi. */
  loadScript('script[data-notification-router-v2="true"]', 'js/notification-router-v2.js?v=2.1', 'notificationRouterV2');
  loadScript('script[data-notification-core-module="true"]', 'js/notification-core.js?v=1.1', 'notificationCoreModule');

  loadScript('script[data-functionality-core-module="true"]', 'js/functionality-core.js?v=1.0', 'functionalityCoreModule');
  loadScript('script[data-saved-remove-core="true"]', 'js/saved-remove-core.js?v=1.0', 'savedRemoveCore');
  loadScript('script[data-rating-core="true"]', 'js/rating-core.js?v=2.0', 'ratingCore');
  loadScript('script[data-business-agency="true"]', 'js/business-agency.js?v=1.0', 'businessAgency');
  loadScript('script[data-store-management-core="true"]', 'js/store-management-core.js?v=2.0', 'storeManagementCore');
  loadScript('script[data-story-render-fix="true"]', 'js/story-render-fix.js?v=1.0', 'storyRenderFix');

  /* Media v2 harus terakhir agar menggantikan story/sell/video placeholder lama. */
  loadScript('script[data-media-experience-module="true"]', 'js/media-experience.js?v=1.0', 'mediaExperienceModule');
  loadScript('script[data-reel-profile-separation="true"]', 'js/reel-profile-separation.js?v=1.0', 'reelProfileSeparation');
  loadScript('script[data-mention-autocomplete-module="true"]', 'js/mention-autocomplete.js?v=1.0', 'mentionAutocompleteModule');

  openAccount = async function resilientOpenAccount() {
    if (!STATE.user) {
      openLogin();
      return;
    }

    closeBottomSheet();
    closeSideMenu();

    STATE.activeNav = 'account';
    updateNavigation();

    const app = document.querySelector('.app');
    app?.classList.add('account-profile-active');

    if (DOM.storiesSection) DOM.storiesSection.hidden = true;
    if (DOM.homeDiscovery) DOM.homeDiscovery.hidden = true;
    if (!DOM.feed) return;

    DOM.feed.innerHTML = `
      <section class="social-account-page">
        <section class="social-account-empty">
          <div class="social-account-empty-icon"><i class="ph ph-user-circle"></i></div>
          <strong>Memuat profil</strong>
          <p>Menyiapkan halaman akun Anda.</p>
        </section>
      </section>
    `;

    let store = null;

    if (STATE.user.role === 'seller' || STATE.user.role === 'admin') {
      const [storeResult, productsResult] = await Promise.allSettled([
        loadCurrentAccountStore(),
        loadCurrentAccountProducts()
      ]);

      if (storeResult.status === 'fulfilled') {
        store = storeResult.value;
        STATE.currentStore = storeResult.value;
      } else {
        console.error('[Pasar UMKM] Account store load error:', storeResult.reason);
        STATE.currentStore = null;
      }

      if (productsResult.status === 'fulfilled') {
        STATE.accountProducts = Array.isArray(productsResult.value)
          ? productsResult.value
          : [];
      } else {
        console.error('[Pasar UMKM] Account products load error:', productsResult.reason);
        STATE.accountProducts = [];
      }
    } else {
      STATE.currentStore = null;
      STATE.accountProducts = [];
    }

    if (typeof window.hydratePersistentSaved === 'function') {
      await window.hydratePersistentSaved({ force: true });
    }

    window.reloadCommerceCart?.().catch?.(() => null);

    renderSocialAccountProfile(store);

    window.decorateOwnProfileContacts?.();
    window.decorateOwnProfileSocial?.();
    window.centerProfileTitle?.();
    window.syncSocialShell?.();
    window.hydratePersistentLikes?.();
    window.refreshNotificationBadge?.();
    window.refreshRatingSummaries?.();
    window.cleanReelsFromPhotoProfileGrids?.();

    window.scrollTo({ top: 0, behavior: 'auto' });
  };
})();
