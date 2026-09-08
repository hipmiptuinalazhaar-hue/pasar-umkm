import { adminApi } from './api.js?v=7.1.0';

const STATUS_LABELS = Object.freeze({waiting_support:'Menunggu CS',in_progress:'Sedang ditangani',waiting_user:'Menunggu pengguna',resolved:'Selesai',closed:'Ditutup'});
const CATEGORY_LABELS = Object.freeze({order:'Pesanan',payment:'Pembayaran',account_security:'Akun & keamanan',seller_verification:'Toko & verifikasi',product_report:'Produk & laporan',complaint:'Pengaduan',other:'Lainnya'});
const PRIORITY_LABELS = Object.freeze({low:'Rendah',normal:'Normal',high:'Tinggi',urgent:'Mendesak'});

const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const fmt = value => { const d=new Date(value||0); return Number.isFinite(d.getTime()) ? d.toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : ''; };

function ensureStyle(){
  if(document.querySelector('link[data-admin-support-style]')) return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='/css/admin-support-v1.css?v=1.0.0';link.dataset.adminSupportStyle='true';document.head.appendChild(link);
}

function metric(label,value){return `<div class="cs-metric"><small>${esc(label)}</small><strong>${Number(value||0).toLocaleString('id-ID')}</strong></div>`;}
function ticketRow(ticket,current){return `<button class="cs-ticket" type="button" data-cs-ticket="${esc(ticket.id)}" aria-current="${String(ticket.id===current)}"><span class="cs-ticket-top"><strong>${esc(ticket.subject)}</strong>${ticket.unread?'<span class="cs-unread" aria-label="Belum dibaca">!</span>':''}</span><span class="cs-ticket-code">${esc(ticket.code)}</span><span class="cs-ticket-user">${esc(ticket.user?.name||'Pengguna')} · ${esc(ticket.user?.email||'')}</span><span class="cs-ticket-meta"><span class="cs-badge ${esc(ticket.status)}">${esc(STATUS_LABELS[ticket.status]||ticket.status)}</span><span class="cs-badge ${esc(ticket.priority)}">${esc(PRIORITY_LABELS[ticket.priority]||ticket.priority)}</span><span class="cs-badge">${esc(CATEGORY_LABELS[ticket.category]||ticket.category)}</span></span></button>`;}
function messagesMarkup(messages){return (messages||[]).map(message=>`<article class="cs-message ${message.sender_type==='admin'?'admin':message.sender_type==='system'?'system':''}"><strong>${esc(message.sender_type==='user'?(message.sender_label||'Pengguna'):message.sender_type==='admin'?'Customer Service':'Pasar UMKM')}</strong>${message.message?`<p>${esc(message.message)}</p>`:''}<time>${esc(fmt(message.created_at))}</time></article>`).join('')||'<div class="cs-detail-empty"><div><strong>Belum ada pesan.</strong></div></div>';}

function notesMarkup(notes){return (notes||[]).map(note=>`<article class="cs-note"><p>${esc(note.note)}</p><small>${esc(note.admin_name||'Admin')} · ${esc(fmt(note.created_at))}</small></article>`).join('')||'<div class="cs-note"><p>Belum ada catatan internal.</p></div>';}

