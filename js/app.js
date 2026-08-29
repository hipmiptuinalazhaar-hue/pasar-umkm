/* =========================================================
   PASAR UMKM
   APP.JS v6.0
   Marketplace Frontend Controller
   ========================================================= */

'use strict';


/* =========================================================
   01. CONFIG
   ========================================================= */

const CONFIG = {

  APP_NAME: 'Pasar UMKM',

  LOCATION: 'Lubuklinggau',

  ORGANIZATION:
    'HIPMI PT UIN Al Azhaar Lubuklinggau',

  INITIATOR:
    'Capryan Agusto',

  DEMO_MODE: false,

  API_BASE_URL: '',

  STORAGE_KEY:
    'pasarUmkmFrontendStateV6',

  SESSION_KEY:
    'pasarUmkmSessionV6',

  INTRO_SESSION_KEY:
    'pasarUmkmIntroSeenV6',

  SPLASH_HOLD_MS: 1050,

  SPLASH_EXIT_MS: 380,

  TOAST_DURATION: 2300,

};


/* =========================================================
   02. ASSETS
   ========================================================= */

const ASSETS = {

  logo:
    'assets/logo.png',

  hipmi:
    'assets/branding/logo-hipmi-pt.png',

  university:
    'assets/branding/logo-uin-alazhaar.png',

};


/* =========================================================
   03. BASE CATEGORIES
   These are navigation categories, not fake activity.
   ========================================================= */

const BASE_CATEGORIES = [

  {
    id: 'kuliner',
    name: 'Kuliner',
    icon: 'fork-knife',
  },

  {
    id: 'fashion',
    name: 'Fashion',
    icon: 't-shirt',
  },

  {
    id: 'kerajinan',
    name: 'Kerajinan',
    icon: 'paint-brush',
  },

  {
    id: 'jasa',
    name: 'Jasa',
    icon: 'briefcase',
  },

];


/* =========================================================
   04. DEMO DATA
   Disabled in production.
   ========================================================= */

const DEMO_DATA = {

  stories: [],

  posts: [],

  notifications: [],

  messages: [],

};


/* =========================================================
   05. DATA
   ========================================================= */

const DATA = {

  stories:
    CONFIG.DEMO_MODE
      ? [...DEMO_DATA.stories]
      : [],

  posts:
    CONFIG.DEMO_MODE
      ? [...DEMO_DATA.posts]
      : [],

  notifications:
    CONFIG.DEMO_MODE
      ? [...DEMO_DATA.notifications]
      : [],

  messages:
    CONFIG.DEMO_MODE
      ? [...DEMO_DATA.messages]
      : [],

};


/* =========================================================
   06. STATE
   ========================================================= */

const STATE = {

  user: null,

  activeNav:
    'home',

  activeCategory:
    null,

  searchQuery:
    '',

  likedPosts:
    new Set(),

  savedPosts:
    new Set(),

  cart:
    [],

  orders:
    [],

  isMenuOpen:
    false,

  isSearchOpen:
    false,

  activeSheet:
    null,

  loading:
    false,

};


/* =========================================================
   07. DOM CACHE
   ========================================================= */

const DOM = {};


/* =========================================================
   08. INIT
   ========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  init
);


async function init() {

  cacheDOM();

  restoreLocalState();

  setupSplashIntro();

  bindEvents();

  setLoading(true);

  try {

    await loadInitialData();

  }
  catch (error) {

    console.error(
      '[Pasar UMKM] Initial data error:',
      error
    );

    showToast(
      'Data belum dapat dimuat.'
    );

  }
  finally {

    setLoading(false);

  }

  renderAll();

  handleScroll();

}


/* =========================================================
   09. CACHE DOM
   ========================================================= */

function cacheDOM() {

  DOM.splash =
    document.getElementById(
      'splashIntro'
    );

  DOM.header =
    document.getElementById(
      'header'
    );

  DOM.storiesSection =
    document.getElementById(
      'storiesSection'
    );

  DOM.stories =
    document.getElementById(
      'stories'
    );

  DOM.homeDiscovery =
    document.getElementById(
      'homeDiscovery'
    );

  DOM.quickCategories =
    document.getElementById(
      'quickCategories'
    );

  DOM.feed =
    document.getElementById(
      'feed'
    );

  DOM.menuButton =
    document.getElementById(
      'menuButton'
    );

  DOM.sideMenu =
    document.getElementById(
      'sideMenu'
    );

  DOM.closeMenuButton =
    document.getElementById(
      'closeMenuButton'
    );

  DOM.sideMenuContent =
    document.getElementById(
      'sideMenuContent'
    );

  DOM.sideAccountGuest =
    document.getElementById(
      'sideAccountGuest'
    );

  DOM.sideAccountUser =
    document.getElementById(
      'sideAccountUser'
    );

  DOM.sideAccountUserName =
    document.getElementById(
      'sideAccountUserName'
    );

  DOM.sideAccountUserRole =
    document.getElementById(
      'sideAccountUserRole'
    );

  DOM.headerSearchButton =
    document.getElementById(
      'headerSearchButton'
    );

  DOM.searchOverlay =
    document.getElementById(
      'searchOverlay'
    );

  DOM.closeSearchButton =
    document.getElementById(
      'closeSearchButton'
    );

  DOM.searchInput =
    document.getElementById(
      'searchInput'
    );

  DOM.searchClearButton =
    document.getElementById(
      'searchClearButton'
    );

  DOM.searchResults =
    document.getElementById(
      'searchResults'
    );

  DOM.notificationButton =
    document.getElementById(
      'notificationButton'
    );

  DOM.messageButton =
    document.getElementById(
      'messageButton'
    );

  DOM.navigation =
    document.getElementById(
      'appNavigation'
    );

  DOM.sheetOverlay =
    document.getElementById(
      'sheetOverlay'
    );

  DOM.bottomSheet =
    document.getElementById(
      'bottomSheet'
    );

  DOM.sheetContent =
    document.getElementById(
      'sheetContent'
    );

  DOM.toast =
    document.getElementById(
      'toast'
    );

  DOM.loading =
    document.getElementById(
      'appLoading'
    );

}


/* =========================================================
   10. INITIAL DATA
   ========================================================= */

async function loadInitialData() {

  if (CONFIG.DEMO_MODE) {
    return;
  }

  if (!CONFIG.API_BASE_URL) {
    return;
  }

  const response =
    await apiRequest(
      '/bootstrap'
    );

  if (!response) {
    return;
  }

  DATA.stories =
    Array.isArray(response.stories)
      ? response.stories
      : [];

  DATA.posts =
    Array.isArray(response.posts)
      ? response.posts
      : [];

  DATA.notifications =
    Array.isArray(response.notifications)
      ? response.notifications
      : [];

  DATA.messages =
    Array.isArray(response.messages)
      ? response.messages
      : [];

  if (response.user) {

    STATE.user =
      response.user;

  }

  if (
    Array.isArray(
      response.cart
    )
  ) {

    STATE.cart =
      response.cart;

  }

  if (
    Array.isArray(
      response.orders
    )
  ) {

    STATE.orders =
      response.orders;

  }

}


/* =========================================================
   11. API
   ========================================================= */

async function apiRequest(
  endpoint,
  options = {}
) {

  if (!CONFIG.API_BASE_URL) {
    return null;
  }

  const response =
    await fetch(
      `${CONFIG.API_BASE_URL}${endpoint}`,
      {
        credentials:
          'include',

        headers: {
          'Content-Type':
            'application/json',

          ...options.headers,
        },

        ...options,
      }
    );

  if (!response.ok) {

    throw new Error(
      `API error ${response.status}`
    );

  }

  const contentType =
    response.headers.get(
      'content-type'
    ) || '';

  if (
    !contentType.includes(
      'application/json'
    )
  ) {

    return null;

  }

  return response.json();

}


/* =========================================================
   12. SPLASH
   ========================================================= */

function setupSplashIntro() {

  if (!DOM.splash) {
    return;
  }

  const alreadySeen =
    sessionStorage.getItem(
      CONFIG.INTRO_SESSION_KEY
    );

  if (alreadySeen) {

    hideSplashImmediately();

    return;

  }

  sessionStorage.setItem(
    CONFIG.INTRO_SESSION_KEY,
    '1'
  );

  const reduced =
    window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

  if (reduced) {

    window.setTimeout(
      finishSplash,
      100
    );

    return;

  }

  window.setTimeout(
    finishSplash,
    CONFIG.SPLASH_HOLD_MS
  );

}


function finishSplash() {

  if (!DOM.splash) {
    return;
  }

  DOM.splash.classList.add(
    'is-exiting'
  );

  window.setTimeout(
    () => {

      DOM.splash.classList.add(
        'is-hidden'
      );

      DOM.splash.hidden = true;

    },
    CONFIG.SPLASH_EXIT_MS
  );

}


