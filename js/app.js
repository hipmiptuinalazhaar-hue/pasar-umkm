// ========================================
// PASAR UMKM - JavaScript
// ========================================

// ===== DATA TOKO =====
const TOKO_LIST = [
  { id: 1, nama: "Pak Madi", foto: "assets/umkm1.jpg", kota: "Lubuklinggau", verified: true },
  { id: 2, nama: "Ibu Siti", foto: "assets/umkm2.jpg", kota: "Lubuklinggau", verified: true },
  { id: 3, nama: "Madi Craft", foto: "assets/umkm3.jpg", kota: "Lubuklinggau", verified: false },
  { id: 4, nama: "Maepi Art", foto: "assets/1.jpg", kota: "Lubuklinggau", verified: false },
  { id: 5, nama: "Pak Sili", foto: "assets/2.jpg", kota: "Lubuklinggau", verified: true }
];

// ===== DATA POST =====
const POST_LIST = [
  {
    id: 1,
    toko_id: 1,
    waktu: "2 jam lalu",
    konten: "Alhamdulillah panen kali ini biji kopi lebih besar dari biasanya. Langsung dari kebun sendiri di kaki Bukit Barisan ☕🌿",
    gambar: ["assets/umkm1.jpg"],
    suka: 128,
    komen: 23,
    tipe: "foto",
    produk: {
      nama: "Kopi Robusta Premium",
      varian: "250g",
      harga: 25000,
      harga_asli: 32000,
      rating: 4.9,
      terjual: 1200
    }
  },
  {
    id: 2,
    toko_id: 2,
    waktu: "5 jam lalu",
    konten: "Dari menganyam sampai jadi tas cantik ini butuh waktu 3 hari penuh. Setiap anyaman ada ceritanya 🧺✨",
    gambar: ["assets/umkm2.jpg"],
    suka: 89,
    komen: 15,
    tipe: "video",
    produk: {
      nama: "Tas Anyaman Purun",
      varian: "Premium",
      harga: 75000,
      harga_asli: null,
      rating: 5.0,
      terjual: 500
    }
  }
];

// ===== DATA USER =====
let USER = {
  nama: "Budi",
  keranjang: 2,
  notif: 3,
  suka_post: []
};

// ===== HELPER =====
function Rupiah(angka) {
  return "Rp" + angka.toLocaleString("id-ID");
}

function Toast(pesan) {
  const el = document.getElementById("toast");
  el.textContent = pesan;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2500);
}

// ===== RENDER STORIES =====
function renderStories() {
  const container = document.getElementById("stories");
  
  let html = "";
  
  TOKO_LIST.forEach(toko => {
    html += `
      <div class="story has-story ${toko.verified ? 'live' : ''}">
        <div class="story-ring">
          <img src="${toko.foto}" class="story-avatar" alt="${toko.nama}">
        </div>
        <span class="story-name">${toko.nama}</span>
      </div>
    `;
  });
  
  html += `
    <div class="story add">
      <div class="story-ring">
        <span>+</span>
      </div>
      <span class="story-name">Jual</span>
    </div>
  `;
  
  container.innerHTML = html;
}

