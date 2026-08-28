// =============================================================================
// PASAR UMKM — App Frontend (app.js)
// Dibuat untuk integrasi social-commerce Pasar UMKM
// Fitur: render cerita (stories), feed, interaksi like/komentar/share, keranjang, notifikasi (toast), bottom-sheet.
// Integrasi: HTML (index.html), CSS (tokens.css, style.css) sudah dipasang.
// =============================================================================

// Singkat: script ini mengisi elemen HTML, menangani interaksi, penyimpanan keranjang.
// Tabel mapping selektor utama di bawah.

const DATA = {
  stories: [
    { id: 1, name: "Pak Madi", img: "assets/umkm1.jpg", hasUpdate: true, live: true },
    { id: 2, name: "Ibu Siti", img: "assets/umkm2.jpg", hasUpdate: true, live: false },
    { id: 3, name: "Madi Craft", img: "assets/umkm3.jpg", hasUpdate: false, live: false },
    { id: 4, name: "Toko Bina", img: "assets/1.jpg", hasUpdate: true, live: false },
    { id: 5, name: "Warung Eko", img: "assets/2.jpg", hasUpdate: false, live: true },
    { id: 6, name: "Maepi Art", img: "assets/umkm4.jpg", hasUpdate: false, live: false }
  ],
  posts: [
    { id: 101, author: "Pak Madi", avatar: "assets/umkm1.jpg", verified: true,
      location: "Lubuklinggau", time: "2 jam lalu",
      content: "Alhamdulillah panen kali ini biji kopi lebih besar. Langsung dari kebun sendiri di Lubuklinggau ☕🌿 #KopiLokal #UMKMSumsel",
      media: [{type: "image", src: "assets/umkm1.jpg"}],
      likes: 128, comments: 23,
      product: { name: "KOPI ROBUSTA PREMIUM - 250g", img: "assets/umkm1.jpg", rating: 4.9, sold: 1200, price: 25000, location: "Lubuklinggau" }
    },
    { id: 102, author: "Ibu Siti", avatar: "assets/umkm2.jpg", verified: false,
      location: "Lubuklinggau", time: "5 jam lalu",
      content: "Dari menganyam sampai jadi tas cantik ini butuh 3 hari. Yang mau belajar bisa DM ya 📩 #TasPurun #KerajinanLokal",
      media: [
        {type: "image", src: "assets/umkm2.jpg"},
        {type: "image", src: "assets/umkm3.jpg"}
      ],
      likes: 89, comments: 15,
      product: { name: "TAS ANYAMAN PURUN PREMIUM", img: "assets/umkm2.jpg", rating: 5.0, sold: 500, price: 75000, location: "Lubuklinggau" }
    },
    { id: 103, author: "Madi Craft", avatar: "assets/umkm3.jpg", verified: false,
      location: "Lubuklinggau", time: "1 hari lalu",
      content: "Produk terbaru dari workshop Madi Craft! Kayu jati berkualitas tinggi, model minimalis. 🎁 #Furniture #Handmade",
      media: [{type: "image", src: "assets/3.jpg"}],
      likes: 45, comments: 8,
      product: { name: "MEJA KAYU JATI MINI", img: "assets/3.jpg", rating: 4.7, sold: 230, price: 150000, location: "Lubuklinggau" }
    },
    { id: 104, author: "Maepi Art", avatar: "assets/umkm4.jpg", verified: true,
      location: "Lubuklinggau", time: "3 hari lalu",
      content: "Karya seni kayu ukir tangan. Bisa request desain khusus. 🎨 #Artsy #LokalLubuklinggau",
      media: [{type: "image", src: "assets/4.jpg"}],
      likes: 76, comments: 12,
      product: { name: "PAJANGAN DINDING UKIRAN", img: "assets/4.jpg", rating: 4.8, sold: 860, price: 320000, location: "Lubuklinggau" }
    },
    { id: 105, author: "Toko Bina", avatar: "assets/1.jpg", verified: false,
      location: "Lubuklinggau", time: "1 minggu lalu",
      content: "Selamat pagi, promo besar-besaran untuk produk fashion lokal! 💃 #FashionLokal #Diskon",
      media: [{type: "image", src: "assets/2.jpg"}],
      likes: 200, comments: 40,
      product: { name: "KAOS BATIK LOKAL", img: "assets/2.jpg", rating: 4.3, sold: 150, price: 50000, location: "Lubuklinggau" }
    },
    { id: 106, author: "Warung Eko", avatar: "assets/2.jpg", verified: false,
      location: "Lubuklinggau", time: "2 minggu lalu",
      content: "Es Campur segar untuk sahur! Buka 24 jam Ramadhan 🌙 #BukaPuasa #Lubuklinggau",
      media: [{type: "image", src: "assets/umkm1.jpg"}],
      likes: 67, comments: 10,
      product: { name: "ES CAMPUR SEGAR 500ml", img: "assets/umkm1.jpg", rating: 4.6, sold: 980, price: 15000, location: "Lubuklinggau" }
    }
  ]
};