function hideSplashImmediately() {

  if (!DOM.splash) {
    return;
  }

  DOM.splash.classList.add(
    'is-hidden'
  );

  DOM.splash.hidden = true;

}


/* =========================================================
   13. RENDER ALL
   ========================================================= */

function renderAll() {

  renderStories();

  renderQuickCategories();

  renderFeed();

  renderSideMenu();

  renderAccountState();

  updateNavigation();

  updateCartBadge();

  updateHeaderBadges();

}


/* =========================================================
   14. STORIES
   ========================================================= */

function renderStories() {

  if (
    !DOM.stories ||
    !DOM.storiesSection
  ) {
    return;
  }

  if (
    DATA.stories.length === 0
  ) {

    DOM.stories.innerHTML =
      '';

    DOM.storiesSection.hidden =
      true;

    return;

  }

  DOM.storiesSection.hidden =
    false;

  const addStory =
    STATE.user
      ? createAddStoryTemplate()
      : '';

  const stories =
    DATA.stories
      .map(
        createStoryTemplate
      )
      .join('');

  DOM.stories.innerHTML =
    addStory + stories;

}


function createAddStoryTemplate() {

  return `
    <button
      type="button"
      class="story-item story-add"
      data-action="add-story"
      aria-label="Tambahkan cerita"
    >
      <span class="story-ring">

        <i
          class="ph ph-plus"
          aria-hidden="true"
        ></i>

      </span>

      <span class="story-name">
        Cerita Anda
      </span>

    </button>
  `;

}


function createStoryTemplate(
  story
) {

  const updateClass =
    story.hasUpdate
      ? 'has-update'
      : '';

  return `
    <button
      type="button"
      class="story-item ${updateClass}"
      data-action="open-story"
      data-story-id="${escapeHTML(story.id)}"
      aria-label="Cerita ${escapeHTML(story.name)}"
    >

      <span class="story-ring">

        <img
          src="${escapeHTML(story.avatar)}"
          alt=""
          class="story-avatar"
          loading="lazy"
          decoding="async"
        >

      </span>

      <span class="story-name">
        ${escapeHTML(story.name)}
      </span>

    </button>
  `;

}


/* =========================================================
   15. QUICK CATEGORIES
   ========================================================= */

function renderQuickCategories() {

  if (!DOM.quickCategories) {
    return;
  }

  DOM.quickCategories.innerHTML =
    BASE_CATEGORIES
      .map(
        createQuickCategoryTemplate
      )
      .join('');

}


function createQuickCategoryTemplate(
  category
) {

  return `
    <button
      type="button"
      class="quick-category"
      data-action="quick-category"
      data-category="${escapeHTML(category.name)}"
      aria-label="Kategori ${escapeHTML(category.name)}"
    >

      <span class="quick-category-icon">

        <i
          class="ph ph-${escapeHTML(category.icon)}"
          aria-hidden="true"
        ></i>

      </span>

      <span class="quick-category-label">
        ${escapeHTML(category.name)}
      </span>

    </button>
  `;

}


/* =========================================================
   16. FEED
   ========================================================= */

function renderFeed(
  posts = getVisiblePosts()
) {

  if (!DOM.feed) {
    return;
  }

  if (
    !Array.isArray(posts) ||
    posts.length === 0
  ) {

    DOM.feed.innerHTML =
      createFeedEmptyTemplate();

    return;

  }

  DOM.feed.innerHTML =
    posts
      .map(
        createPostTemplate
      )
      .join('');

}


/* =========================================================
   17. EMPTY FEED
   ========================================================= */

function createFeedEmptyTemplate() {

  const category =
    STATE.activeCategory;

  if (category) {

    return `
      <div class="empty-state">

        <i
          class="ph ph-package"
          aria-hidden="true"
        ></i>

        <strong class="empty-state-title">
          Belum ada produk ${escapeHTML(category)}
        </strong>

        <p class="empty-state-text">
          Produk dari kategori ini akan tampil
          setelah UMKM mulai menerbitkannya.
        </p>

        <button
          type="button"
          class="btn-primary"
          data-nav="home"
        >
          Kembali ke Beranda
        </button>

      </div>
    `;

  }

  return `
    <div class="empty-state">

      <i
        class="ph ph-storefront"
        aria-hidden="true"
      ></i>

      <strong class="empty-state-title">
        Pasar sedang bertumbuh
      </strong>

      <p class="empty-state-text">
        Produk dan postingan dari UMKM lokal
        akan muncul di sini setelah mulai dipublikasikan.
      </p>

      ${
        STATE.user
          ? `
            <button
              type="button"
              class="btn-primary"
              data-action="sell"
            >
              Mulai Jual
            </button>
          `
          : `
            <button
              type="button"
              class="btn-primary"
              data-action="login"
            >
              Daftarkan UMKM
            </button>
          `
      }

    </div>
  `;

}


/* =========================================================
   18. POST TEMPLATE
   ========================================================= */

function createPostTemplate(
  post
) {

  const liked =
    STATE.likedPosts.has(
      post.id
    );

  const saved =
    STATE.savedPosts.has(
      post.id
    );

  return `
    <article
      class="post-card"
      id="post-${escapeHTML(post.id)}"
      data-post-id="${escapeHTML(post.id)}"
    >

      ${createPostHeader(post)}

      ${createPostMedia(post)}

      <div class="post-actions">

        <div class="actions-left">

          <button
            type="button"
            class="action-btn ${liked ? 'liked' : ''}"
            data-action="like"
            data-post-id="${escapeHTML(post.id)}"
            aria-label="Sukai postingan"
            aria-pressed="${liked}"
          >

            <i
              class="${liked ? 'ph-fill' : 'ph'} ph-heart"
              aria-hidden="true"
            ></i>

          </button>


          <button
            type="button"
            class="action-btn"
            data-action="comments"
            data-post-id="${escapeHTML(post.id)}"
            aria-label="Komentar"
          >

            <i
              class="ph ph-chat-circle"
              aria-hidden="true"
            ></i>

          </button>


          <button
            type="button"
            class="action-btn"
            data-action="share"
            data-post-id="${escapeHTML(post.id)}"
            aria-label="Bagikan"
          >

            <i
              class="ph ph-paper-plane-tilt"
              aria-hidden="true"
            ></i>

          </button>

        </div>


        <button
          type="button"
          class="action-btn ${saved ? 'saved' : ''}"
          data-action="save"
          data-post-id="${escapeHTML(post.id)}"
          aria-label="Simpan"
          aria-pressed="${saved}"
        >

          <i
            class="${saved ? 'ph-fill' : 'ph'} ph-bookmark-simple"
            aria-hidden="true"
          ></i>

        </button>

      </div>

      ${createPostStats(post)}

      ${createPostCaption(post)}

      ${
        Number(post.comments) > 0
          ? `
            <button
              type="button"
              class="view-comments"
              data-action="comments"
              data-post-id="${escapeHTML(post.id)}"
            >
              Lihat ${formatCompactNumber(post.comments)} komentar
            </button>
          `
          : ''
      }

      <div class="post-time">
        ${formatRelativeTime(post.createdAt)}
      </div>

      ${
        post.product
          ? createProductTemplate(
              post.product
            )
          : ''
      }

    </article>
  `;

}


/* =========================================================
   19. POST HEADER
   ========================================================= */

function createPostHeader(
  post
) {

  const store =
    post.store || {};

  return `
    <header class="post-header">

      <img
        src="${escapeHTML(store.avatar || ASSETS.logo)}"
        alt=""
        class="post-avatar"
        loading="lazy"
        decoding="async"
      >

      <div class="post-meta">

        <div class="post-author">

          <span>
            ${escapeHTML(store.name || 'UMKM Lokal')}
          </span>

          ${
            store.verified
              ? `
                <i
                  class="ph-fill ph-seal-check verified-badge"
                  aria-label="Terverifikasi"
                ></i>
              `
              : ''
          }

        </div>

        <div class="post-context">

          <span>
            ${escapeHTML(post.location || CONFIG.LOCATION)}
          </span>

          <span
            class="dot"
            aria-hidden="true"
          ></span>

          <span>
            ${formatRelativeTime(post.createdAt)}
          </span>

        </div>

      </div>


      <button
        type="button"
        class="post-menu"
        data-action="post-menu"
        data-post-id="${escapeHTML(post.id)}"
        aria-label="Menu postingan"
      >

        <i
          class="ph ph-dots-three"
          aria-hidden="true"
        ></i>

      </button>

    </header>
  `;

}


/* =========================================================
   20. POST MEDIA
   ========================================================= */

