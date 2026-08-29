/* =========================================================
   PASAR UMKM
   APP.JS v7.0
   HIPMI PT UIN AL AZHAAR LUBUKLINGGAU

   Production-oriented frontend controller.
   No fake production activity.
   ========================================================= */

'use strict';


/* =========================================================
   01. CONFIG
   ========================================================= */

const CONFIG = Object.freeze({
  APP_NAME: 'Pasar UMKM',
  CITY: 'Lubuklinggau',
  ORGANIZATION: 'HIPMI PT UIN Al Azhaar Lubuklinggau',
  INITIATOR: 'Capryan Agusto',

  DEMO_MODE: false,

  /*
   * Isi saat backend Cloudflare API sudah tersedia.
   *
   * Contoh:
   * API_BASE_URL: 'https://api.domainkamu.com'
   *
   * Selama kosong, frontend akan menggunakan empty-state
   * yang jujur dan tidak membuat aktivitas palsu.
   */
  API_BASE_URL: '',

  STORAGE_KEY: 'pasar-umkm-ui-v7',
  INTRO_KEY: 'pasar-umkm-intro-v7',

  SPLASH_DURATION: 950,
  SPLASH_EXIT_DURATION: 320,
  TOAST_DURATION: 2200,

  SEARCH_MIN_LENGTH: 2
});


/* =========================================================
   02. ASSETS
   ========================================================= */

const ASSETS = Object.freeze({
  /*
   * Sesuaikan jika nama file logo final berbeda.
   */
  logo: 'assets/logo.png'
});


/* =========================================================
   03. CATEGORY SYSTEM
   ========================================================= */

/*
 * Semua kategori tersedia di sini.
 *
 * home: true
 * = tampil di 4 shortcut homepage.
 *
 * Urutan HOME sengaja:
 * Kuliner, Fashion, Jasa, Finance.
 */

const CATEGORIES = Object.freeze([
  {
    id: 'kuliner',
    name: 'Kuliner',
    icon: 'fork-knife',
    home: true
  },
  {
    id: 'fashion',
    name: 'Fashion',
    icon: 't-shirt',
    home: true
  },
  {
    id: 'jasa',
    name: 'Jasa',
    icon: 'briefcase',
    home: true
  },
  {
    id: 'finance',
    name: 'Finance',
    icon: 'wallet',
    home: true
  },
  {
    id: 'kerajinan',
    name: 'Kerajinan',
    icon: 'paint-brush',
    home: false
  },
  {
    id: 'kecantikan',
    name: 'Kecantikan',
    icon: 'sparkle',
    home: false
  },
  {
    id: 'pertanian',
    name: 'Pertanian',
    icon: 'plant',
    home: false
  },
  {
    id: 'otomotif',
    name: 'Otomotif',
    icon: 'car',
    home: false
  },
  {
    id: 'elektronik',
    name: 'Elektronik',
    icon: 'device-mobile',
    home: false
  },
  {
    id: 'rumah-dekorasi',
    name: 'Rumah & Dekorasi',
    icon: 'house-line',
    home: false
  },
  {
    id: 'digital-teknologi',
    name: 'Digital & Teknologi',
    icon: 'laptop',
    home: false
  },
  {
    id: 'lainnya',
    name: 'Lainnya',
    icon: 'dots-three-circle',
    home: false
  }
]);


/* =========================================================
   04. DATA STORE
   ========================================================= */

const DATA = {
  stories: [],
  posts: [],
  stores: [],
  notifications: [],
  messages: [],
  orders: []
};


/* =========================================================
   05. APPLICATION STATE
   ========================================================= */

const STATE = {
  user: null,

  activeNav: 'home',
  activeCategory: null,

  searchQuery: '',

  likedPosts: new Set(),
  savedPosts: new Set(),

  cart: [],

  menuOpen: false,
  searchOpen: false,
  activeSheet: null,

  loading: false
};


/* =========================================================
   06. DOM CACHE
   ========================================================= */

const DOM = {};


/* =========================================================
   07. BOOTSTRAP
   ========================================================= */

document.addEventListener('DOMContentLoaded', initializeApp);


async function initializeApp() {
  cacheDOM();
  restoreLocalState();
  bindEvents();

  setupSplash();
  setLoading(true);

  try {
    await loadInitialData();
  } catch (error) {
    console.error('[Pasar UMKM] Bootstrap error:', error);

    showToast('Data belum dapat dimuat.');
  } finally {
    setLoading(false);
  }

  renderApplication();
  handleScroll();
}


/* =========================================================
   08. CACHE DOM
   ========================================================= */

function cacheDOM() {
  DOM.splash = document.getElementById('splashIntro');

  DOM.header =
    document.querySelector('.app-header') ||
    document.getElementById('header');

  DOM.storiesSection =
    document.getElementById('storiesSection');

  DOM.stories =
    document.getElementById('stories');

  DOM.homeDiscovery =
    document.getElementById('homeDiscovery');

  DOM.quickCategories =
    document.getElementById('quickCategories');

  DOM.feed =
    document.getElementById('feed');


  /* Header */

  DOM.menuButton =
    document.getElementById('menuButton');

  DOM.headerSearchButton =
    document.getElementById('headerSearchButton');

  DOM.notificationButton =
    document.getElementById('notificationButton');

  DOM.messageButton =
    document.getElementById('messageButton');


  /* Sidebar */

  DOM.sideMenu =
    document.getElementById('sideMenu');

  DOM.closeMenuButton =
    document.getElementById('closeMenuButton');

  DOM.sideMenuContent =
    document.getElementById('sideMenuContent');

  DOM.sideAccountGuest =
    document.getElementById('sideAccountGuest');

  DOM.sideAccountUser =
    document.getElementById('sideAccountUser');

  DOM.sideAccountUserName =
    document.getElementById('sideAccountUserName');

  DOM.sideAccountUserRole =
    document.getElementById('sideAccountUserRole');


  /* Search */

  DOM.searchOverlay =
    document.getElementById('searchOverlay');

  DOM.closeSearchButton =
    document.getElementById('closeSearchButton');

  DOM.searchInput =
    document.getElementById('searchInput');

  DOM.searchClearButton =
    document.getElementById('searchClearButton');

  DOM.searchResults =
    document.getElementById('searchResults');


  /* Navigation */

  DOM.navigation =
    document.getElementById('appNavigation');


  /* Sheet */

  DOM.sheetOverlay =
    document.getElementById('sheetOverlay');

  DOM.bottomSheet =
    document.getElementById('bottomSheet');

  DOM.sheetContent =
    document.getElementById('sheetContent');


  /* Feedback */

  DOM.toast =
    document.getElementById('toast');

  DOM.loading =
    document.getElementById('appLoading');
}


/* =========================================================
   09. INITIAL DATA
   ========================================================= */

