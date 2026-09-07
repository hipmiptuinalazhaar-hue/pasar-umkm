'use strict';

(() => {
  const doc=document;
  if(window.PasarP8Commerce?.version==='1.2')return;

  let buyNowPending=false;

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

  function loadSellerBridge(){
    appendScript('js/seller-center-p8-bridge.js?v=1.0','seller-p8-bridge',()=>window.PasarSellerP8?.version==='1.0');
    appendScript('js/seller-center-order-p8.js?v=1.0','seller-order-p8-bridge',()=>window.PasarSellerOrdersP8?.version==='1.0');
  }

  async function installLinks(){
    loadSellerBridge();
    const host=doc.getElementById('sideMenuContent');
    if(!host)return;
    host.querySelector('[data-p8-seller-orders-link]')?.remove();
    if(!host.querySelector('[data-p8-purchases-link]'))host.appendChild(sideLink('/purchases/','package','Pembelian Saya','p8PurchasesLink'));
  }

  function openCheckout(replace=false){
    if(location.pathname==='/checkout/'||location.pathname==='/checkout')return;
    if(replace)location.replace('/checkout/');
    else location.href='/checkout/';
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
      openCheckout();
    }catch(error){
      window.showToast?.(error.message||'Checkout belum dapat dibuka.');
    }finally{
      buyNowPending=false;
      if(target&&target.isConnected){target.disabled=wasDisabled;target.removeAttribute('aria-busy')}
    }
  }

  function isLegacyCheckoutForm(node){return node instanceof HTMLFormElement&&node.id==='commerceCheckoutForm'}

  doc.addEventListener('click',event=>{
    const buy=event.target?.closest?.('[data-action="buy-now"],[data-commerce-action="buy-now"]');
    if(buy){
      event.preventDefault();event.stopImmediatePropagation();
      buyNow(String(buy.dataset.productId||''),buy);
      return;
    }

    const checkout=event.target?.closest?.('[data-action="checkout"],[data-function-action="checkout-open"],[data-commerce-action="checkout"]');
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
    if(!doc.getElementById('commerceCheckoutForm'))return;
    legacyGuard.disconnect();
    openCheckout(true);
  });
  legacyGuard.observe(doc.documentElement,{childList:true,subtree:true});

  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',installLinks,{once:true});
  else installLinks();

  window.PasarP8Commerce=Object.freeze({version:'1.2',installLinks,loadSellerBridge,openCheckout});
})();