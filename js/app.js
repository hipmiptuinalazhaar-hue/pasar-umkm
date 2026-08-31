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
   Loaded from backend / Neon PostgreSQL
   ========================================================= */

let CATEGORIES = [];

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

accountProducts: [],

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
  /*
   * 1. Pulihkan session user.
   */
  await restoreAuthSession();


  /*
   * 2. Ambil kategori dari Neon.
   */
  await loadCategories();


  /*
   * 3. Ambil daftar UMKM dari Neon.
   */
  await loadStores();

/*
 * 4. Ambil produk publik dari Neon.
 */
const productsResponse =
  await fetch(
    '/api/products',
    {
      method: 'GET',

      credentials:
        'include',

      headers: {
        Accept:
          'application/json'
      },

      cache:
        'no-store'
    }
  );


if (productsResponse.ok) {
  const productsData =
    await productsResponse.json();


  if (
    productsData.ok === true &&
    Array.isArray(
      productsData.products
    )
  ) {
    DATA.posts =
      productsData.products.map(
        product => ({
          id:
            `product-${product.id}`,

          store: {
            id:
              product.store_id,

            name:
              product.store_name ||
              'UMKM Lokal',

            avatar:
              ASSETS.logo,

            location:
              CONFIG.CITY,

            verified:
              false
          },

          caption:
            product.description ||
            '',

          createdAt:
            product.created_at,

          product: {
            id:
              product.id,

            name:
              product.name,

            image:
              product.image_url ||
              ASSETS.logo,

            category:
              product.category_name ||
              '',

            categoryId:
              product.category_id ||
              '',

            price:
              Number(
                product.price || 0
              ),

            stock:
              Number(
                product.stock || 0
              ),

            unit:
              product.unit || ''
          }
        })
      );
  }
}
   
  /*
   * Data marketplace lainnya seperti
   * posts, messages, notifications,
   * dan orders belum memakai bootstrap.
   */
  if (!CONFIG.API_BASE_URL) {
    return;
  }


  const bootstrap =
    await apiRequest(
      '/api/bootstrap'
    );


  if (!bootstrap) {
    return;
  }


  DATA.stories =
    ensureArray(
      bootstrap.stories
    );


  DATA.posts =
    ensureArray(
      bootstrap.posts
    );


  DATA.notifications =
    ensureArray(
      bootstrap.notifications
    );


  DATA.messages =
    ensureArray(
      bootstrap.messages
    );


  DATA.orders =
    ensureArray(
      bootstrap.orders
    );


  if (bootstrap.user) {
    STATE.user =
      bootstrap.user;
  }


  if (
    Array.isArray(
      bootstrap.cart
    )
  ) {
    STATE.cart =
      bootstrap.cart;
  }
}



/* =========================================================
   LOAD CATEGORIES
   ========================================================= */

async function loadCategories() {
  try {
    const response =
      await fetch(
        '/api/categories',
        {
          method: 'GET',

          credentials:
            'include',

          headers: {
            Accept:
              'application/json'
          },

          cache:
            'no-store'
        }
      );


    if (!response.ok) {
      throw new Error(
        `Categories request failed: ${response.status}`
      );
    }


    const data =
      await response.json();


    if (
      data.ok !== true ||
      !Array.isArray(
        data.categories
      )
    ) {
      throw new Error(
        'Format data kategori tidak valid.'
      );
    }


    CATEGORIES =
      data.categories
        .map(category => ({
          id:
            String(
              category.id || ''
            ),

          slug:
            String(
              category.slug || ''
            ),

          name:
            String(
              category.name || ''
            ),

          icon:
            String(
              category.icon ||
              'tag'
            ),

          home:
            Boolean(
              category.is_home
            ),

          sortOrder:
            Number(
              category.sort_order
            ) || 0
        }))
        .filter(category => {
          return (
            category.id &&
            category.name
          );
        })
        .sort(
          (a, b) =>
            a.sortOrder -
            b.sortOrder
        );


  } catch (error) {
    console.error(
      '[Pasar UMKM] Categories load error:',
      error
    );


    CATEGORIES = [];


    showToast(
      'Kategori belum dapat dimuat.'
    );
  }
}



/* =========================================================
   LOAD STORES
   ========================================================= */

async function loadStores() {
  try {
    const response =
      await fetch(
        '/api/stores',
        {
          method: 'GET',

          credentials:
            'include',

          headers: {
            Accept:
              'application/json'
          },

          cache:
            'no-store'
        }
      );


    if (!response.ok) {
      throw new Error(
        `Stores request failed: ${response.status}`
      );
    }


    const data =
      await response.json();


    if (
      data.ok !== true ||
      !Array.isArray(
        data.stores
      )
    ) {
      throw new Error(
        'Format data UMKM tidak valid.'
      );
    }


    DATA.stores =
      data.stores
        .map(store => ({

          id:
            String(
              store.id || ''
            ),

          categoryId:
            String(
              store.category_id || ''
            ),

          category:
            String(
              store.category_name || ''
            ),

          name:
            String(
              store.name || ''
            ),

          slug:
            String(
              store.slug || ''
            ),

          description:
            String(
              store.description || ''
            ),

          logo:
            String(
              store.logo_url || ''
            ),

          cover:
            String(
              store.cover_url || ''
            ),

          phone:
            String(
              store.phone || ''
            ),

          whatsapp:
            String(
              store.whatsapp || ''
            ),

          address:
            String(
              store.address || ''
            ),

          district:
            String(
              store.district || ''
            ),

          city:
            String(
              store.city || ''
            ),

          province:
            String(
              store.province || ''
            ),

          verificationStatus:
            String(
              store.verification_status ||
              'pending'
            ),

          verifiedAt:
            store.verified_at || null,

          productCount:
            Number(
              store.product_count || 0
            ),

          createdAt:
            store.created_at || null

        }))
        .filter(store => {
          return (
            store.id &&
            store.name
          );
        });


  } catch (error) {
    console.error(
      '[Pasar UMKM] Stores load error:',
      error
    );


    DATA.stores = [];


    showToast(
      'Daftar UMKM belum dapat dimuat.'
    );
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
      createEmptyFeedTemplate(
        category
      );

    return;
  }


  const eyebrow =
    category
      ? 'KATEGORI'
      : 'PASAR HARI INI';


  const title =
    category
      ? category.name
      : 'Terbaru dari UMKM';


  const description =
    category
      ? `Pilihan produk ${category.name} dari UMKM lokal.`
      : 'Produk dan cerita terbaru dari pelaku usaha lokal.';


  DOM.feed.innerHTML = `
    <header class="market-feed-head">

      <div class="market-feed-head-copy">

        <span class="market-feed-eyebrow">
          ${escapeHTML(
            eyebrow
          )}
        </span>

        <h2 class="market-feed-title">
          ${escapeHTML(
            title
          )}
        </h2>

        <p class="market-feed-description">
          ${escapeHTML(
            description
          )}
        </p>

      </div>


      <div
        class="market-feed-mark"
        aria-hidden="true"
      >
        <span></span>
      </div>

    </header>


    ${posts
      .map(
        createPostTemplate
      )
      .join('')}
  `;
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
  const postId =
    String(post.id || '');

  const liked =
    STATE.likedPosts.has(postId);

  const saved =
    STATE.savedPosts.has(postId);

  const isProductPost =
    Boolean(post.product);


  return `
    <article
      class="post-card ${
        isProductPost
          ? 'is-product-post'
          : ''
      }"
      id="post-${escapeHTML(postId)}"
      data-post-id="${escapeHTML(postId)}"
    >

      ${createPostHeader(post)}


      ${
        isProductPost
          ? `
              <div class="ig-product-media">

                <img
                  src="${escapeHTML(
                    post.product.image ||
                    ASSETS.logo
                  )}"
                  alt="${escapeHTML(
                    post.product.name ||
                    'Produk UMKM'
                  )}"
                  loading="lazy"
                  decoding="async"
                >

              </div>
            `
          : createPostMedia(post)
      }


      <div class="post-actions">

        <div class="actions-left">

          <button
            type="button"
            class="action-btn ${
              liked
                ? 'liked'
                : ''
            }"
            data-action="like"
            data-post-id="${escapeHTML(postId)}"
            aria-label="Sukai postingan"
            aria-pressed="${liked}"
          >
            <i
              class="${
                liked
                  ? 'ph-fill'
                  : 'ph'
              } ph-heart"
            ></i>
          </button>


          <button
            type="button"
            class="action-btn"
            data-action="comments"
            data-post-id="${escapeHTML(postId)}"
            aria-label="Komentar"
          >
            <i class="ph ph-chat-circle"></i>
          </button>


          <button
            type="button"
            class="action-btn"
            data-action="share"
            data-post-id="${escapeHTML(postId)}"
            aria-label="Bagikan"
          >
            <i class="ph ph-paper-plane-tilt"></i>
          </button>

        </div>


        <button
          type="button"
          class="action-btn ${
            saved
              ? 'saved'
              : ''
          }"
          data-action="save"
          data-post-id="${escapeHTML(postId)}"
          aria-label="Simpan"
          aria-pressed="${saved}"
        >
          <i
            class="${
              saved
                ? 'ph-fill'
                : 'ph'
            } ph-bookmark-simple"
          ></i>
        </button>

      </div>


      ${createLikeCount(post)}


      ${
        isProductPost
          ? createProductTemplate(
              post.product,
              post.caption
            )
          : createCaption(post)
      }


      ${
        Number(
          post.commentsCount ||
          post.comments
        ) > 0
          ? `
              <button
                type="button"
                class="view-comments"
                data-action="comments"
                data-post-id="${escapeHTML(postId)}"
              >
                Lihat ${formatCompactNumber(
                  post.commentsCount ||
                  post.comments
                )} komentar
              </button>
            `
          : ''
      }


    </article>
  `;
}

/* =========================================================
   20. POST HEADER
   ========================================================= */
