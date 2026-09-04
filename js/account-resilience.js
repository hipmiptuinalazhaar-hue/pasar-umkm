'use strict';

(() => {
  const rawFetch = window.fetch.bind(window);
  const warmPaths = new Set(['/api/categories','/api/stores','/api/products','/api/posts']);
  const responseCache = new Map();
  const PUBLIC_CACHE_TTL_MS = 20_000;

  function publicKey(input, init) {
    try {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url, location.href);
      if (url.origin !== location.origin || String(request.method || 'GET').toUpperCase() !== 'GET') return null;
      return warmPaths.has(url.pathname) ? `${url.pathname}${url.search}` : null;
    } catch { return null; }
  }

  window.fetch = async function resilientFetch(input, init) {
    const key = publicKey(input, init);
    if (!key) return rawFetch(input, init);
    const now = Date.now();
    const cached = responseCache.get(key);
    if (cached?.expiresAt > now) {
      try { return (await cached.promise).clone(); }
      catch { responseCache.delete(key); }
    }
    const promise = rawFetch(input, init).then(response => {
      if (!response.ok) responseCache.delete(key);
      return response;
    }).catch(error => {
      responseCache.delete(key);
      throw error;
    });
    responseCache.set(key, { expiresAt: now + PUBLIC_CACHE_TTL_MS, promise });
    return (await promise).clone();
  };

  function warmPublicBootstrap() {
    const init = { method:'GET', credentials:'include', headers:{Accept:'application/json'}, cache:'no-store' };
    for (const path of warmPaths) window.fetch(path, init).catch(() => null);
  }
  warmPublicBootstrap();

  if (typeof openAccount !== 'function') return;

  const styleJobs = new Map();
  const scriptJobs = new Map();

  function loadStyle(selector, href, key) {
    const found = document.querySelector(selector);
    if (found) return Promise.resolve(found);
    if (styleJobs.has(href)) return styleJobs.get(href);
    const job = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = href; link.dataset[key] = 'true';
      link.onload = () => resolve(link);
      link.onerror = () => reject(new Error(`Gagal memuat ${href}`));
      document.head.appendChild(link);
    }).catch(error => { styleJobs.delete(href); throw error; });
    styleJobs.set(href, job);
    return job;
  }

  function loadScript(selector, src, key) {
    const found = document.querySelector(selector);
    if (found) return Promise.resolve(found);
    if (scriptJobs.has(src)) return scriptJobs.get(src);
    const job = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src; script.async = false; script.dataset[key] = 'true';
      script.onload = () => resolve(script);
      script.onerror = () => reject(new Error(`Gagal memuat ${src}`));
      document.head.appendChild(script);
    }).catch(error => { scriptJobs.delete(src); throw error; });
    scriptJobs.set(src, job);
    return job;
  }

  const CORE_SCRIPTS = [
    ['script[data-navigation-refresh-guard="true"]','js/navigation-refresh-guard.js?v=1.0','navigationRefreshGuard'],
    ['script[data-social-core-module="true"]','js/social-core.js?v=1.0','socialCoreModule'],
    ['script[data-like-core-module="true"]','js/like-core.js?v=1.1','likeCoreModule'],
    ['script[data-social-shell-module="true"]','js/social-shell.js?v=1.1','socialShellModule'],
    ['script[data-notification-router-v2="true"]','js/notification-router-v2.js?v=2.1','notificationRouterV2'],
    ['script[data-notification-core-module="true"]','js/notification-core.js?v=1.1','notificationCoreModule'],
    ['script[data-functionality-core-module="true"]','js/functionality-core.js?v=1.0','functionalityCoreModule']
  ];

  let coreJob, coreReady = false;
  function ensureCoreEnhancements() {
    if (coreReady) return Promise.resolve(true);
    if (coreJob) return coreJob;
    coreJob = (async () => {
      const css = loadStyle('link[data-social-core-style="true"]','css/social-core.css?v=1.0','socialCoreStyle');
      for (const args of CORE_SCRIPTS) await loadScript(...args);
      await css; coreReady = true; return true;
    })().catch(error => { coreJob = null; throw error; });
    return coreJob;
  }

  let profileJob, profileReady = false;
  function ensureProfileEnhancements() {
    if (profileReady) return Promise.resolve(true);
    if (profileJob) return profileJob;
    profileJob = (async () => {
      await ensureCoreEnhancements();
      await Promise.all([
        loadStyle('link[data-profile-edit-style="true"]','css/profile-edit.css?v=4.0','profileEditStyle'),
        loadStyle('link[data-rating-form-v3-style="true"]','css/rating-form-v3.css?v=3.0','ratingFormV3Style')
      ]);
      const modules = [
        ['script[data-profile-edit-module="true"]','js/profile-edit.js?v=4.0','profileEditModule'],
        ['script[data-profile-identity-module="true"]','js/profile-identity.js?v=2.0','profileIdentityModule'],
        ['script[data-profile-title-center-module="true"]','js/profile-title-center.js?v=1.1','profileTitleCenterModule'],
        ['script[data-saved-remove-core="true"]','js/saved-remove-core.js?v=1.0','savedRemoveCore'],
        ['script[data-rating-core="true"]','js/rating-core.js?v=2.1','ratingCore']
      ];
      for (const args of modules) await loadScript(...args);
      profileReady = true; return true;
    })().catch(error => { profileJob = null; throw error; });
    return profileJob;
  }

  let mediaJob, mediaReady = false;
  function ensureMediaEnhancements() {
    if (mediaReady) return Promise.resolve(true);
    if (mediaJob) return mediaJob;
    mediaJob = (async () => {
      await ensureCoreEnhancements();
      await Promise.all([
        loadStyle('link[data-media-experience-style="true"]','css/media-experience.css?v=1.0','mediaExperienceStyle'),
        loadStyle('link[data-mention-autocomplete-style="true"]','css/mention-autocomplete.css?v=1.0','mentionAutocompleteStyle')
      ]);
      const modules = [
        ['script[data-story-render-fix="true"]','js/story-render-fix.js?v=1.0','storyRenderFix'],
        ['script[data-media-experience-module="true"]','js/media-experience.js?v=1.0','mediaExperienceModule'],
        ['script[data-reel-profile-separation="true"]','js/reel-profile-separation.js?v=1.1','reelProfileSeparation'],
        ['script[data-mention-autocomplete-module="true"]','js/mention-autocomplete.js?v=1.0','mentionAutocompleteModule']
      ];
      for (const args of modules) await loadScript(...args);
      mediaReady = true; return true;
    })().catch(error => { mediaJob = null; throw error; });
    return mediaJob;
  }

  let businessJob, businessReady = false;
  function ensureBusinessEnhancements() {
    if (businessReady) return Promise.resolve(true);
    if (businessJob) return businessJob;
    businessJob = ensureCoreEnhancements()
      .then(() => loadScript('script[data-business-agency="true"]','js/business-agency.js?v=1.0','businessAgency'))
      .then(() => (businessReady = true))
      .catch(error => { businessJob = null; throw error; });
    return businessJob;
  }

  const replaying = new WeakSet();
  function installIntentGate(selector, ready, loader) {
    document.addEventListener('pointerdown', event => {
      const target = event.target?.closest?.(selector);
      if (target && !ready()) loader().catch(() => null);
    }, {capture:true, passive:true});
    document.addEventListener('click', async event => {
      const target = event.target?.closest?.(selector);
      if (!target || ready() || replaying.has(target)) return;
      event.preventDefault(); event.stopImmediatePropagation(); target.setAttribute('aria-busy','true');
      try {
        await loader(); replaying.add(target); target.click(); queueMicrotask(() => replaying.delete(target));
      } catch (error) {
        console.error('[Pasar UMKM] Feature load error:', error);
        window.showToast?.('Fitur belum dapat dibuka. Coba lagi.');
      } finally { target.removeAttribute('aria-busy'); }
    }, true);
  }

  installIntentGate('[data-action="notifications"],[data-action="comments"],[data-action="like"],[data-action="save"],[data-action="seller-profile"],[data-menu-action="favorites"]',() => coreReady,ensureCoreEnhancements);
  installIntentGate('[data-nav="account"],[data-action="account-edit"]',() => profileReady,ensureProfileEnhancements);
  installIntentGate('[data-nav="reels"],[data-action="open-story"],[data-action="add-story"]',() => mediaReady,ensureMediaEnhancements);
  installIntentGate('[data-menu-action="business-agency"],[data-function-action="business-agency"]',() => businessReady,ensureBusinessEnhancements);

  function runIdle(task, timeout = 2500) {
    if ('requestIdleCallback' in window) requestIdleCallback(task,{timeout});
    else setTimeout(task,450);
  }
  function schedulePostRenderWarmup() {
    const start = () => setTimeout(() => runIdle(() => {
      ensureCoreEnhancements().then(() => runIdle(() => ensureMediaEnhancements().catch(() => null),5000)).catch(() => null);
    },3000),700);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
    else start();
  }
  schedulePostRenderWarmup();

  const socialStyleRoutes = Object.freeze({
    profile: { href: 'css/social-experience-v3.css?v=3.1', selector:'link[data-social-p3-style="profile"]' },
    engagement: { href: 'css/social-engagement-v3.css?v=3.0', selector:'link[data-social-p3-style="engagement"]' },
    media: { href: 'css/social-media-v3.css?v=3.0', selector:'link[data-social-p3-style="media"]' }
  });
  let socialScriptJob;

  function ensureSocialPresentationStyle(kind='profile') {
    const route = socialStyleRoutes[kind] || socialStyleRoutes.profile;
    const found = document.querySelector(route.selector);
    if (found) { document.head.appendChild(found); return Promise.resolve(found); }
    return new Promise((resolve,reject) => {
      const link = document.createElement('link');
      link.rel='stylesheet'; link.href=route.href; link.dataset.socialP3Style=kind;
      link.onload=() => resolve(link); link.onerror=() => reject(new Error('Social CSS gagal dimuat'));
      document.head.appendChild(link);
    });
  }

  function ensureSocialPresentationScript() {
    if (window.PasarSocialExperience?.version === '3.0') {
      window.PasarSocialExperience.upgrade?.(); return Promise.resolve(window.PasarSocialExperience);
    }
    if (socialScriptJob) return socialScriptJob;
    const found = document.querySelector('script[data-social-experience-v3="true"]');
    if (found) {
      socialScriptJob = new Promise((resolve,reject) => {
        const started=Date.now(), timer=setInterval(() => {
          if (window.PasarSocialExperience?.version === '3.0') { clearInterval(timer); resolve(window.PasarSocialExperience); }
          else if (Date.now()-started>5000) { clearInterval(timer); reject(new Error('Social Experience timeout')); }
        },30);
      });
      return socialScriptJob;
    }
    socialScriptJob = new Promise((resolve,reject) => {
      const script=document.createElement('script');
      script.src = 'js/social-experience-v3.js?v=3.0'; script.async=true; script.dataset.socialExperienceV3='true';
      script.onload=() => window.PasarSocialExperience?.version === '3.0' ? resolve(window.PasarSocialExperience) : reject(new Error('Social init gagal'));
      script.onerror=() => reject(new Error('Social module gagal dimuat'));
      document.body.appendChild(script);
    }).catch(error => { socialScriptJob=null; throw error; });
    return socialScriptJob;
  }

  function loadSocialPresentation(kind='profile') {
    return Promise.all([ensureSocialPresentationStyle(kind),ensureSocialPresentationScript()]).then(([,module]) => {
      module?.upgrade?.(); return module;
    });
  }

  const socialIntentSelector = [
    '[data-nav="account"]','[data-nav="reels"]','[data-action="notifications"]','[data-action="comments"]',
    '[data-action="seller-profile"]','[data-action="open-story"]','[data-action="add-story"]','[data-social-action]',
    '.social-follow-user','.post-comment-name','.post-comment-avatar','.notification-row',
    '.reel-author[data-media-action="reel-profile"]','.story-viewer-author'
  ].join(',');
  function socialKind(target) {
    if (target.matches('[data-action="notifications"],[data-action="comments"]')) return 'engagement';
    if (target.matches('[data-nav="reels"],[data-action="open-story"],[data-action="add-story"]')) return 'media';
    return 'profile';
  }
  document.addEventListener('pointerdown',event => {
    const target=event.target?.closest?.(socialIntentSelector); if (target) loadSocialPresentation(socialKind(target)).catch(() => null);
  },{capture:true,passive:true});
  document.addEventListener('click',event => {
    const target=event.target?.closest?.(socialIntentSelector); if (target) loadSocialPresentation(socialKind(target)).catch(() => null);
  },true);

  openAccount = async function resilientOpenAccount() {
    if (!STATE.user) { openLogin(); return; }
    const enhancements = ensureProfileEnhancements().catch(error => { console.error('[Pasar UMKM] Profile load error:',error); return false; });
    loadSocialPresentation('profile').catch(() => null);
    closeBottomSheet(); closeSideMenu(); STATE.activeNav='account'; updateNavigation();
    document.querySelector('.app')?.classList.add('account-profile-active');
    if (DOM.storiesSection) DOM.storiesSection.hidden=true;
    if (DOM.homeDiscovery) DOM.homeDiscovery.hidden=true;
    if (!DOM.feed) return;
    DOM.feed.innerHTML='<section class="social-account-page"><section class="social-account-empty"><div class="social-account-empty-icon"><i class="ph ph-user-circle"></i></div><strong>Memuat profil</strong><p>Menyiapkan halaman akun Anda.</p></section></section>';

    let store=null;
    if (STATE.user.role === 'seller' || STATE.user.role === 'admin') {
      const [storeResult,productsResult]=await Promise.allSettled([loadCurrentAccountStore(),loadCurrentAccountProducts()]);
      if (storeResult.status === 'fulfilled') { store=storeResult.value; STATE.currentStore=store; }
      else { console.error('[Pasar UMKM] Store load error:',storeResult.reason); STATE.currentStore=null; }
      STATE.accountProducts = productsResult.status === 'fulfilled' && Array.isArray(productsResult.value) ? productsResult.value : [];
    } else { STATE.currentStore=null; STATE.accountProducts=[]; }

    await enhancements;
    if (typeof window.hydratePersistentSaved === 'function') await window.hydratePersistentSaved({force:true});
    window.reloadCommerceCart?.().catch?.(() => null);
    renderSocialAccountProfile(store);
    window.decorateOwnProfileContacts?.(); window.decorateOwnProfileSocial?.(); window.centerProfileTitle?.();
    window.syncSocialShell?.(); window.hydratePersistentLikes?.(); window.refreshNotificationBadge?.();
    window.refreshRatingSummaries?.(); window.cleanReelsFromPhotoProfileGrids?.(); window.PasarSocialExperience?.upgrade?.();
    scrollTo({top:0,behavior:'auto'});
  };

  window.PasarP6Loader = Object.freeze({ version: '1.0', ensureCore:ensureCoreEnhancements, ensureProfile:ensureProfileEnhancements, ensureMedia:ensureMediaEnhancements, ensureBusiness:ensureBusinessEnhancements });
})();