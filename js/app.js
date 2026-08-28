/* =========================================================
   PASAR UMKM — APP.JS v4.0
   Social Marketplace Frontend Engine

   HIPMI PT UIN Al Azhaar Lubuklinggau
   Founder & Product Initiator: Capryan Agusto
   ========================================================= */

'use strict';


/* =========================================================
   01. CONFIG
   ========================================================= */

const CONFIG = {

  /*
   * DEVELOPMENT ONLY
   *
   * true  = data contoh tampil.
   * false = data contoh hilang.
   *
   * Saat backend sudah aktif:
   * ubah menjadi false.
   */
  DEMO_MODE: true,

  APP_NAME:
    'Pasar UMKM',

  LOCATION:
    'Lubuklinggau',

  ORGANIZATION:
    'HIPMI PT UIN Al Azhaar Lubuklinggau',

  UNIVERSITY:
    'Universitas Islam Nusantara Al-Azhaar Lubuklinggau',

  INITIATOR:
    'Capryan Agusto',

  STORAGE_KEY:
    'pasarUmkmStateV4',

  INTRO_SESSION_KEY:
    'pasarUmkmIntroSeen',

  INTRO_HOLD:
    1750,

  INTRO_EXIT:
    430
};


/* =========================================================
   02. ASSET PATHS
   ========================================================= */

const ASSETS = {

  appLogo:
    'assets/logo.png',

  hipmiLogo:
    'assets/branding/logo-hipmi-pt.png',

  universityLogo:
    'assets/branding/logo-uin-alazhaar.png'
};


/* =========================================================
   03. DEMO DATA
   ========================================================= */

const DEMO_DATA = {

  stories: [

    {
      id: 1,
      name: 'Pak Madi',
      image: 'assets/umkm1.jpg',
      hasUpdate: true,
      live: true
    },

    {
      id: 2,
      name: 'Ibu Siti',
      image: 'assets/umkm2.jpg',
      hasUpdate: true,
      live: false
    },

    {
      id: 3,
      name: 'Madi Craft',
      image: 'assets/umkm3.jpg',
      hasUpdate: false,
      live: false
    },

    {
      id: 4,
      name: 'Maepi Art',
      image: 'assets/1.jpg',
      hasUpdate: true,
      live: false
    },

    {
      id: 5,
      name: 'Pak Sili',
      image: 'assets/2.jpg',
      hasUpdate: false,
      live: false
    }
  ],


  posts: [

    {
      id: 1,

      author:
        'Pak Madi',

      avatar:
        'assets/umkm1.jpg',

      verified:
        true,

      category:
        'Kuliner',

      location:
        'Lubuklinggau',

      time:
        '2 jam lalu',

      media:
        'assets/umkm1.jpg',

      mediaType:
        'image',

      likes:
        128,

      comments:
        23,

      shares:
        12,

      caption:
        'Panen kopi terbaru dari kebun lokal Lubuklinggau. Tersedia dalam kemasan 250 gram.',

      tags: [
        '#KopiLokal',
        '#UMKMLubuklinggau'
      ],

      product: {

        id:
          101,

        name:
          'Kopi Robusta Premium 250g',

        image:
          'assets/umkm1.jpg',

        rating:
          4.9,

        sold:
          1200,

        price:
          25000,

        originalPrice:
          30000
      }
    },


    {
      id: 2,

      author:
        'Ibu Siti',

      avatar:
        'assets/umkm2.jpg',

      verified:
        true,

      category:
        'Kerajinan',

      location:
        'Lubuklinggau',

      time:
        '5 jam lalu',

      media:
        'assets/umkm2.jpg',

      mediaType:
        'video',

      likes:
        89,

      comments:
        15,

      shares:
        8,

      caption:
        'Tas anyaman dibuat secara manual oleh pengrajin lokal. Setiap produk memiliki detail yang sedikit berbeda.',

      tags: [
        '#KerajinanLokal',
        '#ProdukUMKM'
      ],

      product: {

        id:
          102,

        name:
          'Tas Anyaman Purun',

        image:
          'assets/umkm2.jpg',

        rating:
          5,

        sold:
          500,

        price:
          75000,

        originalPrice:
          null
      }
    },


    {
      id: 3,

      author:
        'Madi Craft',

      avatar:
        'assets/umkm3.jpg',

      verified:
        false,

      category:
        'Fashion',

      location:
        'Sumatera Selatan',

      time:
        '1 hari lalu',

      media:
        'assets/umkm3.jpg',

      mediaType:
        'image',

      likes:
        67,

      comments:
        9,

      shares:
        4,

      caption:
        'Produk handmade lokal dengan produksi terbatas.',

      tags: [
        '#Handmade',
        '#ProdukLokal'
      ],

      product: {

        id:
          103,

        name:
          'Produk Handmade Lokal',

        image:
          'assets/umkm3.jpg',

        rating:
          4.8,

        sold:
          320,

        price:
          50000,

        originalPrice:
          65000
      }
    }
  ],


  notifications: [

    {
      id:
        1,

      icon:
        'ph-heart',

      title:
        'Postingan mendapat interaksi baru',

      time:
        '5 menit lalu',

      unread:
        true
    },

    {
      id:
        2,

      icon:
        'ph-shopping-bag',

      title:
        'Produk baru tersedia',

      time:
        '30 menit lalu',

      unread:
        true
    },

    {
      id:
        3,

      icon:
        'ph-storefront',

      title:
        'UMKM baru bergabung',

      time:
        '1 jam lalu',

      unread:
        true
    }
  ],


  messages: [

    {
      id:
        1,

      name:
        'Pak Madi',

      text:
        'Kopi masih tersedia.',

      time:
        '2 menit lalu',

      unread:
        true
    },

    {
      id:
        2,

      name:
        'Ibu Siti',

      text:
        'Terima kasih sudah menghubungi toko kami.',

      time:
        '25 menit lalu',

      unread:
        true
    }
  ]
};


/* =========================================================
   04. LIVE DATA
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
      : []
};


/* =========================================================
   05. STATE
   ========================================================= */

const STATE = {

  likedPosts:
    new Set(),

  savedPosts:
    new Set(),

  cart:
    [],

  orders:
    [],

  activeNav:
    'home',

  activeCategory:
    null,

  searchQuery:
    ''
};


/* =========================================================
   06. DOM CACHE
   ========================================================= */

const DOM = {};


function cacheDOM() {

  DOM.app =
    document.getElementById('app');


  DOM.splashIntro =
    document.getElementById('splashIntro');


  DOM.header =
    document.getElementById('header');


  DOM.stories =
    document.getElementById('stories');

  DOM.feed =
    document.getElementById('feed');


  DOM.menuButton =
    document.getElementById('menuButton');

  DOM.closeMenuButton =
    document.getElementById('closeMenuButton');

  DOM.sideMenu =
    document.getElementById('sideMenu');

  DOM.sideMenuContent =
    document.getElementById('sideMenuContent');


  DOM.searchButton =
    document.getElementById('searchButton');

  DOM.closeSearchButton =
    document.getElementById('closeSearchButton');

  DOM.searchOverlay =
    document.getElementById('searchOverlay');

  DOM.searchInput =
    document.getElementById('searchInput');

  DOM.searchClearButton =
    document.getElementById('searchClearButton');

  DOM.searchResults =
    document.getElementById('searchResults');


  DOM.notificationButton =
    document.getElementById('notificationButton');

  DOM.messageButton =
    document.getElementById('messageButton');


  DOM.appNavigation =
    document.getElementById('appNavigation');


  DOM.toast =
    document.getElementById('toast');


  DOM.sheetOverlay =
    document.getElementById('sheetOverlay');

  DOM.bottomSheet =
    document.getElementById('bottomSheet');

  DOM.sheetContent =
    document.getElementById('sheetContent');


  DOM.appLoading =
    document.getElementById('appLoading');
}


/* =========================================================
   07. INITIALIZATION
   ========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  init
);


function init() {

  cacheDOM();

  restoreState();

  setupSplashIntro();

  renderStories();

  renderFeed();

  renderSideMenu();

  bindEvents();

  updateCartBadge();

  updateHeaderBadges();

  renderSearchHint();

  hideLoading();

  handleScroll();
}


/* =========================================================
   08. SPLASH INTRO
   ========================================================= */

function setupSplashIntro() {

  if (!DOM.splashIntro) {
    return;
  }


  const prefersReducedMotion =
    window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;


  let alreadySeen = false;


  try {

    alreadySeen =
      sessionStorage.getItem(
        CONFIG.INTRO_SESSION_KEY
      ) === 'true';

  } catch (error) {

    /*
     * Browser tertentu bisa memblokir sessionStorage.
     * Intro tetap bekerja tanpa membuat aplikasi rusak.
     */
    alreadySeen = false;
  }


  if (alreadySeen) {

    removeSplashImmediately();

    return;
  }


  if (prefersReducedMotion) {

    finishSplashIntro(300);

    return;
  }


  window.setTimeout(
    () => {

      DOM.splashIntro
        ?.classList
        .add('is-exiting');


      window.setTimeout(
        completeSplashIntro,
        CONFIG.INTRO_EXIT
      );

    },
    CONFIG.INTRO_HOLD
  );
}


/* =========================================================
   09. SPLASH HELPERS
   ========================================================= */

function finishSplashIntro(delay = 0) {

  window.setTimeout(
    () => {

      DOM.splashIntro
        ?.classList
        .add('is-exiting');


      window.setTimeout(
        completeSplashIntro,
        CONFIG.INTRO_EXIT
      );

    },
    delay
  );
}


function completeSplashIntro() {

  if (!DOM.splashIntro) {
    return;
  }


  try {

    sessionStorage.setItem(
      CONFIG.INTRO_SESSION_KEY,
      'true'
    );

  } catch (error) {
    // Tidak perlu menghentikan aplikasi.
  }


  DOM.splashIntro
    .classList
    .add('is-hidden');


  DOM.splashIntro.hidden =
    true;
}


function removeSplashImmediately() {

  if (!DOM.splashIntro) {
    return;
  }


  DOM.splashIntro
    .classList
    .add('is-hidden');


  DOM.splashIntro.hidden =
    true;
}


/* =========================================================
   10. STORIES
   ========================================================= */

function renderStories() {

  if (!DOM.stories) {
    return;
  }


  const addStory = `
    <button
      type="button"
      class="story-item story-add"
      data-story-action="add"
      aria-label="Tambah cerita"
    >

      <div class="story-ring">

        <i
          class="ph ph-plus"
          aria-hidden="true"
        ></i>

      </div>

      <span class="story-name">
        Jual
      </span>

    </button>
  `;


  if (!DATA.stories.length) {

    DOM.stories.innerHTML =
      addStory;

    return;
  }


  DOM.stories.innerHTML =
    addStory +
    DATA.stories
      .map(createStoryTemplate)
      .join('');
}