function createPostHeader(post) {
  const store =
    post.store || {};


  return `
    <header class="post-header">


      <button
        type="button"
        class="post-profile-link"
        data-action="seller-profile"
        data-store-id="${escapeHTML(
          store.id || ''
        )}"
        aria-label="Lihat profil ${escapeHTML(
          store.name ||
          'UMKM Lokal'
        )}"
      >


        <img
          src="${escapeHTML(
            store.avatar ||
            ASSETS.logo
          )}"
          alt=""
          class="post-avatar"
          loading="lazy"
          decoding="async"
        >


        <div class="post-meta">

          <div class="post-author">

            <span>
              ${escapeHTML(
                store.name ||
                'UMKM Lokal'
              )}
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
                      ${formatRelativeTime(
                        post.createdAt
                      )}
                    </span>
                  `
                : ''
            }

          </div>

        </div>


      </button>


      <button
        type="button"
        class="post-menu"
        data-action="post-menu"
        data-post-id="${escapeHTML(
          post.id
        )}"
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
function createProductTemplate(
  product,
  caption = ''
) {
  return `
    <section
      class="ig-product-info"
      data-product-id="${escapeHTML(
        product.id || ''
      )}"
    >

      <div class="ig-product-meta">

        ${
          product.category
            ? `
                <span class="ig-product-category">
                  ${escapeHTML(
                    product.category
                  )}
                </span>
              `
            : '<span></span>'
        }


        <span class="ig-product-stock">
          Stok ${escapeHTML(
            String(
              product.stock ?? 0
            )
          )}

          ${
            product.unit
              ? ` ${escapeHTML(
                  product.unit
                )}`
              : ''
          }
        </span>

      </div>


      <h3 class="ig-product-name">
        ${escapeHTML(
          product.name ||
          'Produk UMKM'
        )}
      </h3>


      <div class="ig-product-price">
        ${formatRupiah(
          product.price
        )}
      </div>


      ${
        caption
          ? `
              <p class="ig-product-description">
                ${escapeHTML(caption)}
              </p>
            `
          : ''
      }


      <div class="ig-product-buttons">

        <button
          type="button"
          class="ig-cart-button"
          data-action="add-cart"
          data-product-id="${escapeHTML(
            product.id || ''
          )}"
        >

          <i
            class="ph ph-shopping-cart-simple"
            aria-hidden="true"
          ></i>

          <span>
            Keranjang
          </span>

        </button>


        <button
          type="button"
          class="ig-buy-button"
          data-action="buy-now"
          data-product-id="${escapeHTML(
            product.id || ''
          )}"
        >

          <i
            class="ph ph-shopping-bag"
            aria-hidden="true"
          ></i>

          <span>
            Beli Sekarang
          </span>

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

   case 'product-detail':
        openProductDetail(productId);
        break;
   
   case 'product-edit':
        openProductEditForm(productId);
        break;

   case 'product-edit-save':
        handleProductEditSave(
         productId,
          element
        );
        break;
   
     case 'product-delete-confirm':
        openProductDeleteConfirm(
          productId
           );
        break;

      case 'product-delete':
        handleProductDelete(
          productId,
          element
           );
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
        
     case 'store-detail':
        openStoreDetail(
       element.dataset.storeId
        );
        break;

      case 'seller-profile':
        openSellerProfile(
       element.dataset.storeId
        );
        break;

        case 'seller-follow':
  handleSellerFollow(
    element.dataset.storeId
  );
  break;

case 'seller-share':
  shareSellerProfile(
    element.dataset.storeId
  );
  break;
        
      case 'seller-message':
        openSellerMessage(
       element.dataset.storeId
        );
        break;

      case 'seller-contact':
        openSellerContact(
       element.dataset.storeId
           );
        break;

      case 'seller-profile-back':
        navigate('home');
        break;

        case 'seller-suggest':
        openSimilarStores(
       element.dataset.storeId
           );
        break;

      case 'seller-public-tab':
        switchPublicSellerTab(
       element.dataset.storeId,
       element.dataset.tab,
       element
        );
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

        case 'product-create':
  openProductCreateForm();
  break;

case 'post-create':
  openPostCreateInfo();
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

    case 'account-menu':
  openAccountMenu();
  break;

case 'account-edit':
  openAccountEditInfo();
  break;

case 'account-share':
  shareAccountProfile();
  break;

case 'account-tab':
  switchAccountTab(
    element.dataset.tab,
    element
  );
  break;

case 'account-logout':
  logoutFromAccount();
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
  if (
    target !== 'account' &&
    typeof leaveAccountProfile === 'function'
  ) {
    leaveAccountProfile();
  }

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
   41. AUTHENTICATION
   LOGIN / REGISTER
   ========================================================= */

function openLogin() {
  closeSideMenu();

  if (STATE.user) {
    openAccount();
    return;
  }

  renderAuthSheet('login');
}


function renderAuthSheet(mode = 'login') {
  const isRegister =
    mode === 'register';

  openBottomSheet(
    `
      <div class="auth-shell" id="authShell">

        <section class="auth-brand">

          <div class="auth-brand-mark">
            <img
              src="${escapeHTML(ASSETS.logo)}"
              alt=""
              aria-hidden="true"
            >
          </div>

          <div
            id="sheetTitle"
            class="auth-title"
            role="heading"
            aria-level="2"
          >
            ${
              isRegister
                ? 'Buat akun Pasar UMKM'
                : 'Selamat datang kembali'
            }
          </div>

          <p class="auth-subtitle">
            ${
              isRegister
                ? 'Bergabung dan mulai terhubung dengan ekosistem UMKM lokal Lubuklinggau.'
                : 'Masuk untuk melanjutkan aktivitas Anda di Pasar UMKM.'
            }
          </p>

        </section>


        <div class="auth-tabs">

          <button
            type="button"
            class="auth-tab ${
              !isRegister ? 'active' : ''
            }"
            data-auth-mode="login"
          >
            Masuk
          </button>

          <button
            type="button"
            class="auth-tab ${
              isRegister ? 'active' : ''
            }"
            data-auth-mode="register"
          >
            Daftar
          </button>

        </div>


        <div
          id="authMessage"
          class="auth-message"
          aria-live="polite"
          hidden
        ></div>


        ${
          isRegister
            ? createRegisterForm()
            : createLoginForm()
        }


        <div class="auth-security">

          <i
            class="ph ph-shield-check"
            aria-hidden="true"
          ></i>

          <span>
            Session akun diamankan menggunakan
            cookie HttpOnly dan Secure.
          </span>

        </div>

      </div>
    `,
    'login'
  );

  bindAuthEvents();

  requestAnimationFrame(() => {
    DOM.sheetContent
      ?.querySelector('.auth-input')
      ?.focus();
  });
}


/* =========================================================
   LOGIN FORM
   ========================================================= */

function createLoginForm() {
  return `
    <form
      id="authLoginForm"
      class="auth-form"
    >

      <div class="auth-field">

        <label
          class="auth-label"
          for="authLoginEmail"
        >
          Email
        </label>

        <div class="auth-input-wrap">

          <i
            class="ph ph-envelope-simple auth-input-icon"
            aria-hidden="true"
          ></i>

          <input
            id="authLoginEmail"
            class="auth-input"
            name="email"
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder="nama@email.com"
            maxlength="255"
            required
          >

        </div>

      </div>


      <div class="auth-field">

        <label
          class="auth-label"
          for="authLoginPassword"
        >
          Kata sandi
        </label>

        <div class="auth-input-wrap">

          <i
            class="ph ph-lock-key auth-input-icon"
            aria-hidden="true"
          ></i>

          <input
            id="authLoginPassword"
            class="auth-input"
            name="password"
            type="password"
            autocomplete="current-password"
            placeholder="Masukkan kata sandi"
            maxlength="128"
            required
          >

          <button
            type="button"
            class="auth-password-toggle"
            data-auth-toggle="authLoginPassword"
            aria-label="Tampilkan kata sandi"
          >
            <i
              class="ph ph-eye"
              aria-hidden="true"
            ></i>
          </button>

        </div>

      </div>


      <button
        type="submit"
        class="auth-submit"
      >

        <i
          class="ph ph-sign-in"
          aria-hidden="true"
        ></i>

        <span>
          Masuk
        </span>

      </button>

    </form>
  `;
}


/* =========================================================
   REGISTER FORM
   ========================================================= */

function createRegisterForm() {
  return `
    <div class="auth-benefits">

      <div class="auth-benefit">
        <i class="ph ph-user-circle"></i>
        <span>Satu akun</span>
      </div>

      <div class="auth-benefit">
        <i class="ph ph-shield-check"></i>
        <span>Session aman</span>
      </div>

      <div class="auth-benefit">
        <i class="ph ph-storefront"></i>
        <span>UMKM lokal</span>
      </div>

    </div>


    <form
      id="authRegisterForm"
      class="auth-form"
    >

      <div class="auth-field">

        <label
          class="auth-label"
          for="authRegisterName"
        >
          Nama lengkap
        </label>

        <div class="auth-input-wrap">

          <i
            class="ph ph-user auth-input-icon"
            aria-hidden="true"
          ></i>

          <input
            id="authRegisterName"
            class="auth-input"
            name="name"
            type="text"
            autocomplete="name"
            placeholder="Nama lengkap"
            minlength="2"
            maxlength="100"
            required
          >

        </div>

      </div>


      <div class="auth-field">

        <label
          class="auth-label"
          for="authRegisterEmail"
        >
          Email
        </label>

        <div class="auth-input-wrap">

          <i
            class="ph ph-envelope-simple auth-input-icon"
            aria-hidden="true"
          ></i>

          <input
            id="authRegisterEmail"
            class="auth-input"
            name="email"
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder="nama@email.com"
            maxlength="255"
            required
          >

        </div>

      </div>


      <div class="auth-field">

        <label
          class="auth-label"
          for="authRegisterPassword"
        >
          Kata sandi
        </label>

        <div class="auth-input-wrap">

          <i
            class="ph ph-lock-key auth-input-icon"
            aria-hidden="true"
          ></i>

          <input
            id="authRegisterPassword"
            class="auth-input"
            name="password"
            type="password"
            autocomplete="new-password"
            placeholder="Minimal 8 karakter"
            minlength="8"
            maxlength="128"
            required
          >

          <button
            type="button"
            class="auth-password-toggle"
            data-auth-toggle="authRegisterPassword"
            aria-label="Tampilkan kata sandi"
          >
            <i
              class="ph ph-eye"
              aria-hidden="true"
            ></i>
          </button>

        </div>

        <p class="auth-field-hint">
          Gunakan minimal 8 karakter.
        </p>

      </div>


      <button
        type="submit"
        class="auth-submit"
      >

        <i
          class="ph ph-user-plus"
          aria-hidden="true"
        ></i>

        <span>
          Buat Akun
        </span>

      </button>

    </form>
  `;
}


/* =========================================================
   AUTH EVENTS
   ========================================================= */

function bindAuthEvents() {
  const root =
    DOM.sheetContent?.querySelector(
      '#authShell'
    );

  if (!root) {
    return;
  }


  root
    .querySelectorAll('[data-auth-mode]')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {
          renderAuthSheet(
            button.dataset.authMode
          );
        }
      );

    });


  root
    .querySelectorAll('[data-auth-toggle]')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {
          toggleAuthPassword(button);
        }
      );

    });


  root
    .querySelector('#authLoginForm')
    ?.addEventListener(
      'submit',
      handleLoginSubmit
    );


  root
    .querySelector('#authRegisterForm')
    ?.addEventListener(
      'submit',
      handleRegisterSubmit
    );
}


/* =========================================================
   PASSWORD TOGGLE
   ========================================================= */

function toggleAuthPassword(button) {
  const inputId =
    button.dataset.authToggle;

  const input =
    DOM.sheetContent?.querySelector(
      `#${inputId}`
    );

  if (!input) {
    return;
  }


  const show =
    input.type === 'password';


  input.type =
    show
      ? 'text'
      : 'password';


  const icon =
    button.querySelector('i');


  if (icon) {
    icon.className =
      show
        ? 'ph ph-eye-slash'
        : 'ph ph-eye';
  }


  button.setAttribute(
    'aria-label',
    show
      ? 'Sembunyikan kata sandi'
      : 'Tampilkan kata sandi'
  );


  input.focus();
}


/* =========================================================
   LOGIN SUBMIT
   ========================================================= */

async function handleLoginSubmit(event) {
  event.preventDefault();

  const form =
    event.currentTarget;


  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }


  const formData =
    new FormData(form);


  const email =
    String(
      formData.get('email') || ''
    )
      .trim()
      .toLowerCase();


  const password =
    String(
      formData.get('password') || ''
    );


  const button =
    form.querySelector(
      '.auth-submit'
    );


  clearAuthMessage();

  setAuthLoading(
    button,
    true
  );


  try {
    const data =
      await authRequest(
        '/api/auth/login',
        {
          method: 'POST',

          body:
            JSON.stringify({
              email,
              password
            })
        }
      );


    if (!data.user) {
      throw new Error(
        'Data akun tidak diterima.'
      );
    }


    STATE.user =
      data.user;


    renderAccount();
    renderSidebar();
    renderStories();
    updateNavigation();


    showToast(
      data.message ||
      'Login berhasil.'
    );


    openAccount();
  } catch (error) {
    console.error(
      '[Pasar UMKM] Login error:',
      error
    );


    setAuthMessage(
      'error',
      error.message ||
      'Email atau kata sandi tidak valid.'
    );
  } finally {
    setAuthLoading(
      button,
      false
    );
  }
}


/* =========================================================
   REGISTER SUBMIT
   ========================================================= */

async function handleRegisterSubmit(event) {
  event.preventDefault();

  const form =
    event.currentTarget;


  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }


  const formData =
    new FormData(form);


  const name =
    String(
      formData.get('name') || ''
    ).trim();


  const email =
    String(
      formData.get('email') || ''
    )
      .trim()
      .toLowerCase();


  const password =
    String(
      formData.get('password') || ''
    );


  const button =
    form.querySelector(
      '.auth-submit'
    );


  clearAuthMessage();

  setAuthLoading(
    button,
    true
  );


  try {
    await authRequest(
      '/api/auth/register',
      {
        method: 'POST',

        body:
          JSON.stringify({
            name,
            email,
            password
          })
      }
    );


    /*
     * Setelah daftar berhasil,
     * login otomatis.
     */
    const loginData =
      await authRequest(
        '/api/auth/login',
        {
          method: 'POST',

          body:
            JSON.stringify({
              email,
              password
            })
        }
      );


    if (!loginData.user) {
      throw new Error(
        'Akun berhasil dibuat, tetapi session belum tersedia.'
      );
    }


    STATE.user =
      loginData.user;


    renderAccount();
    renderSidebar();
    renderStories();
    updateNavigation();


    showToast(
      'Akun berhasil dibuat.'
    );


    openAccount();
  } catch (error) {
    console.error(
      '[Pasar UMKM] Register error:',
      error
    );


    setAuthMessage(
      'error',
      error.message ||
      'Pendaftaran belum berhasil.'
    );
  } finally {
    setAuthLoading(
      button,
      false
    );
  }
}


/* =========================================================
   AUTH REQUEST
   ========================================================= */

async function authRequest(
  endpoint,
  options = {}
) {
  const response =
    await fetch(
      endpoint,
      {
        credentials: 'include',

        cache: 'no-store',

        ...options,

        headers: {
          Accept:
            'application/json',

          'Content-Type':
            'application/json',

          ...options.headers
        }
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
      data.message ||
      `Permintaan gagal (${response.status}).`
    );
  }


  return data;
}


/* =========================================================
   AUTH MESSAGE
   ========================================================= */

