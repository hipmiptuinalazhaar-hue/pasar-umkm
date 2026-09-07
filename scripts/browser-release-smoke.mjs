import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const baseUrl = new URL(process.env.P5_BASE_URL || 'https://pasar-umkm.hipmiptuinalazhaar.workers.dev/');
const viewportSpec = process.env.P5_VIEWPORTS || '360x800,390x844,430x932,768x1024,1024x768,1280x800,1600x900';
const outputDir = path.resolve(process.env.P5_BROWSER_OUTPUT_DIR || 'p5-browser-results');
const readyTimeoutMs = Number(process.env.P5_BROWSER_READY_TIMEOUT_MS || 20000);

if (baseUrl.protocol !== 'https:') throw new Error('P5 browser smoke requires HTTPS.');
if (!Number.isFinite(readyTimeoutMs) || readyTimeoutMs < 5000) throw new Error('P5_BROWSER_READY_TIMEOUT_MS must be >= 5000.');

const viewports = viewportSpec.split(',').map(item => {
  const match = item.trim().match(/^(\d{3,4})x(\d{3,4})$/);
  if (!match) throw new Error(`Invalid viewport: ${item}`);
  return { width: Number(match[1]), height: Number(match[2]), name: item.trim() };
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function findBrowser() {
  const candidates = [
    process.env.BROWSER_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {}
  }

  throw new Error(`No supported Chromium browser found. Checked: ${candidates.join(', ')}`);
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
    this.waiters = new Map();
    ws.addEventListener('message', event => this.onMessage(event));
  }

  onMessage(event) {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
      else pending.resolve(message.result || {});
      return;
    }

    if (message.method) {
      const waiters = this.waiters.get(message.method) || [];
      this.waiters.delete(message.method);
      for (const waiter of waiters) waiter.resolve(message.params || {});
    }
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  waitFor(method, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const entries = this.waiters.get(method) || [];
        this.waiters.set(method, entries.filter(item => item.resolve !== wrappedResolve));
        reject(new Error(`Timed out waiting for CDP event ${method}`));
      }, timeoutMs);

      const wrappedResolve = value => {
        clearTimeout(timer);
        resolve(value);
      };

      const entries = this.waiters.get(method) || [];
      entries.push({ resolve: wrappedResolve, reject });
      this.waiters.set(method, entries);
    });
  }
}

async function connectWebSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error('Timed out opening CDP websocket.')), 10000);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve(ws);
    }, { once: true });
    ws.addEventListener('error', event => {
      clearTimeout(timer);
      reject(event.error || new Error('CDP websocket error.'));
    }, { once: true });
  });
}

async function waitForTarget(port) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl;
      }
    } catch {}
    await sleep(150);
  }
  throw new Error('Chrome DevTools target did not become ready.');
}

const probeExpression = `(() => {
  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
  };
  const rect = el => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
  const header = document.querySelector('.app > .app-header');
  const nav = document.querySelector('.app > .app-navigation');
  const hero = document.querySelector('#homeDiscovery .market-hero');
  const primary = document.querySelector('#homeDiscovery .market-hero-primary');
  const search = document.querySelector('#headerSearchButton');
  const splash = document.querySelector('#splashIntro');
  const root = document.documentElement;
  return {
    title: document.title,
    lang: root.lang,
    readyState: document.readyState,
    innerWidth,
    innerHeight,
    scrollWidth: root.scrollWidth,
    overflowX: Math.max(0, root.scrollWidth - innerWidth),
    headerVisible: visible(header),
    navVisible: visible(nav),
    heroVisible: visible(hero),
    primaryVisible: visible(primary),
    searchVisible: visible(search),
    splashVisible: visible(splash),
    headerPosition: header ? getComputedStyle(header).position : null,
    navPosition: nav ? getComputedStyle(nav).position : null,
    headerRect: rect(header),
    navRect: rect(nav),
    heroRect: rect(hero),
    primaryRect: rect(primary),
    categoryCount: document.querySelectorAll('#quickCategories .quick-category').length,
    heroText: document.querySelector('.market-hero-title')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
    jsErrors: Array.isArray(window.__P5_BROWSER_ERRORS__) ? window.__P5_BROWSER_ERRORS__.slice(0, 10) : []
  };
})()`;

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed.');
  return result.result?.value;
}

