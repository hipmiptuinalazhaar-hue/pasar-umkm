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

if (baseUrl.protocol !== 'https:') throw new Error('P5 critical-surface browser smoke requires HTTPS.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function findBrowser() {
  const candidates = [process.env.BROWSER_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  for (const candidate of candidates) {
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

class CdpClient {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    ws.addEventListener('message', event => this.onMessage(event));
  }

  onMessage(event) {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result || {});
      return;
    }
    for (const handler of this.events.get(message.method) || []) handler(message.params || {});
  }

  on(method, handler) {
    const handlers = this.events.get(method) || [];
    handlers.push(handler);
    this.events.set(method, handlers);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function waitForTarget(port) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl;
      }
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

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed.');
  return result.result?.value;
}

async function waitFor(client, expression, label, duration = timeoutMs) {
  const deadline = Date.now() + duration;
  let lastError = null;
  while (Date.now() < deadline) {
    try { if (await evaluate(client, expression)) return; } catch (error) { lastError = error; }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}.`);
}

async function verifyHttpShells() {
  for (const route of privateRoutes) {
    const response = await fetch(new URL(route, baseUrl), { redirect: 'follow', headers: { 'User-Agent': 'pasar-p5-critical-surfaces/1.0' } });
    assert([200, 404].includes(response.status), `${route} unexpected HTTP ${response.status}`);
    const cache = response.headers.get('cache-control') || '';
    const robots = response.headers.get('x-robots-tag') || '';
    assert(/no-store/i.test(cache), `${route} missing no-store`);
    assert(/noindex/i.test(robots), `${route} missing noindex`);
  }
  console.log(`P5 CRITICAL PASS private route privacy headers (${privateRoutes.length} routes)`);
}

await verifyHttpShells();

const browser = await findBrowser();
const port = await freePort();
const profileDir = await mkdtemp(path.join(os.tmpdir(), 'pasar-p5-critical-'));
const chrome = spawn(browser, [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, '--window-size=390,844', 'about:blank'
], { stdio: 'ignore' });

let ws;
const blockedMutations = [];
const runtimeExceptions = [];
const consoleErrors = [];

try {
  ws = await connect(await waitForTarget(port));
  const client = new CdpClient(ws);
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('Network.enable');
  await client.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  client.on('Fetch.requestPaused', event => {
    const request = event.request || {};
    const method = String(request.method || 'GET').toUpperCase();
    if (mutatingMethods.has(method)) {
      blockedMutations.push({ method, url: request.url });
      client.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Aborted' }).catch(() => null);
    } else {
      client.send('Fetch.continueRequest', { requestId: event.requestId }).catch(() => null);
    }
  });
  client.on('Runtime.exceptionThrown', event => {
    const detail = event.exceptionDetails || {};
    runtimeExceptions.push(detail.exception?.description || detail.text || 'Unknown runtime exception');
  });
  client.on('Runtime.consoleAPICalled', event => {
    if (event.type !== 'error') return;
    const text = (event.args || []).map(item => item.value || item.description || '').join(' ');
    if (text) consoleErrors.push(text);
  });

  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__P5_CRITICAL_ERRORS__=[];
      addEventListener('error', e => { if (e?.message) window.__P5_CRITICAL_ERRORS__.push(String(e.message).slice(0,240)); });
      addEventListener('unhandledrejection', e => { window.__P5_CRITICAL_ERRORS__.push('unhandledrejection: '+String(e.reason?.message || e.reason || '').slice(0,220)); });`
  });

  await client.send('Page.navigate', { url: baseUrl.href });
  await waitFor(client, "document.readyState === 'complete'", 'homepage readiness');
  await waitFor(client, "document.querySelectorAll('#quickCategories .quick-category').length > 0", 'category hydration');
  await waitFor(client, "window.PasarPerformanceV10?.version === '10.1'", 'V10 router');

  const entryProbe = await evaluate(client, `(() => {
    const selectors = ['#notificationButton','#messageButton','[data-nav="reels"]','[data-nav="cart"]','[data-nav="account"]','[data-action="sell"]'];
    return selectors.map(selector => {
      const el = document.querySelector(selector);
      const rect = el?.getBoundingClientRect();
      const style = el ? getComputedStyle(el) : null;
      return { selector, exists: Boolean(el), visible: Boolean(el && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0), width: rect?.width || 0, height: rect?.height || 0 };
    });
  })()`);
  for (const item of entryProbe) {
    assert(item.exists && item.visible, `${item.selector} is not visible`);
    assert(item.height >= 40, `${item.selector} touch target too small: ${item.height}px`);
  }
  console.log('P5 CRITICAL PASS navigation, notifications, messages, cart, account and seller entry points');

  const notificationProbe = await evaluate(client, `(() => {
    const stylesheet = [...document.querySelectorAll('link[rel="stylesheet"]')].some(node => node.href.includes('notification-core.css'));
    const fixture = document.createElement('section');
    fixture.id = 'p5NotificationFixture';
    fixture.className = 'social-notifications-page';
    fixture.style.cssText = 'position:fixed;inset:0 auto auto 0;width:390px;max-width:100vw;z-index:99999;background:#fff';
    fixture.innerHTML = '<header class="notification-topbar"><button class="notification-back">←</button><strong class="notification-title">Notifikasi</strong><button class="notification-read-all">Dibaca semua</button></header><div class="notification-summary"><strong>Aktivitas terbaru</strong><span>Semua sudah dibaca</span></div><div class="notification-list"><button class="notification-row unread"><span class="notification-avatar fallback">A</span><span class="notification-copy"><span class="notification-copy-main"><strong>Pengguna mengirim aktivitas</strong></span><span class="notification-message">Pesan notifikasi pengujian layout.</span><span class="notification-time">baru saja</span></span><span class="notification-open-icon">›</span></button></div>';
    document.body.appendChild(fixture);
    const avatar = fixture.querySelector('.notification-avatar').getBoundingClientRect();
    const row = fixture.querySelector('.notification-row');
    const rowRect = row.getBoundingClientRect();
    const rowStyle = getComputedStyle(row);
    const topbarStyle = getComputedStyle(fixture.querySelector('.notification-topbar'));
    const titleSize = parseFloat(getComputedStyle(fixture.querySelector('.notification-title')).fontSize || '0');
    const overflow = Math.max(0, fixture.scrollWidth - innerWidth);
    const result = { stylesheet, avatarWidth: avatar.width, avatarHeight: avatar.height, rowWidth: rowRect.width, rowDisplay: rowStyle.display, columns: rowStyle.gridTemplateColumns, topbarDisplay: topbarStyle.display, titleSize, overflow };
    fixture.remove();
    return result;
  })()`);
  assert(notificationProbe.stylesheet, 'notification-core.css is not loaded in production shell');
  assert(notificationProbe.avatarWidth >= 40 && notificationProbe.avatarWidth <= 50, `notification avatar width regression: ${notificationProbe.avatarWidth}`);
  assert(notificationProbe.avatarHeight >= 40 && notificationProbe.avatarHeight <= 50, `notification avatar height regression: ${notificationProbe.avatarHeight}`);
  assert(notificationProbe.rowDisplay === 'grid', `notification row is not grid: ${notificationProbe.rowDisplay}`);
  assert(notificationProbe.topbarDisplay === 'grid', `notification topbar is not grid: ${notificationProbe.topbarDisplay}`);
  assert(notificationProbe.titleSize > 0 && notificationProbe.titleSize <= 20, `notification title typography regression: ${notificationProbe.titleSize}px`);
  assert(notificationProbe.overflow <= 2, `notification fixture horizontal overflow ${notificationProbe.overflow}px`);
  console.log(`P5 CRITICAL PASS notification visual regression :: avatar=${notificationProbe.avatarWidth}x${notificationProbe.avatarHeight}`);

  const searchProbe = await evaluate(client, `(async () => {
    document.querySelector('#headerSearchButton')?.click();
    await new Promise(resolve => setTimeout(resolve, 250));
    const overlay = document.querySelector('#searchOverlay');
    const opened = Boolean(overlay && !overlay.hidden && getComputedStyle(overlay).display !== 'none');
    document.querySelector('#closeSearchButton')?.click();
    return { opened };
  })()`);
  assert(searchProbe.opened, 'search overlay did not open from real browser click');
  console.log('P5 CRITICAL PASS search interaction');

  const menuProbe = await evaluate(client, `(async () => {
    document.querySelector('#menuButton')?.click();
    await new Promise(resolve => setTimeout(resolve, 250));
    const menu = document.querySelector('#sideMenu');
    const opened = Boolean(menu && !menu.hidden && getComputedStyle(menu).display !== 'none');
    document.querySelector('#closeMenuButton')?.click();
    return { opened };
  })()`);
  assert(menuProbe.opened, 'side menu did not open from real browser click');
  console.log('P5 CRITICAL PASS side-menu interaction');

  const cartProbe = await evaluate(client, `(async () => {
    document.querySelector('[data-nav="cart"]')?.click();
    await new Promise(resolve => setTimeout(resolve, 900));
    return { active: typeof STATE !== 'undefined' ? STATE.activeNav : '', buttonActive: document.querySelector('[data-nav="cart"]')?.classList.contains('active') || false, overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth) };
  })()`);
  assert(cartProbe.active === 'cart' || cartProbe.buttonActive, `cart route did not activate: ${JSON.stringify(cartProbe)}`);
  assert(cartProbe.overflow <= 3, `cart route overflow ${cartProbe.overflow}px`);
  console.log('P5 CRITICAL PASS cart routing');

  await evaluate(client, `document.querySelector('[data-nav="home"]')?.click()`);
  await sleep(350);

  const guestIntentProbe = await evaluate(client, `(async () => {
    const close = () => { try { window.closeBottomSheet?.(); } catch {} };
    const results = {};
    for (const [name, selector] of [['account','[data-nav="account"]'],['notifications','#notificationButton'],['messages','#messageButton'],['sell','[data-action="sell"]']]) {
      close();
      document.querySelector(selector)?.click();
      await new Promise(resolve => setTimeout(resolve, 750));
      const sheet = document.querySelector('#bottomSheet');
      results[name] = {
        accepted: Boolean(document.querySelector(selector)),
        activeNav: typeof STATE !== 'undefined' ? STATE.activeNav : '',
        sheetVisible: Boolean(sheet && !sheet.hidden && getComputedStyle(sheet).display !== 'none'),
        accountPage: Boolean(document.querySelector('.social-account-page')),
        notificationPage: Boolean(document.querySelector('.social-notifications-page')),
        chatPage: Boolean(document.querySelector('.chat-v7-page'))
      };
    }
    close();
    return results;
  })()`);
  for (const [name, result] of Object.entries(guestIntentProbe)) {
    assert(result.accepted, `${name} entry point missing`);
    assert(result.sheetVisible || result.accountPage || result.notificationPage || result.chatPage || result.activeNav === 'account', `${name} intent produced no user-facing surface`);
  }
  console.log(`P5 CRITICAL PASS guest auth-gated intents :: ${JSON.stringify(guestIntentProbe)}`);

  await evaluate(client, `document.querySelector('[data-nav="home"]')?.click()`);
  await sleep(300);
  await evaluate(client, `window.PasarPerformanceV10.openReels()`);
  await waitFor(client, "window.PasarReelsV4?.version === '4.0'", 'Reels V4 runtime');
  await waitFor(client, "Boolean(document.querySelector('.reels-v4-shell'))", 'Reels shell');
  const reelsProbe = await evaluate(client, `(() => ({ cards: document.querySelectorAll('.reels-v4-card').length, overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), shell: Boolean(document.querySelector('.reels-v4-shell')) }))()`);
  assert(reelsProbe.shell, 'Reels shell did not mount');
  assert(reelsProbe.overflow <= 3, `Reels route overflow ${reelsProbe.overflow}px`);
  console.log(`P5 CRITICAL PASS Reels runtime :: cards=${reelsProbe.cards}`);

  const severeExceptions = runtimeExceptions.filter(text => !/AbortError|ERR_FAILED|Failed to fetch/i.test(text));
  const severeConsole = consoleErrors.filter(text => !/AbortError|ERR_FAILED|Failed to fetch|play\(\)|autoplay|NotAllowedError/i.test(text));
  assert(severeExceptions.length === 0, `runtime exceptions: ${severeExceptions.slice(0, 3).join(' | ')}`);
  assert(severeConsole.length === 0, `console errors: ${severeConsole.slice(0, 3).join(' | ')}`);

  for (const route of privateRoutes) {
    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await client.send('Page.navigate', { url: new URL(route, baseUrl).href });
    await waitFor(client, "document.readyState === 'complete'", `${route} mobile readiness`);
    let shell = await evaluate(client, `(() => ({ title: document.title, text: (document.body?.innerText || '').trim().length, overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth) }))()`);
    assert(shell.title.length > 0, `${route} has empty title on mobile`);
    assert(shell.text > 10, `${route} has empty shell on mobile`);
    assert(shell.overflow <= 3, `${route} mobile overflow ${shell.overflow}px`);

    await client.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await sleep(120);
    shell = await evaluate(client, `(() => ({ overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), width: innerWidth }))()`);
    assert(shell.width === 1280, `${route} desktop viewport mismatch ${shell.width}`);
    assert(shell.overflow <= 3, `${route} desktop overflow ${shell.overflow}px`);
  }
  console.log(`P5 CRITICAL PASS private route browser shells mobile+desktop (${privateRoutes.length} routes)`);

  console.log(`P5 critical-surface real-browser certification: PASS; blocked production mutations=${blockedMutations.length}`);
} finally {
  try { ws?.close(); } catch {}
  if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL');
  await rm(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => null);
}
