/* =========================================================
   PASAR UMKM — APP.JS v2.0
   Social Marketplace Engine
   ========================================================= */

'use strict';


/* =========================================================
   01. DATA
   ========================================================= */

const DATA = {

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
      tags: ['#KopiLokal', '#UMKMSumsel'],
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
        'Dari menganyam sampai jadi tas cantik ini butuh 3 hari. Dibuat manual oleh pengrajin lokal.',
      tags: ['#KerajinanLokal', '#ProdukUMKM'],
      product: {
        id: 102,
        name: 'Tas Anyaman Purun Premium',
        image: 'assets/umkm2.jpg',
        rating: 5.0,
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
      tags: ['#Handmade', '#BanggaProdukLokal'],
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
  ]
};


/* =========================================================
   02. STATE
   ========================================================= */

const STATE = {
  likedPosts: new Set(),
  savedPosts: new Set(),
  cart: [],
  activeNav: 'home',
  currentSheet: null
};


/* =========================================================
   03. DOM CACHE
   ========================================================= */

const DOM = {};

function cacheDOM() {
  DOM.header = document.getElementById('header');

  DOM.stories = document.getElementById('stories');
  DOM.feed = document.getElementById('feed');

  DOM.menuButton = document.getElementById('menuButton');
  DOM.closeMenuButton = document.getElementById('closeMenuButton');
  DOM.sideMenu = document.getElementById('sideMenu');
  DOM.sideMenuContent = document.getElementById('sideMenuContent');

  DOM.searchButton = document.getElementById('searchButton');
  DOM.closeSearchButton = document.getElementById('closeSearchButton');
  DOM.searchOverlay = document.getElementById('searchOverlay');
  DOM.searchInput = document.getElementById('searchInput');
  DOM.searchClearButton = document.getElementById('searchClearButton');
  DOM.searchResults = document.getElementById('searchResults');

  DOM.notificationButton = document.getElementById('notificationButton');
  DOM.messageButton = document.getElementById('messageButton');

  DOM.appNavigation = document.getElementById('appNavigation');

  DOM.toast = document.getElementById('toast');

  DOM.sheetOverlay = document.getElementById('sheetOverlay');
  DOM.bottomSheet = document.getElementById('bottomSheet');
  DOM.sheetContent = document.getElementById('sheetContent');

  DOM.appLoading = document.getElementById('appLoading');
}


/* =========================================================
   04. INIT
   ========================================================= */

document.addEventListener('DOMContentLoaded', init);

function init() {
  cacheDOM();
  restoreState();

  renderStories();
  renderFeed();
  renderSideMenu();

  bindStaticEvents();
  updateCartBadge();
  hideLoading();

  handleScroll();
}


/* =========================================================
   05. STORIES
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
      <span class="story-name">Jual</span>
    </button>
  `;

  const items = DATA.stories.map(story => {
    return `
      <button
        type="button"
        class="story-item
          ${story.hasUpdate ? 'has-update' : ''}
          ${story.live ? 'live' : ''}"
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
  }).join('');

  DOM.stories.innerHTML = addStory + items;
}


/* =========================================================
   06. FEED
   ========================================================= */

function renderFeed(posts = DATA.posts) {
  if (!DOM.feed) return;

  if (!posts.length) {
    DOM.feed.innerHTML = `
      <div class="empty-state">
        <i class="ph ph-package"></i>
        <div class="empty-state-title">Belum ada produk</div>
        <div class="empty-state-text">
          Coba kategori lain atau cari UMKM lainnya.
        </div>
      </div>
    `;
    return;
  }

  DOM.feed.innerHTML = posts
    .map(post => createPostTemplate(post))
    .join('');
}


