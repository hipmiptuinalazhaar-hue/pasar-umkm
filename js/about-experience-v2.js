'use strict';

/* =========================================================
   PASAR UMKM - ABOUT EXPERIENCE V2
   Structured product story for the About sheet.
   ========================================================= */

(() => {
  if (window.PasarAboutExperience?.version === '2.0') return;

  const fallback = typeof window.openAbout === 'function'
    ? window.openAbout.bind(window)
    : null;

  function esc(value) {
    if (typeof escapeHTML === 'function') {
      return escapeHTML(String(value ?? ''));
    }
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function openAboutV2() {
    if (typeof openBottomSheet !== 'function') {
      fallback?.();
      return;
    }

    const city = typeof CONFIG !== 'undefined'
      ? (CONFIG.CITY || 'Lubuklinggau')
      : 'Lubuklinggau';
    const organization = typeof CONFIG !== 'undefined'
      ? (CONFIG.ORGANIZATION || 'HIPMI PT UIN Al Azhaar Lubuklinggau')
      : 'HIPMI PT UIN Al Azhaar Lubuklinggau';
    const initiator = typeof CONFIG !== 'undefined'
      ? (CONFIG.INITIATOR || 'Capryan Agusto')
      : 'Capryan Agusto';
    const logo = typeof ASSETS !== 'undefined'
      ? (ASSETS.logo || 'assets/logo.webp')
      : 'assets/logo.webp';

    openBottomSheet(`
      <section class="about-v2" aria-labelledby="sheetTitle">
        <header class="about-v2-heading">
          <span class="about-v2-kicker">Tentang platform</span>
          <h2 id="sheetTitle">Pasar UMKM</h2>
          <p>Ekosistem digital social-commerce untuk menemukan, mengenal, mendukung, dan bertransaksi dengan UMKM lokal.</p>
        </header>

        <section class="about-v2-hero" aria-label="Identitas Pasar UMKM">
          <img src="${esc(logo)}" alt="Logo Pasar UMKM" loading="lazy" decoding="async">
          <div>
            <span>Pasar UMKM · ${esc(city)}</span>
            <strong>Belanja lokal. Temukan usaha. Bangun koneksi.</strong>
            <p>Dirancang agar UMKM lokal tidak hanya memiliki etalase digital, tetapi juga ruang untuk membangun relasi, cerita, kepercayaan, dan transaksi.</p>
          </div>
        </section>

        <section class="about-v2-section">
          <div class="about-v2-section-head">
            <span>01</span>
            <div>
              <h3>Apa itu Pasar UMKM?</h3>
              <p>Pasar UMKM adalah platform digital yang menggabungkan fungsi marketplace dan interaksi sosial dalam satu pengalaman yang ringan, mobile-first, dan berorientasi pada kebutuhan UMKM daerah.</p>
            </div>
          </div>
        </section>

        <section class="about-v2-section">
          <div class="about-v2-section-head">
            <span>02</span>
            <div>
              <h3>Satu platform, tiga kebutuhan utama</h3>
              <p>Dari menemukan usaha sampai membangun hubungan dengan pelanggan, semuanya dirancang berada dalam alur yang sama.</p>
            </div>
          </div>

          <div class="about-v2-capability-grid">
            <article class="about-v2-capability">
              <i class="ph ph-storefront" aria-hidden="true"></i>
              <strong>Temukan UMKM</strong>
              <p>Jelajahi toko, produk, profil usaha, konten, kategori, dan informasi lokal secara terstruktur.</p>
            </article>
            <article class="about-v2-capability">
              <i class="ph ph-shopping-bag-open" aria-hidden="true"></i>
              <strong>Belanja & transaksi</strong>
              <p>Keranjang, checkout, status pesanan, rating, dan pengelolaan transaksi tersedia dalam satu ekosistem.</p>
            </article>
            <article class="about-v2-capability">
              <i class="ph ph-chat-circle-dots" aria-hidden="true"></i>
              <strong>Terhubung & bertumbuh</strong>
              <p>Postingan, cerita, interaksi, profil sosial, dan pesan membantu usaha membangun hubungan yang lebih manusiawi.</p>
            </article>
          </div>
        </section>

        <section class="about-v2-section">
          <div class="about-v2-section-head">
            <span>03</span>
            <div>
              <h3>Untuk ekosistem lokal</h3>
              <p>Platform ini tidak hanya berbicara kepada penjual. Pembeli, pelaku usaha, komunitas, dan mitra ekosistem memiliki ruang yang saling terhubung.</p>
            </div>
          </div>

          <div class="about-v2-audience-list">
            <div><i class="ph ph-users-three" aria-hidden="true"></i><span><strong>Masyarakat</strong><small>Menemukan produk dan UMKM lokal dengan lebih mudah.</small></span></div>
            <div><i class="ph ph-briefcase" aria-hidden="true"></i><span><strong>Pelaku UMKM</strong><small>Membangun etalase, transaksi, profil, konten, dan hubungan pelanggan.</small></span></div>
            <div><i class="ph ph-handshake" aria-hidden="true"></i><span><strong>Ekosistem usaha</strong><small>Membuka ruang kolaborasi, promosi, dan penguatan ekonomi lokal.</small></span></div>
          </div>
        </section>

        <section class="about-v2-section">
          <div class="about-v2-section-head">
            <span>04</span>
            <div>
              <h3>Prinsip pengembangan</h3>
              <p>Pasar UMKM dikembangkan dengan fondasi produk yang sederhana digunakan, aman, cepat, konsisten, dan dapat berkembang tanpa kehilangan identitas lokalnya.</p>
            </div>
          </div>

          <div class="about-v2-principles" aria-label="Prinsip platform">
            <span><i class="ph ph-device-mobile" aria-hidden="true"></i>Mobile-first</span>
            <span><i class="ph ph-shield-check" aria-hidden="true"></i>Keamanan</span>
            <span><i class="ph ph-gauge" aria-hidden="true"></i>Performa</span>
            <span><i class="ph ph-map-pin" aria-hidden="true"></i>Berakar lokal</span>
          </div>
        </section>

        <section class="about-v2-identity">
          <span class="about-v2-kicker">Inisiatif & pengembangan</span>
          <div class="about-v2-identity-row">
            <span>Inisiatif</span>
            <strong>${esc(organization)}</strong>
          </div>
          <div class="about-v2-identity-row">
            <span>Founder & Product Initiator</span>
            <strong>${esc(initiator)}</strong>
          </div>
          <div class="about-v2-identity-row">
            <span>Fokus awal</span>
            <strong>Penguatan digital UMKM ${esc(city)}</strong>
          </div>
        </section>

        <footer class="about-v2-footer">
          <strong>Dibangun dari ${esc(city)}, untuk mendorong UMKM lokal naik kelas secara digital.</strong>
          <span>Pasar UMKM · V1.0 · Dikembangkan berkelanjutan</span>
        </footer>
      </section>
    `, 'about-v2');
  }

  window.openAbout = openAboutV2;
  window.PasarAboutExperience = Object.freeze({
    version: '2.0',
    open: openAboutV2
  });
})();
