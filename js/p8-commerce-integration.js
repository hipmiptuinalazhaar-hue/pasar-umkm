'use strict';

(() => {
  const doc=document;
  if(window.PasarP8Commerce?.version==='1.2')return;

  const CART_SELECTION_KEY='pasar_cart_selection_v2';
  const P2_CARD_SELECTOR='.post-card.is-product-post';
  const P2_POST_SELECTOR='.post-card[data-post-id^="post-"]';
  const P2_DISCOVERY_SELECTOR=`${P2_CARD_SELECTOR},${P2_POST_SELECTOR}`;
  let buyNowPending=false;
  let cartEnhanceTimer=0;
  let p2DiscoveryTimer=0;
  let p2ViewportObserver=null;

  function sideLink(href,icon,label,key){
    const link=doc.createElement('a');
    link.className='p7-side-link';link.href=href;link.dataset[key]='true';
    link.innerHTML=`<i class="ph ph-${icon}" aria-hidden="true"></i><span>${label}</span>`;
    return link;
  }

  function appendScript(src,key,ready){
    if(ready()||doc.querySelector(`script[data-${key}="true"]`))return;
    const script=doc.createElement('script');
    script.src=src;script.async=true;
    script.dataset[key.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]='true';
    doc.body.appendChild(script);
  }

  function appendStyle(href,key){
    if(doc.querySelector(`link[data-${key}="true"]`))return;
    const link=doc.createElement('link');link.rel='stylesheet';link.href=href;
    link.dataset[key.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]='true';
    doc.head.appendChild(link);
  }

  function loadAuthSecurity(){
    appendScript('js/auth-security-v2.js?v=1.0','auth-security-v2',()=>window.PasarAuthSecurityV2?.version==='1.0');
  }

  function loadSellerBridge(){
    appendScript('js/seller-center-p8-bridge.js?v=1.0','seller-p8-bridge',()=>window.PasarSellerP8?.version==='1.0');
    appendScript('js/seller-center-order-p8.js?v=1.0','seller-order-p8-bridge',()=>window.PasarSellerOrdersP8?.version==='1.0');
  }

  function loadProfileAddress(){
    appendScript('js/profile-address-v2.js?v=1.0','profile-address-v2',()=>window.PasarProfileAddressV2?.version==='1.0');
  }

  function networkCapability(){
    const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection||null;
    const effectiveType=String(connection?.effectiveType||'').toLowerCase();
    const saveData=Boolean(connection?.saveData);
    return Object.freeze({
      effectiveType,
      saveData,
      constrained:saveData||['slow-2g','2g'].includes(effectiveType)
    });
  }

  function loadP2SocialCommerce(){
    appendStyle('css/p2-social-commerce.css?v=1.0','p2-social-commerce-style');
    appendStyle('css/p2-shoppable-runtime.css?v=1.0','p2-shoppable-runtime-style');
    appendScript('js/p2-social-commerce.js?v=1.0','p2-social-commerce-script',()=>window.PasarP2SocialCommerce?.version==='1.0');
    appendScript('js/p2-shoppable-runtime.js?v=1.0','p2-shoppable-runtime-script',()=>window.PasarP2ShoppableRuntime?.version==='1.0');
  }

  function p2IntentTarget(target){
    return target?.closest?.(`${P2_DISCOVERY_SELECTOR},.ig-product-media,.ig-product-info,[data-action="post-create"]`)||null;
  }

  function armP2Viewport(){
    if(window.PasarP2SocialCommerce?.version==='1.0'&&window.PasarP2ShoppableRuntime?.version==='1.0')return;
    if(networkCapability().constrained||!('IntersectionObserver' in window))return;
    const cards=[...doc.querySelectorAll(`${P2_DISCOVERY_SELECTOR}:not([data-p2-preload-observed])`)].slice(0,8);
    if(!cards.length)return;
    if(!p2ViewportObserver){
      p2ViewportObserver=new IntersectionObserver(entries=>{
        if(!entries.some(entry=>entry.isIntersecting||entry.intersectionRatio>0))return;
        p2ViewportObserver.disconnect();p2ViewportObserver=null;
        loadP2SocialCommerce();
      },{rootMargin:'480px 0px'});
    }
    for(const card of cards){
      card.dataset.p2PreloadObserved='true';
      p2ViewportObserver.observe(card);
    }
  }

  function scheduleP2Discovery(){
    clearTimeout(p2DiscoveryTimer);
    p2DiscoveryTimer=setTimeout(()=>{
      const run=()=>armP2Viewport();
      if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:1800});
      else run();
    },120);
  }

  function waitFor(check,timeout=5000){
    return new Promise((resolve,reject)=>{
      const started=Date.now();
      const poll=()=>{
        const value=check();
        if(value){resolve(value);return}
        if(Date.now()-started>=timeout){reject(new Error('Fitur social-commerce belum selesai dimuat.'));return}
        setTimeout(poll,25);
      };
      poll();
    });
  }

  async function openP2Composer(){
    loadP2SocialCommerce();
    try{
      const runtime=await waitFor(()=>window.PasarP2ShoppableRuntime?.version==='1.0'?window.PasarP2ShoppableRuntime:null);
      return await runtime.openComposer();
    }catch(error){
      console.error('[Pasar UMKM] P2 composer load error:',error);
      window.showToast?.('Composer postingan belum dapat dibuka. Coba lagi.');
      return null;
    }
  }

  function dispatchProductDetail(productId){
    const id=String(productId||'').trim();
    if(!id)return false;
    if(typeof window.openProductDetail==='function'){
      window.openProductDetail(id);
      return true;
    }
    const trigger=doc.createElement('button');
    trigger.type='button';trigger.hidden=true;
    trigger.dataset.action='product-detail';trigger.dataset.productId=id;
    doc.body.appendChild(trigger);trigger.click();trigger.remove();
    return true;
  }

  async function installLinks(){
    loadAuthSecurity();loadSellerBridge();loadProfileAddress();
    const host=doc.getElementById('sideMenuContent');
    if(!host)return;
    host.querySelector('[data-p8-seller-orders-link]')?.remove();
    if(!host.querySelector('[data-p8-purchases-link]'))host.appendChild(sideLink('/purchases/','package','Pembelian Saya','p8PurchasesLink'));
  }

  function rawSelection(){
    try{
      const value=JSON.parse(sessionStorage.getItem(CART_SELECTION_KEY)||'null');
      return Array.isArray(value)?new Set(value.map(String)):null;
    }catch{return null}
  }

  function setSelection(values){
    const clean=[...new Set((values||[]).map(String).filter(Boolean))];
    sessionStorage.setItem(CART_SELECTION_KEY,JSON.stringify(clean));
    return new Set(clean);
  }

  function cartRows(){
    const source=typeof STATE!=='undefined'&&Array.isArray(STATE.cart)?STATE.cart:[];
    return source.map(row=>({
      id:String(row.productId||row.product?.id||''),
      quantity:Number(row.quantity||0),
      price:Number(row.product?.price||0),
      storeId:String(row.product?.storeId||''),
      storeName:String(row.product?.storeName||'UMKM Lokal')
    })).filter(row=>row.id);
  }

  function normalizedSelection(rows=cartRows()){
    const ids=rows.map(row=>row.id);
    let selected=rawSelection();
    if(selected===null)selected=new Set(ids);
    selected=new Set([...selected].filter(id=>ids.includes(id)));
    setSelection(selected);
    return selected;
  }
  function rupiah(value){return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(value||0))}

  function selectionSummary(rows,selected){
    const chosen=rows.filter(row=>selected.has(row.id));
    return {
      count:chosen.reduce((sum,row)=>sum+Math.max(0,row.quantity),0),
      products:chosen.length,
      total:chosen.reduce((sum,row)=>sum+row.price*row.quantity,0)
    };
  }

  function syncCartSelectionUI(){
    const rows=cartRows();
    const page=doc.querySelector('.commerce-page');
    if(!page||!doc.querySelector('.commerce-cart-item'))return;
    appendStyle('css/cart-checkout-v2.css?v=1.0','cart-checkout-v2-style');
    const selected=normalizedSelection(rows);

    let toolbar=page.querySelector('.commerce-cart-v2-toolbar');
    const content=page.querySelector('.commerce-content.with-sticky');
    if(content&&!toolbar){
      toolbar=doc.createElement('div');toolbar.className='commerce-cart-v2-toolbar';
      toolbar.innerHTML='<label class="commerce-cart-v2-selectall"><input class="commerce-cart-v2-check" type="checkbox" data-cart-v2-all><span>Pilih semua</span></label><span class="commerce-cart-v2-count" data-cart-v2-count></span>';
      content.prepend(toolbar);
    }

    const groups=[...page.querySelectorAll('.commerce-store-group')];
    for(const group of groups){
      const itemNodes=[...group.querySelectorAll('.commerce-cart-item[data-product-id]')];
      const ids=itemNodes.map(node=>String(node.dataset.productId||'')).filter(Boolean);
      const head=group.querySelector('.commerce-store-head');
      if(head&&!head.classList.contains('cart-v2-enhanced')){
        const name=head.querySelector('span')?.textContent?.trim()||'UMKM Lokal';
        head.classList.add('cart-v2-enhanced');
        head.innerHTML=`<label class="commerce-cart-v2-store-select"><input class="commerce-cart-v2-check" type="checkbox" data-cart-v2-store><i class="ph ph-storefront" aria-hidden="true"></i><span class="commerce-cart-v2-store-name">${name.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</span></label>`;
      }
      const storeCheck=head?.querySelector('[data-cart-v2-store]');
      if(storeCheck){
        const selectedCount=ids.filter(id=>selected.has(id)).length;
        storeCheck.checked=ids.length>0&&selectedCount===ids.length;
        storeCheck.indeterminate=selectedCount>0&&selectedCount<ids.length;
        storeCheck.dataset.productIds=ids.join(',');
      }

      for(const node of itemNodes){
        const id=String(node.dataset.productId||'');
        if(!node.classList.contains('cart-v2-enhanced')){
          node.classList.add('cart-v2-enhanced');
          const label=doc.createElement('label');label.className='commerce-cart-v2-item-select';
          label.innerHTML=`<input class="commerce-cart-v2-check" type="checkbox" data-cart-v2-item="${id}" aria-label="Pilih produk untuk checkout">`;
          node.prepend(label);
        }
        const check=node.querySelector('[data-cart-v2-item]');
        if(check)check.checked=selected.has(id);
        node.classList.toggle('is-unselected',!selected.has(id));
      }
    }

    const all=page.querySelector('[data-cart-v2-all]');
    if(all){all.checked=rows.length>0&&selected.size===rows.length;all.indeterminate=selected.size>0&&selected.size<rows.length}
    const summary=selectionSummary(rows,selected);
    const count=page.querySelector('[data-cart-v2-count]');if(count)count.textContent=`${summary.products} produk dipilih`;
    const sticky=page.querySelector('.commerce-sticky');
    if(sticky){
      sticky.classList.add('cart-v2-sticky');
      const copy=sticky.querySelector('.commerce-sticky-copy');
      if(copy)copy.innerHTML=`<span>Total ${summary.count} item</span><strong>${rupiah(summary.total)}</strong>`;
      const button=sticky.querySelector('[data-commerce-action="checkout"]');
      if(button){button.textContent=`Checkout (${summary.count})`;button.disabled=summary.products===0;button.setAttribute('aria-disabled',summary.products===0?'true':'false')}
    }
  }

  function scheduleCartEnhance(){clearTimeout(cartEnhanceTimer);cartEnhanceTimer=setTimeout(syncCartSelectionUI,35)}

  function selectedProductIds(){return [...normalizedSelection()]}

  function openCheckout(replace=false){
    const rows=cartRows();
    if(rows.length&&!selectedProductIds().length){window.showToast?.('Pilih minimal satu produk untuk checkout.');return}
    const target='/checkout/index.html';
    if(location.pathname===target)return;
    location[replace?'replace':'assign'](target);
  }

  async function buyNow(productId,target){
    if(!productId||buyNowPending)return;
    buyNowPending=true;
    const wasDisabled=Boolean(target?.disabled);
    if(target){target.disabled=true;target.setAttribute('aria-busy','true')}
    try{
      const response=await fetch('/api/commerce/cart/items',{
        method:'POST',credentials:'include',cache:'no-store',
        headers:{Accept:'application/json','Content-Type':'application/json'},
        body:JSON.stringify({product_id:productId,quantity:1})
      });
      const data=await response.json().catch(()=>({}));
      if(response.status===401){location.href='/?intent=login';return}
      if(!response.ok||data.ok!==true)throw new Error(data.error||'Produk belum dapat diproses.');
      setSelection([String(productId)]);
      openCheckout();
    }catch(error){
      window.showToast?.(error.message||'Checkout belum dapat dibuka.');
    }finally{
      buyNowPending=false;
      if(target&&target.isConnected){target.disabled=wasDisabled;target.removeAttribute('aria-busy')}
    }
  }

  function isLegacyCheckoutForm(node){return node instanceof HTMLFormElement&&node.id==='commerceCheckoutForm'}

  doc.addEventListener('pointerdown',event=>{
    if(p2IntentTarget(event.target))loadP2SocialCommerce();
  },{capture:true,passive:true});

  doc.addEventListener('focusin',event=>{
    if(p2IntentTarget(event.target))loadP2SocialCommerce();
  },true);

  doc.addEventListener('change',event=>{
    const item=event.target?.closest?.('[data-cart-v2-item]');
    const store=event.target?.closest?.('[data-cart-v2-store]');
    const all=event.target?.closest?.('[data-cart-v2-all]');
    if(!item&&!store&&!all)return;
    const rows=cartRows();let selected=normalizedSelection(rows);
    if(item){const id=String(item.dataset.cartV2Item||'');item.checked?selected.add(id):selected.delete(id)}
    if(store){const ids=String(store.dataset.productIds||'').split(',').filter(Boolean);for(const id of ids){store.checked?selected.add(id):selected.delete(id)}}
    if(all)selected=all.checked?new Set(rows.map(row=>row.id)):new Set();
    setSelection(selected);syncCartSelectionUI();
  },true);

  doc.addEventListener('click',event=>{
    const postCreate=event.target?.closest?.('[data-action="post-create"]');
    if(postCreate){
      event.preventDefault();event.stopImmediatePropagation();
      openP2Composer();
      return;
    }

    const media=event.target?.closest?.(`${P2_CARD_SELECTOR} .ig-product-media`);
    if(media){
      const id=String(media.closest(P2_CARD_SELECTOR)?.querySelector('.ig-product-info[data-product-id]')?.dataset.productId||'');
      if(id){
        event.preventDefault();event.stopImmediatePropagation();
        loadP2SocialCommerce();dispatchProductDetail(id);
        return;
      }
    }

    const buy=event.target?.closest?.('[data-action="buy-now"],[data-commerce-action="buy-now"]');
    if(buy){
      event.preventDefault();event.stopImmediatePropagation();
      buyNow(String(buy.dataset.productId||''),buy);
      return;
    }

    const checkout=event.target?.closest?.('[data-cart-v2-checkout],[data-action="checkout"],[data-function-action="checkout-open"],[data-commerce-action="checkout"]');
    if(checkout){
      event.preventDefault();event.stopImmediatePropagation();
      openCheckout();
      return;
    }

    const account=event.target?.closest?.('[data-nav="account"]');
    if(account)setTimeout(installLinks,80);
  },true);

  doc.addEventListener('submit',event=>{
    if(!isLegacyCheckoutForm(event.target))return;
    event.preventDefault();event.stopImmediatePropagation();
    openCheckout();
  },true);

  const legacyGuard=new MutationObserver(()=>{
    if(doc.getElementById('commerceCheckoutForm')){legacyGuard.disconnect();openCheckout(true);return}
    scheduleCartEnhance();scheduleP2Discovery();
  });
  legacyGuard.observe(doc.documentElement,{childList:true,subtree:true});

  loadAuthSecurity();
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',()=>{installLinks();scheduleCartEnhance();scheduleP2Discovery()},{once:true});
  else{installLinks();scheduleCartEnhance();scheduleP2Discovery()}

  window.PasarCartCheckoutV2=Object.freeze({version:'1.0',selectionKey:CART_SELECTION_KEY,selectedProductIds,setSelection,syncCartSelectionUI});
  window.PasarP8Commerce=Object.freeze({version:'1.2',installLinks,loadSellerBridge,openCheckout,loadP2SocialCommerce,openP2Composer,networkCapability});
})();