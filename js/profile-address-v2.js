'use strict';

(() => {
  if(window.PasarProfileAddressV2?.version==='1.0')return;
  const doc=document;
  let currentAddress=null;
  let coords={latitude:null,longitude:null,accuracy_m:null};
  let enhanceTimer=0;

  const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const nativeUser=()=>typeof STATE!=='undefined'&&STATE.user?STATE.user:{};

  function style(){
    if(doc.querySelector('link[data-profile-address-v2-style]'))return;
    const link=doc.createElement('link');link.rel='stylesheet';link.href='css/profile-address-v2.css?v=1.0';link.dataset.profileAddressV2Style='true';doc.head.appendChild(link);
  }

  async function api(path,options={}){
    const response=await fetch(path,{credentials:'include',cache:'no-store',...options,headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false)throw new Error(data.error||`HTTP ${response.status}`);
    return data;
  }

  function field(label,id,value='',attrs=''){
    return `<div class="profile-edit-field"><label class="profile-edit-label" for="${id}">${label}</label><input id="${id}" class="profile-edit-input" value="${esc(value)}" ${attrs}></div>`;
  }

  function markup(address={}){
    const user=nativeUser();
    return `<section id="profileAddressV2" class="profile-edit-section profile-address-v2">
      <div class="profile-address-v2-head"><div><h3 class="profile-edit-section-title">Alamat utama</h3><p>Alamat ini otomatis menjadi pilihan awal saat checkout. Titik GPS membantu seller mengantar tepat sasaran.</p></div><span class="profile-address-v2-badge">Default checkout</span></div>
      <div class="profile-address-v2-grid two">
        ${field('Label alamat','profileAddressLabel',address.label||'Rumah','maxlength="60"')}
        ${field('Nama penerima','profileAddressRecipient',address.recipient_name||user.name||'','maxlength="120" autocomplete="name"')}
      </div>
      <div class="profile-address-v2-grid two">
        ${field('Nomor WhatsApp / telepon','profileAddressPhone',address.phone||user.phone||'','maxlength="30" inputmode="tel" autocomplete="tel"')}
        ${field('Kode pos','profileAddressPostal',address.postal_code||'','maxlength="20" inputmode="numeric"')}
      </div>
      <div class="profile-edit-field"><label class="profile-edit-label" for="profileAddressText">Alamat lengkap</label><textarea id="profileAddressText" class="profile-edit-textarea" maxlength="1200" rows="3" placeholder="Nama jalan, RT/RW, kelurahan, nomor rumah...">${esc(address.address_text||'')}</textarea></div>
      <div class="profile-address-v2-grid two">
        ${field('Kecamatan','profileAddressDistrict',address.district||'','maxlength="100"')}
        ${field('Kota','profileAddressCity',address.city||'Lubuklinggau','maxlength="100"')}
      </div>
      <div class="profile-address-v2-grid two">
        ${field('Provinsi','profileAddressProvince',address.province||'Sumatera Selatan','maxlength="100"')}
        ${field('Patokan','profileAddressLandmark',address.landmark||'','maxlength="240" placeholder="Contoh: rumah abu-abu belakang bakso"')}
      </div>
      <div class="profile-address-v2-location">
        <div class="profile-address-v2-location-actions"><button id="profileAddressLocate" type="button"><i class="ph ph-crosshair"></i> Gunakan lokasi saat ini</button></div>
        <p id="profileAddressLocationStatus" class="profile-address-v2-location-status">${address.latitude!=null&&address.longitude!=null?`Titik tersimpan. Akurasi sekitar <strong>±${Math.round(Number(address.accuracy_m||0))} m</strong>.`:'Belum ada titik GPS. Alamat teks tetap wajib diisi.'}</p>
        <a id="profileAddressMapLink" class="profile-address-v2-map" ${address.latitude!=null&&address.longitude!=null?`href="https://www.google.com/maps?q=${Number(address.latitude)},${Number(address.longitude)}" target="_blank" rel="noopener"`:'hidden'}>Buka titik di Google Maps</a>
      </div>
      <button id="profileAddressSave" class="profile-address-v2-save" type="button">Simpan alamat utama</button>
    </section>`;
  }

  function values(){
    return {
      label:doc.getElementById('profileAddressLabel')?.value||'Rumah',
      recipient_name:doc.getElementById('profileAddressRecipient')?.value||'',
      phone:doc.getElementById('profileAddressPhone')?.value||'',
      address_text:doc.getElementById('profileAddressText')?.value||'',
      district:doc.getElementById('profileAddressDistrict')?.value||'',
      city:doc.getElementById('profileAddressCity')?.value||'Lubuklinggau',
      province:doc.getElementById('profileAddressProvince')?.value||'Sumatera Selatan',
      postal_code:doc.getElementById('profileAddressPostal')?.value||'',
      landmark:doc.getElementById('profileAddressLandmark')?.value||'',
      ...coords,is_default:true
    };
  }

  function setLocation(position){
    coords={latitude:Number(position.coords.latitude.toFixed(6)),longitude:Number(position.coords.longitude.toFixed(6)),accuracy_m:Math.round(position.coords.accuracy||0)};
    const status=doc.getElementById('profileAddressLocationStatus');
    if(status)status.innerHTML=`Lokasi ditemukan. Akurasi sekitar <strong>±${coords.accuracy_m} m</strong>. Lengkapi alamat/patokan agar seller mudah mengenali lokasi.`;
    const link=doc.getElementById('profileAddressMapLink');
    if(link){link.hidden=false;link.href=`https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`}
  }

  function locate(){
    const button=doc.getElementById('profileAddressLocate');
    if(!navigator.geolocation){window.showToast?.('Browser ini belum mendukung lokasi perangkat.');return}
    if(button){button.disabled=true;button.textContent='Mencari lokasi...'}
    navigator.geolocation.getCurrentPosition(position=>{
      setLocation(position);window.showToast?.('Titik lokasi berhasil diperbarui.');
      if(button){button.disabled=false;button.innerHTML='<i class="ph ph-crosshair"></i> Gunakan lokasi saat ini'}
    },failure=>{
      const message=failure?.code===1?'Izin lokasi ditolak. Aktifkan izin lokasi browser untuk memakai fitur ini.':'Lokasi belum dapat ditemukan. Coba di area dengan sinyal GPS lebih baik.';
      window.showToast?.(message);
      if(button){button.disabled=false;button.innerHTML='<i class="ph ph-crosshair"></i> Gunakan lokasi saat ini'}
    },{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
  }

  async function save(){
    const button=doc.getElementById('profileAddressSave');
    const payload=values();
    if(String(payload.recipient_name).trim().length<2){window.showToast?.('Nama penerima belum valid.');return}
    if(String(payload.phone).trim().length<5){window.showToast?.('Nomor penerima belum valid.');return}
    if(String(payload.address_text).trim().length<5){window.showToast?.('Lengkapi alamat utama terlebih dahulu.');return}
    if(button){button.disabled=true;button.textContent='Menyimpan...'}
    try{
      const path=currentAddress?.id?`/api/commerce/address-book/${encodeURIComponent(currentAddress.id)}`:'/api/commerce/address-book';
      const data=await api(path,{method:currentAddress?.id?'PATCH':'POST',body:JSON.stringify(payload)});
      currentAddress=data.address||currentAddress;coords={latitude:currentAddress?.latitude??coords.latitude,longitude:currentAddress?.longitude??coords.longitude,accuracy_m:currentAddress?.accuracy_m??coords.accuracy_m};
      window.showToast?.('Alamat utama berhasil disimpan.');
    }catch(error){window.showToast?.(error.message||'Alamat belum dapat disimpan.')}finally{if(button){button.disabled=false;button.textContent='Simpan alamat utama'}}
  }

  async function enhance(){
    const form=doc.getElementById('profileEditForm');
    if(!form||doc.getElementById('profileAddressV2'))return;
    style();
    let address=null;
    try{const data=await api('/api/commerce/address-book');address=data.default_address||null}catch(error){console.warn('[Pasar UMKM] Address book hydrate:',error)}
    currentAddress=address;
    coords={latitude:address?.latitude??null,longitude:address?.longitude??null,accuracy_m:address?.accuracy_m??null};
    const actions=form.querySelector('.profile-edit-actions');
    if(actions)actions.insertAdjacentHTML('beforebegin',markup(address||{}));
  }

  doc.addEventListener('click',event=>{
    if(event.target?.closest?.('#profileAddressLocate')){event.preventDefault();locate();return}
    if(event.target?.closest?.('#profileAddressSave')){event.preventDefault();save()}
  },true);

  function schedule(){clearTimeout(enhanceTimer);enhanceTimer=setTimeout(()=>enhance().catch(()=>null),45)}
  const observer=new MutationObserver(schedule);observer.observe(doc.documentElement,{childList:true,subtree:true});
  schedule();

  window.PasarProfileAddressV2=Object.freeze({version:'1.0',enhance,locate});
})();