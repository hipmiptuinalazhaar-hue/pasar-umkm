'use strict';

(() => {
  const doc=document;
  if(window.PasarP8Commerce?.version==='1.0')return;

  function sideLink(href,icon,label,key){
    const link=doc.createElement('a');
    link.className='p7-side-link';link.href=href;link.dataset[key]='true';
    link.innerHTML=`<i class="ph ph-${icon}" aria-hidden="true"></i><span>${label}</span>`;
    return link;
  }

  async function installLinks(){
    const host=doc.getElementById('sideMenuContent');
    if(!host)return;
    if(!host.querySelector('[data-p8-purchases-link]'))host.appendChild(sideLink('/purchases/','package','Pembelian Saya','p8PurchasesLink'));
    try{
      const response=await fetch('/api/auth/me',{credentials:'include',cache:'no-store'});
      if(!response.ok)return;
      const data=await response.json();
      const user=data?.user||data;
      if(['seller','admin'].includes(user?.role)&&!host.querySelector('[data-p8-seller-orders-link]'))host.appendChild(sideLink('/seller-orders/','storefront','Pesanan Seller','p8SellerOrdersLink'));
    }catch{}
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

  window.PasarP8Commerce=Object.freeze({version:'1.0',installLinks});
})();