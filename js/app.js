/* =========================================================
   PASAR UMKM — APP.JS v3.0
   Social Marketplace Frontend Engine

   HIPMI PT UIN Al Azhaar Lubuklinggau
   Product Initiator: Capryan Agusto
   ========================================================= */

'use strict';


/* =========================================================
   01. CONFIGURATION
   ========================================================= */

const CONFIG = {

  /*
   * DEVELOPMENT:
   * true  = menampilkan data demo.
   * false = data demo hilang dan aplikasi menampilkan empty state.
   *
   * NANTI KETIKA BACKEND SUDAH AKTIF:
   * DEMO_MODE akan dibuat false dan data berasal dari API/database.
   */
  DEMO_MODE: true,

  APP_NAME: 'Pasar UMKM',
  LOCATION: 'Lubuklinggau',

  ORGANIZATION: 'HIPMI PT UIN Al Azhaar Lubuklinggau',
  INITIATOR: 'Capryan Agusto',

  STORAGE_KEY: 'pasarUmkmStateV3'
};


/* =========================================================
   02. DEMO DATA
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
      author: 'Pak Madi',
      avatar: 'assets/umkm1.jpg',
      verified: true,
      category: 'Kuliner',
      location: 'Lubuklinggau',
      time: '2 jam lalu',

      media: 'assets/umkm1.jpg',
      mediaType: 'image',

      likes: 128,
      comments: 23,
      shares: 12,

      caption:
        'Alhamdulillah panen kali ini biji kopi lebih besar. Langsung dari kebun sendiri di Lubuklinggau.',

      tags: [
        '#KopiLokal',
        '#UMKMSumsel'
      ],

      product: {
        id: 101,
        name: 'Kopi Robusta Premium 250g',
        image: 'assets/umkm1.jpg',
        rating: 4.9,
        sold: 1200,
        price: 25000,
        originalPrice: 30000
      }
    },


    {
      id: 2,
      author: 'Ibu Siti',
      avatar: 'assets/umkm2.jpg',
      verified: true,
      category: 'Kerajinan',
      location: 'Lubuklinggau',
      time: '5 jam lalu',

      media: 'assets/umkm2.jpg',
      mediaType: 'video',

      likes: 89,
      comments: 15,
      shares: 8,

      caption:
        'Dari menganyam sampai jadi tas cantik ini butuh tiga hari. Dibuat manual oleh pengrajin lokal.',

      tags: [
        '#KerajinanLokal',
        '#ProdukUMKM'
      ],

      product: {
        id: 102,
        name: 'Tas Anyaman Purun Premium',
        image: 'assets/umkm2.jpg',
        rating: 5,
        sold: 500,
        price: 75000,
        originalPrice: null
      }
    },


    {
      id: 3,
      author: 'Madi Craft',
      avatar: 'assets/umkm3.jpg',
      verified: false,
      category: 'Fashion',
      location: 'Sumatera Selatan',
      time: '1 hari lalu',

      media: 'assets/umkm3.jpg',
      mediaType: 'image',

      likes: 67,
      comments: 9,
      shares: 4,

      caption:
        'Produk handmade lokal dengan desain sederhana dan elegan.',

      tags: [
        '#Handmade',
        '#BanggaProdukLokal'
      ],

      product: {
        id: 103,
        name: 'Produk Handmade Lokal',
        image: 'assets/umkm3.jpg',
        rating: 4.8,
        sold: 320,
        price: 50000,
        originalPrice: 65000
      }
    }
  ],


  notifications: [
    {
      id: 1,
      icon: 'ph-heart',
      title: 'Postingan UMKM mendapat interaksi baru',
      time: '5 menit lalu',
      unread: true
    },
    {
      id: 2,
      icon: 'ph-shopping-cart',
      title: 'Produk baru tersedia di Pasar UMKM',
      time: '30 menit lalu',
      unread: true
    },
    {
      id: 3,
      icon: 'ph-storefront',
      title: 'UMKM baru bergabung',
      time: '1 jam lalu',
      unread: true
    }
  ],


  messages: [
    {
      id: 1,
      name: 'Pak Madi',
      text: 'Kopi masih tersedia, kak.',
      time: '2 menit lalu',
      unread: true
    },
    {
      id: 2,
      name: 'Ibu Siti',
      text: 'Terima kasih sudah menghubungi toko kami.',
      time: '25 menit lalu',
      unread: true
    }
  ]
};


/* =========================================================
   03. LIVE DATA
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
   04. APPLICATION STATE
   ========================================================= */

const STATE = {

  likedPosts: new Set(),

  savedPosts: new Set(),

  cart: [],

  activeNav: 'home',

  activeCategory: null,

  currentSheet: null,

  searchQuery: '',

  orders: []
};


/* =========================================================
   05. DOM CACHE
   ========================================================= */

const DOM = {};


function cacheDOM() {

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
   06. INITIALIZATION
   ========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  init
);


function init() {

  cacheDOM();

  restoreState();

  renderStories();

  renderFeed();

  renderSideMenu();

  bindEvents();

  updateCartBadge();

  updateHeaderBadges();

  hideLoading();

  handleScroll();
}


/* =========================================================
   07. STORIES
   ========================================================= */

function renderStories() {

  if (!DOM.stories) return;


  const addStory = `
    <button
      type="button"
      class="story-item story-add"
      data-story-action="add"
      aria-label="Tambah cerita"
    >
      <div class="story-ring">
        <i class="ph ph-plus"></i>
      </div>

      <span class="story-name">
        Jual
      </span>
    </button>
  `;


  if (!DATA.stories.length) {

    DOM.stories.innerHTML = addStory;

    return;
  }


  const storiesHTML =
    DATA.stories
      .map(createStoryTemplate)
      .join('');


  DOM.stories.innerHTML =
    addStory + storiesHTML;
}


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
   08. FEED
   ========================================================= */