function assertProbe(probe, viewport) {
  const failures = [];
  const expect = (condition, message) => { if (!condition) failures.push(message); };

  expect(probe.title.includes('Pasar UMKM'), `title mismatch: ${probe.title}`);
  expect(probe.lang === 'id', `document lang must be id, got ${probe.lang}`);
  expect(probe.readyState === 'complete', `document not complete: ${probe.readyState}`);
  expect(!probe.splashVisible, 'splash still visible after readiness window');
  expect(probe.headerVisible, 'application header is not visible');
  expect(probe.navVisible, 'primary navigation is not visible');
  expect(probe.heroVisible, 'home hero is not visible');
  expect(probe.primaryVisible, 'primary hero CTA is not visible');
  expect(probe.searchVisible, 'search entry point is not visible');
  expect(probe.categoryCount > 0, 'categories did not hydrate');
  expect(probe.heroText.includes('Produk lokal'), `hero copy missing: ${probe.heroText}`);
  expect(probe.overflowX <= 3, `horizontal overflow ${probe.overflowX}px`);
  expect((probe.primaryRect?.height || 0) >= 44, `primary CTA touch target ${probe.primaryRect?.height || 0}px`);
  expect(probe.jsErrors.length === 0, `runtime JS errors: ${probe.jsErrors.join(' | ')}`);

  const nav = probe.navRect || {};
  if (viewport.width < 768) {
    expect(Math.abs((nav.bottom || 0) - viewport.height) <= 24, `mobile nav is not docked to bottom: bottom=${nav.bottom}`);
    expect((nav.width || 0) <= viewport.width + 2, `mobile nav wider than viewport: ${nav.width}`);
  } else if (viewport.width < 1024) {
    expect((nav.width || 0) <= 600, `tablet dock too wide: ${nav.width}`);
    expect(Math.abs((nav.bottom || 0) - viewport.height) <= 24, `tablet dock is not bottom anchored: bottom=${nav.bottom}`);
  } else if (viewport.width < 1280) {
    expect(Math.abs((nav.left || 0)) <= 2, `laptop rail must start at left edge: ${nav.left}`);
    expect((nav.width || 0) >= 84 && (nav.width || 0) <= 92, `laptop rail width expected ~88px, got ${nav.width}`);
    expect(Math.abs((nav.height || 0) - viewport.height) <= 4, `laptop rail must fill viewport height: ${nav.height}`);
  } else {
    expect(Math.abs((nav.left || 0)) <= 2, `desktop rail must start at left edge: ${nav.left}`);
    expect((nav.width || 0) >= 200 && (nav.width || 0) <= 216, `desktop rail width expected ~208px, got ${nav.width}`);
    expect(Math.abs((nav.height || 0) - viewport.height) <= 4, `desktop rail must fill viewport height: ${nav.height}`);
  }

  if (failures.length) throw new Error(`${viewport.name}: ${failures.join('; ')}`);
}

async function stopChrome(chrome) {
  if (chrome.exitCode !== null || chrome.signalCode !== null) return;
  const exited = new Promise(resolve => chrome.once('exit', resolve));
  chrome.kill('SIGKILL');
  await Promise.race([exited, sleep(3000)]);
}

async function cleanupProfile(profileDir) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      await rm(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
      return;
    } catch (error) {
      if (attempt === 6) {
        console.warn(`P5 cleanup warning: ${error.code || 'ERROR'} ${profileDir}`);
        return;
      }
      await sleep(attempt * 150);
    }
  }
}

async function runViewport(browserBin, viewport) {
  const port = await freePort();
  const profileDir = await mkdtemp(path.join(os.tmpdir(), `p5-browser-${viewport.width}-`));
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    `--window-size=${viewport.width},${viewport.height}`,
    'about:blank'
  ];

  const chrome = spawn(browserBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  chrome.stderr.on('data', chunk => { stderr += String(chunk).slice(-4000); });

  try {
    const wsUrl = await waitForTarget(port);
    const ws = await connectWebSocket(wsUrl);
    const client = new CdpClient(ws);

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.width < 768
    });
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__P5_BROWSER_ERRORS__=[];
        addEventListener('error', e => { if (e && e.message) window.__P5_BROWSER_ERRORS__.push(String(e.message).slice(0,240)); });
        addEventListener('unhandledrejection', e => { window.__P5_BROWSER_ERRORS__.push('unhandledrejection: '+String(e.reason?.message || e.reason || '').slice(0,220)); });`
    });

    const load = client.waitFor('Page.loadEventFired', 25000);
    await client.send('Page.navigate', { url: baseUrl.href });
    await load;

    const deadline = Date.now() + readyTimeoutMs;
    let probe;
    do {
      probe = await evaluate(client, probeExpression);
      if (probe?.readyState === 'complete' && !probe.splashVisible && probe.categoryCount > 0) break;
      await sleep(500);
    } while (Date.now() < deadline);

    assertProbe(probe, viewport);

    const shot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    const screenshotPath = path.join(outputDir, `${viewport.name}.png`);
    await writeFile(screenshotPath, Buffer.from(shot.data, 'base64'));

    ws.close();
    console.log(
      `P5 BROWSER PASS ${viewport.name} :: categories=${probe.categoryCount} overflow=${probe.overflowX}px ` +
      `nav=${Math.round(probe.navRect.width)}x${Math.round(probe.navRect.height)} hero=${Math.round(probe.heroRect.width)}px`
    );
    return { viewport: viewport.name, ...probe, screenshot: screenshotPath };
  } catch (error) {
    throw new Error(`${viewport.name} browser probe failed: ${error.message}\nChrome stderr: ${stderr.slice(-1500)}`);
  } finally {
    await stopChrome(chrome);
    await cleanupProfile(profileDir);
  }
}

await mkdir(outputDir, { recursive: true });
const browserBin = await findBrowser();
console.log(`P5 browser: ${browserBin}`);
console.log(`P5 target: ${baseUrl.origin}`);
console.log(`P5 viewports: ${viewports.map(item => item.name).join(' -> ')}`);
console.log('P5 safety: browser verification is read-only; it performs no authenticated mutation or synthetic checkout.');

const results = [];
for (const viewport of viewports) results.push(await runViewport(browserBin, viewport));

await writeFile(path.join(outputDir, 'report.json'), JSON.stringify({ target: baseUrl.origin, browserBin, results }, null, 2));
console.log(`P5 real browser matrix: ${results.length}/${viewports.length} PASS`);
