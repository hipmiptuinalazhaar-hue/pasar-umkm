'use strict';

/* =========================================================
   PASAR UMKM - CHAT SINGLE RENDERER V6.1
   P4.15 interaction hotfix.
   - No MutationObserver feedback loop.
   - Suppresses only the legacy 5s full-DOM thread poll.
   - Reconciles by message id and writes only when changed.
   - Keeps photo, voice note, text and location interactive.
   ========================================================= */

(() => {
  if (window.__PUMKM_CHAT_SINGLE_RENDER_V61__) return;
  window.__PUMKM_CHAT_SINGLE_RENDER_V61__ = true;
  window.__PUMKM_CHAT_RENDER_OWNER = 'v6.1';

  const nativeSetInterval = window.setInterval.bind(window);

  window.setInterval = function patchedSetInterval(callback, delay, ...args) {
    if (Number(delay) === 5000 && typeof callback === 'function') {
      let source = '';
      try {
        source = Function.prototype.toString.call(callback);
      } catch {
        source = '';
      }

      if (
        source.includes('SOCIAL.activeConversationId') &&
        source.includes('loadConversationData') &&
        source.includes('social-conversation-page')
      ) {
        return 0;
      }
    }

    return nativeSetInterval(callback, delay, ...args);
  };

  const V61 = {
    pageNode: null,
    conversationId: '',
    otherUserId: '',
    currentUserId: '',
    syncing: false,
    lastSyncAt: 0,
    lastMessageCount: 0
  };

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function page() {
    return document.querySelector('.social-conversation-page');
  }

  function container() {
    return page()?.querySelector('[data-social-thread-messages]') || null;
  }

  function otherUserId() {
    return String(
      page()?.querySelector('[data-social-action="thread-profile"][data-user-id]')?.dataset?.userId || ''
    ).trim();
  }

  function clock(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  }

  function durationLabel(value) {
    const seconds = Math.max(0, Math.round(Number(value) || 0));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function signature(message) {
    return [
      message?.id || '',
      message?.message_type || 'text',
      message?.message || '',
      message?.media_url || '',
      message?.media_duration_seconds || '',
      message?.latitude || '',
      message?.longitude || ''
    ].join(':');
  }

  async function requestJSON(path) {
    const response = await fetch(path, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) {
      throw new Error(data.error || 'Chat belum dapat disinkronkan.');
    }
    return data;
  }

  async function resolveConversationId() {
    const userId = otherUserId();
    if (!userId) return '';

    if (V61.conversationId && V61.otherUserId === userId) {
      return V61.conversationId;
    }

    const data = await requestJSON(
      `/api/chat/conversations/by-user/${encodeURIComponent(userId)}`
    );

    V61.otherUserId = userId;
    V61.conversationId = String(data.conversation_id || '').trim();
    return V61.conversationId;
  }

  function ensureShell(row) {
    let bubble = row.querySelector(':scope > .social-message-bubble');
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.className = 'social-message-bubble';
      row.replaceChildren(bubble);
    }

    let text = bubble.querySelector(':scope > .social-message-text');
    if (!text) {
      text = document.createElement('div');
      text.className = 'social-message-text';
      bubble.prepend(text);
    }

    let foot = bubble.querySelector(':scope > .social-message-foot');
    if (!foot) {
      foot = document.createElement('div');
      foot.className = 'social-message-foot';
      bubble.appendChild(foot);
    }

    return { text, foot };
  }

  function makeRow(message, mine) {
    const row = document.createElement('div');
    row.className = `social-message-row ${mine ? 'mine' : 'theirs'} v6-message-row`;
    row.dataset.messageId = String(message.id || '');
    row.dataset.messageMine = mine ? 'true' : 'false';
    ensureShell(row);
    return row;
  }

  function waveformBars(seedValue) {
    let seed = 0;
    const text = String(seedValue || 'voice');
    for (let i = 0; i < text.length; i += 1) {
      seed = ((seed * 31) + text.charCodeAt(i)) >>> 0;
    }

    const bars = [];
    for (let i = 0; i < 34; i += 1) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      bars.push(`<span class="v6-wave-bar" style="--h:${5 + (seed % 18)}px"></span>`);
    }
    return bars.join('');
  }

  function bindVoice(row, message) {
    const audio = row.querySelector('.v6-voice-audio');
    const play = row.querySelector('.v6-voice-play');
    const wave = row.querySelector('.v6-wave');
    const progress = row.querySelector('.v6-wave-progress');
    const label = row.querySelector('.v6-voice-duration');
    if (!audio || !play || !wave || !progress || !label) return;
    if (audio.dataset.v61Bound === 'true') return;
    audio.dataset.v61Bound = 'true';

    const serverDuration = Math.max(0, Number(message.media_duration_seconds || 0));

    const duration = () => (
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : serverDuration
    );

    const paint = () => {
      const total = duration();
      const current = Math.max(0, Number(audio.currentTime || 0));
      const ratio = total > 0 ? Math.max(0, Math.min(1, current / total)) : 0;
      progress.style.width = `${ratio * 100}%`;
      label.textContent = audio.paused ? durationLabel(total) : durationLabel(current);
      play.innerHTML = audio.paused
        ? '<i class="ph-fill ph-play"></i>'
        : '<i class="ph-fill ph-pause"></i>';
    };

    play.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      document.querySelectorAll('.v6-voice-audio').forEach(other => {
        if (other !== audio && !other.paused) other.pause();
      });
      if (audio.paused) audio.play().catch(() => null);
      else audio.pause();
      paint();
    });

    wave.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const total = duration();
      const rect = wave.getBoundingClientRect();
      if (!total || !rect.width) return;
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      try { audio.currentTime = ratio * total; } catch { return; }
      paint();
    });

    ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended']
      .forEach(type => audio.addEventListener(type, paint));
    paint();
  }

  function renderContent(row, message) {
    const { text } = ensureShell(row);
    const type = String(message.message_type || 'text').toLowerCase();
    const sig = signature(message);

    row.dataset.chatStableSignature = [
      message?.id || '',
      message?.message_type || 'text',
      message?.media_url || '',
      message?.latitude || '',
      message?.longitude || ''
    ].join(':');
    text.dataset.richSignature = row.dataset.chatStableSignature;

    if (row.dataset.v61Signature === sig) {
      if (type === 'audio') bindVoice(row, message);
      return;
    }
    row.dataset.v61Signature = sig;

    row.classList.toggle('v6-rich', type !== 'text');
    row.classList.toggle('chat-stable-rich', type !== 'text');
    row.classList.toggle('chat-rich-message-row', type !== 'text');

    if (type === 'image' && message.media_url) {
      text.innerHTML = `
        <button type="button" class="v6-photo" data-chat-open-media="${esc(message.media_url)}" aria-label="Buka foto">
          <img src="${esc(message.media_url)}" alt="Foto chat" loading="eager" decoding="async">
        </button>`;
      return;
    }

    if (type === 'audio' && message.media_url) {
      const bars = waveformBars(message.id);
      text.innerHTML = `
        <div class="v6-voice">
          <button type="button" class="v6-voice-play" aria-label="Putar voice note"><i class="ph-fill ph-play"></i></button>
          <div class="v6-voice-main">
            <div class="v6-wave" role="slider" aria-label="Posisi voice note">
              <div class="v6-wave-bars">${bars}</div>
              <div class="v6-wave-progress"><div class="v6-wave-bars">${bars}</div></div>
            </div>
            <div class="v6-voice-meta">
              <span class="v6-voice-duration">${esc(durationLabel(message.media_duration_seconds))}</span>
              <i class="ph-fill ph-microphone v6-voice-mic" aria-hidden="true"></i>
            </div>
          </div>
          <audio class="v6-voice-audio" preload="metadata" src="${esc(message.media_url)}"></audio>
        </div>`;
      bindVoice(row, message);
      return;
    }

    if (
      type === 'location' &&
      Number.isFinite(Number(message.latitude)) &&
      Number.isFinite(Number(message.longitude))
    ) {
      const lat = Number(message.latitude).toFixed(6);
      const lng = Number(message.longitude).toFixed(6);
      const href = `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
      text.innerHTML = `
        <a class="v6-location" href="${esc(href)}" target="_blank" rel="noopener noreferrer">
          <span class="v6-location-pin"><i class="ph-fill ph-map-pin"></i></span>
          <span class="v6-location-copy"><strong>Lokasi dibagikan</strong><small>${esc(lat)}, ${esc(lng)}</small></span>
        </a>`;
      return;
    }

    row.classList.remove('v6-rich', 'chat-stable-rich', 'chat-rich-message-row');
    text.textContent = String(message.message || '');
  }

  function renderFoot(row, message, mine) {
    const { foot } = ensureShell(row);
    const read = Boolean(message.is_read);
    const sig = `${clock(message.created_at)}:${mine ? 1 : 0}:${read ? 1 : 0}`;
    if (foot.dataset.v61FootSignature === sig) return;
    foot.dataset.v61FootSignature = sig;
    foot.innerHTML = `
      <span>${esc(clock(message.created_at))}</span>
      ${mine ? `<i class="ph ${read ? 'ph-checks v6-read' : 'ph-check'}" aria-hidden="true"></i>` : ''}`;
  }

  function reconcile(messages, currentUserId) {
    const root = container();
    if (!root) return;
    const list = Array.isArray(messages) ? messages : [];

    const initialRows = [...root.querySelectorAll('.social-message-row')];
    const unkeyed = initialRows.filter(row => !row.dataset.messageId);
    const pairCount = Math.min(unkeyed.length, list.length);

    for (let offset = 1; offset <= pairCount; offset += 1) {
      const row = unkeyed[unkeyed.length - offset];
      const msg = list[list.length - offset];
      if (msg?.id) row.dataset.messageId = String(msg.id);
    }

    const byId = new Map();
    root.querySelectorAll('.social-message-row[data-message-id]').forEach(row => {
      byId.set(String(row.dataset.messageId), row);
    });

    const desired = [];
    const keep = new Set();
    let added = false;

    for (const message of list) {
      const id = String(message?.id || '').trim();
      if (!id) continue;
      const mine = String(message.sender_id || '') === String(currentUserId || '');
      let row = byId.get(id);
      if (!row) {
        row = makeRow(message, mine);
        added = true;
      }

      keep.add(id);
      desired.push(row);
      row.classList.add('v6-message-row');
      row.classList.toggle('mine', mine);
      row.classList.toggle('theirs', !mine);
      row.dataset.messageId = id;
      row.dataset.messageMine = mine ? 'true' : 'false';
      renderContent(row, message);
      renderFoot(row, message, mine);
    }

    root.querySelectorAll('.social-message-row[data-message-id]').forEach(row => {
      if (!keep.has(String(row.dataset.messageId))) row.remove();
    });

    if (desired.length) root.querySelector('.social-page-empty')?.remove();

    let anchor = null;
    for (const row of desired) {
      const expected = anchor ? anchor.nextElementSibling : root.firstElementChild;
      if (row !== expected) root.insertBefore(row, expected || null);
      anchor = row;
    }

    if (!desired.length && !root.querySelector('.social-page-empty')) {
      root.innerHTML = `
        <div class="social-page-empty v6-empty" style="min-height:220px;">
          <i class="ph ph-chat-circle"></i>
          <strong>Mulai percakapan</strong>
          <span>Kirim pesan pertama untuk memulai obrolan.</span>
        </div>`;
    }

    if (added) {
      requestAnimationFrame(() => {
        root.scrollTop = root.scrollHeight;
      });
    }
  }

  async function sync(force = false) {
    if (V61.syncing || !page() || document.hidden) return;
    if (!force && Date.now() - V61.lastSyncAt < 2200) return;
    V61.syncing = true;

    try {
      const conversationId = await resolveConversationId();
      if (!conversationId) return;
      const data = await requestJSON(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/rich-meta`
      );
      V61.currentUserId = String(data.current_user_id || '').trim();
      const messages = Array.isArray(data.messages) ? data.messages : [];
      reconcile(messages, V61.currentUserId);
      V61.lastMessageCount = messages.length;
      V61.lastSyncAt = Date.now();
    } catch (error) {
      console.error('[Pasar UMKM] P4.15 chat sync error:', error);
    } finally {
      V61.syncing = false;
    }
  }

  function resetForPage(nextPage) {
    V61.pageNode = nextPage;
    V61.conversationId = '';
    V61.otherUserId = '';
    V61.currentUserId = '';
    V61.lastSyncAt = 0;
    V61.lastMessageCount = 0;
  }

  nativeSetInterval(() => {
    const current = page();
    if (current !== V61.pageNode) {
      resetForPage(current);
      if (current) sync(true);
      return;
    }
    if (current) sync(false);
  }, 700);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && page()) sync(true);
  });

  window.addEventListener('pageshow', () => {
    if (page()) sync(true);
  });

  window.__PUMKM_CHAT_V6_DIAGNOSTICS__ = {
    version: '6.1',
    renderer: 'single-idempotent',
    legacyThreadPollSuppressed: true,
    mutationObserver: false,
    get conversationId() { return V61.conversationId; },
    get cachedMessages() { return V61.lastMessageCount; }
  };
})();
