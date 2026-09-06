import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const index = read('index.html');
const runtimeCss = read('css/style.runtime.css');
const chatCss = read('css/chat-experience-v7.css');
const chatJs = read('js/chat-experience-v7.js');
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
  "['pin', 'unpin', 'archive', 'unarchive', 'delete_me']",
  '/api/chat/conversations/${conversationId}/action'
]) {
  if (!chatJs.includes(marker)) fail(`Chat V7 action owner kehilangan contract: ${marker}`);
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