function createPostMedia(
  post
) {

  if (
    !post.media ||
    !post.media.src
  ) {

    return '';

  }

  const isVideo =
    post.media.type === 'video';

  const aspectClass =
    post.media.aspect === 'square'
      ? 'square'
      : '';

  if (isVideo) {

    return `
      <div
        class="post-media video"
        data-post-id="${escapeHTML(post.id)}"
      >

        ${
          post.media.poster
            ? `
              <img
                src="${escapeHTML(post.media.poster)}"
                alt=""
                loading="lazy"
                decoding="async"
              >
            `
            : ''
        }

        <span class="video-indicator">

          <i
            class="ph-fill ph-play"
            aria-hidden="true"
          ></i>

          VIDEO

        </span>

        <button
          type="button"
          class="play-button"
          data-action="play-video"
          data-post-id="${escapeHTML(post.id)}"
          aria-label="Putar video"
        ></button>

      </div>
    `;

  }

  return `
    <div
      class="post-media ${aspectClass}"
    >

      <img
        src="${escapeHTML(post.media.src)}"
        alt="${escapeHTML(post.media.alt || '')}"
        loading="lazy"
        decoding="async"
      >

    </div>
  `;

}


/* =========================================================
   21. POST STATS
   ========================================================= */

function createPostStats(
  post
) {

  const baseLikes =
    Number(post.likes) || 0;

  const localLike =
    STATE.likedPosts.has(
      post.id
    );

  const total =
    baseLikes +
    (localLike ? 1 : 0);

  if (total <= 0) {
    return '';
  }

  return `
    <div class="post-stats">
      ${formatCompactNumber(total)} suka
    </div>
  `;

}


/* =========================================================
   22. CAPTION
   ========================================================= */

function createPostCaption(
  post
) {

  if (!post.caption) {
    return '';
  }

  const storeName =
    post.store?.name ||
    'UMKM Lokal';

  return `
    <div class="post-caption">

      <span class="author">
        ${escapeHTML(storeName)}
      </span>

      ${escapeHTML(post.caption)}

    </div>
  `;

}


/* =========================================================
   23. PRODUCT
   ========================================================= */

function createProductTemplate(
  product
) {

  const rating =
    product.rating
      ? `
        <span class="stars">
          ★ ${escapeHTML(product.rating)}
        </span>
      `
      : '';

  const sold =
    Number(product.sold) > 0
      ? `
        <span>
          ${formatCompactNumber(product.sold)} terjual
        </span>
      `
      : '';

  const originalPrice =
    product.originalPrice
      ? `
        <span class="original">
          ${formatRupiah(product.originalPrice)}
        </span>
      `
      : '';

  return `
    <section
      class="product-card"
      data-product-id="${escapeHTML(product.id)}"
    >

      <img
        src="${escapeHTML(product.image || ASSETS.logo)}"
        alt="${escapeHTML(product.name || 'Produk UMKM')}"
        class="product-img"
        loading="lazy"
        decoding="async"
      >


      <div class="product-info">

        ${
          product.category
            ? `
              <div class="product-badge">
                ${escapeHTML(product.category)}
              </div>
            `
            : ''
        }

        <div class="product-name">
          ${escapeHTML(product.name || 'Produk UMKM')}
        </div>

        ${
          rating || sold
            ? `
              <div class="product-meta">

                ${rating}

                ${
                  rating && sold
                    ? '<span>·</span>'
                    : ''
                }

                ${sold}

              </div>
            `
            : ''
        }

        <div class="product-price">

          ${formatRupiah(product.price)}

          ${originalPrice}

        </div>

      </div>


      <div class="product-actions">

        <button
          type="button"
          class="btn-icon"
          data-action="add-cart"
          data-product-id="${escapeHTML(product.id)}"
          aria-label="Tambah ke keranjang"
        >

          <i
            class="ph ph-shopping-cart-simple"
            aria-hidden="true"
          ></i>

        </button>


        <button
          type="button"
          class="btn-icon"
          data-action="buy-now"
          data-product-id="${escapeHTML(product.id)}"
          aria-label="Beli sekarang"
        >

          <i
            class="ph ph-arrow-right"
            aria-hidden="true"
          ></i>

        </button>

      </div>

    </section>
  `;

}


/* =========================================================
   24. EVENTS
   ========================================================= */

function bindEvents() {

  document.addEventListener(
    'click',
    handleGlobalClick
  );

  window.addEventListener(
    'scroll',
    handleScroll,
    {
      passive: true,
    }
  );

  DOM.searchInput?.addEventListener(
    'input',
    handleSearchInput
  );

  DOM.searchClearButton?.addEventListener(
    'click',
    clearSearch
  );

  document.addEventListener(
    'keydown',
    handleKeyboard
  );

}


/* =========================================================
   25. GLOBAL CLICK
   ========================================================= */

function handleGlobalClick(
  event
) {

  const navigation =
    event.target.closest(
      '[data-nav]'
    );

  if (navigation) {

    event.preventDefault();

    navigate(
      navigation.dataset.nav
    );

    return;

  }


  const actionElement =
    event.target.closest(
      '[data-action]'
    );

  if (actionElement) {

    handleAction(
      actionElement.dataset.action,
      actionElement
    );

    return;

  }


  const menuAction =
    event.target.closest(
      '[data-menu-action]'
    );

  if (menuAction) {

    handleMenuAction(
      menuAction.dataset.menuAction
    );

    return;

  }


  if (
    DOM.sideMenu &&
    STATE.isMenuOpen &&
    event.target === DOM.sideMenu
  ) {

    closeSideMenu();

  }


  if (
    DOM.sheetOverlay &&
    event.target === DOM.sheetOverlay
  ) {

    closeBottomSheet();

  }

}


/* =========================================================
   26. ACTION ROUTER
   ========================================================= */

function handleAction(
  action,
  element
) {

  switch (action) {

    case 'menu':

      openSideMenu();

      break;


    case 'close-menu':

      closeSideMenu();

      break;


    case 'search':

      openSearch();

      break;


    case 'close-search':

      closeSearch();

      break;


    case 'notifications':

      openNotifications();

      break;


    case 'messages':

      openMessages();

      break;


    case 'quick-category':

      showCategory(
        element.dataset.category
      );

      break;


    case 'like':

      toggleLike(
        element.dataset.postId
      );

      break;


    case 'save':

      toggleSave(
        element.dataset.postId
      );

      break;


    case 'comments':

      openComments(
        element.dataset.postId
      );

      break;


    case 'share':

      sharePost(
        element.dataset.postId
      );

      break;


    case 'post-menu':

      openPostMenu(
        element.dataset.postId
      );

      break;


    case 'add-cart':

      addToCart(
        element.dataset.productId
      );

      break;


    case 'buy-now':

      buyNow(
        element.dataset.productId
      );

      break;


    case 'cart-increase':

      changeCartQuantity(
        element.dataset.productId,
        1
      );

      break;


    case 'cart-decrease':

      changeCartQuantity(
        element.dataset.productId,
        -1
      );

      break;


    case 'remove-cart':

      removeFromCart(
        element.dataset.productId
      );

      break;


    case 'checkout':

      checkout();

      break;


    case 'login':

      openLogin();

      break;


    case 'logout':

      logout();

      break;


    case 'sell':

      openSell();

      break;


    case 'add-story':

      openAddStory();

      break;


    case 'open-story':

      openStory(
        element.dataset.storyId
      );

      break;


    case 'play-video':

      playVideo(
        element.dataset.postId
      );

      break;


    case 'clear-cart':

      clearCart();

      break;


    case 'notification-item':

      openNotificationTarget(
        element.dataset.notificationId
      );

      break;


    case 'mark-all-read':

      markAllNotificationsRead();

      break;


    case 'message-item':

      openMessage(
        element.dataset.messageId
      );

      break;


    case 'search-post':

      closeSearch();

      scrollToPost(
        element.dataset.postId
      );

      break;


    default:

      break;

  }

}


/* =========================================================
   27. NAVIGATION
   ========================================================= */

function navigate(
  target
) {

  STATE.activeNav =
    target;

  updateNavigation();

  closeSideMenu();

  switch (target) {

    case 'home':

      STATE.activeCategory =
        null;

      renderFeed();

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });

      break;


    case 'categories':

      openCategories();

      break;


    case 'sell':

      openSell();

      break;


    case 'cart':

      openCart();

      break;


    case 'account':

      openAccount();

      break;


    default:

      break;

  }

}


/* =========================================================
   28. UPDATE NAV
   ========================================================= */

