'use strict';

(() => {
  /*
   * Bootstrap accelerator.
   * app.js masih memakai urutan bootstrap legacy. Daripada membedah controller
   * besar pada tahap ini, empat request publik dipanaskan paralel dan didedupe.
   * Cache hanya hidup singkat di memory tab dan tidak menyentuh endpoint privat.
   */
  const originalFetch = window.fetch.bind(window);
  const publicBootstrapPaths = new Set([
    '/api/categories',
    '/api/stores',
    '/api/products',
    '/api/posts'
  ]);
  const publicResponseCache = new Map();
  const PUBLIC_CACHE_TTL_MS = 20_000;

  function publicRequestKey(input, init) {
    try {
      const request = input instanceof Request
        ? input
        : new Request(input, init);
      const url = new URL(request.url, window.location.href);

      if (url.origin !== window.location.origin) return null;
      if (String(request.method || 'GET').toUpperCase() !== 'GET') return null;
      if (!publicBootstrapPaths.has(url.pathname)) return null;

      return `${url.pathname}${url.search}`;
    } catch {
      return null;
    }
  }

  window.fetch = async function resilientFetch(input, init) {
    const key = publicRequestKey(input, init);

    if (!key) {
      return originalFetch(input, init);
    }

    const now = Date.now();
    const cached = publicResponseCache.get(key);

    if (cached && cached.expiresAt > now) {
      try {
        const response = await cached.promise;
        return response.clone();
      } catch {
        publicResponseCache.delete(key);
      }
    }

    const promise = originalFetch(input, init)
      .then(response => {
        if (!response.ok) publicResponseCache.delete(key);
        return response;
      })
      .catch(error => {
        publicResponseCache.delete(key);
        throw error;
      });

    publicResponseCache.set(key, {
      expiresAt: now + PUBLIC_CACHE_TTL_MS,
      promise
    });

    const response = await promise;
    return response.clone();
  };

  function warmPublicBootstrap() {
    const requestInit = {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    };

    for (const path of publicBootstrapPaths) {
      window.fetch(path, requestInit).catch(() => null);
    }
  }

  warmPublicBootstrap();

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

  /* Core functional modules. Notification presentation is now route-loaded. */
  loadStylesheet('link[data-social-core-style="true"]', 'css/social-core.css?v=1.0', 'socialCoreStyle');

  loadScript('script[data-navigation-refresh-guard="true"]', 'js/navigation-refresh-guard.js?v=1.0', 'navigationRefreshGuard');
  loadScript('script[data-social-core-module="true"]', 'js/social-core.js?v=1.0', 'socialCoreModule');
  loadScript('script[data-like-core-module="true"]', 'js/like-core.js?v=1.1', 'likeCoreModule');
  loadScript('script[data-social-shell-module="true"]', 'js/social-shell.js?v=1.1', 'socialShellModule');
  loadScript('script[data-notification-router-v2="true"]', 'js/notification-router-v2.js?v=2.1', 'notificationRouterV2');
  loadScript('script[data-notification-core-module="true"]', 'js/notification-core.js?v=1.1', 'notificationCoreModule');
  loadScript('script[data-functionality-core-module="true"]', 'js/functionality-core.js?v=1.0', 'functionalityCoreModule');

  let deferredEnhancementsStarted = false;

  function loadDeferredEnhancements() {
    if (deferredEnhancementsStarted) return;
    deferredEnhancementsStarted = true;

    /* profile-responsive + profile-premium retired by UI-P3. */
    loadStylesheet('link[data-profile-edit-style="true"]', 'css/profile-edit.css?v=3.0', 'profileEditStyle');
    loadStylesheet('link[data-media-experience-style="true"]', 'css/media-experience.css?v=1.0', 'mediaExperienceStyle');
    loadStylesheet('link[data-mention-autocomplete-style="true"]', 'css/mention-autocomplete.css?v=1.0', 'mentionAutocompleteStyle');
    loadStylesheet('link[data-chat-experience-style="true"]', 'css/chat-experience.css?v=1.1', 'chatExperienceStyle');
    loadStylesheet('link[data-chat-layout-v2="true"]', 'css/chat-layout-v2.css?v=1.0', 'chatLayoutV2');
    loadStylesheet('link[data-chat-whatsapp-v3="true"]', 'css/chat-whatsapp-v3.css?v=1.0', 'chatWhatsappV3');
    loadStylesheet('link[data-chat-bubble-final="true"]', 'css/chat-bubble-final.css?v=1.0', 'chatBubbleFinal');

    loadScript('script[data-profile-edit-module="true"]', 'js/profile-edit.js?v=3.0', 'profileEditModule');
    loadScript('script[data-profile-identity-module="true"]', 'js/profile-identity.js?v=2.0', 'profileIdentityModule');
    loadScript('script[data-profile-title-center-module="true"]', 'js/profile-title-center.js?v=1.1', 'profileTitleCenterModule');
    loadScript('script[data-chat-experience-module="true"]', 'js/chat-experience.js?v=1.2', 'chatExperienceModule');
    loadScript('script[data-chat-media-experience="true"]', 'js/chat-media-experience.js?v=1.0', 'chatMediaExperience');
    loadScript('script[data-chat-mark-read-module="true"]', 'js/chat-mark-read.js?v=1.0', 'chatMarkReadModule');
    loadScript('script[data-saved-remove-core="true"]', 'js/saved-remove-core.js?v=1.0', 'savedRemoveCore');
    loadScript('script[data-rating-core="true"]', 'js/rating-core.js?v=2.1', 'ratingCore');
    loadScript('script[data-business-agency="true"]', 'js/business-agency.js?v=1.0', 'businessAgency');
    loadScript('script[data-store-management-core="true"]', 'js/store-management-core.js?v=2.0', 'storeManagementCore');
    loadScript('script[data-story-render-fix="true"]', 'js/story-render-fix.js?v=1.0', 'storyRenderFix');
    loadScript('script[data-media-experience-module="true"]', 'js/media-experience.js?v=1.0', 'mediaExperienceModule');
    loadScript('script[data-reel-profile-separation="true"]', 'js/reel-profile-separation.js?v=1.1', 'reelProfileSeparation');
    loadScript('script[data-mention-autocomplete-module="true"]', 'js/mention-autocomplete.js?v=1.0', 'mentionAutocompleteModule');
  }

  function scheduleDeferredEnhancements() {
    const start = () => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(loadDeferredEnhancements, { timeout: 1800 });
      } else {
        window.setTimeout(loadDeferredEnhancements, 500);
      }
    };

    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
  }

  document.addEventListener('pointerdown', event => {
    const target = event.target?.closest?.(
      '[data-action="messages"], [data-action="account-edit"], [data-nav="account"], [data-nav="reels"], [data-nav="sell"], [data-action="open-story"], [data-action="add-story"], [data-menu-action="store"], [data-menu-action="seller-products"], [data-menu-action="orders"], [data-menu-action="favorites"]'
    );

    if (target) loadDeferredEnhancements();
  }, { capture: true, passive: true });

  scheduleDeferredEnhancements();

  /* =======================================================
     UI-P3 SOCIAL PRESENTATION ROUTE LOADER
     Three CSS bundles instead of one 55KB social stylesheet.
     ======================================================= */

  const socialStyleRoutes = Object.freeze({
    profile: {
      href: 'css/social-experience-v3.css?v=3.1',
      selector: 'link[data-social-p3-style="profile"]'
    },
    engagement: {
      href: 'css/social-engagement-v3.css?v=3.0',
      selector: 'link[data-social-p3-style="engagement"]'
    },
    media: {
      href: 'css/social-media-v3.css?v=3.0',
      selector: 'link[data-social-p3-style="media"]'
    }
  });

  let socialScriptPromise = null;

  function ensureSocialPresentationStyle(kind = 'profile') {
    const route = socialStyleRoutes[kind] || socialStyleRoutes.profile;
    const existing = document.querySelector(route.selector);

    if (existing) {
      /* Keep P3 after any legacy CSS that was appended later. */
      document.head.appendChild(existing);
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = route.href;
      stylesheet.dataset.socialP3Style = kind;
      stylesheet.onload = () => resolve(stylesheet);
      stylesheet.onerror = () => reject(
        new Error(`Social ${kind} stylesheet gagal dimuat.`)
      );
      document.head.appendChild(stylesheet);
    });
  }

  function ensureSocialPresentationScript() {
    if (window.PasarSocialExperience?.version === '3.0') {
      window.PasarSocialExperience.upgrade?.();
      return Promise.resolve(window.PasarSocialExperience);
    }

    if (socialScriptPromise) return socialScriptPromise;

    const existing = document.querySelector(
      'script[data-social-experience-v3="true"]'
    );

    if (existing) {
      socialScriptPromise = new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const timer = window.setInterval(() => {
          if (window.PasarSocialExperience?.version === '3.0') {
            window.clearInterval(timer);
            resolve(window.PasarSocialExperience);
            return;
          }

          if (Date.now() - startedAt > 5000) {
            window.clearInterval(timer);
            reject(new Error('Social Experience belum siap.'));
          }
        }, 30);
      });

      return socialScriptPromise;
    }

    socialScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'js/social-experience-v3.js?v=3.0';
      script.async = true;
      script.dataset.socialExperienceV3 = 'true';
      script.onload = () => {
        if (window.PasarSocialExperience?.version === '3.0') {
          resolve(window.PasarSocialExperience);
        } else {
          reject(new Error('Social Experience tidak terinisialisasi.'));
        }
      };
      script.onerror = () => reject(
        new Error('Social Experience module gagal dimuat.')
      );
      document.body.appendChild(script);
    }).catch(error => {
      socialScriptPromise = null;
      throw error;
    });

    return socialScriptPromise;
  }

  function loadSocialPresentation(kind = 'profile') {
    return Promise.all([
      ensureSocialPresentationStyle(kind),
      ensureSocialPresentationScript()
    ]).then(([, module]) => {
      module?.upgrade?.();
      return module;
    });
  }

  const socialIntentSelector = [
    '[data-nav="account"]',
    '[data-nav="reels"]',
    '[data-action="notifications"]',
    '[data-action="comments"]',
    '[data-action="seller-profile"]',
    '[data-action="open-story"]',
    '[data-action="add-story"]',
    '[data-social-action]',
    '.social-follow-user',
    '.post-comment-name',
    '.post-comment-avatar',
    '.notification-row'
  ].join(',');

  function socialIntentKind(target) {
    if (!target) return 'profile';

    if (
      target.matches('[data-action="notifications"], [data-action="comments"]')
    ) {
      return 'engagement';
    }

    if (
      target.matches('[data-nav="reels"], [data-action="open-story"], [data-action="add-story"]')
    ) {
      return 'media';
    }

    return 'profile';
  }

  function warmSocialIntent(event) {
    const target = event.target?.closest?.(socialIntentSelector);
    if (!target) return;

    loadSocialPresentation(socialIntentKind(target)).catch(() => null);
  }

  document.addEventListener(
    'pointerdown',
    warmSocialIntent,
    { capture: true, passive: true }
  );

  document.addEventListener(
    'click',
    event => {
      const target = event.target?.closest?.(socialIntentSelector);
      if (!target) return;

      loadSocialPresentation(socialIntentKind(target)).catch(error => {
        console.error('[Pasar UMKM] Social presentation load error:', error);
      });
    },
    true
  );

  openAccount = async function resilientOpenAccount() {
    if (!STATE.user) {
      openLogin();
      return;
    }

    loadDeferredEnhancements();
    loadSocialPresentation('profile').catch(() => null);
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
    window.PasarSocialExperience?.upgrade?.();

    window.scrollTo({ top: 0, behavior: 'auto' });
  };
})();