function createPostTemplate(post) {
  const liked = STATE.likedPosts.has(post.id);
  const saved = STATE.savedPosts.has(post.id);

  return `
    <article class="post-card" data-post-id="${post.id}">

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
                ? '<i class="ph-fill ph-seal-check verified-badge"></i>'
                : ''
            }
          </div>

          <div class="post-context">
            <span>${escapeHTML(post.location)}</span>
            <span class="dot"></span>
            <span>${escapeHTML(post.time)}</span>
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


      <div class="post-media ${post.mediaType === 'video' ? 'video' : 'square'}">

        <img
          src="${escapeHTML(post.media)}"
          alt="${escapeHTML(post.caption)}"
          loading="lazy"
          decoding="async"
        >

        ${
          post.mediaType === 'video'
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


      <div class="post-actions">

        <div class="actions-left">

          <button
            type="button"
            class="action-btn ${liked ? 'liked' : ''}"
            data-action="like"
            data-post-id="${post.id}"
            aria-pressed="${liked}"
          >
            <i class="${liked ? 'ph-fill' : 'ph'} ph-heart"></i>
            <span>
              ${formatCompact(post.likes + (liked ? 1 : 0))}
            </span>
          </button>


          <button
            type="button"
            class="action-btn"
            data-action="comments"
            data-post-id="${post.id}"
          >
            <i class="ph ph-chat-circle"></i>
            <span>${formatCompact(post.comments)}</span>
          </button>


          <button
            type="button"
            class="action-btn"
            data-action="share"
            data-post-id="${post.id}"
          >
            <i class="ph ph-paper-plane-tilt"></i>
            <span>${formatCompact(post.shares)}</span>
          </button>

        </div>


        <button
          type="button"
          class="action-btn ${saved ? 'saved' : ''}"
          data-action="save"
          data-post-id="${post.id}"
          aria-label="Simpan postingan"
        >
          <i class="${saved ? 'ph-fill' : 'ph'} ph-bookmark-simple"></i>
        </button>

      </div>


      <div class="post-stats">
        ${formatCompact(post.likes + (liked ? 1 : 0))} suka
      </div>


      <div class="post-caption">
        <span class="author">${escapeHTML(post.author)}</span>
        ${escapeHTML(post.caption)}

        <br>

        ${post.tags
          .map(tag => `<span class="tag">${escapeHTML(tag)}</span>`)
          .join(' ')
        }
      </div>


      <button
        type="button"
        class="view-comments"
        data-action="comments"
        data-post-id="${post.id}"
      >
        Lihat ${formatCompact(post.comments)} komentar
      </button>


      <div class="post-time">
        ${escapeHTML(post.time)}
      </div>


      ${createProductTemplate(post)}

    </article>
  `;
}


/* =========================================================
   07. PRODUCT CARD
   ========================================================= */

function createProductTemplate(post) {
  const product = post.product;

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
          •
          ${formatCompact(product.sold)} terjual
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
   08. GLOBAL CLICK DELEGATION
   ========================================================= */

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');

  if (!target) return;

  const action = target.dataset.action;

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
      toggleLike(Number(target.dataset.postId));
      break;

    case 'comments':
      openComments(Number(target.dataset.postId));
      break;

    case 'share':
      sharePost(Number(target.dataset.postId));
      break;

    case 'save':
      toggleSave(Number(target.dataset.postId));
      break;

    case 'post-menu':
      openPostMenu(Number(target.dataset.postId));
      break;

    case 'play-video':
      showToast('Video demo belum tersedia');
      break;

    case 'cart':
      addProductToCart(Number(target.dataset.productId));
      break;

    case 'buy':
      buyProduct(Number(target.dataset.productId));
      break;
  }
});


/* =========================================================
   09. STORIES EVENTS
   ========================================================= */

document.addEventListener('click', event => {
  const story = event.target.closest('[data-story-id]');

  if (story) {
    const id = Number(story.dataset.storyId);
    openStory(id);
  }

  const addStory = event.target.closest('[data-story-action="add"]');

  if (addStory) {
    openSellSheet();
  }
});


/* =========================================================
   10. LIKE
   ========================================================= */

function toggleLike(postId) {
  if (STATE.likedPosts.has(postId)) {
    STATE.likedPosts.delete(postId);
  } else {
    STATE.likedPosts.add(postId);
  }

  saveState();
  renderFeed();
}


/* =========================================================
   11. SAVE
   ========================================================= */

