import { access, readFile, stat } from 'node:fs/promises';

const files = {
  index: 'index.html',
  performanceBoot: 'js/performance-v10-a.js',
  chatBootstrap: 'js/chat-single-render-v6.js',
  chatGestures: 'js/chat-conversation-actions-v7.js',
  chatOwner: 'js/chat-experience-v7.js',
  rating: 'js/rating-core.js',
  ratingFormCss: 'css/rating-form-v3.css',
  ratingCommerceCss: 'css/rating-commerce-v1.css',
  about: 'js/about-experience-v2.js',
  aboutCss: 'css/about-experience-v2.css',
};

const errors = [];
for (const path of Object.values(files)) {
  try {
    await access(path);
  } catch {
    errors.push(`Missing hotfix file: ${path}`);
  }
}

if (!errors.length) {
  const [
    index,
    performanceBoot,
    chatBootstrap,
    chatGestures,
    chatOwner,
    rating,
    ratingFormCss,
    ratingCommerceCss,
    about,
    aboutCss,
  ] = await Promise.all(Object.values(files).map(path => readFile(path, 'utf8')));

  const budgets = {
    'critical HTML': [files.index, 16_500],
    'V10 performance bootstrap': [files.performanceBoot, 12_000],
    'Chat bootstrap': [files.chatBootstrap, 5_000],
    'Chat gesture adapter': [files.chatGestures, 5_000],
    'Rating Core': [files.rating, 19_000],
    'Rating commerce CSS': [files.ratingCommerceCss, 3_000],
    'About V2 JS': [files.about, 9_000],
    'About V2 CSS': [files.aboutCss, 9_000],
  };

  for (const [name, [path, limit]] of Object.entries(budgets)) {
    const size = (await stat(path)).size;
    console.log(`${name}: ${size} / ${limit} bytes`);
    if (size > limit) errors.push(`${name} exceeds source budget: ${size} > ${limit}`);
  }

  const initialScripts = [...index.matchAll(/<script\s+[^>]*src=["']js\//g)].length;
  if (initialScripts !== 2) {
    errors.push(`V10 initial first-party script contract requires exactly 2 scripts, found ${initialScripts}`);
  }

  if (index.includes('src="js/chat-single-render-v6.js') || index.includes("src='js/chat-single-render-v6.js")) {
    errors.push('Chat bootstrap must remain outside the initial HTML script graph');
  }

  const chatFingerprint = performanceBoot.match(/js\/chat-single-render-v6\.js\?v=([0-9a-f]{12})/);
  if (!chatFingerprint) {
    errors.push('Missing deterministic Chat bootstrap fingerprint in V10 adaptive graph');
  } else {
    console.log(`Chat V10 bootstrap fingerprint: ${chatFingerprint[1]}`);
  }

  for (const contract of [
    '[data-action="messages"]',
    'stopImmediatePropagation',
    'target.click()',
    "loaders.chat",
  ]) {
    if (!performanceBoot.includes(contract)) errors.push(`Missing Chat intent-loading contract in V10: ${contract}`);
  }

  for (const contract of [
    'id="postReleaseUXBootstrap"',
    'js/about-experience-v2.js?v=2.0',
    'css/about-experience-v2.css?v=2.0',
    'js/rating-core.js?v=2.2',
    '[data-nav="account"]',
    '[data-menu-action="orders"]',
    '[data-commerce-action="order-detail"]',
  ]) {
    if (!index.includes(contract)) errors.push(`Missing lazy recovery contract in index: ${contract}`);
  }

  for (const contract of [
    'js/chat-conversation-actions-v7.js?v=1.0',
    'ensureConversationActions',
    "conversationLongPress: 'chat-conversation-actions-v7'",
  ]) {
    if (!chatBootstrap.includes(contract)) errors.push(`Missing Chat bootstrap recovery contract: ${contract}`);
  }

  for (const contract of [
    '[data-chat-v7-row]',
    'conversation-menu',
    'contextmenu',
    'delete_me',
    'Hapus percakapan',
    '520',
    'stopImmediatePropagation()',
  ]) {
    if (!chatGestures.includes(contract)) errors.push(`Missing Chat conversation gesture contract: ${contract}`);
  }

  if (chatGestures.includes('/api/') || /\bfetch\s*\(/.test(chatGestures)) {
    errors.push('Chat gesture adapter must delegate actions and must not call Chat APIs directly');
  }

  for (const ownerContract of [
    "pinned ? 'unpin' : 'pin'",
    "archived ? 'unarchive' : 'archive'",
    'data-state-action="delete_me"',
    '/api/chat/conversations/',
  ]) {
    if (!chatOwner.includes(ownerContract)) errors.push(`Chat V7 action owner lost contract: ${ownerContract}`);
  }

  for (const contract of [
    "version: '2.2'",
    '.commerce-order-card[data-order-id][data-order-scope="buyer"]',
    '.commerce-order-status.completed',
    'commerce-rating-cta',
    'commerce-rating-panel',
    'data-commerce-action="order-detail"',
    "order.dataset.orderScope === 'buyer'",
    '/api/ratings/order/',
    "method: 'POST'",
    'Rating hanya tersedia setelah pesanan selesai.',
    'rating-form-v3.css?v=3.0',
    'rating-commerce-v1.css?v=1.0',
  ]) {
    if (!rating.includes(contract)) errors.push(`Missing completed-order rating contract: ${contract}`);
  }

  if (/data-order-scope=\\?"seller\\?"/.test(rating)) {
    errors.push('Rating decorator must not target seller order cards');
  }

  if (!ratingCommerceCss.includes('min-height: 48px')) {
    errors.push('Rating commerce CTA is missing the 48px touch-target contract');
  }

  for (const cssText of [ratingFormCss, ratingCommerceCss, aboutCss]) {
    if (cssText.includes('linear-gradient(') || cssText.includes('radial-gradient(')) {
      errors.push('Hotfix presentation CSS must not add decorative gradients');
    }
  }

  for (const contract of [
    "version: '2.0'",
    'Apa itu Pasar UMKM?',
    'Satu platform, tiga kebutuhan utama',
    'Untuk ekosistem lokal',
    'Prinsip pengembangan',
    'Founder & Product Initiator',
    'Dibangun dari',
  ]) {
    if (!about.includes(contract)) errors.push(`Missing About V2 section contract: ${contract}`);
  }

  if (!aboutCss.includes('@media (min-width: 768px)')) {
    errors.push('About V2 is missing tablet/desktop adaptation');
  }
}

if (errors.length) {
  console.error('Post-release UX recovery validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Post-release UX recovery + V10 intent-loading validation passed.');
