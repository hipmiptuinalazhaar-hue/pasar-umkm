'use strict';

/* Pasar UMKM P4 — Commerce Chat V8 bridge.
   Chat V7 remains the single message/API owner. This module adds transactional
   context, tab-scoped drafts, and offline-safe interaction without duplicating it. */
(() => {
  if (window.PasarChatCommerceV8?.version === '8.0') return;

  const doc = document;
  const DRAFT_PREFIX = 'pasar_chat_draft_v1:';
  const MAX_DRAFT = 2000;
  let lastConversationId = '';
  let reconnectTimer = 0;

  function ensureStyle() {
    if (doc.querySelector('link[data-chat-commerce-v8-style="true"]')) return;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/chat-commerce-v8.css?v=1.0';
    link.dataset.chatCommerceV8Style = 'true';
    doc.head.appendChild(link);
  }

  function thread() {
    return doc.querySelector('.chat-v7-thread-page[data-conversation-id]');
  }

  function conversationId(scope = thread()) {
    return String(scope?.dataset?.conversationId || '').trim();
  }

  function draftKey(id) {
    return id ? `${DRAFT_PREFIX}${id}` : '';
  }

  function readDraft(id) {
    if (!id) return '';
    try { return String(sessionStorage.getItem(draftKey(id)) || '').slice(0, MAX_DRAFT); }
    catch { return ''; }
  }

  function writeDraft(id, value) {
    if (!id) return;
    try {
      const clean = String(value || '').slice(0, MAX_DRAFT);
      if (clean) sessionStorage.setItem(draftKey(id), clean);
      else sessionStorage.removeItem(draftKey(id));
    } catch {}
  }

  function clearDraft(id) {
    if (!id) return;
    try { sessionStorage.removeItem(draftKey(id)); } catch {}
  }

  function storeLabel(scope) {
    return String(scope?.querySelector('.chat-v7-topbar-copy span')?.textContent || '').trim();
  }

  function enhanceHeader(scope) {
    if (scope.querySelector('[data-chat-commerce-context]')) return;
    const header = scope.querySelector('.chat-v7-thread-head');
    if (!header) return;

    const store = storeLabel(scope);
    const hasStore = store && store.toLowerCase() !== 'pasar umkm';
    const bar = doc.createElement('div');
    bar.className = 'chat-commerce-context';
    bar.dataset.chatCommerceContext = 'true';
    bar.setAttribute('aria-label', 'Aksi perdagangan dalam percakapan');
    bar.innerHTML = `
      <div class="chat-commerce-context-copy">
        <span class="chat-commerce-kicker">Percakapan transaksi</span>
        <strong>${hasStore ? escapeText(store) : 'Pasar UMKM'}</strong>
      </div>
      <div class="chat-commerce-context-actions">
        ${hasStore ? '<button type="button" data-chat-commerce-action="store"><i class="ph ph-storefront" aria-hidden="true"></i><span>UMKM</span></button>' : ''}
        <button type="button" data-chat-commerce-action="orders"><i class="ph ph-receipt" aria-hidden="true"></i><span>Pesanan</span></button>
      </div>
    `;
    header.insertAdjacentElement('afterend', bar);
  }

  function escapeText(value) {
    const span = doc.createElement('span');
    span.textContent = String(value ?? '');
    return span.innerHTML;
  }

  function enhanceComposer(scope) {
    const form = scope.querySelector('#chatV7Composer');
    const input = scope.querySelector('#chatV7Input');
    if (!form || !input) return;

    const id = conversationId(scope);
    lastConversationId = id;

    if (input.dataset.chatCommerceDraft !== 'true') {
      input.dataset.chatCommerceDraft = 'true';
      const draft = readDraft(id);
      if (!String(input.value || '').trim() && draft) {
        input.value = draft;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    if (!scope.querySelector('[data-chat-commerce-replies]')) {
      const replies = doc.createElement('div');
      replies.className = 'chat-commerce-replies';
      replies.dataset.chatCommerceReplies = 'true';
      replies.setAttribute('aria-label', 'Balasan cepat perdagangan');
      replies.innerHTML = `
        <button type="button" data-chat-commerce-action="reply" data-copy="Halo, apakah produk ini masih tersedia?">Tanya stok</button>
        <button type="button" data-chat-commerce-action="reply" data-copy="Boleh info pilihan pengiriman dan estimasinya?">Tanya pengiriman</button>
        <button type="button" data-chat-commerce-action="reply" data-copy="Saya ingin konfirmasi pembayaran pesanan saya.">Konfirmasi bayar</button>
      `;
      form.insertAdjacentElement('beforebegin', replies);
    }

    ensureConnectionStatus(scope);
  }

  function ensureConnectionStatus(scope) {
    let status = scope.querySelector('[data-chat-commerce-network]');
    if (!status) {
      status = doc.createElement('div');
      status.className = 'chat-commerce-network';
      status.dataset.chatCommerceNetwork = 'true';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      const replies = scope.querySelector('[data-chat-commerce-replies]');
      replies?.insertAdjacentElement('beforebegin', status);
    }
    paintNetwork(status, navigator.onLine ? 'online' : 'offline');
  }

  function paintNetwork(status, state) {
    if (!status) return;
    status.dataset.state = state;
    if (state === 'offline') {
      status.hidden = false;
      status.innerHTML = '<i class="ph ph-wifi-slash" aria-hidden="true"></i><span>Offline. Pesan tetap tersimpan sebagai draft.</span>';
    } else if (state === 'reconnected') {
      status.hidden = false;
      status.innerHTML = '<i class="ph ph-check-circle" aria-hidden="true"></i><span>Koneksi kembali aktif.</span>';
    } else {
      status.hidden = true;
      status.textContent = '';
    }
  }

  function enhanceThread(scope = thread()) {
    if (!scope) return;
    enhanceHeader(scope);
    enhanceComposer(scope);
  }

  function fillQuickReply(button) {
    const scope = thread();
    const input = scope?.querySelector('#chatV7Input');
    if (!scope || !input) return;
    const copy = String(button.dataset.copy || '').trim();
    if (!copy) return;
    input.value = copy.slice(0, MAX_DRAFT);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    writeDraft(conversationId(scope), input.value);
    input.focus({ preventScroll: true });
  }

  function openOrders() {
    const chat = window.PasarChatV7;
    const commerce = window.PasarCommerce;
    if (!commerce?.openOrders) {
      window.showToast?.('Pesanan belum siap dibuka.');
      return;
    }
    chat?.leave?.();
    commerce.openOrders('buyer');
  }

  function openStoreProfile() {
    const scope = thread();
    const profile = scope?.querySelector('[data-chat-v7-action="thread-profile"]');
    profile?.click();
  }

  window.addEventListener('click', event => {
    const target = event.target?.closest?.('[data-chat-commerce-action]');
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const action = target.dataset.chatCommerceAction;
    if (action === 'reply') fillQuickReply(target);
    else if (action === 'orders') openOrders();
    else if (action === 'store') openStoreProfile();
  }, true);

  window.addEventListener('submit', event => {
    if (event.target?.id !== 'chatV7Composer') return;
    const id = conversationId();
    const input = doc.getElementById('chatV7Input');
    if (!navigator.onLine) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      writeDraft(id, input?.value || '');
      window.showToast?.('Kamu sedang offline. Pesan disimpan sebagai draft.');
      return;
    }
    window.setTimeout(() => {
      if (!String(doc.getElementById('chatV7Input')?.value || '').trim()) clearDraft(id);
    }, 600);
  }, true);

  doc.addEventListener('input', event => {
    if (event.target?.id !== 'chatV7Input') return;
    writeDraft(conversationId(), event.target.value);
  }, true);

  window.addEventListener('offline', () => {
    paintNetwork(thread()?.querySelector('[data-chat-commerce-network]'), 'offline');
  }, { passive: true });

  window.addEventListener('online', () => {
    const status = thread()?.querySelector('[data-chat-commerce-network]');
    paintNetwork(status, 'reconnected');
    window.clearTimeout(reconnectTimer);
    reconnectTimer = window.setTimeout(() => paintNetwork(status, 'online'), 2200);
    if (lastConversationId) window.PasarChatV7?.refreshList?.();
  }, { passive: true });

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('.chat-v7-thread-page') || node.querySelector?.('.chat-v7-thread-page')) {
          queueMicrotask(() => enhanceThread());
          return;
        }
      }
    }
  });
  observer.observe(doc.body, { childList: true, subtree: true });

  ensureStyle();
  enhanceThread();

  window.PasarChatCommerceV8 = Object.freeze({
    version: '8.0',
    enhance: enhanceThread,
    diagnostics: () => ({
      conversationId: conversationId(),
      hasDraft: Boolean(readDraft(conversationId())),
      online: navigator.onLine,
      singleMessageOwner: window.__PUMKM_CHAT_RENDER_OWNER === 'v7'
    })
  });
})();