function toggleSave(postId) {
  if (STATE.savedPosts.has(postId)) {
    STATE.savedPosts.delete(postId);
    showToast('Dihapus dari tersimpan');
  } else {
    STATE.savedPosts.add(postId);
    showToast('Postingan disimpan');
  }

  saveState();
  renderFeed();
}


/* =========================================================
   12. COMMENTS
   ========================================================= */

function openComments(postId) {
  const post = DATA.posts.find(item => item.id === postId);

  if (!post) return;

  openBottomSheet(`
    <h2 id="sheetTitle">Komentar</h2>

    <div style="margin-top:16px">

      <div style="padding:12px 0;border-bottom:1px solid var(--border-subtle)">
        <strong style="font-size:13px">Pengguna Lokal</strong>
        <p style="font-size:12px;color:var(--text-secondary);margin-top:4px">
          Produknya bagus sekali 👍
        </p>
      </div>

      <div style="padding:12px 0;border-bottom:1px solid var(--border-subtle)">
        <strong style="font-size:13px">Pembeli UMKM</strong>
        <p style="font-size:12px;color:var(--text-secondary);margin-top:4px">
          Semoga UMKM lokal makin maju.
        </p>
      </div>

    </div>
  `);
}


/* =========================================================
   13. SHARE
   ========================================================= */

async function sharePost(postId) {
  const post = DATA.posts.find(item => item.id === postId);

  if (!post) return;

  const shareData = {
    title: `${post.author} — Pasar UMKM`,
    text: post.caption,
    url: window.location.href
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(window.location.href);
      showToast('Link berhasil disalin');
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      showToast('Tidak dapat membagikan saat ini');
    }
  }
}


/* =========================================================
   14. POST MENU
   ========================================================= */

function openPostMenu(postId) {
  const post = DATA.posts.find(item => item.id === postId);

  if (!post) return;

  openBottomSheet(`
    <h2 id="sheetTitle">${escapeHTML(post.author)}</h2>

    <div style="margin-top:18px;display:grid;gap:8px">

      <button class="menu-sheet-btn">
        <i class="ph ph-bookmark-simple"></i>
        Simpan postingan
      </button>

      <button class="menu-sheet-btn">
        <i class="ph ph-eye-slash"></i>
        Tidak tertarik
      </button>

      <button class="menu-sheet-btn">
        <i class="ph ph-flag"></i>
        Laporkan
      </button>

    </div>
  `);
}


/* =========================================================
   15. CART
   ========================================================= */

function addProductToCart(productId) {
  const product = findProduct(productId);

  if (!product) return;

  const existing = STATE.cart.find(item => item.id === product.id);

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

  showToast(`${product.name} masuk ke keranjang`);
}


/* =========================================================
   16. BUY
   ========================================================= */

function buyProduct(productId) {
  const product = findProduct(productId);

  if (!product) return;

  openBottomSheet(`
    <h2 id="sheetTitle">Beli Produk</h2>

    <div style="display:flex;gap:12px;margin-top:18px">

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

      <div>
        <strong style="font-size:14px">
          ${escapeHTML(product.name)}
        </strong>

        <div style="margin-top:6px;color:var(--sunset-500);font-weight:800">
          ${formatRupiah(product.price)}
        </div>
      </div>

    </div>

    <button
      type="button"
      class="btn-primary"
      style="width:100%;margin-top:22px;padding:12px"
      id="checkoutNow"
    >
      Lanjutkan Checkout
    </button>
  `);

  document.getElementById('checkoutNow')?.addEventListener('click', () => {
    addProductToCart(productId);
    closeBottomSheet();
    showToast('Produk siap di-checkout');
  });
}


/* =========================================================
   17. FIND PRODUCT
   ========================================================= */

function findProduct(productId) {
  for (const post of DATA.posts) {
    if (post.product?.id === productId) {
      return post.product;
    }
  }

  return null;
}


/* =========================================================
   18. CART SHEET
   ========================================================= */