function setAuthMessage(
  type,
  message
) {
  const element =
    DOM.sheetContent?.querySelector(
      '#authMessage'
    );


  if (!element) {
    return;
  }


  const success =
    type === 'success';


  element.className =
    `auth-message ${
      success
        ? 'success'
        : 'error'
    }`;


  element.innerHTML = `
    <i
      class="ph ${
        success
          ? 'ph-check-circle'
          : 'ph-warning-circle'
      }"
      aria-hidden="true"
    ></i>

    <span></span>
  `;


  const text =
    element.querySelector('span');


  if (text) {
    text.textContent =
      String(message || '');
  }


  element.hidden = false;
}


function clearAuthMessage() {
  const element =
    DOM.sheetContent?.querySelector(
      '#authMessage'
    );


  if (!element) {
    return;
  }


  element.hidden = true;

  element.textContent = '';
}


/* =========================================================
   AUTH LOADING BUTTON
   ========================================================= */

function setAuthLoading(
  button,
  loading
) {
  if (!button) {
    return;
  }


  if (loading) {
    button.disabled = true;

    button.dataset.originalHtml =
      button.innerHTML;


    button.innerHTML = `
      <span
        class="auth-spinner"
        aria-hidden="true"
      ></span>

      <span>
        Memproses...
      </span>
    `;

    return;
  }


  button.disabled = false;


  if (
    button.dataset.originalHtml
  ) {
    button.innerHTML =
      button.dataset.originalHtml;

    delete button.dataset.originalHtml;
  }
}

/* =========================================================
   42. SOCIAL COMMERCE ACCOUNT
   ========================================================= */

async function openAccount() {
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

  let store = null;

 if (
  STATE.user.role === 'seller' ||
  STATE.user.role === 'admin'
) {
  try {
    const [
      currentStore,
      currentProducts
    ] = await Promise.all([
      loadCurrentAccountStore(),
      loadCurrentAccountProducts()
    ]);


    store =
      currentStore;

    STATE.accountProducts =
      currentProducts;

  } catch (error) {
    console.error(
      '[Pasar UMKM] Account data error:',
      error
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
}


/* =========================================================
   CURRENT USER STORE
   ========================================================= */

async function loadCurrentAccountStore() {
  const response =
    await fetch(
      '/api/stores/me',
      {
        method: 'GET',

        credentials:
          'include',

        headers: {
          Accept:
            'application/json'
        },

        cache:
          'no-store'
      }
    );

  if (response.status === 401) {
    return null;
  }

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
      'Profil UMKM belum dapat dimuat.'
    );
  }

  if (
    data.has_store !== true ||
    !data.store
  ) {
    return null;
  }

  return data.store;
}

async function loadCurrentAccountProducts() {
  const response =
    await fetch(
      '/api/products/me',
      {
        method: 'GET',
        credentials: 'include',

        headers: {
          Accept: 'application/json'
        },

        cache: 'no-store'
      }
    );


  if (response.status === 401) {
    return [];
  }


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
      'Produk toko belum dapat dimuat.'
    );
  }


  return Array.isArray(data.products)
    ? data.products
    : [];
}

/* =========================================================
   ACCOUNT RENDER
   ========================================================= */

function renderSocialAccountProfile(
  store = null
) {
  if (
    !STATE.user ||
    !DOM.feed
  ) {
    return;
  }

  DOM.feed.innerHTML =
    createSocialAccountProfileTemplate(
      STATE.user,
      store
    );
}


/* =========================================================
   ACCOUNT TEMPLATE
   ========================================================= */

function createSocialAccountProfileTemplate(
  user,
  store
) {
  const isSeller =
    user.role === 'seller' ||
    user.role === 'admin';

  const avatarUrl =
    String(
      user.avatar_url ||
      store?.logo_url ||
      ''
    ).trim();

  const avatarTemplate =
    avatarUrl
      ? `
          <img
            src="${escapeHTML(avatarUrl)}"
            alt="${escapeHTML(
              user.name || 'Pengguna'
            )}"
          >
        `
      : `
          <i
            class="ph ph-user"
            aria-hidden="true"
          ></i>
        `;

  const bio =
    store?.description ||
    (
      store
        ? `Pemilik ${store.name}`
        : 'Pengguna Pasar UMKM'
    );

  const location =
    store
      ? [
          store.district,
          store.city,
          store.province
        ]
          .filter(Boolean)
          .join(', ')
      : '';

  const storeBadge =
    store
      ? `
          <div class="social-account-seller-badge">

            <i
              class="ph ph-storefront"
              aria-hidden="true"
            ></i>

            <span>
              ${escapeHTML(store.name)}
            </span>

          </div>
        `
      : '';

  const verification =
    store?.verification_status
      ? `
          <div class="social-account-status">

            <i
              class="ph ${
                store.verification_status ===
                'verified'
                  ? 'ph-seal-check'
                  : 'ph-clock'
              }"
              aria-hidden="true"
            ></i>

            <span>
              ${
                store.verification_status ===
                'verified'
                  ? 'UMKM terverifikasi'
                  : 'Verifikasi UMKM sedang diproses'
              }
            </span>

          </div>
        `
      : '';

  const sellerCenter =
    isSeller && store
      ? `
          <button
            type="button"
            class="social-account-commerce"
            data-menu-action="store"
          >

            <span
              class="social-account-commerce-icon"
            >
              <i
                class="ph ph-storefront"
                aria-hidden="true"
              ></i>
            </span>

            <span
              class="social-account-commerce-copy"
            >

              <strong>
                ${escapeHTML(store.name)}
              </strong>

              <span>
                Kelola toko dan aktivitas usaha
              </span>

            </span>

            <span
              class="social-account-commerce-arrow"
            >
              <i
                class="ph ph-caret-right"
                aria-hidden="true"
              ></i>
            </span>

          </button>
        `
      : '';

  const highlights =
    isSeller && store
      ? `
          <button
            type="button"
            class="social-account-highlight"
            data-menu-action="store"
          >
            <span
              class="social-account-highlight-ring"
            >
              <span
                class="social-account-highlight-inner"
              >
                <i class="ph ph-storefront"></i>
              </span>
            </span>

            <span
              class="social-account-highlight-label"
            >
              Toko
            </span>
          </button>


          <button
            type="button"
            class="social-account-highlight"
            data-menu-action="seller-products"
          >
            <span
              class="social-account-highlight-ring"
            >
              <span
                class="social-account-highlight-inner"
              >
                <i class="ph ph-package"></i>
              </span>
            </span>

            <span
              class="social-account-highlight-label"
            >
              Produk
            </span>
          </button>


          <button
            type="button"
            class="social-account-highlight"
            data-menu-action="orders"
          >
            <span
              class="social-account-highlight-ring"
            >
              <span
                class="social-account-highlight-inner"
              >
                <i class="ph ph-receipt"></i>
              </span>
            </span>

            <span
              class="social-account-highlight-label"
            >
              Pesanan
            </span>
          </button>


          <button
            type="button"
            class="social-account-highlight"
            data-menu-action="favorites"
          >
            <span
              class="social-account-highlight-ring"
            >
              <span
                class="social-account-highlight-inner"
              >
                <i class="ph ph-heart"></i>
              </span>
            </span>

            <span
              class="social-account-highlight-label"
            >
              Favorit
            </span>
          </button>
        `
      : `
          <button
            type="button"
            class="social-account-highlight"
            data-menu-action="orders"
          >
            <span
              class="social-account-highlight-ring"
            >
              <span
                class="social-account-highlight-inner"
              >
                <i class="ph ph-receipt"></i>
              </span>
            </span>

            <span
              class="social-account-highlight-label"
            >
              Pesanan
            </span>
          </button>


          <button
            type="button"
            class="social-account-highlight"
            data-menu-action="favorites"
          >
            <span
              class="social-account-highlight-ring"
            >
              <span
                class="social-account-highlight-inner"
              >
                <i class="ph ph-heart"></i>
              </span>
            </span>

            <span
              class="social-account-highlight-label"
            >
              Favorit
            </span>
          </button>


          <button
            type="button"
            class="social-account-highlight"
            data-menu-action="help"
          >
            <span
              class="social-account-highlight-ring"
            >
              <span
                class="social-account-highlight-inner"
              >
                <i class="ph ph-question"></i>
              </span>
            </span>

            <span
              class="social-account-highlight-label"
            >
              Bantuan
            </span>
          </button>
        `;


  return `
    <section class="social-account-page">


      <!-- TOP BAR -->

      <header class="social-account-topbar">

        <div class="social-account-username">

          <strong>
            ${escapeHTML(
              user.name ||
              'Pengguna'
            )}
          </strong>

        </div>


        <div class="social-account-top-actions">

          <button
            type="button"
            class="social-account-top-button"
            data-action="account-share"
            aria-label="Bagikan profil"
          >
            <i
              class="ph ph-share-network"
              aria-hidden="true"
            ></i>
          </button>


          <button
            type="button"
            class="social-account-top-button"
            data-action="account-menu"
            aria-label="Menu akun"
          >
            <i
              class="ph ph-list"
              aria-hidden="true"
            ></i>
          </button>

        </div>

      </header>


      <!-- PROFILE HEADER -->

      <section class="social-account-header">

        <div class="social-account-main">


          <!-- AVATAR -->

          <div class="social-account-avatar-wrap">

            <div class="social-account-avatar">
              ${avatarTemplate}
            </div>

            <button
              type="button"
              class="social-account-avatar-add"
              data-action="account-edit"
              aria-label="Ubah profil"
            >
              <i class="ph ph-plus"></i>
            </button>

          </div>


          <!-- SOCIAL STATS -->

          <div class="social-account-stats">

            <div class="social-account-stat">

              <strong>
                0
              </strong>

              <span>
                Postingan
              </span>

            </div>


            <div class="social-account-stat">

              <strong>
                0
              </strong>

              <span>
                Pengikut
              </span>

            </div>


            <div class="social-account-stat">

              <strong>
                0
              </strong>

              <span>
                Mengikuti
              </span>

            </div>

          </div>

        </div>


        <!-- BIO -->

        <div class="social-account-bio">

          <div class="social-account-name-row">

            <h1 class="social-account-name">
              ${escapeHTML(
                user.name ||
                'Pengguna'
              )}
            </h1>

          </div>


          <div class="social-account-role">
            ${escapeHTML(
              formatRole(user.role)
            )}
          </div>


          ${storeBadge}

          ${verification}


          <p class="social-account-description">
            ${escapeHTML(bio)}
          </p>


          ${
            location
              ? `
                  <div class="social-account-link">

                    <i
                      class="ph ph-map-pin"
                      aria-hidden="true"
                    ></i>

                    <span>
                      ${escapeHTML(location)}
                    </span>

                  </div>
                `
              : ''
          }

        </div>


        <!-- PROFILE ACTIONS -->

        <div class="social-account-actions">

          <button
            type="button"
            class="social-account-action"
            data-action="account-edit"
          >
            <i
              class="ph ph-pencil-simple"
            ></i>

            <span>
              Edit profil
            </span>
          </button>


          <button
            type="button"
            class="social-account-action"
            data-action="account-share"
          >
            <i
              class="ph ph-share-network"
            ></i>

            <span>
              Bagikan profil
            </span>
          </button>

        </div>

      </section>


      <!-- SELLER CENTER -->

      ${sellerCenter}


      <!-- HIGHLIGHTS -->

      <div class="social-account-highlights">
        ${highlights}
      </div>


      <!-- TABS -->

      <nav
        class="social-account-tabs"
        aria-label="Konten profil"
      >

        <button
          type="button"
          class="social-account-tab active"
          data-action="account-tab"
          data-tab="posts"
          aria-label="Postingan"
        >
          <i class="ph ph-squares-four"></i>
        </button>


        <button
          type="button"
          class="social-account-tab"
          data-action="account-tab"
          data-tab="videos"
          aria-label="Video"
        >
          <i class="ph ph-film-strip"></i>
        </button>


        <button
          type="button"
          class="social-account-tab"
          data-action="account-tab"
          data-tab="products"
          aria-label="Produk"
        >
          <i class="ph ph-shopping-bag"></i>
        </button>


        <button
          type="button"
          class="social-account-tab"
          data-action="account-tab"
          data-tab="saved"
          aria-label="Disimpan"
        >
          <i class="ph ph-bookmark-simple"></i>
        </button>

      </nav>


      <!-- TAB CONTENT -->

      <div id="socialAccountContent">
        ${createAccountTabContent('posts')}
      </div>


    </section>
  `;
}


/* =========================================================
   ACCOUNT TAB CONTENT
   ========================================================= */

