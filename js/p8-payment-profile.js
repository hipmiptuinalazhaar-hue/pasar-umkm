const mode=document.body.dataset.p8Mode||'';
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const money=new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0});

async function api(path,options={}){
  const response=await fetch(path,{credentials:'include',cache:'no-store',...options,headers:{Accept:'application/json',...(options.body instanceof FormData?{}:options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data.error||`HTTP ${response.status}`);error.status=response.status;throw error}
  return data;
}
function toast(message){const host=document.getElementById('p8Toast');if(!host)return;host.textContent=message;host.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>host.classList.remove('show'),2800)}
function waitFor(selector,timeout=12000){return new Promise((resolve,reject)=>{const first=document.querySelector(selector);if(first)return resolve(first);const observer=new MutationObserver(()=>{const node=document.querySelector(selector);if(node){observer.disconnect();resolve(node)}});observer.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>{observer.disconnect();reject(new Error(`Elemen ${selector} belum tersedia.`))},timeout)})}
function paymentLabel(value){return ({bank_transfer:'Transfer rekening / e-wallet',merchant_qris:'QRIS merchant',cod:'COD',pay_at_store:'Bayar di toko'})[value]||value}

function buildProviderOptions(selected=''){
  const providers=['BRI','BCA','BNI','Mandiri','BSI','Bank Sumsel Babel','CIMB Niaga','BTN','PermataBank','SeaBank','DANA','GoPay','OVO','ShopeePay','LinkAja','Lainnya'];
  return providers.map(item=>`<option value="${esc(item)}" ${item===selected?'selected':''}>${esc(item)}</option>`).join('');
}
function sellerProfileMarkup(settings){
  const currentQris=settings.qris_image_url?`<div class="p81-qris-preview"><img src="${esc(settings.qris_image_url)}" alt="QRIS merchant saat ini"><small>QRIS merchant tersimpan</small></div>`:'<div class="p81-qris-empty">Belum ada QRIS merchant.</div>';
  return `<section class="p81-payment-profile" id="p81PaymentProfile">
    <div class="p81-head"><div><span class="p81-eyebrow">P8.1 · Payment Profile</span><h3>Tempat pembayaran seller</h3><p>Isi rekening/e-wallet untuk metode transfer dan unggah QRIS merchant resmi yang sudah kamu miliki.</p></div></div>
    <div class="p81-panel" data-p81-transfer>
      <div class="p81-panel-title"><strong>Transfer rekening / e-wallet</strong><span>Uang masuk langsung ke akun merchant.</span></div>
      <div class="p81-grid">
        <div class="p8-field"><label>Jenis tujuan</label><select name="transfer_provider_type"><option value="bank" ${settings.transfer_provider_type==='bank'?'selected':''}>Bank</option><option value="ewallet" ${settings.transfer_provider_type==='ewallet'?'selected':''}>E-Wallet</option></select></div>
        <div class="p8-field"><label>Bank / E-Wallet</label><select name="transfer_provider_name"><option value="">Pilih provider</option>${buildProviderOptions(settings.transfer_provider_name||'')}</select></div>
        <div class="p8-field"><label>Nomor rekening / akun</label><input name="transfer_account_number" inputmode="numeric" maxlength="120" autocomplete="off" value="${esc(settings.transfer_account_number||'')}" placeholder="Contoh: 1234567890"></div>
        <div class="p8-field"><label>Nama pemilik</label><input name="transfer_account_name" maxlength="160" autocomplete="name" value="${esc(settings.transfer_account_name||'')}" placeholder="Nama sesuai rekening / akun"></div>
      </div>
      <p class="p81-help">Seller tidak perlu mengunggah buku tabungan atau identitas rekening. Cukup data tujuan pembayaran.</p>
    </div>
    <div class="p81-panel" data-p81-qris>
      <div class="p81-panel-title"><strong>QRIS merchant</strong><span>Gunakan QRIS yang diterbitkan PJP/acquirer resmi.</span></div>
      <div class="p81-grid">
        <div class="p8-field"><label>Nama merchant QRIS</label><input name="qris_merchant_name" maxlength="160" value="${esc(settings.qris_merchant_name||'')}" placeholder="Nama yang tampil saat QRIS dibayar"></div>
        <div class="p8-field"><label>Upload gambar QRIS</label><input id="p81QrisFile" type="file" accept="image/png,image/jpeg,image/webp"><small>PNG/JPG/WEBP, maksimal 3 MB.</small></div>
      </div>
      <input type="hidden" name="qris_image_url" value="${esc(settings.qris_image_url||'')}"><input type="hidden" name="qris_public_id" value="${esc(settings.qris_public_id||'')}">
      <div id="p81QrisPreview">${currentQris}</div>
      ${settings.qris_image_url?'<label class="p8-check p81-remove"><input type="checkbox" name="remove_qris"><span><strong>Hapus QRIS tersimpan</strong><br>QRIS akan dinonaktifkan jika tidak ada gambar pengganti.</span></label>':''}
    </div>
    <div class="p81-security-note"><strong>Penting:</strong> Pasar UMKM hanya menampilkan tujuan pembayaran seller. Platform tidak membuat QRIS, tidak memegang dana, dan tidak menjamin settlement bank/e-wallet.</div>
  </section>`;
}

