import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const index = read('index.html');
const runtimeCss = read('css/style.runtime.css');
const chatCss = read('css/chat-experience-v7.css');
const chatJs = read('js/chat-experience-v7.js');
const bootstrap = read('js/chat-single-render-v6.js');
const gestures = read('js/chat-conversation-actions-v7.js');

const failures = [];
const fail = message => failures.push(message);

const pageRule = index.match(/html body\.chat-v7-body \.chat-v7-page\s*\{([\s\S]*?)\}/);
if (!pageRule) {
  fail('Mobile Chat V7 page rule tidak ditemukan di index.html');
} else {
  const match = pageRule[1].match(/z-index\s*:\s*(\d+)/);
  const z = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(z)) fail('Chat V7 page tidak memiliki z-index eksplisit');
  if (Number.isFinite(z) && z >= 490) {
    fail(`Chat V7 page z-index ${z} menutupi modal/sheet layer 490+`);
  }
  if (z !== 240) fail(`Chat V7 page layer contract harus 240, ditemukan ${String(z)}`);
}

for (const [label, pattern] of [
  ['sheet overlay', /\.sheet-overlay\s*\{[^}]*z-index\s*:\s*490/],
  ['bottom sheet', /\.bottom-sheet\s*\{[^}]*z-index\s*:\s*500/],
  ['toast', /\.toast\s*\{[^}]*z-index\s*:\s*700/]
]) {
  if (!pattern.test(runtimeCss)) fail(`${label} layer contract hilang`);
}

for (const marker of [
  'data-chat-v7-action="conversation-menu"',
  'data-chat-v7-action="conversation-state"',
  "pinned ? 'unpin' : 'pin'",
  "archived ? 'unarchive' : 'archive'",
  'data-state-action="delete_me"',
  '/api/chat/conversations/${encodeURIComponent(conversationId)}/action'
]) {
  if (!chatJs.includes(marker)) fail(`Chat V7 action owner kehilangan contract: ${marker}`);
}

// Regression contract for the mobile freeze reported from the header Chat button.
// A partial transition may never hide the app shell unless a connected Chat V7
// page has actually mounted inside the live #feed node.
for (const marker of [
  "document.getElementById(id)",
  "node?.isConnected",
  "reconcileChatMount",
  "DOM.feed = feed",
  "DOM.storiesSection = liveNode('storiesSection')",
  "DOM.homeDiscovery = liveNode('homeDiscovery')",
  "guardMountedChat(feed)",
  "feed.querySelector('.chat-v7-page')",
  "document.body.classList.remove('chat-v7-body')",
  "document.documentElement.style.removeProperty('--chat7-height')",
  "mobileMountGuard: true",
  "liveDomReconciliation: true"
]) {
  if (!bootstrap.includes(marker)) fail(`Chat mobile mount guard kehilangan contract: ${marker}`);
}

const reconcilePosition = bootstrap.indexOf('feed = reconcileChatMount()');
const openPosition = bootstrap.indexOf('opening = chat.openList()');
if (reconcilePosition < 0 || openPosition < 0 || reconcilePosition > openPosition) {
  fail('Live DOM reconciliation wajib berjalan sebelum Chat V7 membuka conversation list');
}

for (const marker of [
  '[data-chat-v7-row]',
  '[data-chat-v7-action="conversation-menu"][data-conversation-id]',
  'menu.click()',
  '520'
]) {
  if (!gestures.includes(marker)) fail(`Conversation gesture adapter kehilangan contract: ${marker}`);
}

if (!chatCss.includes('.chat-v7-row-menu') || !chatCss.includes('.chat-v7-conversation-hit')) {
  fail('Chat V7 conversation hit targets tidak lengkap');
}

if (failures.length) {
  console.error('Chat action layer validation FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Chat action layer validation PASS: chat 240 < sheet 490/500 < toast 700, action ownership preserved.');
console.log('Mobile mount guard PASS: live DOM reconciliation + partial-shell recovery enforced.');