function updateNavigation() {

  if (!DOM.navigation) {
    return;
  }

  const links =
    DOM.navigation.querySelectorAll(
      '[data-nav]'
    );

  links.forEach(
    link => {

      const active =
        link.dataset.nav ===
        STATE.activeNav;

      link.classList.toggle(
        'active',
        active
      );

      if (active) {

        link.setAttribute(
          'aria-current',
          'page'
        );

      }
      else {

        link.removeAttribute(
          'aria-current'
        );

      }

      const icon =
        link.querySelector('i');

      if (
        !icon ||
        link.dataset.nav ===
          'sell'
      ) {

        return;

      }

      icon.classList.toggle(
        'ph-fill',
        active
      );

      icon.classList.toggle(
        'ph',
        !active
      );

    }
  );

}


/* =========================================================
   29. CATEGORY
   ========================================================= */

function showCategory(
  category
) {

  STATE.activeCategory =
    category;

  STATE.activeNav =
    'categories';

  updateNavigation();

  closeBottomSheet();

  const posts =
    DATA.posts.filter(
      post =>
        normalizeText(
          post.product?.category
        ) ===
        normalizeText(
          category
        )
    );

  renderFeed(posts);

  window.scrollTo({
    top: 0,
    behavior: 'smooth',
  });

}


/* =========================================================
   30. CATEGORIES SHEET
   ========================================================= */

function openCategories() {

  const realCategories =
    getCategories();

  const categories =
    mergeCategories(
      BASE_CATEGORIES.map(
        item => item.name
      ),
      realCategories
    );

  const template =
    categories
      .map(
        category => `
          <button
            type="button"
            class="menu-sheet-btn"
            data-action="quick-category"
            data-category="${escapeHTML(category)}"
          >

            <i class="ph ph-tag"></i>

            ${escapeHTML(category)}

          </button>
        `
      )
      .join('');

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Kategori
      </h2>

      ${template}
    `,
    'categories'
  );

}


/* =========================================================
   31. LIKE
   ========================================================= */

function toggleLike(
  postId
) {

  if (!postId) {
    return;
  }

  if (
    STATE.likedPosts.has(
      postId
    )
  ) {

    STATE.likedPosts.delete(
      postId
    );

  }
  else {

    STATE.likedPosts.add(
      postId
    );

  }

  saveLocalState();

  renderFeed();

}


/* =========================================================
   32. SAVE
   ========================================================= */

function toggleSave(
  postId
) {

  if (!postId) {
    return;
  }

  if (
    STATE.savedPosts.has(
      postId
    )
  ) {

    STATE.savedPosts.delete(
      postId
    );

    showToast(
      'Dihapus dari favorit.'
    );

  }
  else {

    STATE.savedPosts.add(
      postId
    );

    showToast(
      'Disimpan ke favorit.'
    );

  }

  saveLocalState();

  renderFeed();

}


/* =========================================================
   33. COMMENTS
   ========================================================= */

function openComments(
  postId
) {

  const post =
    findPost(postId);

  if (!post) {
    return;
  }

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Komentar
      </h2>

      <div class="empty-state">

        <i
          class="ph ph-chat-circle"
          aria-hidden="true"
        ></i>

        <strong class="empty-state-title">
          ${
            Number(post.comments) > 0
              ? `${formatCompactNumber(post.comments)} komentar`
              : 'Belum ada komentar'
          }
        </strong>

        <p class="empty-state-text">
          Percakapan tentang postingan ini
          akan tampil di sini.
        </p>

      </div>
    `,
    'comments'
  );

}


/* =========================================================
   34. SHARE
   ========================================================= */

async function sharePost(
  postId
) {

  const post =
    findPost(postId);

  if (!post) {
    return;
  }

  const url =
    `${window.location.origin}${window.location.pathname}#post-${encodeURIComponent(postId)}`;

  try {

    if (
      navigator.share
    ) {

      await navigator.share({
        title:
          post.product?.name ||
          CONFIG.APP_NAME,

        text:
          post.caption || '',

        url,
      });

      return;

    }

    await navigator.clipboard.writeText(
      url
    );

    showToast(
      'Tautan disalin.'
    );

  }
  catch (error) {

    if (
      error.name !==
      'AbortError'
    ) {

      console.error(error);

    }

  }

}


/* =========================================================
   35. POST MENU
   ========================================================= */

function openPostMenu(
  postId
) {

  const post =
    findPost(postId);

  if (!post) {
    return;
  }

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Postingan
      </h2>

      <button
        type="button"
        class="menu-sheet-btn"
        data-action="save"
        data-post-id="${escapeHTML(postId)}"
      >

        <i class="ph ph-bookmark-simple"></i>

        Simpan postingan

      </button>


      <button
        type="button"
        class="menu-sheet-btn"
        data-action="share"
        data-post-id="${escapeHTML(postId)}"
      >

        <i class="ph ph-share-network"></i>

        Bagikan

      </button>
    `,
    'post-menu'
  );

}


/* =========================================================
   36. CART
   ========================================================= */

function addToCart(
  productId
) {

  const product =
    findProduct(productId);

  if (!product) {
    return;
  }

  const existing =
    STATE.cart.find(
      item =>
        item.productId ===
        productId
    );

  if (existing) {

    existing.quantity += 1;

  }
  else {

    STATE.cart.push({
      productId:
        product.id,

      quantity:
        1,

      product:
        cloneSafe(product),
    });

  }

  saveLocalState();

  updateCartBadge();

  showToast(
    'Produk ditambahkan ke keranjang.'
  );

}


function buyNow(
  productId
) {

  addToCart(
    productId
  );

  openCart();

}


/* =========================================================
   37. OPEN CART
   ========================================================= */

function openCart() {

  if (
    STATE.cart.length === 0
  ) {

    openBottomSheet(
      `
        <h2 id="sheetTitle">
          Keranjang
        </h2>

        <div class="empty-state">

          <i
            class="ph ph-shopping-cart-simple"
            aria-hidden="true"
          ></i>

          <strong class="empty-state-title">
            Keranjang masih kosong
          </strong>

          <p class="empty-state-text">
            Produk yang kamu pilih akan tersimpan di sini.
          </p>

        </div>
      `,
      'cart'
    );

    return;

  }

  const items =
    STATE.cart
      .map(
        createCartItemTemplate
      )
      .join('');

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Keranjang
      </h2>

      ${items}

      <div class="product-card">

        <div class="product-info">

          <div class="product-badge">
            Total
          </div>

          <div class="product-price">
            ${formatRupiah(calculateCartTotal())}
          </div>

        </div>

        <button
          type="button"
          class="btn-primary"
          data-action="checkout"
        >
          Checkout
        </button>

      </div>


      <button
        type="button"
        class="menu-sheet-btn"
        data-action="clear-cart"
      >

        <i class="ph ph-trash"></i>

        Kosongkan keranjang

      </button>
    `,
    'cart'
  );

}


function createCartItemTemplate(
  item
) {

  const product =
    item.product ||
    findProduct(
      item.productId
    );

  if (!product) {
    return '';
  }

  return `
    <div class="product-card">

      <img
        src="${escapeHTML(product.image || ASSETS.logo)}"
        alt="${escapeHTML(product.name || '')}"
        class="product-img"
      >

      <div class="product-info">

        <div class="product-name">
          ${escapeHTML(product.name || '')}
        </div>

        <div class="product-price">
          ${formatRupiah(product.price)}
        </div>

        <div class="product-meta">
          Jumlah: ${item.quantity}
        </div>

      </div>


      <div class="product-actions">

        <button
          type="button"
          class="btn-icon"
          data-action="cart-increase"
          data-product-id="${escapeHTML(item.productId)}"
          aria-label="Tambah jumlah"
        >
          <i class="ph ph-plus"></i>
        </button>

        <button
          type="button"
          class="btn-icon"
          data-action="cart-decrease"
          data-product-id="${escapeHTML(item.productId)}"
          aria-label="Kurangi jumlah"
        >
          <i class="ph ph-minus"></i>
        </button>

        <button
          type="button"
          class="btn-icon"
          data-action="remove-cart"
          data-product-id="${escapeHTML(item.productId)}"
          aria-label="Hapus produk"
        >
          <i class="ph ph-trash"></i>
        </button>

      </div>

    </div>
  `;

}


function changeCartQuantity(
  productId,
  amount
) {

  const item =
    STATE.cart.find(
      cartItem =>
        cartItem.productId ===
        productId
    );

  if (!item) {
    return;
  }

  item.quantity += amount;

  if (
    item.quantity <= 0
  ) {

    removeFromCart(
      productId
    );

    return;

  }

  saveLocalState();

  updateCartBadge();

  openCart();

}


function removeFromCart(
  productId
) {

  STATE.cart =
    STATE.cart.filter(
      item =>
        item.productId !==
        productId
    );

  saveLocalState();

  updateCartBadge();

  openCart();

}