function createAccountTabContent(tab) {
  switch (tab) {

    case 'videos':
      return `
        <section class="social-account-empty">

          <div class="social-account-empty-icon">
            <i class="ph ph-film-strip"></i>
          </div>

          <strong>
            Belum ada video
          </strong>

          <p>
            Video yang diterbitkan akun ini
            akan tampil di sini.
          </p>

        </section>
      `;


    case 'products': {
      const products =
        Array.isArray(STATE.accountProducts)
          ? STATE.accountProducts
          : [];


      if (!products.length) {
        return `
          <section class="social-account-empty">

            <div class="social-account-empty-icon">
              <i class="ph ph-shopping-bag"></i>
            </div>

            <strong>
              Belum ada produk
            </strong>

            <p>
              Produk yang ditambahkan ke toko
              akan tampil di sini.
            </p>

          </section>
        `;
      }


      return `
        <div class="social-account-product-grid">

          ${products
            .map(product => {

              const image =
                product.image_url ||
                product.thumbnail_url ||
                ASSETS.logo;


              const inactive =
                product.is_active === false;


              return `
                <article
                  class="
                    social-product-card
                    ${
                      inactive
                        ? 'is-inactive'
                        : ''
                    }
                  "
                  data-action="product-detail"
                  data-product-id="${escapeHTML(
                    product.id || ''
                  )}"
                >

                  <div class="social-product-media">

                    <img
                      src="${escapeHTML(image)}"
                      alt="${escapeHTML(
                        product.name ||
                        'Produk UMKM'
                      )}"
                      loading="lazy"
                      decoding="async"
                    >

                    ${
                      inactive
                        ? `
                            <span class="social-product-status">
                              Nonaktif
                            </span>
                          `
                        : ''
                    }

                  </div>


                  <div class="social-product-body">

                    ${
                      product.category_name
                        ? `
                            <span class="social-product-category">
                              ${escapeHTML(
                                product.category_name
                              )}
                            </span>
                          `
                        : ''
                    }


                    <strong class="social-product-name">
                      ${escapeHTML(
                        product.name ||
                        'Produk UMKM'
                      )}
                    </strong>


                    <div class="social-product-price">
                      ${formatRupiah(
                        product.price
                      )}
                    </div>


                    <div class="social-product-stock">

                      <i class="ph ph-package"></i>

                      <span>
                        Stok
                        ${escapeHTML(
                          product.stock ?? 0
                        )}

                        ${
                          product.unit
                            ? escapeHTML(
                                product.unit
                              )
                            : ''
                        }
                      </span>

                    </div>

                  </div>

                </article>
              `;
            })
            .join('')}

        </div>
      `;
    }


    case 'saved':
      return `
        <section class="social-account-empty">

          <div class="social-account-empty-icon">
            <i class="ph ph-bookmark-simple"></i>
          </div>

          <strong>
            Belum ada yang disimpan
          </strong>

          <p>
            Postingan dan produk favorit
            akan tersedia di sini.
          </p>

        </section>
      `;


    case 'posts':
    default:
      return `
        <section class="social-account-empty">

          <div class="social-account-empty-icon">
            <i class="ph ph-squares-four"></i>
          </div>

          <strong>
            Belum ada postingan
          </strong>

          <p>
            Postingan pertama akun ini
            akan tampil di grid profil.
          </p>

        </section>
      `;
  }
}

/* =========================================================
   ACCOUNT TAB SWITCH
   ========================================================= */

function switchAccountTab(
  tab,
  button
) {
  const page =
    document.querySelector(
      '.social-account-page'
    );

  if (!page) {
    return;
  }

  page
    .querySelectorAll(
      '.social-account-tab'
    )
    .forEach(item => {
      item.classList.toggle(
        'active',
        item === button
      );
    });

  const content =
    page.querySelector(
      '#socialAccountContent'
    );

  if (content) {
    content.innerHTML =
      createAccountTabContent(tab);
  }
}

/* =========================================================
   PRODUCT DETAIL
   ========================================================= */
function openProductDetail(
  productId
) {
  const ownedProduct =
    Array.isArray(
      STATE.accountProducts
    )
      ? STATE.accountProducts.find(
          item =>
            String(item.id) ===
            String(productId)
        )
      : null;


  const publicPost =
    DATA.posts.find(
      post =>
        String(
          post.product?.id
        ) ===
        String(productId)
    );


  const product =
    ownedProduct ||
    publicPost?.product ||
    null;


  if (!product) {
    showToast(
      'Produk tidak ditemukan.'
    );

    return;
  }


  const isOwner =
    Boolean(ownedProduct);


  const image =
    product.image_url ||
    product.thumbnail_url ||
    product.image ||
    ASSETS.logo;


  const category =
    product.category_name ||
    product.category ||
    '';


  const stock =
    Number(
      product.stock ?? 0
    );


  openBottomSheet(
    `
      <div class="auth-shell">


        <div class="product-image-preview">

          <img
            src="${escapeHTML(
              image
            )}"
            alt="${escapeHTML(
              product.name ||
              'Produk UMKM'
            )}"
          >

        </div>


        ${
          category
            ? `
                <div class="product-badge">
                  ${escapeHTML(
                    category
                  )}
                </div>
              `
            : ''
        }


        <h2
          id="sheetTitle"
          class="auth-title"
        >
          ${escapeHTML(
            product.name ||
            'Produk UMKM'
          )}
        </h2>


        <div class="product-price">
          ${formatRupiah(
            product.price
          )}
        </div>


        <div class="product-meta">

          Stok:
          ${escapeHTML(
            String(stock)
          )}

          ${
            product.unit
              ? escapeHTML(
                  product.unit
                )
              : ''
          }

        </div>


        ${
          product.description
            ? `
                <p class="auth-subtitle">
                  ${escapeHTML(
                    product.description
                  )}
                </p>
              `
            : ''
        }


        ${
          isOwner
            ? `
                <button
                  type="button"
                  class="btn-primary"
                  data-action="product-edit"
                  data-product-id="${escapeHTML(
                    product.id || ''
                  )}"
                >
                  <i
                    class="ph ph-pencil-simple"
                  ></i>

                  <span>
                    Edit Produk
                  </span>
                </button>


                <button
                  type="button"
                  class="menu-sheet-btn"
                  data-action="product-delete-confirm"
                  data-product-id="${escapeHTML(
                    product.id || ''
                  )}"
                >
                  <i
                    class="ph ph-trash"
                  ></i>

                  <span>
                    Hapus Produk
                  </span>
                </button>
              `
            : `
                <div class="ig-product-buttons">

                  <button
                    type="button"
                    class="ig-cart-button"
                    data-action="add-cart"
                    data-product-id="${escapeHTML(
                      product.id || ''
                    )}"
                  >
                    <i
                      class="ph ph-shopping-cart-simple"
                    ></i>

                    <span>
                      Keranjang
                    </span>
                  </button>


                  <button
                    type="button"
                    class="ig-buy-button"
                    data-action="buy-now"
                    data-product-id="${escapeHTML(
                      product.id || ''
                    )}"
                  >
                    <i
                      class="ph ph-shopping-bag"
                    ></i>

                    <span>
                      Beli Sekarang
                    </span>
                  </button>

                </div>
              `
        }


      </div>
    `,
    'product-detail'
  );
}

/* =========================================================
   PRODUCT EDIT FORM
   ========================================================= */

function openProductEditForm(productId) {
  const product =
    STATE.accountProducts.find(
      item =>
        String(item.id) ===
        String(productId)
    );

  if (!product) {
    showToast(
      'Produk tidak ditemukan.'
    );

    return;
  }

  const categoryOptions =
    CATEGORIES
      .map(category => {
        const selected =
          String(category.id) ===
          String(product.category_id)
            ? 'selected'
            : '';

        return `
          <option
            value="${escapeHTML(category.id)}"
            ${selected}
          >
            ${escapeHTML(category.name)}
          </option>
        `;
      })
      .join('');

  openBottomSheet(
    `
      <div class="auth-shell">

        <h2
          id="sheetTitle"
          class="auth-title"
        >
          Edit Produk
        </h2>


        <div class="auth-field">
          <label class="auth-label">
            Nama Produk
          </label>

          <input
            class="auth-input"
            type="text"
            value="${escapeHTML(
              product.name || ''
            )}"
          >
        </div>


        <div class="auth-field">
          <label class="auth-label">
            Kategori
          </label>

          <select class="auth-input">
            <option value="">
              Pilih kategori
            </option>

            ${categoryOptions}
          </select>
        </div>


        <div class="auth-field">
          <label class="auth-label">
            Harga
          </label>

          <input
            class="auth-input"
            type="number"
            min="0"
            value="${escapeHTML(
              String(product.price ?? 0)
            )}"
          >
        </div>


        <div class="auth-field">
          <label class="auth-label">
            Stok
          </label>

          <input
            class="auth-input"
            type="number"
            min="0"
            value="${escapeHTML(
              String(product.stock ?? 0)
            )}"
          >
        </div>


        <div class="auth-field">
          <label class="auth-label">
            Satuan
          </label>

          <input
            class="auth-input"
            type="text"
            value="${escapeHTML(
              product.unit || ''
            )}"
          >
        </div>


        <div class="auth-field">
          <label class="auth-label">
            Deskripsi
          </label>

          <textarea
            class="auth-input"
            rows="4"
          >${escapeHTML(
            product.description || ''
          )}</textarea>
        </div>


        <button
  type="button"
  class="btn-primary"
  data-action="product-edit-save"
  data-product-id="${escapeHTML(
    product.id || ''
  )}"
>
  <i class="ph ph-floppy-disk"></i>
  <span>Simpan Perubahan</span>
</button>

      </div>
    `,
    'product-edit'
  );
}

async function handleProductEditSave(
  productId,
  element
) {
  const shell =
    element.closest(
      '.auth-shell'
    );


  if (!shell) {
    showToast(
      'Form edit produk tidak ditemukan.'
    );

    return;
  }


  const fields =
    shell.querySelectorAll(
      '.auth-input'
    );


  if (fields.length < 6) {
    showToast(
      'Form edit produk belum lengkap.'
    );

    return;
  }


  const [
    nameInput,
    categoryInput,
    priceInput,
    stockInput,
    unitInput,
    descriptionInput
  ] = fields;


  const name =
    String(
      nameInput.value || ''
    ).trim();


  const categoryId =
    String(
      categoryInput.value || ''
    ).trim();


  const price =
    Number(
      priceInput.value
    );


  const stock =
    Number(
      stockInput.value
    );


  const unit =
    String(
      unitInput.value || ''
    ).trim();


  const description =
    String(
      descriptionInput.value || ''
    ).trim();


  // =====================================
  // VALIDATION
  // =====================================

  if (name.length < 2) {
    showToast(
      'Nama produk minimal 2 karakter.'
    );

    nameInput.focus();

    return;
  }


  if (
    !Number.isFinite(price) ||
    price < 0
  ) {
    showToast(
      'Harga produk tidak valid.'
    );

    priceInput.focus();

    return;
  }


  if (
    !Number.isInteger(stock) ||
    stock < 0
  ) {
    showToast(
      'Stok produk tidak valid.'
    );

    stockInput.focus();

    return;
  }


  const label =
    element.querySelector(
      'span'
    );


  const oldLabel =
    label?.textContent ||
    'Simpan Perubahan';


  element.disabled = true;


  if (label) {
    label.textContent =
      'Menyimpan...';
  }


  try {
    const response =
      await fetch(
        `/api/products/${encodeURIComponent(
          productId
        )}`,
        {
          method: 'PATCH',

          credentials:
            'include',

          headers: {
            'Content-Type':
              'application/json',

            Accept:
              'application/json'
          },

          body:
            JSON.stringify({
              name,

              category_id:
                categoryId || null,

              price,
              stock,
              unit,
              description
            })
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
        'Produk gagal diperbarui.'
      );
    }


    showToast(
      'Produk berhasil diperbarui.'
    );


    /*
     * Muat ulang profil supaya
     * data terbaru diambil dari Neon.
     */
    await openAccount();


    const productsTab =
      document.querySelector(
        '.social-account-tab[data-tab="products"]'
      );


    if (productsTab) {
      switchAccountTab(
        'products',
        productsTab
      );
    }


  } catch (error) {
    console.error(
      '[Pasar UMKM] Product update error:',
      error
    );


    showToast(
      error.message ||
      'Produk gagal diperbarui.'
    );


  } finally {
    element.disabled = false;


    if (label) {
      label.textContent =
        oldLabel;
    }
  }
}

function openProductDeleteConfirm(
  productId
) {
  const product =
    STATE.accountProducts.find(
      item =>
        String(item.id) ===
        String(productId)
    );


  if (!product) {
    showToast(
      'Produk tidak ditemukan.'
    );

    return;
  }


  openBottomSheet(
    `
      <div class="auth-shell">

        <div
          class="auth-title"
          id="sheetTitle"
        >
          Hapus Produk?
        </div>


        <p class="auth-subtitle">
          Produk
          <strong>
            ${escapeHTML(
              product.name ||
              'Produk UMKM'
            )}
          </strong>
          akan dinonaktifkan dari Pasar UMKM.
        </p>


        <p class="auth-subtitle">
          Produk tidak akan langsung dihapus
          permanen dari database.
        </p>


        <button
          type="button"
          class="btn-primary"
          data-action="product-delete"
          data-product-id="${escapeHTML(
            product.id || ''
          )}"
        >
          <i class="ph ph-trash"></i>
          <span>Ya, Hapus Produk</span>
        </button>


        <button
          type="button"
          class="menu-sheet-btn"
          data-action="close-sheet"
        >
          <i class="ph ph-x"></i>
          <span>Batal</span>
        </button>

      </div>
    `,
    'product-delete-confirm'
  );
}

