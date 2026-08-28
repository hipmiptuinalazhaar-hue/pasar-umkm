// ========================================
// PASAR UMKM - JAVASCRIPT
// ========================================

// ===== DATA TOKO =====
const TOKO_LIST = [
  { id: 1, nama: "Pak Madi", foto: "assets/umkm1.jpg", kota: "Lubuklinggau" },
  { id: 2, nama: "Ibu Siti", foto: "assets/umkm2.jpg", kota: "Lubuklinggau" },
  { id: 3, nama: "Madi", foto: "assets/umkm3.jpg", kota: "Lubuklinggau" },
  { id: 4, nama: "Maepi", foto: "assets/1.jpg", kota: "Lubuklinggau" },
  { id: 5, nama: "Pak Sili", foto: "assets/2.jpg", kota: "Lubuklinggau" }
];

// ===== DATA POST (FEED) =====
const POST_LIST = [
  {
    id: 1,
    toko_id: 1,
    waktu: "2 jam lalu",
    konten: "Alhamdulillah panen kali ini biji kopi lebih besar. Langsung dari kebun sendiri di Lubuklinggau ☕🌿 #KopiLokal #UMKMSumsel",
    gambar: "assets/umkm1.jpg",
    suka: 128,
    komen: 23,
    produk: {
      nama: "KOPI ROBUSTA PREMIUM - 250g",
      harga: 25000,
      rating: 4.9,
      terjual: 1200
    }
  },
  {
    id: 2,
    toko_id: 2,
    waktu: "5 jam lalu",
    konten: "Dari menganyam sampai jadi tas cantik ini butuh 3 hari. Yang mau belajar bisa DM ya 📩",
    gambar: "assets/umkm2.jpg",
    suka: 89,
    komen: 15,
    produk: {
      nama: "TAS ANYAMAN PURUN PREMIUM",
      harga: 75000,
      rating: 5.0,
      terjual: 500
    }
  }
];

// ===== DATA USER (SIMULASI LOGIN) =====
let USER = {
  nama: "Budi",
  keranjang: 2,
  notif: 3
};

// ===== HELPER: FORMAT RUPIAH =====
function formatRupiah(angka) {
  return "Rp" + angka.toLocaleString("id-ID");
}

// ===== RENDER: STORIES =====
function renderStories() {
  const container = document.getElementById("stories");
  if (!container) return;
  
  let html = "";
  
  TOKO_LIST.forEach(toko => {
    html += `
      <div class="story">
        <div class="story-avatar live">
          <img src="${toko.foto}" alt="${toko.nama}">
        </div>
        <span class="story-name">${toko.nama}</span>
      </div>
    `;
  });
  
  // Tombol Jual
  html += `
    <div class="story add">
      <div class="story-avatar">
        <span>+</span>
      </div>
      <span class="story-name">Jual</span>
    </div>
  `;
  
  container.innerHTML = html;
}

// ===== RENDER: FEED =====
function renderFeed() {
  const container = document.getElementById("feed");
  if (!container) return;
  
  let html = "";
  
  POST_LIST.forEach(post => {
    const toko = TOKO_LIST.find(t => t.id === post.toko_id);
    if (!toko) return;
    
    html += `
      <article class="post">
        <div class="post-header">
          <img src="${toko.foto}" class="post-avatar" alt="${toko.nama}">
          <div class="post-info">
            <h3 class="post-author">${toko.nama}</h3>
            <p class="post-meta">📍 ${toko.kota} • ${post.waktu}</p>
          </div>
          <button class="post-more">•••</button>
        </div>
        
        <div class="post-image">
          <img src="${post.gambar}" alt="${post.produk.nama}">
        </div>
        
        <div class="post-actions">
          <button class="action-btn like" onclick="toggleLike(${post.id})">
            <span class="icon">♡</span>
            <span class="count" id="like-${post.id}">${post.suka}</span>
          </button>
          <button class="action-btn">
            <span class="icon">💬</span>
            <span class="count">${post.komen}</span>
          </button>
          <button class="action-btn">
            <span class="icon">↗️</span>
            <span>Bagikan</span>
          </button>
        </div>
        
        <div class="post-caption">
          <strong>${toko.nama}</strong> ${post.konten}
        </div>
        
        <div class="product-tag">
          <img src="${post.gambar}" class="product-img" alt="${post.produk.nama}">
          <div class="product-info">
            <h4>🏷️ ${post.produk.nama}</h4>
            <div class="product-meta">⭐ ${post.produk.rating} • ${post.produk.terjual} terjual</div>
            <div class="product-price">${formatRupiah(post.produk.harga)}</div>
            <div class="product-location">📍 ${toko.kota}</div>
          </div>
          <div class="product-actions">
            <button class="btn-cart" onclick="addToCart()">+ Keranjang</button>
            <button class="btn-buy">Beli</button>
          </div>
        </div>
      </article>
    `;
  });
  
  container.innerHTML = html;
}

// ===== UPDATE: BADGE (NOTIF & KERANJANG) =====
function updateBadges() {
  // Update badge notifikasi di header
  const notifBadges = document.querySelectorAll('.icon-btn .badge');
  notifBadges.forEach(badge => {
    badge.textContent = USER.notif;
  });
  
  // Update badge keranjang di bottom nav
  const cartBadge = document.querySelector('.nav-badge');
  if (cartBadge) {
    cartBadge.textContent = USER.keranjang;
  }
}

// ===== INTERAKSI: LIKE =====
function toggleLike(postId) {
  const likeEl = document.getElementById(`like-${postId}`);
  const btn = likeEl.closest('.action-btn');
  
  if (btn.classList.contains('active')) {
    btn.classList.remove('active');
    likeEl.textContent = parseInt(likeEl.textContent) - 1;
  } else {
    btn.classList.add('active');
    likeEl.textContent = parseInt(likeEl.textContent) + 1;
  }
}

// ===== INTERAKSI: TAMBAH KERANJANG =====
function addToCart() {
  USER.keranjang += 1;
  updateBadges();
  
  // Feedback simple
  alert("Produk ditambahkan ke keranjang!");
}

// ===== JALANKAN SAAT HALAMAN DIBUKA =====
document.addEventListener('DOMContentLoaded', function() {
  renderStories();
  renderFeed();
  updateBadges();
});
