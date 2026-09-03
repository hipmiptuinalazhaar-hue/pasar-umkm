'use strict';

/* =========================================================
   PASAR UMKM - CHAT EXPERIENCE V7
   Single controller / store / renderer / API owner.
   ========================================================= */

(() => {
  if (window.PasarChatV7?.version === '7.0') return;

  const state = {
    view: 'closed',
    conversations: [],
    activeConversationId: '',
    activeConversation: null,
    messages: [],
    currentUserId: '',
    listLoading: false,
    threadLoading: false,
    syncTimer: null,
    syncBusy: false,
    lastThreadSignature: '',
    lastListSignature: '',
    uploadBusy: false,
    recorder: null,
    recordStream: null,
    recordChunks: [],
    recordStartedAt: 0,
    recordTimer: null,
    pressTimer: null,
    pressRow: null,
    pressX: 0,
    pressY: 0,
    suppressClickUntil: 0,
    viewportTimer: null
  };

  function esc(value) {
    if (typeof escapeHTML === 'function') {
      return escapeHTML(String(value ?? ''));
    }

    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toast(message) {
    if (typeof showToast === 'function') showToast(message);
  }

  function requireLogin(message = 'Masuk terlebih dahulu untuk membuka pesan.') {
    if (typeof STATE !== 'undefined' && STATE.user) return true;
    toast(message);
    if (typeof openLogin === 'function') openLogin();
    return false;
  }

  async function requestJSON(path, options = {}) {
    const headers = {
      Accept: 'application/json',
      ...(options.headers || {})
    };

    const config = {
      method: options.method || 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers
    };

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(options.body);
    }

    const response = await fetch(path, config);
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok !== true) {
      const error = new Error(
        data.error || data.message || 'Aksi chat belum dapat diproses.'
      );
      error.status = response.status;
      throw error;
    }

    return data;
  }

  function rootFeed() {
    return typeof DOM !== 'undefined'
      ? DOM.feed
      : document.getElementById('feed');
  }

  function syncViewport() {
    const viewport = window.visualViewport;
    const height = Math.max(
      320,
      Math.round(viewport?.height || window.innerHeight || 720)
    );

    document.documentElement.style.setProperty(
      '--chat7-height',
      `${height}px`
    );
  }

  function scheduleViewportSync() {
    clearTimeout(state.viewportTimer);
    state.viewportTimer = setTimeout(syncViewport, 30);
  }

  function stopSync() {
    clearTimeout(state.syncTimer);
    state.syncTimer = null;
    state.syncBusy = false;
  }

  function prepareView() {
    stopSync();

    if (typeof closeBottomSheet === 'function') closeBottomSheet();
    if (typeof closeSideMenu === 'function') closeSideMenu();

    if (typeof STATE !== 'undefined') {
      STATE.activeNav = 'home';
    }

    if (typeof updateNavigation === 'function') updateNavigation();

    document.querySelector('.app')?.classList.remove('account-profile-active');
    document.body.classList.add('chat-v7-body');

    if (typeof DOM !== 'undefined') {
      if (DOM.storiesSection) DOM.storiesSection.hidden = true;
      if (DOM.homeDiscovery) DOM.homeDiscovery.hidden = true;
    }

    syncViewport();
  }

  function leaveChat() {
    stopSync();
    stopRecording(true);
    closeAttachPanel();
    closeMediaViewer();
    state.view = 'closed';
    state.activeConversationId = '';
    state.activeConversation = null;
    state.messages = [];
    state.currentUserId = '';
    state.lastThreadSignature = '';
    document.body.classList.remove('chat-v7-body');
    document.documentElement.style.removeProperty('--chat7-height');
  }

  function goHome() {
    leaveChat();
    if (typeof navigate === 'function') {
      navigate('home');
      return;
    }

    if (typeof renderApplication === 'function') {
      if (typeof STATE !== 'undefined') STATE.activeNav = 'home';
      renderApplication();
    }
  }

  function formatClock(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  }

  function formatRelative(value) {
    if (!value) return '';
    if (typeof formatRelativeTime === 'function') {
      try {
        return formatRelativeTime(value);
      } catch {
        // fallback below
      }
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const diff = Date.now() - date.getTime();
    if (diff < 60_000) return 'baru saja';
    if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} mnt`;
    if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))} jam`;
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short'
    }).format(date);
  }

  function dayLabel(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const key = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (key(date) === key(today)) return 'Hari ini';
    if (key(date) === key(yesterday)) return 'Kemarin';

    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric'
    }).format(date);
  }

  function avatar(url, name) {
    const clean = String(url || '').trim();
    return `
      <span class="chat-v7-avatar">
        ${clean
          ? `<img src="${esc(clean)}" alt="${esc(name || 'Foto profil')}" loading="lazy" decoding="async">`
          : '<i class="ph ph-user" aria-hidden="true"></i>'}
      </span>
    `;
  }

  function loadingPage(title = 'Pesan', copy = 'Menyiapkan percakapan...') {
    return `
      <section class="chat-v7-page">
        <header class="chat-v7-topbar">
          <button type="button" class="chat-v7-icon-button" data-chat-v7-action="home" aria-label="Kembali">
            <i class="ph ph-arrow-left" aria-hidden="true"></i>
          </button>
          <div class="chat-v7-topbar-main"><strong class="chat-v7-title">${esc(title)}</strong></div>
          <span></span>
        </header>
        <div class="chat-v7-loading">
          <span class="chat-v7-spinner" aria-hidden="true"></span>
          <strong>${esc(copy)}</strong>
        </div>
      </section>
    `;
  }

  function conversationSignature(conversations) {
    return (conversations || [])
      .map(item => [
        item.id || '',
        item.last_message_at || item.updated_at || '',
        item.last_message || '',
        item.unread_count || 0,
        item.viewer_pinned ? 1 : 0,
        item.viewer_archived ? 1 : 0
      ].join(':'))
      .join('|');
  }

  function conversationRow(item) {
    const id = String(item.id || '');
    const unread = Math.max(0, Number(item.unread_count || 0));
    const pinned = Boolean(item.viewer_pinned);
    const archived = Boolean(item.viewer_archived);
    const name = item.other_user_name || 'Pengguna';

    return `
      <div
        class="chat-v7-conversation-wrap"
        data-chat-v7-row
        data-conversation-id="${esc(id)}"
        data-search-text="${esc(`${name} ${item.last_message || ''}`.toLowerCase())}"
        data-unread="${unread > 0 ? 'true' : 'false'}"
        data-pinned="${pinned ? 'true' : 'false'}"
        data-archived="${archived ? 'true' : 'false'}"
      >
        <div class="chat-v7-conversation" data-unread="${unread > 0 ? 'true' : 'false'}">
          ${avatar(item.other_user_avatar_url, name)}

          <div class="chat-v7-conversation-main">
            <strong>
              <span>${esc(name)}</span>
              ${pinned ? '<i class="ph-fill ph-push-pin chat-v7-pin" aria-label="Disematkan"></i>' : ''}
            </strong>
            <span class="chat-v7-preview">${esc(item.last_message || 'Mulai percakapan')}</span>
          </div>

          <div class="chat-v7-conversation-meta">
            <span class="chat-v7-time">${esc(formatRelative(item.last_message_at || item.updated_at))}</span>
            ${unread ? `<span class="chat-v7-unread">${unread > 99 ? '99+' : unread}</span>` : ''}
          </div>

          <button
            type="button"
            class="chat-v7-row-menu"
            data-chat-v7-action="conversation-menu"
            data-conversation-id="${esc(id)}"
            aria-label="Opsi percakapan dengan ${esc(name)}"
          >
            <i class="ph ph-dots-three-vertical" aria-hidden="true"></i>
          </button>
        </div>

        <button
          type="button"
          class="chat-v7-conversation-hit"
          data-chat-v7-action="open-conversation"
          data-conversation-id="${esc(id)}"
          aria-label="Buka percakapan dengan ${esc(name)}"
        ></button>
      </div>
    `;
  }

  function renderConversationList() {
    const root = rootFeed();
    if (!root) return;

    const active = state.conversations.filter(item => !item.viewer_archived);
    const archived = state.conversations.filter(item => item.viewer_archived);

    root.innerHTML = `
      <section class="chat-v7-page chat-v7-list-page" data-chat-v7-page="list">
        <header class="chat-v7-topbar chat-v7-list-head">
          <button type="button" class="chat-v7-icon-button" data-chat-v7-action="home" aria-label="Kembali">
            <i class="ph ph-arrow-left" aria-hidden="true"></i>
          </button>
          <div class="chat-v7-topbar-main"><strong class="chat-v7-title">Pesan</strong></div>
          <button type="button" class="chat-v7-icon-button" data-chat-v7-action="refresh-list" aria-label="Muat ulang pesan">
            <i class="ph ph-arrow-clockwise" aria-hidden="true"></i>
          </button>
        </header>

        <div class="chat-v7-search-wrap">
          <label class="chat-v7-search">
            <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
            <input id="chatV7Search" type="search" inputmode="search" autocomplete="off" placeholder="Cari percakapan..." aria-label="Cari percakapan">
            <button type="button" class="chat-v7-search-clear" data-chat-v7-action="clear-search" aria-label="Hapus pencarian" hidden>
              <i class="ph-fill ph-x-circle" aria-hidden="true"></i>
            </button>
          </label>
        </div>

        <div class="chat-v7-list-scroll" data-chat-v7-list-scroll>
          ${active.length ? `
            <div class="chat-v7-section-label"><span>Percakapan</span><strong>${active.length}</strong></div>
            <div data-chat-v7-active-list>${active.map(conversationRow).join('')}</div>
          ` : ''}

          ${archived.length ? `
            <div class="chat-v7-section-label"><span>Diarsipkan</span><strong>${archived.length}</strong></div>
            <div data-chat-v7-archived-list>${archived.map(conversationRow).join('')}</div>
          ` : ''}

          ${!state.conversations.length ? `
            <div class="chat-v7-empty">
              <span class="chat-v7-empty-icon"><i class="ph ph-chat-circle-dots" aria-hidden="true"></i></span>
              <strong>Belum ada percakapan</strong>
              <p>Buka profil pengguna atau penjual lalu pilih Kirim Pesan untuk memulai obrolan.</p>
            </div>
          ` : ''}
        </div>
      </section>
    `;

    requestAnimationFrame(() => {
      root.querySelector('#chatV7Search')?.focus({ preventScroll: true });
    });
  }

  async function loadConversationList(options = {}) {
    if (!requireLogin()) return;
    prepareView();
    state.view = 'list';

    const root = rootFeed();
    if (!root) return;

    if (!options.silent) {
      root.innerHTML = loadingPage('Pesan', 'Memuat percakapan...');
    }

    if (state.listLoading) return;
    state.listLoading = true;

    try {
      const data = await requestJSON('/api/social/conversations');
      const conversations = Array.isArray(data.conversations) ? data.conversations : [];
      conversations.sort((a, b) => {
        const pinDiff = Number(Boolean(b.viewer_pinned)) - Number(Boolean(a.viewer_pinned));
        if (pinDiff) return pinDiff;
        return new Date(b.last_message_at || b.updated_at || 0).getTime()
          - new Date(a.last_message_at || a.updated_at || 0).getTime();
      });

      state.conversations = conversations;
      state.lastListSignature = conversationSignature(conversations);
      renderConversationList();
      window.refreshSocialUnreadBadge?.();
    } catch (error) {
      console.error('[Pasar UMKM] Chat V7 list error:', error);
      root.innerHTML = `
        <section class="chat-v7-page">
          <header class="chat-v7-topbar">
            <button type="button" class="chat-v7-icon-button" data-chat-v7-action="home" aria-label="Kembali"><i class="ph ph-arrow-left"></i></button>
            <div class="chat-v7-topbar-main"><strong class="chat-v7-title">Pesan</strong></div><span></span>
          </header>
          <div class="chat-v7-empty">
            <span class="chat-v7-empty-icon"><i class="ph ph-warning-circle"></i></span>
            <strong>Pesan belum dapat dimuat</strong>
            <p>${esc(error.message || 'Coba beberapa saat lagi.')}</p>
            <button type="button" class="btn-primary" data-chat-v7-action="refresh-list">Coba lagi</button>
          </div>
        </section>`;
    } finally {
      state.listLoading = false;
    }
  }

  function messageSignature(messages) {
    return (messages || []).map(message => [
      message.id || '',
      message.message_type || 'text',
      message.message || '',
      message.media_url || '',
      message.media_duration_seconds || '',
      message.latitude || '',
      message.longitude || '',
      message.is_read ? 1 : 0
    ].join(':')).join('|');
  }

  function messageType(message) {
    return String(message?.message_type || 'text').toLowerCase();
  }

  function durationLabel(value) {
    const seconds = Math.max(0, Math.round(Number(value) || 0));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function messageContent(message) {
    const type = messageType(message);

    if (type === 'image' && message.media_url) {
      return `
        <button type="button" class="chat-v7-photo" data-chat-v7-action="open-media" data-media-url="${esc(message.media_url)}" aria-label="Buka foto">
          <img src="${esc(message.media_url)}" alt="Foto chat" loading="lazy" decoding="async">
        </button>
      `;
    }

    if (type === 'audio' && message.media_url) {
      return `
        <div class="chat-v7-voice" data-chat-v7-voice>
          <button type="button" class="chat-v7-voice-play" data-chat-v7-action="voice-play" aria-label="Putar voice note">
            <i class="ph-fill ph-play" aria-hidden="true"></i>
          </button>
          <div class="chat-v7-voice-main">
            <input class="chat-v7-voice-range" type="range" min="0" max="1000" value="0" step="1" aria-label="Posisi voice note">
            <div class="chat-v7-voice-meta">
              <span data-chat-v7-voice-time>${esc(durationLabel(message.media_duration_seconds))}</span>
              <i class="ph-fill ph-microphone" aria-hidden="true"></i>
            </div>
          </div>
          <audio preload="metadata" src="${esc(message.media_url)}"></audio>
        </div>
      `;
    }

    if (
      type === 'location' &&
      Number.isFinite(Number(message.latitude)) &&
      Number.isFinite(Number(message.longitude))
    ) {
      const lat = Number(message.latitude).toFixed(6);
      const lng = Number(message.longitude).toFixed(6);
      const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
      return `
        <a class="chat-v7-location" href="${esc(mapUrl)}" target="_blank" rel="noopener noreferrer">
          <span class="chat-v7-location-map"><i class="ph-fill ph-map-pin" aria-hidden="true"></i></span>
          <span class="chat-v7-location-copy"><strong>Lokasi dibagikan</strong><span>${esc(lat)}, ${esc(lng)}</span></span>
        </a>
      `;
    }

    return `<p class="chat-v7-text">${esc(message.message || '')}</p>`;
  }

  function messageRow(message) {
    const mine = String(message.sender_id || '') === String(state.currentUserId || '');
    const type = messageType(message);
    const rich = type !== 'text';

    return `
      <div
        class="chat-v7-message ${mine ? 'mine' : 'theirs'} ${rich ? 'is-rich' : ''}"
        data-chat-v7-message
        data-message-id="${esc(message.id || '')}"
        data-message-mine="${mine ? 'true' : 'false'}"
      >
        <div class="chat-v7-bubble">
          ${messageContent(message)}
          <div class="chat-v7-message-foot">
            <span>${esc(formatClock(message.created_at))}</span>
            ${mine ? `<i class="ph ${message.is_read ? 'ph-checks is-read' : 'ph-check'}" aria-label="${message.is_read ? 'Dibaca' : 'Terkirim'}"></i>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function messagesMarkup(messages) {
    if (!messages.length) {
      return `
        <div class="chat-v7-empty">
          <span class="chat-v7-empty-icon"><i class="ph ph-chat-circle"></i></span>
          <strong>Mulai percakapan</strong>
          <p>Kirim pesan pertama untuk memulai obrolan.</p>
        </div>
      `;
    }

    let lastDay = '';
    const html = [];

    for (const message of messages) {
      const day = dayLabel(message.created_at);
      if (day !== lastDay) {
        html.push(`<div class="chat-v7-day">${esc(day)}</div>`);
        lastDay = day;
      }
      html.push(messageRow(message));
    }

    return html.join('');
  }

  function renderThread(options = {}) {
    const root = rootFeed();
    const conversation = state.activeConversation;
    if (!root || !conversation) return;

    const existing = root.querySelector('[data-chat-v7-page="thread"]');
    const currentSignature = messageSignature(state.messages);

    if (existing && options.messagesOnly) {
      const container = existing.querySelector('[data-chat-v7-messages]');
      if (container && currentSignature !== state.lastThreadSignature) {
        const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
        container.innerHTML = messagesMarkup(state.messages);
        bindVoicePlayers(container);
        if (nearBottom || options.forceBottom) {
          requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
          });
        }
      }
      state.lastThreadSignature = currentSignature;
      return;
    }

    const name = conversation.other_user_name || 'Pengguna';
    const store = conversation.other_store_name || 'Pasar UMKM';

    root.innerHTML = `
      <section class="chat-v7-page chat-v7-thread-page" data-chat-v7-page="thread" data-conversation-id="${esc(state.activeConversationId)}">
        <header class="chat-v7-topbar chat-v7-thread-head">
          <button type="button" class="chat-v7-icon-button" data-chat-v7-action="thread-back" aria-label="Kembali ke daftar pesan">
            <i class="ph ph-arrow-left" aria-hidden="true"></i>
          </button>

          <button type="button" class="chat-v7-thread-profile" data-chat-v7-action="thread-profile" data-user-id="${esc(conversation.other_user_id || '')}">
            ${avatar(conversation.other_user_avatar_url, name)}
            <span class="chat-v7-topbar-copy"><strong>${esc(name)}</strong><span>${esc(store)}</span></span>
          </button>

          <button type="button" class="chat-v7-icon-button" data-chat-v7-action="conversation-menu" data-conversation-id="${esc(state.activeConversationId)}" aria-label="Opsi percakapan">
            <i class="ph ph-dots-three-vertical" aria-hidden="true"></i>
          </button>
        </header>

        <div class="chat-v7-thread-messages" data-chat-v7-messages aria-live="polite">
          ${messagesMarkup(state.messages)}
        </div>

        <div class="chat-v7-recording-bar" data-chat-v7-recording-bar>
          <div class="chat-v7-recording-copy"><span class="chat-v7-record-dot"></span><span>Merekam voice note</span><span class="chat-v7-record-time" data-chat-v7-record-time>00:00</span></div>
          <button type="button" class="chat-v7-icon-button" data-chat-v7-action="voice-cancel" aria-label="Batalkan voice note"><i class="ph ph-x"></i></button>
        </div>

        <form class="chat-v7-composer" id="chatV7Composer" autocomplete="off">
          <button type="button" class="chat-v7-composer-button" data-chat-v7-action="attach" aria-label="Lampirkan"><i class="ph ph-paperclip"></i></button>
          <div class="chat-v7-input-shell">
            <textarea class="chat-v7-input" id="chatV7Input" rows="1" maxlength="2000" placeholder="Tulis pesan..." aria-label="Tulis pesan"></textarea>
          </div>
          <button type="button" class="chat-v7-composer-button" data-chat-v7-action="voice" aria-label="Voice note"><i class="ph-fill ph-microphone"></i></button>
          <button type="submit" class="chat-v7-composer-button primary" id="chatV7Send" aria-label="Kirim pesan" hidden><i class="ph-fill ph-paper-plane-tilt"></i></button>
          <input type="file" class="chat-v7-hidden-input" accept="image/jpeg,image/png,image/webp" data-chat-v7-file="gallery">
          <input type="file" class="chat-v7-hidden-input" accept="image/jpeg,image/png,image/webp" capture="environment" data-chat-v7-file="camera">
        </form>
      </section>
    `;

    state.lastThreadSignature = currentSignature;
    bindVoicePlayers(root);
    updateComposerMode();

    requestAnimationFrame(() => {
      const container = root.querySelector('[data-chat-v7-messages]');
      if (container) container.scrollTop = container.scrollHeight;
    });
  }

  async function fetchThread(conversationId) {
    const base = await requestJSON(
      `/api/social/conversations/${encodeURIComponent(conversationId)}/messages`
    );

    const rich = await requestJSON(
      `/api/chat/conversations/${encodeURIComponent(conversationId)}/rich-meta`
    ).catch(() => ({ ok: true, current_user_id: '', messages: base.messages || [] }));

    state.activeConversation = base.conversation;
    state.currentUserId = String(
      rich.current_user_id || (typeof STATE !== 'undefined' ? STATE.user?.id : '') || ''
    );
    state.messages = Array.isArray(rich.messages)
      ? rich.messages
      : (Array.isArray(base.messages) ? base.messages : []);
  }

  async function markRead(conversationId) {
    try {
      await requestJSON(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/mark-read`,
        { method: 'POST' }
      );
      window.refreshSocialUnreadBadge?.();
    } catch (error) {
      console.error('[Pasar UMKM] Chat V7 mark read error:', error);
    }
  }

  async function openConversation(conversationId) {
    if (!requireLogin()) return;
    const id = String(conversationId || '').trim();
    if (!id) return;

    prepareView();
    state.view = 'thread';
    state.activeConversationId = id;
    state.activeConversation = null;
    state.messages = [];
    state.lastThreadSignature = '';

    const root = rootFeed();
    if (!root) return;
    root.innerHTML = loadingPage('Percakapan', 'Memuat pesan...');

    if (state.threadLoading) return;
    state.threadLoading = true;

    try {
      await fetchThread(id);
      renderThread({ forceBottom: true });
      markRead(id);
      scheduleThreadSync(2500);
    } catch (error) {
      console.error('[Pasar UMKM] Chat V7 thread error:', error);
      toast(error.message || 'Percakapan belum dapat dibuka.');
      loadConversationList();
    } finally {
      state.threadLoading = false;
    }
  }

  async function openWithUser(userId) {
    if (!requireLogin()) return;
    const id = String(userId || '').trim();
    if (!id) return;

    prepareView();
    const root = rootFeed();
    if (root) root.innerHTML = loadingPage('Pesan', 'Menyiapkan percakapan...');

    try {
      const data = await requestJSON('/api/social/conversations', {
        method: 'POST',
        body: { target_user_id: id }
      });

      if (!data.conversation?.id) {
        throw new Error('Percakapan belum tersedia.');
      }

      await openConversation(data.conversation.id);
    } catch (error) {
      console.error('[Pasar UMKM] Chat V7 create conversation error:', error);
      toast(error.message || 'Percakapan belum dapat dibuka.');
      goHome();
    }
  }

  async function syncThread() {
    if (
      state.syncBusy ||
      state.view !== 'thread' ||
      !state.activeConversationId ||
      document.hidden
    ) {
      scheduleThreadSync(2500);
      return;
    }

    state.syncBusy = true;

    try {
      const data = await requestJSON(
        `/api/chat/conversations/${encodeURIComponent(state.activeConversationId)}/rich-meta`
      );

      state.currentUserId = String(data.current_user_id || state.currentUserId || '');
      const next = Array.isArray(data.messages) ? data.messages : [];
      const nextSignature = messageSignature(next);

      if (nextSignature !== state.lastThreadSignature) {
        state.messages = next;
        renderThread({ messagesOnly: true });
      }

      markRead(state.activeConversationId);
    } catch (error) {
      console.error('[Pasar UMKM] Chat V7 sync error:', error);
    } finally {
      state.syncBusy = false;
      scheduleThreadSync(2500);
    }
  }

  function scheduleThreadSync(delay = 2500) {
    clearTimeout(state.syncTimer);
    if (state.view !== 'thread') return;
    state.syncTimer = setTimeout(syncThread, delay);
  }

  async function sendText() {
    if (state.view !== 'thread' || !state.activeConversationId) return;
    const input = document.getElementById('chatV7Input');
    const button = document.getElementById('chatV7Send');
    const message = String(input?.value || '').trim();
    if (!message) return;

    if (button) button.disabled = true;

    try {
      await requestJSON(
        `/api/social/conversations/${encodeURIComponent(state.activeConversationId)}/messages`,
        { method: 'POST', body: { message } }
      );

      if (input) {
        input.value = '';
        input.style.height = '';
      }
      updateComposerMode();
      await syncThread();
    } catch (error) {
      toast(error.message || 'Pesan belum dapat dikirim.');
    } finally {
      if (button) button.disabled = false;
    }
  }

  function updateComposerMode() {
    const input = document.getElementById('chatV7Input');
    const form = document.getElementById('chatV7Composer');
    if (!input || !form) return;

    const hasText = String(input.value || '').trim().length > 0;
    const voice = form.querySelector('[data-chat-v7-action="voice"]');
    const send = form.querySelector('#chatV7Send');
    if (voice) voice.hidden = hasText;
    if (send) send.hidden = !hasText;
  }

  function closeAttachPanel() {
    document.querySelector('.chat-v7-attach-panel')?.remove();
  }

  function openAttachPanel() {
    closeAttachPanel();
    if (state.view !== 'thread') return;

    const panel = document.createElement('div');
    panel.className = 'chat-v7-attach-panel';
    panel.innerHTML = `
      <button type="button" class="chat-v7-attach-option" data-chat-v7-action="gallery"><span class="chat-v7-attach-icon"><i class="ph-fill ph-images"></i></span><span>Galeri</span></button>
      <button type="button" class="chat-v7-attach-option" data-chat-v7-action="camera"><span class="chat-v7-attach-icon"><i class="ph-fill ph-camera"></i></span><span>Kamera</span></button>
      <button type="button" class="chat-v7-attach-option" data-chat-v7-action="location"><span class="chat-v7-attach-icon"><i class="ph-fill ph-map-pin"></i></span><span>Lokasi</span></button>
    `;
    document.body.appendChild(panel);
  }

  function blobFromCanvas(canvas, type, quality) {
    return new Promise(resolve => canvas.toBlob(resolve, type, quality));
  }

  async function compressImage(file) {
    if (!(file instanceof File) || !String(file.type || '').startsWith('image/')) {
      return file;
    }

    let bitmap = null;
    let objectUrl = '';

    try {
      if ('createImageBitmap' in window) {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      } else {
        objectUrl = URL.createObjectURL(file);
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = objectUrl;
        });
        bitmap = img;
      }

      const sourceWidth = Number(bitmap.width || bitmap.naturalWidth || 0);
      const sourceHeight = Number(bitmap.height || bitmap.naturalHeight || 0);
      if (!sourceWidth || !sourceHeight) return file;

      const maxSide = 1440;
      const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
      if (scale === 1 && file.size <= 900 * 1024) return file;

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return file;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      let blob = await blobFromCanvas(canvas, 'image/webp', .78);
      let extension = 'webp';
      if (!blob?.size) {
        blob = await blobFromCanvas(canvas, 'image/jpeg', .8);
        extension = 'jpg';
      }
      if (!blob?.size || blob.size >= file.size) return file;

      const base = String(file.name || 'foto')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9_-]+/gi, '-')
        .slice(0, 70) || 'foto';

      return new File([blob], `${base}-chat.${extension}`, {
        type: blob.type || (extension === 'webp' ? 'image/webp' : 'image/jpeg')
      });
    } catch (error) {
      console.warn('[Pasar UMKM] Chat V7 image compression fallback:', error);
      return file;
    } finally {
      if (typeof bitmap?.close === 'function') bitmap.close();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  async function uploadMedia(file, kind) {
    if (state.uploadBusy) throw new Error('Pengiriman media sebelumnya masih berjalan.');
    if (!state.activeConversationId) throw new Error('Percakapan belum tersedia.');
    state.uploadBusy = true;

    try {
      const form = new FormData();
      form.append('file', file, file.name || (kind === 'audio' ? 'voice.webm' : 'chat.jpg'));
      form.append('kind', kind);
      form.append('conversation_id', state.activeConversationId);

      const response = await fetch('/api/chat/media/upload', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        body: form
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.ok !== true || !data.media?.url) {
        throw new Error(data.error || 'Media gagal diunggah.');
      }

      return data.media;
    } finally {
      state.uploadBusy = false;
    }
  }

  async function cleanupMedia(url) {
    if (!url || !state.activeConversationId) return;
    try {
      await requestJSON('/api/chat/media/cleanup', {
        method: 'POST',
        body: {
          conversation_id: state.activeConversationId,
          media_url: url
        }
      });
    } catch (error) {
      if (error?.status !== 409) {
        console.error('[Pasar UMKM] Chat V7 media cleanup error:', error);
      }
    }
  }

  async function sendRich(payload) {
    const data = await requestJSON(
      `/api/chat/conversations/${encodeURIComponent(state.activeConversationId)}/rich-message`,
      { method: 'POST', body: payload }
    );
    scheduleThreadSync(30);
    return data.message || null;
  }

  async function sendImage(file) {
    if (!file || state.view !== 'thread') return;
    let media = null;

    try {
      toast('Menyiapkan foto...');
      const optimized = await compressImage(file);
      toast('Mengirim foto...');
      media = await uploadMedia(optimized, 'image');
      await sendRich({
        type: 'image',
        media_url: media.url,
        media_name: media.original_filename || optimized.name || 'Foto'
      });
      await syncThread();
      toast('Foto terkirim.');
    } catch (error) {
      if (media?.url) await cleanupMedia(media.url);
      console.error('[Pasar UMKM] Chat V7 image error:', error);
      toast(error.message || 'Foto belum dapat dikirim.');
    }
  }

  async function shareLocation() {
    closeAttachPanel();
    if (!navigator.geolocation) {
      toast('Perangkat ini tidak mendukung lokasi.');
      return;
    }

    toast('Mengambil lokasi...');
    navigator.geolocation.getCurrentPosition(
      async position => {
        try {
          await sendRich({
            type: 'location',
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
          await syncThread();
          toast('Lokasi terkirim.');
        } catch (error) {
          toast(error.message || 'Lokasi belum dapat dikirim.');
        }
      },
      error => {
        console.error('[Pasar UMKM] Chat V7 geolocation error:', error);
        toast('Izin lokasi diperlukan untuk membagikan lokasi.');
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000
      }
    );
  }

  function supportedRecorder(stream) {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ];

    for (const type of candidates) {
      try {
        if (MediaRecorder.isTypeSupported?.(type)) {
          return new MediaRecorder(stream, { mimeType: type });
        }
      } catch {
        // try next
      }
    }

    return new MediaRecorder(stream);
  }

  function updateRecordUI() {
    const page = document.querySelector('.chat-v7-thread-page');
    if (!page || !state.recordStartedAt) return;
    const seconds = Math.max(0, Math.floor((Date.now() - state.recordStartedAt) / 1000));
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    const label = page.querySelector('[data-chat-v7-record-time]');
    if (label) label.textContent = `${mm}:${ss}`;
  }

  function stopTracks() {
    for (const track of state.recordStream?.getTracks?.() || []) {
      try { track.stop(); } catch { /* noop */ }
    }
    state.recordStream = null;
  }

  function stopRecording(cancel = false) {
    if (!state.recorder) return;
    state.recorder.datasetCancel = cancel ? 'true' : 'false';
    if (state.recorder.state === 'recording') {
      try { state.recorder.requestData?.(); } catch { /* noop */ }
      state.recorder.stop();
    }
  }

  async function toggleVoice() {
    if (state.recorder?.state === 'recording') {
      stopRecording(false);
      return;
    }

    if (!window.isSecureContext) {
      toast('Voice note membutuhkan koneksi HTTPS.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast('Browser ini belum mendukung voice note.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      });

      const recorder = supportedRecorder(stream);
      state.recordStream = stream;
      state.recorder = recorder;
      state.recordChunks = [];
      state.recordStartedAt = Date.now();

      recorder.addEventListener('dataavailable', event => {
        if (event.data?.size) state.recordChunks.push(event.data);
      });

      recorder.addEventListener('stop', async () => {
        const canceled = recorder.datasetCancel === 'true';
        const duration = Math.max(1, Math.round((Date.now() - state.recordStartedAt) / 1000));
        clearInterval(state.recordTimer);
        state.recordTimer = null;
        stopTracks();
        document.querySelector('.chat-v7-thread-page')?.classList.remove('is-recording');

        const type = String(recorder.mimeType || state.recordChunks[0]?.type || 'audio/webm').split(';')[0];
        const blob = new Blob(state.recordChunks, { type });
        state.recordChunks = [];
        state.recorder = null;
        state.recordStartedAt = 0;

        if (canceled) {
          toast('Voice note dibatalkan.');
          return;
        }

        if (blob.size < 128) {
          toast('Voice note terlalu pendek.');
          return;
        }

        let extension = 'webm';
        if (type.includes('mp4')) extension = 'm4a';
        else if (type.includes('ogg')) extension = 'ogg';

        let media = null;
        try {
          toast('Mengirim voice note...');
          const file = new File([blob], `voice-${Date.now()}.${extension}`, { type });
          media = await uploadMedia(file, 'audio');
          await sendRich({
            type: 'audio',
            media_url: media.url,
            media_name: media.original_filename || file.name,
            duration_seconds: duration
          });
          await syncThread();
          toast('Voice note terkirim.');
        } catch (error) {
          if (media?.url) await cleanupMedia(media.url);
          toast(error.message || 'Voice note belum dapat dikirim.');
        }
      }, { once: true });

      recorder.start(250);
      document.querySelector('.chat-v7-thread-page')?.classList.add('is-recording');
      updateRecordUI();
      state.recordTimer = window.setInterval(updateRecordUI, 500);
    } catch (error) {
      console.error('[Pasar UMKM] Chat V7 recorder error:', error);
      stopTracks();
      state.recorder = null;
      document.querySelector('.chat-v7-thread-page')?.classList.remove('is-recording');

      if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
        toast('Izinkan mikrofon untuk mengirim voice note.');
      } else {
        toast(error.message || 'Voice note belum dapat dimulai.');
      }
    }
  }

  function bindVoicePlayers(scope = document) {
    scope.querySelectorAll('[data-chat-v7-voice]').forEach(wrapper => {
      if (wrapper.dataset.bound === 'true') return;
      wrapper.dataset.bound = 'true';

      const audio = wrapper.querySelector('audio');
      const play = wrapper.querySelector('[data-chat-v7-action="voice-play"]');
      const range = wrapper.querySelector('.chat-v7-voice-range');
      const label = wrapper.querySelector('[data-chat-v7-voice-time]');
      if (!audio || !play || !range || !label) return;

      const total = () => Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : 0;

      const paint = () => {
        const duration = total();
        const current = Math.max(0, Number(audio.currentTime || 0));
        range.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : '0';
        label.textContent = durationLabel(audio.paused ? duration : current);
        play.innerHTML = audio.paused
          ? '<i class="ph-fill ph-play" aria-hidden="true"></i>'
          : '<i class="ph-fill ph-pause" aria-hidden="true"></i>';
      };

      play.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        document.querySelectorAll('[data-chat-v7-voice] audio').forEach(other => {
          if (other !== audio && !other.paused) other.pause();
        });
        if (audio.paused) audio.play().catch(() => null);
        else audio.pause();
        paint();
      });

      range.addEventListener('input', () => {
        const duration = total();
        if (!duration) return;
        audio.currentTime = (Number(range.value || 0) / 1000) * duration;
        paint();
      });

      ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended']
        .forEach(type => audio.addEventListener(type, paint));
      paint();
    });
  }

  function openMediaViewer(url) {
    const clean = String(url || '').trim();
    if (!clean) return;
    closeMediaViewer();

    const viewer = document.createElement('div');
    viewer.className = 'chat-v7-media-viewer';
    viewer.innerHTML = `
      <div class="chat-v7-media-head">
        <button type="button" class="chat-v7-media-close" data-chat-v7-action="close-media" aria-label="Tutup foto"><i class="ph ph-x"></i></button>
      </div>
      <div class="chat-v7-media-stage"><img src="${esc(clean)}" alt="Foto chat"></div>
    `;
    document.body.appendChild(viewer);
  }

  function closeMediaViewer() {
    document.querySelector('.chat-v7-media-viewer')?.remove();
  }

  function openConversationMenu(conversationId) {
    const item = state.conversations.find(row => String(row.id || '') === String(conversationId || ''));
    const pinned = Boolean(item?.viewer_pinned);
    const archived = Boolean(item?.viewer_archived);
    const name = item?.other_user_name || state.activeConversation?.other_user_name || 'Percakapan';

    if (typeof openBottomSheet !== 'function') return;
    openBottomSheet(`
      <section class="chat-v7-action-sheet">
        <h2 id="sheetTitle">${esc(name)}</h2>
        <p>Kelola percakapan ini.</p>
        <button type="button" class="menu-sheet-btn" data-chat-v7-action="conversation-state" data-state-action="${pinned ? 'unpin' : 'pin'}" data-conversation-id="${esc(conversationId)}"><i class="ph ph-push-pin"></i>${pinned ? 'Lepas sematan' : 'Sematkan'}</button>
        <button type="button" class="menu-sheet-btn" data-chat-v7-action="conversation-state" data-state-action="${archived ? 'unarchive' : 'archive'}" data-conversation-id="${esc(conversationId)}"><i class="ph ph-archive"></i>${archived ? 'Keluarkan dari arsip' : 'Arsipkan'}</button>
        <button type="button" class="menu-sheet-btn is-danger" data-chat-v7-action="conversation-state" data-state-action="delete_me" data-conversation-id="${esc(conversationId)}"><i class="ph ph-trash"></i>Hapus pesan untuk saya</button>
      </section>
    `, 'chat-v7-conversation-actions');
  }

  function openMessageMenu(row) {
    const messageId = String(row?.dataset?.messageId || '').trim();
    if (!messageId || typeof openBottomSheet !== 'function') return;
    const mine = row.dataset.messageMine === 'true';

    openBottomSheet(`
      <section class="chat-v7-action-sheet">
        <h2 id="sheetTitle">Opsi Pesan</h2>
        <p>Pilih cara menghapus pesan.</p>
        <button type="button" class="menu-sheet-btn" data-chat-v7-action="message-delete" data-delete-action="delete_me" data-message-id="${esc(messageId)}"><i class="ph ph-trash"></i>Hapus untuk saya</button>
        ${mine ? `<button type="button" class="menu-sheet-btn is-danger" data-chat-v7-action="message-delete" data-delete-action="delete_everyone" data-message-id="${esc(messageId)}"><i class="ph ph-trash-simple"></i>Hapus untuk semua</button>` : ''}
      </section>
    `, 'chat-v7-message-actions');
  }

  async function conversationStateAction(conversationId, action) {
    try {
      await requestJSON(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/action`,
        { method: 'POST', body: { action } }
      );
      if (typeof closeBottomSheet === 'function') closeBottomSheet();
      toast(
        action === 'pin' ? 'Percakapan disematkan.'
          : action === 'unpin' ? 'Sematan dilepas.'
            : action === 'archive' ? 'Percakapan diarsipkan.'
              : action === 'unarchive' ? 'Percakapan dikembalikan.'
                : 'Percakapan dihapus dari akun Anda.'
      );
      await loadConversationList({ silent: true });
    } catch (error) {
      toast(error.message || 'Percakapan belum dapat diperbarui.');
    }
  }

  async function deleteMessage(messageId, action) {
    if (action === 'delete_everyone') {
      const confirmed = window.confirm('Hapus pesan ini untuk semua?');
      if (!confirmed) return;
    }

    try {
      await requestJSON(
        `/api/chat/messages/${encodeURIComponent(messageId)}/action`,
        { method: 'POST', body: { action } }
      );
      if (typeof closeBottomSheet === 'function') closeBottomSheet();
      state.messages = state.messages.filter(message => String(message.id || '') !== String(messageId));
      state.lastThreadSignature = '';
      renderThread({ messagesOnly: true, forceBottom: false });
      toast(action === 'delete_everyone' ? 'Pesan dihapus untuk semua.' : 'Pesan dihapus untuk Anda.');
    } catch (error) {
      toast(error.message || 'Pesan belum dapat dihapus.');
    }
  }

  function cancelLongPress() {
    clearTimeout(state.pressTimer);
    state.pressTimer = null;
    state.pressRow = null;
  }

  function beginLongPress(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const row = event.target.closest('[data-chat-v7-message]');
    if (!row) return;

    cancelLongPress();
    state.pressRow = row;
    state.pressX = Number(event.clientX || 0);
    state.pressY = Number(event.clientY || 0);
    state.pressTimer = setTimeout(() => {
      state.pressTimer = null;
      state.suppressClickUntil = Date.now() + 700;
      if (navigator.vibrate) navigator.vibrate(25);
      openMessageMenu(row);
    }, 520);
  }

  function moveLongPress(event) {
    if (!state.pressTimer) return;
    const dx = Math.abs(Number(event.clientX || 0) - state.pressX);
    const dy = Math.abs(Number(event.clientY || 0) - state.pressY);
    if (dx > 12 || dy > 12) cancelLongPress();
  }

  function filterConversationRows(value) {
    const query = String(value || '').trim().toLowerCase();
    document.querySelectorAll('[data-chat-v7-row]').forEach(row => {
      const haystack = String(row.dataset.searchText || '');
      row.hidden = Boolean(query && !haystack.includes(query));
    });

    const clear = document.querySelector('.chat-v7-search-clear');
    if (clear) clear.hidden = !query;
  }

  async function refreshListQuietly() {
    if (state.view !== 'list') return;
    try {
      const data = await requestJSON('/api/social/conversations');
      const next = Array.isArray(data.conversations) ? data.conversations : [];
      const signature = conversationSignature(next);
      if (signature !== state.lastListSignature) {
        state.conversations = next;
        state.lastListSignature = signature;
        renderConversationList();
      }
    } catch {
      // Silent refresh should not interrupt the user.
    }
  }

  document.addEventListener('submit', event => {
    if (event.target?.id !== 'chatV7Composer') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sendText();
  }, true);

  document.addEventListener('input', event => {
    if (event.target?.id === 'chatV7Input') {
      const input = event.target;
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
      updateComposerMode();
      return;
    }

    if (event.target?.id === 'chatV7Search') {
      filterConversationRows(event.target.value);
    }
  }, true);

  document.addEventListener('change', event => {
    const input = event.target.closest('[data-chat-v7-file]');
    if (!input) return;
    const file = input.files?.[0];
    input.value = '';
    if (file) sendImage(file);
  }, true);

  document.addEventListener('pointerdown', beginLongPress, true);
  document.addEventListener('pointermove', moveLongPress, true);
  document.addEventListener('pointerup', cancelLongPress, true);
  document.addEventListener('pointercancel', cancelLongPress, true);

  document.addEventListener('click', event => {
    if (
      Date.now() < state.suppressClickUntil &&
      event.target.closest('[data-chat-v7-message]')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const target = event.target.closest('[data-chat-v7-action]');
    if (!target) {
      if (!event.target.closest('.chat-v7-attach-panel')) closeAttachPanel();
      return;
    }

    const action = String(target.dataset.chatV7Action || '');

    if (action !== 'voice-play') {
      event.preventDefault();
      event.stopPropagation();
    }

    if (action === 'home') {
      goHome();
    } else if (action === 'refresh-list') {
      loadConversationList({ silent: false });
    } else if (action === 'clear-search') {
      const input = document.getElementById('chatV7Search');
      if (input) {
        input.value = '';
        filterConversationRows('');
        input.focus();
      }
    } else if (action === 'open-conversation') {
      openConversation(target.dataset.conversationId);
    } else if (action === 'thread-back') {
      loadConversationList();
    } else if (action === 'thread-profile') {
      const userId = target.dataset.userId;
      leaveChat();
      if (userId && typeof window.openUserProfile === 'function') {
        window.openUserProfile(userId);
      }
    } else if (action === 'conversation-menu') {
      openConversationMenu(target.dataset.conversationId);
    } else if (action === 'conversation-state') {
      conversationStateAction(target.dataset.conversationId, target.dataset.stateAction);
    } else if (action === 'message-delete') {
      deleteMessage(target.dataset.messageId, target.dataset.deleteAction);
    } else if (action === 'attach') {
      if (document.querySelector('.chat-v7-attach-panel')) closeAttachPanel();
      else openAttachPanel();
    } else if (action === 'gallery') {
      closeAttachPanel();
      document.querySelector('[data-chat-v7-file="gallery"]')?.click();
    } else if (action === 'camera') {
      closeAttachPanel();
      document.querySelector('[data-chat-v7-file="camera"]')?.click();
    } else if (action === 'location') {
      shareLocation();
    } else if (action === 'voice') {
      toggleVoice();
    } else if (action === 'voice-cancel') {
      stopRecording(true);
    } else if (action === 'open-media') {
      openMediaViewer(target.dataset.mediaUrl);
    } else if (action === 'close-media') {
      closeMediaViewer();
    }
  }, true);

  document.addEventListener('focusin', event => {
    if (event.target?.id !== 'chatV7Input') return;
    closeAttachPanel();
    scheduleViewportSync();
    setTimeout(scheduleViewportSync, 100);
    setTimeout(scheduleViewportSync, 280);
  }, true);

  window.addEventListener('resize', scheduleViewportSync, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleViewportSync, { passive: true });
  window.visualViewport?.addEventListener('scroll', scheduleViewportSync, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (state.view === 'thread') syncThread();
    else if (state.view === 'list') refreshListQuietly();
  });

  window.addEventListener('pageshow', () => {
    if (state.view === 'thread') syncThread();
  });

  const legacyObserver = new MutationObserver(() => {
    if (state.view === 'thread' || state.view === 'list') return;
    const legacy = document.querySelector('.social-conversation-page');
    if (!legacy || legacy.dataset.chatV7Claimed === 'true') return;
    legacy.dataset.chatV7Claimed = 'true';
    const userId = String(
      legacy.querySelector('[data-social-action="thread-profile"][data-user-id]')?.dataset?.userId || ''
    ).trim();
    if (!userId) return;

    requestJSON(`/api/chat/conversations/by-user/${encodeURIComponent(userId)}`)
      .then(data => {
        const conversationId = String(data.conversation_id || '').trim();
        if (conversationId) openConversation(conversationId);
      })
      .catch(error => console.error('[Pasar UMKM] Chat V7 legacy claim error:', error));
  });

  legacyObserver.observe(document.body, { childList: true, subtree: true });

  if (typeof openMessages === 'function') {
    openMessages = function chatV7OpenMessages() {
      loadConversationList();
    };
  }

  window.openSocialMessages = loadConversationList;

  window.PasarChatV7 = Object.freeze({
    version: '7.0',
    openList: loadConversationList,
    openConversation,
    openWithUser,
    refreshList: refreshListQuietly,
    leave: leaveChat,
    diagnostics: () => ({
      owner: 'chat-v7',
      view: state.view,
      conversationId: state.activeConversationId,
      conversationCount: state.conversations.length,
      messageCount: state.messages.length,
      polling: Boolean(state.syncTimer),
      mutationObserverAttributes: false
    })
  });

  window.__PUMKM_CHAT_RENDER_OWNER = 'v7';
  window.__PUMKM_CHAT_V7_READY__ = true;
})();