function openCart() {
  if (!STATE.cart.length) {
    openBottomSheet(`
      <h2 id="sheetTitle">Keranjang</h2>

      <div class="empty-state">
        <i class="ph ph-shopping-cart"></i>
        <div class="empty-state-title">Keranjang masih kosong</div>
        <div class="empty-state-text">
          Tambahkan produk UMKM yang kamu suka.
        </div>
      </div>
    `);

    return;
  }

  const items = STATE.cart.map(item => `
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
          width:58px;
          height:58px;
          object-fit:cover;
          border-radius:10px;
        "
      >

      <div style="flex:1;min-width:0">

        <strong style="font-size:12px">
          ${escapeHTML(item.name)}
        </strong>

        <div style="font-size:11px;color:var(--text-tertiary);margin-top:3px">
          Jumlah: ${item.quantity}
        </div>

        <div style="font-size:13px;color:var(--sunset-500);font-weight:800;margin-top:4px">
          ${formatRupiah(item.price * item.quantity)}
        </div>

      </div>
    </div>
  `).join('');

  openBottomSheet(`
    <h2 id="sheetTitle">Keranjang</h2>
    <div style="margin-top:12px">${items}</div>

    <button
      type="button"
      class="btn-primary"
      style="width:100%;margin-top:18px;padding:12px"
    >
      Checkout
    </button>
  `);
}


/* =========================================================
   19. SEARCH
   ========================================================= */

function openSearch() {
  if (!DOM.searchOverlay) return;

  DOM.searchOverlay.hidden = false;
  DOM.searchOverlay.setAttribute('aria-hidden', 'false');

  setTimeout(() => {
    DOM.searchInput?.focus();
  }, 50);
}


function closeSearch() {
  if (!DOM.searchOverlay) return;

  DOM.searchOverlay.hidden = true;
  DOM.searchOverlay.setAttribute('aria-hidden', 'true');
}


function handleSearch(query) {
  const q = query.trim().toLowerCase();

  if (!q) {
    DOM.searchResults.innerHTML = '';
    return;
  }

  const results = DATA.posts.filter(post => {
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
  });

  if (!results.length) {
    DOM.searchResults.innerHTML = `
      <div class="empty-state">
        <i class="ph ph-magnifying-glass"></i>
        <div class="empty-state-title">Tidak ditemukan</div>
        <div class="empty-state-text">
          Coba kata kunci lain.
        </div>
      </div>
    `;
    return;
  }

  DOM.searchResults.innerHTML = results.map(post => `
    <button
      type="button"
      data-search-result="${post.id}"
      style="
        width:100%;
        display:flex;
        align-items:center;
        gap:10px;
        padding:10px 0;
        text-align:left;
        border-bottom:1px solid var(--border-subtle);
      "
    >

      <img
        src="${escapeHTML(post.product.image)}"
        alt=""
        style="
          width:52px;
          height:52px;
          object-fit:cover;
          border-radius:10px;
        "
      >

      <span>
        <strong style="display:block;font-size:12px">
          ${escapeHTML(post.product.name)}
        </strong>

        <small style="color:var(--text-tertiary)">
          ${escapeHTML(post.author)}
        </small>
      </span>

    </button>
  `).join('');
}


/* =========================================================
   20. NOTIFICATIONS
   ========================================================= */

function openNotifications() {
  openBottomSheet(`
    <h2 id="sheetTitle">Notifikasi</h2>

    <div style="margin-top:14px">

      ${notificationRow(
        'ph-heart',
        'Postingan UMKM mendapat interaksi baru',
        '5 menit lalu'
      )}

      ${notificationRow(
        'ph-shopping-cart',
        'Produk baru tersedia di Pasar UMKM',
        '30 menit lalu'
      )}

      ${notificationRow(
        'ph-storefront',
        'UMKM baru bergabung',
        '1 jam lalu'
      )}

    </div>
  `);
}


function notificationRow(icon, title, time) {
  return `
    <div
      style="
        display:flex;
        gap:10px;
        padding:12px 0;
        border-bottom:1px solid var(--border-subtle);
      "
    >
      <i
        class="ph ${icon}"
        style="
          font-size:20px;
          color:var(--forest-700);
        "
      ></i>

      <div>
        <strong style="font-size:12px">
          ${escapeHTML(title)}
        </strong>

        <small
          style="
            display:block;
            margin-top:3px;
            color:var(--text-tertiary);
          "
        >
          ${escapeHTML(time)}
        </small>
      </div>
    </div>
  `;
}