function renderFeed(posts = DATA.posts) {

  if (!DOM.feed) return;


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
   09. EMPTY FEED
   ========================================================= */

function renderEmptyFeed() {

  const title =
    STATE.activeCategory
      ? `Belum ada produk ${STATE.activeCategory}`
      : 'Belum ada postingan';


  const description =
    CONFIG.DEMO_MODE
      ? 'Belum ditemukan produk pada pilihan ini.'
      : 'Jadilah UMKM pertama yang membagikan produk di Pasar UMKM.';


  DOM.feed.innerHTML = `
    <div class="empty-state">

      <i class="ph ph-storefront"></i>

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
   10. POST TEMPLATE
   ========================================================= */

function createPostTemplate(post) {

  const liked =
    STATE.likedPosts.has(post.id);

  const saved =
    STATE.savedPosts.has(post.id);


  const likes =
    post.likes + (liked ? 1 : 0);


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
          <i class="ph ph-dots-three"></i>
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
          >

            <i
              class="${liked ? 'ph-fill' : 'ph'} ph-heart"
            ></i>

            <span>
              ${formatCompact(likes)}
            </span>

          </button>


          <button
            type="button"
            class="action-btn"
            data-action="comments"
            data-post-id="${post.id}"
          >

            <i class="ph ph-chat-circle"></i>

            <span>
              ${formatCompact(post.comments)}
            </span>

          </button>


          <button
            type="button"
            class="action-btn"
            data-action="share"
            data-post-id="${post.id}"
          >

            <i class="ph ph-paper-plane-tilt"></i>

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
          ></i>

        </button>

      </div>


      <div class="post-stats">
        ${formatCompact(likes)} suka
      </div>


      <div class="post-caption">

        <span class="author">
          ${escapeHTML(post.author)}
        </span>

        ${escapeHTML(post.caption)}

        ${
          post.tags?.length
            ? `
              <br>

              ${post.tags
                .map(
                  tag =>
                    `<span class="tag">${escapeHTML(tag)}</span>`
                )
                .join(' ')
              }
            `
            : ''
        }

      </div>


      ${
        post.comments > 0
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
   11. POST MEDIA
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

              <i class="ph-fill ph-video"></i>

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
   12. PRODUCT TEMPLATE
   ========================================================= */

function createProductTemplate(post) {

  const product =
    post.product;


  if (!product) return '';


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

          <i class="ph-fill ph-storefront"></i>

          Produk UMKM

        </div>


        <div class="product-name">
          ${escapeHTML(product.name)}
        </div>


        <div class="product-meta">

          <span class="stars">
            ★ ${product.rating}
          </span>

          <span>•</span>

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
          aria-label="Tambah ke keranjang"
        >
          <i class="ph ph-shopping-cart"></i>
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
   13. MAIN GLOBAL ACTIONS
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const target =
      event.target.closest('[data-action]');


    if (!target) return;


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
          Number(target.dataset.postId)
        );
        break;


      case 'comments':
        openComments(
          Number(target.dataset.postId)
        );
        break;


      case 'share':
        sharePost(
          Number(target.dataset.postId)
        );
        break;


      case 'save':
        toggleSave(
          Number(target.dataset.postId)
        );
        break;


      case 'post-menu':
        openPostMenu(
          Number(target.dataset.postId)
        );
        break;


      case 'play-video':
        playDemoVideo(
          Number(target.dataset.postId)
        );
        break;


      case 'cart':
        addProductToCart(
          Number(target.dataset.productId)
        );
        break;


      case 'buy':
        buyProduct(
          Number(target.dataset.productId)
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
          Number(target.dataset.productId)
        );
        break;


      case 'cart-plus':
        changeCartQuantity(
          Number(target.dataset.productId),
          1
        );
        break;


      case 'cart-minus':
        changeCartQuantity(
          Number(target.dataset.productId),
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
   14. STORY EVENTS
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const story =
      event.target.closest('[data-story-id]');


    if (story) {

      openStory(
        Number(story.dataset.storyId)
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
   15. LIKE
   ========================================================= */

function toggleLike(postId) {

  if (STATE.likedPosts.has(postId)) {

    STATE.likedPosts.delete(postId);

  } else {

    STATE.likedPosts.add(postId);
  }


  saveState();

  refreshCurrentFeed();
}


/* =========================================================
   16. SAVE / FAVORITE
   ========================================================= */

function toggleSave(postId) {

  if (STATE.savedPosts.has(postId)) {

    STATE.savedPosts.delete(postId);

    showToast(
      'Dihapus dari favorit'
    );

  } else {

    STATE.savedPosts.add(postId);

    showToast(
      'Disimpan ke favorit'
    );
  }


  saveState();

  refreshCurrentFeed();
}


/* =========================================================
   17. COMMENTS
   ========================================================= */

function openComments(postId) {

  const post =
    findPost(postId);


  if (!post) return;


  /*
   * Saat backend aktif,
   * komentar akan berasal dari database.
   */

  const comments =
    CONFIG.DEMO_MODE
      ? [
          {
            name: 'Pengguna Lokal',
            text: 'Produknya bagus sekali 👍'
          },
          {
            name: 'Pembeli UMKM',
            text: 'Semoga UMKM lokal makin maju.'
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
                  border-bottom:1px solid rgba(0,0,0,.06);
                "
              >

                <strong
                  style="font-size:13px"
                >
                  ${escapeHTML(comment.name)}
                </strong>

                <p
                  style="
                    font-size:12px;
                    color:var(--text-secondary);
                    margin-top:4px;
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
          'Jadilah yang pertama memberikan komentar.'
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
   18. SHARE
   ========================================================= */

async function sharePost(postId) {

  const post =
    findPost(postId);


  if (!post) return;


  const shareData = {

    title:
      `${post.author} — ${CONFIG.APP_NAME}`,

    text:
      post.caption,

    url:
      `${window.location.origin}${window.location.pathname}#post-${post.id}`
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
        shareData.url
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

    if (error.name !== 'AbortError') {

      showToast(
        'Tidak dapat membagikan postingan'
      );
    }
  }
}


/* =========================================================
   19. POST MENU
   ========================================================= */