async function enhanceSeller(){
  const form=await waitFor('#p8SellerSettings');
  if(document.getElementById('p81PaymentProfile'))return;
  const data=await api('/api/commerce/fulfillment/settings/me');
  const settings=data.settings||{};
  const submit=form.querySelector('[type="submit"]');
  submit?.insertAdjacentHTML('beforebegin',sellerProfileMarkup(settings));

  const bankNote=[...form.querySelectorAll('.p8-field')].find(node=>node.querySelector('[name="bank_transfer_instructions"]'));
  const qrisNote=[...form.querySelectorAll('.p8-field')].find(node=>node.querySelector('[name="qris_instructions"]'));
  if(bankNote){const label=bankNote.querySelector('label');if(label)label.textContent='Catatan tambahan transfer (opsional)'}
  if(qrisNote){const label=qrisNote.querySelector('label');if(label)label.textContent='Catatan tambahan QRIS (opsional)'}

  const fileInput=document.getElementById('p81QrisFile');
  fileInput?.addEventListener('change',()=>{
    const file=fileInput.files?.[0];if(!file)return;
    const url=URL.createObjectURL(file);
    const preview=document.getElementById('p81QrisPreview');
    preview.innerHTML=`<div class="p81-qris-preview"><img src="${url}" alt="Preview QRIS baru"><small>Preview QRIS baru, akan diunggah saat disimpan.</small></div>`;
  });
}

function collectLegacySettings(form,data){
  return {
    pickup_enabled:data.has('pickup_enabled'),
    seller_delivery_enabled:data.has('seller_delivery_enabled'),
    local_courier_enabled:data.has('local_courier_enabled'),
    cod_enabled:data.has('cod_enabled'),
    pay_at_store_enabled:data.has('pay_at_store_enabled'),
    bank_transfer_enabled:data.has('bank_transfer_enabled'),
    merchant_qris_enabled:data.has('merchant_qris_enabled'),
    flat_delivery_fee:data.get('flat_delivery_fee'),
    free_delivery_threshold:data.get('free_delivery_threshold'),
    estimated_min_minutes:data.get('estimated_min_minutes'),
    estimated_max_minutes:data.get('estimated_max_minutes'),
    response_sla_minutes:data.get('response_sla_minutes'),
    pickup_instructions:data.get('pickup_instructions'),
    bank_transfer_instructions:data.get('bank_transfer_instructions'),
    qris_instructions:data.get('qris_instructions'),
    transfer_provider_type:data.get('transfer_provider_type'),
    transfer_provider_name:data.get('transfer_provider_name'),
    transfer_account_number:String(data.get('transfer_account_number')||'').trim(),
    transfer_account_name:String(data.get('transfer_account_name')||'').trim(),
    qris_merchant_name:String(data.get('qris_merchant_name')||'').trim(),
    qris_image_url:String(data.get('qris_image_url')||'').trim(),
    qris_public_id:String(data.get('qris_public_id')||'').trim()
  };
}

async function uploadQris(file){
  if(!file)return null;
  if(file.size>3*1024*1024)throw new Error('Ukuran QRIS maksimal 3 MB.');
  const body=new FormData();body.append('file',file);
  const result=await api('/api/uploads/qris-image',{method:'POST',body});
  return result.image||null;
}

