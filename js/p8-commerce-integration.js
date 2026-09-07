'use strict';

(() => {
  const doc=document;
  if(window.PasarP8Commerce?.version==='1.1')return;

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

  doc.addEventListener('click',event=>{
    const checkout=event.target?.closest?.('[data-action="checkout"]');
    if(checkout){
      event.preventDefault();event.stopImmediatePropagation();
      location.href='/checkout/';
      return;
    }
    const account=event.target?.closest?.('[data-nav="account"]');
    if(account)setTimeout(installLinks,80);
  },true);

  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',installLinks,{once:true});
  else installLinks();

  window.PasarP8Commerce=Object.freeze({version:'1.1',installLinks,loadSellerBridge});
})();