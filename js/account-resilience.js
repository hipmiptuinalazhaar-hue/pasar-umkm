'use strict';

(() => {
  /* =======================================================
     UI-P6 BOOTSTRAP + FEATURE DELIVERY
     - public bootstrap requests are warmed in parallel
     - core social modules move off the critical render path
     - profile/media/business enhancements load by intent
     - Commerce V2 and Chat V7 keep their own owners/loaders
     ======================================================= */

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
      const request = input instanceof Request ? input : new Request(input, init);
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
    if (!key) return originalFetch(input, init);

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
    console.error('[Pasar UMKM] P6 loader gagal: openAccount tidak ditemukan.');
    return;
  }

  const stylePromises = new Map();
  const scriptPromises = new Map();

  function loadStylesheet(selector, href, datasetKey) {
    const existing = document.querySelector(selector);
    if (existing) return Promise.resolve(existing);
    if (stylePromises.has(href)) return stylePromises.get(href);

    const promise = new Promise((resolve, reject) => {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = href;
      stylesheet.dataset[datasetKey] = 'true';
      stylesheet.onload = () => resolve(stylesheet);
      stylesheet.onerror = () => reject(new Error(`Stylesheet gagal dimuat: ${href}`));
      document.head.appendChild(stylesheet);
    }).catch(error => {
      stylePromises.delete(href);
      throw error;
    });

    stylePromises.set(href, promise);
    return promise;
  }

  function loadScript(selector, src, datasetKey) {
    const existing = document.querySelector(selector);
    if (existing) return Promise.resolve(existing);
    if (scriptPromises.has(src)) return scriptPromises.get(src);

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset[datasetKey] = 'true';
      script.onload = () => resolve(script);
      script.onerror = () => reject(new Error(`Module gagal dimuat: ${src}`));
      document.head.appendChild(script);
    }).catch(error => {
      scriptPromises.delete(src);
      throw error;
    });

    scriptPromises.set(src, promise);
    return promise;
  }

  const CORE_SCRIPTS = [
    ['script[data-navigation-refresh-guard="true"]', 'js/navigation-refresh-guard.js?v=1.0', 'navigationRefreshGuard'],
    ['script[data-social-core-module="true"]', 'js/social-core.js?v=1.0', 'socialCoreModule'],
    ['script[data-like-core-module="true"]', 'js/like-core.js?v=1.1', 'likeCoreModule'],
    ['script[data-social-shell-module="true"]', 'js/social-shell.js?v=1.1', 'socialShellModule'],
    ['script[data-notification-router-v2="true"]', 'js/notification-router-v2.js?v=2.1', 'notificationRouterV2'],
    ['script[data-notification-core-module="true"]', 'js/notification-core.js?v=1.1', 'notificationCoreModule'],
    ['script[data-functionality-core-module="true"]', 'js/functionality-core.js?v=1.0', 'functionalityCoreModule']
  ];

  let corePromise = null;
  let coreReady = false;

  function ensureCoreEnhancements() {
    if (coreReady) return Promise.resolve(true);
    if (corePromise) return corePromise;

    corePromise = (async () => {
      const stylePromise = loadStylesheet(
        'link[data-social-core-style="true"]',
        'css/social-core.css?v=1.0',
        'socialCoreStyle'
      );

      for (const [selector, src, key] of CORE_SCRIPTS) {
        await loadScript(selector, src, key);
      }

      await stylePromise;
      coreReady = true;
      return true;
    })().catch(error => {
      corePromise = null;
      throw error;
    });

    return corePromise;
  }

  let profilePromise = null;
  let profileReady = false;

  function ensureProfileEnhancements() {
    if (profileReady) return Promise.resolve(true);
    if (profilePromise) return profilePromise;

    profilePromise = (async () => {
      await ensureCoreEnhancements();
      await loadStylesheet(
        'link[data-profile-edit-style="true"]',
        'css/profile-edit.css?v=3.0',
        'profileEditStyle'
      );

      const modules = [
        ['script[data-profile-edit-module="true"]', 'js/profile-edit.js?v=3.0', 'profileEditModule'],
        ['script[data-profile-identity-module="true"]', 'js/profile-identity.js?v=2.0', 'profileIdentityModule'],
        ['script[data-profile-title-center-module="true"]', 'js/profile-title-center.js?v=1.1', 'profileTitleCenterModule'],
        ['script[data-saved-remove-core="true"]', 'js/saved-remove-core.js?v=1.0', 'savedRemoveCore'],
        ['script[data-rating-core="true"]', 'js/rating-core.js?v=2.1', 'ratingCore']
      ];

      for (const [selector, src, key] of modules) {
        await loadScript(selector, src, key);
      }

      profileReady = true;
      return true;
    })().catch(error => {
      profilePromise = null;
      throw error;
    });

    return profilePromise;
  }

  let mediaPromise = null;
  let mediaReady = false;

  function ensureMediaEnhancements() {
    if (mediaReady) return Promise.resolve(true);
    if (mediaPromise) return mediaPromise;

    mediaPromise = (async () => {
      await ensureCoreEnhancements();
      await Promise.all([
        loadStylesheet(
          'link[data-media-experience-style="true"]',
          'css/media-experience.css?v=1.0',
          'mediaExperienceStyle'
        ),
        loadStylesheet(
          'link[data-mention-autocomplete-style="true"]',
          'css/mention-autocomplete.css?v=1.0',
          'mentionAutocompleteStyle'
        )
      ]);

      const modules = [
        ['script[data-story-render-fix="true"]', 'js/story-render-fix.js?v=1.0', 'storyRenderFix'],
        ['script[data-media-experience-module="true"]', 'js/media-experience.js?v=1.0', 'mediaExperienceModule'],
        ['script[data-reel-profile-separation="true"]', 'js/reel-profile-separation.js?v=1.1', 'reelProfileSeparation'],
        ['script[data-mention-autocomplete-module="true"]', 'js/mention-autocomplete.js?v=1.0', 'mentionAutocompleteModule']
      ];

      for (const [selector, src, key] of modules) {
        await loadScript(selector, src, key);
      }

      mediaReady = true;
      return true;
    })().catch(error => {
      mediaPromise = null;
      throw error;
    });

    return mediaPromise;
  }

  let businessPromise = null;
  let businessReady = false;

  function ensureBusinessEnhancements() {
    if (businessReady) return Promise.resolve(true);
    if (businessPromise) return businessPromise;

    businessPromise = ensureCoreEnhancements()
      .then(() => loadScript(
        'script[data-business-agency="true"]',
        'js/business-agency.js?v=1.0',
        'businessAgency'
      ))
      .then(() => {
        businessReady = true;
        return true;
      })
      .catch(error => {
        businessPromise = null;
        throw error;
      });

    return businessPromise;
  }

  const replaying = new WeakSet();

  function installIntentGate(selector, isReady, loader) {
    document.addEventListener('pointerdown', event => {
      const target = event.target?.closest?.(selector);
      if (!target || isReady()) return;
      loader().catch(() => null);
    }, { capture: true, passive: true });

    document.addEventListener('click', async event => {
      const target = event.target?.closest?.(selector);
      if (!target || isReady() || replaying.has(target)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      target.setAttribute('aria-busy', 'true');

      try {
        await loader();
        replaying.add(target);
        target.click();
        queueMicrotask(() => replaying.delete(target));
      } catch (error) {
        console.error('[Pasar UMKM] Feature intent load error:', error);
        if (typeof showToast === 'function') {
          showToast('Fitur belum dapat dibuka. Coba lagi.');
        }
      } finally {
        target.removeAttribute('aria-busy');
      }
    }, true);
  }

  installIntentGate(
    '[data-action="notifications"], [data-action="comments"], [data-action="like"], [data-action="save"], [data-action="seller-profile"], [data-menu-action="favorites"]',
    () => coreReady,
    ensureCoreEnhancements
  );

  installIntentGate(
    '[data-nav="account"], [data-action="account-edit"]',
    () => profileReady,
    ensureProfileEnhancements
  );

  installIntentGate(
    '[data-nav="reels"], [data-action="open-story"], [data-action="add-story"]',
    () => mediaReady,
    ensureMediaEnhancements
  );

  installIntentGate(
    '[data-menu-action="business-agency"], [data-function-action="business-agency"]',
    () => businessReady,
    ensureBusinessEnhancements
  );

  function runIdle(task, timeout = 2500) {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(task, { timeout });
    } else {
      window.setTimeout(task, 450);
    }
  }

  function schedulePostRenderWarmup() {
    const start = () => {
      window.setTimeout(() => {
        runIdle(() => {
          ensureCoreEnhancements()
            .then(() => runIdle(() => ensureMediaEnhancements().catch(() => null), 5000))
            .catch(() => null);
        }, 3000);
      }, 700);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }
  }

  schedulePostRenderWarmup();

  /* =======================================================
     UI-P3 SOCIAL PRESENTATION ROUTE LOADER
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
      document.head.appendChild(existing);
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = route.href;
      stylesheet.dataset.socialP3Style = kind;
      stylesheet.onload = () => resolve(stylesheet);
      stylesheet.onerror = () => reject(new Error(`Social ${kind} stylesheet gagal dimuat.`));
      document.head.appendChild(stylesheet);
    });
  }

  function ensureSocialPresentationScript() {
    if (window.PasarSocialExperience?.version === '3.0') {
      window.PasarSocialExperience.upgrade?.();
      return Promise.resolve(window.PasarSocialExperience);
    }

    if (socialScriptPromise) return socialScriptPromise;

    const existing = document.querySelector('script[data-social-experience-v3="true"]');
    if (existing) {
      socialScriptPromise = new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const timer = window.setInterval(() => {
          if (window.PasarSocialExperience?.version === '3.0') {
            window.clearInterval(timer);
            resolve(window.PasarSocialExperience);
          } else if (Date.now() - startedAt > 5000) {
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
      script.onerror = () => reject(new Error('Social Experience module gagal dimuat.'));
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
    '.notification-row',
    '.reel-author[data-media-action="reel-profile"]',
    '.story-viewer-author'
  ].join(',');

  function socialIntentKind(target) {
    if (!target) return 'profile';
    if (target.matches('[data-action="notifications"], [data-action="comments"]')) {
      return 'engagement';
    }
    if (target.matches('[data-nav="reels"], [data-action="open-story"], [data-action="add-story"]')) {
      return 'media';
    }
    return 'profile';
  }

  document.addEventListener('pointerdown', event => {
    const target = event.target?.closest?.(socialIntentSelector);
    if (!target) return;
    loadSocialPresentation(socialIntentKind(target)).catch(() => null);
  }, { capture: true, passive: true });

  document.addEventListener('click', event => {
    const target = event.target?.closest?.(socialIntentSelector);
    if (!target) return;
    loadSocialPresentation(socialIntentKind(target)).catch(error => {
      console.error('[Pasar UMKM] Social presentation load error:', error);
    });
  }, true);

  openAccount = async function resilientOpenAccount() {
    if (!STATE.user) {
      openLogin();
      return;
    }

    const enhancementPromise = ensureProfileEnhancements().catch(error => {
      console.error('[Pasar UMKM] Profile enhancement load error:', error);
      return false;
    });

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
        STATE.accountProducts = Array.isArray(productsResult.value) ? productsResult.value : [];
      } else {
        console.error('[Pasar UMKM] Account products load error:', productsResult.reason);
        STATE.accountProducts = [];
      }
    } else {
      STATE.currentStore = null;
      STATE.accountProducts = [];
    }

    await enhancementPromise;

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

  window.PasarP6Loader = Object.freeze({
    version: '1.0',
    ensureCore: ensureCoreEnhancements,
    ensureProfile: ensureProfileEnhancements,
    ensureMedia: ensureMediaEnhancements,
    ensureBusiness: ensureBusinessEnhancements
  });
})();
