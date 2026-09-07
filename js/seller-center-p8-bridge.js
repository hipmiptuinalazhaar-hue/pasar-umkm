'use strict';

(() => {
  if (window.PasarSellerP8?.version === '1.0') return;

  const doc = document;
  const providers = ['BRI','BCA','BNI','Mandiri','BSI','Bank Sumsel Babel','CIMB Niaga','BTN','PermataBank','SeaBank','DANA','GoPay','OVO','ShopeePay','LinkAja','Lainnya'];

  const esc = value => String(value ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');

  function ensureStyle() {
    if (doc.querySelector('link[data-seller-p8-bridge-style]')) return;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/seller-center-p8-bridge.css?v=1.0';
    link.dataset.sellerP8BridgeStyle = 'true';
    doc.head.appendChild(link);
  }

  async function api(path, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    const config = { credentials: 'include', cache: 'no-store', ...options, headers };
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      config.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }
    const response = await fetch(path, config);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || data.message || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function notify(message) {
    if (typeof window.showToast === 'function') window.showToast(message);
    const host = doc.getElementById('sellerP8Notice');
    if (host) {
      host.textContent = message;
      host.hidden = false;
      clearTimeout(notify.timer);
      notify.timer = setTimeout(() => { host.hidden = true; }, 3200);
    }
  }

  function menuButton() {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'commerce-menu-row';
    button.dataset.sellerP8Settings = 'true';
    button.innerHTML = `
      <span class="commerce-menu-icon"><i class="ph ph-credit-card" aria-hidden="true"></i></span>
      <span><strong>Pengiriman & Pembayaran</strong><small>COD, ongkir, rekening, e-wallet, dan QRIS</small></span>
      <i class="ph ph-caret-right" aria-hidden="true"></i>
    `;
    return button;
  }

  function installSellerMenu() {
    const menu = doc.querySelector('.commerce-menu-list[aria-label="Menu Seller Center"]');
    if (!menu || menu.querySelector('[data-seller-p8-settings]')) return;
    menu.appendChild(menuButton());
  }

  function providerOptions(selected = '') {
    const list = selected && !providers.includes(selected) ? [selected, ...providers] : providers;
    return `<option value="">Pilih bank / e-wallet</option>${list.map(item => `<option value="${esc(item)}" ${item === selected ? 'selected' : ''}>${esc(item)}</option>`).join('')}`;
  }

  function checkbox(name, title, text, checked) {
    return `<label class="scp8-check"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span><strong>${title}</strong><small>${text}</small></span></label>`;
  }

  function field(label, input) {
    return `<label class="scp8-field"><span>${label}</span>${input}</label>`;
  }

  function pageHeader() {
    return `
      <header class="commerce-page-header">
        <button type="button" class="commerce-back" data-seller-p8-back aria-label="Kembali">
          <i class="ph ph-arrow-left" aria-hidden="true"></i>
        </button>
        <div class="commerce-header-copy"><span class="commerce-eyebrow">SELLER CENTER</span><h1 class="commerce-title">Pengiriman & Pembayaran</h1></div>
      </header>`;
  }

  function loading() {
    const feed = doc.getElementById('feed');
    if (!feed) return;
    ensureStyle();
    feed.innerHTML = `<section class="commerce-page scp8-page">${pageHeader()}<main class="commerce-content"><div class="commerce-skeleton"></div><div class="commerce-skeleton" style="margin-top:12px;min-height:180px"></div></main></section>`;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function settingsForm(settings) {
    const qris = settings.qris_image_url
      ? `<div class="scp8-qris-preview"><img src="${esc(settings.qris_image_url)}" alt="QRIS merchant tersimpan"><span>QRIS merchant tersimpan</span></div>`
      : `<div class="scp8-qris-empty"><i class="ph ph-qr-code"></i><span>Belum ada QRIS merchant.</span></div>`;

    return `
      <section class="commerce-page scp8-page">
        ${pageHeader()}
        <main class="commerce-content scp8-content">
          <div id="sellerP8Notice" class="scp8-notice" hidden></div>
          <section class="scp8-intro">
            <div class="scp8-intro-icon"><i class="ph ph-storefront"></i></div>
            <div><strong>Atur cara pembeli menerima barang dan membayar.</strong><p>Semua pembayaran tetap langsung ke seller. Pasar UMKM tidak menahan dana.</p></div>
          </section>

          <form id="sellerP8SettingsForm" class="scp8-form">
            <section class="scp8-card">
              <div class="scp8-card-head"><span class="scp8-step">1</span><div><h2>Metode pengiriman</h2><p>Aktifkan yang benar-benar dapat dilayani tokomu.</p></div></div>
              <div class="scp8-check-grid">
                ${checkbox('pickup_enabled','Ambil di toko','Pembeli mengambil pesanan di lokasi UMKM.',settings.pickup_enabled)}
                ${checkbox('seller_delivery_enabled','Antar oleh seller','Pengantaran dilakukan langsung oleh UMKM.',settings.seller_delivery_enabled)}
                ${checkbox('local_courier_enabled','Kurir lokal','Seller mengoordinasikan kurir lokal.',settings.local_courier_enabled)}
              </div>
              <div class="scp8-grid">
                ${field('Ongkir flat',`<input type="number" name="flat_delivery_fee" min="0" step="1000" value="${esc(settings.flat_delivery_fee ?? 0)}">`)}
                ${field('Gratis ongkir mulai',`<input type="number" name="free_delivery_threshold" min="0" step="1000" value="${settings.free_delivery_threshold ?? ''}" placeholder="Opsional">`)}
                ${field('Estimasi minimum (menit)',`<input type="number" name="estimated_min_minutes" min="0" max="10080" value="${esc(settings.estimated_min_minutes ?? 60)}">`)}
                ${field('Estimasi maksimum (menit)',`<input type="number" name="estimated_max_minutes" min="0" max="20160" value="${esc(settings.estimated_max_minutes ?? 240)}">`)}
                ${field('SLA respons pesanan (menit)',`<input type="number" name="response_sla_minutes" min="15" max="10080" value="${esc(settings.response_sla_minutes ?? 240)}">`)}
              </div>
              ${field('Instruksi ambil di toko',`<textarea name="pickup_instructions" maxlength="1200" placeholder="Contoh: tunjukkan nomor pesanan kepada kasir.">${esc(settings.pickup_instructions || '')}</textarea>`)}
            </section>

            <section class="scp8-card">
              <div class="scp8-card-head"><span class="scp8-step">2</span><div><h2>Metode pembayaran</h2><p>Pilihan ini yang akan muncul pada checkout pembeli.</p></div></div>
              <div class="scp8-check-grid">
                ${checkbox('cod_enabled','COD','Pembeli membayar ketika barang diterima.',settings.cod_enabled)}
                ${checkbox('pay_at_store_enabled','Bayar di toko','Digunakan untuk pesanan ambil di toko.',settings.pay_at_store_enabled)}
                ${checkbox('bank_transfer_enabled','Transfer rekening / e-wallet','Dana masuk langsung ke akun seller.',settings.bank_transfer_enabled)}
                ${checkbox('merchant_qris_enabled','QRIS merchant','Pembeli scan QRIS resmi milik seller.',settings.merchant_qris_enabled)}
              </div>
            </section>

            <section class="scp8-card">
              <div class="scp8-card-head"><span class="scp8-step">3</span><div><h2>Rekening / E-Wallet</h2><p>Wajib dilengkapi sebelum Transfer diaktifkan.</p></div></div>
              <div class="scp8-grid">
                ${field('Jenis tujuan',`<select name="transfer_provider_type"><option value="bank" ${settings.transfer_provider_type === 'bank' ? 'selected' : ''}>Bank</option><option value="ewallet" ${settings.transfer_provider_type === 'ewallet' ? 'selected' : ''}>E-Wallet</option></select>`)}
                ${field('Bank / E-Wallet',`<select name="transfer_provider_name">${providerOptions(settings.transfer_provider_name || '')}</select>`)}
                ${field('Nomor rekening / akun',`<input type="text" inputmode="numeric" autocomplete="off" maxlength="120" name="transfer_account_number" value="${esc(settings.transfer_account_number || '')}" placeholder="Contoh: 1234567890">`)}
                ${field('Nama pemilik',`<input type="text" autocomplete="name" maxlength="160" name="transfer_account_name" value="${esc(settings.transfer_account_name || '')}" placeholder="Nama sesuai rekening / akun">`)}
              </div>
              ${field('Catatan transfer (opsional)',`<textarea name="bank_transfer_instructions" maxlength="1200" placeholder="Instruksi tambahan untuk pembeli.">${esc(settings.bank_transfer_instructions || '')}</textarea>`)}
            </section>

            <section class="scp8-card">
              <div class="scp8-card-head"><span class="scp8-step">4</span><div><h2>QRIS Merchant</h2><p>Upload QRIS resmi yang sudah diterbitkan PJP/acquirer.</p></div></div>
              <div class="scp8-grid">
                ${field('Nama merchant QRIS',`<input type="text" maxlength="160" name="qris_merchant_name" value="${esc(settings.qris_merchant_name || '')}" placeholder="Nama merchant saat pembayaran">`)}
                ${field('Upload gambar QRIS',`<input id="sellerP8QrisFile" type="file" accept="image/png,image/jpeg,image/webp"><small>PNG/JPG/WEBP, maksimal 3 MB.</small>`)}
              </div>
              <input type="hidden" name="qris_image_url" value="${esc(settings.qris_image_url || '')}">
              <input type="hidden" name="qris_public_id" value="${esc(settings.qris_public_id || '')}">
              <div id="sellerP8QrisPreview">${qris}</div>
              ${settings.qris_image_url ? `<label class="scp8-remove"><input type="checkbox" name="remove_qris"><span>Hapus QRIS tersimpan</span></label>` : ''}
              ${field('Catatan QRIS (opsional)',`<textarea name="qris_instructions" maxlength="1200" placeholder="Instruksi tambahan untuk pembeli.">${esc(settings.qris_instructions || '')}</textarea>`)}
            </section>

            <section class="scp8-security"><i class="ph ph-shield-check"></i><p><strong>Pembayaran langsung ke seller.</strong> Platform tidak membuat QRIS, tidak menyimpan saldo, dan tidak bertindak sebagai escrow.</p></section>
            <button class="scp8-save" type="submit"><i class="ph ph-floppy-disk"></i><span>Simpan pengaturan</span></button>
          </form>
        </main>
      </section>`;
  }

  async function openSettings() {
    loading();
    try {
      const data = await api('/api/commerce/fulfillment/settings/me');
      const feed = doc.getElementById('feed');
      if (!feed) return;
      feed.innerHTML = settingsForm(data.settings || {});
      bindPreview();
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (error) {
      const feed = doc.getElementById('feed');
      if (feed) feed.innerHTML = `<section class="commerce-page scp8-page">${pageHeader()}<main class="commerce-content"><section class="scp8-card"><h2>Pengaturan belum dapat dimuat</h2><p>${esc(error.message)}</p></section></main></section>`;
    }
  }

  function bindPreview() {
    const input = doc.getElementById('sellerP8QrisFile');
    input?.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const host = doc.getElementById('sellerP8QrisPreview');
      if (!host) return;
      const url = URL.createObjectURL(file);
      host.innerHTML = `<div class="scp8-qris-preview"><img src="${url}" alt="Preview QRIS baru"><span>Preview QRIS baru</span></div>`;
    });
  }

  async function uploadQris(file) {
    if (!file) return null;
    if (file.size > 3 * 1024 * 1024) throw new Error('Ukuran QRIS maksimal 3 MB.');
    const form = new FormData();
    form.append('file', file);
    const data = await api('/api/uploads/qris-image', { method: 'POST', body: form });
    return data.image || null;
  }

  async function saveSettings(form) {
    const values = new FormData(form);
    const payload = {
      pickup_enabled: values.has('pickup_enabled'),
      seller_delivery_enabled: values.has('seller_delivery_enabled'),
      local_courier_enabled: values.has('local_courier_enabled'),
      cod_enabled: values.has('cod_enabled'),
      pay_at_store_enabled: values.has('pay_at_store_enabled'),
      bank_transfer_enabled: values.has('bank_transfer_enabled'),
      merchant_qris_enabled: values.has('merchant_qris_enabled'),
      flat_delivery_fee: values.get('flat_delivery_fee'),
      free_delivery_threshold: values.get('free_delivery_threshold'),
      estimated_min_minutes: values.get('estimated_min_minutes'),
      estimated_max_minutes: values.get('estimated_max_minutes'),
      response_sla_minutes: values.get('response_sla_minutes'),
      pickup_instructions: values.get('pickup_instructions'),
      bank_transfer_instructions: values.get('bank_transfer_instructions'),
      qris_instructions: values.get('qris_instructions'),
      transfer_provider_type: values.get('transfer_provider_type'),
      transfer_provider_name: String(values.get('transfer_provider_name') || '').trim(),
      transfer_account_number: String(values.get('transfer_account_number') || '').trim(),
      transfer_account_name: String(values.get('transfer_account_name') || '').trim(),
      qris_merchant_name: String(values.get('qris_merchant_name') || '').trim(),
      qris_image_url: String(values.get('qris_image_url') || '').trim(),
      qris_public_id: String(values.get('qris_public_id') || '').trim()
    };

    if (payload.bank_transfer_enabled && (!payload.transfer_provider_name || !payload.transfer_account_number || !payload.transfer_account_name)) {
      throw new Error('Lengkapi bank/e-wallet, nomor rekening/akun, dan nama pemilik sebelum mengaktifkan Transfer.');
    }

    const file = doc.getElementById('sellerP8QrisFile')?.files?.[0];
    if (values.has('remove_qris')) {
      payload.qris_image_url = '';
      payload.qris_public_id = '';
      if (!file) payload.merchant_qris_enabled = false;
    }

    if (file) {
      notify('Mengunggah QRIS merchant…');
      const image = await uploadQris(file);
      payload.qris_image_url = image?.url || '';
      payload.qris_public_id = image?.public_id || '';
    }

    if (payload.merchant_qris_enabled && (!payload.qris_merchant_name || !payload.qris_image_url)) {
      throw new Error('Isi nama merchant dan upload QRIS sebelum mengaktifkan QRIS.');
    }

    await api('/api/commerce/fulfillment/settings/me', { method: 'PUT', body: payload });
  }

  doc.addEventListener('click', event => {
    const settings = event.target?.closest?.('[data-seller-p8-settings]');
    if (settings) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openSettings();
      return;
    }
    const back = event.target?.closest?.('[data-seller-p8-back]');
    if (back) {
      event.preventDefault();
      window.PasarCommerce?.openSellerCenter?.();
    }
  }, true);

  doc.addEventListener('submit', async event => {
    if (event.target?.id !== 'sellerP8SettingsForm') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const form = event.target;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await saveSettings(form);
      notify('Pengiriman & pembayaran berhasil disimpan.');
      setTimeout(openSettings, 500);
    } catch (error) {
      notify(error.message || 'Pengaturan belum dapat disimpan.');
    } finally {
      button.disabled = false;
    }
  }, true);

  const observer = new MutationObserver(installSellerMenu);
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', installSellerMenu, { once: true });
  else installSellerMenu();

  ensureStyle();
  window.PasarSellerP8 = Object.freeze({ version: '1.0', installSellerMenu, openSettings });
})();