function detailMarkup(data,permissions){
  const t=data.ticket;const canReply=permissions.has('support.reply');const canManage=permissions.has('support.manage');
  const order=t.order?`<span>Pesanan <strong>${esc(t.order.number||'')}</strong> · ${esc(t.order.status||'')}</span>`:'';
  const store=t.store?`<span>Toko <strong>${esc(t.store.name||'')}</strong></span>`:'';
  return `<div class="cs-detail-head"><div class="cs-detail-title"><div><small>${esc(t.code)}</small><h2>${esc(t.subject)}</h2></div><span class="cs-badge ${esc(t.status)}">${esc(STATUS_LABELS[t.status]||t.status)}</span></div><div class="cs-detail-context"><span>${esc(t.user.name)} · ${esc(t.user.email)} · ${esc(t.user.role)}</span>${order}${store}<span>Ditangani: ${esc(t.assignee?.name||'Belum ditugaskan')}</span></div>${canManage?`<div class="cs-tools"><select data-cs-status aria-label="Status tiket">${Object.entries(STATUS_LABELS).map(([v,l])=>`<option value="${v}" ${v===t.status?'selected':''}>${esc(l)}</option>`).join('')}</select><select data-cs-priority aria-label="Prioritas tiket">${Object.entries(PRIORITY_LABELS).map(([v,l])=>`<option value="${v}" ${v===t.priority?'selected':''}>${esc(l)}</option>`).join('')}</select><button type="button" class="primary" data-cs-assign>${t.assignee?'Ambil alih':'Tangani tiket'}</button></div>`:''}</div><div class="cs-messages" data-cs-messages>${messagesMarkup(data.messages)}</div>${canReply&&t.status!=='closed'?`<form class="cs-response" data-cs-reply-form><textarea maxlength="4000" data-cs-reply placeholder="Balas sebagai Customer Service…" required></textarea><div class="cs-response-row"><small>Balasan tampil kepada pengguna sebagai Customer Service Pasar UMKM.</small><button type="submit">Kirim balasan</button></div></form>`:'<div class="cs-response"><small>Tiket ditutup atau akun ini tidak memiliki permission balasan.</small></div>'}${canManage?`<div class="cs-note-panel"><div class="cs-note-head"><strong>Catatan internal</strong><button class="cs-note-toggle" type="button" data-cs-note-toggle>Tambah catatan</button></div><div class="cs-notes" data-cs-notes>${notesMarkup(data.notes)}</div><form class="cs-note-form" data-cs-note-form hidden><textarea maxlength="4000" data-cs-note placeholder="Catatan ini tidak terlihat oleh pengguna." required></textarea><button type="submit">Simpan catatan</button></form></div>`:''}`;
}