document.addEventListener('submit',async event=>{
  if(mode!=='seller'||event.target?.id!=='p8SellerSettings')return;
  event.preventDefault();event.stopImmediatePropagation();
  const form=event.target;const button=form.querySelector('[type="submit"]');const data=new FormData(form);const payload=collectLegacySettings(form,data);
  button.disabled=true;
  try{
    if(data.has('remove_qris')){payload.qris_image_url='';payload.qris_public_id='';if(payload.merchant_qris_enabled)payload.merchant_qris_enabled=false}
    const file=document.getElementById('p81QrisFile')?.files?.[0];
    if(file){toast('Mengunggah QRIS merchant…');const image=await uploadQris(file);payload.qris_image_url=image?.url||'';payload.qris_public_id=image?.public_id||''}
    if(payload.bank_transfer_enabled&&(!payload.transfer_provider_name||!payload.transfer_account_number||!payload.transfer_account_name))throw new Error('Lengkapi bank/e-wallet, nomor akun, dan nama pemilik sebelum mengaktifkan transfer.');
    if(payload.merchant_qris_enabled&&(!payload.qris_merchant_name||!payload.qris_image_url))throw new Error('Nama merchant dan gambar QRIS wajib diisi sebelum QRIS diaktifkan.');
    await api('/api/commerce/fulfillment/settings/me',{method:'PUT',body:JSON.stringify(payload)});
    toast('Tempat pembayaran seller berhasil disimpan.');
    setTimeout(()=>location.reload(),650);
  }catch(error){toast(error.message)}finally{button.disabled=false}
},{capture:true});

function paymentCard(order){
  if(order.payment_method==='bank_transfer'&&order.payment_account_number){
    return `<section class="p81-buyer-payment"><span class="p81-eyebrow">Tujuan pembayaran</span><h4>${esc(order.payment_provider_name||'Transfer merchant')}</h4><div class="p81-account"><strong>${esc(order.payment_account_number)}</strong><button type="button" data-copy-payment="${esc(order.payment_account_number)}">Salin</button></div><p>A/N ${esc(order.payment_account_name||'Merchant')}</p><div class="p81-total">Bayar sesuai total pesanan: <strong>${money.format(Number(order.total||0))}</strong></div></section>`;
  }
  if(order.payment_method==='merchant_qris'&&order.payment_qris_image_url){
    return `<section class="p81-buyer-payment"><span class="p81-eyebrow">Bayar dengan QRIS</span><h4>${esc(order.payment_qris_merchant_name||'QRIS Merchant')}</h4><div class="p81-qris-buyer"><img src="${esc(order.payment_qris_image_url)}" alt="QRIS ${esc(order.payment_qris_merchant_name||'merchant')}"></div><div class="p81-total">Masukkan nominal <strong>${money.format(Number(order.total||0))}</strong> bila QRIS bersifat statis.</div><p class="p81-help">Sebelum membayar, pastikan nama merchant di aplikasi pembayaran sesuai dengan nama di atas.</p></section>`;
  }
  return '';
}
async function enhancePurchases(){
  await waitFor('[data-timeline]',12000).catch(()=>null);
  const data=await api('/api/commerce/orders?scope=buyer');
  for(const order of data.orders||[]){
    const button=document.querySelector(`[data-timeline="${CSS.escape(String(order.id))}"]`);const article=button?.closest('.p8-order');if(!article||article.querySelector('.p81-buyer-payment'))continue;
    const html=paymentCard(order);if(!html)continue;
    const actions=article.querySelector('.p8-actions');actions?.insertAdjacentHTML('beforebegin',html);
  }
  document.addEventListener('click',event=>{const button=event.target.closest('[data-copy-payment]');if(!button)return;navigator.clipboard?.writeText(button.dataset.copyPayment||'').then(()=>toast('Nomor pembayaran disalin.')).catch(()=>toast('Nomor belum dapat disalin.'))});
}
function relabelCheckout(){
  document.querySelectorAll('input[type="radio"][name^="payment_"]').forEach(input=>{const span=input.closest('label')?.querySelector('span');if(span)span.textContent=paymentLabel(input.value)});
}
async function enhanceCheckout(){
  await waitFor('input[type="radio"][name^="payment_"]',12000).catch(()=>null);relabelCheckout();
  new MutationObserver(relabelCheckout).observe(document.getElementById('p8Root')||document.body,{childList:true,subtree:true});
}

if(mode==='seller')enhanceSeller().catch(error=>console.error('P8.1 seller payment profile:',error));
if(mode==='purchases')enhancePurchases().catch(error=>console.error('P8.1 buyer payment profile:',error));
if(mode==='checkout')enhanceCheckout().catch(error=>console.error('P8.1 checkout payment profile:',error));