// Objek global untuk debugging
window.PasarUMKM = {
  debug: renderAll,                // render ulang data (jalan dari konsol)
  getCartCount: () => parseInt(localStorage.getItem('cartCount') || '0'),
  getFeedData: () => DATA.posts
};

function renderAll() {
  renderStories();
  renderFeed();
  loadCartCount();
}

// Tabel referensi selektor HTML => fungsi
console.table([
  {Selector: "#stories (.stories-track)", Function: "renderStories()"},
  {Selector: "#feed", Function: "renderFeed()"},
  {Selector: ".app-nav .nav-link", Function: "initBottomNav()"},
  {Selector: ".nav-create", Function: "initCreatePost()"},
  {Selector: "#toast", Function: "showToast(msg)"},
  {Selector: "#bottomSheet", Function: "showBottomSheet(content)"}
]);

// Render daftar stories ke container #stories
function renderStories() {
  const container = document.getElementById('stories');
  if (!container) { console.warn("Kontainer #stories tidak ditemukan"); return; }
  container.innerHTML = ''; // reset
  const frag = document.createDocumentFragment();
  DATA.stories.forEach(story => {
    const item = document.createElement('div');
    item.className = 'story-item';
    if (story.hasUpdate) item.classList.add('has-update');
    if (story.live) item.classList.add('live');
    item.setAttribute('tabindex', 0);
    item.innerHTML = `
      <div class="story-ring"><img src="${story.img}" alt="${story.name}" class="story-avatar"></div>
      <div class="story-name">${story.name}</div>
    `;
    item.addEventListener('click', () => {
      showToast(\`Cerita \${story.name} (coming soon)\`);
    });
    frag.appendChild(item);
  });
  // Tombol tambah cerita
  const addItem = document.createElement('div');
  addItem.className = 'story-item story-add';
  addItem.setAttribute('tabindex', 0);
  addItem.innerHTML = `
    <div class="story-ring"><i class="ph ph-plus"></i></div>
    <div class="story-name">Jual</div>
  `;
  addItem.addEventListener('click', () => {
    showBottomSheet(`<h3>Buat Cerita</h3><p>Fitur cerita segera hadir.</p>`);
  });
  frag.appendChild(addItem);
  container.appendChild(frag);
}

// Render daftar postingan ke #feed
function renderFeed() {
  const container = document.getElementById('feed');
  if (!container) { console.warn("Kontainer #feed tidak ditemukan"); return; }
  container.innerHTML = '';
  const frag = document.createDocumentFragment();
  DATA.posts.forEach(post => {
    const card = document.createElement('article');
    card.className = 'post-card';
    // Header posting
    const header = document.createElement('div');
    header.className = 'post-header';
    header.innerHTML = `
      <img src="${post.avatar}" alt="${post.author}" class="post-avatar">
      <div class="post-meta">
        <div class="post-author">${post.author}${post.verified ? ' <i class="ph ph-badge-check verified-badge"></i>' : ''}</div>
        <div class="post-context">📍 ${post.location} • ${post.time}</div>
      </div>
      <button class="post-menu" aria-label="Menu"><i class="ph ph-dots-three"></i></button>
    `;
    card.appendChild(header);
    // Media posting (gambar/video)
    const mediaWrap = document.createElement('div');
    mediaWrap.className = 'post-media';
    // Multi-image carousel
    if (post.media.length > 1) {
      const imgContainer = document.createElement('div');
      imgContainer.className = 'post-images';
      post.media.forEach((m, idx) => {
        const img = document.createElement('img');
        img.src = m.src;
        img.alt = post.author;
        img.className = 'post-image-slide';
        if (idx > 0) img.style.display = 'none';
        imgContainer.appendChild(img);
      });
      mediaWrap.appendChild(imgContainer);
      const pageDots = document.createElement('div');
      pageDots.className = 'image-pagination';
      post.media.forEach((m, idx) => {
        const dot = document.createElement('div');
        dot.className = 'page-dot' + (idx === 0 ? ' active' : '');
        dot.addEventListener('click', () => showSlide(idx, mediaWrap));
        pageDots.appendChild(dot);
      });
      mediaWrap.appendChild(pageDots);
    }
    // Gambar atau video tunggal
    if (post.media.length === 1) {
      const m = post.media[0];
      if (m.type === "image") {
        const img = document.createElement('img');
        img.src = m.src;
        img.alt = post.author;
        mediaWrap.appendChild(img);
      } else if (m.type === "video") {
        const videoCover = document.createElement('img');
        videoCover.src = m.src;
        videoCover.alt = post.author;
        mediaWrap.appendChild(videoCover);
        const playBtn = document.createElement('div');
        playBtn.className = 'play-button';
        playBtn.addEventListener('click', () => {
          showToast("Fitur video belum tersedia");
        });
        mediaWrap.appendChild(playBtn);
        const label = document.createElement('div');
        label.className = 'video-indicator';
        label.innerHTML = 'Video';
        mediaWrap.appendChild(label);
      }
    }
    card.appendChild(mediaWrap);
    // Tombol aksi (suka, komentar, share)
    const actions = document.createElement('div');
    actions.className = 'post-actions';
    actions.innerHTML = `
      <div class="actions-left">
        <button class="action-btn like" aria-label="Suka"><i class="ph ph-heart"></i> <span>${post.likes}</span></button>
        <button class="action-btn comment" aria-label="Komentar"><i class="ph ph-chat-circle-text"></i> <span>${post.comments}</span></button>
        <button class="action-btn share" aria-label="Bagikan"><i class="ph ph-share-network"></i></button>
      </div>
    `;
    // Event handler untuk tombol
    actions.querySelector('.like').addEventListener('click', function() {
      toggleLike(this, post);
    });
    actions.querySelector('.comment').addEventListener('click', function() {
      incrementComment(this, post);
    });
    actions.querySelector('.share').addEventListener('click', function() {
      sharePost(post);
    });
    card.appendChild(actions);
    // Caption posting
    const caption = document.createElement('div');
    caption.className = 'post-caption';
    caption.innerHTML = `<span class="author">${post.author}</span> ${sanitize(post.content)}`;
    card.appendChild(caption);
    // Kartu produk (jika ada)
    if (post.product) {
      const prod = document.createElement('div');
      prod.className = 'product-card';
      prod.innerHTML = `
        <img src="${post.product.img}" alt="${post.product.name}" class="product-img">
        <div class="product-info">
          <div class="product-badge">Produk</div>
          <div class="product-name">${post.product.name}</div>
          <div class="product-meta">⭐ ${post.product.rating} • ${formatNumber(post.product.sold)} terjual</div>
          <div class="product-location">📍 ${post.product.location}</div>
        </div>
        <div class="product-actions">
          <button class="btn-icon" aria-label="Tambah ke Keranjang"><i class="ph ph-shopping-cart"></i></button>
          <button class="btn-primary">Beli</button>
        </div>
      `;
      // Tombol tambah ke keranjang
      prod.querySelector('.btn-icon').addEventListener('click', function() {
        addToCart();
      });
      // Tombol beli (tampilkan bottom-sheet)
      prod.querySelector('.btn-primary').addEventListener('click', function() {
        showBottomSheet(`<h3>Checkout</h3><p>Fitur checkout segera hadir.</p>`);
      });
      card.appendChild(prod);
    }
    frag.appendChild(card);
  });
  container.appendChild(frag);
}

// Toggle like button & hitung suka
function toggleLike(btn, post) {
  const span = btn.querySelector('span');
  if (btn.classList.toggle('liked')) {
    post.likes++;
    showToast('Anda menyukai postingan');
  } else {
    post.likes--;
    showToast('Anda batal menyukai');
  }
  span.textContent = post.likes;
}

// Tambah komentar (hanya naikkan hitungan)
function incrementComment(btn, post) {
  post.comments++;
  btn.querySelector('span').textContent = post.comments;
  showToast('Komentar ditambahkan (simulasi)');
}

// Bagikan postingan (navigator.share atau fallback)
function sharePost(post) {
  const shareData = {
    title: post.product.name || post.content.substring(0,20),
    text: post.content,
    url: window.location.href
  };
  if (navigator.share) {
    navigator.share(shareData)
      .then(() => showToast('Berhasil dibagikan!'))
      .catch(err => console.error('Share error:', err));
  } else {
    // Fallback: salin link ke clipboard
    navigator.clipboard.writeText(shareData.url).then(() => {
      showToast('Link disalin ke clipboard');
    });
  }
}

// Tampilkan slide gambar berdasarkan index
function showSlide(index, mediaWrap) {
  const imgs = mediaWrap.querySelectorAll('.post-image-slide');
  const dots = mediaWrap.querySelectorAll('.page-dot');
  imgs.forEach((img,i) => img.style.display = (i===index? 'block' : 'none'));
  dots.forEach((dot,i) => dot.classList.toggle('active', i===index));
}

// Format angka (misal 1200 -> 1.2k)
function formatNumber(num) {
  if (num >= 1000) return (num/1000).toFixed(1).replace('.0','') + 'k';
  return num;
}

// Sanitasi teks (hindari XSS)
function sanitize(str) {
  const tmp = document.createElement('div');
  tmp.textContent = str;
  return tmp.innerHTML;
}

// Tampilkan toast notifikasi
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

// Tampilkan bottom sheet dengan HTML custom
function showBottomSheet(html) {
  const overlay = document.getElementById('sheetOverlay');
  const bottom = document.getElementById('bottomSheet');
  const content = document.getElementById('sheetContent');
  if (content) {
    content.innerHTML = html;
    overlay.classList.add('show');
    bottom.classList.add('show');
    overlay.addEventListener('click', closeBottomSheet);
  }
}

// Tutup bottom sheet
function closeBottomSheet() {
  const overlay = document.getElementById('sheetOverlay');
  const bottom = document.getElementById('bottomSheet');
  overlay.classList.remove('show');
  bottom.classList.remove('show');
}

// Inisialisasi bottom nav (toggle active)
function initBottomNav() {
  const links = document.querySelectorAll('.app-nav .nav-link');
  links.forEach(link => {
    link.addEventListener('click', () => {
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });
}

// Setup tombol 'Buat Post'
function initCreatePost() {
  const createBtn = document.querySelector('.nav-create');
  if (!createBtn) return;
  createBtn.addEventListener('click', () => {
    showBottomSheet(`
      <h3>Buat Post Baru</h3>
      <p>Fitur membuat post akan segera hadir.</p>
    `);
  });
}

// Load dan tampilkan jumlah keranjang dari localStorage
function loadCartCount() {
  const count = parseInt(localStorage.getItem('cartCount') || '0');
  updateCartBadge(count);
}

// Update tampilan badge keranjang
function updateCartBadge(count) {
  const badge = document.querySelector('.nav-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.parentElement.classList.add('has-badge');
  } else {
    badge.textContent = '';
    badge.parentElement.classList.remove('has-badge');
  }
}

// Tambah item ke keranjang (increment dan simpan)
function addToCart() {
  let count = parseInt(localStorage.getItem('cartCount') || '0');
  count++;
  localStorage.setItem('cartCount', count);
  updateCartBadge(count);
  showToast('Ditambahkan ke keranjang');
}

// Event setelah konten selesai dimuat
document.addEventListener('DOMContentLoaded', function() {
  initBottomNav();
  initCreatePost();
  loadCartCount();
  renderStories();
  renderFeed();
});
