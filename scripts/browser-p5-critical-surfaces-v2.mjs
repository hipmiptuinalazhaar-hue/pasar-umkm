import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const baseUrl = new URL(process.env.P5_BASE_URL || 'https://pasar-umkm.hipmiptuinalazhaar.workers.dev/');
const timeoutMs = Number(process.env.P5_CRITICAL_TIMEOUT_MS || 25000);
const privateRoutes = ['/checkout/', '/purchases/', '/seller-orders/', '/support/', '/admin/'];
const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

if (baseUrl.protocol !== 'https:') throw new Error('P5 critical-surface browser smoke requires HTTPS.');

async function browserBin() {
  for (const candidate of [process.env.BROWSER_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean)) {
    try { await access(candidate, fsConstants.X_OK); return candidate; } catch {}
  }
  throw new Error('No supported Chromium browser found.');
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const job = this.pending.get(message.id);
        if (!job) return;
        this.pending.delete(message.id);
        return message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result || {});
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
    });
  }
  on(method, listener) {
    const list = this.listeners.get(method) || [];
    list.push(listener);
    this.listeners.set(method, list);
  }
  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function targetWs(port) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = response.ok ? await response.json() : [];
      const target = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
      if (target) return target.webSocketDebuggerUrl;
    } catch {}
    await sleep(120);
  }
  throw new Error('Chrome DevTools target did not become ready.');
}

async function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error('CDP websocket timeout.')), 10000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(ws); }, { once: true });
    ws.addEventListener('error', event => { clearTimeout(timer); reject(event.error || new Error('CDP websocket error.')); }, { once: true });
  });
}

async function evalJs(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Runtime evaluation failed.');
  return result.result?.value;
}