// ===== RENDER FEED =====
function renderFeed() {
  const container = document.getElementById("feed");
  
  let html = "";
  
  POST_LIST.forEach((post, index) => {
    const toko = TOKO_LIST.find(t => t.id === post.toko_id);
    const sudahLike = USER.suka_post.includes(post.id);
    
    html += `
      <article class="post" style="animation-delay: ${index * 0.08}s">
        
        <div class="post-header">
          <img src="${toko.foto}" class="post-avatar" alt="${toko.nama}">
          <div class="post-meta-info">
            <div class="post-author">
              ${toko.nama}
              ${toko.verified ? '<span class="verified">✓</span>' : ''}
            </div>
            <div class="post-location-time">
              📍 ${toko.kota} <span class="dot"></span> ${post.waktu}
            </div>
          </div>
          <button class="post-more" onclick="showMenu(${post.id})">•••</button>
        </div>
        
        <div class="post-media">
          <img src="${post.gambar[0]}" alt="${post.produk.nama}">
          ${post.tipe === "video" ? `
            <div class="video-badge">▶ VIDEO</div>
            <div class="video-play-btn"></div>
          ` : ''}
        </div>
        
        <div class="post-actions">
          <div class="post-actions-left">
            <button class="action-btn like ${sudahLike ? 'liked' : ''}" onclick="toggleLike(${post.id})">
              <span class="icon">${sudahLike ? '❤️' : '🤍'}</span>
              <span class="count" id="like-${post.id}">${post.suka}</span>
            </button>
            <button class="action-btn" onclick="showComments(${post.id})">
              <span class="icon">💬</span>
              <span class="count">${post.komen}</span>
            </button>
            <button class="action-btn" onclick="sharePost(${post.id})">
              <span class="icon">↗️</span>
            </button>
          </div>
          <button class="action-btn" onclick="savePost(${post.id})">
            <span class="icon">🔖</span>
          </button>
        </div>
        
        <div class="likes-summary">
          Disukai oleh <strong>${post.suka.toLocaleString()}</strong> orang
        </div>
        
        <div class="post-caption">
          <span class="author-name">${toko.nama}</span>
          ${post.konten}
        </div>
        
        <div class="comments-preview">
          <span class="view-comments" onclick="showComments(${post.id})">
            Lihat semua ${post.komen} komentar
          </span>
        </div>
        
        <div class="post-time">${post.waktu}</div>
        
        <div class="product-embed">
          <img src="${post.gambar[0]}" class="product-embed-img" alt="${post.produk.nama}">
          <div class="product-embed-info">
            <div class="product-embed-badge">🏷️ Produk</div>
            <div class="product-embed-name">${post.produk.nama}</div>
            <div class="product-embed-meta">
              <span class="stars">★ ${post.produk.rating}</span>
              <span>•</span>
              <span>${post.produk.terjual.toLocaleString()} terjual</span>
            </div>
            <div class="product-embed-price">
              ${Rupiah(post.produk.harga)}
              ${post.produk.harga_asli ? `<span class="original">${Rupiah(post.produk.harga_asli)}</span>` : ''}
            </div>
          </div>
          <div class="product-embed-actions">
            <button class="btn-add-cart" onclick="addToCart(${post.produk.harga})">+</button>
            <button class="btn-buy-now" onclick="buyNow(${post.id})">Beli</button>
          </div>
        </div>
        
      </article>
    `;
  });
  
  container.innerHTML = html;
}

// ===== INTERAKSI =====

function toggleLike(postId) {
  const el = document.getElementById("like-" + postId);
  const btn = el.closest(".action-btn");
  const sudahLike = USER.suka_post.includes(postId);
  
  if (sudahLike) {
    USER.suka_post = USER.suka_post.filter(id => id !== postId);
    POST_LIST.find(p => p.id === postId).suka--;
    btn.classList.remove("liked");
    el.previousElementSibling.textContent = "🤍";
  } else {
    USER.suka_post.push(postId);
    POST_LIST.find(p => p.id === postId).suka++;
    btn.classList.add("liked");
    el.previousElementSibling.textContent = "❤️";
  }
  
  el.textContent = POST_LIST.find(p => p.id === postId).suka;
}

function addToCart(harga) {
  USER.keranjang++;
  document.querySelector(".nav-badge").textContent = USER.keranjang;
  Toast("Ditambahkan ke keranjang");
}

function buyNow(postId) {
  Toast("Mengarahkan ke checkout...");
}

function showMenu(postId) {
  const pilihan = prompt("Pilih aksi:\n1. Laporkan post\n2. Bagikan link\n3. Simpan post");
  if (pilihan === "1") Toast("Post dilaporkan");
  else if (pilihan === "2") Toast("Link disalin");
  else if (pilihan === "3") Toast("Post disimpan");
}

function showComments(postId) {
  Toast("Membuka komentar...");
}

function sharePost(postId) {
  Toast("Link post disalin");
}

function savePost(postId) {
  Toast("Post disimpan");
}

// ===== JALANKAN =====
document.addEventListener("DOMContentLoaded", function() {
  renderStories();
  renderFeed();
});