export async function renderSupport(context){
  ensureStyle();
  const {host,permissionSet,signal}=context;
  let currentId=null;let filters={status:'all',category:'all',priority:'all',q:''};let timer=0;let busy=false;
  host.innerHTML='<div class="loading-state"><strong>Memuat Customer Support…</strong><p>Menyiapkan antrean tiket dan konteks pengguna.</p></div>';

  const shell=()=>{host.innerHTML=`<section class="cs-admin"><header class="cs-head"><div><h1>Customer Support</h1><p>Inbox privat untuk bantuan pengguna, pesanan, akun, toko, dan pengaduan.</p></div><span class="cs-live"><i></i> Support workspace</span></header><div class="cs-metrics" data-cs-metrics></div><form class="cs-filters" data-cs-filters><input type="search" maxlength="100" placeholder="Cari nama, email, order, tiket…" data-cs-q><select data-cs-status-filter><option value="all">Semua status</option>${Object.entries(STATUS_LABELS).map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join('')}</select><select data-cs-category-filter><option value="all">Semua kategori</option>${Object.entries(CATEGORY_LABELS).map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join('')}</select><select data-cs-priority-filter><option value="all">Semua prioritas</option>${Object.entries(PRIORITY_LABELS).map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join('')}</select></form><div class="cs-workspace"><aside class="cs-list"><div class="cs-list-head"><strong>Antrean tiket</strong><span data-cs-count>0 tiket</span></div><div data-cs-list></div></aside><section class="cs-detail" data-cs-detail><div class="cs-detail-empty"><div><strong>Pilih tiket Customer Service.</strong><p>Konteks pengguna dan percakapan akan tampil di sini tanpa membuka data yang tidak dibutuhkan.</p></div></div></section></div></section>`;};
  shell();

  const metricsHost=host.querySelector('[data-cs-metrics]');const listHost=host.querySelector('[data-cs-list]');const detailHost=host.querySelector('[data-cs-detail]');const countHost=host.querySelector('[data-cs-count]');

  async function loadList({silent=false}={}){
    if(busy||signal.aborted)return;busy=true;
    try{
      const data=await adminApi.supportTickets({...filters,limit:50},{signal});
      metricsHost.innerHTML=metric('Belum dibalas',data.metrics?.waiting_support)+metric('Sedang ditangani',data.metrics?.in_progress)+metric('Menunggu pengguna',data.metrics?.waiting_user)+metric('Belum dibaca',data.metrics?.unread)+metric('Selesai 7 hari',data.metrics?.resolved_7d);
      countHost.textContent=`${(data.tickets||[]).length} tiket`;
      listHost.innerHTML=(data.tickets||[]).map(t=>ticketRow(t,currentId)).join('')||'<div class="cs-detail-empty"><div><strong>Antrean kosong.</strong><p>Tidak ada tiket yang cocok dengan filter saat ini.</p></div></div>';
      if(!silent&&currentId&&!data.tickets?.some(t=>t.id===currentId)){currentId=null;detailHost.innerHTML='<div class="cs-detail-empty"><div><strong>Pilih tiket Customer Service.</strong></div></div>';}
    }catch(error){if(error?.name!=='AbortError')listHost.innerHTML=`<div class="cs-error">${esc(error.message||'Antrean support gagal dimuat.')}</div>`;}finally{busy=false;}
  }

  async function openTicket(id,{silent=false}={}){
    if(signal.aborted)return;currentId=id;
    host.querySelectorAll('[data-cs-ticket]').forEach(node=>node.setAttribute('aria-current',String(node.dataset.csTicket===id)));
    if(!silent)detailHost.innerHTML='<div class="loading-state"><strong>Memuat tiket…</strong></div>';
    try{const data=await adminApi.supportTicket(id,{signal});if(currentId!==id)return;detailHost.innerHTML=detailMarkup(data,permissionSet);bindDetail();await loadList({silent:true});}catch(error){if(error?.name!=='AbortError')detailHost.innerHTML=`<div class="cs-error">${esc(error.message||'Tiket gagal dimuat.')}</div>`;}
  }

  function bindDetail(){
    const replyForm=detailHost.querySelector('[data-cs-reply-form]');
    replyForm?.addEventListener('submit',async event=>{event.preventDefault();const input=detailHost.querySelector('[data-cs-reply]');const message=input.value.trim();if(!message||!currentId)return;const button=replyForm.querySelector('button');button.disabled=true;try{await adminApi.supportReply(currentId,message);input.value='';await openTicket(currentId,{silent:true});}catch(error){alert(error.message||'Balasan gagal dikirim.');}finally{button.disabled=false;}});
    const status=detailHost.querySelector('[data-cs-status]');const priority=detailHost.querySelector('[data-cs-priority]');
    status?.addEventListener('change',async()=>{if(!currentId)return;status.disabled=true;try{await adminApi.supportUpdate(currentId,{status:status.value});await openTicket(currentId,{silent:true});}catch(error){alert(error.message||'Status gagal diperbarui.');}finally{status.disabled=false;}});
    priority?.addEventListener('change',async()=>{if(!currentId)return;priority.disabled=true;try{await adminApi.supportUpdate(currentId,{priority:priority.value});await openTicket(currentId,{silent:true});}catch(error){alert(error.message||'Prioritas gagal diperbarui.');}finally{priority.disabled=false;}});
    detailHost.querySelector('[data-cs-assign]')?.addEventListener('click',async event=>{if(!currentId)return;event.currentTarget.disabled=true;try{await adminApi.supportUpdate(currentId,{assignment:'self',status:'in_progress'});await openTicket(currentId,{silent:true});}catch(error){alert(error.message||'Penugasan gagal.');}});
    detailHost.querySelector('[data-cs-note-toggle]')?.addEventListener('click',()=>{const form=detailHost.querySelector('[data-cs-note-form]');form.hidden=!form.hidden;if(!form.hidden)form.querySelector('textarea')?.focus();});
    const noteForm=detailHost.querySelector('[data-cs-note-form]');noteForm?.addEventListener('submit',async event=>{event.preventDefault();const input=noteForm.querySelector('[data-cs-note]');const note=input.value.trim();if(!note||!currentId)return;const button=noteForm.querySelector('button');button.disabled=true;try{await adminApi.supportNote(currentId,note);input.value='';await openTicket(currentId,{silent:true});}catch(error){alert(error.message||'Catatan gagal disimpan.');}finally{button.disabled=false;}});
  }

  listHost.addEventListener('click',event=>{const row=event.target.closest('[data-cs-ticket]');if(row)openTicket(row.dataset.csTicket);});
  const filterForm=host.querySelector('[data-cs-filters]');let debounce=0;
  const applyFilters=()=>{filters={q:filterForm.querySelector('[data-cs-q]').value.trim(),status:filterForm.querySelector('[data-cs-status-filter]').value,category:filterForm.querySelector('[data-cs-category-filter]').value,priority:filterForm.querySelector('[data-cs-priority-filter]').value};clearTimeout(debounce);debounce=setTimeout(()=>loadList(),180);};
  filterForm.addEventListener('input',applyFilters);filterForm.addEventListener('change',applyFilters);filterForm.addEventListener('submit',event=>event.preventDefault());

  const poll=()=>{clearTimeout(timer);timer=setTimeout(async()=>{if(document.visibilityState==='visible'&&!host.querySelector('textarea:focus')){await loadList({silent:true});if(currentId)await openTicket(currentId,{silent:true});}poll();},10000);};
  signal.addEventListener('abort',()=>{clearTimeout(timer);clearTimeout(debounce);},{once:true});
  await loadList();poll();
}
