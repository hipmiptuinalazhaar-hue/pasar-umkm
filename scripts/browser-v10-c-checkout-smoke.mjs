import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const baseUrl = new URL(process.env.V10C_BASE_URL || 'https://pasar-umkm.hipmiptuinalazhaar.workers.dev/');
const timeoutMs = Number(process.env.V10C_BROWSER_TIMEOUT_MS || 20000);
if (baseUrl.protocol !== 'https:') throw new Error('V10-C browser smoke requires HTTPS.');
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
    await sleep(120);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}.`);
}

async function waitForPathname(client, expected, duration = timeoutMs) {
  const deadline = Date.now() + duration;
  let lastPath = '';
  while (Date.now() < deadline) {
    try {
      lastPath = String(await evaluate(client, 'location.pathname') || '');
      if (lastPath === expected) return lastPath;
    } catch {}
    await sleep(120);
  }
  throw new Error(`checkout click did not navigate to ${expected}; last=${lastPath || 'unavailable'}`);
}

const browser = await findBrowser();
const port = await freePort();
const profileDir = await mkdtemp(path.join(os.tmpdir(), 'pasar-v10c-'));
const chrome = spawn(browser, [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, '--window-size=390,844', baseUrl.href
], { stdio: 'ignore' });

let ws;
try {
  ws = await connect(await waitForTarget(port));
  const client = new CdpClient(ws);
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await waitFor(client, "document.readyState === 'complete'", 'document readiness');
  await waitFor(client, "window.PasarPerformanceV10C?.version === '10.3'", 'V10-C runtime');

  const probe = await evaluate(client, `(async () => {
    sessionStorage.setItem('pasar_cart_selection_v2', '[]');
    sessionStorage.removeItem('pasar_cart_selection_v10c_ids');
    document.getElementById('v10cCheckoutFixture')?.remove();
    const fixture = document.createElement('div');
    fixture.id = 'v10cCheckoutFixture';
    fixture.innerHTML = \`
      <section class="commerce-page">
        <div class="commerce-cart-item" data-product-id="v10c-test-product">
          <span class="commerce-cart-price">Rp10.000</span>
          <span class="commerce-quantity-value">1</span>
        </div>
        <div class="commerce-sticky">
          <button type="button" data-commerce-action="checkout" disabled aria-disabled="true">Checkout</button>
        </div>
      </section>\`;
    document.body.appendChild(fixture);
    window.PasarPerformanceV10C.repairCheckout();
    await new Promise(resolve => setTimeout(resolve, 250));
    const button = fixture.querySelector('[data-commerce-action="checkout"]');
    return {
      exists: Boolean(button),
      disabled: Boolean(button?.disabled),
      ariaDisabled: button?.getAttribute('aria-disabled') ?? null,
      selection: JSON.parse(sessionStorage.getItem('pasar_cart_selection_v2') || 'null'),
      cartIds: JSON.parse(sessionStorage.getItem('pasar_cart_selection_v10c_ids') || 'null'),
      checkoutReady: button?.dataset.v10cCheckoutReady || ''
    };
  })()`);

  if (!probe?.exists) throw new Error('synthetic checkout CTA disappeared before repair assertion');
  if (probe.disabled) throw new Error('checkout CTA remained disabled after stale-state migration');
  if (probe.ariaDisabled !== 'false') throw new Error(`checkout aria-disabled remained ${probe.ariaDisabled}`);
  if (!Array.isArray(probe.selection) || !probe.selection.includes('v10c-test-product')) throw new Error(`checkout selection was not repaired: ${JSON.stringify(probe.selection)}`);
  if (!Array.isArray(probe.cartIds) || !probe.cartIds.includes('v10c-test-product')) throw new Error(`cart identity was not recorded: ${JSON.stringify(probe.cartIds)}`);
  if (probe.checkoutReady !== 'true') throw new Error('checkout CTA was not marked runtime-ready');

  await waitFor(client, "window.PasarP8Commerce?.version === '1.2'", 'commerce prewarm');
  const clickAccepted = await evaluate(client, `(() => {
    const button = document.querySelector('#v10cCheckoutFixture [data-commerce-action="checkout"]');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  if (!clickAccepted) throw new Error('checkout CTA was not clickable before intent replay');

  const pathname = await waitForPathname(client, '/checkout/index.html');
  await waitFor(client, "document.readyState === 'complete'", 'checkout document readiness');
  console.log('V10-C browser checkout smoke: PASS');
  console.log(JSON.stringify({ ...probe, pathname }));
} finally {
  try { ws?.close(); } catch {}
  if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL');
  await rm(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => null);
}