/* =========================================================
   11. STORY TEMPLATE
   ========================================================= */

function createStoryTemplate(story) {

  return `
    <button
      type="button"
      class="
        story-item
        ${story.hasUpdate ? 'has-update' : ''}
        ${story.live ? 'live' : ''}
      "
      data-story-id="${story.id}"
      aria-label="Lihat cerita ${escapeHTML(story.name)}"
    >

      <div class="story-ring">

        <img
          src="${escapeHTML(story.image)}"
          alt="${escapeHTML(story.name)}"
          class="story-avatar"
          loading="lazy"
          decoding="async"
        >

      </div>

      <span class="story-name">
        ${escapeHTML(story.name)}
      </span>

    </button>
  `;
}


/* =========================================================
   12. FEED
   ========================================================= */

function renderFeed(
  posts = DATA.posts
) {

  if (!DOM.feed) {
    return;
  }


  if (!posts.length) {

    renderEmptyFeed();

    return;
  }


  DOM.feed.innerHTML =
    posts
      .map(createPostTemplate)
      .join('');
}


/* =========================================================
   13. EMPTY FEED
   ========================================================= */

function renderEmptyFeed() {

  if (!DOM.feed) {
    return;
  }


  const title =
    STATE.activeCategory
      ? `Belum ada produk ${STATE.activeCategory}`
      : 'Belum ada postingan';


  const description =
    CONFIG.DEMO_MODE
      ? 'Belum ditemukan produk pada pilihan ini.'
      : 'UMKM yang mulai membagikan produk akan muncul di sini.';


  DOM.feed.innerHTML = `
    <div class="empty-state">

      <i
        class="ph ph-storefront"
        aria-hidden="true"
      ></i>

      <div class="empty-state-title">
        ${escapeHTML(title)}
      </div>

      <div class="empty-state-text">
        ${escapeHTML(description)}
      </div>

      <button
        type="button"
        class="btn-primary"
        data-action="sell"
        style="
          margin-top:16px;
          padding:10px 18px;
        "
      >
        Mulai Jual
      </button>

    </div>
  `;
}


/* =========================================================
   14. POST TEMPLATE
   ========================================================= */

function createPostTemplate(post) {

  const liked =
    STATE.likedPosts.has(
      post.id
    );


  const saved =
    STATE.savedPosts.has(
      post.id
    );


  const currentLikes =
    Number(post.likes || 0) +
    (liked ? 1 : 0);


  return `
    <article
      class="post-card"
      id="post-${post.id}"
      data-post-id="${post.id}"
    >

      <div class="post-header">

        <img
          src="${escapeHTML(post.avatar)}"
          alt="${escapeHTML(post.author)}"
          class="post-avatar"
          loading="lazy"
          decoding="async"
        >


        <div class="post-meta">

          <div class="post-author">

            ${escapeHTML(post.author)}

            ${
              post.verified
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
              ${escapeHTML(post.location)}
            </span>

            <span class="dot"></span>

            <span>
              ${escapeHTML(post.time)}
            </span>

          </div>

        </div>


        <button
          type="button"
          class="post-menu"
          data-action="post-menu"
          data-post-id="${post.id}"
          aria-label="Menu postingan"
        >

          <i
            class="ph ph-dots-three"
            aria-hidden="true"
          ></i>

        </button>

      </div>


      ${createPostMedia(post)}


      <div class="post-actions">

        <div class="actions-left">

          <button
            type="button"
            class="action-btn ${liked ? 'liked' : ''}"
            data-action="like"
            data-post-id="${post.id}"
            aria-pressed="${liked}"
            aria-label="Sukai postingan"
          >

            <i
              class="${liked ? 'ph-fill' : 'ph'} ph-heart"
              aria-hidden="true"
            ></i>

            <span>
              ${formatCompact(currentLikes)}
            </span>

          </button>


          <button
            type="button"
            class="action-btn"
            data-action="comments"
            data-post-id="${post.id}"
            aria-label="Lihat komentar"
          >

            <i
              class="ph ph-chat-circle"
              aria-hidden="true"
            ></i>

            <span>
              ${formatCompact(post.comments)}
            </span>

          </button>


          <button
            type="button"
            class="action-btn"
            data-action="share"
            data-post-id="${post.id}"
            aria-label="Bagikan postingan"
          >

            <i
              class="ph ph-paper-plane-tilt"
              aria-hidden="true"
            ></i>

            <span>
              ${formatCompact(post.shares)}
            </span>

          </button>

        </div>


        <button
          type="button"
          class="action-btn ${saved ? 'saved' : ''}"
          data-action="save"
          data-post-id="${post.id}"
          aria-label="Simpan postingan"
          aria-pressed="${saved}"
        >

          <i
            class="${saved ? 'ph-fill' : 'ph'} ph-bookmark-simple"
            aria-hidden="true"
          ></i>

        </button>

      </div>


      <div class="post-stats">
        ${formatCompact(currentLikes)} suka
      </div>


      <div class="post-caption">

        <span class="author">
          ${escapeHTML(post.author)}
        </span>

        ${escapeHTML(post.caption)}

        ${
          Array.isArray(post.tags) &&
          post.tags.length
            ? `
              <br>

              ${post.tags
                .map(
                  tag => `
                    <span class="tag">
                      ${escapeHTML(tag)}
                    </span>
                  `
                )
                .join(' ')
              }
            `
            : ''
        }

      </div>


      ${
        Number(post.comments) > 0
          ? `
            <button
              type="button"
              class="view-comments"
              data-action="comments"
              data-post-id="${post.id}"
            >
              Lihat ${formatCompact(post.comments)} komentar
            </button>
          `
          : ''
      }


      <div class="post-time">
        ${escapeHTML(post.time)}
      </div>


      ${createProductTemplate(post)}

    </article>
  `;
}


/* =========================================================
   15. POST MEDIA
   ========================================================= */

function createPostMedia(post) {

  const isVideo =
    post.mediaType === 'video';


  return `
    <div
      class="post-media ${isVideo ? 'video' : 'square'}"
    >

      <img
        src="${escapeHTML(post.media)}"
        alt="${escapeHTML(post.caption)}"
        loading="lazy"
        decoding="async"
      >

      ${
        isVideo
          ? `
            <span class="video-indicator">

              <i
                class="ph-fill ph-video"
                aria-hidden="true"
              ></i>

              VIDEO

            </span>

            <button
              type="button"
              class="play-button"
              data-action="play-video"
              data-post-id="${post.id}"
              aria-label="Putar video"
            ></button>
          `
          : ''
      }

    </div>
  `;
}


/* =========================================================
   16. PRODUCT TEMPLATE
   ========================================================= */

function createProductTemplate(post) {

  const product =
    post.product;


  if (!product) {
    return '';
  }


  return `
    <div class="product-card">

      <img
        src="${escapeHTML(product.image)}"
        alt="${escapeHTML(product.name)}"
        class="product-img"
        loading="lazy"
        decoding="async"
      >


      <div class="product-info">

        <div class="product-badge">

          <i
            class="ph-fill ph-storefront"
            aria-hidden="true"
          ></i>

          Produk UMKM

        </div>


        <div class="product-name">
          ${escapeHTML(product.name)}
        </div>


        <div class="product-meta">

          <span class="stars">
            ★ ${escapeHTML(product.rating)}
          </span>

          <span>
            •
          </span>

          <span>
            ${formatCompact(product.sold)} terjual
          </span>

        </div>


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
          data-action="cart"
          data-product-id="${product.id}"
          aria-label="Tambahkan ke keranjang"
        >

          <i
            class="ph ph-shopping-cart"
            aria-hidden="true"
          ></i>

        </button>


        <button
          type="button"
          class="btn-primary"
          data-action="buy"
          data-product-id="${product.id}"
        >
          Beli
        </button>

      </div>

    </div>
  `;
}


/* =========================================================
   17. GLOBAL DATA-ACTION HANDLER
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const target =
      event.target.closest(
        '[data-action]'
      );


    if (!target) {
      return;
    }


    const action =
      target.dataset.action;


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
          Number(
            target.dataset.postId
          )
        );

        break;


      case 'comments':

        openComments(
          Number(
            target.dataset.postId
          )
        );

        break;


      case 'share':

        sharePost(
          Number(
            target.dataset.postId
          )
        );

        break;


      case 'save':

        toggleSave(
          Number(
            target.dataset.postId
          )
        );

        break;


      case 'post-menu':

        openPostMenu(
          Number(
            target.dataset.postId
          )
        );

        break;


      case 'play-video':

        playDemoVideo();

        break;


      case 'cart':

        addProductToCart(
          Number(
            target.dataset.productId
          )
        );

        break;


      case 'buy':

        buyProduct(
          Number(
            target.dataset.productId
          )
        );

        break;


      case 'sell':

        openSellSheet();

        break;


      case 'checkout':

        checkoutCart();

        break;


      case 'clear-cart':

        clearCart();

        break;


      case 'remove-cart':

        removeCartItem(
          Number(
            target.dataset.productId
          )
        );

        break;


      case 'cart-plus':

        changeCartQuantity(
          Number(
            target.dataset.productId
          ),
          1
        );

        break;


      case 'cart-minus':

        changeCartQuantity(
          Number(
            target.dataset.productId
          ),
          -1
        );

        break;


      case 'login':

        openLogin();

        break;


      case 'clear-category':

        clearCategoryFilter();

        break;


      default:

        break;
    }
  }
);


/* =========================================================
   18. STORY EVENTS
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const story =
      event.target.closest(
        '[data-story-id]'
      );


    if (story) {

      openStory(
        Number(
          story.dataset.storyId
        )
      );

      return;
    }


    const addStory =
      event.target.closest(
        '[data-story-action="add"]'
      );


    if (addStory) {

      openSellSheet();
    }
  }
);


/* =========================================================
   19. LIKE
   ========================================================= */

function toggleLike(postId) {

  if (!findPost(postId)) {
    return;
  }


  if (
    STATE.likedPosts.has(postId)
  ) {

    STATE.likedPosts.delete(
      postId
    );

  } else {

    STATE.likedPosts.add(
      postId
    );
  }


  saveState();

  refreshCurrentFeed();
}


/* =========================================================
   20. SAVE
   ========================================================= */

function toggleSave(postId) {

  if (!findPost(postId)) {
    return;
  }


  if (
    STATE.savedPosts.has(postId)
  ) {

    STATE.savedPosts.delete(
      postId
    );

    showToast(
      'Dihapus dari favorit'
    );

  } else {

    STATE.savedPosts.add(
      postId
    );

    showToast(
      'Disimpan ke favorit'
    );
  }


  saveState();

  refreshCurrentFeed();
}