async function loadInitialData() {
  // Cek dulu apakah user masih punya session login
  await restoreAuthSession();

  // Data marketplace lain nanti kita hubungkan belakangan
  if (!CONFIG.API_BASE_URL) {
    return;
  }

  const bootstrap = await apiRequest('/api/bootstrap');

  if (!bootstrap) {
    return;
  }

  DATA.stories = ensureArray(bootstrap.stories);
  DATA.posts = ensureArray(bootstrap.posts);
  DATA.stores = ensureArray(bootstrap.stores);
  DATA.notifications = ensureArray(bootstrap.notifications);
  DATA.messages = ensureArray(bootstrap.messages);
  DATA.orders = ensureArray(bootstrap.orders);

  if (bootstrap.user) {
    STATE.user = bootstrap.user;
  }

  if (Array.isArray(bootstrap.cart)) {
    STATE.cart = bootstrap.cart;
  }
}


/* =========================================================
   RESTORE AUTH SESSION
   ========================================================= */

async function restoreAuthSession() {
  try {
    const response = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json'
      },
      cache: 'no-store'
    });

    // 401 = user memang belum login
    if (response.status === 401) {
      STATE.user = null;
      return;
    }

    if (!response.ok) {
      throw new Error(
        `Auth check failed: ${response.status}`
      );
    }

    const data = await response.json();

    if (
      data.ok === true &&
      data.authenticated === true &&
      data.user
    ) {
      STATE.user = data.user;
      return;
    }

    STATE.user = null;
  } catch (error) {
    console.error(
      '[Pasar UMKM] Auth session check error:',
      error
    );

    STATE.user = null;
  }
}
/* =========================================================
   10. API CLIENT
   ========================================================= */