function clearCart() {

  STATE.cart = [];

  saveLocalState();

  updateCartBadge();

  closeBottomSheet();

  showToast(
    'Keranjang dikosongkan.'
  );

}


function calculateCartTotal() {

  return STATE.cart.reduce(
    (
      total,
      item
    ) => {

      const product =
        item.product ||
        findProduct(
          item.productId
        );

      if (!product) {
        return total;
      }

      return (
        total +
        Number(product.price || 0) *
        Number(item.quantity || 0)
      );

    },
    0
  );

}


/* =========================================================
   38. CHECKOUT
   ========================================================= */

function checkout() {

  if (!STATE.user) {

    showToast(
      'Masuk terlebih dahulu untuk checkout.'
    );

    openLogin();

    return;

  }

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Checkout
      </h2>

      <div class="empty-state">

        <i
          class="ph ph-receipt"
          aria-hidden="true"
        ></i>

        <strong class="empty-state-title">
          ${formatRupiah(calculateCartTotal())}
        </strong>

        <p class="empty-state-text">
          Transaksi akan diproses setelah
          sistem pesanan dan pembayaran diaktifkan.
        </p>

      </div>
    `,
    'checkout'
  );

}


/* =========================================================
   39. CART BADGE
   ========================================================= */

function updateCartBadge() {

  if (!DOM.navigation) {
    return;
  }

  const badge =
    DOM.navigation.querySelector(
      '.nav-badge'
    );

  const count =
    STATE.cart.reduce(
      (
        total,
        item
      ) =>
        total +
        Number(
          item.quantity || 0
        ),
      0
    );

  setBadge(
    badge,
    count
  );

}


/* =========================================================
   40. SIDE MENU
   ========================================================= */

function renderSideMenu() {

  if (!DOM.sideMenuContent) {
    return;
  }

  const sellerMenu =
    STATE.user?.role === 'seller' ||
    STATE.user?.role === 'admin'
      ? `
        <button
          type="button"
          class="menu-sheet-btn"
          data-menu-action="store"
        >
          <i class="ph ph-storefront"></i>
          Kelola Toko
        </button>

        <button
          type="button"
          class="menu-sheet-btn"
          data-menu-action="seller-products"
        >
          <i class="ph ph-package"></i>
          Produk Saya
        </button>
      `
      : '';


  const adminMenu =
    STATE.user?.role === 'admin'
      ? `
        <button
          type="button"
          class="menu-sheet-btn"
          data-menu-action="admin"
        >
          <i class="ph ph-shield-check"></i>
          Panel Pengelola
        </button>
      `
      : '';


  DOM.sideMenuContent.innerHTML =
    `
      <button
        type="button"
        class="menu-sheet-btn"
        data-menu-action="home"
      >
        <i class="ph ph-house"></i>
        Beranda
      </button>

      <button
        type="button"
        class="menu-sheet-btn"
        data-menu-action="categories"
      >
        <i class="ph ph-squares-four"></i>
        Kategori
      </button>

      <button
        type="button"
        class="menu-sheet-btn"
        data-menu-action="stores"
      >
        <i class="ph ph-storefront"></i>
        Jelajahi UMKM
      </button>

      <button
        type="button"
        class="menu-sheet-btn"
        data-menu-action="orders"
      >
        <i class="ph ph-receipt"></i>
        Pesanan Saya
      </button>

      <button
        type="button"
        class="menu-sheet-btn"
        data-menu-action="favorites"
      >
        <i class="ph ph-heart"></i>
        Favorit
      </button>

      ${sellerMenu}

      ${adminMenu}

      <button
        type="button"
        class="menu-sheet-btn"
        data-menu-action="about"
      >
        <i class="ph ph-info"></i>
        Tentang Pasar UMKM
      </button>

      <button
        type="button"
        class="menu-sheet-btn"
        data-menu-action="help"
      >
        <i class="ph ph-question"></i>
        Bantuan
      </button>
    `;

}


/* =========================================================
   41. SIDE MENU OPEN/CLOSE
   ========================================================= */

function openSideMenu() {

  if (!DOM.sideMenu) {
    return;
  }

  renderSideMenu();

  renderAccountState();

  DOM.sideMenu.hidden =
    false;

  DOM.sideMenu.setAttribute(
    'aria-hidden',
    'false'
  );

  DOM.menuButton?.setAttribute(
    'aria-expanded',
    'true'
  );

  STATE.isMenuOpen =
    true;

  lockBodyScroll();

}


function closeSideMenu() {

  if (!DOM.sideMenu) {
    return;
  }

  DOM.sideMenu.hidden =
    true;

  DOM.sideMenu.setAttribute(
    'aria-hidden',
    'true'
  );

  DOM.menuButton?.setAttribute(
    'aria-expanded',
    'false'
  );

  STATE.isMenuOpen =
    false;

  unlockBodyScroll();

}


/* =========================================================
   42. ACCOUNT
   ========================================================= */

function renderAccountState() {

  if (
    !DOM.sideAccountGuest ||
    !DOM.sideAccountUser
  ) {
    return;
  }

  const loggedIn =
    Boolean(
      STATE.user
    );

  DOM.sideAccountGuest.hidden =
    loggedIn;

  DOM.sideAccountUser.hidden =
    !loggedIn;

  if (!loggedIn) {
    return;
  }

  DOM.sideAccountUserName.textContent =
    STATE.user.name ||
    'Pengguna';

  DOM.sideAccountUserRole.textContent =
    formatUserRole(
      STATE.user.role
    );

}


/* =========================================================
   43. LOGIN
   ========================================================= */

function openLogin() {

  closeSideMenu();

  if (STATE.user) {

    openAccount();

    return;

  }

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Masuk / Daftar
      </h2>

      <div class="empty-state">

        <i
          class="ph ph-user-circle"
          aria-hidden="true"
        ></i>

        <strong class="empty-state-title">
          Akun Pasar UMKM
        </strong>

        <p class="empty-state-text">
          Login dan pendaftaran akan terhubung ke backend
          agar akun dan data transaksi tersimpan dengan aman.
        </p>

      </div>
    `,
    'login'
  );

}


/* =========================================================
   44. LOGOUT
   ========================================================= */

function logout() {

  STATE.user =
    null;

  localStorage.removeItem(
    CONFIG.SESSION_KEY
  );

  renderAccountState();

  renderSideMenu();

  renderStories();

  closeSideMenu();

  showToast(
    'Anda telah keluar.'
  );

}


/* =========================================================
   45. OPEN ACCOUNT
   ========================================================= */

function openAccount() {

  if (!STATE.user) {

    openLogin();

    return;

  }

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Akun Saya
      </h2>

      <div class="side-account">

        <div class="side-account-user-main">

          <div class="side-account-avatar">
            <i class="ph ph-user"></i>
          </div>

          <div class="side-account-user-info">

            <strong class="side-account-user-name">
              ${escapeHTML(STATE.user.name || 'Pengguna')}
            </strong>

            <span class="side-account-user-role">
              ${escapeHTML(formatUserRole(STATE.user.role))}
            </span>

          </div>

        </div>

      </div>


      <button
        type="button"
        class="menu-sheet-btn"
        data-action="logout"
      >

        <i class="ph ph-sign-out"></i>

        Keluar

      </button>
    `,
    'account'
  );

}


function formatUserRole(
  role
) {

  switch (role) {

    case 'seller':
      return 'Pemilik UMKM';

    case 'admin':
      return 'Pengelola';

    default:
      return 'Pembeli';

  }

}


/* =========================================================
   46. MENU ACTION
   ========================================================= */

function handleMenuAction(
  action
) {

  closeSideMenu();

  switch (action) {

    case 'home':

      navigate(
        'home'
      );

      break;


    case 'categories':

      openCategories();

      break;


    case 'stores':

      openStores();

      break;


    case 'orders':

      openOrders();

      break;


    case 'favorites':

      openFavorites();

      break;


    case 'profile':

      openAccount();

      break;


    case 'store':

      openSellerStore();

      break;


    case 'seller-products':

      openSellerProducts();

      break;


    case 'admin':

      openAdmin();

      break;


    case 'about':

      openAbout();

      break;


    case 'help':

      openHelp();

      break;


    default:

      break;

  }

}


/* =========================================================
   47. STORES
   ========================================================= */

function openStores() {

  const stores =
    getStores();

  if (
    stores.length === 0
  ) {

    openBottomSheet(
      `
        <h2 id="sheetTitle">
          Jelajahi UMKM
        </h2>

        <div class="empty-state">

          <i class="ph ph-storefront"></i>

          <strong class="empty-state-title">
            Belum ada UMKM
          </strong>

          <p class="empty-state-text">
            UMKM yang bergabung akan tampil di sini.
          </p>

        </div>
      `,
      'stores'
    );

    return;

  }

  const template =
    stores
      .map(
        store => `
          <button
            type="button"
            class="menu-sheet-btn"
          >

            <i class="ph ph-storefront"></i>

            ${escapeHTML(store.name)}

          </button>
        `
      )
      .join('');

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Jelajahi UMKM
      </h2>

      ${template}
    `,
    'stores'
  );

}


