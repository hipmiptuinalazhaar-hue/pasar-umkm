/* =========================================================
PASAR UMKM — APP.JS v1.0
Marketplace Sosial UMKM Lubuklinggau
========================================================= */

'use strict';

/* =========================================================

1. DATA APLIKASI
   ========================================================= */

const APP = {
name: 'Pasar UMKM',
location: 'Lubuklinggau',
version: '1.0.0'
};

const storiesData = [
{
id: 1,
name: 'Pak Madi',
avatar: 'assets/stories/pak-madi.jpg',
hasUpdate: true,
live: false
},
{
id: 2,
name: 'Ibu Siti',
avatar: 'assets/stories/ibu-siti.jpg',
hasUpdate: true,
live: false
},
{
id: 3,
name: 'Madi Craft',
avatar: 'assets/stories/madi-craft.jpg',
hasUpdate: true,
live: true
},
{
id: 4,
name: 'Maepi Art',
avatar: 'assets/stories/maepi-art.jpg',
hasUpdate: true,
live: false
},
{
id: 5,
name: 'Kopi Linggau',
avatar: 'assets/stories/kopi-linggau.jpg',
hasUpdate: false,
live: false
}
];

const productsData = [
{
id: 1,
author: 'Madi Craft',
avatar: 'assets/stories/madi-craft.jpg',
verified: true,
context: 'Kerajinan Lokal',
time: '2 jam lalu',
image: 'assets/products/madi-craft.jpg',
type: 'image',
likes: 128,
comments: 14,
shares: 8,
caption:
'Produk kerajinan lokal buatan tangan dari Lubuklinggau. Cocok untuk hadiah, dekorasi, maupun koleksi pribadi.',
tags: ['#UMKMLokal', '#Lubuklinggau'],
product: {
image: 'assets/products/madi-craft.jpg',
name: 'Kerajinan Rotan Premium',
meta: '★★★★★ 4.9 • 86 terjual',
price: 'Rp125.000',
original: 'Rp150.000'
}
},

{
id: 2,
author: 'Kopi Linggau',
avatar: 'assets/stories/kopi-linggau.jpg',
verified: true,
context: 'Kuliner',
time: '5 jam lalu',
image: 'assets/products/kopi-linggau.jpg',
type: 'image',
likes: 246,
comments: 31,
shares: 17,
caption:
'Kopi khas Lubuklinggau dengan aroma kuat dan rasa yang seimbang. Cocok untuk menemani aktivitas harian.',
tags: ['#KopiLinggau', '#BanggaProdukLokal'],
product: {
image: 'assets/products/kopi-linggau.jpg',
name: 'Kopi Robusta Linggau',
meta: '★★★★★ 4.8 • 142 terjual',
price: 'Rp65.000',
original: ''
}
},

{
id: 3,
author: 'Maepi Art',
avatar: 'assets/stories/maepi-art.jpg',
verified: true,
context: 'Fashion & Kreatif',
time: 'Kemarin',
image: 'assets/products/maepi-art.jpg',
type: 'image',
likes: 89,
comments: 9,
shares: 5,
caption:
'Karya kreatif dari pelaku UMKM lokal. Dibuat dengan detail dan sentuhan khas yang tidak pasaran.',
tags: ['#MaepiArt', '#ProdukKreatif'],
product: {
image: 'assets/products/maepi-art.jpg',
name: 'Tas Handmade Lokal',
meta: '★★★★★ 4.7 • 54 terjual',
price: 'Rp185.000',
original: ''
}
}
];

/* =========================================================
2. STATE APLIKASI
========================================================= */

const state = {
likedPosts: new Set(),
cart: [],
searchQuery: '',
currentSheet: null,
menuOpen: false,
searchOpen: false
};

/* =========================================================
3. DOM ELEMENTS
========================================================= */

const DOM = {};