/* =========================================================
   21. COMMENTS
   ========================================================= */

function openComments(postId) {

  const post =
    findPost(postId);


  if (!post) {
    return;
  }


  const comments =
    CONFIG.DEMO_MODE
      ? [
          {
            name:
              'Pengguna Lokal',

            text:
              'Produknya menarik.'
          },

          {
            name:
              'Pembeli UMKM',

            text:
              'Semoga UMKM lokal terus berkembang.'
          }
        ]
      : [];


  const content =
    comments.length
      ? comments
          .map(
            comment => `
              <div
                style="
                  padding:12px 0;
                  border-bottom:1px solid var(--border-subtle);
                "
              >

                <strong
                  style="
                    font-size:12px;
                  "
                >
                  ${escapeHTML(comment.name)}
                </strong>

                <p
                  style="
                    margin-top:4px;
                    font-size:11px;
                    line-height:1.55;
                    color:var(--text-secondary);
                  "
                >
                  ${escapeHTML(comment.text)}
                </p>

              </div>
            `
          )
          .join('')

      : createSheetEmptyState(
          'ph-chat-circle',
          'Belum ada komentar',
          'Komentar pertama akan muncul di sini.'
        );


  openBottomSheet(`
    <h2 id="sheetTitle">
      Komentar
    </h2>

    <div style="margin-top:14px">
      ${content}
    </div>
  `);
}


/* =========================================================
   22. SHARE
   ========================================================= */

async function sharePost(postId) {

  const post =
    findPost(postId);


  if (!post) {
    return;
  }


  const url =
    `${window.location.origin}${window.location.pathname}#post-${post.id}`;


  const shareData = {

    title:
      `${post.author} · ${CONFIG.APP_NAME}`,

    text:
      post.caption,

    url
  };


  try {

    if (navigator.share) {

      await navigator.share(
        shareData
      );

      return;
    }


    if (navigator.clipboard) {

      await navigator.clipboard.writeText(
        url
      );

      showToast(
        'Link postingan disalin'
      );

      return;
    }


    showToast(
      'Fitur berbagi tidak tersedia'
    );

  } catch (error) {

    if (
      error.name !== 'AbortError'
    ) {

      showToast(
        'Postingan tidak dapat dibagikan'
      );
    }
  }
}


/* =========================================================
   23. POST MENU
   ========================================================= */

function openPostMenu(postId) {

  const post =
    findPost(postId);


  if (!post) {
    return;
  }


  const saved =
    STATE.savedPosts.has(
      postId
    );


  openBottomSheet(`
    <h2 id="sheetTitle">
      ${escapeHTML(post.author)}
    </h2>

    <div
      style="
        display:grid;
        gap:8px;
        margin-top:18px;
      "
    >

      <button
        type="button"
        class="menu-sheet-btn"
        data-post-sheet-action="save"
        data-post-id="${post.id}"
      >

        <i
          class="ph ph-bookmark-simple"
          aria-hidden="true"
        ></i>

        ${
          saved
            ? 'Hapus dari Favorit'
            : 'Simpan Postingan'
        }

      </button>


      <button
        type="button"
        class="menu-sheet-btn"
        data-post-sheet-action="hide"
        data-post-id="${post.id}"
      >

        <i
          class="ph ph-eye-slash"
          aria-hidden="true"
        ></i>

        Tidak Tertarik

      </button>


      <button
        type="button"
        class="menu-sheet-btn"
        data-post-sheet-action="report"
        data-post-id="${post.id}"
      >

        <i
          class="ph ph-flag"
          aria-hidden="true"
        ></i>

        Laporkan

      </button>

    </div>
  `);
}


/* =========================================================
   24. POST SHEET ACTION
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const button =
      event.target.closest(
        '[data-post-sheet-action]'
      );


    if (!button) {
      return;
    }


    const action =
      button.dataset.postSheetAction;


    const postId =
      Number(
        button.dataset.postId
      );


    switch (action) {

      case 'save':

        toggleSave(
          postId
        );

        closeBottomSheet();

        break;


      case 'hide':

        closeBottomSheet();

        showToast(
          'Preferensi feed diperbarui'
        );

        break;


      case 'report':

        closeBottomSheet();

        showToast(
          'Laporan diterima'
        );

        break;
    }
  }
);


/* =========================================================
   25. VIDEO PLACEHOLDER
   ========================================================= */

function playDemoVideo() {

  showToast(
    CONFIG.DEMO_MODE
      ? 'Video masih berupa contoh tampilan'
      : 'Video belum tersedia'
  );
}


/* =========================================================
   26. FIND POST
   ========================================================= */

function findPost(postId) {

  return (
    DATA.posts.find(
      post =>
        post.id === postId
    ) ||
    null
  );
}


/* =========================================================
   27. FIND PRODUCT
   ========================================================= */

function findProduct(productId) {

  for (
    const post of DATA.posts
  ) {

    if (
      post.product &&
      post.product.id === productId
    ) {

      return {

        ...post.product,

        seller:
          post.author
      };
    }
  }


  return null;
}


/* =========================================================
   28. ADD TO CART
   ========================================================= */

function addProductToCart(
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
        item.id === product.id
    );


  if (existing) {

    existing.quantity += 1;

  } else {

    STATE.cart.push({

      ...product,

      quantity:
        1
    });
  }


  saveState();

  updateCartBadge();


  showToast(
    `${product.name} ditambahkan ke keranjang`
  );
}


/* =========================================================
   29. CART QUANTITY
   ========================================================= */

function changeCartQuantity(
  productId,
  difference
) {

  const item =
    STATE.cart.find(
      product =>
        product.id === productId
    );


  if (!item) {
    return;
  }


  item.quantity +=
    difference;


  if (
    item.quantity <= 0
  ) {

    STATE.cart =
      STATE.cart.filter(
        product =>
          product.id !== productId
      );
  }


  saveState();

  updateCartBadge();

  openCart();
}


/* =========================================================
   30. REMOVE CART ITEM
   ========================================================= */

function removeCartItem(
  productId
) {

  STATE.cart =
    STATE.cart.filter(
      item =>
        item.id !== productId
    );


  saveState();

  updateCartBadge();

  openCart();


  showToast(
    'Produk dihapus dari keranjang'
  );
}


/* =========================================================
   31. CLEAR CART
   ========================================================= */

function clearCart() {

  STATE.cart = [];


  saveState();

  updateCartBadge();

  openCart();


  showToast(
    'Keranjang dikosongkan'
  );
}


/* =========================================================
   32. BUY NOW
   ========================================================= */

function buyProduct(
  productId
) {

  const product =
    findProduct(productId);


  if (!product) {
    return;
  }


  openBottomSheet(`
    <h2 id="sheetTitle">
      Beli Produk
    </h2>


    <div
      style="
        display:flex;
        align-items:center;
        gap:12px;
        margin-top:18px;
      "
    >

      <img
        src="${escapeHTML(product.image)}"
        alt="${escapeHTML(product.name)}"
        style="
          width:72px;
          height:72px;
          object-fit:cover;
          border-radius:12px 6px 12px 6px;
        "
      >


      <div
        style="
          min-width:0;
          flex:1;
        "
      >

        <strong
          style="
            display:block;
            font-size:13px;
            line-height:1.4;
          "
        >
          ${escapeHTML(product.name)}
        </strong>


        <small
          style="
            display:block;
            margin-top:4px;
            color:var(--text-tertiary);
          "
        >
          ${escapeHTML(product.seller)}
        </small>


        <div
          style="
            margin-top:7px;
            font-size:15px;
            font-weight:700;
            color:var(--sunset-600);
          "
        >
          ${formatRupiah(product.price)}
        </div>

      </div>

    </div>


    <button
      type="button"
      class="btn-primary"
      id="buyNowContinue"
      style="
        width:100%;
        margin-top:22px;
        padding:12px;
      "
    >
      Lanjutkan
    </button>
  `);


  document
    .getElementById(
      'buyNowContinue'
    )
    ?.addEventListener(
      'click',
      () => {

        addProductToCart(
          productId
        );

        closeBottomSheet();


        window.setTimeout(
          openCart,
          420
        );
      }
    );
}


/* =========================================================
   33. OPEN CART
   ========================================================= */

function openCart() {

  if (
    !STATE.cart.length
  ) {

    openBottomSheet(`
      <h2 id="sheetTitle">
        Keranjang
      </h2>

      ${createSheetEmptyState(
        'ph-shopping-cart',
        'Keranjang masih kosong',
        'Produk yang ditambahkan akan muncul di sini.'
      )}
    `);

    return;
  }


  const items =
    STATE.cart
      .map(
        createCartItemTemplate
      )
      .join('');


  const total =
    STATE.cart.reduce(
      (
        sum,
        item
      ) =>
        sum +
        Number(item.price) *
        Number(item.quantity),
      0
    );


  openBottomSheet(`
    <div
      style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
      "
    >

      <h2 id="sheetTitle">
        Keranjang
      </h2>

      <button
        type="button"
        data-action="clear-cart"
        style="
          font-size:10px;
          font-weight:700;
          color:var(--sunset-600);
        "
      >
        Kosongkan
      </button>

    </div>


    <div style="margin-top:12px">
      ${items}
    </div>


    <div
      style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        margin-top:18px;
        padding-top:14px;
        border-top:1px solid var(--border-soft);
      "
    >

      <span
        style="
          font-size:11px;
          color:var(--text-secondary);
        "
      >
        Total
      </span>


      <strong
        style="
          font-size:17px;
          color:var(--sunset-600);
        "
      >
        ${formatRupiah(total)}
      </strong>

    </div>


    <button
      type="button"
      class="btn-primary"
      data-action="checkout"
      style="
        width:100%;
        margin-top:16px;
        padding:13px;
      "
    >
      Checkout
    </button>
  `);
}


/* =========================================================
   34. CART ITEM TEMPLATE
   ========================================================= */