function openPostMenu(postId) {

  const post =
    findPost(postId);


  if (!post) return;


  const saved =
    STATE.savedPosts.has(post.id);


  openBottomSheet(`
    <h2 id="sheetTitle">
      ${escapeHTML(post.author)}
    </h2>

    <div
      style="
        margin-top:18px;
        display:grid;
        gap:8px;
      "
    >

      <button
        type="button"
        class="menu-sheet-btn"
        data-post-sheet-action="save"
        data-post-id="${post.id}"
      >

        <i class="ph ph-bookmark-simple"></i>

        ${saved ? 'Hapus dari Favorit' : 'Simpan Postingan'}

      </button>


      <button
        type="button"
        class="menu-sheet-btn"
        data-post-sheet-action="hide"
        data-post-id="${post.id}"
      >

        <i class="ph ph-eye-slash"></i>

        Tidak Tertarik

      </button>


      <button
        type="button"
        class="menu-sheet-btn"
        data-post-sheet-action="report"
        data-post-id="${post.id}"
      >

        <i class="ph ph-flag"></i>

        Laporkan

      </button>

    </div>
  `);
}


/* =========================================================
   20. POST MENU ACTION
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const button =
      event.target.closest(
        '[data-post-sheet-action]'
      );


    if (!button) return;


    const action =
      button.dataset.postSheetAction;


    const postId =
      Number(button.dataset.postId);


    switch (action) {

      case 'save':

        toggleSave(postId);

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
          'Terima kasih. Laporan akan ditinjau.'
        );

        break;
    }
  }
);


/* =========================================================
   21. VIDEO DEMO
   ========================================================= */

function playDemoVideo() {

  showToast(
    CONFIG.DEMO_MODE
      ? 'Video demo belum tersedia'
      : 'Video belum tersedia'
  );
}


/* =========================================================
   22. FIND HELPERS
   ========================================================= */

function findPost(postId) {

  return DATA.posts.find(
    post => post.id === postId
  ) || null;
}


function findProduct(productId) {

  for (const post of DATA.posts) {

    if (
      post.product &&
      post.product.id === productId
    ) {

      return {
        ...post.product,
        seller: post.author
      };
    }
  }


  return null;
}


/* =========================================================
   23. ADD TO CART
   ========================================================= */

function addProductToCart(productId) {

  const product =
    findProduct(productId);


  if (!product) return;


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
      quantity: 1
    });
  }


  saveState();

  updateCartBadge();


  showToast(
    `${product.name} masuk ke keranjang`
  );
}


/* =========================================================
   24. CHANGE CART QUANTITY
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


  if (!item) return;


  item.quantity += difference;


  if (item.quantity <= 0) {

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
   25. REMOVE CART
   ========================================================= */

