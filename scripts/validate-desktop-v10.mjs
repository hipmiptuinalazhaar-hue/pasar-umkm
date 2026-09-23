import fs from 'node:fs';import path from 'node:path';
const root=process.cwd(),read=f=>fs.readFileSync(path.join(root,f),'utf8'),exists=f=>fs.existsSync(path.join(root,f));
const index=read('index.html'),desktop=read('css/desktop-experience-v10.css'),desktopJs=read('js/desktop-experience-v10.js'),reels=read('js/reels-v4-entry.js'),seo=read('src/seo-worker-entry.js'),pkg=JSON.parse(read('package.json'));
const standalone=['launch/index.html','support/index.html','purchases/index.html','checkout/index.html','seller-orders/index.html','legal/index.html'];
const checks=[
['desktop stylesheet exists',exists('css/desktop-experience-v10.css')],
['standalone stylesheet exists',exists('css/desktop-page-v10.css')],
['desktop runtime exists',exists('js/desktop-experience-v10.js')],
['desktop owner linked last',index.includes('desktop-experience-v10.css')&&index.includes('data-desktop-v10-style')],
['SEO transform restores desktop owner after public/P2 styles',seo.includes('DESKTOP_V10_STYLE')&&seo.indexOf('href="${DESKTOP_V10_STYLE}')>seo.indexOf('href="${P2_STYLE}')&&seo.includes('data-desktop-v10-style="seo-final"')],
['legacy tablet desktop owner removed',!index.includes('css/tablet-desktop-v2.css')],
['desktop runtime linked',index.includes('desktop-experience-v10.js')],
['footer present',index.includes('desktop-site-footer')&&index.includes('/support/')&&index.includes('/legal/')],
['desktop breakpoint explicit',desktop.includes('@media (min-width:1024px)')],
['bottom nav explicit',desktop.includes('bottom:var(--d10-nav-bottom)')&&desktop.includes('repeat(5,minmax(0,1fr))')],
['hero split uses premium marketplace mockup',desktop.includes('.desktop-hero-premium')&&desktop.includes('.desktop-premium-window')&&desktop.includes('.desktop-premium-categories')],
['hero mockup has no seller/product feed hydration',desktopJs.includes('/assets/logo.webp?v=2.0')&&!desktopJs.includes('is-product-post')&&!desktopJs.includes('.ig-product-name')&&!desktopJs.includes('.ig-product-price')],
['hero mockup uses generic marketplace labels only',desktopJs.includes('Jelajahi Pasar UMKM')&&desktopJs.includes('Belanja produk lokal')&&desktopJs.includes('Temukan UMKM')&&desktopJs.includes('Akses layanan')&&!desktopJs.includes('Rp ')],
['hero has no detached floating ornaments',!desktopJs.includes('desktop-premium-floating-card')&&!desktop.includes('.desktop-premium-floating-card')],
['marketplace grid',desktop.includes('grid-template-columns:repeat(2,minmax(0,1fr))')&&desktop.includes('@media (min-width:1280px)')],
['reels app chrome preserved',desktop.includes('body.reels-v4-active .app>.app-header')&&desktop.includes('body.reels-v4-active .app>.app-navigation')],
['reels two-region composition',desktop.includes('left:calc(50% - 220px)')&&desktop.includes('left:calc(50% + 22px)')],
['focus visibility present',desktop.includes(':focus-visible')],
['footer home scoped',desktop.includes('body:has(#homeDiscovery:not([hidden])):not(.reels-v4-active)')],
['reels restores desktop cascade owner',reels.includes('data-desktop-v10-style')&&reels.includes('appendChild(desktopOwner)')],
['validator canonical',String(pkg.scripts?.validate||'').includes('test:desktop-v10')],
...standalone.map(f=>[f+' desktop stylesheet',read(f).includes('/css/desktop-page-v10.css')])
];
let fail=0;for(const [n,ok] of checks){if(ok)console.log('PASS',n);else{fail++;console.error('FAIL',n)}}if(fail)process.exit(1);console.log('Desktop V10 validation passed:',checks.length);