function createCartItemTemplate(
  item
) {

  return `
    <div
      style="
        display:flex;
        gap:10px;
        padding:12px 0;
        border-bottom:1px solid var(--border-subtle);
      "
    >

      <img
        src="${escapeHTML(item.image)}"
        alt="${escapeHTML(item.name)}"
        style="
          width:62px;
          height:62px;
          object-fit:cover;
          border-radius:10px 5px 10px 5px;
        "
      >


      <div
        style="
          flex:1;
          min-width:0;
        "
      >

        <strong
          style="
            display:block;
            font-size:11px;
            line-height:1.45;
          "
        >
          ${escapeHTML(item.name)}
        </strong>


        <small
          style="
            display:block;
            margin-top:2px;
            color:var(--text-tertiary);
          "
        >
          ${escapeHTML(
            item.seller ||
            'UMKM Lokal'
          )}
        </small>


        <div
          style="
            margin-top:5px;
            font-size:13px;
            font-weight:700;
            color:var(--sunset-600);
          "
        >
          ${formatRupiah(
            item.price *
            item.quantity
          )}
        </div>


        <div
          style="
            display:flex;
            align-items:center;
            gap:8px;
            margin-top:8px;
          "
        >

          <button
            type="button"
            data-action="cart-minus"
            data-product-id="${item.id}"
            aria-label="Kurangi jumlah"
            style="
              width:28px;
              height:28px;
              border-radius:8px 4px 8px 4px;
              background:var(--forest-50);
            "
          >

            <i
              class="ph ph-minus"
              aria-hidden="true"
            ></i>

          </button>


          <strong
            style="
              min-width:18px;
              text-align:center;
              font-size:11px;
            "
          >
            ${item.quantity}
          </strong>


          <button
            type="button"
            data-action="cart-plus"
            data-product-id="${item.id}"
            aria-label="Tambah jumlah"
            style="
              width:28px;
              height:28px;
              border-radius:8px 4px 8px 4px;
              background:var(--forest-50);
            "
          >

            <i
              class="ph ph-plus"
              aria-hidden="true"
            ></i>

          </button>


          <button
            type="button"
            data-action="remove-cart"
            data-product-id="${item.id}"
            style="
              margin-left:auto;
              font-size:10px;
              color:var(--sunset-600);
            "
          >
            Hapus
          </button>

        </div>

      </div>

    </div>
  `;
}


/* =========================================================
   35. CHECKOUT
   ========================================================= */

function checkoutCart() {

  if (!STATE.cart.length) {
    return;
  }


  openBottomSheet(`
    <h2 id="sheetTitle">
      Checkout
    </h2>


    <div
      style="
        margin-top:18px;
        padding:16px;
        border-radius:14px 7px 14px 7px;
        background:var(--forest-50);
      "
    >

      <i
        class="ph ph-map-pin"
        style="
          font-size:22px;
          color:var(--forest-700);
        "
        aria-hidden="true"
      ></i>

      <strong
        style="
          display:block;
          margin-top:8px;
          font-size:12px;
        "
      >
        Alamat Pengiriman
      </strong>

      <p
        style="
          margin-top:5px;
          font-size:10px;
          line-height:1.6;
          color:var(--text-secondary);
        "
      >
        Alamat pembeli akan diambil dari akun setelah sistem backend diaktifkan.
      </p>

    </div>


    <div
      style="
        margin-top:12px;
        padding:16px;
        border-radius:12px 6px 12px 6px;
        background:var(--bg-tertiary);
      "
    >

      <i
        class="ph ph-wallet"
        style="
          font-size:22px;
          color:var(--forest-700);
        "
        aria-hidden="true"
      ></i>

      <strong
        style="
          display:block;
          margin-top:8px;
          font-size:12px;
        "
      >
        Pembayaran
      </strong>

      <p
        style="
          margin-top:5px;
          font-size:10px;
          line-height:1.6;
          color:var(--text-secondary);
        "
      >
        Metode pembayaran belum diaktifkan pada prototype frontend.
      </p>

    </div>


    <button
      type="button"
      class="btn-primary"
      id="checkoutPrototypeButton"
      style="
        width:100%;
        margin-top:18px;
        padding:13px;
      "
    >
      Buat Pesanan
    </button>
  `);


  document
    .getElementById(
      'checkoutPrototypeButton'
    )
    ?.addEventListener(
      'click',
      () => {

        showToast(
          'Checkout akan aktif setelah backend terhubung'
        );
      }
    );
}


/* =========================================================
   36. SEARCH OPEN
   ========================================================= */

function openSearch() {

  if (!DOM.searchOverlay) {
    return;
  }


  DOM.searchOverlay.hidden =
    false;


  DOM.searchOverlay.setAttribute(
    'aria-hidden',
    'false'
  );


  lockBodyScroll();


  window.setTimeout(
    () => {

      DOM.searchInput
        ?.focus();

    },
    60
  );
}


/* =========================================================
   37. SEARCH CLOSE
   ========================================================= */

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


  unlockBodyScrollIfPossible();
}


/* =========================================================
   38. SEARCH
   ========================================================= */