/* =========================================================
   48. ORDERS
   ========================================================= */

function openOrders() {

  if (!STATE.user) {

    showToast(
      'Masuk untuk melihat pesanan.'
    );

    openLogin();

    return;

  }

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Pesanan Saya
      </h2>

      <div class="empty-state">

        <i class="ph ph-receipt"></i>

        <strong class="empty-state-title">
          Belum ada pesanan
        </strong>

        <p class="empty-state-text">
          Riwayat transaksi akan tampil di sini.
        </p>

      </div>
    `,
    'orders'
  );

}


/* =========================================================
   49. FAVORITES
   ========================================================= */

function openFavorites() {

  const favorites =
    DATA.posts.filter(
      post =>
        STATE.savedPosts.has(
          post.id
        )
    );

  if (
    favorites.length === 0
  ) {

    openBottomSheet(
      `
        <h2 id="sheetTitle">
          Favorit
        </h2>

        <div class="empty-state">

          <i class="ph ph-heart"></i>

          <strong class="empty-state-title">
            Belum ada favorit
          </strong>

          <p class="empty-state-text">
            Simpan postingan agar mudah ditemukan kembali.
          </p>

        </div>
      `,
      'favorites'
    );

    return;

  }

  closeBottomSheet();

  renderFeed(
    favorites
  );

}


/* =========================================================
   50. SELL
   ========================================================= */

function openSell() {

  if (!STATE.user) {

    showToast(
      'Masuk untuk mulai menjual.'
    );

    openLogin();

    return;

  }

  if (
    STATE.user.role !== 'seller' &&
    STATE.user.role !== 'admin'
  ) {

    openBottomSheet(
      `
        <h2 id="sheetTitle">
          Mulai Jual
        </h2>

        <div class="empty-state">

          <i class="ph ph-storefront"></i>

          <strong class="empty-state-title">
            Daftarkan UMKM
          </strong>

          <p class="empty-state-text">
            Akun penjual diperlukan sebelum produk dipublikasikan.
          </p>

        </div>
      `,
      'seller-register'
    );

    return;

  }

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Mulai Jual
      </h2>

      <button
        type="button"
        class="menu-sheet-btn"
      >
        <i class="ph ph-plus-circle"></i>
        Tambah Produk
      </button>

      <button
        type="button"
        class="menu-sheet-btn"
      >
        <i class="ph ph-camera"></i>
        Buat Postingan
      </button>

      <button
        type="button"
        class="menu-sheet-btn"
      >
        <i class="ph ph-storefront"></i>
        Kelola Toko
      </button>
    `,
    'sell'
  );

}


/* =========================================================
   51. SELLER/ADMIN
   ========================================================= */

function openSellerStore() {

  openBottomSheet(
    createComingSoonTemplate(
      'Kelola Toko',
      'storefront',
      'Profil dan informasi UMKM akan dikelola dari halaman ini.'
    ),
    'seller-store'
  );

}


function openSellerProducts() {

  openBottomSheet(
    createComingSoonTemplate(
      'Produk Saya',
      'package',
      'Produk yang diterbitkan akan tampil di sini.'
    ),
    'seller-products'
  );

}


function openAdmin() {

  openBottomSheet(
    createComingSoonTemplate(
      'Panel Pengelola',
      'shield-check',
      'Moderasi UMKM dan aktivitas platform akan dikelola di sini.'
    ),
    'admin'
  );

}


/* =========================================================
   52. STORY
   ========================================================= */

function openStory(
  storyId
) {

  const story =
    DATA.stories.find(
      item =>
        item.id ===
        storyId
    );

  if (!story) {
    return;
  }

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        ${escapeHTML(story.name)}
      </h2>

      <div class="empty-state">

        <img
          src="${escapeHTML(story.avatar)}"
          alt=""
          class="story-avatar"
        >

        <p class="empty-state-text">
          Konten cerita akan dimuat dari server.
        </p>

      </div>
    `,
    'story'
  );

}


function openAddStory() {

  if (!STATE.user) {

    openLogin();

    return;

  }

  openBottomSheet(
    createComingSoonTemplate(
      'Buat Cerita',
      'camera',
      'Foto atau video singkat UMKM dapat dipublikasikan dari sini.'
    ),
    'add-story'
  );

}


/* =========================================================
   53. VIDEO
   ========================================================= */

function playVideo(
  postId
) {

  const post =
    findPost(postId);

  if (
    !post ||
    post.media?.type !== 'video'
  ) {

    return;

  }

  showToast(
    'Video akan menggunakan media asli dari server.'
  );

}


/* =========================================================
   54. SEARCH
   ========================================================= */

function openSearch() {

  if (!DOM.searchOverlay) {
    return;
  }

  closeSideMenu();

  DOM.searchOverlay.hidden =
    false;

  DOM.searchOverlay.setAttribute(
    'aria-hidden',
    'false'
  );

  STATE.isSearchOpen =
    true;

  lockBodyScroll();

  renderSearchHint();

  window.setTimeout(
    () => {

      DOM.searchInput?.focus();

    },
    40
  );

}


function closeSearch() {

  if (!DOM.searchOverlay) {
    return;
  }

  DOM.searchOverlay.hidden =
    true;

  DOM.searchOverlay.setAttribute(
    'aria-hidden',
    'true'
  );

  STATE.isSearchOpen =
    false;

  unlockBodyScroll();

}


function handleSearchInput(
  event
) {

  STATE.searchQuery =
    event.target.value.trim();

  if (
    DOM.searchClearButton
  ) {

    DOM.searchClearButton.hidden =
      !STATE.searchQuery;

  }

  if (
    STATE.searchQuery.length <
    2
  ) {

    renderSearchHint();

    return;

  }

  renderSearchResults(
    STATE.searchQuery
  );

}


function clearSearch() {

  STATE.searchQuery =
    '';

  if (DOM.searchInput) {

    DOM.searchInput.value =
      '';

    DOM.searchInput.focus();

  }

  if (
    DOM.searchClearButton
  ) {

    DOM.searchClearButton.hidden =
      true;

  }

  renderSearchHint();

}


function renderSearchHint() {

  if (!DOM.searchResults) {
    return;
  }

  DOM.searchResults.innerHTML =
    `
      <div class="empty-state">

        <i class="ph ph-magnifying-glass"></i>

        <strong class="empty-state-title">
          Cari Pasar UMKM
        </strong>

        <p class="empty-state-text">
          Temukan produk, kategori, atau UMKM lokal.
        </p>

      </div>
    `;

}


function renderSearchResults(
  query
) {

  if (!DOM.searchResults) {
    return;
  }

  const normalized =
    normalizeText(query);

  const results =
    DATA.posts.filter(
      post => {

        const haystack =
          [
            post.product?.name,
            post.product?.category,
            post.store?.name,
            post.caption,
          ]
            .filter(Boolean)
            .join(' ');

        return normalizeText(
          haystack
        ).includes(
          normalized
        );

      }
    );

  if (
    results.length === 0
  ) {

    DOM.searchResults.innerHTML =
      `
        <div class="empty-state">

          <i class="ph ph-magnifying-glass"></i>

          <strong class="empty-state-title">
            Tidak ditemukan
          </strong>

          <p class="empty-state-text">
            Tidak ada hasil untuk
            “${escapeHTML(query)}”.
          </p>

        </div>
      `;

    return;

  }

  DOM.searchResults.innerHTML =
    results
      .map(
        post => `
          <button
            type="button"
            class="menu-sheet-btn"
            data-action="search-post"
            data-post-id="${escapeHTML(post.id)}"
          >

            <i class="ph ph-package"></i>

            ${
              escapeHTML(
                post.product?.name ||
                post.store?.name ||
                'Postingan UMKM'
              )
            }

          </button>
        `
      )
      .join('');

}


/* =========================================================
   55. NOTIFICATIONS
   ========================================================= */

function openNotifications() {

  if (
    DATA.notifications.length === 0
  ) {

    openBottomSheet(
      `
        <h2 id="sheetTitle">
          Notifikasi
        </h2>

        <div class="empty-state">

          <i class="ph ph-bell"></i>

          <strong class="empty-state-title">
            Belum ada notifikasi
          </strong>

          <p class="empty-state-text">
            Aktivitas akun dan transaksi akan tampil di sini.
          </p>

        </div>
      `,
      'notifications'
    );

    return;

  }

  const items =
    DATA.notifications
      .map(
        createNotificationTemplate
      )
      .join('');

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Notifikasi
      </h2>

      <button
        type="button"
        class="menu-sheet-btn"
        data-action="mark-all-read"
      >

        <i class="ph ph-checks"></i>

        Tandai semua sudah dibaca

      </button>

      ${items}
    `,
    'notifications'
  );

}


