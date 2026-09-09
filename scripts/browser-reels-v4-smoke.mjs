import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const baseUrl = new URL(process.env.REELS_V4_BASE_URL || 'https://pasar-umkm.hipmiptuinalazhaar.workers.dev/');
const timeoutMs = Number(process.env.REELS_V4_BROWSER_TIMEOUT_MS || 25000);
if (baseUrl.protocol !== 'https:') throw new Error('Reels V4 browser smoke requires HTTPS.');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
    this.id = 1;
    this.pending = new Map();
    ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result || {});
    });
  }
  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function waitForTarget(port) {
  const deadline = Date.now() + timeoutMs;
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
  const response = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'Runtime evaluation failed.');
  return response.result?.value;
}

async function waitFor(client, expression, label, duration = timeoutMs) {
  const deadline = Date.now() + duration;
  let lastError = null;
  while (Date.now() < deadline) {
    try { if (await evaluate(client, expression)) return; } catch (error) { lastError = error; }
    await sleep(160);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}.`);
}

async function setViewport(client, width, height, mobile = false) {
  await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await sleep(120);
  const probe = await evaluate(client, `(() => {
    const shell = document.querySelector('.reels-v4-shell');
    const scroller = document.querySelector('.reels-v4-scroller');
    const card = document.querySelector('.reels-v4-card');
    return {
      width: innerWidth,
      height: innerHeight,
      overflow: document.documentElement.scrollWidth - innerWidth,
      shellWidth: shell?.getBoundingClientRect().width || 0,
      shellHeight: shell?.getBoundingClientRect().height || 0,
      cardHeight: card?.getBoundingClientRect().height || 0,
      snap: scroller ? getComputedStyle(scroller).scrollSnapType : '',
      overflowY: scroller ? getComputedStyle(scroller).overflowY : ''
    };
  })()`);
  if (probe.overflow > 2) throw new Error(`horizontal overflow ${probe.overflow}px at ${width}x${height}`);
  if (probe.shellWidth < Math.min(width * 0.7, 300)) throw new Error(`Reels shell too narrow at ${width}x${height}`);
  if (probe.shellHeight < height * 0.72) throw new Error(`Reels shell too short at ${width}x${height}`);
  if (!String(probe.snap).includes('y')) throw new Error(`vertical snap missing at ${width}x${height}`);
  return probe;
}

const browser = await findBrowser();
const port = await freePort();
const profileDir = await mkdtemp(path.join(os.tmpdir(), 'pasar-reels-v4-'));
const chrome = spawn(browser, [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, '--window-size=390,844', baseUrl.href
], { stdio: 'ignore' });

let ws;
try {
  ws = await connect(await waitForTarget(port));
  const client = new CdpClient(ws);
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('Network.enable');
  await waitFor(client, "document.readyState === 'complete'", 'document readiness');
  await waitFor(client, "Boolean(document.querySelector('[data-nav=\"reels\"]'))", 'Reels navigation');
  await waitFor(client, "typeof window.PasarPerformanceV10?.openReels === 'function'", 'Reels router entry');

  const consoleErrors = [];
  const runtimeExceptions = [];
  const networkFailures = [];
  ws.addEventListener('message', event => {
    try {
      const message = JSON.parse(String(event.data));
      if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
        const text = (message.params.args || []).map(arg => arg.value || arg.description || '').join(' ');
        if (text) consoleErrors.push(text);
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params?.exceptionDetails;
        const text = details?.exception?.description || details?.text || 'Unknown runtime exception';
        runtimeExceptions.push(text);
      }
      if (message.method === 'Network.loadingFailed') {
        const failure = message.params || {};
        networkFailures.push(`${failure.errorText || 'loading failed'}:${failure.type || 'unknown'}`);
      }
    } catch {}
  });

  const clickProbe = await evaluate(client, `(() => {
    const button = document.querySelector('[data-nav="reels"]');
    let seen = 0;
    const probe = () => { seen += 1; };
    document.addEventListener('click', probe, true);
    const before = {
      disabled: Boolean(button?.disabled),
      inert: Boolean(button?.inert),
      connected: Boolean(button?.isConnected),
      activeNav: typeof STATE !== 'undefined' ? STATE.activeNav : '',
      openReels: typeof window.PasarPerformanceV10?.openReels
    };
    button?.click();
    document.removeEventListener('click', probe, true);
    return {
      ...before,
      seen,
      activeNavAfter: typeof STATE !== 'undefined' ? STATE.activeNav : '',
      lazyAfter: [...document.querySelectorAll('script[data-v10-lazy]')].map(node => node.dataset.v10Lazy || '')
    };
  })()`);
  console.log(`Reels navigation click probe: ${JSON.stringify(clickProbe)}`);
  if (!clickProbe.connected) throw new Error(`Reels navigation is detached: ${JSON.stringify(clickProbe)}`);
  if (clickProbe.disabled || clickProbe.inert) throw new Error(`Reels navigation is not interactive: ${JSON.stringify(clickProbe)}`);
  if (clickProbe.seen < 1) throw new Error(`Reels click event was not dispatched: ${JSON.stringify(clickProbe)}`);

  try {
    await waitFor(client, "window.PasarReelsV4?.version === '4.0'", 'Reels V4 runtime');
  } catch (error) {
    const diagnostics = await evaluate(client, `(() => ({
      v10: window.PasarPerformanceV10?.version || '',
      openReels: typeof window.PasarPerformanceV10?.openReels,
      reels: window.PasarReelsV4?.version || '',
      readyState: document.readyState,
      activeNav: typeof STATE !== 'undefined' ? STATE.activeNav : '',
      navDisabled: Boolean(document.querySelector('[data-nav="reels"]')?.disabled),
      navInert: Boolean(document.querySelector('[data-nav="reels"]')?.inert),
      lazy: [...document.querySelectorAll('script[data-v10-lazy]')].map(node => ({ name: node.dataset.v10Lazy || '', src: node.src })),
      reelsLoader: [...document.scripts].filter(node => node.src.includes('reel-profile-separation')).map(node => node.src),
      reelsCore: [...document.scripts].filter(node => node.src.includes('reels-commerce-v4')).map(node => node.src),
      reelsCss: [...document.querySelectorAll('link[rel="stylesheet"]')].filter(node => node.href.includes('reels-commerce-v4')).map(node => node.href),
      busy: document.querySelector('[data-nav="reels"]')?.getAttribute('aria-busy') || ''
    }))()`);
    throw new Error(`${error.message} clickProbe=${JSON.stringify(clickProbe)} diagnostics=${JSON.stringify(diagnostics)} console=${JSON.stringify(consoleErrors.slice(-8))} exceptions=${JSON.stringify(runtimeExceptions.slice(-8))} network=${JSON.stringify(networkFailures.slice(-8))}`);
  }
  await waitFor(client, "document.body.classList.contains('reels-v4-active') && Boolean(document.querySelector('.reels-v4-shell'))", 'immersive Reels shell');
  await waitFor(client, "document.querySelectorAll('.reels-v4-card').length > 0", 'at least one production Reel');
  await waitFor(client, "window.PasarReelsAdvancedV4?.version === '4.0'", 'advanced Reels runtime');

  const baseline = await evaluate(client, `(() => {
    const cards = [...document.querySelectorAll('.reels-v4-card')];
    const first = cards[0];
    const video = first?.querySelector('.reels-v4-video');
    return {
      cards: cards.length,
      currentSrc: video?.getAttribute('src') || '',
      preload: video?.getAttribute('preload') || '',
      audioButton: Boolean(first?.querySelector('[data-r4-action="audio"]')),
      likeButton: Boolean(first?.querySelector('[data-r4-action="like"]')),
      commentsButton: Boolean(first?.querySelector('[data-r4-action="comments"]')),
      shareButton: Boolean(first?.querySelector('[data-r4-action="share"]')),
      saveButton: Boolean(first?.querySelector('[data-r4-action="save"]')),
      moreButton: Boolean(first?.querySelector('[data-r4-action="more"]')),
      tabs: [...document.querySelectorAll('.reels-v4-tab')].map(node => node.dataset.mode),
      overlayLayer: Boolean(first?.querySelector('.reels-v4-text-layer')),
      productCta: Boolean(first?.querySelector('.reels-v4-product'))
    };
  })()`);
  if (!baseline.cards) throw new Error('production Reels feed rendered no cards');
  if (!baseline.audioButton || !baseline.likeButton || !baseline.commentsButton || !baseline.shareButton || !baseline.saveButton || !baseline.moreButton) throw new Error('Reels action rail is incomplete');
  if (JSON.stringify(baseline.tabs) !== JSON.stringify(['for-you', 'following', 'local'])) throw new Error(`Reels discovery tabs mismatch: ${JSON.stringify(baseline.tabs)}`);
  if (!baseline.overlayLayer) throw new Error('Advanced Reels overlay layer did not mount');

  const audioProbe = await evaluate(client, `(() => {
    const button = document.querySelector('.reels-v4-card [data-r4-action="audio"]');
    const before = sessionStorage.getItem('pasar-reels-audio');
    button.click();
    return { before, after: sessionStorage.getItem('pasar-reels-audio'), label: button.getAttribute('aria-label') };
  })()`);
  if (!['on', 'off'].includes(audioProbe.after || '')) throw new Error('audio preference was not persisted');
  if (audioProbe.before === audioProbe.after) throw new Error('audio preference did not toggle');

  const mobile = await setViewport(client, 390, 844, true);
  const tablet = await setViewport(client, 768, 1024, true);
  const desktop = await setViewport(client, 1440, 900, false);

  const modeProbe = await evaluate(client, `(async () => {
    const local = document.querySelector('.reels-v4-tab[data-mode="local"]');
    local?.click();
    await new Promise(resolve => setTimeout(resolve, 700));
    const localActive = local?.classList.contains('active') || false;
    const forYou = document.querySelector('.reels-v4-tab[data-mode="for-you"]');
    forYou?.click();
    await new Promise(resolve => setTimeout(resolve, 700));
    return { localActive, restored: forYou?.classList.contains('active') || false, shell: Boolean(document.querySelector('.reels-v4-shell')) };
  })()`);
  if (!modeProbe.localActive || !modeProbe.restored || !modeProbe.shell) throw new Error(`discovery mode transition failed: ${JSON.stringify(modeProbe)}`);

  const severeErrors = consoleErrors.filter(text => !/play\(\)|autoplay|AbortError|NotAllowedError/i.test(text));
  if (severeErrors.length) throw new Error(`browser console errors: ${severeErrors.slice(0, 3).join(' | ')}`);
  if (runtimeExceptions.length) throw new Error(`browser runtime exceptions: ${runtimeExceptions.slice(0, 3).join(' | ')}`);

  console.log('Reels Commerce V4 real-browser smoke: PASS');
  console.log(JSON.stringify({ clickProbe, baseline, audioProbe, viewports: { mobile, tablet, desktop }, modeProbe }));
} finally {
  try { ws?.close(); } catch {}
  if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL');
  await rm(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => null);
}