function handleSearch(query) {

  const normalized =
    String(query)
      .trim()
      .toLowerCase();


  STATE.searchQuery =
    normalized;


  if (!DOM.searchResults) {
    return;
  }


  if (!normalized) {

    renderSearchHint();

    return;
  }


  const results =
    DATA.posts.filter(
      post => {

        const searchable = [

          post.author,

          post.category,

          post.location,

          post.caption,

          post.product?.name

        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();


        return searchable.includes(
          normalized
        );
      }
    );


  if (!results.length) {

    DOM.searchResults.innerHTML =
      createSheetEmptyState(
        'ph-magnifying-glass',
        'Tidak ditemukan',
        `Tidak ada hasil untuk "${query}".`
      );

    return;
  }


  DOM.searchResults.innerHTML =
    results
      .map(
        createSearchResultTemplate
      )
      .join('');
}


/* =========================================================
   39. SEARCH HINT
   ========================================================= */

function renderSearchHint() {

  if (!DOM.searchResults) {
    return;
  }


  DOM.searchResults.innerHTML = `
    <div
      style="
        padding:22px 4px;
      "
    >

      <strong
        style="
          display:block;
          font-family:var(--font-display);
          font-size:15px;
          color:var(--forest-900);
        "
      >
        Cari di Pasar UMKM
      </strong>

      <p
        style="
          margin-top:6px;
          max-width:260px;
          font-size:10px;
          line-height:1.6;
          color:var(--text-tertiary);
        "
      >
        Cari produk, nama UMKM, kategori, atau lokasi.
      </p>

    </div>
  `;
}


/* =========================================================
   40. SEARCH RESULT
   ========================================================= */

function createSearchResultTemplate(
  post
) {

  const product =
    post.product;


  return `
    <button
      type="button"
      data-search-result="${post.id}"
      style="
        width:100%;
        display:flex;
        align-items:center;
        gap:11px;
        padding:11px 0;
        text-align:left;
        border-bottom:1px solid var(--border-subtle);
      "
    >

      <img
        src="${escapeHTML(
          product?.image ||
          post.media
        )}"
        alt="${escapeHTML(
          product?.name ||
          post.author
        )}"
        style="
          width:54px;
          height:54px;
          object-fit:cover;
          border-radius:11px 5px 11px 5px;
        "
      >


      <span
        style="
          flex:1;
          min-width:0;
        "
      >

        <strong
          style="
            display:block;
            font-size:11px;
            line-height:1.4;
          "
        >
          ${escapeHTML(
            product?.name ||
            post.author
          )}
        </strong>

        <small
          style="
            display:block;
            margin-top:3px;
            color:var(--text-tertiary);
          "
        >
          ${escapeHTML(post.author)}
          ·
          ${escapeHTML(post.category)}
        </small>

        ${
          product
            ? `
              <span
                style="
                  display:block;
                  margin-top:4px;
                  font-size:12px;
                  font-weight:700;
                  color:var(--sunset-600);
                "
              >
                ${formatRupiah(product.price)}
              </span>
            `
            : ''
        }

      </span>

    </button>
  `;
}


/* =========================================================
   41. SEARCH RESULT CLICK
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const result =
      event.target.closest(
        '[data-search-result]'
      );


    if (!result) {
      return;
    }


    const postId =
      Number(
        result.dataset.searchResult
      );


    closeSearch();


    window.setTimeout(
      () => {

        scrollToPost(
          postId
        );

      },
      120
    );
  }
);


/* =========================================================
   42. SCROLL TO POST
   ========================================================= */

function scrollToPost(postId) {

  STATE.activeCategory =
    null;


  renderFeed();


  requestAnimationFrame(
    () => {

      const element =
        document.getElementById(
          `post-${postId}`
        );


      element?.scrollIntoView({

        behavior:
          'smooth',

        block:
          'center'
      });
    }
  );
}


/* =========================================================
   43. NOTIFICATIONS
   ========================================================= */

function openNotifications() {

  const items =
    DATA.notifications;


  const content =
    items.length
      ? items
          .map(
            createNotificationTemplate
          )
          .join('')

      : createSheetEmptyState(
          'ph-bell',
          'Belum ada notifikasi',
          'Aktivitas terbaru akan muncul di sini.'
        );


  openBottomSheet(`
    <h2 id="sheetTitle">
      Notifikasi
    </h2>

    <div style="margin-top:14px">
      ${content}
    </div>
  `);
}


/* =========================================================
   44. NOTIFICATION TEMPLATE
   ========================================================= */

function createNotificationTemplate(
  item
) {

  return `
    <div
      style="
        display:flex;
        gap:11px;
        padding:13px 0;
        border-bottom:1px solid var(--border-subtle);
      "
    >

      <div
        style="
          width:40px;
          height:40px;
          flex:0 0 40px;
          display:flex;
          align-items:center;
          justify-content:center;
          border-radius:13px 6px 13px 6px;
          background:var(--forest-50);
          color:var(--forest-700);
        "
      >

        <i
          class="ph ${escapeHTML(item.icon)}"
          style="font-size:19px"
          aria-hidden="true"
        ></i>

      </div>


      <div>

        <strong
          style="
            display:block;
            font-size:11px;
            line-height:1.45;
          "
        >
          ${escapeHTML(item.title)}
        </strong>

        <small
          style="
            display:block;
            margin-top:4px;
            color:var(--text-tertiary);
          "
        >
          ${escapeHTML(item.time)}
        </small>

      </div>

    </div>
  `;
}


/* =========================================================
   45. MESSAGES
   ========================================================= */

function openMessages() {

  const content =
    DATA.messages.length
      ? DATA.messages
          .map(
            createMessageTemplate
          )
          .join('')

      : createSheetEmptyState(
          'ph-chat-circle-text',
          'Belum ada pesan',
          'Percakapan dengan pembeli atau penjual akan muncul di sini.'
        );


  openBottomSheet(`
    <h2 id="sheetTitle">
      Pesan
    </h2>

    <div style="margin-top:14px">
      ${content}
    </div>
  `);
}


/* =========================================================
   46. MESSAGE TEMPLATE
   ========================================================= */

function createMessageTemplate(
  message
) {

  return `
    <button
      type="button"
      data-message-id="${message.id}"
      style="
        width:100%;
        display:flex;
        align-items:center;
        gap:11px;
        padding:13px 0;
        text-align:left;
        border-bottom:1px solid var(--border-subtle);
      "
    >

      <div
        style="
          width:42px;
          height:42px;
          flex:0 0 42px;
          display:flex;
          align-items:center;
          justify-content:center;
          border-radius:50%;
          background:var(--forest-100);
          color:var(--forest-700);
        "
      >

        <i
          class="ph ph-user"
          aria-hidden="true"
        ></i>

      </div>


      <div
        style="
          min-width:0;
          flex:1;
        "
      >

        <strong
          style="
            display:block;
            font-size:11px;
          "
        >
          ${escapeHTML(message.name)}
        </strong>

        <span
          style="
            display:block;
            margin-top:3px;
            overflow:hidden;
            white-space:nowrap;
            text-overflow:ellipsis;
            font-size:10px;
            color:var(--text-secondary);
          "
        >
          ${escapeHTML(message.text)}
        </span>

        <small
          style="
            display:block;
            margin-top:3px;
            color:var(--text-tertiary);
          "
        >
          ${escapeHTML(message.time)}
        </small>

      </div>

    </button>
  `;
}


/* =========================================================
   47. MESSAGE CLICK
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const button =
      event.target.closest(
        '[data-message-id]'
      );


    if (!button) {
      return;
    }


    const message =
      DATA.messages.find(
        item =>
          item.id ===
          Number(
            button.dataset.messageId
          )
      );


    if (!message) {
      return;
    }


    openBottomSheet(`
      <h2 id="sheetTitle">
        ${escapeHTML(message.name)}
      </h2>

      <div
        style="
          margin-top:18px;
          padding:13px;
          border-radius:13px 6px 13px 6px;
          background:var(--forest-50);
          font-size:11px;
          line-height:1.6;
        "
      >
        ${escapeHTML(message.text)}
      </div>

      <p
        style="
          margin-top:16px;
          text-align:center;
          font-size:9px;
          color:var(--text-tertiary);
        "
      >
        Chat langsung akan aktif setelah sistem akun dan backend tersedia.
      </p>
    `);
  }
);


/* =========================================================
   48. STORY VIEW
   ========================================================= */

function openStory(storyId) {

  const story =
    DATA.stories.find(
      item =>
        item.id === storyId
    );


  if (!story) {
    return;
  }


  openBottomSheet(`
    <div
      style="
        display:flex;
        align-items:center;
        gap:10px;
      "
    >

      <img
        src="${escapeHTML(story.image)}"
        alt="${escapeHTML(story.name)}"
        style="
          width:38px;
          height:38px;
          object-fit:cover;
          border-radius:50%;
        "
      >

      <h2 id="sheetTitle">
        ${escapeHTML(story.name)}
      </h2>

    </div>


    <img
      src="${escapeHTML(story.image)}"
      alt="${escapeHTML(story.name)}"
      style="
        width:100%;
        max-height:65vh;
        object-fit:cover;
        margin-top:14px;
        border-radius:16px 8px 16px 8px;
      "
    >
  `);
}


/* =========================================================
   49. SELL SHEET
   ========================================================= */

function openSellSheet() {

  openBottomSheet(`
    <h2 id="sheetTitle">
      Jual di Pasar UMKM
    </h2>

    <p
      style="
        margin-top:6px;
        font-size:10px;
        line-height:1.6;
        color:var(--text-tertiary);
      "
    >
      Pilih aktivitas yang ingin dibuat.
    </p>


    <div
      style="
        display:grid;
        gap:9px;
        margin-top:18px;
      "
    >

      ${createSellOption(
        'ph-package',
        'Tambah Produk',
        'product'
      )}

      ${createSellOption(
        'ph-camera',
        'Buat Postingan',
        'post'
      )}

      ${createSellOption(
        'ph-video-camera',
        'Upload Video',
        'video'
      )}

      ${createSellOption(
        'ph-megaphone',
        'Buat Promo',
        'promo'
      )}

    </div>
  `);
}


/* =========================================================
   50. SELL OPTION
   ========================================================= */

function createSellOption(
  icon,
  label,
  type
) {

  return `
    <button
      type="button"
      data-sell-option="${escapeHTML(type)}"
      style="
        width:100%;
        display:flex;
        align-items:center;
        gap:12px;
        padding:13px;
        border-radius:12px 6px 12px 6px;
        background:var(--forest-50);
        color:var(--forest-800);
        text-align:left;
      "
    >

      <i
        class="ph ${icon}"
        style="
          font-size:21px;
        "
        aria-hidden="true"
      ></i>

      <strong
        style="
          font-size:11px;
        "
      >
        ${escapeHTML(label)}
      </strong>

      <i
        class="ph ph-caret-right"
        style="
          margin-left:auto;
          opacity:.55;
        "
        aria-hidden="true"
      ></i>

    </button>
  `;
}


/* =========================================================
   51. SELL OPTION CLICK
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const option =
      event.target.closest(
        '[data-sell-option]'
      );


    if (!option) {
      return;
    }


    const labels = {

      product:
        'Tambah Produk',

      post:
        'Buat Postingan',

      video:
        'Upload Video',

      promo:
        'Buat Promo'
    };


    showToast(
      `${
        labels[
          option.dataset.sellOption
        ] ||
        'Fitur'
      } akan aktif bersama sistem akun`
    );
  }
);


/* =========================================================
   52. SIDE MENU
   ========================================================= */

function renderSideMenu() {

  if (!DOM.sideMenuContent) {
    return;
  }


  DOM.sideMenuContent.innerHTML = `

    <div
      style="
        padding-top:4px;
      "
    >

      <div
        style="
          display:flex;
          align-items:center;
          gap:10px;
        "
      >

        <img
          src="${ASSETS.appLogo}"
          alt="${CONFIG.APP_NAME}"
          style="
            width:42px;
            height:42px;
            object-fit:contain;
          "
        >


        <div
          style="
            min-width:0;
          "
        >

          <div
            style="
              font-family:var(--font-display);
              font-size:21px;
              line-height:1;
              color:var(--forest-900);
              font-weight:700;
              letter-spacing:-.025em;
            "
          >
            ${CONFIG.APP_NAME}
          </div>

          <div
            style="
              margin-top:5px;
              font-size:8px;
              font-weight:600;
              letter-spacing:.12em;
              text-transform:uppercase;
              color:var(--gold-700);
            "
          >
            ${CONFIG.LOCATION}
          </div>

        </div>

      </div>


      <div
        style="
          display:grid;
          gap:5px;
          margin-top:26px;
        "
      >

        ${sideMenuItem(
          'ph-house',
          'Beranda',
          'home'
        )}

        ${sideMenuItem(
          'ph-squares-four',
          'Kategori',
          'categories'
        )}

        ${sideMenuItem(
          'ph-storefront',
          'Jelajahi UMKM',
          'stores'
        )}

        ${sideMenuItem(
          'ph-receipt',
          'Pesanan Saya',
          'orders'
        )}

        ${sideMenuItem(
          'ph-heart',
          'Favorit',
          'favorites'
        )}

        ${sideMenuItem(
          'ph-info',
          'Tentang Pasar UMKM',
          'about'
        )}

        ${sideMenuItem(
          'ph-question',
          'Bantuan',
          'help'
        )}

      </div>


      <div
        style="
          margin-top:28px;
          padding-top:16px;
          border-top:1px solid var(--border-subtle);
        "
      >

        <div
          style="
            font-size:8px;
            line-height:1.5;
            color:var(--text-tertiary);
          "
        >
          Sebuah inisiatif dari
        </div>

        <div
          style="
            margin-top:3px;
            max-width:220px;
            font-size:10px;
            line-height:1.45;
            font-weight:700;
            color:var(--forest-800);
          "
        >
          ${CONFIG.ORGANIZATION}
        </div>

      </div>

    </div>
  `;
}


/* =========================================================
   53. SIDE MENU ITEM
   ========================================================= */

function sideMenuItem(
  icon,
  label,
  action
) {

  return `
    <button
      type="button"
      data-menu-action="${escapeHTML(action)}"
      style="
        width:100%;
        min-height:43px;
        display:flex;
        align-items:center;
        gap:12px;
        padding:10px 11px;
        border-radius:11px 5px 11px 5px;
        text-align:left;
        color:var(--text-primary);
      "
    >

      <i
        class="ph ${icon}"
        style="
          width:21px;
          font-size:19px;
          color:var(--forest-700);
        "
        aria-hidden="true"
      ></i>

      <span
        style="
          font-size:11px;
          font-weight:600;
        "
      >
        ${escapeHTML(label)}
      </span>

      <i
        class="ph ph-caret-right"
        style="
          margin-left:auto;
          font-size:12px;
          color:var(--text-tertiary);
        "
        aria-hidden="true"
      ></i>

    </button>
  `;
}


/* =========================================================
   54. SIDE MENU OPEN
   ========================================================= */

function openSideMenu() {

  if (!DOM.sideMenu) {
    return;
  }


  DOM.sideMenu.hidden =
    false;


  DOM.sideMenu.setAttribute(
    'aria-hidden',
    'false'
  );


  DOM.menuButton
    ?.setAttribute(
      'aria-expanded',
      'true'
    );


  lockBodyScroll();
}


/* =========================================================
   55. SIDE MENU CLOSE
   ========================================================= */

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


  DOM.menuButton
    ?.setAttribute(
      'aria-expanded',
      'false'
    );


  unlockBodyScrollIfPossible();
}


/* =========================================================
   56. SIDE MENU ACTION
   ========================================================= */

function handleSideMenuAction(
  action
) {

  closeSideMenu();


  window.setTimeout(
    () => {

      switch (action) {

        case 'home':

          STATE.activeCategory =
            null;

          setActiveNavigation(
            'home'
          );

          renderFeed();

          window.scrollTo({
            top: 0,
            behavior: 'smooth'
          });

          break;


        case 'categories':

          setActiveNavigation(
            'categories'
          );

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


        case 'about':

          openAbout();

          break;


        case 'help':

          openHelp();

          break;


        default:

          showToast(
            'Menu belum tersedia'
          );
      }

    },
    100
  );
}


/* =========================================================
   57. CATEGORIES
   ========================================================= */

const CATEGORIES = [

  {
    icon:
      'ph-fork-knife',

    label:
      'Kuliner'
  },

  {
    icon:
      'ph-t-shirt',

    label:
      'Fashion'
  },

  {
    icon:
      'ph-sparkle',

    label:
      'Kecantikan'
  },

  {
    icon:
      'ph-laptop',

    label:
      'Digital'
  },

  {
    icon:
      'ph-device-mobile',

    label:
      'Elektronik'
  },

  {
    icon:
      'ph-house-line',

    label:
      'Property'
  },

  {
    icon:
      'ph-wallet',

    label:
      'Finance'
  },

  {
    icon:
      'ph-wrench',

    label:
      'Jasa'
  },

  {
    icon:
      'ph-hammer',

    label:
      'Kerajinan'
  }
];


/* =========================================================
   58. OPEN CATEGORIES
   ========================================================= */