async function handleProductDelete(
  productId,
  element
) {
  if (!productId) {
    showToast(
      'Produk tidak ditemukan.'
    );

    return;
  }


  const label =
    element.querySelector(
      'span'
    );


  const oldLabel =
    label?.textContent ||
    'Ya, Hapus Produk';


  element.disabled = true;


  if (label) {
    label.textContent =
      'Menghapus...';
  }


  try {
    const response =
      await fetch(
        `/api/products/${encodeURIComponent(
          productId
        )}`,
        {
          method: 'DELETE',

          credentials:
            'include',

          headers: {
            Accept:
              'application/json'
          }
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
        'Produk gagal dihapus.'
      );
    }


    showToast(
      'Produk berhasil dihapus.'
    );


    await openAccount();


    const productsTab =
      document.querySelector(
        '.social-account-tab[data-tab="products"]'
      );


    if (productsTab) {
      switchAccountTab(
        'products',
        productsTab
      );
    }


  } catch (error) {
    console.error(
      '[Pasar UMKM] Product delete error:',
      error
    );


    showToast(
      error.message ||
      'Produk gagal dihapus.'
    );


  } finally {
    element.disabled = false;


    if (label) {
      label.textContent =
        oldLabel;
    }
  }
}

/* =========================================================
   ACCOUNT MENU
   ========================================================= */

function openAccountMenu() {
  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Akun
      </h2>


      <button
        type="button"
        class="menu-sheet-btn"
        data-action="account-edit"
      >
        <i class="ph ph-user-circle"></i>
        Edit Profil
      </button>


      ${
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
            `
          : ''
      }


      <button
        type="button"
        class="menu-sheet-btn"
        data-action="account-logout"
      >
        <i class="ph ph-sign-out"></i>
        Keluar
      </button>
    `,
    'account-menu'
  );
}


/* =========================================================
   EDIT ACCOUNT
   ========================================================= */

function openAccountEditInfo() {
  openBottomSheet(
    createInformationState(
      'Edit Profil',
      'user-circle',
      'Foto profil, bio, username, dan informasi akun akan dikelola melalui fitur Edit Profil.'
    ),
    'account-edit'
  );
}


/* =========================================================
   SHARE ACCOUNT
   ========================================================= */
async function shareSellerProfile(
  storeId
) {
  const store =
    getStores().find(
      item =>
        String(item.id) ===
        String(storeId)
    );


  if (!store) {
    showToast(
      'UMKM tidak ditemukan.'
    );

    return;
  }


  const url =
    `${window.location.origin}` +
    `${window.location.pathname}`;


  const text =
    `Lihat ${store.name || 'UMKM Lokal'} di Pasar UMKM Lubuklinggau.`;


  try {

    if (navigator.share) {
      await navigator.share({
        title:
          store.name ||
          CONFIG.APP_NAME,

        text,

        url
      });

      return;
    }


    await navigator.clipboard.writeText(
      `${text} ${url}`
    );


    showToast(
      'Tautan UMKM berhasil disalin.'
    );

  } catch (error) {

    if (
      error.name !==
      'AbortError'
    ) {
      console.error(
        '[Pasar UMKM] Seller share error:',
        error
      );
    }

  }
}

async function shareAccountProfile() {
  const url =
    `${window.location.origin}` +
    `${window.location.pathname}` +
    '#account';

  try {

    if (navigator.share) {
      await navigator.share({
        title:
          STATE.user?.name ||
          CONFIG.APP_NAME,

        text:
          'Lihat profil saya di Pasar UMKM.',

        url
      });

      return;
    }


    await navigator.clipboard.writeText(
      url
    );

    showToast(
      'Tautan profil berhasil disalin.'
    );

  } catch (error) {

    if (
      error.name !==
      'AbortError'
    ) {
      console.error(
        '[Pasar UMKM] Account share error:',
        error
      );
    }
  }
}


/* =========================================================
   LOGOUT FROM ACCOUNT
   ========================================================= */

function logoutFromAccount() {
  leaveAccountProfile();

  STATE.activeNav =
    'home';

  updateNavigation();

  logout();
}


/* =========================================================
   LEAVE ACCOUNT PROFILE
   ========================================================= */

function leaveAccountProfile() {
  const app =
    document.querySelector('.app');

  if (
    !app?.classList.contains(
      'account-profile-active'
    )
  ) {
    return;
  }

  app.classList.remove(
    'account-profile-active'
  );

  if (DOM.homeDiscovery) {
    DOM.homeDiscovery.hidden = false;
  }

  renderStories();

  if (DOM.feed) {
    renderFeed();
  }
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
    showToast(
      'Masuk untuk mulai menjual.'
    );

    openLogin();

    return;
  }


  /*
   * Belum menjadi seller?
   * Tampilkan formulir pendaftaran UMKM.
   */
  if (
    STATE.user.role !== 'seller' &&
    STATE.user.role !== 'admin'
  ) {
    renderStoreRegistrationForm();

    return;
  }


  /*
   * Seller / Admin:
   * tampilkan pusat penjual.
   */
  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Pusat Penjual
      </h2>


      <section class="side-account">

        <div class="side-account-user-main">

          <div class="side-account-avatar">
            <i
              class="ph ph-storefront"
              aria-hidden="true"
            ></i>
          </div>


          <div class="side-account-user-info">

            <strong class="side-account-user-name">
              Pusat Penjual
            </strong>

            <span class="side-account-user-role">
              Kelola UMKM dan produk Anda
            </span>

          </div>

        </div>

      </section>


     <button
  type="button"
  class="menu-sheet-btn"
  data-action="product-create"
>
  <i class="ph ph-plus-circle"></i>

  Tambah Produk
</button>


      <button
  type="button"
  class="menu-sheet-btn"
  data-action="post-create"
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
   PRODUCT CREATE FORM
   ========================================================= */

function openProductCreateForm() {
  if (
    !STATE.user ||
    (
      STATE.user.role !== 'seller' &&
      STATE.user.role !== 'admin'
    )
  ) {
    showToast(
      'Hanya pemilik UMKM yang dapat menambahkan produk.'
    );

    return;
  }


  const categoryOptions =
    Array.isArray(CATEGORIES)
      ? CATEGORIES
          .map(category => `
            <option
              value="${escapeHTML(
                category.id
              )}"
            >
              ${escapeHTML(
                category.name
              )}
            </option>
          `)
          .join('')
      : '';


  openBottomSheet(
    `
      <div
        class="auth-shell"
        id="productCreateShell"
      >

        <section class="auth-brand">

          <div class="auth-brand-mark">
            <i
              class="ph ph-package"
              aria-hidden="true"
              style="font-size:32px;"
            ></i>
          </div>

          <div
            id="sheetTitle"
            class="auth-title"
            role="heading"
            aria-level="2"
          >
            Tambah Produk
          </div>

          <p class="auth-subtitle">
            Tambahkan produk baru ke toko Anda.
          </p>

        </section>


        <div
          id="productCreateMessage"
          class="auth-message"
          aria-live="polite"
          hidden
        ></div>


        <form
          id="productCreateForm"
          class="auth-form"
        >
        <div class="auth-field">

  <label
    class="auth-label"
    for="productCreateImage"
  >
    Foto Produk
  </label>

  <label
    for="productCreateImage"
    class="product-image-picker"
  >

    <div
      class="product-image-preview"
      id="productImagePreview"
    >
      <i class="ph ph-camera-plus"></i>

      <span>
        Pilih Foto Produk
      </span>
    </div>

  </label>

  <input
    id="productCreateImage"
    name="image"
    type="file"
    accept="image/jpeg,image/png,image/webp"
    hidden
  >

  <small class="product-image-help">
    JPG, PNG, atau WEBP. Maksimal 5 MB.
  </small>

</div>

          <div class="auth-field">

            <label
              class="auth-label"
              for="productCreateName"
            >
              Nama Produk
            </label>

            <div class="auth-input-wrap">

              <i
                class="ph ph-package auth-input-icon"
                aria-hidden="true"
              ></i>

              <input
                id="productCreateName"
                class="auth-input"
                name="name"
                type="text"
                minlength="2"
                maxlength="150"
                placeholder="Contoh: Keripik Pisang Cokelat"
                required
              >

            </div>

          </div>


          <div class="auth-field">

            <label
              class="auth-label"
              for="productCreateCategory"
            >
              Kategori
            </label>

            <select
              id="productCreateCategory"
              class="auth-input"
              name="category_id"
            >
              <option value="">
                Pilih kategori
              </option>

              ${categoryOptions}

            </select>

          </div>


          <div class="auth-field">

            <label
              class="auth-label"
              for="productCreatePrice"
            >
              Harga
            </label>

            <div class="auth-input-wrap">

              <i
                class="ph ph-currency-circle-dollar auth-input-icon"
                aria-hidden="true"
              ></i>

              <input
                id="productCreatePrice"
                class="auth-input"
                name="price"
                type="number"
                inputmode="numeric"
                min="0"
                step="1"
                placeholder="15000"
                required
              >

            </div>

          </div>


          <div class="auth-field">

            <label
              class="auth-label"
              for="productCreateStock"
            >
              Stok
            </label>

            <div class="auth-input-wrap">

              <i
                class="ph ph-stack auth-input-icon"
                aria-hidden="true"
              ></i>

              <input
                id="productCreateStock"
                class="auth-input"
                name="stock"
                type="number"
                inputmode="numeric"
                min="0"
                step="1"
                value="0"
                required
              >

            </div>

          </div>


          <div class="auth-field">

            <label
              class="auth-label"
              for="productCreateUnit"
            >
              Satuan
            </label>

            <div class="auth-input-wrap">

              <i
                class="ph ph-tag auth-input-icon"
                aria-hidden="true"
              ></i>

              <input
                id="productCreateUnit"
                class="auth-input"
                name="unit"
                type="text"
                maxlength="50"
                placeholder="pcs, kotak, botol, porsi..."
              >

            </div>

          </div>


          <div class="auth-field">

            <label
              class="auth-label"
              for="productCreateDescription"
            >
              Deskripsi
            </label>

            <textarea
              id="productCreateDescription"
              class="auth-input"
              name="description"
              rows="4"
              placeholder="Jelaskan produk Anda..."
              style="
                min-height:110px;
                resize:vertical;
                padding-top:14px;
              "
            ></textarea>

          </div>


          <button
            type="submit"
            class="btn-primary auth-submit"
          >
            <i
              class="ph ph-plus-circle"
              aria-hidden="true"
            ></i>

            <span>
              Tambahkan Produk
            </span>
          </button>

        </form>


        <div class="auth-security">

          <i
            class="ph ph-shield-check"
            aria-hidden="true"
          ></i>

          <span>
            Produk akan terhubung langsung
            dengan UMKM Anda.
          </span>

        </div>

      </div>
    `,
    'product-create'
  );


  bindProductCreateEvents();


  requestAnimationFrame(() => {
    DOM.sheetContent
      ?.querySelector(
        '#productCreateName'
      )
      ?.focus();
  });
}


/* =========================================================
   PRODUCT CREATE EVENTS
   ========================================================= */

function bindProductCreateEvents() {
  const form =
    DOM.sheetContent
      ?.querySelector(
        '#productCreateForm'
      );


  if (!form) {
    return;
  }


  form.addEventListener(
    'submit',
    handleProductCreateSubmit
  );


  const imageInput =
    form.querySelector(
      '#productCreateImage'
    );


  imageInput?.addEventListener(
    'change',
    event => {

      const file =
        event.target.files?.[0];


      const preview =
        form.querySelector(
          '#productImagePreview'
        );


      if (
        !file ||
        !preview
      ) {
        return;
      }


      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp'
      ];


      if (
        !allowedTypes.includes(
          file.type
        )
      ) {
        showToast(
          'Foto harus JPG, PNG, atau WEBP.'
        );

        event.target.value = '';

        return;
      }


      if (
        file.size >
        5 * 1024 * 1024
      ) {
        showToast(
          'Ukuran foto maksimal 5 MB.'
        );

        event.target.value = '';

        return;
      }


      const reader =
        new FileReader();


      reader.onload = () => {
        preview.innerHTML = `
          <img
            src="${reader.result}"
            alt="Preview foto produk"
          >
        `;
      };


      reader.readAsDataURL(
        file
      );
    }
  );
}