/* =========================================================
   21. MESSAGES
   ========================================================= */

function openMessages() {
  openBottomSheet(`
    <h2 id="sheetTitle">Pesan</h2>

    <div style="margin-top:14px">

      ${messageRow(
        'Pak Madi',
        'Kopi masih tersedia, kak.',
        '2 menit lalu'
      )}

      ${messageRow(
        'Ibu Siti',
        'Terima kasih sudah menghubungi toko kami.',
        '25 menit lalu'
      )}

    </div>
  `);
}


function messageRow(name, text, time) {
  return `
    <div
      style="
        padding:12px 0;
        border-bottom:1px solid var(--border-subtle);
      "
    >
      <strong style="font-size:12px">
        ${escapeHTML(name)}
      </strong>

      <div style="font-size:11px;color:var(--text-secondary);margin-top:3px">
        ${escapeHTML(text)}
      </div>

      <small style="font-size:9px;color:var(--text-tertiary)">
        ${escapeHTML(time)}
      </small>
    </div>
  `;
}


/* =========================================================
   22. STORY VIEW
   ========================================================= */

function openStory(storyId) {
  const story = DATA.stories.find(item => item.id === storyId);

  if (!story) return;

  openBottomSheet(`
    <h2 id="sheetTitle">${escapeHTML(story.name)}</h2>

    <img
      src="${escapeHTML(story.image)}"
      alt="${escapeHTML(story.name)}"
      style="
        width:100%;
        margin-top:14px;
        border-radius:14px;
      "
    >
  `);
}


/* =========================================================
   23. SELL SHEET
   ========================================================= */

function openSellSheet() {
  openBottomSheet(`
    <h2 id="sheetTitle">Jual di Pasar UMKM</h2>

    <div
      style="
        display:grid;
        gap:10px;
        margin-top:18px;
      "
    >

      ${sellOption('ph-package', 'Tambah Produk')}
      ${sellOption('ph-camera', 'Buat Postingan')}
      ${sellOption('ph-video-camera', 'Upload Video')}
      ${sellOption('ph-megaphone', 'Buat Promo')}

    </div>
  `);
}


function sellOption(icon, label) {
  return `
    <button
      type="button"
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
      <i class="ph ${icon}" style="font-size:21px"></i>
      <strong style="font-size:12px">${escapeHTML(label)}</strong>
    </button>
  `;
}


/* =========================================================
   24. SIDE MENU
   ========================================================= */

function renderSideMenu() {
  if (!DOM.sideMenuContent) return;

  DOM.sideMenuContent.innerHTML = `
    <div style="padding-top:8px">

      <div
        style="
          font-family:var(--font-display);
          font-size:24px;
          color:var(--forest-800);
          font-weight:700;
        "
      >
        Pasar UMKM
      </div>

      <div
        style="
          margin-top:4px;
          color:var(--gold-600);
          font-size:10px;
          letter-spacing:.7px;
          text-transform:uppercase;
        "
      >
        Lubuklinggau
      </div>

      <div
        style="
          margin-top:28px;
          display:grid;
          gap:8px;
        "
      >

        ${sideMenuItem('ph-house', 'Beranda')}
        ${sideMenuItem('ph-squares-four', 'Kategori')}
        ${sideMenuItem('ph-storefront', 'UMKM')}
        ${sideMenuItem('ph-receipt', 'Pesanan')}
        ${sideMenuItem('ph-heart', 'Favorit')}
        ${sideMenuItem('ph-question', 'Bantuan')}

      </div>

    </div>
  `;
}


function sideMenuItem(icon, label) {
  return `
    <button
      type="button"
      style="
        width:100%;
        display:flex;
        align-items:center;
        gap:12px;
        padding:12px;
        border-radius:12px;
        text-align:left;
      "
    >
      <i
        class="ph ${icon}"
        style="
          font-size:20px;
          color:var(--forest-700);
        "
      ></i>

      <span style="font-size:13px">
        ${escapeHTML(label)}
      </span>
    </button>
  `;
}