function openCategories() {

  const content =
    CATEGORIES
      .map(
        category =>
          createCategoryItem(
            category.icon,
            category.label
          )
      )
      .join('');


  openBottomSheet(`
    <h2 id="sheetTitle">
      Kategori
    </h2>

    <p
      style="
        margin-top:6px;
        font-size:10px;
        color:var(--text-tertiary);
      "
    >
      Telusuri produk berdasarkan jenis usaha.
    </p>

    <div
      style="
        display:grid;
        grid-template-columns:repeat(3,1fr);
        gap:9px;
        margin-top:17px;
      "
    >
      ${content}
    </div>
  `);
}


/* =========================================================
   59. CATEGORY ITEM
   ========================================================= */

function createCategoryItem(
  icon,
  label
) {

  return `
    <button
      type="button"
      data-category="${escapeHTML(label)}"
      style="
        min-height:78px;
        padding:13px 7px;
        border-radius:13px 6px 13px 6px;
        background:var(--forest-50);
        color:var(--forest-800);
      "
    >

      <i
        class="ph ${icon}"
        style="
          display:block;
          margin-bottom:7px;
          font-size:22px;
        "
        aria-hidden="true"
      ></i>

      <span
        style="
          font-size:9px;
          font-weight:700;
        "
      >
        ${escapeHTML(label)}
      </span>

    </button>
  `;
}


/* =========================================================
   60. CATEGORY CLICK
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const button =
      event.target.closest(
        '[data-category]'
      );


    if (!button) {
      return;
    }


    const category =
      button.dataset.category;


    STATE.activeCategory =
      category;


    const results =
      DATA.posts.filter(
        post =>
          String(post.category)
            .toLowerCase() ===
          String(category)
            .toLowerCase()
      );


    closeBottomSheet();


    window.setTimeout(
      () => {

        renderCategoryFeed(
          category,
          results
        );

      },
      420
    );
  }
);


/* =========================================================
   61. CATEGORY FEED
   ========================================================= */

function renderCategoryFeed(
  category,
  posts
) {

  if (!DOM.feed) {
    return;
  }


  const top = `
    <div
      style="
        padding:15px var(--page-gutter) 13px;
        background:var(--bg-secondary);
        border-bottom:1px solid var(--border-subtle);
      "
    >

      <div
        style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
        "
      >

        <div>

          <small
            style="
              display:block;
              font-size:8px;
              text-transform:uppercase;
              letter-spacing:.1em;
              color:var(--text-tertiary);
            "
          >
            Kategori
          </small>

          <strong
            style="
              display:block;
              margin-top:3px;
              font-family:var(--font-display);
              font-size:17px;
              color:var(--forest-900);
            "
          >
            ${escapeHTML(category)}
          </strong>

        </div>


        <button
          type="button"
          data-action="clear-category"
          style="
            font-size:10px;
            font-weight:700;
            color:var(--forest-700);
          "
        >
          Semua
        </button>

      </div>

    </div>
  `;


  if (!posts.length) {

    DOM.feed.innerHTML =
      top +
      `
        <div class="empty-state">

          <i
            class="ph ph-package"
            aria-hidden="true"
          ></i>

          <div class="empty-state-title">
            Belum ada produk ${escapeHTML(category)}
          </div>

          <div class="empty-state-text">
            Produk pada kategori ini akan muncul setelah UMKM mulai mengunggahnya.
          </div>

        </div>
      `;

    return;
  }


  DOM.feed.innerHTML =
    top +
    posts
      .map(createPostTemplate)
      .join('');


  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}


/* =========================================================
   62. CLEAR CATEGORY
   ========================================================= */

function clearCategoryFilter() {

  STATE.activeCategory =
    null;


  setActiveNavigation(
    'home'
  );


  renderFeed();


  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}


/* =========================================================
   63. GET STORES
   ========================================================= */

function getStores() {

  const stores =
    new Map();


  DATA.posts.forEach(
    post => {

      if (
        !stores.has(
          post.author
        )
      ) {

        stores.set(
          post.author,
          {

            name:
              post.author,

            avatar:
              post.avatar,

            category:
              post.category,

            location:
              post.location,

            verified:
              post.verified
          }
        );
      }
    }
  );


  return [
    ...stores.values()
  ];
}


/* =========================================================
   64. STORES
   ========================================================= */

function openStores() {

  const stores =
    getStores();


  if (!stores.length) {

    openBottomSheet(`
      <h2 id="sheetTitle">
        Jelajahi UMKM
      </h2>

      ${createSheetEmptyState(
        'ph-storefront',
        'Belum ada UMKM',
        'Pelaku usaha yang bergabung akan muncul di sini.'
      )}
    `);

    return;
  }


  const content =
    stores
      .map(
        store => `
          <button
            type="button"
            data-store-name="${escapeHTML(store.name)}"
            style="
              width:100%;
              display:flex;
              align-items:center;
              gap:11px;
              padding:12px 0;
              text-align:left;
              border-bottom:1px solid var(--border-subtle);
            "
          >

            <img
              src="${escapeHTML(store.avatar)}"
              alt="${escapeHTML(store.name)}"
              style="
                width:48px;
                height:48px;
                object-fit:cover;
                border-radius:50%;
              "
            >

            <div
              style="
                flex:1;
                min-width:0;
              "
            >

              <strong
                style="
                  display:block;
                  font-size:11px;
                "
              >
                ${escapeHTML(store.name)}
              </strong>

              <small
                style="
                  display:block;
                  margin-top:3px;
                  color:var(--text-tertiary);
                "
              >
                ${escapeHTML(store.category)}
                ·
                ${escapeHTML(store.location)}
              </small>

            </div>

            <i
              class="ph ph-caret-right"
              style="
                color:var(--text-tertiary);
              "
              aria-hidden="true"
            ></i>

          </button>
        `
      )
      .join('');


  openBottomSheet(`
    <h2 id="sheetTitle">
      Jelajahi UMKM
    </h2>

    <p
      style="
        margin-top:6px;
        font-size:10px;
        color:var(--text-tertiary);
      "
    >
      Pelaku usaha yang tampil pada Pasar UMKM.
    </p>

    <div style="margin-top:14px">
      ${content}
    </div>
  `);
}


/* =========================================================
   65. STORE CLICK
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const button =
      event.target.closest(
        '[data-store-name]'
      );


    if (!button) {
      return;
    }


    const store =
      button.dataset.storeName;


    const posts =
      DATA.posts.filter(
        post =>
          post.author === store
      );


    if (!posts.length) {
      return;
    }


    closeBottomSheet();


    window.setTimeout(
      () => {

        STATE.activeCategory =
          null;


        renderFeed(
          posts
        );


        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });


        showToast(
          `Menampilkan ${store}`
        );

      },
      420
    );
  }
);


/* =========================================================
   66. ORDERS
   ========================================================= */

function openOrders() {

  if (!STATE.orders.length) {

    openBottomSheet(`
      <h2 id="sheetTitle">
        Pesanan Saya
      </h2>

      ${createSheetEmptyState(
        'ph-receipt',
        'Belum ada pesanan',
        'Pesanan yang dibuat akan muncul di sini.'
      )}
    `);

    return;
  }
}


/* =========================================================
   67. FAVORITES
   ========================================================= */

function openFavorites() {

  const favorites =
    DATA.posts.filter(
      post =>
        STATE.savedPosts.has(
          post.id
        )
    );


  if (!favorites.length) {

    openBottomSheet(`
      <h2 id="sheetTitle">
        Favorit
      </h2>

      ${createSheetEmptyState(
        'ph-heart',
        'Belum ada favorit',
        'Simpan produk atau postingan untuk menemukannya kembali.'
      )}
    `);

    return;
  }


  const content =
    favorites
      .map(
        post => `
          <button
            type="button"
            data-favorite-post="${post.id}"
            style="
              width:100%;
              display:flex;
              align-items:center;
              gap:11px;
              padding:11px 0;
              text-align:left;
              border-bottom:1px solid var(--border-subtle);
            "
          >

            <img
              src="${escapeHTML(post.media)}"
              alt="${escapeHTML(post.author)}"
              style="
                width:54px;
                height:54px;
                object-fit:cover;
                border-radius:11px 5px 11px 5px;
              "
            >

            <span
              style="
                flex:1;
                min-width:0;
              "
            >

              <strong
                style="
                  display:block;
                  font-size:11px;
                "
              >
                ${escapeHTML(
                  post.product?.name ||
                  post.author
                )}
              </strong>

              <small
                style="
                  display:block;
                  margin-top:3px;
                  color:var(--text-tertiary);
                "
              >
                ${escapeHTML(post.author)}
              </small>

            </span>

            <i
              class="ph-fill ph-heart"
              style="
                color:var(--sunset-500);
              "
              aria-hidden="true"
            ></i>

          </button>
        `
      )
      .join('');


  openBottomSheet(`
    <h2 id="sheetTitle">
      Favorit
    </h2>

    <div style="margin-top:14px">
      ${content}
    </div>
  `);
}


/* =========================================================
   68. FAVORITE CLICK
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const button =
      event.target.closest(
        '[data-favorite-post]'
      );


    if (!button) {
      return;
    }


    const postId =
      Number(
        button.dataset.favoritePost
      );


    closeBottomSheet();


    window.setTimeout(
      () => {

        scrollToPost(
          postId
        );

      },
      420
    );
  }
);


/* =========================================================
   69. ABOUT PASAR UMKM
   ========================================================= */