/* =========================================================
   PRODUCT CREATE SUBMIT
   ========================================================= */

async function handleProductCreateSubmit(
  event
) {
  event.preventDefault();


  const form =
    event.currentTarget;


  const submitButton =
    form.querySelector(
      '[type="submit"]'
    );


  const message =
    DOM.sheetContent
      ?.querySelector(
        '#productCreateMessage'
      );


  const formData =
    new FormData(form);


  const imageFile =
    formData.get('image');


  const payload = {
    name:
      String(
        formData.get('name') || ''
      ).trim(),

    category_id:
      String(
        formData.get(
          'category_id'
        ) || ''
      ).trim() || null,

    price:
      Number(
        formData.get('price')
      ),

    stock:
      Number(
        formData.get('stock')
      ),

    unit:
      String(
        formData.get('unit') || ''
      ).trim(),

    description:
      String(
        formData.get(
          'description'
        ) || ''
      ).trim(),

    thumbnail_url: null
  };


  if (
    payload.name.length < 2
  ) {
    showToast(
      'Nama produk minimal 2 karakter.'
    );

    return;
  }


  if (
    !Number.isFinite(
      payload.price
    ) ||
    payload.price < 0
  ) {
    showToast(
      'Harga produk tidak valid.'
    );

    return;
  }


  if (
    !Number.isInteger(
      payload.stock
    ) ||
    payload.stock < 0
  ) {
    showToast(
      'Stok produk tidak valid.'
    );

    return;
  }


  if (submitButton) {
  submitButton.disabled = true;

  const buttonText =
    submitButton.querySelector(
      'span'
    );

  if (buttonText) {
    buttonText.textContent =
      'Mengunggah foto...';
  }
}


  if (message) {
    message.hidden = true;
    message.textContent = '';
  }


  try {

    /*
     * Upload foto ke Cloudinary
     * jika pengguna memilih foto.
     */
    if (
      imageFile instanceof File &&
      imageFile.size > 0
    ) {

      const uploadFormData =
        new FormData();


      uploadFormData.append(
        'file',
        imageFile
      );


      const uploadResponse =
        await fetch(
          '/api/uploads/product-image',
          {
            method: 'POST',

            credentials:
              'include',

            body:
              uploadFormData
          }
        );


      const uploadData =
        await uploadResponse
          .json()
          .catch(() => ({}));


      if (
        !uploadResponse.ok ||
        uploadData.ok !== true ||
        !uploadData.image?.url
      ) {
        throw new Error(
          uploadData.error ||
          'Foto produk gagal diunggah.'
        );
      }


      payload.thumbnail_url =
        uploadData.image.url;
    const buttonText =
  submitButton
    ?.querySelector(
      'span'
    );

if (buttonText) {
  buttonText.textContent =
    'Menyimpan produk...';
}
       
}

    /*
     * Setelah upload selesai,
     * baru buat produk.
     */
    const response =
      await fetch(
        '/api/products',
        {
          method: 'POST',

          credentials:
            'include',

          headers: {
            'Content-Type':
              'application/json',

            Accept:
              'application/json'
          },

          body:
            JSON.stringify(
              payload
            )
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
        'Produk gagal ditambahkan.'
      );
    }


    showToast(
      data.message ||
      'Produk berhasil ditambahkan.'
    );


    closeBottomSheet();


    await openAccount();


    const productTab =
      document.querySelector(
        '.social-account-tab[data-tab="products"]'
      );


    if (productTab) {
      switchAccountTab(
        'products',
        productTab
      );
    }


  } catch (error) {

    console.error(
      '[Pasar UMKM] Product create error:',
      error
    );


    if (message) {
      message.textContent =
        error.message ||
        'Produk gagal ditambahkan.';

      message.hidden = false;
    }


    if (submitButton) {
  submitButton.disabled = false;

  const buttonText =
    submitButton.querySelector(
      'span'
    );

  if (buttonText) {
    buttonText.textContent =
      'Tambahkan Produk';
  }
}

}
}


/* =========================================================
   STORE REGISTRATION FORM
   ========================================================= */

function renderStoreRegistrationForm() {
  openBottomSheet(
    `
      <div
        class="auth-shell"
        id="storeRegisterShell"
      >

        <section class="auth-brand">

          <div class="auth-brand-mark">

            <i
              class="ph ph-storefront"
              aria-hidden="true"
              style="font-size:32px;"
            ></i>

          </div>


          <div
            id="sheetTitle"
            class="auth-title"
            role="heading"
            aria-level="2"
          >
            Daftarkan UMKM
          </div>


          <p class="auth-subtitle">
            Buat profil UMKM Anda untuk mulai
            menjual produk di Pasar UMKM.
          </p>

        </section>


        <div
          id="authMessage"
          class="auth-message"
          aria-live="polite"
          hidden
        ></div>


        <form
          id="storeRegisterForm"
          class="auth-form"
        >

          <div class="auth-field">

            <label
              class="auth-label"
              for="storeRegisterName"
            >
              Nama UMKM
            </label>


            <div class="auth-input-wrap">

              <i
                class="ph ph-storefront auth-input-icon"
                aria-hidden="true"
              ></i>


              <input
                id="storeRegisterName"
                class="auth-input"
                type="text"
                name="name"
                minlength="3"
                maxlength="100"
                autocomplete="organization"
                placeholder="Contoh: Kopi Linggau"
                required
              >

            </div>

          </div>


          <p
            class="empty-state-text"
            style="
              text-align:left;
              margin:0;
              font-size:13px;
              line-height:1.55;
            "
          >
            Nama UMKM dapat diubah melalui
            pengaturan toko setelah pendaftaran.
          </p>


          <button
            type="submit"
            class="btn-primary auth-submit"
          >
            <i
              class="ph ph-storefront"
              aria-hidden="true"
            ></i>

            <span>
              Daftarkan UMKM
            </span>
          </button>

        </form>


        <div class="auth-security">

          <i
            class="ph ph-shield-check"
            aria-hidden="true"
          ></i>

          <span>
            UMKM akan terhubung langsung
            dengan akun Anda.
          </span>

        </div>

      </div>
    `,
    'seller-register'
  );


  bindStoreRegisterEvents();


  requestAnimationFrame(() => {
    DOM.sheetContent
      ?.querySelector(
        '#storeRegisterName'
      )
      ?.focus();
  });
}



/* =========================================================
   STORE REGISTRATION EVENTS
   ========================================================= */

function bindStoreRegisterEvents() {
  const form =
    DOM.sheetContent
      ?.querySelector(
        '#storeRegisterForm'
      );


  if (!form) {
    return;
  }


  form.addEventListener(
    'submit',
    handleStoreRegisterSubmit
  );
}



/* =========================================================
   STORE REGISTRATION SUBMIT
   ========================================================= */

async function handleStoreRegisterSubmit(
  event
) {
  event.preventDefault();


  const form =
    event.currentTarget;


  if (!form.checkValidity()) {
    form.reportValidity();

    return;
  }


  const formData =
    new FormData(form);


  const name =
    String(
      formData.get('name') || ''
    )
      .trim()
      .replace(
        /\s+/g,
        ' '
      );


  const button =
    form.querySelector(
      '.auth-submit'
    );


  clearAuthMessage();


  setAuthLoading(
    button,
    true
  );


  try {

    /*
     * Kirim ke Cloudflare Worker.
     */
    const data =
      await authRequest(
        '/api/stores',
        {
          method: 'POST',

          body:
            JSON.stringify({
              name
            })
        }
      );


    if (!data.store) {
      throw new Error(
        'Data UMKM tidak diterima dari server.'
      );
    }


    /*
     * Backend mengembalikan user
     * yang role-nya sudah seller.
     */
    if (data.user) {
      STATE.user =
        data.user;
    } else {
      /*
       * Jaga-jaga jika response backend
       * tidak membawa user.
       */
      await restoreAuthSession();
    }


    /*
     * Ambil ulang daftar toko
     * dari Neon supaya frontend
     * menggunakan data server terbaru.
     */
    await loadStores();


    /*
     * Refresh bagian UI yang
     * bergantung pada role user.
     */
    renderAccount();
    renderSidebar();
    renderStories();
    updateNavigation();


    showToast(
      data.message ||
      'UMKM berhasil didaftarkan.'
    );


    /*
     * Role sekarang seller.
     * Buka kembali menu jual.
     */
    openSell();


  } catch (error) {
    console.error(
      '[Pasar UMKM] Store registration error:',
      error
    );


    setAuthMessage(
      'error',
      error.message ||
      'UMKM belum berhasil didaftarkan.'
    );


    setAuthLoading(
      button,
      false
    );
  }
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
            UMKM yang telah terdaftar
            akan tampil di sini.
          </p>

        </section>
      `,
      'stores'
    );

    return;
  }


  const html =
    stores
      .map(store => {

        const location =
          [
            store.district,
            store.city
          ]
            .filter(Boolean)
            .join(', ') ||
          'Lubuklinggau';


        const isVerified =
          store.verificationStatus ===
          'verified';


        return `
          <button
            type="button"
            class="store-directory-card"
            data-action="store-detail"
            data-store-id="${escapeHTML(
              store.id
            )}"
          >

            <div class="store-directory-logo">

              ${
                store.logo
                  ? `
                      <img
                        src="${escapeHTML(
                          store.logo
                        )}"
                        alt="${escapeHTML(
                          store.name
                        )}"
                      >
                    `
                  : `
                      <i
                        class="ph ph-storefront"
                        aria-hidden="true"
                      ></i>
                    `
              }

            </div>


            <div class="store-directory-info">

              <div class="store-directory-name">

                <span>
                  ${escapeHTML(
                    store.name
                  )}
                </span>

                ${
                  isVerified
                    ? `
                        <i
                          class="ph-fill ph-seal-check"
                          aria-label="UMKM terverifikasi"
                        ></i>
                      `
                    : ''
                }

              </div>


              ${
                store.category
                  ? `
                      <div class="store-directory-category">
                        ${escapeHTML(
                          store.category
                        )}
                      </div>
                    `
                  : ''
              }


              <div class="store-directory-location">

                <i
                  class="ph ph-map-pin"
                  aria-hidden="true"
                ></i>

                <span>
                  ${escapeHTML(
                    location
                  )}
                </span>

              </div>


              <div class="store-directory-bottom">

                <span>
                  ${Number(
                    store.productCount || 0
                  )}
                  Produk
                </span>

                <span class="store-directory-open">
                  Lihat Toko

                  <i
                    class="ph ph-arrow-right"
                    aria-hidden="true"
                  ></i>
                </span>

              </div>

            </div>

          </button>
        `;
      })
      .join('');


  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Jelajahi UMKM
      </h2>

      <div class="store-directory-list">
        ${html}
      </div>
    `,
    'stores'
  );
}