function createNotificationTemplate(
  notification
) {

  return `
    <button
      type="button"
      class="menu-sheet-btn"
      data-action="notification-item"
      data-notification-id="${escapeHTML(notification.id)}"
    >

      <i class="${getNotificationIcon(notification.type)}"></i>

      ${escapeHTML(notification.title || 'Notifikasi')}

    </button>
  `;

}


function getNotificationIcon(
  type
) {

  switch (type) {

    case 'like':
      return 'ph ph-heart';

    case 'comment':
      return 'ph ph-chat-circle';

    case 'order':
      return 'ph ph-receipt';

    case 'store':
      return 'ph ph-storefront';

    default:
      return 'ph ph-bell';

  }

}


function openNotificationTarget(
  notificationId
) {

  const notification =
    DATA.notifications.find(
      item =>
        item.id ===
        notificationId
    );

  if (!notification) {
    return;
  }

  notification.unread =
    false;

  updateHeaderBadges();

  if (
    notification.targetType ===
      'post' &&
    notification.targetId
  ) {

    closeBottomSheet();

    scrollToPost(
      notification.targetId
    );

  }

}


function markAllNotificationsRead() {

  DATA.notifications.forEach(
    notification => {

      notification.unread =
        false;

    }
  );

  updateHeaderBadges();

  closeBottomSheet();

  showToast(
    'Semua notifikasi sudah dibaca.'
  );

}


/* =========================================================
   56. MESSAGES
   ========================================================= */

function openMessages() {

  if (
    DATA.messages.length === 0
  ) {

    openBottomSheet(
      `
        <h2 id="sheetTitle">
          Pesan
        </h2>

        <div class="empty-state">

          <i class="ph ph-chat-circle"></i>

          <strong class="empty-state-title">
            Belum ada percakapan
          </strong>

          <p class="empty-state-text">
            Pesan antara pembeli dan UMKM akan tampil di sini.
          </p>

        </div>
      `,
      'messages'
    );

    return;

  }

  const items =
    DATA.messages
      .map(
        message => `
          <button
            type="button"
            class="menu-sheet-btn"
            data-action="message-item"
            data-message-id="${escapeHTML(message.id)}"
          >

            <i class="ph ph-chat-circle"></i>

            ${escapeHTML(message.title || message.name || 'Percakapan')}

          </button>
        `
      )
      .join('');

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Pesan
      </h2>

      ${items}
    `,
    'messages'
  );

}


function openMessage(
  messageId
) {

  const message =
    DATA.messages.find(
      item =>
        item.id ===
        messageId
    );

  if (!message) {
    return;
  }

  message.unread =
    false;

  updateHeaderBadges();

  openBottomSheet(
    createComingSoonTemplate(
      message.title ||
      message.name ||
      'Percakapan',
      'chat-circle',
      'Isi percakapan akan dimuat dari server.'
    ),
    'message-thread'
  );

}


/* =========================================================
   57. HEADER BADGES
   ========================================================= */

function updateHeaderBadges() {

  const notificationBadge =
    DOM.notificationButton
      ?.querySelector(
        '.badge-dot'
      );

  const messageBadge =
    DOM.messageButton
      ?.querySelector(
        '.badge-dot'
      );

  const unreadNotifications =
    DATA.notifications.filter(
      item =>
        item.unread
    ).length;

  const unreadMessages =
    DATA.messages.filter(
      item =>
        item.unread
    ).length;

  setBadge(
    notificationBadge,
    unreadNotifications
  );

  setBadge(
    messageBadge,
    unreadMessages
  );

}


function setBadge(
  element,
  value
) {

  if (!element) {
    return;
  }

  const count =
    Number(value) || 0;

  if (
    count <= 0
  ) {

    element.hidden =
      true;

    element.textContent =
      '0';

    return;

  }

  element.hidden =
    false;

  element.textContent =
    count > 99
      ? '99+'
      : String(count);

}


/* =========================================================
   58. ABOUT
   Logos moved here, not sidebar.
   ========================================================= */

function openAbout() {

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Tentang Pasar UMKM
      </h2>

      <div class="empty-state">

        <img
          src="${ASSETS.logo}"
          alt="Pasar UMKM Lubuklinggau"
          class="side-menu-logo"
        >

        <strong class="empty-state-title">
          Pasar UMKM
        </strong>

        <p class="empty-state-text">
          Platform pemberdayaan dan digitalisasi UMKM lokal
          untuk membantu masyarakat menemukan dan mendukung
          usaha di Lubuklinggau.
        </p>

      </div>


      <div class="side-account">

        <div class="side-menu-footer-logos">

          <img
            src="${ASSETS.hipmi}"
            alt="HIPMI PT UIN Al Azhaar Lubuklinggau"
            class="side-footer-logo side-footer-logo-hipmi"
          >

          <img
            src="${ASSETS.university}"
            alt="Universitas Islam Nusantara Al-Azhaar Lubuklinggau"
            class="side-footer-logo"
          >

        </div>

        <p class="side-menu-footer-label">
          Diinisiasi oleh
        </p>

        <strong class="side-menu-footer-name">
          ${escapeHTML(CONFIG.ORGANIZATION)}
        </strong>

        <p class="side-menu-footer-label">
          Founder & Product Initiator
        </p>

        <strong class="side-menu-footer-name">
          ${escapeHTML(CONFIG.INITIATOR)}
        </strong>

      </div>
    `,
    'about'
  );

}


/* =========================================================
   59. HELP
   ========================================================= */