function openAbout() {

  openBottomSheet(`
    <div
      style="
        padding-top:3px;
        text-align:center;
      "
    >

      <img
        src="${ASSETS.appLogo}"
        alt="${CONFIG.APP_NAME}"
        style="
          width:74px;
          height:74px;
          object-fit:contain;
          margin:0 auto;
        "
      >


      <h2
        id="sheetTitle"
        style="
          margin-top:12px;
          font-size:24px;
        "
      >
        ${CONFIG.APP_NAME}
      </h2>


      <div
        style="
          margin-top:5px;
          font-size:8px;
          font-weight:600;
          letter-spacing:.14em;
          text-transform:uppercase;
          color:var(--gold-700);
        "
      >
        Social Marketplace UMKM Lokal
      </div>

    </div>



    <div
      style="
        max-width:320px;
        margin:20px auto 0;
        font-size:11px;
        line-height:1.75;
        color:var(--text-secondary);
      "
    >

      <p>
        Pasar UMKM membantu masyarakat menemukan produk,
        pelaku usaha, dan aktivitas UMKM lokal dalam satu tempat.
      </p>

      <p style="margin-top:11px">
        Penjual dapat memperkenalkan produk melalui feed,
        cerita, katalog, dan interaksi langsung dengan calon pembeli.
      </p>

    </div>



    <div
      style="
        margin-top:24px;
        text-align:center;
      "
    >

      <div
        style="
          font-size:8px;
          font-weight:600;
          letter-spacing:.12em;
          text-transform:uppercase;
          color:var(--text-tertiary);
        "
      >
        Diinisiasi oleh
      </div>


      <div
        style="
          display:flex;
          align-items:center;
          justify-content:center;
          gap:22px;
          margin-top:17px;
          padding:18px 14px;
          border-top:1px solid var(--border-subtle);
          border-bottom:1px solid var(--border-subtle);
        "
      >


        <div
          style="
            width:44%;
            display:flex;
            flex-direction:column;
            align-items:center;
            gap:9px;
          "
        >

          <img
            src="${ASSETS.hipmiLogo}"
            alt="Logo HIPMI PT UIN Al Azhaar Lubuklinggau"
            style="
              width:82px;
              height:82px;
              object-fit:contain;
            "
          >

          <span
            style="
              max-width:125px;
              font-size:8px;
              line-height:1.4;
              font-weight:700;
              color:var(--forest-900);
            "
          >
            HIPMI PT
            UIN Al Azhaar
            Lubuklinggau
          </span>

        </div>



        <div
          aria-hidden="true"
          style="
            width:1px;
            align-self:stretch;
            background:var(--border-soft);
          "
        ></div>



        <div
          style="
            width:44%;
            display:flex;
            flex-direction:column;
            align-items:center;
            gap:9px;
          "
        >

          <img
            src="${ASSETS.universityLogo}"
            alt="Logo Universitas Islam Nusantara Al-Azhaar Lubuklinggau"
            style="
              width:82px;
              height:82px;
              object-fit:contain;
            "
          >

          <span
            style="
              max-width:130px;
              font-size:8px;
              line-height:1.4;
              font-weight:700;
              color:var(--forest-900);
            "
          >
            Universitas Islam Nusantara
            Al-Azhaar Lubuklinggau
          </span>

        </div>

      </div>

    </div>



    <div
      style="
        margin-top:20px;
        padding:15px 4px;
        text-align:center;
      "
    >

      <div
        style="
          font-size:8px;
          font-weight:600;
          letter-spacing:.1em;
          text-transform:uppercase;
          color:var(--text-tertiary);
        "
      >
        Founder & Product Initiator
      </div>

      <strong
        style="
          display:block;
          margin-top:5px;
          font-family:var(--font-display);
          font-size:16px;
          color:var(--forest-900);
        "
      >
        ${CONFIG.INITIATOR}
      </strong>

    </div>



    <div
      style="
        margin-top:4px;
        padding-top:15px;
        border-top:1px solid var(--border-subtle);
        text-align:center;
        font-size:8px;
        line-height:1.7;
        color:var(--text-tertiary);
      "
    >
      © 2026 ${CONFIG.APP_NAME}<br>
      ${CONFIG.LOCATION}, Sumatera Selatan
    </div>
  `);
}


/* =========================================================
   70. HELP
   ========================================================= */

function openHelp() {

  openBottomSheet(`
    <h2 id="sheetTitle">
      Bantuan
    </h2>

    <p
      style="
        margin-top:6px;
        font-size:10px;
        color:var(--text-tertiary);
      "
    >
      Informasi penggunaan Pasar UMKM.
    </p>


    <div
      style="
        display:grid;
        gap:8px;
        margin-top:18px;
      "
    >

      ${createHelpItem(
        'ph-shopping-cart',
        'Cara membeli produk'
      )}

      ${createHelpItem(
        'ph-storefront',
        'Cara menjadi penjual'
      )}

      ${createHelpItem(
        'ph-package',
        'Pesanan dan pengiriman'
      )}

      ${createHelpItem(
        'ph-wallet',
        'Pembayaran'
      )}

      ${createHelpItem(
        'ph-shield-check',
        'Keamanan akun'
      )}

      ${createHelpItem(
        'ph-headset',
        'Hubungi pengelola'
      )}

    </div>
  `);
}


/* =========================================================
   71. HELP ITEM
   ========================================================= */

function createHelpItem(
  icon,
  label
) {

  return `
    <button
      type="button"
      data-help-item="${escapeHTML(label)}"
      style="
        width:100%;
        display:flex;
        align-items:center;
        gap:12px;
        padding:13px;
        border-radius:12px 6px 12px 6px;
        background:var(--forest-50);
        text-align:left;
      "
    >

      <i
        class="ph ${icon}"
        style="
          font-size:19px;
          color:var(--forest-700);
        "
        aria-hidden="true"
      ></i>

      <span
        style="
          font-size:11px;
          font-weight:600;
        "
      >
        ${escapeHTML(label)}
      </span>

      <i
        class="ph ph-caret-right"
        style="
          margin-left:auto;
          color:var(--text-tertiary);
        "
        aria-hidden="true"
      ></i>

    </button>
  `;
}


/* =========================================================
   72. HELP CLICK
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const button =
      event.target.closest(
        '[data-help-item]'
      );


    if (!button) {
      return;
    }


    showToast(
      `${button.dataset.helpItem} sedang disiapkan`
    );
  }
);


/* =========================================================
   73. ACCOUNT
   ========================================================= */

function openAccount() {

  openBottomSheet(`
    <h2 id="sheetTitle">
      Akun
    </h2>


    <div
      style="
        padding:24px 0 12px;
        text-align:center;
      "
    >

      <div
        style="
          width:66px;
          height:66px;
          margin:0 auto;
          display:flex;
          align-items:center;
          justify-content:center;
          border-radius:20px 9px 20px 9px;
          background:var(--forest-100);
          color:var(--forest-700);
          font-size:29px;
        "
      >

        <i
          class="ph ph-user"
          aria-hidden="true"
        ></i>

      </div>


      <h3
        style="
          margin-top:13px;
          font-family:var(--font-display);
          font-size:17px;
          color:var(--forest-900);
        "
      >
        Akun Pasar UMKM
      </h3>


      <p
        style="
          max-width:270px;
          margin:6px auto 0;
          font-size:10px;
          line-height:1.6;
          color:var(--text-tertiary);
        "
      >
        Masuk untuk membeli, menjual, mengelola toko, dan melihat pesanan.
      </p>


      <button
        type="button"
        class="btn-primary"
        data-action="login"
        style="
          width:100%;
          margin-top:18px;
          padding:12px;
        "
      >
        Masuk / Daftar
      </button>

    </div>
  `);
}


/* =========================================================
   74. LOGIN PLACEHOLDER
   ========================================================= */

function openLogin() {

  openBottomSheet(`
    <h2 id="sheetTitle">
      Masuk
    </h2>

    <div
      style="
        margin-top:18px;
        padding:19px;
        border-radius:16px 8px 16px 8px;
        background:var(--forest-50);
        text-align:center;
      "
    >

      <i
        class="ph ph-user-circle"
        style="
          font-size:35px;
          color:var(--forest-700);
        "
        aria-hidden="true"
      ></i>

      <strong
        style="
          display:block;
          margin-top:10px;
          font-size:12px;
        "
      >
        Sistem akun belum diaktifkan
      </strong>

      <p
        style="
          margin-top:6px;
          font-size:10px;
          line-height:1.6;
          color:var(--text-secondary);
        "
      >
        Login dan pendaftaran akan menggunakan backend dan database pada tahap berikutnya.
      </p>

    </div>
  `);
}


/* =========================================================
   75. OPEN BOTTOM SHEET
   ========================================================= */

function openBottomSheet(
  content
) {

  if (
    !DOM.bottomSheet ||
    !DOM.sheetOverlay ||
    !DOM.sheetContent
  ) {

    return;
  }


  DOM.sheetContent.innerHTML =
    content;


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


  requestAnimationFrame(
    () => {

      DOM.sheetOverlay
        .classList
        .add('show');


      DOM.bottomSheet
        .classList
        .add('show');
    }
  );


  lockBodyScroll();
}


/* =========================================================
   76. CLOSE BOTTOM SHEET
   ========================================================= */

function closeBottomSheet() {

  if (
    !DOM.bottomSheet ||
    !DOM.sheetOverlay
  ) {

    return;
  }


  DOM.sheetOverlay
    .classList
    .remove('show');


  DOM.bottomSheet
    .classList
    .remove('show');


  DOM.bottomSheet.setAttribute(
    'aria-hidden',
    'true'
  );


  DOM.sheetOverlay.setAttribute(
    'aria-hidden',
    'true'
  );


  window.setTimeout(
    () => {

      DOM.sheetOverlay.hidden =
        true;


      DOM.bottomSheet.hidden =
        true;


      unlockBodyScrollIfPossible();

    },
    400
  );
}


/* =========================================================
   77. NAVIGATION
   ========================================================= */

function bindNavigation() {

  DOM.appNavigation
    ?.querySelectorAll(
      '[data-nav]'
    )
    .forEach(
      link => {

        link.addEventListener(
          'click',
          event => {

            event.preventDefault();


            const nav =
              link.dataset.nav;


            setActiveNavigation(
              nav
            );


            switch (nav) {

              case 'home':

                STATE.activeCategory =
                  null;

                renderFeed();

                window.scrollTo({
                  top: 0,
                  behavior: 'smooth'
                });

                break;


              case 'categories':

                openCategories();

                break;


              case 'sell':

                openSellSheet();

                break;


              case 'cart':

                openCart();

                break;


              case 'account':

                openAccount();

                break;
            }
          }
        );
      }
    );
}


/* =========================================================
   78. ACTIVE NAVIGATION
   ========================================================= */

function setActiveNavigation(nav) {

  STATE.activeNav =
    nav;


  DOM.appNavigation
    ?.querySelectorAll(
      '[data-nav]'
    )
    .forEach(
      link => {

        const active =
          link.dataset.nav === nav;


        link.classList.toggle(
          'active',
          active
        );


        const icon =
          link.querySelector(
            '.nav-icon-wrap i'
          );


        if (icon) {

          icon.classList.toggle(
            'ph-fill',
            active
          );


          icon.classList.toggle(
            'ph',
            !active
          );
        }


        if (active) {

          link.setAttribute(
            'aria-current',
            'page'
          );

        } else {

          link.removeAttribute(
            'aria-current'
          );
        }
      }
    );
}


/* =========================================================
   79. BRAND NAVIGATION
   ========================================================= */

function bindBrandNavigation() {

  document
    .querySelectorAll(
      '.brand[data-nav="home"]'
    )
    .forEach(
      brand => {

        brand.addEventListener(
          'click',
          event => {

            event.preventDefault();


            STATE.activeCategory =
              null;


            setActiveNavigation(
              'home'
            );


            renderFeed();


            window.scrollTo({
              top: 0,
              behavior: 'smooth'
            });
          }
        );
      }
    );
}