async function apiRequest(endpoint, options = {}) {
  if (!CONFIG.API_BASE_URL) {
    return null;
  }

  const controller = new AbortController();

  const timeout = window.setTimeout(() => {
    controller.abort();
  }, 12000);

  try {
    const response = await fetch(
      `${CONFIG.API_BASE_URL}${endpoint}`,
      {
        credentials: 'include',

        ...options,

        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...options.headers
        },

        signal: controller.signal
      }
    );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${response.statusText}`
      );
    }

    const contentType =
      response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      return null;
    }

    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}


/* =========================================================
   11. APPLICATION RENDER
   ========================================================= */

function renderApplication() {
  renderStories();
  renderQuickCategories();
  renderFeed();
  renderSidebar();
  renderAccount();
  updateNavigation();
  updateHeaderBadges();
  updateCartBadge();
}


/* =========================================================
   12. SPLASH
   ========================================================= */

function setupSplash() {
  if (!DOM.splash) {
    return;
  }

  const seen =
    sessionStorage.getItem(CONFIG.INTRO_KEY);

  if (seen) {
    DOM.splash.hidden = true;
    return;
  }

  sessionStorage.setItem(CONFIG.INTRO_KEY, '1');

  window.setTimeout(() => {
    DOM.splash.classList.add('is-exiting');

    window.setTimeout(() => {
      DOM.splash.hidden = true;
      DOM.splash.classList.add('is-hidden');
    }, CONFIG.SPLASH_EXIT_DURATION);
  }, CONFIG.SPLASH_DURATION);
}


/* =========================================================
   13. STORIES
   ========================================================= */

function renderStories() {
  if (!DOM.stories || !DOM.storiesSection) {
    return;
  }

  /*
   * Tidak ada story nyata?
   * Section disembunyikan total.
   */

  if (DATA.stories.length === 0) {
    DOM.stories.innerHTML = '';
    DOM.storiesSection.hidden = true;
    return;
  }

  DOM.storiesSection.hidden = false;

  let output = '';

  if (STATE.user) {
    output += `
      <button
        type="button"
        class="story-item story-add"
        data-action="add-story"
        aria-label="Tambah cerita"
      >
        <span class="story-ring">
          <i class="ph ph-plus" aria-hidden="true"></i>
        </span>

        <span class="story-name">
          Cerita Anda
        </span>
      </button>
    `;
  }

  output += DATA.stories
    .map(createStoryTemplate)
    .join('');

  DOM.stories.innerHTML = output;
}


function createStoryTemplate(story) {
  return `
    <button
      type="button"
      class="story-item ${story.unread ? 'has-update' : ''}"
      data-action="open-story"
      data-story-id="${escapeHTML(story.id)}"
      aria-label="Lihat cerita ${escapeHTML(story.name)}"
    >
      <span class="story-ring">
        <img
          class="story-avatar"
          src="${escapeHTML(story.avatar || ASSETS.logo)}"
          alt=""
          loading="lazy"
          decoding="async"
        >
      </span>

      <span class="story-name">
        ${escapeHTML(story.name || 'UMKM')}
      </span>
    </button>
  `;
}


/* =========================================================
   14. HOMEPAGE QUICK CATEGORIES
   EXACTLY FOUR
   ========================================================= */

function renderQuickCategories() {
  if (!DOM.quickCategories) {
    return;
  }

  const homepageCategories =
    CATEGORIES
      .filter(category => category.home)
      .slice(0, 4);

  DOM.quickCategories.innerHTML =
    homepageCategories
      .map(createCategoryCard)
      .join('');
}


function createCategoryCard(category) {
  return `
    <button
      type="button"
      class="quick-category"
      data-action="category"
      data-category-id="${escapeHTML(category.id)}"
      aria-label="Buka kategori ${escapeHTML(category.name)}"
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
   15. ALL CATEGORIES
   ========================================================= */

function openAllCategories() {
  const categories = CATEGORIES
    .map(category => {
      return `
        <button
          type="button"
          class="menu-sheet-btn"
          data-action="category"
          data-category-id="${escapeHTML(category.id)}"
        >
          <i
            class="ph ph-${escapeHTML(category.icon)}"
            aria-hidden="true"
          ></i>

          <span>
            ${escapeHTML(category.name)}
          </span>
        </button>
      `;
    })
    .join('');

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Semua Kategori
      </h2>

      ${categories}
    `,
    'categories'
  );
}


/* =========================================================
   16. CATEGORY NAVIGATION
   ========================================================= */

function openCategory(categoryId) {
  const category =
    CATEGORIES.find(item => item.id === categoryId);

  if (!category) {
    return;
  }

  STATE.activeCategory = category.id;
  STATE.activeNav = 'categories';

  closeBottomSheet();
  updateNavigation();

  const posts = DATA.posts.filter(post => {
    return normalizeText(post.product?.category) ===
      normalizeText(category.name) ||
      normalizeText(post.product?.categoryId) ===
      normalizeText(category.id);
  });

  renderFeed(posts, category);

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}


/* =========================================================
   17. FEED
   ========================================================= */

function renderFeed(
  posts = getVisiblePosts(),
  category = null
) {
  if (!DOM.feed) {
    return;
  }

  if (!posts.length) {
    DOM.feed.innerHTML =
      createEmptyFeedTemplate(category);

    return;
  }

  DOM.feed.innerHTML =
    posts
      .map(createPostTemplate)
      .join('');
}


/* =========================================================
   18. EMPTY FEED
   ========================================================= */

function createEmptyFeedTemplate(category = null) {
  if (category) {
    return `
      <section class="empty-state">
        <i
          class="ph ph-package"
          aria-hidden="true"
        ></i>

        <strong class="empty-state-title">
          Belum ada produk ${escapeHTML(category.name)}
        </strong>

        <p class="empty-state-text">
          Produk dari kategori ini akan muncul setelah
          UMKM mulai mempublikasikannya.
        </p>

        <button
          type="button"
          class="btn-primary"
          data-nav="home"
        >
          Kembali ke Beranda
        </button>
      </section>
    `;
  }

  return `
    <section class="empty-state">
      <i
        class="ph ph-storefront"
        aria-hidden="true"
      ></i>

      <strong class="empty-state-title">
        Belum ada postingan
      </strong>

      <p class="empty-state-text">
        Produk dan aktivitas UMKM Lubuklinggau akan
        tampil di sini setelah mulai dipublikasikan.
      </p>

      <button
        type="button"
        class="btn-primary"
        data-action="sell"
      >
        Mulai Jual
      </button>
    </section>
  `;
}


/* =========================================================
   19. POST TEMPLATE
   ========================================================= */

function createPostTemplate(post) {
  const postId = String(post.id || '');

  const liked =
    STATE.likedPosts.has(postId);

  const saved =
    STATE.savedPosts.has(postId);

  return `
    <article
      class="post-card"
      id="post-${escapeHTML(postId)}"
      data-post-id="${escapeHTML(postId)}"
    >

      ${createPostHeader(post)}

      ${createPostMedia(post)}

      <div class="post-actions">

        <div class="actions-left">

          <button
            type="button"
            class="action-btn ${liked ? 'liked' : ''}"
            data-action="like"
            data-post-id="${escapeHTML(postId)}"
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
            data-post-id="${escapeHTML(postId)}"
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
            data-post-id="${escapeHTML(postId)}"
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
          data-post-id="${escapeHTML(postId)}"
          aria-label="Simpan postingan"
          aria-pressed="${saved}"
        >
          <i
            class="${saved ? 'ph-fill' : 'ph'} ph-bookmark-simple"
            aria-hidden="true"
          ></i>
        </button>

      </div>

      ${createLikeCount(post)}

      ${createCaption(post)}

      ${
        Number(post.commentsCount || post.comments) > 0
          ? `
            <button
              type="button"
              class="view-comments"
              data-action="comments"
              data-post-id="${escapeHTML(postId)}"
            >
              Lihat ${formatCompactNumber(
                post.commentsCount || post.comments
              )} komentar
            </button>
          `
          : ''
      }

      <div class="post-time">
        ${formatRelativeTime(post.createdAt)}
      </div>

      ${
        post.product
          ? createProductTemplate(post.product)
          : ''
      }

    </article>
  `;
}


/* =========================================================
   20. POST HEADER
   ========================================================= */

function createPostHeader(post) {
  const store = post.store || {};

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
                  aria-label="UMKM terverifikasi"
                ></i>
              `
              : ''
          }

        </div>


        <div class="post-context">

          <span>
            ${escapeHTML(
              post.location ||
              store.location ||
              CONFIG.CITY
            )}
          </span>

          ${
            post.createdAt
              ? `
                <span
                  class="dot"
                  aria-hidden="true"
                ></span>

                <span>
                  ${formatRelativeTime(post.createdAt)}
                </span>
              `
              : ''
          }

        </div>

      </div>


      <button
        type="button"
        class="post-menu"
        data-action="post-menu"
        data-post-id="${escapeHTML(post.id)}"
        aria-label="Opsi postingan"
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
   21. POST MEDIA
   ========================================================= */

function createPostMedia(post) {
  const media = post.media;

  if (!media) {
    return '';
  }

  if (media.type === 'video') {
    return `
      <div class="post-media video">

        ${
          media.poster
            ? `
              <img
                src="${escapeHTML(media.poster)}"
                alt="${escapeHTML(media.alt || '')}"
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

  if (!media.src) {
    return '';
  }

  return `
    <div
      class="post-media ${
        media.aspect === 'square'
          ? 'square'
          : ''
      }"
    >
      <img
        src="${escapeHTML(media.src)}"
        alt="${escapeHTML(media.alt || '')}"
        loading="lazy"
        decoding="async"
      >
    </div>
  `;
}


/* =========================================================
   22. CAPTION
   ========================================================= */

function createCaption(post) {
  if (!post.caption) {
    return '';
  }

  return `
    <div class="post-caption">

      <span class="author">
        ${escapeHTML(
          post.store?.name ||
          'UMKM Lokal'
        )}
      </span>

      ${escapeHTML(post.caption)}

    </div>
  `;
}


/* =========================================================
   23. LIKE COUNT
   ========================================================= */

function createLikeCount(post) {
  const postId =
    String(post.id || '');

  const serverLikes =
    Number(post.likesCount || post.likes || 0);

  const locallyLiked =
    STATE.likedPosts.has(postId);

  const count =
    serverLikes +
    (locallyLiked ? 1 : 0);

  if (count <= 0) {
    return '';
  }

  return `
    <div class="post-stats">
      ${formatCompactNumber(count)} suka
    </div>
  `;
}


/* =========================================================
   24. PRODUCT CARD
   ========================================================= */

function createProductTemplate(product) {
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
          product.rating || product.sold
            ? `
              <div class="product-meta">

                ${
                  product.rating
                    ? `
                      <span class="stars">
                        ★ ${escapeHTML(product.rating)}
                      </span>
                    `
                    : ''
                }

                ${
                  product.rating && product.sold
                    ? '<span>·</span>'
                    : ''
                }

                ${
                  product.sold
                    ? `
                      <span>
                        ${formatCompactNumber(product.sold)}
                        terjual
                      </span>
                    `
                    : ''
                }

              </div>
            `
            : ''
        }


        <div class="product-price">

          ${formatRupiah(product.price)}

          ${
            product.originalPrice
              ? `
                <span class="original">
                  ${formatRupiah(product.originalPrice)}
                </span>
              `
              : ''
          }

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
   25. GLOBAL EVENTS
   ========================================================= */

function bindEvents() {
  document.addEventListener('click', handleDocumentClick);

  document.addEventListener(
    'keydown',
    handleKeyboard
  );

  window.addEventListener(
    'scroll',
    handleScroll,
    { passive: true }
  );

  DOM.searchInput?.addEventListener(
    'input',
    handleSearchInput
  );

  DOM.searchClearButton?.addEventListener(
    'click',
    clearSearch
  );
}


/* =========================================================
   26. DOCUMENT CLICK ROUTER
   ========================================================= */

function handleDocumentClick(event) {
  const navButton =
    event.target.closest('[data-nav]');

  if (navButton) {
    navigate(navButton.dataset.nav);
    return;
  }


  const actionButton =
    event.target.closest('[data-action]');

  if (actionButton) {
    runAction(
      actionButton.dataset.action,
      actionButton
    );

    return;
  }


  const menuAction =
    event.target.closest('[data-menu-action]');

  if (menuAction) {
    runMenuAction(
      menuAction.dataset.menuAction
    );

    return;
  }


  if (
    DOM.sideMenu &&
    STATE.menuOpen &&
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
   27. ACTION ROUTER
   ========================================================= */

function runAction(action, element) {
  const postId =
    element.dataset.postId;

  const productId =
    element.dataset.productId;

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

    case 'category':
    case 'quick-category':
      openCategory(
        element.dataset.categoryId ||
        findCategoryIdByName(
          element.dataset.category
        )
      );
      break;

    case 'all-categories':
      openAllCategories();
      break;

    case 'like':
      toggleLike(postId);
      break;

    case 'save':
      toggleSave(postId);
      break;

    case 'comments':
      openComments(postId);
      break;

    case 'share':
      sharePost(postId);
      break;

    case 'post-menu':
      openPostMenu(postId);
      break;

    case 'add-cart':
      addToCart(productId);
      break;

    case 'buy-now':
      buyNow(productId);
      break;

    case 'cart-increase':
      changeCartQuantity(productId, 1);
      break;

    case 'cart-decrease':
      changeCartQuantity(productId, -1);
      break;

    case 'remove-cart':
      removeFromCart(productId);
      break;

    case 'clear-cart':
      clearCart();
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

    case 'open-story':
      openStory(
        element.dataset.storyId
      );
      break;

    case 'add-story':
      openAddStory();
      break;

    case 'search-post':
      closeSearch();
      scrollToPost(postId);
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

    case 'close-sheet':
      closeBottomSheet();
      break;

    default:
      break;
  }
}


/* =========================================================
   28. MENU ROUTER
   ========================================================= */

function runMenuAction(action) {
  closeSideMenu();

  switch (action) {
    case 'home':
      navigate('home');
      break;

    case 'categories':
      openAllCategories();
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

    case 'about':
      openAbout();
      break;

    case 'help':
      openHelp();
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

    default:
      break;
  }
}


/* =========================================================
   29. MAIN NAVIGATION
   ========================================================= */

function navigate(target) {
  STATE.activeNav = target;

  closeSideMenu();

  switch (target) {
    case 'home':
      STATE.activeCategory = null;
      renderFeed();

      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
      break;

    case 'categories':
      openAllCategories();
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

  updateNavigation();
}


/* =========================================================
   30. NAV ACTIVE STATE
   ========================================================= */

function updateNavigation() {
  if (!DOM.navigation) {
    return;
  }

  DOM.navigation
    .querySelectorAll('[data-nav]')
    .forEach(button => {
      const isActive =
        button.dataset.nav === STATE.activeNav;

      button.classList.toggle(
        'active',
        isActive
      );

      if (isActive) {
        button.setAttribute(
          'aria-current',
          'page'
        );
      } else {
        button.removeAttribute(
          'aria-current'
        );
      }
    });
}


/* =========================================================
   31. LIKE
   ========================================================= */

function toggleLike(postId) {
  postId = String(postId || '');

  if (!postId) {
    return;
  }

  if (STATE.likedPosts.has(postId)) {
    STATE.likedPosts.delete(postId);
  } else {
    STATE.likedPosts.add(postId);
  }

  saveLocalState();
  renderFeed();
}


/* =========================================================
   32. SAVE
   ========================================================= */

function toggleSave(postId) {
  postId = String(postId || '');

  if (!postId) {
    return;
  }

  if (STATE.savedPosts.has(postId)) {
    STATE.savedPosts.delete(postId);
    showToast('Dihapus dari favorit.');
  } else {
    STATE.savedPosts.add(postId);
    showToast('Disimpan ke favorit.');
  }

  saveLocalState();
  renderFeed();
}


/* =========================================================
   33. COMMENTS
   ========================================================= */

function openComments(postId) {
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

      <section class="empty-state">
        <i
          class="ph ph-chat-circle"
          aria-hidden="true"
        ></i>

        <strong class="empty-state-title">
          Belum ada percakapan
        </strong>

        <p class="empty-state-text">
          Komentar asli akan muncul di sini setelah
          sistem akun dan backend diaktifkan.
        </p>
      </section>
    `,
    'comments'
  );
}


/* =========================================================
   34. SHARE
   ========================================================= */

async function sharePost(postId) {
  const post =
    findPost(postId);

  if (!post) {
    return;
  }

  const url =
    `${window.location.origin}` +
    `${window.location.pathname}` +
    `#post-${encodeURIComponent(postId)}`;

  try {
    if (navigator.share) {
      await navigator.share({
        title:
          post.product?.name ||
          CONFIG.APP_NAME,

        text:
          post.caption || '',

        url
      });

      return;
    }

    await navigator.clipboard.writeText(url);

    showToast('Tautan berhasil disalin.');
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error(error);
    }
  }
}


/* =========================================================
   35. POST MENU
   ========================================================= */

function openPostMenu(postId) {
  const post =
    findPost(postId);

  if (!post) {
    return;
  }

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Opsi Postingan
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

function addToCart(productId) {
  const product =
    findProduct(productId);

  if (!product) {
    return;
  }

  const existing =
    STATE.cart.find(
      item =>
        String(item.productId) ===
        String(productId)
    );

  if (existing) {
    existing.quantity += 1;
  } else {
    STATE.cart.push({
      productId: String(product.id),
      quantity: 1,
      product: cloneData(product)
    });
  }

  saveLocalState();
  updateCartBadge();

  showToast('Ditambahkan ke keranjang.');
}


function buyNow(productId) {
  addToCart(productId);
  openCart();
}


function openCart() {
  if (!STATE.cart.length) {
    openBottomSheet(
      `
        <h2 id="sheetTitle">
          Keranjang
        </h2>

        <section class="empty-state">
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
        </section>
      `,
      'cart'
    );

    return;
  }

  const items =
    STATE.cart
      .map(createCartItemTemplate)
      .join('');

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Keranjang
      </h2>

      ${items}

      <section class="product-card">

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

      </section>

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


function createCartItemTemplate(item) {
  const product =
    item.product ||
    findProduct(item.productId);

  if (!product) {
    return '';
  }

  return `
    <section class="product-card">

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
          Jumlah: ${Number(item.quantity) || 1}
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

    </section>
  `;
}


function changeCartQuantity(productId, delta) {
  const item =
    STATE.cart.find(
      cartItem =>
        String(cartItem.productId) ===
        String(productId)
    );

  if (!item) {
    return;
  }

  item.quantity += delta;

  if (item.quantity <= 0) {
    removeFromCart(productId);
    return;
  }

  saveLocalState();
  updateCartBadge();
  openCart();
}


function removeFromCart(productId) {
  STATE.cart =
    STATE.cart.filter(
      item =>
        String(item.productId) !==
        String(productId)
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

  showToast('Keranjang dikosongkan.');
}


function calculateCartTotal() {
  return STATE.cart.reduce(
    (total, item) => {
      const product =
        item.product ||
        findProduct(item.productId);

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
    showToast('Masuk terlebih dahulu untuk checkout.');
    openLogin();
    return;
  }

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Checkout
      </h2>

      <section class="empty-state">

        <i
          class="ph ph-receipt"
          aria-hidden="true"
        ></i>

        <strong class="empty-state-title">
          ${formatRupiah(calculateCartTotal())}
        </strong>

        <p class="empty-state-text">
          Checkout akan diaktifkan setelah sistem
          pesanan dan pembayaran backend tersedia.
        </p>

      </section>
    `,
    'checkout'
  );
}


/* =========================================================
   38. SIDEBAR
   ========================================================= */

function renderSidebar() {
  if (!DOM.sideMenuContent) {
    return;
  }

  let sellerItems = '';

  if (
    STATE.user?.role === 'seller' ||
    STATE.user?.role === 'admin'
  ) {
    sellerItems = `
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
    `;
  }

  const adminItem =
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

  DOM.sideMenuContent.innerHTML = `
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
      Semua Kategori
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

    ${sellerItems}

    ${adminItem}

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
   39. SIDEBAR OPEN/CLOSE
   ========================================================= */

function openSideMenu() {
  if (!DOM.sideMenu) {
    return;
  }

  renderSidebar();
  renderAccount();

  DOM.sideMenu.hidden = false;

  DOM.sideMenu.setAttribute(
    'aria-hidden',
    'false'
  );

  STATE.menuOpen = true;

  lockBodyScroll();
}


function closeSideMenu() {
  if (!DOM.sideMenu) {
    return;
  }

  DOM.sideMenu.hidden = true;

  DOM.sideMenu.setAttribute(
    'aria-hidden',
    'true'
  );

  STATE.menuOpen = false;

  unlockBodyScroll();
}


/* =========================================================
   40. ACCOUNT STATE
   ========================================================= */

function renderAccount() {
  if (
    !DOM.sideAccountGuest ||
    !DOM.sideAccountUser
  ) {
    return;
  }

  const loggedIn =
    Boolean(STATE.user);

  DOM.sideAccountGuest.hidden =
    loggedIn;

  DOM.sideAccountUser.hidden =
    !loggedIn;

  if (!loggedIn) {
    return;
  }

  if (DOM.sideAccountUserName) {
    DOM.sideAccountUserName.textContent =
      STATE.user.name || 'Pengguna';
  }

  if (DOM.sideAccountUserRole) {
    DOM.sideAccountUserRole.textContent =
      formatRole(STATE.user.role);
  }
}


/* =========================================================
   41. LOGIN
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

      <section class="empty-state">

        <i
          class="ph ph-user-circle"
          aria-hidden="true"
        ></i>

        <strong class="empty-state-title">
          Akun Pasar UMKM
        </strong>

        <p class="empty-state-text">
          Sistem akun akan terhubung ke backend agar
          data pengguna, toko, pesanan, dan transaksi
          tersimpan dengan aman.
        </p>

      </section>
    `,
    'login'
  );
}


/* =========================================================
   42. ACCOUNT
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

      <section class="side-account">

        <div class="side-account-user-main">

          <div class="side-account-avatar">
            <i class="ph ph-user"></i>
          </div>

          <div class="side-account-user-info">

            <strong class="side-account-user-name">
              ${escapeHTML(
                STATE.user.name ||
                'Pengguna'
              )}
            </strong>

            <span class="side-account-user-role">
              ${escapeHTML(
                formatRole(
                  STATE.user.role
                )
              )}
            </span>

          </div>

        </div>

      </section>


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


async function logout() {
  const logoutButtons =
    document.querySelectorAll(
      '[data-action="logout"]'
    );

  logoutButtons.forEach((button) => {
    button.disabled = true;
  });

  try {
    const response =
      await fetch(
        '/api/auth/logout',
        {
          method: 'POST',

          credentials: 'include',

          headers: {
            Accept: 'application/json'
          },

          cache: 'no-store'
        }
      );


    const data =
      await response
        .json()
        .catch(() => ({}));


    if (
      !response.ok ||
      data.ok !== true
    ) {
      throw new Error(
        data.error ||
        `Logout gagal: ${response.status}`
      );
    }


    STATE.user = null;


    renderAccount();
    renderSidebar();
    renderStories();


    closeBottomSheet();
    closeSideMenu();


    showToast(
      data.message ||
      'Anda telah keluar.'
    );
  } catch (error) {
    console.error(
      '[Pasar UMKM] Logout error:',
      error
    );


    logoutButtons.forEach((button) => {
      button.disabled = false;
    });


    showToast(
      'Gagal keluar. Silakan coba lagi.'
    );
  }
}


function formatRole(role) {
  if (role === 'seller') {
    return 'Pemilik UMKM';
  }

  if (role === 'admin') {
    return 'Pengelola';
  }

  return 'Pembeli';
}


/* =========================================================
   43. SELL
   ========================================================= */

function openSell() {
  if (!STATE.user) {
    showToast('Masuk untuk mulai menjual.');
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

        <section class="empty-state">

          <i
            class="ph ph-storefront"
            aria-hidden="true"
          ></i>

          <strong class="empty-state-title">
            Daftarkan UMKM
          </strong>

          <p class="empty-state-text">
            Aktifkan profil UMKM sebelum menerbitkan
            produk dan postingan.
          </p>

        </section>
      `,
      'seller-register'
    );

    return;
  }

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Pusat Penjual
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
        data-menu-action="store"
      >
        <i class="ph ph-storefront"></i>
        Kelola Toko
      </button>
    `,
    'sell'
  );
}


/* =========================================================
   44. STORES
   ========================================================= */

function openStores() {
  const stores =
    getStores();

  if (!stores.length) {
    openBottomSheet(
      `
        <h2 id="sheetTitle">
          Jelajahi UMKM
        </h2>

        <section class="empty-state">

          <i
            class="ph ph-storefront"
            aria-hidden="true"
          ></i>

          <strong class="empty-state-title">
            Belum ada UMKM
          </strong>

          <p class="empty-state-text">
            UMKM yang telah terdaftar akan tampil di sini.
          </p>

        </section>
      `,
      'stores'
    );

    return;
  }

  const html =
    stores.map(store => `
      <button
        type="button"
        class="menu-sheet-btn"
      >
        <i class="ph ph-storefront"></i>

        ${escapeHTML(store.name)}
      </button>
    `).join('');

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Jelajahi UMKM
      </h2>

      ${html}
    `,
    'stores'
  );
}


/* =========================================================
   45. ORDERS
   ========================================================= */

function openOrders() {
  if (!STATE.user) {
    showToast('Masuk untuk melihat pesanan.');
    openLogin();
    return;
  }

  if (!DATA.orders.length) {
    openBottomSheet(
      `
        <h2 id="sheetTitle">
          Pesanan Saya
        </h2>

        <section class="empty-state">

          <i
            class="ph ph-receipt"
            aria-hidden="true"
          ></i>

          <strong class="empty-state-title">
            Belum ada pesanan
          </strong>

          <p class="empty-state-text">
            Riwayat transaksi akan muncul di sini.
          </p>

        </section>
      `,
      'orders'
    );

    return;
  }
}


/* =========================================================
   46. FAVORITES
   ========================================================= */

function openFavorites() {
  const posts =
    DATA.posts.filter(
      post =>
        STATE.savedPosts.has(
          String(post.id)
        )
    );

  if (!posts.length) {
    openBottomSheet(
      `
        <h2 id="sheetTitle">
          Favorit
        </h2>

        <section class="empty-state">

          <i
            class="ph ph-heart"
            aria-hidden="true"
          ></i>

          <strong class="empty-state-title">
            Belum ada favorit
          </strong>

          <p class="empty-state-text">
            Produk dan postingan yang disimpan
            akan muncul di sini.
          </p>

        </section>
      `,
      'favorites'
    );

    return;
  }

  closeBottomSheet();
  renderFeed(posts);
}


/* =========================================================
   47. ABOUT
   ========================================================= */

function openAbout() {
  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Tentang Pasar UMKM
      </h2>

      <section class="empty-state">

        <img
          src="${escapeHTML(ASSETS.logo)}"
          alt="Pasar UMKM"
          class="side-menu-logo"
        >

        <strong
          class="empty-state-title"
          style="margin-top:16px;"
        >
          Pasar UMKM
        </strong>

        <p class="empty-state-text">
          Platform digital untuk membantu masyarakat
          menemukan, mengenal, dan mendukung UMKM lokal
          di Lubuklinggau.
        </p>

      </section>


      <section
        class="side-account"
        style="margin-top:14px;"
      >

        <p class="side-menu-footer-label">
          Inisiatif
        </p>

        <strong class="side-menu-footer-name">
          ${escapeHTML(CONFIG.ORGANIZATION)}
        </strong>


        <p
          class="side-menu-footer-label"
          style="margin-top:12px;"
        >
          Founder & Product Initiator
        </p>

        <strong class="side-menu-footer-name">
          ${escapeHTML(CONFIG.INITIATOR)}
        </strong>

      </section>
    `,
    'about'
  );
}


/* =========================================================
   48. HELP
   ========================================================= */

function openHelp() {
  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Pusat Bantuan
      </h2>

      <button
        type="button"
        class="menu-sheet-btn"
      >
        <i class="ph ph-shopping-bag"></i>
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
   49. SELLER / ADMIN
   ========================================================= */

function openSellerStore() {
  openBottomSheet(
    createInformationState(
      'Kelola Toko',
      'storefront',
      'Profil toko, alamat, informasi usaha, dan pengaturan UMKM akan dikelola di sini.'
    ),
    'seller-store'
  );
}


function openSellerProducts() {
  openBottomSheet(
    createInformationState(
      'Produk Saya',
      'package',
      'Produk yang telah diterbitkan akan dikelola dari halaman ini.'
    ),
    'seller-products'
  );
}


function openAdmin() {
  openBottomSheet(
    createInformationState(
      'Panel Pengelola',
      'shield-check',
      'Moderasi UMKM, produk, laporan, dan pengelolaan platform akan tersedia di sini.'
    ),
    'admin'
  );
}


/* =========================================================
   50. STORIES INTERACTION
   ========================================================= */

function openStory(storyId) {
  const story =
    DATA.stories.find(
      item =>
        String(item.id) ===
        String(storyId)
    );

  if (!story) {
    return;
  }

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        ${escapeHTML(story.name || 'Cerita')}
      </h2>

      <section class="empty-state">

        <img
          src="${escapeHTML(story.avatar || ASSETS.logo)}"
          alt=""
          class="story-avatar"
        >

        <p class="empty-state-text">
          Konten cerita akan dimuat dari server.
        </p>

      </section>
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
    createInformationState(
      'Buat Cerita',
      'camera',
      'Pemilik UMKM dapat membagikan foto atau video singkat dari sini.'
    ),
    'add-story'
  );
}


/* =========================================================
   51. SEARCH
   ========================================================= */

function openSearch() {
  if (!DOM.searchOverlay) {
    return;
  }

  closeSideMenu();

  DOM.searchOverlay.hidden = false;

  DOM.searchOverlay.setAttribute(
    'aria-hidden',
    'false'
  );

  STATE.searchOpen = true;

  lockBodyScroll();
  renderSearchHint();

  window.setTimeout(() => {
    DOM.searchInput?.focus();
  }, 30);
}


function closeSearch() {
  if (!DOM.searchOverlay) {
    return;
  }

  DOM.searchOverlay.hidden = true;

  DOM.searchOverlay.setAttribute(
    'aria-hidden',
    'true'
  );

  STATE.searchOpen = false;

  unlockBodyScroll();
}


function handleSearchInput(event) {
  const query =
    event.target.value.trim();

  STATE.searchQuery = query;

  if (DOM.searchClearButton) {
    DOM.searchClearButton.hidden =
      query.length === 0;
  }

  if (
    query.length <
    CONFIG.SEARCH_MIN_LENGTH
  ) {
    renderSearchHint();
    return;
  }

  renderSearchResults(query);
}


function renderSearchHint() {
  if (!DOM.searchResults) {
    return;
  }

  DOM.searchResults.innerHTML = `
    <section class="empty-state">

      <i
        class="ph ph-magnifying-glass"
        aria-hidden="true"
      ></i>

      <strong class="empty-state-title">
        Cari di Pasar UMKM
      </strong>

      <p class="empty-state-text">
        Cari produk, kategori, atau nama UMKM.
      </p>

    </section>
  `;
}


function renderSearchResults(query) {
  if (!DOM.searchResults) {
    return;
  }

  const normalized =
    normalizeText(query);


  const matchedCategories =
    CATEGORIES.filter(category =>
      normalizeText(category.name)
        .includes(normalized)
    );


  const matchedPosts =
    DATA.posts.filter(post => {
      const searchable = [
        post.product?.name,
        post.product?.category,
        post.store?.name,
        post.caption
      ]
        .filter(Boolean)
        .join(' ');

      return normalizeText(searchable)
        .includes(normalized);
    });


  if (
    !matchedCategories.length &&
    !matchedPosts.length
  ) {
    DOM.searchResults.innerHTML = `
      <section class="empty-state">

        <i
          class="ph ph-magnifying-glass"
          aria-hidden="true"
        ></i>

        <strong class="empty-state-title">
          Tidak ditemukan
        </strong>

        <p class="empty-state-text">
          Tidak ada hasil untuk
          “${escapeHTML(query)}”.
        </p>

      </section>
    `;

    return;
  }


  const categoryHTML =
    matchedCategories
      .map(category => `
        <button
          type="button"
          class="menu-sheet-btn"
          data-action="category"
          data-category-id="${escapeHTML(category.id)}"
        >
          <i class="ph ph-${escapeHTML(category.icon)}"></i>

          ${escapeHTML(category.name)}
        </button>
      `)
      .join('');


  const postHTML =
    matchedPosts
      .map(post => `
        <button
          type="button"
          class="menu-sheet-btn"
          data-action="search-post"
          data-post-id="${escapeHTML(post.id)}"
        >
          <i class="ph ph-package"></i>

          ${escapeHTML(
            post.product?.name ||
            post.store?.name ||
            'Postingan UMKM'
          )}
        </button>
      `)
      .join('');


  DOM.searchResults.innerHTML =
    categoryHTML +
    postHTML;
}


function clearSearch() {
  STATE.searchQuery = '';

  if (DOM.searchInput) {
    DOM.searchInput.value = '';
    DOM.searchInput.focus();
  }

  if (DOM.searchClearButton) {
    DOM.searchClearButton.hidden = true;
  }

  renderSearchHint();
}


/* =========================================================
   52. NOTIFICATIONS
   ========================================================= */

function openNotifications() {
  if (!DATA.notifications.length) {
    openBottomSheet(
      `
        <h2 id="sheetTitle">
          Notifikasi
        </h2>

        <section class="empty-state">

          <i
            class="ph ph-bell"
            aria-hidden="true"
          ></i>

          <strong class="empty-state-title">
            Belum ada notifikasi
          </strong>

          <p class="empty-state-text">
            Aktivitas akun, produk, dan transaksi
            akan muncul di sini.
          </p>

        </section>
      `,
      'notifications'
    );

    return;
  }

  const notifications =
    DATA.notifications
      .map(notification => `
        <button
          type="button"
          class="menu-sheet-btn"
          data-action="notification-item"
          data-notification-id="${escapeHTML(notification.id)}"
        >
          <i class="${getNotificationIcon(notification.type)}"></i>

          ${escapeHTML(
            notification.title ||
            'Notifikasi'
          )}
        </button>
      `)
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

      ${notifications}
    `,
    'notifications'
  );
}


function openNotificationTarget(notificationId) {
  const notification =
    DATA.notifications.find(
      item =>
        String(item.id) ===
        String(notificationId)
    );

  if (!notification) {
    return;
  }

  notification.unread = false;
  updateHeaderBadges();

  if (
    notification.targetType === 'post' &&
    notification.targetId
  ) {
    closeBottomSheet();
    scrollToPost(notification.targetId);
  }
}


function markAllNotificationsRead() {
  DATA.notifications.forEach(item => {
    item.unread = false;
  });

  updateHeaderBadges();
  closeBottomSheet();

  showToast('Semua notifikasi sudah dibaca.');
}


function getNotificationIcon(type) {
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


/* =========================================================
   53. MESSAGES
   ========================================================= */

function openMessages() {
  if (!DATA.messages.length) {
    openBottomSheet(
      `
        <h2 id="sheetTitle">
          Pesan
        </h2>

        <section class="empty-state">

          <i
            class="ph ph-chat-circle"
            aria-hidden="true"
          ></i>

          <strong class="empty-state-title">
            Belum ada percakapan
          </strong>

          <p class="empty-state-text">
            Percakapan antara pembeli dan UMKM
            akan muncul di sini.
          </p>

        </section>
      `,
      'messages'
    );

    return;
  }

  const messages =
    DATA.messages
      .map(message => `
        <button
          type="button"
          class="menu-sheet-btn"
          data-action="message-item"
          data-message-id="${escapeHTML(message.id)}"
        >
          <i class="ph ph-chat-circle"></i>

          ${escapeHTML(
            message.title ||
            message.name ||
            'Percakapan'
          )}
        </button>
      `)
      .join('');

  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Pesan
      </h2>

      ${messages}
    `,
    'messages'
  );
}


function openMessage(messageId) {
  const message =
    DATA.messages.find(
      item =>
        String(item.id) ===
        String(messageId)
    );

  if (!message) {
    return;
  }

  message.unread = false;
  updateHeaderBadges();

  openBottomSheet(
    createInformationState(
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
   54. BADGES
   ========================================================= */

function updateHeaderBadges() {
  const notificationBadge =
    DOM.notificationButton
      ?.querySelector('.badge-dot');

  const messageBadge =
    DOM.messageButton
      ?.querySelector('.badge-dot');


  const notificationsCount =
    DATA.notifications.filter(
      item => item.unread
    ).length;


  const messagesCount =
    DATA.messages.filter(
      item => item.unread
    ).length;


  setBadge(
    notificationBadge,
    notificationsCount
  );

  setBadge(
    messageBadge,
    messagesCount
  );
}


function updateCartBadge() {
  if (!DOM.navigation) {
    return;
  }

  const badge =
    DOM.navigation.querySelector('.nav-badge');

  const count =
    STATE.cart.reduce(
      (total, item) =>
        total +
        Number(item.quantity || 0),
      0
    );

  setBadge(badge, count);
}


function setBadge(element, count) {
  if (!element) {
    return;
  }

  count =
    Number(count) || 0;

  if (count <= 0) {
    element.hidden = true;
    element.textContent = '';
    return;
  }

  element.hidden = false;

  element.textContent =
    count > 99
      ? '99+'
      : String(count);
}


/* =========================================================
   55. BOTTOM SHEET
   ========================================================= */

function openBottomSheet(html, type = 'generic') {
  if (
    !DOM.bottomSheet ||
    !DOM.sheetOverlay ||
    !DOM.sheetContent
  ) {
    return;
  }

  DOM.sheetContent.innerHTML = html;

  DOM.sheetOverlay.hidden = false;
  DOM.bottomSheet.hidden = false;

  STATE.activeSheet = type;

  lockBodyScroll();

  requestAnimationFrame(() => {
    DOM.sheetOverlay.classList.add('show');
    DOM.bottomSheet.classList.add('show');
  });
}


function closeBottomSheet() {
  if (
    !DOM.bottomSheet ||
    !DOM.sheetOverlay
  ) {
    return;
  }

  DOM.sheetOverlay.classList.remove('show');
  DOM.bottomSheet.classList.remove('show');

  STATE.activeSheet = null;

  window.setTimeout(() => {
    DOM.sheetOverlay.hidden = true;
    DOM.bottomSheet.hidden = true;

    if (DOM.sheetContent) {
      DOM.sheetContent.innerHTML = '';
    }
  }, 290);

  unlockBodyScroll();
}


/* =========================================================
   56. SCROLL
   ========================================================= */

function handleScroll() {
  DOM.header?.classList.toggle(
    'scrolled',
    window.scrollY > 5
  );
}


/* =========================================================
   57. KEYBOARD
   ========================================================= */

function handleKeyboard(event) {
  if (event.key !== 'Escape') {
    return;
  }

  if (STATE.searchOpen) {
    closeSearch();
    return;
  }

  if (STATE.activeSheet) {
    closeBottomSheet();
    return;
  }

  if (STATE.menuOpen) {
    closeSideMenu();
  }
}


/* =========================================================
   58. BODY SCROLL LOCK
   ========================================================= */

let bodyLockDepth = 0;


function lockBodyScroll() {
  bodyLockDepth += 1;

  document.body.style.overflow =
    'hidden';
}


function unlockBodyScroll() {
  bodyLockDepth =
    Math.max(
      0,
      bodyLockDepth - 1
    );

  if (bodyLockDepth === 0) {
    document.body.style.overflow = '';
  }
}


/* =========================================================
   59. DATA FINDERS
   ========================================================= */

function findPost(postId) {
  return DATA.posts.find(
    post =>
      String(post.id) ===
      String(postId)
  ) || null;
}


function findProduct(productId) {
  for (const post of DATA.posts) {
    if (
      String(post.product?.id) ===
      String(productId)
    ) {
      return post.product;
    }
  }

  return null;
}


function findCategoryIdByName(name) {
  if (!name) {
    return null;
  }

  return CATEGORIES.find(
    category =>
      normalizeText(category.name) ===
      normalizeText(name)
  )?.id || null;
}


function getVisiblePosts() {
  if (!STATE.activeCategory) {
    return DATA.posts;
  }

  const category =
    CATEGORIES.find(
      item =>
        item.id ===
        STATE.activeCategory
    );

  if (!category) {
    return DATA.posts;
  }

  return DATA.posts.filter(post =>
    normalizeText(post.product?.category) ===
      normalizeText(category.name) ||
    normalizeText(post.product?.categoryId) ===
      normalizeText(category.id)
  );
}


function getStores() {
  if (DATA.stores.length) {
    return DATA.stores;
  }

  const stores =
    new Map();

  DATA.posts.forEach(post => {
    const store = post.store;

    if (!store?.id) {
      return;
    }

    if (!stores.has(String(store.id))) {
      stores.set(
        String(store.id),
        store
      );
    }
  });

  return [...stores.values()];
}


/* =========================================================
   60. SCROLL TO POST
   ========================================================= */

function scrollToPost(postId) {
  STATE.activeCategory = null;
  STATE.activeNav = 'home';

  renderFeed();
  updateNavigation();

  requestAnimationFrame(() => {
    const target =
      document.getElementById(
        `post-${postId}`
      );

    if (!target) {
      showToast('Postingan tidak ditemukan.');
      return;
    }

    target.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  });
}


/* =========================================================
   61. LOCAL STORAGE
   ========================================================= */

function saveLocalState() {
  const payload = {
    likedPosts:
      [...STATE.likedPosts],

    savedPosts:
      [...STATE.savedPosts],

    cart:
      STATE.cart
  };

  try {
    localStorage.setItem(
      CONFIG.STORAGE_KEY,
      JSON.stringify(payload)
    );
  } catch (error) {
    console.warn(
      '[Pasar UMKM] Local storage error:',
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


    if (Array.isArray(saved.likedPosts)) {
      STATE.likedPosts =
        new Set(
          saved.likedPosts.map(String)
        );
    }


    if (Array.isArray(saved.savedPosts)) {
      STATE.savedPosts =
        new Set(
          saved.savedPosts.map(String)
        );
    }


    if (Array.isArray(saved.cart)) {
      STATE.cart =
        saved.cart;
    }
  } catch (error) {
    console.warn(
      '[Pasar UMKM] Restore error:',
      error
    );
  }
}


/* =========================================================
   62. LOADING
   ========================================================= */

function setLoading(value) {
  STATE.loading =
    Boolean(value);

  if (!DOM.loading) {
    return;
  }

  DOM.loading.hidden =
    !STATE.loading;
}


/* =========================================================
   63. TOAST
   ========================================================= */

let toastTimeout = null;


function showToast(message) {
  if (!DOM.toast) {
    return;
  }

  window.clearTimeout(toastTimeout);

  DOM.toast.textContent =
    message;

  DOM.toast.classList.add('show');

  toastTimeout =
    window.setTimeout(() => {
      DOM.toast.classList.remove('show');
    }, CONFIG.TOAST_DURATION);
}


/* =========================================================
   64. INFORMATION TEMPLATE
   ========================================================= */

function createInformationState(
  title,
  icon,
  description
) {
  return `
    <h2 id="sheetTitle">
      ${escapeHTML(title)}
    </h2>

    <section class="empty-state">

      <i
        class="ph ph-${escapeHTML(icon)}"
        aria-hidden="true"
      ></i>

      <strong class="empty-state-title">
        ${escapeHTML(title)}
      </strong>

      <p class="empty-state-text">
        ${escapeHTML(description)}
      </p>

    </section>
  `;
}


/* =========================================================
   65. FORMAT CURRENCY
   ========================================================= */

function formatRupiah(value) {
  return new Intl.NumberFormat(
    'id-ID',
    {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }
  ).format(
    Number(value) || 0
  );
}


/* =========================================================
   66. FORMAT NUMBERS
   ========================================================= */

function formatCompactNumber(value) {
  const number =
    Number(value) || 0;

  return new Intl.NumberFormat(
    'id-ID',
    {
      notation:
        number >= 1000
          ? 'compact'
          : 'standard',

      maximumFractionDigits: 1
    }
  ).format(number);
}


/* =========================================================
   67. RELATIVE TIME
   ========================================================= */

function formatRelativeTime(value) {
  if (!value) {
    return '';
  }

  const date =
    new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  let seconds =
    Math.floor(
      (Date.now() - date.getTime()) /
      1000
    );

  if (seconds < 0) {
    seconds = 0;
  }

  if (seconds < 60) {
    return 'baru saja';
  }

  const minutes =
    Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} menit`;
  }

  const hours =
    Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} jam`;
  }

  const days =
    Math.floor(hours / 24);

  if (days < 7) {
    return `${days} hari`;
  }

  return new Intl.DateTimeFormat(
    'id-ID',
    {
      day: 'numeric',
      month: 'short',
      year:
        date.getFullYear() !==
        new Date().getFullYear()
          ? 'numeric'
          : undefined
    }
  ).format(date);
}


/* =========================================================
   68. UTILITY
   ========================================================= */

function ensureArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}


function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('id-ID');
}


function cloneData(value) {
  if (
    typeof structuredClone ===
    'function'
  ) {
    return structuredClone(value);
  }

  return JSON.parse(
    JSON.stringify(value)
  );
}


/* =========================================================
   69. XSS PROTECTION
   ========================================================= */

function escapeHTML(value) {
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
   70. DEVELOPMENT API
   Helpful from browser console.
   ========================================================= */

window.PasarUMKM = Object.freeze({
  getState() {
    return STATE;
  },

  getData() {
    return DATA;
  },

  getCategories() {
    return CATEGORIES;
  },

  refresh() {
    renderApplication();
  },

  clearLocalState() {
    localStorage.removeItem(
      CONFIG.STORAGE_KEY
    );

    window.location.reload();
  },

  resetSplash() {
    sessionStorage.removeItem(
      CONFIG.INTRO_KEY
    );

    window.location.reload();
  }
});
