import { adminApi } from './api.js';

const root = document.getElementById('intelligenceRoot');
const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const esc = value => String(value ?? '')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#039;');

function metric(label, value, hint = '') {
  return `<article class="oi-metric"><small>${esc(label)}</small><strong>${esc(value)}</strong>${hint ? `<span>${esc(hint)}</span>` : ''}</article>`;
}

function statePill(ok, label) {
  return `<span class="oi-pill ${ok ? 'ok' : 'bad'}"><i></i>${esc(label)}</span>`;
}

function healthRows(health) {
  const schema = health?.schema || {};
  return [
    ['Core schema', schema.core_ready],
    ['Operational P6', schema.operational_ready],
    ['Launch/Growth P7', schema.launch_ready],
    ['Commerce P8', schema.commerce_ready],
    ['Payment profile', schema.payment_profile_ready]
  ];
}

function render({ session, access, health, operations, growth }) {
  const op = operations?.metrics || {};
  const gr = growth?.metrics || {};
  const readiness = healthRows(health);
  const readyCount = readiness.filter(([, ready]) => ready === true).length;
  const queues = n(op.open_reports) + n(op.open_disputes) + n(op.pending_verification_cases);
  const funnelSignals = n(gr.product_views_7d) + n(gr.add_to_cart_7d) + n(gr.checkout_started_7d);

  root.innerHTML = `
    <header class="oi-header">
      <div class="oi-brand"><img src="/assets/logo.webp" alt="" width="44" height="44"><div><span>INTERNAL · P9</span><h1>Operational Intelligence</h1><p>Health, marketplace operations, funnel, dan launch signals dalam satu ruang kerja.</p></div></div>
      <div class="oi-header-actions"><a href="/admin/">Control Center</a><button type="button" data-oi-refresh>Refresh</button></div>
    </header>

    <section class="oi-summary">
      <div><span>Signed in</span><strong>${esc(session?.admin?.name || session?.admin?.email || 'Admin')}</strong><small>${esc((access?.permissions || []).length)} permission aktif</small></div>
      <div><span>System readiness</span><strong>${readyCount}/${readiness.length}</strong><small>${health?.database?.connected ? 'Database connected' : 'Database unavailable'}</small></div>
      <div><span>Open operations</span><strong>${queues}</strong><small>reports + disputes + verification</small></div>
      <div><span>7d funnel signals</span><strong>${funnelSignals}</strong><small>view + cart + checkout</small></div>
    </section>

    <div class="oi-grid">
      <section class="oi-panel oi-health">
        <div class="oi-panel-head"><div><span>PLATFORM</span><h2>Release health</h2></div>${statePill(health?.ok === true, health?.ok ? 'Healthy' : 'Degraded')}</div>
        <div class="oi-health-list">${readiness.map(([label, ready]) => `<div><span>${esc(label)}</span>${statePill(ready === true, ready ? 'ready' : 'not ready')}</div>`).join('')}</div>
        <div class="oi-note">Release contract: <strong>${esc(health?.release || 'unknown')}</strong> · environment: ${esc(health?.environment || 'unknown')}</div>
      </section>

      <section class="oi-panel">
        <div class="oi-panel-head"><div><span>MARKETPLACE</span><h2>30-day operations</h2></div></div>
        <div class="oi-metric-grid">
          ${metric('Orders', n(op.orders_30d).toLocaleString('id-ID'), `${n(op.completed_orders_30d)} selesai`)}
          ${metric('Completion', `${n(op.order_completion_rate_30d).toFixed(1)}%`, 'order 30 hari')}
          ${metric('Completed GMV', money.format(n(op.completed_gmv_30d)), 'non-custodial')}
          ${metric('Active buyers', n(op.active_buyers_30d).toLocaleString('id-ID'))}
          ${metric('Active sellers', n(op.active_sellers_30d).toLocaleString('id-ID'))}
          ${metric('Verified stores', n(op.verified_stores).toLocaleString('id-ID'), `${n(op.pending_store_verification)} pending`)}
        </div>
      </section>

      <section class="oi-panel">
        <div class="oi-panel-head"><div><span>TRUST & SAFETY</span><h2>Action queues</h2></div>${statePill(queues === 0, queues === 0 ? 'Clear' : `${queues} open`)}</div>
        <div class="oi-queue-grid">
          <a href="/admin/#operations"><span>Moderation reports</span><strong>${n(op.open_reports)}</strong><small>open / reviewing</small></a>
          <a href="/admin/#operations"><span>Order disputes</span><strong>${n(op.open_disputes)}</strong><small>needs resolution</small></a>
          <a href="/admin/#operations"><span>Store verification</span><strong>${n(op.pending_verification_cases)}</strong><small>pending submissions</small></a>
          <a href="/admin/#security"><span>Admin actions 24h</span><strong>${n(op.admin_actions_24h)}</strong><small>audited changes</small></a>
        </div>
      </section>

      <section class="oi-panel oi-funnel">
        <div class="oi-panel-head"><div><span>GROWTH</span><h2>7-day commerce funnel</h2></div></div>
        <div class="oi-funnel-track">
          <div><span>Product views</span><strong>${n(gr.product_views_7d)}</strong></div>
          <i>→</i><div><span>Add to cart</span><strong>${n(gr.add_to_cart_7d)}</strong><small>${n(gr.product_to_cart_7d_pct).toFixed(1)}%</small></div>
          <i>→</i><div><span>Checkout</span><strong>${n(gr.checkout_started_7d)}</strong><small>${n(gr.cart_to_checkout_7d_pct).toFixed(1)}%</small></div>
          <i>→</i><div><span>Completed</span><strong>${n(gr.order_completed_7d)}</strong><small>${n(gr.checkout_to_completed_7d_pct).toFixed(1)}%</small></div>
        </div>
        <p class="oi-note">Funnel hanya memakai event browser yang terinstrumentasi setelah rollout telemetry. Raw IP tidak dipakai sebagai visitor key.</p>
      </section>

      <section class="oi-panel oi-launch">
        <div class="oi-panel-head"><div><span>P10 INPUT</span><h2>Launch signal</h2></div></div>
        <div class="oi-launch-score"><strong>${readyCount === readiness.length && health?.ok ? 'READY' : 'REVIEW'}</strong><span>${readyCount}/${readiness.length} platform domains ready</span></div>
        <ul>
          <li>${n(op.active_products)} produk aktif</li>
          <li>${n(gr.visitors_7d)} visitor terinstrumentasi dalam 7 hari</li>
          <li>${n(gr.searches_7d)} pencarian dalam 7 hari</li>
          <li>${n(gr.seller_onboarding_7d)} seller-onboarding view dalam 7 hari</li>
        </ul>
      </section>
    </div>
    <footer>Operational Intelligence V2 · data no-store · internal only · tidak melakukan financial action.</footer>`;

  root.querySelector('[data-oi-refresh]')?.addEventListener('click', load);
}

async function load() {
  root.setAttribute('aria-busy', 'true');
  try {
    const session = await adminApi.session();
    const [access, healthResponse, operations, growth] = await Promise.all([
      adminApi.access(),
      fetch('/api/health', { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } }),
      adminApi.operationsMetrics(),
      adminApi.growthMetrics()
    ]);
    const health = await healthResponse.json().catch(() => ({ ok: false }));
    render({ session, access, health, operations, growth });
  } catch (error) {
    if (error?.status === 401) {
      location.replace('/admin/');
      return;
    }
    root.innerHTML = `<section class="oi-error"><h1>Operational Intelligence belum dapat dimuat</h1><p>${esc(error?.message || 'Unknown error')}</p><a href="/admin/">Kembali ke Control Center</a><button type="button" data-oi-retry>Coba lagi</button></section>`;
    root.querySelector('[data-oi-retry]')?.addEventListener('click', load);
  } finally { root.removeAttribute('aria-busy'); }
}

load();