/* =========================================================
   80. BIND EVENTS
   ========================================================= */

function bindEvents() {

  /* SIDE MENU ITEMS */

  DOM.sideMenuContent
    ?.addEventListener(
      'click',
      event => {

        const button =
          event.target.closest(
            '[data-menu-action]'
          );


        if (!button) {
          return;
        }


        handleSideMenuAction(
          button.dataset.menuAction
        );
      }
    );


  /* CLICK DARK AREA TO CLOSE SIDE MENU */

  DOM.sideMenu
    ?.addEventListener(
      'click',
      event => {

        if (
          event.target ===
          DOM.sideMenu
        ) {

          closeSideMenu();
        }
      }
    );


  /* SEARCH INPUT */

  DOM.searchInput
    ?.addEventListener(
      'input',
      event => {

        const value =
          event.target.value;


        handleSearch(
          value
        );


        if (
          DOM.searchClearButton
        ) {

          DOM.searchClearButton.hidden =
            !value;
        }
      }
    );


  /* CLEAR SEARCH */

  DOM.searchClearButton
    ?.addEventListener(
      'click',
      () => {

        if (!DOM.searchInput) {
          return;
        }


        DOM.searchInput.value =
          '';


        DOM.searchClearButton.hidden =
          true;


        STATE.searchQuery =
          '';


        renderSearchHint();


        DOM.searchInput.focus();
      }
    );


  /* BOTTOM SHEET OVERLAY */

  DOM.sheetOverlay
    ?.addEventListener(
      'click',
      closeBottomSheet
    );


  /* ESC */

  document.addEventListener(
    'keydown',
    handleEscape
  );


  /* SCROLL */

  window.addEventListener(
    'scroll',
    handleScroll,
    {
      passive:
        true
    }
  );


  bindNavigation();

  bindBrandNavigation();
}


/* =========================================================
   81. ESCAPE
   ========================================================= */

function handleEscape(event) {

  if (
    event.key !== 'Escape'
  ) {

    return;
  }


  if (
    DOM.searchOverlay &&
    !DOM.searchOverlay.hidden
  ) {

    closeSearch();

    return;
  }


  if (
    DOM.bottomSheet &&
    !DOM.bottomSheet.hidden
  ) {

    closeBottomSheet();

    return;
  }


  if (
    DOM.sideMenu &&
    !DOM.sideMenu.hidden
  ) {

    closeSideMenu();
  }
}


/* =========================================================
   82. HEADER SCROLL STATE
   ========================================================= */

function handleScroll() {

  DOM.header
    ?.classList
    .toggle(
      'scrolled',
      window.scrollY > 8
    );
}


/* =========================================================
   83. HEADER BADGES
   ========================================================= */

function updateHeaderBadges() {

  updateButtonBadge(

    DOM.notificationButton,

    DATA.notifications.filter(
      item =>
        item.unread
    ).length
  );


  updateButtonBadge(

    DOM.messageButton,

    DATA.messages.filter(
      item =>
        item.unread
    ).length
  );
}


/* =========================================================
   84. BUTTON BADGE
   ========================================================= */

function updateButtonBadge(
  button,
  count
) {

  if (!button) {
    return;
  }


  const badge =
    button.querySelector(
      '.badge-dot'
    );


  if (!badge) {
    return;
  }


  const number =
    Number(count) || 0;


  badge.textContent =
    number > 99
      ? '99+'
      : String(number);


  badge.hidden =
    number === 0;


  button.classList.toggle(
    'has-badge',
    number > 0
  );
}


/* =========================================================
   85. CART BADGE
   ========================================================= */

function updateCartBadge() {

  const badge =
    document.querySelector(
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
        Number(item.quantity || 0),
      0
    );


  badge.textContent =
    count > 99
      ? '99+'
      : String(count);


  badge.hidden =
    count === 0;
}


/* =========================================================
   86. REFRESH FEED
   ========================================================= */

function refreshCurrentFeed() {

  if (
    STATE.activeCategory
  ) {

    const results =
      DATA.posts.filter(
        post =>
          String(post.category)
            .toLowerCase() ===
          String(
            STATE.activeCategory
          )
            .toLowerCase()
      );


    renderCategoryFeed(
      STATE.activeCategory,
      results
    );


    return;
  }


  renderFeed();
}


/* =========================================================
   87. BODY SCROLL LOCK
   ========================================================= */

function lockBodyScroll() {

  document.body.style.overflow =
    'hidden';
}


function unlockBodyScrollIfPossible() {

  const searchOpen =
    DOM.searchOverlay &&
    !DOM.searchOverlay.hidden;


  const menuOpen =
    DOM.sideMenu &&
    !DOM.sideMenu.hidden;


  const sheetOpen =
    DOM.bottomSheet &&
    !DOM.bottomSheet.hidden;


  if (
    !searchOpen &&
    !menuOpen &&
    !sheetOpen
  ) {

    document.body.style.overflow =
      '';
  }
}


/* =========================================================
   88. SAVE LOCAL STATE
   ========================================================= */

function saveState() {

  try {

    localStorage.setItem(
      CONFIG.STORAGE_KEY,
      JSON.stringify({

        likedPosts:
          [...STATE.likedPosts],

        savedPosts:
          [...STATE.savedPosts],

        cart:
          STATE.cart,

        orders:
          STATE.orders
      })
    );

  } catch (error) {

    console.warn(
      'Pasar UMKM: state tidak dapat disimpan.',
      error
    );
  }
}


/* =========================================================
   89. RESTORE STATE
   ========================================================= */

function restoreState() {

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


    STATE.likedPosts =
      new Set(
        Array.isArray(
          saved.likedPosts
        )
          ? saved.likedPosts
          : []
      );


    STATE.savedPosts =
      new Set(
        Array.isArray(
          saved.savedPosts
        )
          ? saved.savedPosts
          : []
      );


    STATE.cart =
      Array.isArray(
        saved.cart
      )
        ? saved.cart
        : [];


    STATE.orders =
      Array.isArray(
        saved.orders
      )
        ? saved.orders
        : [];

  } catch (error) {

    console.warn(
      'Pasar UMKM: state lokal tidak dapat dibaca.',
      error
    );
  }
}


/* =========================================================
   90. CLEAR LOCAL STATE
   ========================================================= */

function clearState() {

  try {

    localStorage.removeItem(
      CONFIG.STORAGE_KEY
    );

  } catch (error) {
    // Abaikan.
  }


  STATE.likedPosts.clear();

  STATE.savedPosts.clear();

  STATE.cart = [];

  STATE.orders = [];

  STATE.activeCategory =
    null;


  renderStories();

  renderFeed();

  updateCartBadge();

  updateHeaderBadges();


  showToast(
    'Data lokal direset'
  );
}


/* =========================================================
   91. RESET SPLASH
   DEV ONLY
   ========================================================= */

function resetSplashIntro() {

  try {

    sessionStorage.removeItem(
      CONFIG.INTRO_SESSION_KEY
    );


    console.info(
      'Pasar UMKM: splash akan tampil lagi setelah halaman dimuat ulang.'
    );

  } catch (error) {

    console.warn(
      'Splash session tidak dapat direset.'
    );
  }
}


/* =========================================================
   92. EMPTY STATE HELPER
   ========================================================= */

function createSheetEmptyState(
  icon,
  title,
  description
) {

  return `
    <div class="empty-state">

      <i
        class="ph ${icon}"
        aria-hidden="true"
      ></i>

      <div class="empty-state-title">
        ${escapeHTML(title)}
      </div>

      <div class="empty-state-text">
        ${escapeHTML(description)}
      </div>

    </div>
  `;
}


/* =========================================================
   93. LOADING
   ========================================================= */

function hideLoading() {

  if (!DOM.appLoading) {
    return;
  }


  DOM.appLoading.hidden =
    true;


  DOM.appLoading.setAttribute(
    'aria-hidden',
    'true'
  );
}


/* =========================================================
   94. TOAST
   ========================================================= */

let toastTimer = null;


function showToast(message) {

  if (!DOM.toast) {
    return;
  }


  window.clearTimeout(
    toastTimer
  );


  DOM.toast.textContent =
    String(message);


  DOM.toast
    .classList
    .add('show');


  toastTimer =
    window.setTimeout(
      () => {

        DOM.toast
          ?.classList
          .remove('show');

      },
      2300
    );
}


/* =========================================================
   95. CURRENCY
   ========================================================= */

function formatRupiah(value) {

  const number =
    Number(value) || 0;


  return new Intl.NumberFormat(
    'id-ID',
    {

      style:
        'currency',

      currency:
        'IDR',

      maximumFractionDigits:
        0
    }
  ).format(number);
}


/* =========================================================
   96. COMPACT NUMBER
   ========================================================= */

function formatCompact(value) {

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
        1
    }
  ).format(number);
}


/* =========================================================
   97. ESCAPE HTML
   ========================================================= */

function escapeHTML(value) {

  return String(
    value ?? ''
  )

    .replace(
      /&/g,
      '&amp;'
    )

    .replace(
      /</g,
      '&lt;'
    )

    .replace(
      />/g,
      '&gt;'
    )

    .replace(
      /"/g,
      '&quot;'
    )

    .replace(
      /'/g,
      '&#039;'
    );
}


/* =========================================================
   98. DEVELOPMENT API
   ========================================================= */

window.PasarUMKM = {

  CONFIG,

  ASSETS,

  DATA,

  STATE,


  renderFeed,

  renderStories,

  renderSideMenu,


  openCart,

  openCategories,

  openSellSheet,

  openAccount,

  openStores,

  openOrders,

  openFavorites,

  openAbout,

  openHelp,


  showToast,

  clearState,

  resetSplashIntro,


  /*
   * DEVELOPMENT TEST
   *
   * Console:
   *
   * PasarUMKM.setDemoMode(false)
   *
   * atau:
   *
   * PasarUMKM.setDemoMode(true)
   *
   * Nilai ini kembali ke CONFIG.DEMO_MODE
   * setelah reload.
   */
  setDemoMode(enabled) {

    const active =
      Boolean(enabled);


    DATA.stories =
      active
        ? [...DEMO_DATA.stories]
        : [];


    DATA.posts =
      active
        ? [...DEMO_DATA.posts]
        : [];


    DATA.notifications =
      active
        ? [...DEMO_DATA.notifications]
        : [];


    DATA.messages =
      active
        ? [...DEMO_DATA.messages]
        : [];


    STATE.activeCategory =
      null;


    renderStories();

    renderFeed();

    updateHeaderBadges();


    showToast(
      active
        ? 'Mode demo aktif'
        : 'Mode demo nonaktif'
    );
  }
};


/* =========================================================
   END — PASAR UMKM APP.JS v4.0
   ========================================================= */
