'use strict';

(() => {
  const doc = document;
  const upstreamFetch = window.fetch.bind(window);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let context = null;
  let searchTimer = 0;
  let toastTimer = 0;

  function anonId() {
    let id = localStorage.getItem('pasar-umkm-growth-anon');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('pasar-umkm-growth-anon', id);
    }
    return id;
  }

  function cleanMeta(meta = {}) {
    const out = {};
    for (const [key, value] of Object.entries(meta)) {
      if (value === undefined || value === null || value === '') continue;
      out[key] = String(value).slice(0, 120);
    }
    return out;
  }

  function track(eventName, { resourceType = null, resourceId = null, metadata = {} } = {}) {
    return upstreamFetch('/api/growth/events', {
      method: 'POST', credentials: 'include', cache: 'no-store', keepalive: true,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        event_name: eventName,
        anonymous_id: anonId(),
        resource_type: resourceType,
        resource_id: resourceId,
        metadata: cleanMeta(metadata)
      })
    }).catch(() => null);
  }

  function toast(message) {
    let node = doc.querySelector('.p7-growth-toast');
    if (!node) {
      node = doc.createElement('div');
      node.className = 'p7-growth-toast';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      doc.body.appendChild(node);
    }
    clearTimeout(toastTimer);
    node.textContent = message;
    node.classList.add('is-visible');
    toastTimer = setTimeout(() => node.classList.remove('is-visible'), 2400);
  }

  function installFetchSignals() {
    window.fetch = async function p7InstrumentedFetch(input, init = {}) {
      const response = await upstreamFetch(input, init);
      try {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url, location.href);
        if (url.origin !== location.origin || !response.ok) return response;
        const method = String(request.method || 'GET').toUpperCase();
        if (method === 'POST' && url.pathname === '/api/auth/register') track('register_completed', { resourceType: 'platform', metadata: { source: 'auth' } });
        if (method === 'POST' && url.pathname === '/api/reports') track('report_submitted', { resourceType: 'platform', metadata: { source: 'safety_ui' } });
        if (method === 'POST' && url.pathname === '/api/disputes') track('dispute_opened', { resourceType: 'platform', metadata: { source: 'order_ui' } });
        if (method === 'POST' && url.pathname === '/api/store-verification/submissions') track('verification_submitted', { resourceType: 'seller_onboarding', metadata: { source: 'seller_ui' } });
        const orderStatus = url.pathname.match(/^\/api\/orders\/([0-9a-f-]{36})\/status$/i);
        if (orderStatus && (method === 'PATCH' || method === 'POST')) {
          let body = null;
          if (typeof init?.body === 'string') body = JSON.parse(init.body);
          if (body?.status === 'completed') track('order_completed', { resourceType: 'order', resourceId: orderStatus[1], metadata: { source: 'seller_status' } });
        }
      } catch {}
      return response;
    };
  }

  function sideLink(href, icon, label) {
    const link = doc.createElement('a');
    link.className = 'p7-side-link';
    link.href = href;
    link.innerHTML = `<i class="ph ph-${icon}" aria-hidden="true"></i><span>${label}</span>`;
    return link;
  }

  function installSideLinks() {
    const host = doc.getElementById('sideMenuContent');
    if (!host || host.querySelector('[data-p7-launch-link]')) return;
    const launch = sideLink('/launch/', 'rocket-launch', 'Pusat Penjual');
    launch.dataset.p7LaunchLink = 'true';
    const legal = sideLink('/legal/', 'shield-check', 'Trust Center');
    legal.dataset.p7LegalLink = 'true';
    host.append(launch, legal);
  }

  function price(value) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  function esc(value) {
    return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  function renderDiscovery(data, query) {
    const host = doc.getElementById('searchResults');
    if (!host) return;
    host.querySelector('[data-p7-discovery]')?.remove();
    const products = Array.isArray(data?.products) ? data.products.slice(0, 4) : [];
    const stores = Array.isArray(data?.stores) ? data.stores.slice(0, 3) : [];
    if (!products.length && !stores.length) return;
    const section = doc.createElement('section');
    section.className = 'p7-discovery';
    section.dataset.p7Discovery = 'true';
    const rows = [
      ...products.map(item => `<a class="p7-discovery-link" href="/share/product/${esc(item.id)}" data-p7-result="product" data-resource-id="${esc(item.id)}"><img src="${esc(item.image_url || '/assets/logo.webp')}" alt="" loading="lazy"><span><strong>${esc(item.name)}</strong><small>${esc(item.store_name || 'UMKM Lokal')}${item.store_verification_status === 'verified' ? ' · Terverifikasi' : ''}</small></span><span class="price">${price(item.price)}</span></a>`),
      ...stores.map(item => `<a class="p7-discovery-link" href="/share/store/${esc(item.id)}" data-p7-result="store" data-resource-id="${esc(item.id)}"><img src="${esc(item.logo_url || '/assets/logo.webp')}" alt="" loading="lazy"><span><strong>${esc(item.name)}</strong><small>${esc([item.district,item.city].filter(Boolean).join(', ') || 'Lubuklinggau')}${item.verification_status === 'verified' ? ' · Terverifikasi' : ''}</small></span></a>`)
    ].join('');
    section.innerHTML = `<div class="p7-discovery-head"><strong>Hasil discovery</strong><span>Produk & UMKM relevan</span></div><div class="p7-discovery-grid">${rows}</div>`;
    host.appendChild(section);
    section.addEventListener('click', event => {
      const row = event.target.closest('[data-p7-result]');
      if (!row) return;
      track(row.dataset.p7Result === 'product' ? 'product_view' : 'store_view', { resourceType: row.dataset.p7Result, resourceId: row.dataset.resourceId, metadata: { source: 'discovery_search' } });
    }, { once: false });
    track('search', { resourceType: 'search', metadata: { source: 'header_search', query_length: query.length } });
  }

  function installDiscovery() {
    const input = doc.getElementById('searchInput');
    if (!input || input.dataset.p7DiscoveryBound === 'true') return;
    input.dataset.p7DiscoveryBound = 'true';
    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const query = input.value.trim().replace(/\s+/g, ' ');
      if (query.length < 2) {
        doc.querySelector('[data-p7-discovery]')?.remove();
        return;
      }
      searchTimer = setTimeout(async () => {
        try {
          const response = await upstreamFetch(`/api/discover?q=${encodeURIComponent(query)}&kind=all&limit=6`, { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
          const data = await response.json();
          if (response.ok && data.ok) renderDiscovery(data, query);
        } catch {}
      }, 420);
    });
  }

  function ensureReportDialog() {
    let dialog = doc.getElementById('p7ReportDialog');
    if (dialog) return dialog;
    dialog = doc.createElement('dialog');
    dialog.id = 'p7ReportDialog';
    dialog.className = 'p7-report-dialog';
    dialog.innerHTML = `<div class="p7-report-frame"><div class="p7-report-head"><div><h2>Laporkan konten</h2><p id="p7ReportSubject">Kirim laporan untuk diperiksa moderator.</p></div><button class="p7-close" type="button" aria-label="Tutup">×</button></div><form class="p7-report-form"><label>Kategori<select name="category" required><option value="spam">Spam</option><option value="fraud">Dugaan penipuan</option><option value="prohibited_item">Produk dilarang</option><option value="harassment">Pelecehan</option><option value="misleading">Informasi menyesatkan</option><option value="other">Lainnya</option></select></label><label>Jelaskan masalah<textarea name="details" minlength="20" maxlength="1000" required placeholder="Berikan konteks yang cukup agar moderator dapat memeriksa laporan."></textarea></label><div class="p7-report-actions"><button class="p7-btn p7-btn-secondary" type="button" data-p7-cancel>Batal</button><button class="p7-btn p7-btn-primary" type="submit">Kirim laporan</button></div></form></div>`;
    doc.body.appendChild(dialog);
    dialog.querySelector('.p7-close').addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-p7-cancel]').addEventListener('click', () => dialog.close());
    dialog.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      if (!context?.type || !UUID.test(context.id || '')) return;
      const button = event.currentTarget.querySelector('[type="submit"]');
      button.disabled = true;
      const form = new FormData(event.currentTarget);
      try {
        const response = await upstreamFetch('/api/reports', {
          method: 'POST', credentials: 'include', cache: 'no-store',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ subject_type: context.type, subject_id: context.id, category: form.get('category'), details: form.get('details') })
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) {
          dialog.close();
          doc.querySelector('[data-action="login"]')?.click();
          toast('Masuk terlebih dahulu untuk mengirim laporan.');
          return;
        }
        if (!response.ok) throw new Error(data.error || 'Laporan belum dapat dikirim.');
        track('report_submitted', { resourceType: context.type, resourceId: context.id, metadata: { source: 'context_report' } });
        event.currentTarget.reset();
        dialog.close();
        toast('Laporan berhasil dikirim untuk diperiksa.');
      } catch (error) {
        toast(error.message || 'Laporan belum dapat dikirim.');
      } finally { button.disabled = false; }
    });
    return dialog;
  }

  function openReport(type, id, label) {
    if (!['product','store','post'].includes(type) || !UUID.test(id || '')) return;
    context = { type, id };
    const dialog = ensureReportDialog();
    const subject = doc.getElementById('p7ReportSubject');
    if (subject) subject.textContent = `Laporkan ${label || type} untuk diperiksa moderator Pasar UMKM.`;
    dialog.showModal();
  }

  function reportButton(type, id, label) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'p7-context-action';
    button.dataset.p7Report = type;
    button.dataset.resourceId = id;
    button.innerHTML = '<i class="ph ph-flag" aria-hidden="true"></i><span>Laporkan</span>';
    button.addEventListener('click', event => { event.stopPropagation(); openReport(type, id, label); });
    return button;
  }

  function enhanceSafety() {
    doc.querySelectorAll('.ig-product-info[data-product-id]').forEach(node => {
      if (node.querySelector('[data-p7-report="product"]')) return;
      const id = node.dataset.productId;
      if (UUID.test(id || '')) node.appendChild(reportButton('product', id, 'produk ini'));
    });
    doc.querySelectorAll('.public-seller-profile[data-store-id]').forEach(node => {
      if (node.querySelector('[data-p7-report="store"]')) return;
      const id = node.dataset.storeId;
      if (!UUID.test(id || '')) return;
      const target = node.querySelector('.public-seller-actions') || node.querySelector('.social-account-header') || node;
      target.appendChild(reportButton('store', id, 'UMKM ini'));
    });
    const sheet = doc.getElementById('bottomSheet');
    if (sheet && !sheet.hidden && context?.type === 'post' && UUID.test(context.id || '') && !sheet.querySelector('[data-p7-report="post"]')) {
      sheet.querySelector('.sheet-content')?.appendChild(reportButton('post', context.id, 'postingan ini'));
    }
  }

  function installSignals() {
    doc.addEventListener('click', event => {
      const target = event.target?.closest?.('[data-action],[data-nav],[data-p7-result]');
      if (!target) return;
      const action = target.dataset.action || target.dataset.nav || '';
      const productId = target.dataset.productId;
      const storeId = target.dataset.storeId;
      const postIdRaw = target.dataset.postId;
      const postId = String(postIdRaw || '').replace(/^post-/, '');
      if (action === 'product-detail' && UUID.test(productId || '')) { context = { type:'product', id:productId }; track('product_view', { resourceType:'product', resourceId:productId, metadata:{ source:'app' } }); }
      if (['store-detail','seller-profile'].includes(action) && UUID.test(storeId || '')) { context = { type:'store', id:storeId }; track('store_view', { resourceType:'store', resourceId:storeId, metadata:{ source:'app' } }); }
      if (action === 'post-menu' && UUID.test(postId || '')) context = { type:'post', id:postId };
      if (action === 'add-cart' && UUID.test(productId || '')) track('add_to_cart', { resourceType:'product', resourceId:productId, metadata:{ source:'app' } });
      if (action === 'checkout') track('checkout_started', { resourceType:'platform', metadata:{ source:'cart' } });
      if (action === 'sell') track('seller_onboarding_view', { resourceType:'seller_onboarding', metadata:{ source:'app_sell' } });
      queueMicrotask(enhanceSafety);
      setTimeout(enhanceSafety, 80);
    }, true);
  }

  async function handleIntent() {
    const params = new URLSearchParams(location.search);
    const intent = params.get('intent');
    if (intent === 'seller-onboarding') {
      try {
        const response = await upstreamFetch('/api/auth/me', { credentials:'include', cache:'no-store' });
        if (response.ok) { location.replace('/launch/'); return; }
      } catch {}
      setTimeout(() => doc.querySelector('[data-action="login"]')?.click(), 120);
      return;
    }
    if (intent === 'login') { setTimeout(() => doc.querySelector('[data-action="login"]')?.click(), 120); return; }
    if (intent === 'account') { setTimeout(() => doc.querySelector('[data-nav="account"]')?.click(), 160); return; }
    if (intent === 'product-create') {
      setTimeout(() => {
        doc.querySelector('[data-nav="sell"]')?.click();
        setTimeout(() => doc.querySelector('[data-action="product-create"]')?.click(), 180);
      }, 160);
      return;
    }
    const product = params.get('product');
    const store = params.get('store');
    if (UUID.test(product || '')) setTimeout(() => doc.querySelector(`[data-action="product-detail"][data-product-id="${CSS.escape(product)}"]`)?.click(), 450);
    if (UUID.test(store || '')) setTimeout(() => doc.querySelector(`[data-action="store-detail"][data-store-id="${CSS.escape(store)}"],[data-action="seller-profile"][data-store-id="${CSS.escape(store)}"]`)?.click(), 450);
  }

  function init() {
    installFetchSignals();
    installSideLinks();
    installDiscovery();
    installSignals();
    enhanceSafety();
    new MutationObserver(() => { installSideLinks(); installDiscovery(); enhanceSafety(); }).observe(doc.body, { childList:true, subtree:true });
    const pageKey = `p7-page:${location.pathname}${location.search}`;
    if (!sessionStorage.getItem(pageKey)) {
      sessionStorage.setItem(pageKey, '1');
      track('page_view', { resourceType:'platform', metadata:{ path:location.pathname, viewport:`${innerWidth}x${innerHeight}`, referrer_host:document.referrer ? new URL(document.referrer).host : '' } });
    }
    handleIntent();
    document.documentElement.dataset.p7Ready = 'true';
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init, { once:true });
  else init();

  window.PasarP7Growth = Object.freeze({ version:'1.0', track, openReport });
})();