function removeCartItem(productId) {

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
   26. CLEAR CART
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
   27. BUY NOW
   ========================================================= */

function buyProduct(productId) {

  const product =
    findProduct(productId);


  if (!product) return;


  openBottomSheet(`
    <h2 id="sheetTitle">
      Beli Produk
    </h2>


    <div
      style="
        display:flex;
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
          border-radius:12px;
        "
      >


      <div style="min-width:0">

        <strong
          style="
            font-size:14px;
            display:block;
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
            margin-top:6px;
            color:var(--sunset-500);
            font-weight:800;
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
      Lanjutkan Checkout
    </button>
  `);


  document
    .getElementById('buyNowContinue')
    ?.addEventListener(
      'click',
      () => {

        addProductToCart(
          productId
        );

        closeBottomSheet();

        setTimeout(
          openCart,
          400
        );
      }
    );
}


/* =========================================================
   28. CART SHEET
   ========================================================= */

function openCart() {

  if (!STATE.cart.length) {

    openBottomSheet(`
      <h2 id="sheetTitle">
        Keranjang
      </h2>

      ${createSheetEmptyState(
        'ph-shopping-cart',
        'Keranjang masih kosong',
        'Produk yang kamu tambahkan akan muncul di sini.'
      )}
    `);

    return;
  }


  const itemsHTML =
    STATE.cart
      .map(createCartItemTemplate)
      .join('');


  const total =
    STATE.cart.reduce(
      (sum, item) =>
        sum +
        item.price *
        item.quantity,
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
          font-size:11px;
          color:var(--sunset-500);
          font-weight:700;
        "
      >
        Kosongkan
      </button>

    </div>


    <div style="margin-top:12px">

      ${itemsHTML}

    </div>


    <div
      style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        margin-top:18px;
        padding-top:14px;
        border-top:1px solid rgba(0,0,0,.08);
      "
    >

      <span
        style="
          font-size:12px;
          color:var(--text-secondary);
        "
      >
        Total
      </span>


      <strong
        style="
          color:var(--sunset-500);
          font-size:17px;
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
   29. CART ITEM TEMPLATE
   ========================================================= */

function createCartItemTemplate(item) {

  return `
    <div
      style="
        display:flex;
        gap:10px;
        padding:12px 0;
        border-bottom:1px solid rgba(0,0,0,.06);
      "
    >

      <img
        src="${escapeHTML(item.image)}"
        alt="${escapeHTML(item.name)}"
        style="
          width:62px;
          height:62px;
          object-fit:cover;
          border-radius:10px;
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
            font-size:12px;
            line-height:1.4;
          "
        >
          ${escapeHTML(item.name)}
        </strong>


        <small
          style="
            display:block;
            color:var(--text-tertiary);
            margin-top:2px;
          "
        >
          ${escapeHTML(item.seller || 'UMKM Lokal')}
        </small>


        <div
          style="
            font-size:13px;
            color:var(--sunset-500);
            font-weight:800;
            margin-top:5px;
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
              border-radius:8px;
              background:var(--forest-50);
            "
          >
            <i class="ph ph-minus"></i>
          </button>


          <strong
            style="
              min-width:18px;
              text-align:center;
              font-size:12px;
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
              border-radius:8px;
              background:var(--forest-50);
            "
          >
            <i class="ph ph-plus"></i>
          </button>


          <button
            type="button"
            data-action="remove-cart"
            data-product-id="${item.id}"
            style="
              margin-left:auto;
              font-size:11px;
              color:var(--sunset-500);
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
   30. CHECKOUT
   ========================================================= */

function checkoutCart() {

  if (!STATE.cart.length) return;


  openBottomSheet(`
    <h2 id="sheetTitle">
      Checkout
    </h2>


    <div
      style="
        margin-top:18px;
        padding:16px;
        border-radius:16px;
        background:var(--forest-50);
      "
    >

      <i
        class="ph ph-map-pin"
        style="
          font-size:22px;
          color:var(--forest-700);
        "
      ></i>


      <strong
        style="
          display:block;
          margin-top:8px;
        "
      >
        Alamat Pengiriman
      </strong>


      <p
        style="
          margin-top:5px;
          font-size:11px;
          line-height:1.6;
          color:var(--text-secondary);
        "
      >
        Nantinya pembeli dapat memilih alamat pengiriman
        setelah sistem akun dan database diaktifkan.
      </p>

    </div>


    <div
      style="
        margin-top:14px;
        padding:16px;
        border-radius:16px;
        background:var(--bg-tertiary);
      "
    >

      <i
        class="ph ph-wallet"
        style="
          font-size:22px;
          color:var(--forest-700);
        "
      ></i>


      <strong
        style="
          display:block;
          margin-top:8px;
        "
      >
        Metode Pembayaran
      </strong>


      <p
        style="
          margin-top:5px;
          font-size:11px;
          line-height:1.6;
          color:var(--text-secondary);
        "
      >
        Modul pembayaran akan dihubungkan pada fase backend.
      </p>

    </div>


    <button
      type="button"
      class="btn-primary"
      id="checkoutDemoButton"
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
      'checkoutDemoButton'
    )
    ?.addEventListener(
      'click',
      () => {

        showToast(
          'Checkout backend belum diaktifkan'
        );
      }
    );
}


/* =========================================================
   31. SEARCH
   ========================================================= */

function openSearch() {

  if (!DOM.searchOverlay) return;


  DOM.searchOverlay.hidden =
    false;


  DOM.searchOverlay.setAttribute(
    'aria-hidden',
    'false'
  );


  document.body.style.overflow =
    'hidden';


  setTimeout(
    () => {
      DOM.searchInput?.focus();
    },
    60
  );
}


function closeSearch() {

  if (!DOM.searchOverlay) return;


  DOM.searchOverlay.hidden =
    true;


  DOM.searchOverlay.setAttribute(
    'aria-hidden',
    'true'
  );


  document.body.style.overflow =
    '';
}


/* =========================================================
   32. SEARCH HANDLER
   ========================================================= */

function handleSearch(query) {

  const q =
    query
      .trim()
      .toLowerCase();


  STATE.searchQuery = q;


  if (!DOM.searchResults) return;


  if (!q) {

    renderSearchHint();

    return;
  }


  const results =
    DATA.posts.filter(
      post => {

        const text = [

          post.author,

          post.category,

          post.location,

          post.caption,

          post.product?.name

        ]
          .join(' ')
          .toLowerCase();


        return text.includes(q);
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
      .map(createSearchResultTemplate)
      .join('');
}


/* =========================================================
   33. SEARCH HINT
   ========================================================= */

function renderSearchHint() {

  if (!DOM.searchResults) return;


  DOM.searchResults.innerHTML = `
    <div
      style="
        padding:22px 6px;
      "
    >

      <strong
        style="
          display:block;
          font-size:13px;
        "
      >
        Cari di Pasar UMKM
      </strong>


      <p
        style="
          margin-top:5px;
          font-size:11px;
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
   34. SEARCH RESULT TEMPLATE
   ========================================================= */

function createSearchResultTemplate(post) {

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
        border-bottom:1px solid rgba(0,0,0,.06);
      "
    >

      <img
        src="${escapeHTML(
          product?.image || post.media
        )}"
        alt="${escapeHTML(
          product?.name || post.author
        )}"
        style="
          width:54px;
          height:54px;
          object-fit:cover;
          border-radius:11px;
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
            font-size:12px;
          "
        >
          ${escapeHTML(
            product?.name ||
            post.caption
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
          •
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
                  font-weight:800;
                  color:var(--sunset-500);
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
   35. SEARCH RESULT CLICK
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const result =
      event.target.closest(
        '[data-search-result]'
      );


    if (!result) return;


    const postId =
      Number(
        result.dataset.searchResult
      );


    closeSearch();


    setTimeout(
      () => scrollToPost(postId),
      100
    );
  }
);


/* =========================================================
   36. SCROLL TO POST
   ========================================================= */

function scrollToPost(postId) {

  STATE.activeCategory = null;

  renderFeed();


  requestAnimationFrame(
    () => {

      const post =
        document.getElementById(
          `post-${postId}`
        );


      post?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  );
}


/* =========================================================
   37. NOTIFICATIONS
   ========================================================= */

function openNotifications() {

  const notifications =
    DATA.notifications;


  const content =
    notifications.length
      ? notifications
          .map(createNotificationTemplate)
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
   38. NOTIFICATION TEMPLATE
   ========================================================= */

function createNotificationTemplate(item) {

  return `
    <div
      style="
        display:flex;
        gap:11px;
        padding:13px 0;
        border-bottom:1px solid rgba(0,0,0,.06);
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
          border-radius:50%;
          background:var(--forest-50);
          color:var(--forest-700);
        "
      >
        <i
          class="ph ${escapeHTML(item.icon)}"
          style="font-size:19px"
        ></i>
      </div>


      <div>

        <strong
          style="
            font-size:12px;
            line-height:1.4;
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
   39. MESSAGES
   ========================================================= */

function openMessages() {

  const messages =
    DATA.messages;


  const content =
    messages.length
      ? messages
          .map(createMessageTemplate)
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
   40. MESSAGE TEMPLATE
   ========================================================= */

function createMessageTemplate(message) {

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
        border-bottom:1px solid rgba(0,0,0,.06);
      "
    >

      <div
        style="
          width:42px;
          height:42px;
          display:flex;
          align-items:center;
          justify-content:center;
          border-radius:50%;
          background:var(--forest-100);
          color:var(--forest-700);
        "
      >
        <i class="ph ph-user"></i>
      </div>


      <div
        style="
          flex:1;
          min-width:0;
        "
      >

        <strong
          style="
            display:block;
            font-size:12px;
          "
        >
          ${escapeHTML(message.name)}
        </strong>


        <span
          style="
            display:block;
            margin-top:3px;
            font-size:11px;
            color:var(--text-secondary);
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
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
   41. MESSAGE CLICK
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const message =
      event.target.closest(
        '[data-message-id]'
      );


    if (!message) return;


    const data =
      DATA.messages.find(
        item =>
          item.id ===
          Number(
            message.dataset.messageId
          )
      );


    if (!data) return;


    openBottomSheet(`
      <h2 id="sheetTitle">
        ${escapeHTML(data.name)}
      </h2>

      <div
        style="
          margin-top:18px;
          padding:12px;
          border-radius:14px;
          background:var(--forest-50);
          font-size:12px;
          line-height:1.6;
        "
      >
        ${escapeHTML(data.text)}
      </div>

      <p
        style="
          margin-top:16px;
          font-size:11px;
          color:var(--text-tertiary);
          text-align:center;
        "
      >
        Sistem chat penuh akan diaktifkan bersama backend.
      </p>
    `);
  }
);


/* =========================================================
   42. STORY VIEW
   ========================================================= */

function openStory(storyId) {

  const story =
    DATA.stories.find(
      item =>
        item.id === storyId
    );


  if (!story) return;


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
        border-radius:16px;
      "
    >
  `);
}


/* =========================================================
   43. SELL SHEET
   ========================================================= */

function openSellSheet() {

  openBottomSheet(`
    <h2 id="sheetTitle">
      Jual di Pasar UMKM
    </h2>


    <p
      style="
        margin-top:5px;
        font-size:11px;
        line-height:1.6;
        color:var(--text-tertiary);
      "
    >
      Pilih aktivitas yang ingin dilakukan.
    </p>


    <div
      style="
        display:grid;
        gap:10px;
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
   44. SELL OPTION
   ========================================================= */

function createSellOption(
  icon,
  label,
  type
) {

  return `
    <button
      type="button"
      data-sell-option="${type}"
      style="
        width:100%;
        display:flex;
        align-items:center;
        gap:12px;
        padding:13px;
        border-radius:12px;
        background:var(--forest-50);
        color:var(--forest-800);
        text-align:left;
      "
    >

      <i
        class="ph ${icon}"
        style="font-size:21px"
      ></i>

      <strong
        style="font-size:12px"
      >
        ${escapeHTML(label)}
      </strong>

      <i
        class="ph ph-caret-right"
        style="
          margin-left:auto;
          opacity:.55;
        "
      ></i>

    </button>
  `;
}


/* =========================================================
   45. SELL OPTION CLICK
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const option =
      event.target.closest(
        '[data-sell-option]'
      );


    if (!option) return;


    const type =
      option.dataset.sellOption;


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
      `${labels[type] || 'Fitur'} akan tersedia setelah sistem akun aktif`
    );
  }
);


/* =========================================================
   46. SIDE MENU
   ========================================================= */

function renderSideMenu() {

  if (!DOM.sideMenuContent) return;


  DOM.sideMenuContent.innerHTML = `

    <div style="padding-top:8px">


      <div
        style="
          display:flex;
          align-items:center;
          gap:10px;
        "
      >

        <img
          src="assets/logo.png"
          alt="${CONFIG.APP_NAME}"
          style="
            width:38px;
            height:38px;
            object-fit:contain;
          "
        >


        <div>

          <div
            style="
              font-family:var(--font-display);
              font-size:21px;
              line-height:1.1;
              color:var(--forest-800);
              font-weight:700;
            "
          >
            ${CONFIG.APP_NAME}
          </div>


          <div
            style="
              margin-top:4px;
              color:var(--gold-600);
              font-size:9px;
              letter-spacing:.7px;
              text-transform:uppercase;
            "
          >
            ${CONFIG.LOCATION}
          </div>

        </div>

      </div>


      <div
        style="
          margin-top:28px;
          display:grid;
          gap:6px;
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
          border-top:1px solid rgba(0,0,0,.06);
        "
      >

        <div
          style="
            font-size:9px;
            line-height:1.5;
            color:var(--text-tertiary);
          "
        >
          Sebuah inisiatif dari
        </div>


        <div
          style="
            margin-top:3px;
            font-size:10px;
            line-height:1.5;
            font-weight:700;
            color:var(--forest-800);
          "
        >
          ${CONFIG.ORGANIZATION}
        </div>


        <div
          style="
            margin-top:7px;
            font-size:9px;
            color:var(--text-tertiary);
          "
        >
          Initiated by
          <strong>
            ${CONFIG.INITIATOR}
          </strong>
        </div>

      </div>

    </div>
  `;
}


/* =========================================================
   47. SIDE MENU ITEM
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
        display:flex;
        align-items:center;
        gap:12px;
        padding:12px;
        border-radius:12px;
        text-align:left;
        color:var(--text-primary);
      "
    >

      <i
        class="ph ${icon}"
        style="
          width:22px;
          font-size:20px;
          color:var(--forest-700);
        "
      ></i>


      <span
        style="
          font-size:13px;
          font-weight:500;
        "
      >
        ${escapeHTML(label)}
      </span>


      <i
        class="ph ph-caret-right"
        style="
          margin-left:auto;
          font-size:13px;
          color:var(--text-tertiary);
        "
      ></i>

    </button>
  `;
}


/* =========================================================
   48. SIDE MENU OPEN / CLOSE
   ========================================================= */

function openSideMenu() {

  if (!DOM.sideMenu) return;


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


  document.body.style.overflow =
    'hidden';
}


function closeSideMenu() {

  if (!DOM.sideMenu) return;


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


  document.body.style.overflow =
    '';
}


/* =========================================================
   49. SIDE MENU ACTIONS
   ========================================================= */

function handleSideMenuAction(action) {

  closeSideMenu();


  setTimeout(
    () => {

      switch (action) {

        case 'home':

          setActiveNavigation(
            'home'
          );

          STATE.activeCategory =
            null;

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
   50. CATEGORIES
   ========================================================= */

const CATEGORIES = [

  {
    icon: 'ph-hamburger',
    label: 'Kuliner'
  },

  {
    icon: 'ph-t-shirt',
    label: 'Fashion'
  },

  {
    icon: 'ph-sparkle',
    label: 'Kecantikan'
  },

  {
    icon: 'ph-laptop',
    label: 'Digital'
  },

  {
    icon: 'ph-device-mobile',
    label: 'Elektronik'
  },

  {
    icon: 'ph-house-line',
    label: 'Property'
  },

  {
    icon: 'ph-wallet',
    label: 'Finance'
  },

  {
    icon: 'ph-wrench',
    label: 'Jasa'
  },

  {
    icon: 'ph-hammer',
    label: 'Kerajinan'
  }
];


function openCategories() {

  const items =
    CATEGORIES
      .map(
        category =>
          categoryItem(
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
        margin-top:5px;
        font-size:11px;
        color:var(--text-tertiary);
      "
    >
      Temukan produk berdasarkan kategori.
    </p>


    <div
      style="
        display:grid;
        grid-template-columns:repeat(2,1fr);
        gap:10px;
        margin-top:16px;
      "
    >

      ${items}

    </div>
  `);
}


/* =========================================================
   51. CATEGORY ITEM
   ========================================================= */

function categoryItem(
  icon,
  label
) {

  return `
    <button
      type="button"
      data-category="${escapeHTML(label)}"
      style="
        padding:15px 8px;
        border-radius:12px;
        background:var(--forest-50);
        color:var(--forest-800);
      "
    >

      <i
        class="ph ${icon}"
        style="
          display:block;
          font-size:23px;
          margin-bottom:7px;
        "
      ></i>


      <span
        style="
          font-size:11px;
          font-weight:700;
        "
      >
        ${escapeHTML(label)}
      </span>

    </button>
  `;
}


/* =========================================================
   52. CATEGORY CLICK
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const button =
      event.target.closest(
        '[data-category]'
      );


    if (!button) return;


    const category =
      button.dataset.category;


    STATE.activeCategory =
      category;


    const results =
      DATA.posts.filter(
        post =>
          post.category
            .toLowerCase() ===
          category.toLowerCase()
      );


    closeBottomSheet();


    setTimeout(
      () => {

        renderCategoryFeed(
          category,
          results
        );

      },
      380
    );
  }
);


/* =========================================================
   53. CATEGORY FEED
   ========================================================= */

function renderCategoryFeed(
  category,
  results
) {

  if (!DOM.feed) return;


  const header = `
    <div
      style="
        padding:14px 14px 12px;
        background:var(--bg-secondary);
        border-bottom:1px solid rgba(0,0,0,.06);
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
              color:var(--text-tertiary);
              font-size:9px;
              text-transform:uppercase;
              letter-spacing:.6px;
            "
          >
            Kategori
          </small>


          <strong
            style="
              display:block;
              margin-top:2px;
              color:var(--forest-800);
              font-size:15px;
            "
          >
            ${escapeHTML(category)}
          </strong>

        </div>


        <button
          type="button"
          data-action="clear-category"
          style="
            font-size:11px;
            color:var(--forest-700);
            font-weight:700;
          "
        >
          Lihat Semua
        </button>

      </div>

    </div>
  `;


  if (!results.length) {

    DOM.feed.innerHTML =
      header +
      `
        <div class="empty-state">

          <i class="ph ph-package"></i>

          <div class="empty-state-title">
            Belum ada produk ${escapeHTML(category)}
          </div>

          <div class="empty-state-text">
            Produk pada kategori ini akan muncul setelah UMKM mulai mengunggah produk.
          </div>

        </div>
      `;

    return;
  }


  DOM.feed.innerHTML =
    header +
    results
      .map(createPostTemplate)
      .join('');


  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}


/* =========================================================
   54. CLEAR CATEGORY
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
   55. STORES / UMKM
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
        'UMKM yang bergabung akan muncul di halaman ini.'
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
              border-bottom:1px solid rgba(0,0,0,.06);
            "
          >

            <img
              src="${escapeHTML(store.avatar)}"
              alt="${escapeHTML(store.name)}"
              style="
                width:48px;
                height:48px;
                border-radius:50%;
                object-fit:cover;
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
                  font-size:12px;
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
                •
                ${escapeHTML(store.location)}
              </small>

            </div>


            <i
              class="ph ph-caret-right"
              style="
                color:var(--text-tertiary);
              "
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
        margin-top:5px;
        font-size:11px;
        color:var(--text-tertiary);
      "
    >
      Temukan pelaku usaha lokal di Pasar UMKM.
    </p>


    <div style="margin-top:14px">

      ${content}

    </div>
  `);
}


/* =========================================================
   56. GET STORES
   ========================================================= */

function getStores() {

  const map =
    new Map();


  DATA.posts.forEach(
    post => {

      if (!map.has(post.author)) {

        map.set(
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


  return [...map.values()];
}


/* =========================================================
   57. STORE CLICK
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const button =
      event.target.closest(
        '[data-store-name]'
      );


    if (!button) return;


    const storeName =
      button.dataset.storeName;


    const posts =
      DATA.posts.filter(
        post =>
          post.author === storeName
      );


    if (!posts.length) return;


    closeBottomSheet();


    setTimeout(
      () => {

        renderFeed(posts);

        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });

        showToast(
          `Menampilkan produk ${storeName}`
        );

      },
      380
    );
  }
);


/* =========================================================
   58. ORDERS
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
        'Pesanan yang kamu buat akan muncul di sini.'
      )}
    `);

    return;
  }
}


/* =========================================================
   59. FAVORITES
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
        'Simpan postingan atau produk yang kamu sukai untuk menemukannya lagi dengan mudah.'
      )}
    `);

    return;
  }


  const items =
    favorites
      .map(
        post => `
          <button
            type="button"
            data-favorite-post="${post.id}"
            style="
              width:100%;
              display:flex;
              gap:11px;
              align-items:center;
              padding:11px 0;
              text-align:left;
              border-bottom:1px solid rgba(0,0,0,.06);
            "
          >

            <img
              src="${escapeHTML(post.media)}"
              alt="${escapeHTML(post.author)}"
              style="
                width:54px;
                height:54px;
                object-fit:cover;
                border-radius:11px;
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
                  font-size:12px;
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

      ${items}

    </div>
  `);
}


/* =========================================================
   60. FAVORITE CLICK
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const button =
      event.target.closest(
        '[data-favorite-post]'
      );


    if (!button) return;


    const postId =
      Number(
        button.dataset.favoritePost
      );


    closeBottomSheet();


    setTimeout(
      () => scrollToPost(postId),
      380
    );
  }
);


/* =========================================================
   61. ABOUT
   ========================================================= */

function openAbout() {

  openBottomSheet(`
    <div
      style="
        text-align:center;
        padding-top:4px;
      "
    >

      <img
        src="assets/logo.png"
        alt="${CONFIG.APP_NAME}"
        style="
          width:72px;
          height:72px;
          object-fit:contain;
          margin:0 auto;
        "
      >


      <h2
        id="sheetTitle"
        style="
          margin-top:12px;
          font-family:var(--font-display);
          color:var(--forest-800);
        "
      >
        ${CONFIG.APP_NAME}
      </h2>


      <div
        style="
          margin-top:4px;
          color:var(--gold-600);
          font-size:9px;
          letter-spacing:1px;
          text-transform:uppercase;
        "
      >
        Social Marketplace UMKM Lokal
      </div>

    </div>


    <div
      style="
        margin-top:20px;
        font-size:12px;
        line-height:1.75;
        color:var(--text-secondary);
      "
    >

      <p>
        Pasar UMKM adalah platform digital yang dirancang
        untuk membantu masyarakat menemukan, mendukung,
        mempromosikan dan membeli produk dari UMKM lokal.
      </p>


      <p style="margin-top:12px">
        Platform ini menggabungkan pengalaman marketplace
        dengan fitur sosial agar pelaku UMKM dapat
        memperkenalkan produk, membangun audiens dan
        berinteraksi dengan calon pembeli.
      </p>

    </div>


    <div
      style="
        margin-top:20px;
        padding:16px;
        border-radius:16px;
        background:var(--forest-50);
      "
    >

      <div
        style="
          font-size:9px;
          letter-spacing:.7px;
          text-transform:uppercase;
          color:var(--text-tertiary);
        "
      >
        Sebuah inisiatif dari
      </div>


      <strong
        style="
          display:block;
          margin-top:5px;
          font-size:13px;
          line-height:1.45;
          color:var(--forest-800);
        "
      >
        ${CONFIG.ORGANIZATION}
      </strong>

    </div>


    <div
      style="
        margin-top:12px;
        padding:16px;
        border-radius:16px;
        background:var(--bg-tertiary);
      "
    >

      <div
        style="
          font-size:9px;
          letter-spacing:.7px;
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
          font-size:14px;
          color:var(--text-primary);
        "
      >
        ${CONFIG.INITIATOR}
      </strong>

    </div>


    <div
      style="
        margin-top:18px;
        text-align:center;
        font-size:9px;
        line-height:1.6;
        color:var(--text-tertiary);
      "
    >
      © 2026 ${CONFIG.APP_NAME}<br>
      ${CONFIG.LOCATION}, Sumatera Selatan
    </div>
  `);
}


/* =========================================================
   62. HELP
   ========================================================= */

function openHelp() {

  openBottomSheet(`
    <h2 id="sheetTitle">
      Bantuan
    </h2>


    <p
      style="
        margin-top:5px;
        font-size:11px;
        color:var(--text-tertiary);
      "
    >
      Pusat bantuan Pasar UMKM.
    </p>


    <div
      style="
        display:grid;
        gap:8px;
        margin-top:18px;
      "
    >

      ${helpItem(
        'ph-shopping-cart',
        'Cara membeli produk'
      )}

      ${helpItem(
        'ph-storefront',
        'Cara menjadi penjual'
      )}

      ${helpItem(
        'ph-package',
        'Pesanan dan pengiriman'
      )}

      ${helpItem(
        'ph-wallet',
        'Pembayaran'
      )}

      ${helpItem(
        'ph-shield-check',
        'Keamanan akun'
      )}

      ${helpItem(
        'ph-headset',
        'Hubungi pengelola'
      )}

    </div>
  `);
}


/* =========================================================
   63. HELP ITEM
   ========================================================= */

function helpItem(
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
        border-radius:12px;
        background:var(--forest-50);
        text-align:left;
      "
    >

      <i
        class="ph ${icon}"
        style="
          color:var(--forest-700);
          font-size:19px;
        "
      ></i>


      <span
        style="
          font-size:12px;
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
      ></i>

    </button>
  `;
}


/* =========================================================
   64. HELP CLICK
   ========================================================= */

document.addEventListener(
  'click',
  event => {

    const button =
      event.target.closest(
        '[data-help-item]'
      );


    if (!button) return;


    const label =
      button.dataset.helpItem;


    showToast(
      `${label} akan dilengkapi pada tahap berikutnya`
    );
  }
);


/* =========================================================
   65. ACCOUNT
   ========================================================= */

function openAccount() {

  openBottomSheet(`
    <h2 id="sheetTitle">
      Akun
    </h2>


    <div
      style="
        padding:24px 0;
        text-align:center;
      "
    >

      <div
        style="
          width:68px;
          height:68px;
          margin:0 auto;
          display:flex;
          align-items:center;
          justify-content:center;
          background:var(--forest-100);
          color:var(--forest-700);
          border-radius:50%;
          font-size:30px;
        "
      >
        <i class="ph ph-user"></i>
      </div>


      <h3
        style="
          margin-top:12px;
        "
      >
        Selamat Datang
      </h3>


      <p
        style="
          margin-top:5px;
          font-size:11px;
          line-height:1.6;
          color:var(--text-tertiary);
        "
      >
        Masuk untuk membeli produk, menjual,
        mengelola toko, pesanan dan aktivitasmu.
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
   66. LOGIN PLACEHOLDER
   ========================================================= */

function openLogin() {

  openBottomSheet(`
    <h2 id="sheetTitle">
      Masuk ke Pasar UMKM
    </h2>


    <div
      style="
        margin-top:18px;
        padding:18px;
        border-radius:16px;
        background:var(--forest-50);
        text-align:center;
      "
    >

      <i
        class="ph ph-user-circle"
        style="
          font-size:34px;
          color:var(--forest-700);
        "
      ></i>


      <strong
        style="
          display:block;
          margin-top:10px;
          font-size:13px;
        "
      >
        Sistem akun sedang disiapkan
      </strong>


      <p
        style="
          margin-top:6px;
          font-size:11px;
          line-height:1.6;
          color:var(--text-secondary);
        "
      >
        Login dan pendaftaran akan dihubungkan
        ke backend serta database pada tahap berikutnya.
      </p>

    </div>
  `);
}


/* =========================================================
   67. BOTTOM SHEET
   ========================================================= */

function openBottomSheet(content) {

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


  DOM.bottomSheet.setAttribute(
    'aria-hidden',
    'false'
  );


  DOM.sheetOverlay.setAttribute(
    'aria-hidden',
    'false'
  );


  document.body.style.overflow =
    'hidden';
}


/* =========================================================
   68. CLOSE BOTTOM SHEET
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


  setTimeout(
    () => {

      DOM.sheetOverlay.hidden =
        true;

      DOM.bottomSheet.hidden =
        true;

    },
    400
  );


  DOM.bottomSheet.setAttribute(
    'aria-hidden',
    'true'
  );


  DOM.sheetOverlay.setAttribute(
    'aria-hidden',
    'true'
  );


  document.body.style.overflow =
    '';
}


/* =========================================================
   69. NAVIGATION
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
   70. ACTIVE NAV
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
   71. BRAND HOME NAVIGATION
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
   72. STATIC EVENTS
   ========================================================= */

function bindEvents() {

  /* SIDE MENU ITEM */

  DOM.sideMenuContent
    ?.addEventListener(
      'click',
      event => {

        const button =
          event.target.closest(
            '[data-menu-action]'
          );


        if (!button) return;


        handleSideMenuAction(
          button.dataset.menuAction
        );
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


  /* SEARCH CLEAR */

  DOM.searchClearButton
    ?.addEventListener(
      'click',
      () => {

        if (!DOM.searchInput) return;


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


  /* ESCAPE */

  document.addEventListener(
    'keydown',
    handleEscape
  );


  /* SCROLL */

  window.addEventListener(
    'scroll',
    handleScroll,
    {
      passive: true
    }
  );


  bindNavigation();

  bindBrandNavigation();

  renderSearchHint();
}


/* =========================================================
   73. ESCAPE HANDLER
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
   74. HEADER SCROLL
   ========================================================= */

function handleScroll() {

  DOM.header?.classList.toggle(
    'scrolled',
    window.scrollY > 8
  );
}


/* =========================================================
   75. HEADER BADGES
   ========================================================= */

function updateHeaderBadges() {

  updateButtonBadge(
    DOM.notificationButton,
    DATA.notifications.filter(
      item => item.unread
    ).length
  );


  updateButtonBadge(
    DOM.messageButton,
    DATA.messages.filter(
      item => item.unread
    ).length
  );
}


/* =========================================================
   76. GENERIC BUTTON BADGE
   ========================================================= */

function updateButtonBadge(
  button,
  count
) {

  if (!button) return;


  const badge =
    button.querySelector(
      '.badge-dot'
    );


  if (!badge) return;


  badge.textContent =
    count > 99
      ? '99+'
      : count;


  badge.hidden =
    count === 0;


  button.classList.toggle(
    'has-badge',
    count > 0
  );
}


/* =========================================================
   77. CART BADGE
   ========================================================= */

function updateCartBadge() {

  const badge =
    document.querySelector(
      '.nav-badge'
    );


  if (!badge) return;


  const count =
    STATE.cart.reduce(
      (sum, item) =>
        sum + item.quantity,
      0
    );


  badge.textContent =
    count > 99
      ? '99+'
      : count;


  badge.hidden =
    count === 0;
}


/* =========================================================
   78. REFRESH CURRENT FEED
   ========================================================= */

function refreshCurrentFeed() {

  if (STATE.activeCategory) {

    const results =
      DATA.posts.filter(
        post =>
          post.category
            .toLowerCase() ===
          STATE.activeCategory
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
   79. LOCAL STORAGE
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
      'Gagal menyimpan state Pasar UMKM:',
      error
    );
  }
}


/* =========================================================
   80. RESTORE STATE
   ========================================================= */

function restoreState() {

  try {

    const raw =
      localStorage.getItem(
        CONFIG.STORAGE_KEY
      );


    if (!raw) return;


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
      Array.isArray(saved.cart)
        ? saved.cart
        : [];


    STATE.orders =
      Array.isArray(saved.orders)
        ? saved.orders
        : [];

  } catch (error) {

    console.warn(
      'Gagal membaca state Pasar UMKM:',
      error
    );
  }
}


/* =========================================================
   81. CLEAR LOCAL STATE
   ========================================================= */

function clearState() {

  localStorage.removeItem(
    CONFIG.STORAGE_KEY
  );


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
    'Data lokal berhasil direset'
  );
}


/* =========================================================
   82. EMPTY STATE HELPER
   ========================================================= */

function createSheetEmptyState(
  icon,
  title,
  description
) {

  return `
    <div class="empty-state">

      <i class="ph ${icon}"></i>


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
   83. LOADING
   ========================================================= */

function hideLoading() {

  if (!DOM.appLoading) return;


  DOM.appLoading.hidden =
    true;


  DOM.appLoading.setAttribute(
    'aria-hidden',
    'true'
  );
}


/* =========================================================
   84. TOAST
   ========================================================= */

let toastTimer;


function showToast(message) {

  if (!DOM.toast) return;


  clearTimeout(
    toastTimer
  );


  DOM.toast.textContent =
    message;


  DOM.toast.classList.add(
    'show'
  );


  toastTimer =
    setTimeout(
      () => {

        DOM.toast.classList.remove(
          'show'
        );

      },
      2300
    );
}


/* =========================================================
   85. RUPIAH FORMATTER
   ========================================================= */

function formatRupiah(value) {

  const number =
    Number(value) || 0;


  return new Intl.NumberFormat(
    'id-ID',
    {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }
  ).format(number);
}


/* =========================================================
   86. COMPACT NUMBER FORMATTER
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

      maximumFractionDigits: 1
    }
  ).format(number);
}


/* =========================================================
   87. HTML ESCAPE
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
   88. DEVELOPMENT API
   ========================================================= */

window.PasarUMKM = {

  CONFIG,

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


  /*
   * Sementara untuk pengujian developer.
   *
   * Contoh di Console:
   *
   * PasarUMKM.setDemoMode(false)
   *
   * CATATAN:
   * perubahan ini hanya berlaku sampai halaman direfresh.
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
        ? 'Mode demo diaktifkan'
        : 'Mode demo dinonaktifkan'
    );
  }
};


/* =========================================================
   END — PASAR UMKM APP.JS v3.0
   ========================================================= */
