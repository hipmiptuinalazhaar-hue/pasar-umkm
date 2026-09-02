'use strict';

/* PASAR UMKM P4.12 - WhatsApp-like chat UI behavior. */
(() => {
  const UI = {
    conversationId: '',
    otherUserId: '',
    syncBusy: false,
    lastSyncAt: 0,
    timer: null,
    observerTimer: null
  };

  const EMOJIS = ['😀','😂','🥰','😍','😊','🙏','👍','❤️','🔥','🎉','😅','😭','🤝','✨','💯','😁','😘','😎'];

  function toast(message) {
    if (typeof showToast === 'function') showToast(message);
  }

  function page() {
    return document.querySelector('.social-conversation-page');
  }

  function currentRows() {
    return [...(page()?.querySelectorAll('.social-message-row') || [])];
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
    }).format(date).replace('.', ':');
  }

  function durationLabel(value) {
    const total = Math.max(0, Math.round(Number(value) || 0));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function esc(value) {
    if (typeof escapeHTML === 'function') return escapeHTML(String(value ?? ''));
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function requestJSON(path) {
    const response = await fetch(path, {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) {
      throw new Error(data.error || 'Data chat belum dapat dimuat.');
    }
    return data;
  }

  async function resolveConversationId() {
    const userId = otherUserId();
    if (!userId) return '';

    if (UI.conversationId && UI.otherUserId === userId) {
      return UI.conversationId;
    }

    const data = await requestJSON(
      `/api/chat/conversations/by-user/${encodeURIComponent(userId)}`
    );

    UI.otherUserId = userId;
    UI.conversationId = String(data.conversation_id || '').trim();
    return UI.conversationId;
  }

  function waveformSeed(id, count = 34) {
    const text = String(id || 'voice-note');
    let seed = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      seed ^= text.charCodeAt(i);
      seed = Math.imul(seed, 16777619);
    }

    const heights = [];
    for (let i = 0; i < count; i += 1) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const n = Math.abs(seed % 17);
      heights.push(5 + n);
    }
    return heights;
  }

  function barsHTML(id) {
    return waveformSeed(id)
      .map(height => `<span class="wa-wave-bar" style="--h:${height}px"></span>`)
      .join('');
  }

  function pauseOtherAudio(except) {
    document.querySelectorAll('.wa-native-audio').forEach(audio => {
      if (audio !== except && !audio.paused) audio.pause();
    });
  }

  function upgradeVoice(row, message) {
    const box = row.querySelector('.chat-stable-voice, .chat-voice-message');
    const audio = box?.querySelector('audio');
    if (!box || !audio) return;

    const fallbackDuration = Math.max(
      0,
      Number(message.media_duration_seconds || message.duration_seconds || 0)
    );

    if (box.dataset.waVoiceReady === 'true') {
      const label = box.querySelector('.wa-voice-duration');
      if (label && !audio.dataset.waPlaying) {
        const known = Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : fallbackDuration;
        label.textContent = durationLabel(known);
      }
      return;
    }

    box.dataset.waVoiceReady = 'true';
    box.classList.add('wa-voice');

    audio.remove();
    audio.classList.add('wa-native-audio');
    audio.controls = false;
    audio.preload = 'metadata';

    const waveform = barsHTML(message.id);
    box.innerHTML = `
      <button type="button" class="wa-voice-play" aria-label="Putar voice note">
        <i class="ph-fill ph-play"></i>
      </button>
      <div class="wa-wave-wrap" role="slider" aria-label="Posisi voice note">
        <div class="wa-wave">
          <div class="wa-wave-bars">${waveform}</div>
          <div class="wa-wave-progress">
            <div class="wa-wave-bars">${waveform}</div>
          </div>
        </div>
      </div>
      <div class="wa-voice-meta">
        <span class="wa-voice-duration">${durationLabel(fallbackDuration)}</span>
        <i class="ph-fill ph-microphone wa-voice-mic" aria-hidden="true"></i>
      </div>
    `;
    box.appendChild(audio);

    const play = box.querySelector('.wa-voice-play');
    const icon = play?.querySelector('i');
    const wave = box.querySelector('.wa-wave');
    const waveWrap = box.querySelector('.wa-wave-wrap');
    const label = box.querySelector('.wa-voice-duration');

    function knownDuration() {
      return Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : fallbackDuration;
    }

    function updateProgress() {
      const total = knownDuration();
      const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const percent = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;
      wave?.style.setProperty('--wa-progress', `${percent}%`);
      if (label) label.textContent = durationLabel(audio.dataset.waPlaying ? current : total);
    }

    play?.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      if (audio.paused) {
        pauseOtherAudio(audio);
        try {
          await audio.play();
        } catch (error) {
          console.error('[Pasar UMKM] Voice playback error:', error);
          toast('Voice note belum dapat diputar.');
        }
      } else {
        audio.pause();
      }
    });

    audio.addEventListener('play', () => {
      audio.dataset.waPlaying = 'true';
      if (icon) icon.className = 'ph-fill ph-pause';
      updateProgress();
    });

    audio.addEventListener('pause', () => {
      delete audio.dataset.waPlaying;
      if (icon) icon.className = 'ph-fill ph-play';
      updateProgress();
    });

    audio.addEventListener('ended', () => {
      delete audio.dataset.waPlaying;
      audio.currentTime = 0;
      if (icon) icon.className = 'ph-fill ph-play';
      updateProgress();
    });

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', updateProgress);
    audio.addEventListener('durationchange', updateProgress);

    waveWrap?.addEventListener('click', event => {
      const total = knownDuration();
      if (!total) return;
      const rect = waveWrap.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      try { audio.currentTime = ratio * total; } catch { /* metadata fallback */ }
      updateProgress();
    });

    updateProgress();
  }

  function decorateMessage(row, message, currentUserId) {
    if (!row || !message) return;

    row.dataset.messageId = String(message.id || row.dataset.messageId || '');
    row.dataset.messageMine = String(message.sender_id || '') === String(currentUserId || '') ? 'true' : 'false';

    const foot = row.querySelector('.social-message-foot');
    const time = foot?.querySelector('span');
    if (time) time.textContent = clock(message.created_at);

    if (row.dataset.messageMine === 'true' && foot) {
      let check = foot.querySelector('i');
      if (!check) {
        check = document.createElement('i');
        foot.appendChild(check);
      }
      check.className = `ph ${message.is_read ? 'ph-checks wa-read' : 'ph-check'}`;
    }

    if (String(message.message_type || '').toLowerCase() === 'audio') {
      upgradeVoice(row, message);
    }
  }

  function decorateHeader() {
    const p = page();
    const header = p?.querySelector(':scope > .social-page-topbar');
    if (!header || header.dataset.waHeaderReady === 'true') return;

    const existingAction = header.querySelector('.social-page-action');
    if (!existingAction) return;

    header.dataset.waHeaderReady = 'true';

    const actions = document.createElement('div');
    actions.className = 'wa-header-actions';
    actions.innerHTML = `
      <button type="button" class="wa-header-action" data-wa-chat-action="video" aria-label="Panggilan video">
        <i class="ph ph-video-camera"></i>
      </button>
      <button type="button" class="wa-header-action" data-wa-chat-action="call" aria-label="Panggilan suara">
        <i class="ph ph-phone"></i>
      </button>
    `;

    existingAction.innerHTML = '<i class="ph ph-dots-three-vertical"></i>';
    existingAction.setAttribute('aria-label', 'Info kontak');
    actions.appendChild(existingAction);
    header.appendChild(actions);

    actions.querySelector('[data-wa-chat-action="video"]')?.addEventListener('click', () => {
      toast('Panggilan video belum tersedia.');
    });
    actions.querySelector('[data-wa-chat-action="call"]')?.addEventListener('click', () => {
      toast('Panggilan suara belum tersedia.');
    });
  }

  function closeEmoji() {
    page()?.querySelector('.wa-emoji-popover')?.remove();
  }

  function insertEmoji(input, emoji) {
    const start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
    const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : start;
    input.value = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`;
    const cursor = start + emoji.length;
    input.setSelectionRange?.(cursor, cursor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }

  function decorateComposer() {
    const p = page();
    const form = p?.querySelector('#socialThreadComposer');
    const shell = form?.querySelector('.chat-input-shell');
    const input = form?.querySelector('#socialThreadInput');
    if (!form || !shell || !input || shell.dataset.waComposerReady === 'true') return;

    shell.dataset.waComposerReady = 'true';

    const emoji = document.createElement('button');
    emoji.type = 'button';
    emoji.className = 'wa-emoji-button';
    emoji.setAttribute('aria-label', 'Emoji');
    emoji.innerHTML = '<i class="ph ph-smiley"></i>';
    shell.insertBefore(emoji, shell.firstChild);

    emoji.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const existing = p.querySelector('.wa-emoji-popover');
      if (existing) {
        existing.remove();
        return;
      }

      const popover = document.createElement('div');
      popover.className = 'wa-emoji-popover';
      popover.innerHTML = EMOJIS.map(item =>
        `<button type="button" data-wa-emoji="${esc(item)}">${item}</button>`
      ).join('');
      form.appendChild(popover);
    });
  }

  async function syncMetadata(force = false) {
    const p = page();
    if (!p || UI.syncBusy) return;

    const now = Date.now();
    if (!force && now - UI.lastSyncAt < 1300) return;

    UI.syncBusy = true;
    UI.lastSyncAt = now;

    try {
      const conversationId = await resolveConversationId();
      if (!conversationId) return;

      const data = await requestJSON(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/rich-meta`
      );

      const rows = currentRows();
      const messages = Array.isArray(data.messages) ? data.messages : [];
      const count = Math.min(rows.length, messages.length);

      for (let offset = 1; offset <= count; offset += 1) {
        decorateMessage(
          rows[rows.length - offset],
          messages[messages.length - offset],
          data.current_user_id
        );
      }
    } catch (error) {
      console.error('[Pasar UMKM] P4.12 chat metadata sync error:', error);
    } finally {
      UI.syncBusy = false;
    }
  }

  function decorate() {
    const p = page();
    if (!p) {
      document.querySelector('.app')?.classList.remove('chat-thread-active');
      UI.conversationId = '';
      UI.otherUserId = '';
      closeEmoji();
      return;
    }

    document.querySelector('.app')?.classList.add('chat-thread-active');
    decorateHeader();
    decorateComposer();
    syncMetadata();
  }

  document.addEventListener('click', event => {
    const emojiButton = event.target.closest?.('[data-wa-emoji]');
    if (emojiButton) {
      const input = page()?.querySelector('#socialThreadInput');
      if (input) insertEmoji(input, emojiButton.dataset.waEmoji || '');
      closeEmoji();
      return;
    }

    if (!event.target.closest?.('.wa-emoji-button, .wa-emoji-popover')) {
      closeEmoji();
    }
  });

  const observer = new MutationObserver(() => {
    clearTimeout(UI.observerTimer);
    UI.observerTimer = setTimeout(decorate, 45);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  UI.timer = window.setInterval(() => {
    if (!document.hidden && page()) {
      decorate();
      syncMetadata(true);
    }
  }, 3000);

  window.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(() => syncMetadata(true), 80);
  });

  setTimeout(decorate, 0);
  setTimeout(() => syncMetadata(true), 500);
})();
