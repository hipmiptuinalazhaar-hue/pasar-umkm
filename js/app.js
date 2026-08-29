/* =========================================================
   PASAR UMKM
   APP.JS v5.0
   Frontend Application Controller
   ========================================================= */

'use strict';


/* =========================================================
   01. CONFIGURATION
   ========================================================= */

const CONFIG = {

  APP_NAME: 'Pasar UMKM',

  LOCATION: 'Lubuklinggau',

  ORGANIZATION:
    'HIPMI PT UIN Al Azhaar Lubuklinggau',

  UNIVERSITY:
    'Universitas Islam Nusantara Al-Azhaar Lubuklinggau',

  INITIATOR:
    'Capryan Agusto',

  /*
   * Production must remain FALSE.
   *
   * Demo data is intentionally disabled so a newly launched
   * marketplace does not pretend to already have likes,
   * orders, chats or products.
   */
  DEMO_MODE: false,

  /*
   * Later replace this with your Cloudflare Worker API.
   *
   * Example:
   * https://api-pasar-umkm.example.workers.dev
   */
  API_BASE_URL: '',

  STORAGE_KEY:
    'pasarUmkmFrontendStateV5',

  SESSION_KEY:
    'pasarUmkmSessionV5',

  INTRO_SESSION_KEY:
    'pasarUmkmIntroSeen',

  SPLASH_HOLD_MS: 1150,

  SPLASH_EXIT_MS: 420,

  TOAST_DURATION: 2400,

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
   03. DEVELOPMENT DATA
   Disabled while DEMO_MODE = false.
   ========================================================= */

const DEMO_DATA = {

  stories: [

    {
      id: 'story-1',
      name: 'Madi Craft',
      avatar:
        'https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?auto=format&fit=crop&w=300&q=80',
      hasUpdate: true,
      live: false,
    },

    {
      id: 'story-2',
      name: 'Maepi Art',
      avatar:
        'https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?auto=format&fit=crop&w=300&q=80',
      hasUpdate: true,
      live: false,
    },

  ],


  posts: [

    {
      id: 'post-1',

      store: {
        id: 'store-1',
        name: 'Contoh UMKM',
        avatar:
          'https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=200&q=80',
        verified: false,
      },

      location:
        'Lubuklinggau',

      createdAt:
        '2026-08-29T06:00:00+07:00',

      caption:
        'Contoh tampilan produk untuk pengujian antarmuka.',

      media: {
        type: 'image',
        src:
          'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
        aspect: 'square',
      },

      likes: 0,

      comments: 0,

      product: {

        id: 'product-1',

        name:
          'Produk Contoh',

        image:
          'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=500&q=80',

        price: 75000,

        originalPrice: null,

        sold: 0,

        rating: null,

        category:
          'Produk Lokal',

        storeId:
          'store-1',

      },

    },

  ],


  notifications: [],

  messages: [],

};


/* =========================================================
   04. APPLICATION DATA
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
   05. APPLICATION STATE
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
   06. DOM CACHE
   ========================================================= */

const DOM = {};


/* =========================================================
   07. INITIALIZATION
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
   08. CACHE DOM
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

  DOM.stories =
    document.getElementById(
      'stories'
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

  DOM.searchButton =
    document.getElementById(
      'searchButton'
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
   09. INITIAL DATA
   ========================================================= */

async function loadInitialData() {

  if (CONFIG.DEMO_MODE) {
    return;
  }

  /*
   * Until API_BASE_URL exists, production starts honestly
   * with an empty marketplace.
   */
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
   10. API CLIENT
   ========================================================= */

async function apiRequest(
  endpoint,
  options = {}
) {

  if (!CONFIG.API_BASE_URL) {
    return null;
  }

  const url =
    `${CONFIG.API_BASE_URL}${endpoint}`;

  const response =
    await fetch(
      url,
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

    const message =
      `API error ${response.status}`;

    throw new Error(message);

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
   11. SPLASH
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

  const prefersReducedMotion =
    window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

  if (prefersReducedMotion) {

    window.setTimeout(
      finishSplash,
      120
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
   12. GLOBAL RENDER
   ========================================================= */

function renderAll() {

  renderStories();

  renderFeed();

  renderSideMenu();

  renderAccountState();

  updateNavigation();

  updateCartBadge();

  updateHeaderBadges();

}


/* =========================================================
   13. STORIES
   ========================================================= */

function renderStories() {

  if (!DOM.stories) {
    return;
  }

  const addStory =
    STATE.user
      ? createAddStoryTemplate()
      : '';

  if (
    DATA.stories.length === 0
  ) {

    if (STATE.user) {

      DOM.stories.innerHTML =
        addStory;

    }
    else {

      DOM.stories.innerHTML =
        createStoriesEmptyTemplate();

    }

    return;

  }

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


function createStoriesEmptyTemplate() {

  return `
    <button
      type="button"
      class="story-item story-add"
      data-action="explore-stories"
      aria-label="Belum ada cerita UMKM"
    >
      <span class="story-ring">
        <i
          class="ph ph-storefront"
          aria-hidden="true"
        ></i>
      </span>

      <span class="story-name">
        UMKM Lokal
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

  const liveClass =
    story.live
      ? 'live'
      : '';

  return `
    <button
      type="button"
      class="story-item ${updateClass} ${liveClass}"
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
   14. FEED
   ========================================================= */

function renderFeed(
  posts = DATA.posts
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


function createFeedEmptyTemplate() {

  return `
    <div class="empty-state">

      <i
        class="ph ph-storefront"
        aria-hidden="true"
      ></i>

      <strong class="empty-state-title">
        Belum ada postingan
      </strong>

      <p class="empty-state-text">
        Produk dan cerita dari UMKM Lubuklinggau
        akan tampil di sini saat mulai dipublikasikan.
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
              Masuk untuk Memulai
            </button>
          `
      }

    </div>
  `;

}


/* =========================================================
   15. POST TEMPLATE
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
          aria-label="Simpan postingan"
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
        post.comments > 0
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
   16. MEDIA
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
   17. POST STATS
   ========================================================= */

function createPostStats(
  post
) {

  const likes =
    Number(post.likes) || 0;

  const localLiked =
    STATE.likedPosts.has(
      post.id
    );

  const finalLikes =
    likes + (localLiked ? 1 : 0);

  if (finalLikes <= 0) {
    return '';
  }

  return `
    <div class="post-stats">
      ${formatCompactNumber(finalLikes)} suka
    </div>
  `;

}


/* =========================================================
   18. POST CAPTION
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
   19. PRODUCT TEMPLATE
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
   20. EVENTS
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

  if (DOM.searchInput) {

    DOM.searchInput.addEventListener(
      'input',
      handleSearchInput
    );

  }

  if (DOM.searchClearButton) {

    DOM.searchClearButton.addEventListener(
      'click',
      clearSearch
    );

  }

  document.addEventListener(
    'keydown',
    handleKeyboard
  );

}


/* =========================================================
   21. GLOBAL CLICK ROUTER
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

    const action =
      actionElement.dataset.action;

    handleAction(
      action,
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
   22. ACTION ROUTER
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


    case 'explore-stories':

      showToast(
        'Cerita UMKM akan muncul ketika tersedia.'
      );

      break;


    case 'play-video':

      playVideo(
        element.dataset.postId
      );

      break;


    case 'close-sheet':

      closeBottomSheet();

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
   23. NAVIGATION
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
   24. UPDATE NAVIGATION
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

      const isActive =
        link.dataset.nav ===
        STATE.activeNav;

      link.classList.toggle(
        'active',
        isActive
      );

      if (isActive) {

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

      if (!icon) {
        return;
      }

      if (
        link.dataset.nav ===
        'sell'
      ) {
        return;
      }

      icon.classList.toggle(
        'ph-fill',
        isActive
      );

      icon.classList.toggle(
        'ph',
        !isActive
      );

    }
  );

}


/* =========================================================
   25. LIKE
   ========================================================= */

async function toggleLike(
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

  renderFeed(
    getVisiblePosts()
  );

  if (
    CONFIG.API_BASE_URL &&
    STATE.user
  ) {

    try {

      await apiRequest(
        `/posts/${encodeURIComponent(postId)}/like`,
        {
          method:
            'POST',
        }
      );

    }
    catch (error) {

      console.error(error);

    }

  }

}


/* =========================================================
   26. SAVE
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

  renderFeed(
    getVisiblePosts()
  );

}


/* =========================================================
   27. COMMENTS
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
          Percakapan tentang produk ini akan tampil di sini.
        </p>

      </div>
    `,
    'comments'
  );

}


/* =========================================================
   28. SHARE
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

  const title =
    post.product?.name ||
    CONFIG.APP_NAME;

  try {

    if (
      navigator.share
    ) {

      await navigator.share({
        title,
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
   29. POST MENU
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

        <i
          class="ph ph-bookmark-simple"
          aria-hidden="true"
        ></i>

        Simpan postingan

      </button>


      <button
        type="button"
        class="menu-sheet-btn"
        data-action="share"
        data-post-id="${escapeHTML(postId)}"
      >

        <i
          class="ph ph-share-network"
          aria-hidden="true"
        ></i>

        Bagikan

      </button>
    `,
    'post-menu'
  );

}


/* =========================================================
   30. CART
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
        structuredCloneSafe(
          product
        ),
    });

  }

  saveLocalState();

  updateCartBadge();

  showToast(
    'Produk ditambahkan ke keranjang.'
  );

}


/* =========================================================
   31. BUY NOW
   ========================================================= */

function buyNow(
  productId
) {

  addToCart(
    productId
  );

  openCart();

}


/* =========================================================
   32. OPEN CART
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
            Produk yang Anda pilih akan tersimpan di sini.
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

  const total =
    calculateCartTotal();

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
            ${formatRupiah(total)}
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

        <i
          class="ph ph-trash"
          aria-hidden="true"
        ></i>

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


/* =========================================================
   33. CART QUANTITY
   ========================================================= */

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


/* =========================================================
   34. REMOVE CART
   ========================================================= */

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


/* =========================================================
   35. CLEAR CART
   ========================================================= */

function clearCart() {

  STATE.cart = [];

  saveLocalState();

  updateCartBadge();

  closeBottomSheet();

  showToast(
    'Keranjang dikosongkan.'
  );

}


/* =========================================================
   36. CART TOTAL
   ========================================================= */

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
   37. CHECKOUT
   ========================================================= */

function checkout() {

  if (!STATE.user) {

    showToast(
      'Masuk terlebih dahulu untuk checkout.'
    );

    openLogin();

    return;

  }

  if (
    STATE.cart.length === 0
  ) {

    showToast(
      'Keranjang masih kosong.'
    );

    return;

  }

  /*
   * Real payment / order creation belongs in backend.
   */
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
          Checkout akan diproses melalui sistem transaksi
          setelah backend pembayaran dan pesanan diaktifkan.
        </p>

      </div>
    `,
    'checkout'
  );

}


/* =========================================================
   38. CART BADGE
   ========================================================= */

function updateCartBadge() {

  if (!DOM.navigation) {
    return;
  }

  const badge =
    DOM.navigation.querySelector(
      '.nav-badge'
    );

  if (!badge) {
    return;
  }

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
   39. SIDE MENU
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
   40. SIDE MENU OPEN/CLOSE
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
   41. ACCOUNT STATE
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
   42. LOGIN
   ========================================================= */

function openLogin() {

  closeSideMenu();

  if (STATE.user) {

    openAccount();

    return;

  }

  /*
   * Authentication must be implemented server-side.
   * No fake production login is created here.
   */

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Masuk ke Pasar UMKM
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
          Sistem login akan terhubung ke backend agar akun,
          transaksi, toko, dan data pengguna tersimpan dengan aman.
        </p>

      </div>
    `,
    'login'
  );

}


/* =========================================================
   43. LOGOUT
   ========================================================= */

async function logout() {

  if (!STATE.user) {
    return;
  }

  if (
    CONFIG.API_BASE_URL
  ) {

    try {

      await apiRequest(
        '/auth/logout',
        {
          method: 'POST',
        }
      );

    }
    catch (error) {

      console.error(error);

    }

  }

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
   44. ACCOUNT
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

        Keluar dari akun

      </button>
    `,
    'account'
  );

}


/* =========================================================
   45. USER ROLE
   ========================================================= */

function formatUserRole(
  role
) {

  switch (role) {

    case 'seller':
      return 'Pemilik UMKM';

    case 'admin':
      return 'Pengelola';

    case 'buyer':
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
   47. CATEGORIES
   ========================================================= */

function openCategories() {

  const categories =
    getCategories();

  if (
    categories.length === 0
  ) {

    openBottomSheet(
      `
        <h2 id="sheetTitle">
          Kategori
        </h2>

        <div class="empty-state">

          <i class="ph ph-squares-four"></i>

          <strong class="empty-state-title">
            Belum ada kategori
          </strong>

          <p class="empty-state-text">
            Kategori akan terbentuk dari produk UMKM
            yang diterbitkan di Pasar UMKM.
          </p>

        </div>
      `,
      'categories'
    );

    return;

  }

  const template =
    categories
      .map(
        category => `
          <button
            type="button"
            class="menu-sheet-btn"
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

  DOM.sheetContent
    ?.querySelectorAll(
      '[data-category]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            showCategory(
              button.dataset.category
            );

          }
        );

      }
    );

}


function showCategory(
  category
) {

  STATE.activeCategory =
    category;

  const posts =
    DATA.posts.filter(
      post =>
        post.product?.category ===
        category
    );

  closeBottomSheet();

  renderFeed(posts);

  window.scrollTo({
    top: 0,
    behavior: 'smooth',
  });

}


/* =========================================================
   48. STORES
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
            Belum ada toko
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
   49. ORDERS
   ========================================================= */

function openOrders() {

  if (!STATE.user) {

    showToast(
      'Masuk untuk melihat pesanan.'
    );

    openLogin();

    return;

  }

  if (
    STATE.orders.length === 0
  ) {

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

    return;

  }

}


/* =========================================================
   50. FAVORITES
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
            Simpan produk atau postingan agar mudah ditemukan kembali.
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

  window.scrollTo({
    top: 0,
    behavior: 'smooth',
  });

}


/* =========================================================
   51. SELL
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
            Akun penjual diperlukan sebelum produk dapat dipublikasikan.
          </p>

        </div>
      `,
      'sell-register'
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
   52. SELLER PLACEHOLDERS
   ========================================================= */

function openSellerStore() {

  openBottomSheet(
    createComingSoonTemplate(
      'Kelola Toko',
      'storefront',
      'Informasi toko dan profil UMKM akan dikelola dari halaman ini.'
    ),
    'seller-store'
  );

}


function openSellerProducts() {

  openBottomSheet(
    createComingSoonTemplate(
      'Produk Saya',
      'package',
      'Produk yang diterbitkan pemilik UMKM akan tampil di sini.'
    ),
    'seller-products'
  );

}


function openAdmin() {

  openBottomSheet(
    createComingSoonTemplate(
      'Panel Pengelola',
      'shield-check',
      'Moderasi UMKM, produk, dan aktivitas platform akan dikelola di sini.'
    ),
    'admin'
  );

}


/* =========================================================
   53. STORIES
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
          Konten cerita akan ditampilkan dari data pengguna.
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
   54. VIDEO
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
    'Pemutar video akan menggunakan media asli dari server.'
  );

}


/* =========================================================
   55. SEARCH
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
    50
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

        <i
          class="ph ph-magnifying-glass"
          aria-hidden="true"
        ></i>

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
    query.toLowerCase();

  const results =
    DATA.posts.filter(
      post => {

        const productName =
          post.product?.name ||
          '';

        const category =
          post.product?.category ||
          '';

        const storeName =
          post.store?.name ||
          '';

        const caption =
          post.caption ||
          '';

        const haystack =
          [
            productName,
            category,
            storeName,
            caption,
          ]
            .join(' ')
            .toLowerCase();

        return haystack.includes(
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
   56. NOTIFICATIONS
   ========================================================= */

function openNotifications() {

  const notifications =
    DATA.notifications;

  if (
    notifications.length === 0
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
    notifications
      .map(
        notification =>
          createNotificationTemplate(
            notification
          )
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

      <i
        class="${getNotificationIcon(notification.type)}"
      ></i>

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
    'Semua notifikasi ditandai sudah dibaca.'
  );

}


/* =========================================================
   57. MESSAGES
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
   58. HEADER BADGES
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


/* =========================================================
   59. BADGE HELPER
   ========================================================= */

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
   60. ABOUT
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
          untuk membantu masyarakat menemukan, mengenal,
          dan mendukung produk usaha di Lubuklinggau.
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


      <p class="side-menu-footer-label">
        © ${new Date().getFullYear()} Pasar UMKM ·
        ${escapeHTML(CONFIG.ORGANIZATION)}
      </p>
    `,
    'about'
  );

}


/* =========================================================
   61. HELP
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
   62. BOTTOM SHEET
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


/* =========================================================
   63. CLOSE BOTTOM SHEET
   ========================================================= */

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
    330
  );

  unlockBodyScroll();

}


/* =========================================================
   64. HEADER SCROLL
   ========================================================= */

function handleScroll() {

  if (!DOM.header) {
    return;
  }

  DOM.header.classList.toggle(
    'scrolled',
    window.scrollY > 6
  );

}


/* =========================================================
   65. KEYBOARD
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
   66. BODY SCROLL
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
   67. FIND POST
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


/* =========================================================
   68. FIND PRODUCT
   ========================================================= */

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
   69. VISIBLE POSTS
   ========================================================= */

function getVisiblePosts() {

  if (
    !STATE.activeCategory
  ) {

    return DATA.posts;

  }

  return DATA.posts.filter(
    post =>
      post.product?.category ===
      STATE.activeCategory
  );

}


/* =========================================================
   70. GET CATEGORIES
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
   71. GET STORES
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
   72. SCROLL TO POST
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
   73. LOCAL STATE
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
      '[Pasar UMKM] Local state could not be saved.',
      error
    );

  }

}


/* =========================================================
   74. RESTORE LOCAL STATE
   ========================================================= */

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
      '[Pasar UMKM] Local state could not be restored.',
      error
    );

  }

}


/* =========================================================
   75. LOADING
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
    String(
      !STATE.loading
    )
  );

}


/* =========================================================
   76. TOAST
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
   77. COMING SOON TEMPLATE
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
   78. FORMAT RUPIAH
   ========================================================= */

function formatRupiah(
  value
) {

  const number =
    Number(value) || 0;

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
  ).format(number);

}


/* =========================================================
   79. COMPACT NUMBER
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
   80. RELATIVE TIME
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

  const now =
    Date.now();

  const difference =
    now -
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
   81. ESCAPE HTML
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
    .replaceAll(
      '&',
      '&amp;'
    )
    .replaceAll(
      '<',
      '&lt;'
    )
    .replaceAll(
      '>',
      '&gt;'
    )
    .replaceAll(
      '"',
      '&quot;'
    )
    .replaceAll(
      "'",
      '&#039;'
    );

}


/* =========================================================
   82. STRUCTURED CLONE FALLBACK
   ========================================================= */

function structuredCloneSafe(
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
   83. DEVELOPMENT API
   Useful while backend is being connected.
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