function openStoreDetail(
  storeId
) {
  const store =
    getStores().find(
      item =>
        String(item.id) ===
        String(storeId)
    );


  if (!store) {
    showToast(
      'UMKM tidak ditemukan.'
    );

    return;
  }


  const location =
    [
      store.address,
      store.district,
      store.city,
      store.province
    ]
      .filter(Boolean)
      .join(', ') ||
    'Lubuklinggau';


  const isVerified =
    store.verificationStatus ===
    'verified';


  /*
   * Ambil semua produk publik
   * milik toko ini dari DATA.posts.
   */
  const storeProducts =
    DATA.posts
      .filter(post => {
        return (
          String(
            post.store?.id
          ) ===
            String(store.id) &&
          post.product?.id
        );
      })
      .map(post =>
        post.product
      );


  const productHTML =
    storeProducts.length
      ? `
          <section class="store-catalog-section">

            <div class="store-catalog-heading">

              <div>
                <span class="store-catalog-eyebrow">
                  KATALOG TOKO
                </span>

                <h3>
                  Produk
                </h3>
              </div>

              <span class="store-catalog-count">
                ${storeProducts.length}
                produk
              </span>

            </div>


            <div class="store-catalog-grid">

              ${storeProducts
                .map(product => {

                  const image =
                    product.image ||
                    product.image_url ||
                    product.thumbnail_url ||
                    ASSETS.logo;


                  return `
                    <button
                      type="button"
                      class="store-catalog-card"
                      data-action="product-detail"
                      data-product-id="${escapeHTML(
                        product.id || ''
                      )}"
                    >

                      <div class="store-catalog-media">

                        <img
                          src="${escapeHTML(
                            image
                          )}"
                          alt="${escapeHTML(
                            product.name ||
                            'Produk UMKM'
                          )}"
                          loading="lazy"
                          decoding="async"
                        >

                      </div>


                      <div class="store-catalog-body">

                        ${
                          product.category
                            ? `
                                <span class="store-catalog-category">
                                  ${escapeHTML(
                                    product.category
                                  )}
                                </span>
                              `
                            : ''
                        }


                        <strong class="store-catalog-name">
                          ${escapeHTML(
                            product.name ||
                            'Produk UMKM'
                          )}
                        </strong>


                        <div class="store-catalog-price">
                          ${formatRupiah(
                            product.price
                          )}
                        </div>


                        <div class="store-catalog-stock">

                          <i
                            class="ph ph-package"
                            aria-hidden="true"
                          ></i>

                          <span>
                            Stok
                            ${escapeHTML(
                              String(
                                product.stock ?? 0
                              )
                            )}

                            ${
                              product.unit
                                ? escapeHTML(
                                    product.unit
                                  )
                                : ''
                            }
                          </span>

                        </div>

                      </div>

                    </button>
                  `;
                })
                .join('')}

            </div>

          </section>
        `
      : `
          <section class="store-catalog-empty">

            <i
              class="ph ph-shopping-bag"
              aria-hidden="true"
            ></i>

            <strong>
              Belum ada produk
            </strong>

            <p>
              Produk dari UMKM ini
              akan tampil di sini.
            </p>

          </section>
        `;


  openBottomSheet(
    `
      <div class="store-detail-shell">

  <button
    type="button"
    class="store-detail-back"
    data-menu-action="stores"
    aria-label="Kembali ke daftar UMKM"
  >
    <i
      class="ph ph-arrow-left"
      aria-hidden="true"
    ></i>

    <span>
      Jelajahi UMKM
    </span>
  </button>


  <div class="store-detail-cover">
          ${
            store.cover
              ? `
                  <img
                    src="${escapeHTML(
                      store.cover
                    )}"
                    alt=""
                  >
                `
              : `
                  <div class="store-detail-cover-placeholder">
                  </div>
                `
          }

        </div>


        <div class="store-detail-profile">


          <div class="store-detail-logo">

            ${
              store.logo
                ? `
                    <img
                      src="${escapeHTML(
                        store.logo
                      )}"
                      alt="${escapeHTML(
                        store.name
                      )}"
                    >
                  `
                : `
                    <i
                      class="ph ph-storefront"
                      aria-hidden="true"
                    ></i>
                  `
            }

          </div>


          <div class="store-detail-heading">

            <div
              id="sheetTitle"
              class="store-detail-name"
            >

              ${escapeHTML(
                store.name
              )}

              ${
                isVerified
                  ? `
                      <i
                        class="ph-fill ph-seal-check"
                        aria-label="UMKM terverifikasi"
                      ></i>
                    `
                  : ''
              }

            </div>


            ${
              store.category
                ? `
                    <div class="store-detail-category">
                      ${escapeHTML(
                        store.category
                      )}
                    </div>
                  `
                : ''
            }

          </div>

        </div>


        <div class="store-detail-stats">

          <div>

            <strong>
              ${Number(
                store.productCount || 0
              )}
            </strong>

            <span>
              Produk
            </span>

          </div>


          <div>

            <strong>
              ${
                isVerified
                  ? 'Ya'
                  : 'Belum'
              }
            </strong>

            <span>
              Terverifikasi
            </span>

          </div>

        </div>


        ${
          store.description
            ? `
                <p class="store-detail-description">
                  ${escapeHTML(
                    store.description
                  )}
                </p>
              `
            : ''
        }


       <div class="store-detail-location">

  <i
    class="ph ph-map-pin"
    aria-hidden="true"
  ></i>

  <span>
    ${escapeHTML(
      location
    )}
  </span>

</div>


<button
  type="button"
  class="store-detail-profile-button"
  data-action="seller-profile"
  data-store-id="${escapeHTML(
    store.id || ''
  )}"
>
  <span class="store-detail-profile-icon">
    <i
      class="ph ph-user-circle"
      aria-hidden="true"
    ></i>
  </span>

  <span class="store-detail-profile-copy">

    <strong>
      Lihat Profil UMKM
    </strong>

    <small>
      Postingan, produk, dan informasi penjual
    </small>

  </span>

  <i
    class="ph ph-caret-right store-detail-profile-arrow"
    aria-hidden="true"
  ></i>
</button>


${productHTML}


      </div>
    `,
    'store-detail'
  );
}

/* =========================================================
   PUBLIC SELLER PROFILE
   ========================================================= */
function handleSellerFollow(
  storeId
) {
  const store =
    getStores().find(
      item =>
        String(item.id) ===
        String(storeId)
    );


  if (!store) {
    showToast(
      'UMKM tidak ditemukan.'
    );

    return;
  }


  if (!STATE.user) {
    showToast(
      'Masuk terlebih dahulu untuk mengikuti UMKM.'
    );

    openLogin();

    return;
  }


  showToast(
    'Fitur mengikuti UMKM segera tersedia.'
  );
}

function openSellerProfile(
  storeId
) {
  const store =
    getStores().find(
      item =>
        String(item.id) ===
        String(storeId)
    );


  if (!store) {
    showToast(
      'Profil UMKM tidak ditemukan.'
    );

    return;
  }


  closeBottomSheet();
  closeSideMenu();


  /*
   * Profil publik bukan halaman akun sendiri.
   * Jadi bottom nav tidak dibuat aktif sebagai Profil.
   */
  STATE.activeNav = 'home';

  updateNavigation();


  const app =
    document.querySelector('.app');


  /*
   * Pakai mode layout profil yang sama
   * agar header dan bottom navigation tetap stabil.
   */
  app?.classList.add(
    'account-profile-active'
  );


  if (DOM.storiesSection) {
    DOM.storiesSection.hidden =
      true;
  }


  if (DOM.homeDiscovery) {
    DOM.homeDiscovery.hidden =
      true;
  }


  if (!DOM.feed) {
    return;
  }


  /*
   * Semua postingan / produk publik
   * milik penjual ini.
   */
  const sellerPosts =
    DATA.posts.filter(
      post =>
        String(
          post.store?.id
        ) ===
        String(store.id)
    );


  const sellerProducts =
    sellerPosts
      .filter(
        post =>
          post.product?.id
      )
      .map(
        post =>
          post.product
      );


  const avatar =
    store.logo ||
    sellerPosts[0]?.store?.avatar ||
    ASSETS.logo;


  const location =
    [
      store.district,
      store.city
    ]
      .filter(Boolean)
      .join(', ') ||
    store.province ||
    CONFIG.CITY;


  const isVerified =
    store.verificationStatus ===
    'verified';


  /*
   * Grid produk awal.
   * Nanti tab Postingan / Produk kita hidupkan terpisah.
   */
  const productGrid =
    sellerProducts.length
      ? `
          <div class="social-account-product-grid">

            ${sellerProducts
              .map(product => {

                const image =
                  product.image ||
                  product.image_url ||
                  product.thumbnail_url ||
                  ASSETS.logo;


                return `
                  <article
                    class="social-product-card"
                    data-action="product-detail"
                    data-product-id="${escapeHTML(
                      product.id || ''
                    )}"
                  >

                    <div class="social-product-media">

                      <img
                        src="${escapeHTML(
                          image
                        )}"
                        alt="${escapeHTML(
                          product.name ||
                          'Produk UMKM'
                        )}"
                        loading="lazy"
                        decoding="async"
                      >

                    </div>


                    <div class="social-product-body">

                      ${
                        product.category
                          ? `
                              <span class="social-product-category">
                                ${escapeHTML(
                                  product.category
                                )}
                              </span>
                            `
                          : ''
                      }


                      <strong class="social-product-name">
                        ${escapeHTML(
                          product.name ||
                          'Produk UMKM'
                        )}
                      </strong>


                      <div class="social-product-price">
                        ${formatRupiah(
                          product.price
                        )}
                      </div>


                      <div class="social-product-stock">

                        <i
                          class="ph ph-package"
                          aria-hidden="true"
                        ></i>

                        <span>
                          Stok
                          ${escapeHTML(
                            String(
                              product.stock ?? 0
                            )
                          )}

                          ${
                            product.unit
                              ? escapeHTML(
                                  product.unit
                                )
                              : ''
                          }
                        </span>

                      </div>

                    </div>

                  </article>
                `;
              })
              .join('')}

          </div>
        `
      : `
          <section class="social-account-empty">

            <div class="social-account-empty-icon">
              <i class="ph ph-shopping-bag"></i>
            </div>

            <strong>
              Belum ada produk
            </strong>

            <p>
              Produk dari UMKM ini
              akan tampil di sini.
            </p>

          </section>
        `;


  DOM.feed.innerHTML = `
    <section
      class="
        social-account-page
        public-seller-profile
      "
      data-store-id="${escapeHTML(
        store.id
      )}"
    >


      <!-- =====================================
           TOP BAR
           ===================================== -->

      <header class="social-account-topbar">

        <button
          type="button"
          class="social-account-top-button"
          data-action="seller-profile-back"
          aria-label="Kembali"
        >
          <i
            class="ph ph-arrow-left"
            aria-hidden="true"
          ></i>
        </button>


        <div class="social-account-username">

          <strong>
            ${escapeHTML(
              store.name
            )}
          </strong>

          ${
            isVerified
              ? `
                  <i
                    class="ph-fill ph-seal-check verified-badge"
                    aria-label="UMKM terverifikasi"
                  ></i>
                `
              : ''
          }

        </div>


        <button
          type="button"
          class="social-account-top-button"
          data-action="seller-share"
          data-store-id="${escapeHTML(
            store.id
          )}"
          aria-label="Bagikan profil"
        >
          <i
            class="ph ph-share-network"
            aria-hidden="true"
          ></i>
        </button>

      </header>


      <!-- =====================================
           PROFILE
           ===================================== -->

      <section class="social-account-header">


        <div class="social-account-main">


          <div class="social-account-avatar-wrap">

            <div class="social-account-avatar">

              <img
                src="${escapeHTML(
                  avatar
                )}"
                alt="${escapeHTML(
                  store.name
                )}"
                loading="lazy"
                decoding="async"
              >

            </div>

          </div>


          <div class="social-account-stats">


            <div class="social-account-stat">

              <strong>
                ${sellerPosts.length}
              </strong>

              <span>
                Postingan
              </span>

            </div>


            <div class="social-account-stat">

              <strong>
                0
              </strong>

              <span>
                Pengikut
              </span>

            </div>


            <div class="social-account-stat">

              <strong>
                0
              </strong>

              <span>
                Mengikuti
              </span>

            </div>


          </div>

        </div>


        <!-- =================================
             BIO
             ================================= -->

        <div class="social-account-bio">


          <div class="social-account-name-row">

            <h1 class="social-account-name">
              ${escapeHTML(
                store.name
              )}
            </h1>


            ${
              isVerified
                ? `
                    <i
                      class="ph-fill ph-seal-check verified-badge"
                      aria-label="UMKM terverifikasi"
                    ></i>
                  `
                : ''
            }

          </div>


          <div class="social-account-role">

            ${
              store.category
                ? escapeHTML(
                    store.category
                  )
                : 'UMKM Lokal'
            }

          </div>


          ${
            store.description
              ? `
                  <p class="social-account-description">
                    ${escapeHTML(
                      store.description
                    )}
                  </p>
                `
              : ''
          }


          <div class="social-account-link">

            <i
              class="ph ph-map-pin"
              aria-hidden="true"
            ></i>

            <span>
              ${escapeHTML(
                location
              )}
            </span>

          </div>

        </div>


        <!-- =================================
             PUBLIC ACTIONS
             ================================= -->

        <div class="public-seller-actions">


          <button
            type="button"
            class="
              public-seller-action
              public-seller-follow
            "
            data-action="seller-follow"
            data-store-id="${escapeHTML(
              store.id
            )}"
          >

            <span>
              Ikuti
            </span>

            <i
              class="ph ph-caret-down"
              aria-hidden="true"
            ></i>

          </button>


          <button
            type="button"
            class="public-seller-action"
            data-action="seller-message"
            data-store-id="${escapeHTML(
              store.id
            )}"
          >

            <i
              class="ph ph-chat-circle"
              aria-hidden="true"
            ></i>

            <span>
              Kirim Pesan
            </span>

          </button>


          <button
            type="button"
            class="public-seller-action"
            data-action="seller-contact"
            data-store-id="${escapeHTML(
              store.id
            )}"
          >

            <span>
              Kontak
            </span>

          </button>


          <button
            type="button"
            class="
              public-seller-action
              public-seller-icon-action
            "
            data-action="seller-suggest"
            data-store-id="${escapeHTML(
              store.id
            )}"
            aria-label="Temukan akun serupa"
          >

            <i
              class="ph ph-user-plus"
              aria-hidden="true"
            ></i>

          </button>


        </div>

      </section>


      <!-- =====================================
           STORE SHORTCUT
           ===================================== -->

      <button
        type="button"
        class="public-seller-store-link"
        data-action="store-detail"
        data-store-id="${escapeHTML(
          store.id
        )}"
      >

        <div class="public-seller-store-icon">

          <i
            class="ph ph-storefront"
            aria-hidden="true"
          ></i>

        </div>


        <div>

          <strong>
            Lihat Toko
          </strong>

          <span>
            ${sellerProducts.length}
            produk tersedia
          </span>

        </div>


        <i
          class="ph ph-caret-right"
          aria-hidden="true"
        ></i>

      </button>


      <!-- =====================================
           PUBLIC TABS
           ===================================== -->

      <nav
        class="social-account-tabs"
        aria-label="Konten penjual"
      >

        <button
          type="button"
          class="social-account-tab"
          data-action="seller-public-tab"
          data-tab="posts"
          data-store-id="${escapeHTML(
            store.id
          )}"
          aria-label="Postingan"
        >
          <i
            class="ph ph-squares-four"
          ></i>
        </button>


        <button
          type="button"
          class="
            social-account-tab
            active
          "
          data-action="seller-public-tab"
          data-tab="products"
          data-store-id="${escapeHTML(
            store.id
          )}"
          aria-label="Produk"
        >
          <i
            class="ph ph-shopping-bag"
          ></i>
        </button>

      </nav>


      <div id="publicSellerContent">
        ${productGrid}
      </div>


    </section>
  `;


  window.scrollTo({
    top: 0,
    behavior: 'auto'
  });
}