function cacheDOM() {
DOM.app = document.getElementById('app');
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

DOM.notificationButton =
document.getElementById('notificationButton');

DOM.messageButton =
document.getElementById('messageButton');

DOM.appNavigation =
document.getElementById('appNavigation');

DOM.toast = document.getElementById('toast');

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
4. INITIALIZATION
========================================================= */

document.addEventListener('DOMContentLoaded', init);

function init() {
cacheDOM();

renderStories();
renderFeed();
renderSideMenu();

bindEvents();
restoreState();

hideLoading();

console.log(
`%c${APP.name} ${APP.version}`,
'font-weight:700;color:#128c4e'
);
}

/* =========================================================
5. STORIES
========================================================= */

function renderStories() {
if (!DOM.stories) return;

const createStory = ` <div
   class="story-item story-add"
   role="listitem"
   tabindex="0"
   data-action="create-story"
   aria-label="Buat cerita"
 > <div class="story-ring"> <i class="ph ph-plus"></i> </div>

```
  <span class="story-name">
    Cerita Anda
  </span>
</div>
```

`;

const stories = storiesData.map(story => ` <div
   class="story-item ${story.hasUpdate ? 'has-update' : ''} ${story.live ? 'live' : ''}"
   role="listitem"
   tabindex="0"
   data-story-id="${story.id}"
   data-action="story"
   aria-label="Lihat cerita ${escapeHTML(story.name)}"
 > <div class="story-ring">

```
    <img
      src="${escapeAttribute(story.avatar)}"
      alt="${escapeAttribute(story.name)}"
      class="story-avatar"
      loading="lazy"
      onerror="this.style.display='none'"
    >

  </div>

  <span class="story-name">
    ${escapeHTML(story.name)}
  </span>
</div>
```

`).join('');

DOM.stories.innerHTML = createStory + stories;
}

/* =========================================================
6. FEED
========================================================= */

function renderFeed(data = productsData) {
if (!DOM.feed) return;

if (!data.length) {
DOM.feed.innerHTML = emptyState(
'ph-magnifying-glass',
'Produk tidak ditemukan',
'Coba gunakan kata kunci lain.'
);

```
return;
```

}

DOM.feed.innerHTML = data
.map((post, index) => createPostHTML(post, index))
.join('');

bindPostEvents();
}

function createPostHTML(post, index) {
const liked = state.likedPosts.has(post.id);

const tags = post.tags
.map(tag => `<span class="tag">${escapeHTML(tag)}</span>`)
.join(' ');

return ` <article
   class="post-card"
   data-post-id="${post.id}"
   style="animation-delay:${Math.min(index * 0.08, 0.24)}s"
 >

```
  <!-- POST HEADER -->
  <header class="post-header">

    <img
      src="${escapeAttribute(post.avatar)}"
      alt="${escapeAttribute(post.author)}"
      class="post-avatar"
      loading="lazy"
      onerror="this.style.display='none'"
    >

    <div class="post-meta">

      <div class="post-author">

        ${escapeHTML(post.author)}

        ${
          post.verified
            ? '<i class="ph-fill ph-seal-check verified-badge" aria-label="Terverifikasi"></i>'
            : ''
        }

      </div>

      <div class="post-context">

        <span>${escapeHTML(post.context)}</span>

        <span class="dot"></span>

        <span>${escapeHTML(post.time)}</span>

      </div>

    </div>

    <button
      class="post-menu"
      type="button"
      aria-label="Menu postingan"
      data-post-action="menu"
      data-post-id="${post.id}"
    >
      <i class="ph ph-dots-three"></i>
    </button>

  </header>


  <!-- MEDIA -->
  <div class="post-media">

    <img
      src="${escapeAttribute(post.image)}"
      alt="${escapeAttribute(post.caption)}"
      loading="${index === 0 ? 'eager' : 'lazy'}"
      onerror="handleImageError(this)"
    >

    ${
      post.type === 'video'
        ? `
          <span class="video-indicator">
            <i class="ph-fill ph-play"></i>
            VIDEO
          </span>

          <button
            class="play-button"
            type="button"
            aria-label="Putar video"
            data-post-action="play"
            data-post-id="${post.id}"
          ></button>
        `
        : ''
    }

  </div>


  <!-- ACTIONS -->
  <div class="post-actions">

    <div class="actions-left">

      <button
        class="action-btn ${liked ? 'liked' : ''}"
        type="button"
        data-post-action="like"
        data-post-id="${post.id}"
        aria-label="${liked ? 'Batal menyukai' : 'Sukai'}"
        aria-pressed="${liked}"
      >
        <i class="${liked ? 'ph-fill' : 'ph'} ph-heart"></i>
        <span>${formatNumber(post.likes + (liked ? 1 : 0))}</span>
      </button>


      <button
        class="action-btn"
        type="button"
        data-post-action="comment"
        data-post-id="${post.id}"
        aria-label="Komentar"
      >
        <i class="ph ph-chat-circle"></i>
        <span>${formatNumber(post.comments)}</span>
      </button>


      <button
        class="action-btn"
        type="button"
        data-post-action="share"
        data-post-id="${post.id}"
        aria-label="Bagikan"
      >
        <i class="ph ph-paper-plane-tilt"></i>
        <span>${formatNumber(post.shares)}</span>
      </button>

    </div>


    <button
      class="action-btn"
      type="button"
      data-post-action="save"
      data-post-id="${post.id}"
      aria-label="Simpan postingan"
    >
      <i class="ph ph-bookmark-simple"></i>
    </button>

  </div>


  <!-- STATS -->
  <div class="post-stats">
    ${formatNumber(post.likes + (liked ? 1 : 0))} suka
  </div>


  <!-- CAPTION -->
  <div class="post-caption">

    <span class="author">
      ${escapeHTML(post.author)}
    </span>

    ${escapeHTML(post.caption)}

    <br>

    ${tags}

  </div>


  <!-- COMMENTS -->
  <button
    class="view-comments"
    type="button"
    data-post-action="comment"
    data-post-id="${post.id}"
  >
    Lihat ${formatNumber(post.comments)} komentar
  </button>


  <!-- TIME -->
  <div class="post-time">
    ${escapeHTML(post.time)}
  </div>


  <!-- PRODUCT -->
  ${
    post.product
      ? createProductHTML(post)
      : ''
  }

</article>
```

`;
}

function createProductHTML(post) {
const product = post.product;

return ` <div class="product-card">

```
  <img
    src="${escapeAttribute(product.image)}"
    alt="${escapeAttribute(product.name)}"
    class="product-img"
    loading="lazy"
    onerror="handleImageError(this)"
  >

  <div class="product-info">

    <span class="product-badge">
      <i class="ph-fill ph-storefront"></i>
      Produk
    </span>

    <div class="product-name">
      ${escapeHTML(product.name)}
    </div>

    <div class="product-meta">
      <span class="stars">
        ${escapeHTML(product.meta.split('•')[0])}
      </span>
      ${
        product.meta.includes('•')
          ? '•' + escapeHTML(product.meta.split('•')[1])
          : ''
      }
    </div>

    <div class="product-price">

      ${escapeHTML(product.price)}

      ${
        product.original
          ? `
            <span class="original">
              ${escapeHTML(product.original)}
            </span>
          `
          : ''
      }

    </div>

  </div>


  <div class="product-actions">

    <button
      class="btn-icon"
      type="button"
      aria-label="Tambah ke keranjang"
      data-product-action="cart"
      data-post-id="${post.id}"
    >
      <i class="ph ph-shopping-cart"></i>
    </button>

    <button
      class="btn-primary"
      type="button"
      data-product-action="buy"
      data-post-id="${post.id}"
    >
      Beli
    </button>

  </div>

</div>
```

`;
}

/* =========================================================
7. POST EVENTS
========================================================= */

function bindPostEvents() {
document
.querySelectorAll('[data-post-action]')
.forEach(button => {

```
  button.addEventListener('click', event => {

    event.stopPropagation();

    const action =
      button.dataset.postAction;

    const postId =
      Number(button.dataset.postId);

    handlePostAction(action, postId);
  });

});
```

document
.querySelectorAll('[data-product-action]')
.forEach(button => {

```
  button.addEventListener('click', event => {

    event.stopPropagation();

    const action =
      button.dataset.productAction;

    const postId =
      Number(button.dataset.postId);

    handleProductAction(action, postId);
  });

});
```

}

function handlePostAction(action, postId) {
const post = productsData.find(item => item.id === postId);

if (!post) return;

switch (action) {

```
case 'like':
  toggleLike(postId);
  break;

case 'comment':
  openComments(post);
  break;

case 'share':
  sharePost(post);
  break;

case 'save':
  showToast('Postingan disimpan');
  break;

case 'menu':
  openPostMenu(post);
  break;

case 'play':
  showToast('Pemutar video akan tersedia segera');
  break;
```

}
}

/* =========================================================
8. LIKE SYSTEM
========================================================= */

function toggleLike(postId) {

if (state.likedPosts.has(postId)) {
state.likedPosts.delete(postId);
showToast('Like dibatalkan');
} else {
state.likedPosts.add(postId);
showToast('Postingan disukai ❤️');
}

saveState();
renderFeed();
}

/* =========================================================
9. PRODUCT ACTIONS
========================================================= */

function handleProductAction(action, postId) {

const post =
productsData.find(item => item.id === postId);

if (!post || !post.product) return;

switch (action) {

```
case 'cart':
  addToCart(post);
  break;

case 'buy':
  buyProduct(post);
  break;
```

}
}

function addToCart(post) {

const existing =
state.cart.find(item => item.id === post.id);

if (existing) {
existing.quantity += 1;
} else {
state.cart.push({
id: post.id,
name: post.product.name,
price: post.product.price,
quantity: 1
});
}

saveState();
updateCartBadge();

showToast(`${post.product.name} masuk keranjang`);
}

function buyProduct(post) {

addToCart(post);

openBottomSheet(` <h2 id="sheetTitle">Checkout</h2>

```
<div style="margin-top:16px">
  <strong>${escapeHTML(post.product.name)}</strong>

  <p style="margin-top:8px;color:var(--text-secondary)">
    ${escapeHTML(post.product.price)}
  </p>
</div>

<button
  class="btn-primary"
  style="width:100%;margin-top:24px;padding:13px"
  type="button"
  data-action="checkout"
>
  Lanjutkan Pembayaran
</button>
```

`);
}

/* =========================================================
10. COMMENTS
========================================================= */

function openComments(post) {

openBottomSheet(` <h2 id="sheetTitle">
Komentar </h2>

```
<p
  style="
    margin-top:8px;
    color:var(--text-secondary);
    font-size:13px;
  "
>
  ${formatNumber(post.comments)} komentar pada postingan
  ${escapeHTML(post.author)}.
</p>

<div style="margin-top:24px">

  <div
    style="
      padding:14px;
      background:var(--bg-tertiary);
      border-radius:var(--r-md);
      margin-bottom:10px;
    "
  >
    <strong>Pengguna Pasar</strong>
    <p style="margin-top:4px">
      Produknya bagus sekali.
    </p>
  </div>

  <div
    style="
      padding:14px;
      background:var(--bg-tertiary);
      border-radius:var(--r-md);
    "
  >
    <strong>UMKM Lover</strong>
    <p style="margin-top:4px">
      Bangga produk lokal Lubuklinggau.
    </p>
  </div>

</div>

<div
  style="
    display:flex;
    gap:8px;
    margin-top:20px;
  "
>

  <input
    id="commentInput"
    type="text"
    placeholder="Tulis komentar..."
    style="
      flex:1;
      border:1px solid var(--bg-tertiary);
      border-radius:var(--r-full);
      padding:11px 14px;
      outline:none;
      font:inherit;
    "
  >

  <button
    class="btn-primary"
    type="button"
    data-action="send-comment"
  >
    Kirim
  </button>

</div>
```

`);
}

/* =========================================================
11. SHARE
========================================================= */

async function sharePost(post) {

const shareData = {
title: `${post.author} — ${APP.name}`,
text: post.caption,
url: window.location.href
};

try {

```
if (
  navigator.share &&
  typeof navigator.share === 'function'
) {
  await navigator.share(shareData);
  return;
}

await navigator.clipboard.writeText(
  window.location.href
);

showToast('Tautan berhasil disalin');
```

} catch (error) {

```
if (error.name !== 'AbortError') {
  showToast('Tautan siap dibagikan');
}
```

}
}

/* =========================================================
12. POST MENU
========================================================= */

function openPostMenu(post) {

openBottomSheet(` <h2 id="sheetTitle">
${escapeHTML(post.author)} </h2>

```
<div style="margin-top:18px">

  <button
    class="sheet-action"
    type="button"
    data-action="save-post"
  >
    <i class="ph ph-bookmark-simple"></i>
    Simpan postingan
  </button>

  <button
    class="sheet-action"
    type="button"
    data-action="report-post"
  >
    <i class="ph ph-flag"></i>
    Laporkan
  </button>

  <button
    class="sheet-action"
    type="button"
    data-action="not-interested"
  >
    <i class="ph ph-eye-slash"></i>
    Tidak tertarik
  </button>

</div>
```

`);
}

/* =========================================================
13. SIDE MENU
========================================================= */

function renderSideMenu() {

if (!DOM.sideMenuContent) return;

DOM.sideMenuContent.innerHTML = `

```
<div style="padding:20px 4px">

  <div
    style="
      font-family:var(--font-display);
      font-size:25px;
      font-weight:700;
      color:var(--forest-800);
    "
  >
    Pasar UMKM
  </div>

  <div
    style="
      margin-top:4px;
      font-size:12px;
      color:var(--text-tertiary);
    "
  >
    Lubuklinggau
  </div>


  <div
    style="
      margin-top:28px;
      display:flex;
      flex-direction:column;
      gap:6px;
    "
  >

    ${menuItem('ph-house', 'Beranda', 'home')}

    ${menuItem('ph-squares-four', 'Kategori', 'categories')}

    ${menuItem('ph-storefront', 'Toko & UMKM', 'stores')}

    ${menuItem('ph-heart', 'Favorit', 'favorites')}

    ${menuItem('ph-shopping-cart', 'Keranjang', 'cart')}

    ${menuItem('ph-receipt', 'Pesanan Saya', 'orders')}

    ${menuItem('ph-map-pin', 'UMKM Terdekat', 'nearby')}

  </div>


  <div
    style="
      height:1px;
      background:var(--bg-tertiary);
      margin:24px 0;
    "
  ></div>


  <div
    style="
      font-size:11px;
      font-weight:700;
      text-transform:uppercase;
      letter-spacing:.6px;
      color:var(--text-tertiary);
      margin-bottom:8px;
    "
  >
    Lainnya
  </div>

  ${menuItem('ph-question', 'Bantuan', 'help')}

  ${menuItem('ph-info', 'Tentang Pasar UMKM', 'about')}

</div>
```

`;
}

function menuItem(icon, label, action) {

return ` <button
   type="button"
   data-menu-action="${escapeAttribute(action)}"
   style="
     width:100%;
     display:flex;
     align-items:center;
     gap:14px;
     padding:13px 12px;
     border-radius:var(--r-md);
     color:var(--text-primary);
     text-align:left;
     font-size:14px;
   "
 > <i
     class="ph ${icon}"
     style="
       font-size:21px;
       color:var(--forest-700);
     "
   ></i>

```
  <span>${escapeHTML(label)}</span>
</button>
```

`;
}

/* =========================================================
14. SEARCH
========================================================= */

function openSearch() {

if (!DOM.searchOverlay) return;

state.searchOpen = true;

DOM.searchOverlay.hidden = false;
DOM.searchOverlay.setAttribute('aria-hidden', 'false');

requestAnimationFrame(() => {
DOM.searchOverlay.classList.add('show');

```
if (DOM.searchInput) {
  DOM.searchInput.focus();
}
```

});

document.body.classList.add('modal-open');
}

function closeSearch() {

state.searchOpen = false;

DOM.searchOverlay.classList.remove('show');
DOM.searchOverlay.setAttribute('aria-hidden', 'true');

setTimeout(() => {
DOM.searchOverlay.hidden = true;
}, 300);

document.body.classList.remove('modal-open');
}

function performSearch(query) {

const cleanQuery =
query.trim().toLowerCase();

state.searchQuery = cleanQuery;

if (DOM.searchClearButton) {
DOM.searchClearButton.hidden =
!cleanQuery;
}

if (!cleanQuery) {

```
renderSearchResults([]);

return;
```

}

const results =
productsData.filter(post => {

```
  const searchable = [
    post.author,
    post.context,
    post.caption,
    post.product?.name || '',
    ...(post.tags || [])
  ]
    .join(' ')
    .toLowerCase();

  return searchable.includes(cleanQuery);
});
```

renderSearchResults(results);
}

function renderSearchResults(results) {

if (!DOM.searchResults) return;

if (!state.searchQuery) {

```
DOM.searchResults.innerHTML = `
  <div
    style="
      padding:48px 20px;
      text-align:center;
      color:var(--text-tertiary);
    "
  >
    <i
      class="ph ph-magnifying-glass"
      style="
        font-size:42px;
        display:block;
        margin-bottom:12px;
      "
    ></i>

    <strong
      style="
        display:block;
        color:var(--text-secondary);
      "
    >
      Cari produk atau UMKM
    </strong>

    <span
      style="
        display:block;
        margin-top:5px;
        font-size:12px;
      "
    >
      Misalnya: kopi, kerajinan, fashion
    </span>
  </div>
`;

return;
```

}

if (!results.length) {

```
DOM.searchResults.innerHTML =
  emptyState(
    'ph-package',
    'Tidak ada hasil',
    `Tidak menemukan "${escapeHTML(state.searchQuery)}".`
  );

return;
```

}

DOM.searchResults.innerHTML = results
.map(post => ` <button
     type="button"
     class="search-result-item"
     data-search-post="${post.id}"
     style="
       width:100%;
       display:flex;
       align-items:center;
       gap:12px;
       padding:12px 4px;
       text-align:left;
       border-bottom:1px solid var(--bg-tertiary);
     "
   >

```
    <img
      src="${escapeAttribute(post.image)}"
      alt=""
      style="
        width:58px;
        height:58px;
        object-fit:cover;
        border-radius:var(--r-md);
      "
    >

    <span style="min-width:0">

      <strong
        style="
          display:block;
          font-size:14px;
        "
      >
        ${escapeHTML(post.product?.name || post.author)}
      </strong>

      <small
        style="
          display:block;
          margin-top:4px;
          color:var(--text-tertiary);
        "
      >
        ${escapeHTML(post.author)}
      </small>

    </span>

  </button>
`)
.join('');
```

DOM.searchResults
.querySelectorAll('[data-search-post]')
.forEach(button => {

```
  button.addEventListener('click', () => {

    const id =
      Number(button.dataset.searchPost);

    closeSearch();

    setTimeout(() => {

      const target =
        document.querySelector(
          `.post-card[data-post-id="${id}"]`
        );

      target?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });

    }, 350);

  });

});
```

}

/* =========================================================
15. NOTIFICATION
========================================================= */

function openNotifications() {

openBottomSheet(` <h2 id="sheetTitle">
Notifikasi </h2>

```
<div style="margin-top:20px">

  ${notificationItem(
    'ph-heart',
    'Seseorang menyukai postingan Anda',
    '5 menit lalu'
  )}

  ${notificationItem(
    'ph-shopping-cart',
    'Pesanan baru sedang diproses',
    '32 menit lalu'
  )}

  ${notificationItem(
    'ph-seal-check',
    'UMKM baru bergabung',
    '1 jam lalu'
  )}

</div>
```

`);
}

function notificationItem(icon, title, time) {

return ` <div
   style="
     display:flex;
     gap:12px;
     padding:14px 0;
     border-bottom:1px solid var(--bg-tertiary);
   "
 >

```
  <div
    style="
      width:38px;
      height:38px;
      border-radius:50%;
      background:var(--forest-50);
      color:var(--forest-700);
      display:flex;
      align-items:center;
      justify-content:center;
      flex-shrink:0;
    "
  >
    <i class="ph ${icon}"></i>
  </div>

  <div>

    <strong
      style="
        display:block;
        font-size:13px;
      "
    >
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
```

`;
}

/* =========================================================
16. MESSAGES
========================================================= */

function openMessages() {

openBottomSheet(` <h2 id="sheetTitle">
Pesan </h2>

```
<div style="margin-top:20px">

  ${messageItem(
    'Madi Craft',
    'Apakah produknya masih tersedia?',
    '2 menit lalu'
  )}

  ${messageItem(
    'Kopi Linggau',
    'Pesanan Anda sedang diproses.',
    '20 menit lalu'
  )}

</div>
```

`);
}

function messageItem(name, text, time) {

return ` <button
   type="button"
   style="
     width:100%;
     display:flex;
     align-items:center;
     gap:12px;
     text-align:left;
     padding:13px 0;
     border-bottom:1px solid var(--bg-tertiary);
   "
 >

```
  <div
    style="
      width:42px;
      height:42px;
      border-radius:50%;
      background:var(--forest-100);
      display:flex;
      align-items:center;
      justify-content:center;
      color:var(--forest-700);
      flex-shrink:0;
    "
  >
    <i class="ph ph-storefront"></i>
  </div>

  <div style="min-width:0">

    <strong
      style="
        display:block;
        font-size:13px;
      "
    >
      ${escapeHTML(name)}
    </strong>

    <span
      style="
        display:block;
        margin-top:3px;
        font-size:12px;
        color:var(--text-secondary);
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      "
    >
      ${escapeHTML(text)}
    </span>

  </div>

  <small
    style="
      margin-left:auto;
      color:var(--text-tertiary);
      white-space:nowrap;
    "
  >
    ${escapeHTML(time)}
  </small>

</button>
```

`;
}

/* =========================================================
17. BOTTOM SHEET
========================================================= */

function openBottomSheet(content) {

if (!DOM.bottomSheet || !DOM.sheetOverlay) return;

DOM.sheetContent.innerHTML = content;

DOM.bottomSheet.hidden = false;
DOM.sheetOverlay.hidden = false;

DOM.bottomSheet.setAttribute(
'aria-hidden',
'false'
);

DOM.sheetOverlay.setAttribute(
'aria-hidden',
'false'
);

requestAnimationFrame(() => {

```
DOM.bottomSheet.classList.add('show');
DOM.sheetOverlay.classList.add('show');
```

});

state.currentSheet = true;

bindSheetEvents();

document.body.classList.add('modal-open');
}

function closeBottomSheet() {

DOM.bottomSheet?.classList.remove('show');
DOM.sheetOverlay?.classList.remove('show');

DOM.bottomSheet?.setAttribute(
'aria-hidden',
'true'
);

DOM.sheetOverlay?.setAttribute(
'aria-hidden',
'true'
);

setTimeout(() => {

```
if (DOM.bottomSheet) {
  DOM.bottomSheet.hidden = true;
}

if (DOM.sheetOverlay) {
  DOM.sheetOverlay.hidden = true;
}
```

}, 300);

state.currentSheet = null;

document.body.classList.remove('modal-open');
}

function bindSheetEvents() {

DOM.sheetContent
?.querySelectorAll('[data-action]')
.forEach(button => {

```
  button.addEventListener('click', () => {

    const action =
      button.dataset.action;

    switch (action) {

      case 'checkout':
        showToast('Checkout berhasil dibuka');
        closeBottomSheet();
        break;

      case 'send-comment':
        sendComment();
        break;

      case 'save-post':
        showToast('Postingan disimpan');
        closeBottomSheet();
        break;

      case 'report-post':
        showToast('Terima kasih, laporan diterima');
        closeBottomSheet();
        break;

      case 'not-interested':
        showToast('Postingan disembunyikan');
        closeBottomSheet();
        break;

    }

  });

});
```

}

function sendComment() {

const input =
document.getElementById('commentInput');

if (!input) return;

const text =
input.value.trim();

if (!text) {

```
showToast('Tulis komentar terlebih dahulu');

input.focus();

return;
```

}

input.value = '';

showToast('Komentar berhasil dikirim');

}

/* =========================================================
18. SIDE MENU OPEN / CLOSE
========================================================= */

function openMenu() {

if (!DOM.sideMenu) return;

state.menuOpen = true;

DOM.sideMenu.hidden = false;

DOM.sideMenu.setAttribute(
'aria-hidden',
'false'
);

requestAnimationFrame(() => {
DOM.sideMenu.classList.add('show');
});

DOM.menuButton?.setAttribute(
'aria-expanded',
'true'
);

document.body.classList.add('modal-open');
}

function closeMenu() {

if (!DOM.sideMenu) return;

state.menuOpen = false;

DOM.sideMenu.classList.remove('show');

DOM.sideMenu.setAttribute(
'aria-hidden',
'true'
);

setTimeout(() => {
DOM.sideMenu.hidden = true;
}, 300);

DOM.menuButton?.setAttribute(
'aria-expanded',
'false'
);

document.body.classList.remove('modal-open');
}

/* =========================================================
19. NAVIGATION
========================================================= */

function handleNavigation(nav) {

document
.querySelectorAll('.nav-link')
.forEach(link => {

```
  link.classList.toggle(
    'active',
    link.dataset.nav === nav
  );

  if (link.dataset.nav === nav) {
    link.setAttribute(
      'aria-current',
      'page'
    );
  } else {
    link.removeAttribute('aria-current');
  }

});
```

switch (nav) {

```
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
  openSell();
  break;

case 'cart':
  openCart();
  break;

case 'account':
  openAccount();
  break;
```

}
}

function openCategories() {

openBottomSheet(` <h2 id="sheetTitle">
Kategori </h2>

```
<div
  style="
    display:grid;
    grid-template-columns:repeat(2,1fr);
    gap:10px;
    margin-top:20px;
  "
>

  ${categoryButton('ph-hamburger', 'Kuliner')}

  ${categoryButton('ph-tote', 'Fashion')}

  ${categoryButton('ph-armchair', 'Kerajinan')}

  ${categoryButton('ph-coffee', 'Minuman')}

  ${categoryButton('ph-flower', 'Kecantikan')}

  ${categoryButton('ph-storefront', 'Lainnya')}

</div>
```

`);
}

function categoryButton(icon, label) {

return ` <button
   type="button"
   style="
     padding:18px 10px;
     background:var(--forest-50);
     border-radius:var(--r-md);
     color:var(--forest-800);
     font-weight:600;
     font-size:12px;
   "
   onclick="filterCategory('${escapeAttribute(label)}')"
 > <i
     class="ph ${icon}"
     style="
       display:block;
       font-size:25px;
       margin-bottom:7px;
     "
   ></i>

```
  ${escapeHTML(label)}

</button>
```

`;
}

function filterCategory(category) {

closeBottomSheet();

const results =
productsData.filter(post =>
post.context
.toLowerCase()
.includes(category.toLowerCase())
);

renderFeed(results);

showToast(
results.length
? `${results.length} produk ditemukan`
: 'Belum ada produk di kategori ini'
);
}

function openSell() {

openBottomSheet(` <h2 id="sheetTitle">
Jual di Pasar UMKM </h2>

```
<p
  style="
    margin-top:8px;
    color:var(--text-secondary);
    line-height:1.5;
  "
>
  Promosikan produk UMKM Anda kepada masyarakat
  Lubuklinggau.
</p>

<button
  class="btn-primary"
  style="
    width:100%;
    margin-top:22px;
    padding:13px;
  "
  type="button"
  data-action="start-selling"
>
  Mulai Jual Produk
</button>
```

`);

const button =
DOM.sheetContent.querySelector(
'[data-action="start-selling"]'
);

button?.addEventListener('click', () => {
showToast('Fitur pendaftaran penjual segera tersedia');
closeBottomSheet();
});
}

function openCart() {

const totalItems =
state.cart.reduce(
(sum, item) => sum + item.quantity,
0
);

if (!state.cart.length) {

```
openBottomSheet(`
  <h2 id="sheetTitle">
    Keranjang
  </h2>

  ${emptyState(
    'ph-shopping-cart',
    'Keranjang masih kosong',
    'Produk yang Anda tambahkan akan muncul di sini.'
  )}
`);

return;
```

}

openBottomSheet(` <h2 id="sheetTitle">
Keranjang </h2>

```
<p
  style="
    margin-top:6px;
    color:var(--text-tertiary);
    font-size:12px;
  "
>
  ${totalItems} produk
</p>

<div style="margin-top:20px">

  ${state.cart.map(item => `
    <div
      style="
        display:flex;
        justify-content:space-between;
        gap:12px;
        padding:14px 0;
        border-bottom:1px solid var(--bg-tertiary);
      "
    >

      <div>

        <strong>
          ${escapeHTML(item.name)}
        </strong>

        <div
          style="
            margin-top:4px;
            font-size:12px;
            color:var(--text-tertiary);
          "
        >
          ${item.quantity} × ${escapeHTML(item.price)}
        </div>

      </div>

    </div>
  `).join('')}

</div>

<button
  class="btn-primary"
  type="button"
  style="
    width:100%;
    margin-top:20px;
    padding:13px;
  "
  data-action="cart-checkout"
>
  Checkout
</button>
```

`);

DOM.sheetContent
.querySelector('[data-action="cart-checkout"]')
?.addEventListener('click', () => {

```
  showToast('Menu checkout dibuka');

  closeBottomSheet();

});
```

}

function openAccount() {

openBottomSheet(` <h2 id="sheetTitle">
Akun </h2>

```
<div
  style="
    text-align:center;
    padding:28px 10px;
  "
>

  <div
    style="
      width:72px;
      height:72px;
      margin:0 auto;
      border-radius:50%;
      background:var(--forest-100);
      color:var(--forest-700);
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:34px;
    "
  >
    <i class="ph ph-user"></i>
  </div>

  <h3 style="margin-top:14px">
    Selamat datang
  </h3>

  <p
    style="
      margin-top:5px;
      color:var(--text-tertiary);
      font-size:13px;
    "
  >
    Masuk untuk mengelola akun dan pesanan Anda.
  </p>

  <button
    class="btn-primary"
    type="button"
    style="
      width:100%;
      margin-top:20px;
      padding:13px;
    "
    data-action="login"
  >
    Masuk / Daftar
  </button>

</div>
```

`);

DOM.sheetContent
.querySelector('[data-action="login"]')
?.addEventListener('click', () => {

```
  showToast('Sistem autentikasi segera tersedia');

  closeBottomSheet();

});
```

}

/* =========================================================
20. EVENT BINDING
========================================================= */

function bindEvents() {

/* MENU */

DOM.menuButton?.addEventListener(
'click',
openMenu
);

DOM.closeMenuButton?.addEventListener(
'click',
closeMenu
);

/* SEARCH */

DOM.searchButton?.addEventListener(
'click',
openSearch
);

DOM.closeSearchButton?.addEventListener(
'click',
closeSearch
);

DOM.searchInput?.addEventListener(
'input',
event => {
performSearch(event.target.value);
}
);

DOM.searchClearButton?.addEventListener(
'click',
() => {

```
  DOM.searchInput.value = '';

  performSearch('');

  DOM.searchInput.focus();

}
```

);

/* NOTIFICATION */

DOM.notificationButton?.addEventListener(
'click',
openNotifications
);

/* MESSAGE */

DOM.messageButton?.addEventListener(
'click',
openMessages
);

/* BOTTOM NAV */

DOM.appNavigation
?.querySelectorAll('[data-nav]')
.forEach(link => {

```
  link.addEventListener('click', event => {

    event.preventDefault();

    handleNavigation(
      link.dataset.nav
    );

  });

});
```

/* STORIES */

DOM.stories
?.addEventListener('click', event => {

```
  const item =
    event.target.closest('[data-action]');

  if (!item) return;

  const action =
    item.dataset.action;

  if (action === 'story') {

    const id =
      Number(item.dataset.storyId);

    const story =
      storiesData.find(
        item => item.id === id
      );

    if (story) {
      showToast(
        `Membuka cerita ${story.name}`
      );
    }

  }

  if (action === 'create-story') {
    showToast(
      'Fitur tambah cerita segera tersedia'
    );
  }

});
```

/* SIDE MENU ACTIONS */

DOM.sideMenuContent
?.addEventListener('click', event => {

```
  const button =
    event.target.closest('[data-menu-action]');

  if (!button) return;

  const action =
    button.dataset.menuAction;

  closeMenu();

  setTimeout(() => {

    if (
      [
        'home',
        'categories',
        'cart'
      ].includes(action)
    ) {
      handleNavigation(action);
    } else {
      showToast(
        `${capitalize(action)} segera tersedia`
      );
    }

  }, 320);

});
```

/* SHEET OVERLAY */

DOM.sheetOverlay?.addEventListener(
'click',
closeBottomSheet
);

/* SEARCH OVERLAY */

DOM.searchOverlay?.addEventListener(
'click',
event => {

```
  if (
    event.target === DOM.searchOverlay
  ) {
    closeSearch();
  }

}
```

);

/* KEYBOARD */

document.addEventListener(
'keydown',
handleKeyboard
);

/* GLOBAL ACTIONS */

document.addEventListener(
'click',
handleGlobalActions
);

}

/* =========================================================
21. GLOBAL ACTION HANDLER
========================================================= */

function handleGlobalActions(event) {

const element =
event.target.closest('[data-action]');

if (!element) return;

const action =
element.dataset.action;

switch (action) {

```
case 'checkout':

  showToast('Checkout berhasil dibuka');
  closeBottomSheet();

  break;
```

}
}

/* =========================================================
22. KEYBOARD
========================================================= */

function handleKeyboard(event) {

if (event.key === 'Escape') {

```
if (state.searchOpen) {
  closeSearch();
  return;
}

if (state.currentSheet) {
  closeBottomSheet();
  return;
}

if (state.menuOpen) {
  closeMenu();
}
```

}

}

/* =========================================================
23. TOAST
========================================================= */

let toastTimer;

function showToast(message) {

if (!DOM.toast) return;

clearTimeout(toastTimer);

DOM.toast.textContent = message;

DOM.toast.classList.add('show');

toastTimer = setTimeout(() => {

```
DOM.toast.classList.remove('show');
```

}, 2200);
}

/* =========================================================
24. CART BADGE
========================================================= */

function updateCartBadge() {

const count =
state.cart.reduce(
(sum, item) =>
sum + item.quantity,
0
);

const badge =
document.querySelector('.nav-badge');

if (!badge) return;

badge.textContent = count;

badge.style.display =
count > 0 ? 'flex' : 'none';

}

/* =========================================================
25. LOCAL STORAGE
========================================================= */

function saveState() {

try {

```
localStorage.setItem(
  'pasar_umkm_liked',
  JSON.stringify(
    [...state.likedPosts]
  )
);

localStorage.setItem(
  'pasar_umkm_cart',
  JSON.stringify(
    state.cart
  )
);
```

} catch (error) {

```
console.warn(
  'State tidak dapat disimpan:',
  error
);
```

}
}

function restoreState() {

try {

```
const liked =
  JSON.parse(
    localStorage.getItem(
      'pasar_umkm_liked'
    )
  );

const cart =
  JSON.parse(
    localStorage.getItem(
      'pasar_umkm_cart'
    )
  );

if (Array.isArray(liked)) {

  state.likedPosts =
    new Set(liked);

}

if (Array.isArray(cart)) {

  state.cart = cart;

}
```

} catch (error) {

```
console.warn(
  'State tidak dapat dipulihkan:',
  error
);
```

}

updateCartBadge();
}

/* =========================================================
26. LOADING
========================================================= */

function hideLoading() {

if (!DOM.appLoading) return;

DOM.appLoading.hidden = true;
DOM.appLoading.setAttribute(
'aria-hidden',
'true'
);
}

/* =========================================================
27. EMPTY STATE
========================================================= */

function emptyState(icon, title, text) {

return ` <div
   style="
     padding:55px 20px;
     text-align:center;
   "
 >

```
  <i
    class="ph ${escapeAttribute(icon)}"
    style="
      font-size:44px;
      color:var(--forest-700);
      display:block;
      margin-bottom:14px;
    "
  ></i>

  <strong
    style="
      display:block;
      font-size:15px;
    "
  >
    ${escapeHTML(title)}
  </strong>

  <span
    style="
      display:block;
      margin-top:6px;
      font-size:12px;
      color:var(--text-tertiary);
    "
  >
    ${escapeHTML(text)}
  </span>

</div>
```

`;
}

/* =========================================================
28. IMAGE ERROR
========================================================= */

function handleImageError(image) {

image.style.background =
'var(--bg-tertiary)';

image.style.objectFit =
'contain';

image.alt =
'Gambar tidak tersedia';
}

/* =========================================================
29. UTILITY
========================================================= */

function formatNumber(number) {

return new Intl.NumberFormat(
'id-ID',
{
notation: number >= 1000
? 'compact'
: 'standard',
maximumFractionDigits: 1
}
).format(number);
}

function capitalize(text) {

return text
.charAt(0)
.toUpperCase() +
text.slice(1);
}

function escapeHTML(value) {

return String(value ?? '')
.replace(/&/g, '&')
.replace(/</g, '<')
.replace(/>/g, '>')
.replace(/"/g, '"')
.replace(/'/g, ''');
}

function escapeAttribute(value) {

return escapeHTML(value);
}

/* =========================================================
30. GLOBAL API
========================================================= */

window.PasarUMKM = {

state,

products: productsData,

stories: storiesData,

search(query) {
openSearch();

```
if (DOM.searchInput) {
  DOM.searchInput.value = query || '';
}

performSearch(query || '');
```

},

addToCart(postId) {

```
const post =
  productsData.find(
    item => item.id === postId
  );

if (post) {
  addToCart(post);
}
```

},

showToast,

openMenu,

closeMenu,

openSearch,

closeSearch,

openBottomSheet,

closeBottomSheet

};

/* =========================================================
END OF APP.JS
========================================================= */
