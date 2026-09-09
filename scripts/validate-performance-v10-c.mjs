import { readFile, stat } from 'node:fs/promises';

const [index, v10a, v10c, p8] = await Promise.all([
  readFile('index.html', 'utf8'),
  readFile('js/performance-v10-a.js', 'utf8'),
  readFile('js/performance-v10-c.js', 'utf8'),
  readFile('js/p8-commerce-integration.js', 'utf8')
]);

const checks = [];
const expect = (condition, message) => {
  checks.push({ ok: Boolean(condition), message });
  if (!condition) throw new Error(`V10-C contract failed: ${message}`);
};

expect(v10c.includes("version: '10.3'"), 'V10-C runtime exposes version 10.3');
expect(v10a.includes("stability: 'js/performance-v10-c.js"), 'V10-C is owned by adaptive V10-A loader');
expect(v10a.includes("stability: () => loadScript('stability'"), 'V10-A exposes deterministic V10-C loader');
expect(v10a.includes('loaders.stability()'), 'V10-C boots after DOM readiness without becoming a critical HTML owner');
expect(v10a.includes('INTENT_LOAD_TIMEOUT_MS'), 'lazy interaction loading is bounded by a timeout');
expect(v10a.includes("location.assign('/checkout/index.html')"), 'checkout has a safe local-route fallback if commerce bootstrap fails');
expect(v10a.includes('intent_timeouts: intentTimeouts'), 'intent timeout diagnostics are observable');

expect(v10c.includes("const CART_IDS_KEY = 'pasar_cart_selection_v10c_ids'"), 'checkout selection is tied to cart identity');
expect(v10c.includes('knownIds === null || storedSelection === null'), 'legacy stale selection receives explicit migration handling');
expect(v10c.includes('return writeSelection(currentIds, currentIds)'), 'legacy stale empty state defaults the current cart to selected');
expect(v10c.includes('if (storedSelection.length === 0)'), 'explicit select-none state is preserved after migration');
expect(v10c.includes('syncSelectionControls(selected, ids)'), 'DOM controls reconcile to authoritative cart selection');
expect(v10c.includes('button.disabled = false'), 'stale disabled checkout CTA is actively repaired');
expect(v10c.includes("window.PasarPerformanceV10?.load?.('commerce')"), 'commerce is primed when a checkout CTA appears');

expect(v10c.includes('content-visibility: auto'), 'long feed cards use rendering containment');
expect(v10c.includes('contain-intrinsic-size: auto 560px'), 'contained cards reserve stable intrinsic layout space');
expect(v10c.includes("new MutationObserver(records =>"), 'dynamic content is reconciled by a scoped observer');
expect(v10c.includes("feedObserver.observe(feed, { childList: true, subtree: true })"), 'feed mutations are observed without attribute churn');
expect(v10c.includes("feedObserver.observe(sheet, { childList: true, subtree: true })"), 'sheet mutations are observed without global document churn');
expect(!v10c.includes('observe(doc.documentElement'), 'V10-C does not install a document-wide subtree observer');
expect(!v10c.includes('setInterval('), 'V10-C adds no perpetual polling interval');
expect(!v10c.includes('localStorage.'), 'V10-C does not add persistent browser cache/state');
expect(!v10c.includes("fetch('/api"), 'V10-C adds no background API polling');

expect(v10c.includes("type: 'event'"), 'interaction latency is observed for INP-oriented diagnostics');
expect(v10c.includes('max_interaction_ms: maxInteractionMs'), 'worst observed interaction latency is exposed');
expect(v10c.includes("doc.addEventListener('visibilitychange'"), 'background lifecycle is visibility-aware');
expect(v10c.includes("animation-play-state: paused"), 'background animation work is paused while hidden');
expect(v10c.includes('video.pause()'), 'offscreen/background video playback is suspended');
expect(v10c.includes("video.preload = 'none'"), 'offscreen video transfer is suppressed');

expect(p8.includes("const CART_SELECTION_KEY='pasar_cart_selection_v2'"), 'P8 remains the commerce selection owner contract');
expect(p8.includes("const target='/checkout/index.html'"), 'P8 still routes checkout to the canonical local checkout page');
expect(p8.includes("method:'POST'"), 'buy-now mutation remains inside P8 rather than performance code');
expect(!v10c.includes("method: 'POST'"), 'V10-C cannot perform commerce mutations');

const scriptSources = [...index.matchAll(/<script\s+[^>]*src="([^"]+)"[^>]*>/g)].map(match => match[1]);
const firstParty = scriptSources.filter(src => src.startsWith('js/'));
expect(firstParty.length === 2, `critical HTML keeps exactly 2 first-party JS owners, found ${firstParty.length}`);
expect(firstParty.some(src => src.includes('performance-v10-a.js')), 'V10-A remains the adaptive runtime entry owner');
expect(firstParty.some(src => src.includes('app.runtime.js')), 'app runtime remains the application entry owner');
expect(!index.includes('src="js/performance-v10-c.js'), 'V10-C is not directly injected into critical HTML');

const bytes = (await stat('js/performance-v10-c.js')).size;
expect(bytes <= 18_000, `V10-C runtime stays within 18KB source budget, got ${bytes} bytes`);

console.log(`Performance V10-C contract: ${checks.length}/${checks.length} PASS`);
console.log(`V10-C runtime source budget: ${bytes}/18000 bytes`);
