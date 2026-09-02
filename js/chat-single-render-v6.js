'use strict';

/* =========================================================
   PASAR UMKM - CHAT SINGLE RENDERER V6
   P4.14: one visual owner for thread DOM.
   - Suppresses the legacy 5s full-DOM polling loop.
   - Reconciles messages by message id.
   - Owns rich media rendering so native audio cannot fight
     with the custom waveform renderer.
   - Preserves legacy upload/record/delete behavior modules.
   ========================================================= */

(() => {
  if (window.__PUMKM_CHAT_SINGLE_RENDER_V6__) return;
  window.__PUMKM_CHAT_SINGLE_RENDER_V6__ = true;
  window.__PUMKM_CHAT_RENDER_OWNER = 'v6';

  const nativeSetInterval = window.setInterval.bind(window);
  const nativeClearInterval = window.clearInterval.bind(window);

  // The social-core thread poll replaces container.innerHTML every 5 seconds.
  // Suppress only that exact legacy callback. Other 5s timers remain untouched.
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

  const STATE_V6 = {
    conversationId: '',
    otherUserId: '',
    currentUserId: '',
    messages: [],
    syncing: false,
    syncTimer: null,
    pollTimer: null,
    observerTimer: null,
    lastReadMarkAt: 0,
    lastConversationSeen: '',
    applying: false
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

  function messageContainer() {
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
    const mm = Math.floor(seconds / 60);
    const ss = String(seconds % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function signature(message) {
    return [
      message?.id || '',
      message?.message_type || 'text',
      message?.media_url || '',
      message?.latitude || '',
      message?.longitude || ''
    ].join(':');
  }

  async function requestJSON(path, options = {}) {
    const init = {
      method: options.method || 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(options.headers || {})
      }
    };

    if (options.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }

    const response = await fetch(path, init);
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok !== true) {
      throw new Error(data.error || 'Chat belum dapat disinkronkan.');
    }

    return data;
  }

  async function resolveConversationId() {
    const userId = otherUserId();
    if (!userId) {
      STATE_V6.conversationId = '';
      STATE_V6.otherUserId = '';
      return '';
    }

    if (
      STATE_V6.conversationId &&
      STATE_V6.otherUserId === userId
    ) {
      return STATE_V6.conversationId;
    }

    const data = await requestJSON(
      `/api/chat/conversations/by-user/${encodeURIComponent(userId)}`
    );

    STATE_V6.otherUserId = userId;
    STATE_V6.conversationId = String(data.conversation_id || '').trim();
    STATE_V6.messages = [];
    STATE_V6.currentUserId = '';
    return STATE_V6.conversationId;
  }

  function ensureRowShell(row) {
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

    return { bubble, text, foot };
  }

  function makeRow(message, mine) {
    const row = document.createElement('div');
    row.className = `social-message-row ${mine ? 'mine' : 'theirs'} v6-message-row`;
    row.dataset.messageId = String(message.id || '');
    row.dataset.messageMine = mine ? 'true' : 'false';

    const bubble = document.createElement('div');
    bubble.className = 'social-message-bubble';

    const text = document.createElement('div');
    text.className = 'social-message-text';

    const foot = document.createElement('div');
    foot.className = 'social-message-foot';

    bubble.append(text, foot);
    row.appendChild(bubble);
    return row;
  }

  function waveformBars(seedValue) {
    const seedText = String(seedValue || 'voice');
    let seed = 0;
    for (let index = 0; index < seedText.length; index += 1) {
      seed = ((seed * 31) + seedText.charCodeAt(index)) >>> 0;
    }

    const bars = [];
    for (let index = 0; index < 34; index += 1) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      const height = 5 + (seed % 18);
      bars.push(`<span class="v6-wave-bar" style="--h:${height}px"></span>`);
    }
    return bars.join('');
  }

  function bindVoice(row, message) {
    const audio = row.querySelector('.v6-voice-audio');
    const play = row.querySelector('.v6-voice-play');
    const wave = row.querySelector('.v6-wave');
    const progress = row.querySelector('.v6-wave-progress');
    const time = row.querySelector('.v6-voice-duration');

    if (!audio || !play || !wave || !progress || !time) return;
    if (audio.dataset.v6Bound === 'true') return;
    audio.dataset.v6Bound = 'true';

    const serverDuration = Math.max(
      0,
      Number(message.media_duration_seconds || 0)
    );

    function effectiveDuration() {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        return audio.duration;
      }
      return serverDuration;
    }

    function paint() {
      const duration = effectiveDuration();
      const current = Math.max(0, Number(audio.currentTime || 0));
      const ratio = duration > 0
        ? Math.max(0, Math.min(1, current / duration))
        : 0;

      progress.style.width = `${ratio * 100}%`;
      time.textContent = audio.paused
        ? durationLabel(duration)
        : durationLabel(current);
      play.innerHTML = audio.paused
        ? '<i class="ph-fill ph-play"></i>'
        : '<i class="ph-fill ph-pause"></i>';
    }

    play.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      document.querySelectorAll('.v6-voice-audio').forEach(other => {
        if (other !== audio && !other.paused) {
          try { other.pause(); } catch { /* noop */ }
        }
      });

      if (audio.paused) {
        audio.play().catch(() => null);
      } else {
        audio.pause();
      }
      paint();
    });

    wave.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      const duration = effectiveDuration();
      if (!duration) return;

      const rect = wave.getBoundingClientRect();
      if (!rect.width) return;

      const ratio = Math.max(
        0,
        Math.min(1, (event.clientX - rect.left) / rect.width)
      );

      try {
        audio.currentTime = ratio * duration;
      } catch {
        return;
      }
      paint();
    });

    audio.addEventListener('loadedmetadata', paint);
    audio.addEventListener('durationchange', paint);
    audio.addEventListener('timeupdate', paint);
    audio.addEventListener('play', paint);
    audio.addEventListener('pause', paint);
    audio.addEventListener('ended', paint);
    paint();
  }

  function renderContent(row, message) {
    const { text } = ensureRowShell(row);
    const type = String(message.message_type || 'text').toLowerCase();
    const sig = signature(message);

    // These two signatures prevent V4 and the legacy rich-media renderer
    // from replacing V6's content after V6 owns the row.
    row.dataset.chatStableSignature = sig;
    text.dataset.richSignature = sig;

    if (row.dataset.v6Signature === sig) {
      if (type === 'audio') bindVoice(row, message);
      return;
    }

    row.dataset.v6Signature = sig;

    if (type === 'image' && message.media_url) {
      row.classList.add(
        'v6-rich',
        'chat-stable-rich',
        'chat-rich-message-row'
      );

      text.innerHTML = `
        <button
          type="button"
          class="v6-photo"
          data-chat-open-media="${esc(message.media_url)}"
          aria-label="Buka foto"
        >
          <img
            src="${esc(message.media_url)}"
            alt="Foto chat"
            loading="eager"
            decoding="async"
          >
        </button>
      `;
      return;
    }

    if (type === 'audio' && message.media_url) {
      row.classList.add(
        'v6-rich',
        'chat-stable-rich',
        'chat-rich-message-row'
      );

      const bars = waveformBars(message.id);
      text.innerHTML = `
        <div class="v6-voice" data-v6-voice-ready="true">
          <button
            type="button"
            class="v6-voice-play"
            aria-label="Putar voice note"
          >
            <i class="ph-fill ph-play"></i>
          </button>

          <div class="v6-voice-main">
            <div class="v6-wave" role="slider" aria-label="Posisi voice note">
              <div class="v6-wave-bars">${bars}</div>
              <div class="v6-wave-progress">
                <div class="v6-wave-bars">${bars}</div>
              </div>
            </div>

            <div class="v6-voice-meta">
              <span class="v6-voice-duration">
                ${esc(durationLabel(message.media_duration_seconds))}
              </span>
              <i class="ph-fill ph-microphone v6-voice-mic" aria-hidden="true"></i>
            </div>
          </div>

          <audio
            class="v6-voice-audio"
            preload="metadata"
            src="${esc(message.media_url)}"
          ></audio>
        </div>
      `;
      bindVoice(row, message);
      return;
    }

    if (
      type === 'location' &&
      Number.isFinite(Number(message.latitude)) &&
      Number.isFinite(Number(message.longitude))
    ) {
      row.classList.add(
        'v6-rich',
        'chat-stable-rich',
        'chat-rich-message-row'
      );

      const lat = Number(message.latitude).toFixed(6);
      const lng = Number(message.longitude).toFixed(6);
      const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;

      text.innerHTML = `
        <a
          class="v6-location"
          href="${esc(mapUrl)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="v6-location-pin">
            <i class="ph-fill ph-map-pin"></i>
          </span>
          <span class="v6-location-copy">
            <strong>Lokasi dibagikan</strong>
            <small>${esc(lat)}, ${esc(lng)}</small>
          </span>
        </a>
      `;
      return;
    }

    row.classList.remove(
      'v6-rich',
      'chat-stable-rich',
      'chat-rich-message-row'
    );
    text.textContent = String(message.message || '');
  }

  function renderFoot(row, message, mine) {
    const { foot } = ensureRowShell(row);
    const read = Boolean(message.is_read);

    foot.innerHTML = `
      <span>${esc(clock(message.created_at))}</span>
      ${
        mine
          ? `<i class="ph ${read ? 'ph-checks v6-read' : 'ph-check'}" aria-hidden="true"></i>`
          : ''
      }
    `;
  }

  function reconcile(messages, currentUserId) {
    const container = messageContainer();
    if (!container || STATE_V6.applying) return;

    STATE_V6.applying = true;

    try {
      const list = Array.isArray(messages) ? messages : [];
      const beforeBottomDistance =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      const shouldStickBottom = beforeBottomDistance < 100;

      const rows = [...container.querySelectorAll('.social-message-row')];

      // The first legacy render has no IDs. Pair it from the tail with
      // metadata before building the keyed map.
      const unkeyed = rows.filter(row => !row.dataset.messageId);
      const assignCount = Math.min(unkeyed.length, list.length);

      for (let offset = 1; offset <= assignCount; offset += 1) {
        const row = unkeyed[unkeyed.length - offset];
        const message = list[list.length - offset];
        const id = String(message?.id || '').trim();
        if (id) row.dataset.messageId = id;
      }

      const byId = new Map();
      container
        .querySelectorAll('.social-message-row[data-message-id]')
        .forEach(row => byId.set(String(row.dataset.messageId), row));

      const keep = new Set();
      let added = false;

      for (const message of list) {
        const id = String(message?.id || '').trim();
        if (!id) continue;

        const mine =
          String(message.sender_id || '') === String(currentUserId || '');

        let row = byId.get(id);
        if (!row) {
          row = makeRow(message, mine);
          added = true;
        }

        keep.add(id);
        row.classList.add('v6-message-row');
        row.classList.toggle('mine', mine);
        row.classList.toggle('theirs', !mine);
        row.dataset.messageId = id;
        row.dataset.messageMine = mine ? 'true' : 'false';

        renderContent(row, message);
        renderFoot(row, message, mine);
        container.appendChild(row);
      }

      container
        .querySelectorAll('.social-message-row[data-message-id]')
        .forEach(row => {
          if (!keep.has(String(row.dataset.messageId))) {
            row.remove();
          }
        });

      if (!list.length) {
        if (!container.querySelector('.social-page-empty')) {
          container.innerHTML = `
            <div class="social-page-empty v6-empty" style="min-height:220px;">
              <i class="ph ph-chat-circle"></i>
              <strong>Mulai percakapan</strong>
              <span>Kirim pesan pertama untuk memulai obrolan.</span>
            </div>
          `;
        }
      } else {
        container.querySelector('.social-page-empty')?.remove();
      }

      if (added || shouldStickBottom) {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
        });
      }
    } finally {
      STATE_V6.applying = false;
    }
  }

  async function markReadIfNeeded(messages) {
    const now = Date.now();
    if (now - STATE_V6.lastReadMarkAt < 1800) return;

    const unreadIncoming = messages.some(message =>
      String(message.sender_id || '') !== String(STATE_V6.currentUserId || '') &&
      !message.is_read
    );

    if (!unreadIncoming || !STATE_V6.conversationId) return;

    STATE_V6.lastReadMarkAt = now;

    try {
      await fetch(
        `/api/chat/conversations/${encodeURIComponent(STATE_V6.conversationId)}/mark-read`,
        {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' }
        }
      );
      window.refreshSocialUnreadBadge?.();
    } catch {
      // A read receipt must never break the thread renderer.
    }
  }

  async function sync(force = false) {
    if (STATE_V6.syncing || !page() || document.hidden) return;
    STATE_V6.syncing = true;

    try {
      const conversationId = await resolveConversationId();
      if (!conversationId) return;

      const data = await requestJSON(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/rich-meta`
      );

      const incoming = Array.isArray(data.messages) ? data.messages : [];
      STATE_V6.currentUserId = String(data.current_user_id || '').trim();
      STATE_V6.messages = incoming;

      reconcile(incoming, STATE_V6.currentUserId);
      markReadIfNeeded(incoming);

      if (force) {
        window.refreshSocialUnreadBadge?.();
      }
    } catch (error) {
      console.error('[Pasar UMKM] P4.14 chat sync error:', error);
    } finally {
      STATE_V6.syncing = false;
    }
  }

  function scheduleSync(delay = 30) {
    clearTimeout(STATE_V6.syncTimer);
    STATE_V6.syncTimer = window.setTimeout(() => sync(true), delay);
  }

  function decorateFromCache() {
    if (!page()) {
      STATE_V6.conversationId = '';
      STATE_V6.otherUserId = '';
      STATE_V6.currentUserId = '';
      STATE_V6.messages = [];
      STATE_V6.lastConversationSeen = '';
      return;
    }

    const userId = otherUserId();
    if (
      userId &&
      STATE_V6.lastConversationSeen &&
      userId !== STATE_V6.lastConversationSeen
    ) {
      STATE_V6.conversationId = '';
      STATE_V6.messages = [];
      STATE_V6.currentUserId = '';
    }
    if (userId) STATE_V6.lastConversationSeen = userId;

    if (STATE_V6.messages.length) {
      reconcile(STATE_V6.messages, STATE_V6.currentUserId);
    }
    scheduleSync(STATE_V6.messages.length ? 70 : 0);
  }

  const observer = new MutationObserver(() => {
    if (STATE_V6.applying) return;

    // Cached metadata is reapplied synchronously in the observer delivery
    // checkpoint, before the next paint, so transient native media stays hidden.
    if (STATE_V6.messages.length && page()) {
      reconcile(STATE_V6.messages, STATE_V6.currentUserId);
    }

    clearTimeout(STATE_V6.observerTimer);
    STATE_V6.observerTimer = window.setTimeout(decorateFromCache, 20);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  STATE_V6.pollTimer = nativeSetInterval(() => {
    if (!document.hidden && page()) {
      sync(false);
    }
  }, 2500);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && page()) {
      scheduleSync(0);
    }
  });

  window.addEventListener('pageshow', () => {
    if (page()) scheduleSync(0);
  });

  decorateFromCache();

  window.__PUMKM_CHAT_V6_DIAGNOSTICS__ = {
    version: '6.0',
    renderer: 'single',
    legacyThreadPollSuppressed: true,
    get conversationId() {
      return STATE_V6.conversationId;
    },
    get cachedMessages() {
      return STATE_V6.messages.length;
    }
  };

  // Keep references alive intentionally. The page lifetime owns this renderer.
  void nativeClearInterval;
})();
