import { readFile, stat } from 'node:fs/promises';

const files = Object.freeze({
  core: 'js/reels-commerce-v4.js',
  advanced: 'js/reels-advanced-creator-v4.js',
  css: 'css/reels-commerce-v4.css',
  advancedCss: 'css/reels-advanced-creator-v4.css',
  loader: 'js/reel-profile-separation.js',
  app: 'js/app.js',
  api: 'src/reels-commerce-v4-api.js',
  advancedApi: 'src/reels-advanced-v4-api.js',
  bridge: 'src/business-agency-api.js',
  mediaBridge: 'src/media-social-api.js',
  migration: 'migrations/2026-09-09-reels-commerce-v4.sql',
  advancedMigration: 'migrations/2026-09-09-reels-advanced-creator-v4.sql',
  adminHtml: 'admin/reels.html',
  adminJs: 'js/admin/reels-moderation-v4.js',
  adminCss: 'css/admin-reels-moderation-v4.css',
  adminNav: 'js/admin/reels-nav-v4.js'
});

const content = {};
for (const [key, path] of Object.entries(files)) content[key] = await readFile(path, 'utf8');

const failures = [];
function contract(name, condition) {
  if (!condition) failures.push(name);
  else console.log(`PASS ${name}`);
}
function has(key, ...needles) { return needles.every(needle => content[key].includes(needle)); }
function match(key, regex) { return regex.test(content[key]); }

contract('R1 immersive fullscreen shell', has('core', 'reels-v4-shell', 'reels-v4-scroller', 'reels-v4-audio', 'data-r4-action="media"') && match('css', /scroll-snap-type\s*:\s*y mandatory/i) && has('css', '100dvh'));
contract('R1 playback interactions', has('core', 'tapAt', 'video.play()', 'video.pause()', "sessionStorage.setItem('pasar-reels-audio'"));
contract('R2 cursor feed', has('core', 'next_cursor', '&cursor=') && match('api', /next_cursor|cursor/i));
contract('R2 permanent detail and permalink', has('core', 'focusId') && match('api', /\/r\/|permalink|open.?graph|og:/i));
contract('R2 paginated comments', has('core', 'next_cursor') && match('api', /comments/i) && match('api', /cursor/i));
contract('R3 media virtualization', has('core', 'hydrateAround', "video.removeAttribute('src')", 'preload="none"') && match('css', /object-fit|aspect-ratio/));
contract('R3 cover metadata', match('migration', /cover_url/i) && match('api', /cover_url/i));
contract('R4 report and moderation backend', match('api', /report/i) && has('adminJs', '/api/admin/reels/v4/reports', 'ADMIN_STEP_UP_REQUIRED', 'deactivate_reel'));
contract('R4 admin moderation UI', has('adminHtml', 'Moderasi Reels', 'reelsModerationRoot', 'reelsStepUpDialog') && has('adminNav', '/admin/reels.html'));
contract('R4 owner lifecycle', match('api', /DELETE/) && match('api', /UPDATE reels|caption/i));
contract('R4 abuse controls', match('api', /limit|rate|429/i) || match('bridge', /limit|rate|429/i));
contract('R5 social save/repost/share/more', has('core', "'save'", "'repost'", "'share'", "'more'"));
contract('R5 not-interested', match('core', /not.?interested/i) && match('api', /not.?interested/i));
contract('R6 commerce product CTA', has('core', 'reels-v4-product', 'product_id', 'product_price'));
contract('R6 chat seller integration', has('advanced', 'chat-seller', 'openWithUser', 'chat_click'));
contract('R7 creator trim/crop/cover/tag product', has('core', 'trim_start_seconds', 'trim_end_seconds', 'crop_mode', 'cover', 'product_id'));
contract('R7 draft flow', match('core', /draft/i) && match('api', /draft/i) && match('migration', /reel_drafts/i));
contract('R8 discovery modes', has('core', 'for-you', 'following', 'local', 'recommendation_reason'));
contract('R8 transparent ranking backend', match('api', /recommendation_reason|ranking|score/i));
contract('R9 analytics event queue', has('core', 'eventQueue', 'watch_ms', "'impression'", "'play'", "'watch'"));
contract('R9 creator insight surface', match('core', /analytics|insight/i) && match('api', /analytics|insight|watch_ms|completion/i));
contract('R10 timed text overlays', has('advanced', 'composerOverlays', 'advanced_overlay_text', 'data-overlay-start') && match('advancedMigration', /text_overlays jsonb/i));
contract('R10 copyright-safe audio library', has('advanced', 'Audio library aman hak cipta', 'synth') && match('advancedMigration', /reel_audio_library|platform-generated/i));
contract('R10 templates/remix metadata', match('api', /template_of_reel_id|remix_of_reel_id/i) && match('migration', /template_of_reel_id|remix_of_reel_id/i));
contract('R11 advanced metadata endpoint', has('advancedApi', '/api/reels/v4/advanced/metadata', 'audio-library'));
contract('R11 cold-bootstrap preserves active Reels shell', match('app', /function renderApplication\(\)\s*\{[\s\S]*?STATE\.activeNav\s*!==\s*['"]reels['"][\s\S]*?renderFeed\(\)/));
contract('V4 compatibility bridge', has('bridge', '/api/reels-v4', '/api/reels/v4') && match('mediaBridge', /legacy|handleMediaSocial/i));
contract('V4 schema migration markers', has('migration', '2026-09-09-reels-commerce-v4') && has('advancedMigration', '2026-09-09-reels-advanced-creator-v4'));
contract('Reduced-motion coverage', match('css', /prefers-reduced-motion/i) && match('advancedCss', /prefers-reduced-motion/i));
contract('No gradient dependency in Reels V4 surfaces', !/linear-gradient|radial-gradient|conic-gradient/i.test(`${content.css}\n${content.advancedCss}\n${content.adminCss}`));

const budgets = { core: 50_000, advanced: 75_000, api: 90_000, advancedApi: 55_000, css: 30_000, advancedCss: 18_000 };
for (const [key, limit] of Object.entries(budgets)) {
  const size = (await stat(files[key])).size;
  contract(`budget ${files[key]} <= ${limit} bytes (${size})`, size <= limit);
}

if (failures.length) {
  console.error('\nReels Commerce V4 validation FAILED');
  failures.forEach(item => console.error(` - ${item}`));
  process.exit(1);
}
console.log('\nReels Commerce V4 validation: PASS');
