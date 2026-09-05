import fs from 'node:fs';

const retired = [
  'js/chat-experience.js',
  'js/chat-mark-read.js',
  'js/chat-media-experience.js',
  'js/chat-stability-v4.js',
  'js/chat-whatsapp-v5.js',
  'css/chat-bubble-final.css',
  'css/chat-experience.css',
  'css/chat-layout-v2.css',
  'css/chat-single-render-v6.css',
  'css/chat-stability-v4.css',
  'css/chat-whatsapp-v3.css',
  'css/chat-whatsapp-v5.css'
];

const required = [
  'js/chat-single-render-v6.js',
  'js/chat-experience-v7.js',
  'css/chat-experience-v7.css',
  'docs/P4_FINAL_AUDIT.md',
  'docs/TECHNICAL_DEBT_E.md',
  'src/functionality-store.js',
  'index.html'
];

const failures = [];
const fail = message => failures.push(message);
const read = path => fs.readFileSync(path, 'utf8');

for (const path of retired) {
  if (fs.existsSync(path)) fail(`retired artifact masih ada: ${path}`);
}

for (const path of required) {
  if (!fs.existsSync(path)) fail(`active/source-of-truth file hilang: ${path}`);
}

if (!failures.length) {
  const bootstrap = read('js/chat-single-render-v6.js');
  const index = read('index.html');
  const p4 = read('docs/P4_FINAL_AUDIT.md');
  const functionalityStore = read('src/functionality-store.js');
  const debtDoc = read('docs/TECHNICAL_DEBT_E.md');

  for (const marker of [
    'css/chat-experience-v7.css?v=7.0',
    'js/chat-experience-v7.js?v=7.0',
    'window.ensurePasarChatV7 = ensureV7'
  ]) {
    if (!bootstrap.includes(marker)) fail(`Chat V7 bootstrap contract hilang: ${marker}`);
  }

  for (const path of retired) {
    if (index.includes(path)) fail(`index masih mereferensikan retired artifact: ${path}`);
  }

  if (!index.includes('js/chat-single-render-v6.js?v=7.0')) {
    fail('index tidak memuat compatibility bootstrap Chat V7');
  }

  if (!p4.includes('HISTORICAL / ARCHIVED')) {
    fail('P4 audit belum ditandai sebagai historical snapshot');
  }
  if (p4.includes('## Known External Blocker')) {
    fail('stale P4 external blocker kembali menjadi current section');
  }

  if (!functionalityStore.includes('Tidak ada schema mutation pada request path production.')) {
    fail('functionality schema guard documentation tidak sesuai runtime ownership');
  }
  if (functionalityStore.includes('legacy handler dengan CREATE/ALTER IF NOT EXISTS')) {
    fail('stale runtime-DDL legacy comment kembali muncul');
  }

  for (const marker of [
    'Residual debt yang sengaja tidak dipaksakan dalam E',
    'Public-admin compatibility code',
    'PR #31 `B1: Orders & transaction stability`'
  ]) {
    if (!debtDoc.includes(marker)) fail(`technical debt ledger kehilangan marker: ${marker}`);
  }
}

if (failures.length) {
  console.error('Technical Debt E validation FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Technical Debt E validation PASS: ${retired.length} retired artifacts absent, Chat V7 ownership preserved.`);
