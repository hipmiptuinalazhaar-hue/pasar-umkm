import { adminApi } from "./api.js?v=7.0.0";

const number = new Intl.NumberFormat("id-ID");
function esc(value){return String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function metric(label,value,detail=""){return `<div class="metric-item"><span class="metric-label">${esc(label)}</span><span class="metric-value">${esc(value)}</span>${detail?`<span class="metric-detail">${esc(detail)}</span>`:""}</div>`}
function status(value){return `<span class="status">${esc(value||"draft")}</span>`}

function promotionForm(){return `<section class="section-block"><div class="section-head"><div><h2 class="section-title">Buat promotion placement</h2><p class="section-copy">Registry placement tanpa billing, saldo, atau settlement.</p></div></div><form class="form-stack" id="promotionForm"><div class="field-group"><label class="field-label">Placement</label><select class="field-input" name="placement"><option value="home_featured">Home featured</option><option value="search_boost">Search boost</option><option value="store_featured">Store featured</option><option value="sponsor_banner">Sponsor banner</option></select></div><div class="field-group"><label class="field-label">Subject</label><select class="field-input" name="subject_type"><option value="product">Product</option><option value="store">Store</option><option value="post">Post</option><option value="external">External</option></select></div><div class="field-group"><label class="field-label">Subject ID</label><input class="field-input" name="subject_id" placeholder="UUID produk/toko/post. Kosongkan untuk external."></div><div class="field-group"><label class="field-label">Store ID <span class="field-hint">opsional</span></label><input class="field-input" name="store_id" placeholder="UUID store"></div><div class="field-group"><label class="field-label">Headline</label><input class="field-input" name="headline" maxlength="180"></div><div class="field-group"><label class="field-label">Sponsor label</label><input class="field-input" name="sponsor_label" maxlength="120"></div><div class="field-group"><label class="field-label">Destination URL</label><input class="field-input" name="destination_url" maxlength="800"></div><div class="field-group"><label class="field-label">Status awal</label><select class="field-input" name="status"><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="active">Active</option><option value="paused">Paused</option></select></div><div class="field-group"><label class="field-label">Mulai</label><input class="field-input" type="datetime-local" name="starts_at"></div><div class="field-group"><label class="field-label">Berakhir</label><input class="field-input" type="datetime-local" name="ends_at"></div><button class="button button-primary" type="submit">Simpan placement</button></form></section>`}

function promotionRows(items, canManage){if(!items.length)return `<div class="empty-state"><strong>Belum ada promotion placement.</strong><p>Registry masih kosong.</p></div>`;return `<div class="data-shell">${items.map(item=>`<article class="data-row"><div class="row-main"><div class="row-title"><strong>${esc(item.headline||item.placement)}</strong>${status(item.status)}</div><div class="row-meta"><span>${esc(item.placement)}</span><span>${esc(item.subject_type)}${item.subject_id?` · ${esc(item.subject_id)}`:""}</span>${item.store_name?`<span>${esc(item.store_name)}</span>`:""}</div></div>${canManage?`<div class="row-actions"><button type="button" class="row-action" data-promo-status="active" data-promo-id="${esc(item.id)}">Aktifkan</button><button type="button" class="row-action" data-promo-status="paused" data-promo-id="${esc(item.id)}">Pause</button><button type="button" class="row-action" data-promo-status="ended" data-promo-id="${esc(item.id)}">Akhiri</button></div>`:""}</article>`).join("")}</div>`}

export async function renderGrowth({ host, permissionSet, signal, confirmAction, refresh }) {
  const canViewPromotions = permissionSet.has("promotions.view");
  const canManage = permissionSet.has("promotions.manage");
  const [metricPayload,promotionPayload] = await Promise.all([
    adminApi.growthMetrics({ signal }),
    canViewPromotions ? adminApi.promotions({}, { signal }) : Promise.resolve({ promotions:[] })
  ]);
  const m = metricPayload.metrics || {};
  const promotions = promotionPayload.promotions || [];
  host.innerHTML = `<header class="view-header"><div><p class="eyebrow">Launch & Growth</p><h1 class="view-title">Growth Workspace</h1><p class="view-description">Funnel berdasarkan event P7 terinstrumentasi. Data sebelum rollout P7 tidak direkonstruksi atau dikarang.</p></div><div class="view-actions"><a class="button button-secondary" href="/launch/" target="_blank" rel="noopener">Seller Launch Center</a></div></header><section class="metric-strip" aria-label="Funnel 7 hari">${metric("Visitors 7d",number.format(m.visitors_7d||0),`${number.format(m.page_views_7d||0)} page views`)}${metric("Product views",number.format(m.product_views_7d||0),`${m.product_to_cart_7d_pct||0}% → cart`)}${metric("Add to cart",number.format(m.add_to_cart_7d||0),`${m.cart_to_checkout_7d_pct||0}% → checkout`)}${metric("Checkout",number.format(m.checkout_started_7d||0),`${m.checkout_to_completed_7d_pct||0}% → completed`)}</section><section class="section-block"><div class="section-head"><div><h2 class="section-title">30-day funnel</h2><p class="section-copy">Conversion dihitung hanya dari event yang benar-benar tercatat setelah instrumentation aktif.</p></div></div><ul class="access-list"><li class="access-item"><div class="access-name"><strong>Visitors</strong><span>Unique user/hash anonim</span></div><strong>${number.format(m.visitors_30d||0)}</strong></li><li class="access-item"><div class="access-name"><strong>Product → cart</strong><span>${number.format(m.product_views_30d||0)} product views</span></div><strong>${m.product_to_cart_30d_pct||0}%</strong></li><li class="access-item"><div class="access-name"><strong>Cart → checkout</strong><span>${number.format(m.add_to_cart_30d||0)} add-to-cart</span></div><strong>${m.cart_to_checkout_30d_pct||0}%</strong></li><li class="access-item"><div class="access-name"><strong>Checkout → completed</strong><span>${number.format(m.checkout_started_30d||0)} checkout started</span></div><strong>${m.checkout_to_completed_30d_pct||0}%</strong></li></ul></section>${canViewPromotions?`<section class="section-block"><div class="section-head"><div><h2 class="section-title">Promotion placements</h2><p class="section-copy">Featured/search placement registry. Billing tetap di luar scope P7.</p></div></div>${promotionRows(promotions,canManage)}</section>`:""}${canManage?promotionForm():""}<section class="security-note"><div><strong>Privacy-minimized analytics</strong><p>Growth events tidak menyimpan raw IP atau raw user-agent. Anonymous browser key di-hash server-side.</p></div></section>`;

  document.getElementById("promotionForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const raw = Object.fromEntries(new FormData(event.currentTarget).entries());
      const payload = { ...raw, starts_at: raw.starts_at ? new Date(raw.starts_at).toISOString() : null, ends_at: raw.ends_at ? new Date(raw.ends_at).toISOString() : null };
      await adminApi.createPromotion(payload);
      await refresh();
    } finally { button.disabled = false; }
  });

  host.querySelectorAll("[data-promo-status]").forEach(button => button.addEventListener("click", async () => {
    const reason = await confirmAction({ title:"Ubah status promotion", copy:`Ubah placement menjadi ${button.dataset.promoStatus}?`, confirmLabel:"Simpan status", tone:button.dataset.promoStatus==='ended'?"danger":"positive", requireReason:true });
    if (!reason) return;
    button.disabled = true;
    try { await adminApi.changePromotionStatus(button.dataset.promoId, button.dataset.promoStatus, reason); await refresh(); }
    finally { button.disabled = false; }
  }));
}