function openHelp() {

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Bantuan
      </h2>

      <button
        type="button"
        class="menu-sheet-btn"
      >
        <i class="ph ph-shopping-cart-simple"></i>
        Cara berbelanja
      </button>

      <button
        type="button"
        class="menu-sheet-btn"
      >
        <i class="ph ph-storefront"></i>
        Cara mendaftarkan UMKM
      </button>

      <button
        type="button"
        class="menu-sheet-btn"
      >
        <i class="ph ph-shield-check"></i>
        Keamanan akun
      </button>

      <button
        type="button"
        class="menu-sheet-btn"
      >
        <i class="ph ph-question"></i>
        Pertanyaan umum
      </button>
    `,
    'help'
  );

}


/* =========================================================
   60. BOTTOM SHEET
   ========================================================= */

function openBottomSheet(
  html,
  type = 'generic'
) {

  if (
    !DOM.bottomSheet ||
    !DOM.sheetOverlay ||
    !DOM.sheetContent
  ) {
    return;
  }

  DOM.sheetContent.innerHTML =
    html;

  DOM.sheetOverlay.hidden =
    false;

  DOM.bottomSheet.hidden =
    false;

  DOM.sheetOverlay.setAttribute(
    'aria-hidden',
    'false'
  );

  DOM.bottomSheet.setAttribute(
    'aria-hidden',
    'false'
  );

  STATE.activeSheet =
    type;

  lockBodyScroll();

  requestAnimationFrame(
    () => {

      DOM.sheetOverlay.classList.add(
        'show'
      );

      DOM.bottomSheet.classList.add(
        'show'
      );

    }
  );

}


function closeBottomSheet() {

  if (
    !DOM.bottomSheet ||
    !DOM.sheetOverlay
  ) {
    return;
  }

  DOM.sheetOverlay.classList.remove(
    'show'
  );

  DOM.bottomSheet.classList.remove(
    'show'
  );

  DOM.sheetOverlay.setAttribute(
    'aria-hidden',
    'true'
  );

  DOM.bottomSheet.setAttribute(
    'aria-hidden',
    'true'
  );

  STATE.activeSheet =
    null;

  window.setTimeout(
    () => {

      DOM.sheetOverlay.hidden =
        true;

      DOM.bottomSheet.hidden =
        true;

      if (
        DOM.sheetContent
      ) {

        DOM.sheetContent.innerHTML =
          '';

      }

    },
    320
  );

  unlockBodyScroll();

}


/* =========================================================
   61. SCROLL
   ========================================================= */

function handleScroll() {

  DOM.header?.classList.toggle(
    'scrolled',
    window.scrollY > 6
  );

}


/* =========================================================
   62. KEYBOARD
   ========================================================= */

function handleKeyboard(
  event
) {

  if (
    event.key !==
    'Escape'
  ) {
    return;
  }

  if (
    STATE.isSearchOpen
  ) {

    closeSearch();

    return;

  }

  if (
    STATE.activeSheet
  ) {

    closeBottomSheet();

    return;

  }

  if (
    STATE.isMenuOpen
  ) {

    closeSideMenu();

  }

}


/* =========================================================
   63. BODY SCROLL LOCK
   ========================================================= */

let bodyLockCount = 0;


function lockBodyScroll() {

  bodyLockCount += 1;

  document.body.style.overflow =
    'hidden';

}


function unlockBodyScroll() {

  bodyLockCount =
    Math.max(
      0,
      bodyLockCount - 1
    );

  if (
    bodyLockCount === 0
  ) {

    document.body.style.overflow =
      '';

  }

}


/* =========================================================
   64. FINDERS
   ========================================================= */

function findPost(
  postId
) {

  return DATA.posts.find(
    post =>
      String(post.id) ===
      String(postId)
  ) || null;

}


function findProduct(
  productId
) {

  for (
    const post
    of DATA.posts
  ) {

    if (
      String(post.product?.id) ===
      String(productId)
    ) {

      return post.product;

    }

  }

  return null;

}


/* =========================================================
   65. VISIBLE POSTS
   ========================================================= */

function getVisiblePosts() {

  if (
    !STATE.activeCategory
  ) {

    return DATA.posts;

  }

  return DATA.posts.filter(
    post =>
      normalizeText(
        post.product?.category
      ) ===
      normalizeText(
        STATE.activeCategory
      )
  );

}


/* =========================================================
   66. GET CATEGORIES
   ========================================================= */

function getCategories() {

  const categories =
    DATA.posts
      .map(
        post =>
          post.product?.category
      )
      .filter(Boolean);

  return [
    ...new Set(categories),
  ];

}


/* =========================================================
   67. GET STORES
   ========================================================= */

function getStores() {

  const map =
    new Map();

  DATA.posts.forEach(
    post => {

      const store =
        post.store;

      if (
        !store?.id
      ) {
        return;
      }

      if (
        !map.has(store.id)
      ) {

        map.set(
          store.id,
          store
        );

      }

    }
  );

  return [
    ...map.values(),
  ];

}


/* =========================================================
   68. MERGE CATEGORIES
   ========================================================= */

function mergeCategories(
  base,
  dynamic
) {

  const map =
    new Map();

  [
    ...base,
    ...dynamic,
  ].forEach(
    category => {

      const key =
        normalizeText(
          category
        );

      if (
        !map.has(key)
      ) {

        map.set(
          key,
          category
        );

      }

    }
  );

  return [
    ...map.values(),
  ];

}


/* =========================================================
   69. SCROLL TO POST
   ========================================================= */

function scrollToPost(
  postId
) {

  STATE.activeCategory =
    null;

  renderFeed();

  requestAnimationFrame(
    () => {

      const element =
        document.getElementById(
          `post-${postId}`
        );

      if (!element) {

        showToast(
          'Postingan tidak ditemukan.'
        );

        return;

      }

      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });

    }
  );

}


/* =========================================================
   70. LOCAL STATE
   ========================================================= */

function saveLocalState() {

  const payload = {

    likedPosts:
      [...STATE.likedPosts],

    savedPosts:
      [...STATE.savedPosts],

    cart:
      STATE.cart,

  };

  try {

    localStorage.setItem(
      CONFIG.STORAGE_KEY,
      JSON.stringify(payload)
    );

  }
  catch (error) {

    console.warn(
      '[Pasar UMKM] Local state not saved.',
      error
    );

  }

}


function restoreLocalState() {

  try {

    const raw =
      localStorage.getItem(
        CONFIG.STORAGE_KEY
      );

    if (!raw) {
      return;
    }

    const saved =
      JSON.parse(raw);

    if (
      Array.isArray(
        saved.likedPosts
      )
    ) {

      STATE.likedPosts =
        new Set(
          saved.likedPosts
        );

    }

    if (
      Array.isArray(
        saved.savedPosts
      )
    ) {

      STATE.savedPosts =
        new Set(
          saved.savedPosts
        );

    }

    if (
      Array.isArray(
        saved.cart
      )
    ) {

      STATE.cart =
        saved.cart;

    }

  }
  catch (error) {

    console.warn(
      '[Pasar UMKM] Local state not restored.',
      error
    );

  }

}


/* =========================================================
   71. LOADING
   ========================================================= */

function setLoading(
  loading
) {

  STATE.loading =
    Boolean(loading);

  if (!DOM.loading) {
    return;
  }

  DOM.loading.hidden =
    !STATE.loading;

  DOM.loading.setAttribute(
    'aria-hidden',
    String(!STATE.loading)
  );

}


/* =========================================================
   72. TOAST
   ========================================================= */

let toastTimer = null;


function showToast(
  message
) {

  if (!DOM.toast) {
    return;
  }

  window.clearTimeout(
    toastTimer
  );

  DOM.toast.textContent =
    message;

  DOM.toast.classList.add(
    'show'
  );

  toastTimer =
    window.setTimeout(
      () => {

        DOM.toast.classList.remove(
          'show'
        );

      },
      CONFIG.TOAST_DURATION
    );

}


/* =========================================================
   73. TEMPLATE HELPER
   ========================================================= */

function createComingSoonTemplate(
  title,
  icon,
  text
) {

  return `
    <h2 id="sheetTitle">
      ${escapeHTML(title)}
    </h2>

    <div class="empty-state">

      <i
        class="ph ph-${escapeHTML(icon)}"
        aria-hidden="true"
      ></i>

      <strong class="empty-state-title">
        ${escapeHTML(title)}
      </strong>

      <p class="empty-state-text">
        ${escapeHTML(text)}
      </p>

    </div>
  `;

}


/* =========================================================
   74. FORMAT RUPIAH
   ========================================================= */

function formatRupiah(
  value
) {

  return new Intl.NumberFormat(
    'id-ID',
    {
      style:
        'currency',

      currency:
        'IDR',

      minimumFractionDigits:
        0,

      maximumFractionDigits:
        0,
    }
  ).format(
    Number(value) || 0
  );

}


/* =========================================================
   75. FORMAT NUMBER
   ========================================================= */

function formatCompactNumber(
  value
) {

  const number =
    Number(value) || 0;

  return new Intl.NumberFormat(
    'id-ID',
    {
      notation:
        number >= 1000
          ? 'compact'
          : 'standard',

      maximumFractionDigits:
        1,
    }
  ).format(number);

}


/* =========================================================
   76. RELATIVE TIME
   ========================================================= */

function formatRelativeTime(
  dateValue
) {

  if (!dateValue) {
    return '';
  }

  const date =
    new Date(dateValue);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return '';

  }

  const difference =
    Date.now() -
    date.getTime();

  const seconds =
    Math.floor(
      difference / 1000
    );

  if (
    seconds < 60
  ) {

    return 'baru saja';

  }

  const minutes =
    Math.floor(
      seconds / 60
    );

  if (
    minutes < 60
  ) {

    return `${minutes} menit`;

  }

  const hours =
    Math.floor(
      minutes / 60
    );

  if (
    hours < 24
  ) {

    return `${hours} jam`;

  }

  const days =
    Math.floor(
      hours / 24
    );

  if (
    days < 7
  ) {

    return `${days} hari`;

  }

  return new Intl.DateTimeFormat(
    'id-ID',
    {
      day:
        'numeric',

      month:
        'short',

      year:
        date.getFullYear() !==
        new Date().getFullYear()
          ? 'numeric'
          : undefined,
    }
  ).format(date);

}


/* =========================================================
   77. NORMALIZE TEXT
   ========================================================= */

function normalizeText(
  value
) {

  return String(
    value || ''
  )
    .trim()
    .toLowerCase();

}


/* =========================================================
   78. ESCAPE HTML
   ========================================================= */

function escapeHTML(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {

    return '';

  }

  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

}


/* =========================================================
   79. CLONE
   ========================================================= */

function cloneSafe(
  value
) {

  if (
    typeof structuredClone ===
    'function'
  ) {

    return structuredClone(
      value
    );

  }

  return JSON.parse(
    JSON.stringify(value)
  );

}


/* =========================================================
   80. DEVELOPMENT UTILITIES
   ========================================================= */

window.PasarUMKM = {

  getState() {

    return STATE;

  },

  getData() {

    return DATA;

  },

  refresh() {

    renderAll();

  },

  resetIntro() {

    sessionStorage.removeItem(
      CONFIG.INTRO_SESSION_KEY
    );

    window.location.reload();

  },

  clearLocalState() {

    localStorage.removeItem(
      CONFIG.STORAGE_KEY
    );

    window.location.reload();

  },

};