async function waitFor(client, expression, label, limit = timeoutMs) {
  const deadline = Date.now() + limit;
  let lastError = null;
  while (Date.now() < deadline) {
    try { if (await evalJs(client, expression)) return; } catch (error) { lastError = error; }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`);
}

for (const route of privateRoutes) {
  const response = await fetch(new URL(route, baseUrl), { redirect: 'follow', headers: { 'User-Agent': 'pasar-p5-critical-surfaces-v2/1.0' } });
  assert([200, 404].includes(response.status), `${route} unexpected HTTP ${response.status}`);
  assert(/no-store/i.test(response.headers.get('cache-control') || ''), `${route} missing no-store`);
  assert(/noindex/i.test(response.headers.get('x-robots-tag') || ''), `${route} missing noindex`);
}
console.log(`P5 CRITICAL PASS private route privacy headers (${privateRoutes.length} routes)`);

const bin = await browserBin();
const port = await freePort();
const profile = await mkdtemp(path.join(os.tmpdir(), 'pasar-p5-critical-v2-'));
const chrome = spawn(bin, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
let ws;
const blockedMutations = [];
const exceptions = [];
const consoleErrors = [];

try {
  ws = await connect(await targetWs(port));
  const cdp = new Cdp(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  cdp.on('Fetch.requestPaused', event => {
    const method = String(event.request?.method || 'GET').toUpperCase();
    if (mutatingMethods.has(method)) {
      blockedMutations.push({ method, url: event.request?.url || '' });
      cdp.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Aborted' }).catch(() => null);
    } else cdp.send('Fetch.continueRequest', { requestId: event.requestId }).catch(() => null);
  });
  cdp.on('Runtime.exceptionThrown', event => {
    const detail = event.exceptionDetails || {};
    exceptions.push(detail.exception?.description || detail.text || 'Unknown runtime exception');
  });
  cdp.on('Runtime.consoleAPICalled', event => {
    if (event.type !== 'error') return;
    const text = (event.args || []).map(item => item.value || item.description || '').join(' ');
    if (text) consoleErrors.push(text);
  });

  await cdp.send('Page.navigate', { url: baseUrl.href });
  await waitFor(cdp, "document.readyState === 'complete'", 'homepage readiness');
  await waitFor(cdp, "document.querySelectorAll('#quickCategories .quick-category').length > 0", 'category hydration');
  await waitFor(cdp, "window.PasarPerformanceV10?.version === '10.1'", 'V10 router');

  const selectors = ['#notificationButton', '#messageButton', '[data-nav="reels"]', '[data-nav="cart"]', '[data-nav="account"]', '[data-action="sell"]'];
  const entry = await evalJs(cdp, `(${JSON.stringify(selectors)}).map(selector => { const el=document.querySelector(selector); const r=el?.getBoundingClientRect(); const s=el?getComputedStyle(el):null; return {selector,exists:Boolean(el),visible:Boolean(el&&s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0),height:r?.height||0}; })`);
  for (const item of entry) {
    assert(item.exists && item.visible, `${item.selector} is not visible`);
    assert(item.height >= 40, `${item.selector} touch target too small: ${item.height}px`);
  }
  console.log('P5 CRITICAL PASS navigation, notifications, messages, cart, account and seller entry points');

  const notification = await evalJs(cdp, `(() => {
    const stylesheet=[...document.querySelectorAll('link[rel="stylesheet"]')].some(node=>node.href.includes('notification-core.css'));
    const fixture=document.createElement('section'); fixture.className='social-notifications-page'; fixture.style.cssText='position:fixed;left:0;top:0;width:390px;max-width:100vw;z-index:99999;background:#fff';
    fixture.innerHTML='<header class="notification-topbar"><button class="notification-back">←</button><strong class="notification-title">Notifikasi</strong><button class="notification-read-all">Dibaca semua</button></header><div class="notification-summary"><strong>Aktivitas terbaru</strong><span>Semua sudah dibaca</span></div><div class="notification-list"><button class="notification-row unread"><span class="notification-avatar fallback">A</span><span class="notification-copy"><span class="notification-copy-main"><strong>Aktivitas</strong></span><span class="notification-message">Pesan pengujian.</span></span><span class="notification-open-icon">›</span></button></div>';
    document.body.appendChild(fixture);
    const avatar=fixture.querySelector('.notification-avatar').getBoundingClientRect();
    const row=getComputedStyle(fixture.querySelector('.notification-row'));
    const top=getComputedStyle(fixture.querySelector('.notification-topbar'));
    const result={stylesheet,avatarWidth:avatar.width,avatarHeight:avatar.height,rowDisplay:row.display,topDisplay:top.display,title:parseFloat(getComputedStyle(fixture.querySelector('.notification-title')).fontSize||'0'),overflow:Math.max(0,fixture.scrollWidth-innerWidth)};
    fixture.remove();
    return result;
  })()`);
  assert(notification.stylesheet, 'notification-core.css is not loaded in production shell');
  assert(notification.avatarWidth >= 40 && notification.avatarWidth <= 50, `notification avatar width regression: ${notification.avatarWidth}`);
  assert(notification.avatarHeight >= 40 && notification.avatarHeight <= 50, `notification avatar height regression: ${notification.avatarHeight}`);
  assert(notification.rowDisplay === 'grid', `notification row is not grid: ${notification.rowDisplay}`);
  assert(notification.topDisplay === 'grid', `notification topbar is not grid: ${notification.topDisplay}`);
  assert(notification.title > 0 && notification.title <= 20, `notification title typography regression: ${notification.title}px`);
  assert(notification.overflow <= 2, `notification fixture horizontal overflow ${notification.overflow}px`);
  console.log(`P5 CRITICAL PASS notification visual regression :: avatar=${notification.avatarWidth}x${notification.avatarHeight}`);

  const searchOpened = await evalJs(cdp, `(async()=>{document.querySelector('#headerSearchButton')?.click();await new Promise(r=>setTimeout(r,250));const e=document.querySelector('#searchOverlay');const open=Boolean(e&&!e.hidden&&getComputedStyle(e).display!=='none');document.querySelector('#closeSearchButton')?.click();return open})()`);
  assert(searchOpened, 'search overlay did not open from real browser click');
  console.log('P5 CRITICAL PASS search interaction');

  const menuOpened = await evalJs(cdp, `(async()=>{document.querySelector('#menuButton')?.click();await new Promise(r=>setTimeout(r,250));const e=document.querySelector('#sideMenu');const open=Boolean(e&&!e.hidden&&getComputedStyle(e).display!=='none');document.querySelector('#closeMenuButton')?.click();return open})()`);
  assert(menuOpened, 'side menu did not open from real browser click');
  console.log('P5 CRITICAL PASS side-menu interaction');

  await evalJs(cdp, `document.querySelector('[data-nav="cart"]')?.click()`);
  await waitFor(cdp, "(typeof STATE!=='undefined'&&STATE.activeNav==='cart') || document.querySelector('[data-nav=\"cart\"]')?.classList.contains('active')", 'cart routing', 12000);
  const cartOverflow = await evalJs(cdp, `Math.max(0,document.documentElement.scrollWidth-innerWidth)`);
  assert(cartOverflow <= 3, `cart route overflow ${cartOverflow}px`);
  console.log('P5 CRITICAL PASS cart routing');

  await evalJs(cdp, `document.querySelector('[data-nav="home"]')?.click()`);
  await sleep(300);

  const intents = [['account', '[data-nav="account"]'], ['notifications', '#notificationButton'], ['messages', '#messageButton'], ['sell', '[data-action="sell"]']];
  for (const [name, selector] of intents) {
    await evalJs(cdp, `(() => { try { if (typeof closeBottomSheet==='function') closeBottomSheet(); } catch {} document.querySelector(${JSON.stringify(selector)})?.click(); })()`);
    await waitFor(cdp, `(() => { const sheet=document.querySelector('#bottomSheet'); return Boolean((typeof STATE!=='undefined'&&STATE.activeSheet) || (sheet&&!sheet.hidden&&getComputedStyle(sheet).display!=='none') || document.querySelector('.social-account-page') || document.querySelector('.social-notifications-page') || document.querySelector('.chat-v7-page') || (typeof STATE!=='undefined'&&STATE.activeNav==='account')); })()`, `${name} guest intent`, 15000);
    const result = await evalJs(cdp, `(() => ({activeSheet:typeof STATE!=='undefined'?STATE.activeSheet:null,activeNav:typeof STATE!=='undefined'?STATE.activeNav:'',accountPage:Boolean(document.querySelector('.social-account-page')),notificationPage:Boolean(document.querySelector('.social-notifications-page')),chatPage:Boolean(document.querySelector('.chat-v7-page'))}))()`);
    console.log(`P5 CRITICAL PASS ${name} guest intent :: ${JSON.stringify(result)}`);
  }

  await evalJs(cdp, `(() => { try { if (typeof closeBottomSheet==='function') closeBottomSheet(); } catch {} document.querySelector('[data-nav="home"]')?.click(); })()`);
  await sleep(250);
  await evalJs(cdp, `window.PasarPerformanceV10.openReels()`);
  await waitFor(cdp, "window.PasarReelsV4?.version === '4.0'", 'Reels V4 runtime');
  await waitFor(cdp, "Boolean(document.querySelector('.reels-v4-shell'))", 'Reels shell');
  const reelsOverflow = await evalJs(cdp, `Math.max(0,document.documentElement.scrollWidth-innerWidth)`);
  assert(reelsOverflow <= 3, `Reels route overflow ${reelsOverflow}px`);
  console.log('P5 CRITICAL PASS Reels runtime');

  const severeExceptions = exceptions.filter(text => !/AbortError|ERR_FAILED|Failed to fetch/i.test(text));
  const severeConsole = consoleErrors.filter(text => !/AbortError|ERR_FAILED|Failed to fetch|play\(\)|autoplay|NotAllowedError/i.test(text));
  assert(severeExceptions.length === 0, `runtime exceptions: ${severeExceptions.slice(0, 3).join(' | ')}`);
  assert(severeConsole.length === 0, `console errors: ${severeConsole.slice(0, 3).join(' | ')}`);

  for (const route of privateRoutes) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp.send('Page.navigate', { url: new URL(route, baseUrl).href });
    await waitFor(cdp, "document.readyState === 'complete'", `${route} mobile readiness`);
    const mobile = await evalJs(cdp, `({title:document.title,text:(document.body?.innerText||'').trim().length,overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth)})`);
    assert(mobile.title && mobile.text > 10, `${route} mobile shell is empty`);
    assert(mobile.overflow <= 3, `${route} mobile overflow ${mobile.overflow}px`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await sleep(150);
    const desktop = await evalJs(cdp, `({width:innerWidth,overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth)})`);
    assert(desktop.width === 1280, `${route} desktop viewport mismatch ${desktop.width}`);
    assert(desktop.overflow <= 3, `${route} desktop overflow ${desktop.overflow}px`);
  }
  console.log(`P5 CRITICAL PASS private route browser shells mobile+desktop (${privateRoutes.length} routes)`);
  console.log(`P5 critical-surface real-browser certification v2: PASS; blocked production mutations=${blockedMutations.length}`);
} finally {
  try { ws?.close(); } catch {}
  if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL');
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => null);
}
