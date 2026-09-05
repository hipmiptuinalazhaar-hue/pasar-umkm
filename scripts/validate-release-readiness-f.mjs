import { access, readFile, stat } from 'node:fs/promises';

const requiredFiles = [
  'index.html',
  'css/mobile-foundation-v2.css',
  'css/tablet-desktop-v2.css',
  'css/home-feed-v3.css',
  'js/app.runtime.js',
  'js/chat-single-render-v6.js',
  'js/chat-experience-v7.js',
  'css/chat-experience-v7.css',
];

const errors = [];

for (const file of requiredFiles) {
  try {
    await access(file);
  } catch {
    errors.push(`Missing release file: ${file}`);
  }
}

try {
  await access('css/tablet-desktop-v1.css');
  errors.push('Retired responsive owner still exists: css/tablet-desktop-v1.css');
} catch {
  // Expected: v1 is retired.
}

if (!errors.length) {
  const [index, mobile, responsive, chat] = await Promise.all([
    readFile('index.html', 'utf8'),
    readFile('css/mobile-foundation-v2.css', 'utf8'),
    readFile('css/tablet-desktop-v2.css', 'utf8'),
    readFile('css/chat-experience-v7.css', 'utf8'),
  ]);

  const responsiveSize = (await stat('css/tablet-desktop-v2.css')).size;
  console.log(`responsive-v2-bytes=${responsiveSize}`);
  if (responsiveSize > 36_000) {
    errors.push(`Responsive V2 source budget exceeded: ${responsiveSize} > 36000`);
  }

  const responsiveLinks = [...index.matchAll(/css\/tablet-desktop-v\d+\.css\?v=[^"']+/g)].map(match => match[0]);
  if (responsiveLinks.length !== 1 || responsiveLinks[0] !== 'css/tablet-desktop-v2.css?v=2.0') {
    errors.push(`Expected exactly one responsive owner in index, found: ${responsiveLinks.join(', ') || 'none'}`);
  }

  if (!index.includes('media="screen and (min-width: 768px)"')) {
    errors.push('Responsive V2 is not media-qualified to >=768px');
  }

  const hotfixStart = index.indexOf('<style id="postP6MobileShellHotfix">');
  const hotfixEnd = index.indexOf('</style>', hotfixStart);
  const responsiveLink = index.indexOf('css/tablet-desktop-v2.css?v=2.0');
  if (hotfixStart < 0 || hotfixEnd < 0) {
    errors.push('Post-P6 mobile shell hotfix block is missing');
  } else {
    const hotfix = index.slice(hotfixStart, hotfixEnd);
    if (!hotfix.includes('@media (max-width: 767px)')) {
      errors.push('Post-P6 shell hotfix is not mobile-scoped');
    }
    if (responsiveLink < hotfixEnd) {
      errors.push('Responsive V2 must load after the mobile hotfix block');
    }
  }

  const deviceContracts = [
    ['tablet', '@media (min-width: 768px)'],
    ['tablet-landscape', '@media (min-width: 900px) and (max-width: 1023px)'],
    ['laptop', '@media (min-width: 1024px)'],
    ['desktop', '@media (min-width: 1280px)'],
    ['ultrawide', '@media (min-width: 1600px)'],
  ];
  for (const [label, marker] of deviceContracts) {
    if (!responsive.includes(marker)) errors.push(`Missing ${label} responsive contract: ${marker}`);
  }

  const architectureContracts = [
    '--p5-rail: 0px',
    '--p5-rail: 88px',
    '--p5-rail: 208px',
    '--p5-feed-max: 720px',
    '--p5-work-max: 920px',
    '--p5-social-max: 860px',
    'width: min(590px, calc(100vw - 40px))',
    'grid-template-columns: repeat(8, minmax(0, 1fr))',
    '.commerce-page:has(> .commerce-detail-media)',
    'body.p3-comments-open .bottom-sheet',
    'body.chat-v7-body .app-navigation',
    'visibility: visible !important',
    '@media (hover: hover) and (pointer: fine)',
    '@media (prefers-reduced-motion: reduce)',
  ];
  for (const marker of architectureContracts) {
    if (!responsive.includes(marker)) errors.push(`Missing release responsive contract: ${marker}`);
  }

  if (!mobile.includes('@media (max-width: 767px)') || !mobile.includes('font-size: 16px')) {
    errors.push('Mobile 16px form-input/iOS zoom contract is missing');
  }
  if (!mobile.includes('min-width: 44px') || !mobile.includes('min-height: 44px')) {
    errors.push('Mobile 44px touch-target contract is missing');
  }
  if (!mobile.includes('min-height: 48px')) {
    errors.push('Mobile primary-action 48px touch-target contract is missing');
  }

  if (!chat.includes('--chat7-height:100dvh') || !chat.includes('min-height:320px')) {
    errors.push('Chat viewport resilience contract is missing');
  }

  const forbidden = [
    ['linear-gradient(', 'decorative gradient'],
    ['radial-gradient(', 'decorative gradient'],
    ['backdrop-filter:', 'glass effect'],
    ['-webkit-backdrop-filter:', 'glass effect'],
  ];
  for (const [token, label] of forbidden) {
    if (responsive.includes(token)) errors.push(`Responsive V2 contains forbidden ${label}: ${token}`);
  }

  const tinyFonts = [...responsive.matchAll(/font-size\s*:\s*([0-9.]+)px/g)]
    .map(match => Number(match[1]))
    .filter(size => size < 10);
  if (tinyFonts.length) {
    errors.push(`Responsive V2 has font sizes below 10px: ${tinyFonts.join(', ')}`);
  }

  const stripped = responsive.replace(/\/\*[\s\S]*?\*\//g, '');
  const opens = (stripped.match(/\{/g) || []).length;
  const closes = (stripped.match(/\}/g) || []).length;
  if (opens !== closes) errors.push(`Responsive V2 CSS braces are unbalanced: ${opens}/${closes}`);

  if (index.includes('tablet-desktop-v1.css')) {
    errors.push('index.html still mentions retired responsive v1');
  }
}

if (errors.length) {
  console.error('Final Release Readiness F validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Final Release Readiness F validation passed.');