function openSideMenu() {
  DOM.sideMenu.hidden = false;
  DOM.sideMenu.setAttribute('aria-hidden', 'false');
  DOM.menuButton?.setAttribute('aria-expanded', 'true');
}


function closeSideMenu() {
  DOM.sideMenu.hidden = true;
  DOM.sideMenu.setAttribute('aria-hidden', 'true');
  DOM.menuButton?.setAttribute('aria-expanded', 'false');
}


/* =========================================================
   25. BOTTOM SHEET
   ========================================================= */

function openBottomSheet(content) {
  if (!DOM.bottomSheet || !DOM.sheetOverlay) return;

  DOM.sheetContent.innerHTML = content;

  DOM.sheetOverlay.hidden = false;
  DOM.bottomSheet.hidden = false;

  requestAnimationFrame(() => {
    DOM.sheetOverlay.classList.add('show');
    DOM.bottomSheet.classList.add('show');
  });

  DOM.bottomSheet.setAttribute('aria-hidden', 'false');
  DOM.sheetOverlay.setAttribute('aria-hidden', 'false');

  document.body.style.overflow = 'hidden';
}


function closeBottomSheet() {
  if (!DOM.bottomSheet || !DOM.sheetOverlay) return;

  DOM.sheetOverlay.classList.remove('show');
  DOM.bottomSheet.classList.remove('show');

  setTimeout(() => {
    DOM.sheetOverlay.hidden = true;
    DOM.bottomSheet.hidden = true;
  }, 350);

  DOM.bottomSheet.setAttribute('aria-hidden', 'true');
  DOM.sheetOverlay.setAttribute('aria-hidden', 'true');

  document.body.style.overflow = '';
}


/* =========================================================
   26. BOTTOM NAV
   ========================================================= */