function openSellerContact(
  storeId
) {
  const store =
    getStores().find(
      item =>
        String(item.id) ===
        String(storeId)
    );


  if (!store) {
    showToast(
      'UMKM tidak ditemukan.'
    );

    return;
  }


  const rawWhatsapp =
    String(
      store.whatsapp ||
      store.phone ||
      ''
    );


  let whatsappNumber =
    rawWhatsapp.replace(
      /\D/g,
      ''
    );


  if (
    whatsappNumber.startsWith('0')
  ) {
    whatsappNumber =
      '62' +
      whatsappNumber.slice(1);
  }


  const phoneNumber =
    String(
      store.phone ||
      ''
    )
      .replace(
        /[^\d+]/g,
        ''
      );


  const whatsappHTML =
    whatsappNumber
      ? `
          <a
            href="https://wa.me/${escapeHTML(
              whatsappNumber
            )}"
            target="_blank"
            rel="noopener noreferrer"
            class="menu-sheet-btn"
          >
            <i
              class="ph ph-whatsapp-logo"
              aria-hidden="true"
            ></i>

            <span>
              WhatsApp
            </span>
          </a>
        `
      : '';


  const phoneHTML =
    phoneNumber
      ? `
          <a
            href="tel:${escapeHTML(
              phoneNumber
            )}"
            class="menu-sheet-btn"
          >
            <i
              class="ph ph-phone"
              aria-hidden="true"
            ></i>

            <span>
              Telepon
            </span>
          </a>
        `
      : '';


  const contactHTML =
    whatsappHTML ||
    phoneHTML
      ? `
          ${whatsappHTML}
          ${phoneHTML}
        `
      : `
          <section class="empty-state">

            <i
              class="ph ph-address-book"
              aria-hidden="true"
            ></i>

            <strong class="empty-state-title">
              Kontak belum tersedia
            </strong>

            <p class="empty-state-text">
              UMKM ini belum menambahkan
              nomor WhatsApp atau telepon.
            </p>

          </section>
        `;


  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Kontak ${escapeHTML(
          store.name ||
          'UMKM'
        )}
      </h2>

      ${contactHTML}
    `,
    'seller-contact'
  );
}

function openSimilarStores(
  storeId
) {
  const currentStore =
    getStores().find(
      item =>
        String(item.id) ===
        String(storeId)
    );


  if (!currentStore) {
    showToast(
      'UMKM tidak ditemukan.'
    );

    return;
  }


  const allOtherStores =
    getStores().filter(
      store =>
        String(store.id) !==
        String(currentStore.id)
    );


  const sameCategory =
    currentStore.category
      ? allOtherStores.filter(
          store =>
            normalizeText(
              store.category
            ) ===
            normalizeText(
              currentStore.category
            )
        )
      : [];


  const suggestions =
    (
      sameCategory.length
        ? sameCategory
        : allOtherStores
    )
      .slice(0, 5);


  if (!suggestions.length) {
    openBottomSheet(
      `
        <h2 id="sheetTitle">
          UMKM Serupa
        </h2>

        <section class="empty-state">

          <i
            class="ph ph-storefront"
            aria-hidden="true"
          ></i>

          <strong class="empty-state-title">
            Belum ada rekomendasi
          </strong>

          <p class="empty-state-text">
            UMKM serupa akan tampil
            setelah lebih banyak usaha bergabung.
          </p>

        </section>
      `,
      'seller-suggest'
    );

    return;
  }


  const html =
    suggestions
      .map(store => `
        <button
          type="button"
          class="menu-sheet-btn"
          data-action="seller-profile"
          data-store-id="${escapeHTML(
            store.id
          )}"
        >

          <i
            class="ph ph-storefront"
            aria-hidden="true"
          ></i>

          <span>
            ${escapeHTML(
              store.name ||
              'UMKM Lokal'
            )}

            ${
              store.category
                ? `
                    <small>
                      ${escapeHTML(
                        store.category
                      )}
                    </small>
                  `
                : ''
            }

          </span>

        </button>
      `)
      .join('');


  openBottomSheet(
    `
      <h2 id="sheetTitle">
        UMKM Serupa
      </h2>

      ${html}
    `,
    'seller-suggest'
  );
}

function switchPublicSellerTab(
  storeId,
  tab,
  button
) {
  const store =
    getStores().find(
      item =>
        String(item.id) ===
        String(storeId)
    );


  if (!store) {
    showToast(
      'Profil UMKM tidak ditemukan.'
    );

    return;
  }


  const page =
    document.querySelector(
      '.public-seller-profile'
    );


  if (!page) {
    return;
  }


  page
    .querySelectorAll(
      '.social-account-tab'
    )
    .forEach(item => {
      item.classList.toggle(
        'active',
        item === button
      );
    });


  const content =
    page.querySelector(
      '#publicSellerContent'
    );


  if (!content) {
    return;
  }


  const sellerPosts =
    DATA.posts.filter(
      post =>
        String(
          post.store?.id
        ) ===
        String(store.id)
    );


  if (tab === 'posts') {

    if (!sellerPosts.length) {
      content.innerHTML = `
        <section class="social-account-empty">

          <div class="social-account-empty-icon">
            <i class="ph ph-squares-four"></i>
          </div>

          <strong>
            Belum ada postingan
          </strong>

          <p>
            Postingan dari UMKM ini
            akan tampil di sini.
          </p>

        </section>
      `;

      return;
    }


    content.innerHTML = `
      <div class="public-seller-post-list">

        ${sellerPosts
          .map(post =>
            createPostTemplate(post)
          )
          .join('')}

      </div>
    `;

    return;
  }


  const sellerProducts =
    sellerPosts
      .filter(
        post =>
          post.product?.id
      )
      .map(
        post =>
          post.product
      );


  if (!sellerProducts.length) {
    content.innerHTML = `
      <section class="social-account-empty">

        <div class="social-account-empty-icon">
          <i class="ph ph-shopping-bag"></i>
        </div>

        <strong>
          Belum ada produk
        </strong>

        <p>
          Produk dari UMKM ini
          akan tampil di sini.
        </p>

      </section>
    `;

    return;
  }


  content.innerHTML = `
    <div class="social-account-product-grid">

      ${sellerProducts
        .map(product => {

          const image =
            product.image ||
            product.image_url ||
            product.thumbnail_url ||
            ASSETS.logo;


          return `
            <article
              class="social-product-card"
              data-action="product-detail"
              data-product-id="${escapeHTML(
                product.id || ''
              )}"
            >

              <div class="social-product-media">

                <img
                  src="${escapeHTML(
                    image
                  )}"
                  alt="${escapeHTML(
                    product.name ||
                    'Produk UMKM'
                  )}"
                  loading="lazy"
                  decoding="async"
                >

              </div>


              <div class="social-product-body">

                ${
                  product.category
                    ? `
                        <span class="social-product-category">
                          ${escapeHTML(
                            product.category
                          )}
                        </span>
                      `
                    : ''
                }


                <strong class="social-product-name">
                  ${escapeHTML(
                    product.name ||
                    'Produk UMKM'
                  )}
                </strong>


                <div class="social-product-price">
                  ${formatRupiah(
                    product.price
                  )}
                </div>


                <div class="social-product-stock">

                  <i
                    class="ph ph-package"
                    aria-hidden="true"
                  ></i>

                  <span>
                    Stok
                    ${escapeHTML(
                      String(
                        product.stock ?? 0
                      )
                    )}

                    ${
                      product.unit
                        ? escapeHTML(
                            product.unit
                          )
                        : ''
                    }
                  </span>

                </div>

              </div>

            </article>
          `;
        })
        .join('')}

    </div>
  `;
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
    .map(post => {

      const product =
        post.product || {};

      const store =
        post.store || {};

      const image =
        product.image ||
        ASSETS.logo;

      return `
        <button
          type="button"
          class="search-product-result"
          data-action="search-post"
          data-post-id="${escapeHTML(post.id)}"
        >

          <div class="search-product-thumb">

            <img
              src="${escapeHTML(image)}"
              alt="${escapeHTML(
                product.name ||
                'Produk UMKM'
              )}"
              loading="lazy"
              decoding="async"
            >

          </div>


          <div class="search-product-copy">

            <strong class="search-product-name">
              ${escapeHTML(
                product.name ||
                'Produk UMKM'
              )}
            </strong>


            <span class="search-product-store">
              ${escapeHTML(
                store.name ||
                'UMKM Lokal'
              )}
            </span>


            <span class="search-product-price">
              ${formatRupiah(
                product.price || 0
              )}
            </span>

          </div>


          <i
            class="ph ph-caret-right search-product-arrow"
            aria-hidden="true"
          ></i>

        </button>
      `;
    })
    .join('');


  DOM.searchResults.innerHTML = `
  ${
    categoryHTML
      ? `
          <section class="search-result-group">

            <div class="search-result-group-head">

              <span>
                Kategori
              </span>

              <small>
                ${matchedCategories.length}
              </small>

            </div>

            <div class="search-result-group-list">
              ${categoryHTML}
            </div>

          </section>
        `
      : ''
  }


  ${
    postHTML
      ? `
          <section class="search-result-group">

            <div class="search-result-group-head">

              <span>
                Produk
              </span>

              <small>
                ${matchedPosts.length}
              </small>

            </div>

            <div class="search-result-group-list">
              ${postHTML}
            </div>

          </section>
        `
      : ''
  }
`;
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
   if (!STATE.user) {
  showToast(
    'Masuk terlebih dahulu untuk melihat notifikasi.'
  );

  openLogin();

  return;
}
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
function openSellerMessage(
  storeId
) {
  const store =
    getStores().find(
      item =>
        String(item.id) ===
        String(storeId)
    );


  if (!store) {
    showToast(
      'UMKM tidak ditemukan.'
    );

    return;
  }


  if (!STATE.user) {
    showToast(
      'Masuk terlebih dahulu untuk mengirim pesan.'
    );

    openLogin();

    return;
  }


  openBottomSheet(
    `
      <h2 id="sheetTitle">
        Pesan ${escapeHTML(
          store.name ||
          'UMKM'
        )}
      </h2>

      <section class="empty-state">

        <i
          class="ph ph-chat-circle"
          aria-hidden="true"
        ></i>

        <strong class="empty-state-title">
          Percakapan segera tersedia
        </strong>

        <p class="empty-state-text">
          Fitur chat langsung antara pembeli
          dan UMKM sedang disiapkan.
        </p>

      </section>
    `,
    'seller-message'
  );
}

function openMessages() {
   if (!STATE.user) {
  showToast(
    'Masuk terlebih dahulu untuk melihat pesan.'
  );

  openLogin();

  return;
}
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

  /*
   * Kalau bottom sheet sudah terbuka,
   * jangan lock scroll untuk kedua kalinya.
   */
  const alreadyOpen =
    DOM.bottomSheet.hidden === false &&
    STATE.activeSheet !== null;

  DOM.sheetContent.innerHTML =
    html;

  DOM.sheetOverlay.hidden =
    false;

  DOM.bottomSheet.hidden =
    false;

  STATE.activeSheet =
    type;

  /*
   * Lock body hanya saat pertama kali
   * bottom sheet dibuka.
   */
  if (!alreadyOpen) {
    lockBodyScroll();
  }

  requestAnimationFrame(() => {
    DOM.sheetOverlay.classList.add(
      'show'
    );

    DOM.bottomSheet.classList.add(
      'show'
    );
  });
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

  STATE.activeSheet =
    null;

  window.setTimeout(() => {
    DOM.sheetOverlay.hidden =
      true;

    DOM.bottomSheet.hidden =
      true;

    if (DOM.sheetContent) {
      DOM.sheetContent.innerHTML =
        '';
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