function bindNavigation() {
  DOM.appNavigation
    ?.querySelectorAll('[data-nav]')
    .forEach(link => {

      link.addEventListener('click', event => {
        event.preventDefault();

        const nav = link.dataset.nav;

        setActiveNavigation(nav);

        switch (nav) {
          case 'home':
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
      });
    });
}


function setActiveNavigation(nav) {
  STATE.activeNav = nav;

  DOM.appNavigation
    ?.querySelectorAll('[data-nav]')
    .forEach(link => {
      const active = link.dataset.nav === nav;

      link.classList.toggle('active', active);

      if (active) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
}


/* =========================================================
   27. CATEGORIES
   ========================================================= */

function openCategories() {
  openBottomSheet(`
    <h2 id="sheetTitle">Kategori</h2>

    <div
      style="
        display:grid;
        grid-template-columns:repeat(2,1fr);
        gap:10px;
        margin-top:16px;
      "
    >

      ${categoryItem('ph-hamburger', 'Kuliner')}
      ${categoryItem('ph-t-shirt', 'Fashion')}
      ${categoryItem('ph-sparkle', 'Kecantikan')}
      ${categoryItem('ph-laptop', 'Digital')}
      ${categoryItem('ph-device-mobile', 'Elektronik')}
      ${categoryItem('ph-house-line', 'Property')}
      ${categoryItem('ph-wallet', 'Finance')}
      ${categoryItem('ph-wrench', 'Jasa')}

    </div>
  `);
}


function categoryItem(icon, label) {
  return `
    <button
      type="button"
      style="
        padding:14px 8px;
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
          margin-bottom:6px;
        "
      ></i>

      <span style="font-size:11px;font-weight:700">
        ${escapeHTML(label)}
      </span>
    </button>
  `;
}


/* =========================================================
   28. ACCOUNT
   ========================================================= */

function openAccount() {
  openBottomSheet(`
    <h2 id="sheetTitle">Akun</h2>

    <div style="padding:24px 0;text-align:center">

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

      <h3 style="margin-top:12px">
        Selamat Datang
      </h3>

      <p
        style="
          margin-top:4px;
          font-size:11px;
          color:var(--text-tertiary);
        "
      >
        Masuk untuk mengelola akun, toko dan pesanan.
      </p>

      <button
        type="button"
        class="btn-primary"
        style="
          width:100%;
          margin-top:18px;
          padding:11px;
        "
      >
        Masuk / Daftar
      </button>

    </div>
  `);
}


/* =========================================================
   29. STATIC EVENTS
   ========================================================= */

function bindStaticEvents() {
  DOM.searchInput?.addEventListener('input', event => {
    handleSearch(event.target.value);

    if (DOM.searchClearButton) {
      DOM.searchClearButton.hidden = !event.target.value;
    }
  });


  DOM.searchClearButton?.addEventListener('click', () => {
    DOM.searchInput.value = '';
    DOM.searchClearButton.hidden = true;
    DOM.searchResults.innerHTML = '';
    DOM.searchInput.focus();
  });


  DOM.sheetOverlay?.addEventListener('click', closeBottomSheet);


  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;

    if (!DOM.searchOverlay.hidden) {
      closeSearch();
      return;
    }

    if (!DOM.bottomSheet.hidden) {
      closeBottomSheet();
      return;
    }

    if (!DOM.sideMenu.hidden) {
      closeSideMenu();
    }
  });


  bindNavigation();

  window.addEventListener(
    'scroll',
    handleScroll,
    { passive: true }
  );
}


/* =========================================================
   30. HEADER SCROLL
   ========================================================= */

function handleScroll() {
  DOM.header?.classList.toggle(
    'scrolled',
    window.scrollY > 8
  );
}


/* =========================================================
   31. CART BADGE
   ========================================================= */

function updateCartBadge() {
  const badge = document.querySelector('.nav-badge');

  if (!badge) return;

  const count = STATE.cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  badge.textContent = count;
  badge.hidden = count === 0;
}


/* =========================================================
   32. LOCAL STORAGE
   ========================================================= */

function saveState() {
  try {
    localStorage.setItem(
      'pasarUmkmState',
      JSON.stringify({
        likedPosts: [...STATE.likedPosts],
        savedPosts: [...STATE.savedPosts],
        cart: STATE.cart
      })
    );
  } catch (error) {
    console.warn('Gagal menyimpan state:', error);
  }
}


function restoreState() {
  try {
    const saved = JSON.parse(
      localStorage.getItem('pasarUmkmState')
    );

    if (!saved) return;

    STATE.likedPosts = new Set(saved.likedPosts || []);
    STATE.savedPosts = new Set(saved.savedPosts || []);
    STATE.cart = Array.isArray(saved.cart)
      ? saved.cart
      : [];
  } catch (error) {
    console.warn('Gagal membaca state:', error);
  }
}


/* =========================================================
   33. LOADING
   ========================================================= */

function hideLoading() {
  if (!DOM.appLoading) return;

  DOM.appLoading.hidden = true;
}


/* =========================================================
   34. TOAST
   ========================================================= */

let toastTimer;

function showToast(message) {
  if (!DOM.toast) return;

  clearTimeout(toastTimer);

  DOM.toast.textContent = message;
  DOM.toast.classList.add('show');

  toastTimer = setTimeout(() => {
    DOM.toast.classList.remove('show');
  }, 2200);
}


/* =========================================================
   35. FORMATTERS
   ========================================================= */

function formatRupiah(value) {
  return new Intl.NumberFormat(
    'id-ID',
    {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }
  ).format(value);
}


function formatCompact(value) {
  return new Intl.NumberFormat(
    'id-ID',
    {
      notation: value >= 1000 ? 'compact' : 'standard',
      maximumFractionDigits: 1
    }
  ).format(value);
}


/* =========================================================
   36. SECURITY / ESCAPE
   ========================================================= */

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


/* =========================================================
   37. DEV API
   ========================================================= */

window.PasarUMKM = {
  DATA,
  STATE,

  renderFeed,
  renderStories,

  openCart,
  openCategories,
  openSellSheet,
  openAccount,

  showToast,

  clearState() {
    localStorage.removeItem('pasarUmkmState');

    STATE.likedPosts.clear();
    STATE.savedPosts.clear();
    STATE.cart = [];

    renderFeed();
    updateCartBadge();

    showToast('State aplikasi direset');
  }
};


/* =========================================================
   END
   ========================================================= */
