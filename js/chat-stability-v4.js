'use strict';

/* =========================================================
   PASAR UMKM - CHAT STABILITY V4
   Fixes rich-media flicker, touch deletion, image payload size,
   and Android-friendly voice-note recording without replacing
   the legacy social/chat controller.
   ========================================================= */

(() => {
  const STABLE = {
    conversationId: '',
    otherUserId: '',
    currentUserId: '',
    messages: [],
    seenMessageIds: new Set(),
    syncTimer: null,
    syncBusy: false,
    applying: false,
    preload: new Map(),
    recording: null,
    recordChunks: [],
    recordStream: null,
    recordStartedAt: 0,
    recordTimer: null,
    pressTimer: null,
    pressRow: null,
    pressX: 0,
    pressY: 0,
    uploadBusy: false
  };

  function toast(message) {
    if (typeof showToast === 'function') showToast(message);
  }

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

  async function requestJSON(path, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
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
      const error = new Error(data.error || 'Aksi chat belum dapat diproses.');
      error.status = response.status;
      throw error;
    }

    return data;
  }

  function threadPage() {
    return document.querySelector('.social-conversation-page');
  }

  function messageContainer() {
    return threadPage()?.querySelector('[data-social-thread-messages]') || null;
  }

  function readOtherUserId() {
    return String(
      threadPage()?.querySelector(
        '[data-social-action="thread-profile"][data-user-id]'
      )?.dataset?.userId || ''
    ).trim();
  }

  async function resolveConversationId() {
    const otherUserId = readOtherUserId();
    if (!otherUserId) return '';

    if (
      STABLE.conversationId &&
      STABLE.otherUserId === otherUserId
    ) {
      return STABLE.conversationId;
    }

    const data = await requestJSON(
      `/api/chat/conversations/by-user/${encodeURIComponent(otherUserId)}`
    );

    STABLE.otherUserId = otherUserId;
    STABLE.conversationId = String(data.conversation_id || '').trim();
    STABLE.messages = [];
    STABLE.currentUserId = '';
    return STABLE.conversationId;
  }

  function preloadImage(url) {
    const clean = String(url || '').trim();
    if (!clean || STABLE.preload.has(clean)) return;

    const img = new Image();
    img.decoding = 'async';
    img.src = clean;
    const promise = typeof img.decode === 'function'
      ? img.decode().catch(() => null)
      : Promise.resolve();

    STABLE.preload.set(clean, promise);
  }

  function richHTML(message) {
    const type = String(message?.message_type || 'text').toLowerCase();

    if (type === 'image' && message.media_url) {
      preloadImage(message.media_url);
      return `
        <button
          type="button"
          class="chat-stable-photo chat-photo-message"
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
    }

    if (type === 'audio' && message.media_url) {
      return `
        <div class="chat-stable-voice chat-voice-message">
          <span class="chat-stable-voice-icon chat-voice-avatar">
            <i class="ph-fill ph-microphone"></i>
          </span>
          <audio
            controls
            preload="metadata"
            src="${esc(message.media_url)}"
          ></audio>
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
        <a
          class="chat-stable-location chat-location-message"
          href="${esc(mapUrl)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="chat-stable-location-map chat-location-map">
            <i class="ph-fill ph-map-pin"></i>
          </span>
          <span class="chat-location-copy">
            <strong>Lokasi dibagikan</strong>
            <small>${esc(lat)}, ${esc(lng)}</small>
          </span>
        </a>
      `;
    }

    return '';
  }

  function applyCachedMessages() {
    if (STABLE.applying) return;

    const container = messageContainer();
    if (!container || !STABLE.messages.length) return;

    STABLE.applying = true;

    try {
      const rows = [...container.querySelectorAll('.social-message-row')];
      const messages = STABLE.messages;
      const count = Math.min(rows.length, messages.length);

      for (let offset = 1; offset <= count; offset += 1) {
        const row = rows[rows.length - offset];
        const message = messages[messages.length - offset];
        const id = String(message?.id || '').trim();
        if (!id) continue;

        const isMine =
          String(message.sender_id || '') === String(STABLE.currentUserId || '');

        row.dataset.messageId = id;
        row.dataset.messageMine = isMine ? 'true' : 'false';

        if (!STABLE.seenMessageIds.has(id)) {
          STABLE.seenMessageIds.add(id);
          row.classList.add('chat-stable-new');
          window.setTimeout(() => row.classList.remove('chat-stable-new'), 220);
        }

        const content = richHTML(message);
        const text = row.querySelector('.social-message-text');
        const signature = [
          id,
          message.message_type || 'text',
          message.media_url || '',
          message.latitude || '',
          message.longitude || ''
        ].join(':');

        if (!content || !text) {
          row.classList.remove('chat-stable-rich');
          row.dataset.chatStableSignature = signature;
          continue;
        }

        row.classList.add('chat-stable-rich', 'chat-rich-message-row');

        if (row.dataset.chatStableSignature !== signature) {
          text.innerHTML = content;
          row.dataset.chatStableSignature = signature;
        }
      }
    } finally {
      STABLE.applying = false;
    }
  }

  async function syncMeta() {
    if (STABLE.syncBusy || !threadPage()) return;
    STABLE.syncBusy = true;

    try {
      const conversationId = await resolveConversationId();
      if (!conversationId) return;

      const data = await requestJSON(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/rich-meta`
      );

      STABLE.currentUserId = String(data.current_user_id || '').trim();
      STABLE.messages = Array.isArray(data.messages) ? data.messages : [];

      for (const message of STABLE.messages) {
        if (message?.message_type === 'image' && message.media_url) {
          preloadImage(message.media_url);
        }
      }

      applyCachedMessages();
    } catch (error) {
      console.error('[Pasar UMKM] Chat stability sync error:', error);
    } finally {
      STABLE.syncBusy = false;
    }
  }

  function scheduleSync(delay = 80) {
    clearTimeout(STABLE.syncTimer);
    STABLE.syncTimer = window.setTimeout(syncMeta, delay);
  }

  function blobFromCanvas(canvas, type, quality) {
    return new Promise(resolve => {
      canvas.toBlob(resolve, type, quality);
    });
  }

  async function compressImage(file) {
    if (!(file instanceof File) || !String(file.type || '').startsWith('image/')) {
      return file;
    }

    let bitmap = null;
    let revokeUrl = '';

    try {
      if ('createImageBitmap' in window) {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      } else {
        const url = URL.createObjectURL(file);
        revokeUrl = url;
        const img = new Image();
        img.decoding = 'async';
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = url;
        });
        bitmap = img;
      }

      const sourceWidth = Number(bitmap.width || bitmap.naturalWidth || 0);
      const sourceHeight = Number(bitmap.height || bitmap.naturalHeight || 0);
      if (!sourceWidth || !sourceHeight) return file;

      const maxSide = 1440;
      const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));

      if (scale === 1 && file.size <= 900 * 1024) {
        return file;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return file;

      ctx.drawImage(bitmap, 0, 0, width, height);

      let blob = await blobFromCanvas(canvas, 'image/webp', 0.78);
      let extension = 'webp';

      if (!blob || !blob.size) {
        blob = await blobFromCanvas(canvas, 'image/jpeg', 0.80);
        extension = 'jpg';
      }

      if (!blob || !blob.size || blob.size >= file.size) {
        return file;
      }

      const base = String(file.name || 'foto')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9_-]+/gi, '-')
        .slice(0, 80) || 'foto';

      return new File(
        [blob],
        `${base}-chat.${extension}`,
        { type: blob.type || (extension === 'webp' ? 'image/webp' : 'image/jpeg') }
      );
    } catch (error) {
      console.warn('[Pasar UMKM] Chat image compression fallback:', error);
      return file;
    } finally {
      if (typeof bitmap?.close === 'function') bitmap.close();
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    }
  }

  async function uploadMedia(file, kind, conversationId) {
    const form = new FormData();
    form.append('file', file, file.name || (kind === 'audio' ? 'voice.webm' : 'chat.jpg'));
    form.append('kind', kind);
    form.append('conversation_id', conversationId);

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
  }

  async function sendRich(conversationId, payload) {
    const data = await requestJSON(
      `/api/chat/conversations/${encodeURIComponent(conversationId)}/rich-message`,
      { method: 'POST', body: payload }
    );

    if (data.message) {
      const id = String(data.message.id || '');
      STABLE.messages = [
        ...STABLE.messages.filter(item => String(item.id || '') !== id),
        data.message
      ].sort((a, b) => {
        const ta = new Date(a.created_at || 0).getTime();
        const tb = new Date(b.created_at || 0).getTime();
        if (ta !== tb) return ta - tb;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });
    }

    scheduleSync(20);
    window.refreshSocialUnreadBadge?.();
    return data.message || null;
  }

  function appendOptimisticRich(message) {
    const container = messageContainer();
    if (!container || !message) return;

    container.querySelector('.social-page-empty')?.remove();

    const row = document.createElement('div');
    row.className = 'social-message-row mine chat-stable-rich chat-rich-message-row chat-stable-new';
    row.dataset.messageId = String(message.id || '');
    row.dataset.messageMine = 'true';
    row.dataset.chatStableSignature = [
      message.id || '',
      message.message_type || '',
      message.media_url || '',
      message.latitude || '',
      message.longitude || ''
    ].join(':');

    const time = new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(message.created_at || Date.now()));

    row.innerHTML = `
      <div class="social-message-bubble">
        <div class="social-message-text">${richHTML(message) || esc(message.message || '')}</div>
        <div class="social-message-foot">
          <span>${esc(time)}</span>
          <i class="ph ph-checks"></i>
        </div>
      </div>
    `;

    container.appendChild(row);
    STABLE.seenMessageIds.add(String(message.id || ''));
    requestAnimationFrame(() => row.scrollIntoView({ block: 'end', behavior: 'smooth' }));
    window.setTimeout(() => row.classList.remove('chat-stable-new'), 220);
  }

  async function handleImageInput(input, file) {
    if (STABLE.uploadBusy || !file) return;
    STABLE.uploadBusy = true;

    try {
      const conversationId = await resolveConversationId();
      if (!conversationId) throw new Error('Percakapan belum tersedia.');

      toast('Menyiapkan foto...');
      const optimized = await compressImage(file);
      toast('Mengirim foto...');
      const media = await uploadMedia(optimized, 'image', conversationId);
      const message = await sendRich(conversationId, {
        type: 'image',
        media_url: media.url,
        media_name: media.original_filename || optimized.name || 'Foto'
      });

      if (message) appendOptimisticRich(message);
      toast('Foto terkirim.');
    } catch (error) {
      console.error('[Pasar UMKM] Stable image upload error:', error);
      toast(error.message || 'Foto belum dapat dikirim.');
    } finally {
      STABLE.uploadBusy = false;
      if (input) input.value = '';
    }
  }

  function recordingUI(active) {
    const form = threadPage()?.querySelector('#socialThreadComposer');
    const input = threadPage()?.querySelector('#socialThreadInput');
    const button = threadPage()?.querySelector('.chat-voice-button');

    form?.classList.toggle('chat-stable-recording', active);
    form?.classList.toggle('is-recording', active);

    if (button) {
      button.innerHTML = active
        ? '<i class="ph-fill ph-stop"></i>'
        : '<i class="ph-fill ph-microphone"></i>';
      button.setAttribute('aria-label', active ? 'Hentikan dan kirim voice note' : 'Voice note');
    }

    if (input) {
      input.disabled = active;
      input.placeholder = active ? 'Merekam voice note...' : 'Tulis pesan...';
    }
  }

  function stopRecordingTracks() {
    for (const track of STABLE.recordStream?.getTracks?.() || []) {
      try { track.stop(); } catch { /* noop */ }
    }
    STABLE.recordStream = null;
  }

  function updateRecordTimer() {
    const form = threadPage()?.querySelector('#socialThreadComposer');
    if (!form || !STABLE.recordStartedAt) return;
    const seconds = Math.max(0, Math.floor((Date.now() - STABLE.recordStartedAt) / 1000));
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    form.dataset.recordingTime = `${mm}:${ss}`;
  }

  function recorderFor(stream) {
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
        // Try the next type.
      }
    }

    return new MediaRecorder(stream);
  }

  async function startVoice() {
    if (STABLE.recording?.state === 'recording') {
      try { STABLE.recording.requestData?.(); } catch { /* noop */ }
      STABLE.recording.stop();
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
      const conversationId = await resolveConversationId();
      if (!conversationId) throw new Error('Percakapan belum tersedia.');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      });

      const recorder = recorderFor(stream);
      STABLE.recordStream = stream;
      STABLE.recording = recorder;
      STABLE.recordChunks = [];
      STABLE.recordStartedAt = Date.now();

      recorder.addEventListener('dataavailable', event => {
        if (event.data?.size) STABLE.recordChunks.push(event.data);
      });

      recorder.addEventListener('error', event => {
        console.error('[Pasar UMKM] Voice recorder error:', event.error || event);
      });

      recorder.addEventListener('stop', async () => {
        const duration = Math.max(1, Math.round((Date.now() - STABLE.recordStartedAt) / 1000));
        clearInterval(STABLE.recordTimer);
        STABLE.recordTimer = null;
        recordingUI(false);
        stopRecordingTracks();

        const type = String(
          recorder.mimeType || STABLE.recordChunks[0]?.type || 'audio/webm'
        ).split(';')[0] || 'audio/webm';
        const blob = new Blob(STABLE.recordChunks, { type });

        STABLE.recordChunks = [];
        STABLE.recording = null;
        STABLE.recordStartedAt = 0;

        if (blob.size < 128) {
          toast('Voice note kosong. Coba rekam sedikit lebih lama.');
          return;
        }

        let extension = 'webm';
        if (type.includes('mp4')) extension = 'm4a';
        else if (type.includes('ogg')) extension = 'ogg';
        else if (type.includes('mpeg')) extension = 'mp3';
        else if (type.includes('wav')) extension = 'wav';

        try {
          toast('Mengirim voice note...');
          const file = new File([blob], `voice-${Date.now()}.${extension}`, { type });
          const media = await uploadMedia(file, 'audio', conversationId);
          const message = await sendRich(conversationId, {
            type: 'audio',
            media_url: media.url,
            media_name: media.original_filename || file.name,
            duration_seconds: duration
          });

          if (message) appendOptimisticRich(message);
          toast('Voice note terkirim.');
        } catch (error) {
          console.error('[Pasar UMKM] Stable voice upload error:', error);
          toast(error.message || 'Voice note belum dapat dikirim.');
        }
      }, { once: true });

      recorder.start(250);
      recordingUI(true);
      updateRecordTimer();
      STABLE.recordTimer = window.setInterval(updateRecordTimer, 500);
      toast('Merekam voice note... tekan lagi untuk mengirim.');
    } catch (error) {
      console.error('[Pasar UMKM] Stable voice start error:', error);
      stopRecordingTracks();
      STABLE.recording = null;
      recordingUI(false);

      if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
        toast('Izinkan mikrofon untuk mengirim voice note.');
      } else {
        toast(error.message || 'Voice note belum dapat dimulai.');
      }
    }
  }

  function closeSheet() {
    if (typeof closeBottomSheet === 'function') closeBottomSheet();
  }

  function openDeleteMenu(row) {
    const messageId = String(row?.dataset?.messageId || '').trim();
    if (!messageId) {
      scheduleSync(0);
      toast('Data pesan sedang disiapkan. Tahan lagi sebentar.');
      return;
    }

    const mine = row.dataset.messageMine === 'true';
    if (typeof openBottomSheet !== 'function') return;

    openBottomSheet(
      `
        <section class="chat-action-sheet">
          <h2 id="sheetTitle">Hapus Pesan</h2>
          <p class="chat-action-hint">Pilih bagaimana pesan ini dihapus.</p>

          <button
            type="button"
            class="menu-sheet-btn"
            data-chat-stable-delete="delete_me"
            data-message-id="${esc(messageId)}"
          >
            <i class="ph ph-trash"></i>
            Hapus untuk saya
          </button>

          ${mine ? `
            <button
              type="button"
              class="menu-sheet-btn chat-danger-action"
              data-chat-stable-delete="delete_everyone"
              data-message-id="${esc(messageId)}"
            >
              <i class="ph ph-trash-simple"></i>
              Hapus untuk semua
            </button>
          ` : ''}
        </section>
      `,
      'chat-stable-message-actions'
    );
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

      closeSheet();
      document.querySelector(
        `.social-message-row[data-message-id="${CSS.escape(messageId)}"]`
      )?.remove();

      STABLE.messages = STABLE.messages.filter(
        item => String(item.id || '') !== String(messageId)
      );
      STABLE.seenMessageIds.delete(String(messageId));
      scheduleSync(80);

      toast(action === 'delete_everyone'
        ? 'Pesan dihapus untuk semua.'
        : 'Pesan dihapus untuk Anda.');
      window.refreshSocialUnreadBadge?.();
    } catch (error) {
      console.error('[Pasar UMKM] Stable delete error:', error);
      toast(error.message || 'Pesan belum dapat dihapus.');
    }
  }

  function cancelPress() {
    clearTimeout(STABLE.pressTimer);
    STABLE.pressTimer = null;
    STABLE.pressRow = null;
  }

  function onPointerDown(event) {
    const row = event.target?.closest?.('.social-message-row');
    if (!row || !threadPage()) return;

    // Prevent the legacy document-level long-press handler from starting.
    event.stopPropagation();

    cancelPress();
    STABLE.pressRow = row;
    STABLE.pressX = Number(event.clientX || 0);
    STABLE.pressY = Number(event.clientY || 0);

    STABLE.pressTimer = window.setTimeout(() => {
      const target = STABLE.pressRow;
      STABLE.pressTimer = null;
      STABLE.pressRow = null;
      if (navigator.vibrate) navigator.vibrate(24);
      openDeleteMenu(target);
    }, 390);
  }

  function onPointerMove(event) {
    if (!STABLE.pressTimer) return;
    const dx = Math.abs(Number(event.clientX || 0) - STABLE.pressX);
    const dy = Math.abs(Number(event.clientY || 0) - STABLE.pressY);
    if (dx > 18 || dy > 18) cancelPress();
  }

  function onClickCapture(event) {
    const deleteButton = event.target?.closest?.('[data-chat-stable-delete]');
    if (deleteButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      deleteMessage(
        String(deleteButton.dataset.messageId || ''),
        String(deleteButton.dataset.chatStableDelete || '')
      );
      return;
    }

    const voiceButton = event.target?.closest?.('.chat-voice-button');
    if (voiceButton && threadPage()) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      startVoice();
    }
  }

  function onChangeCapture(event) {
    const input = event.target?.closest?.('[data-chat-media-input]');
    if (!input || !threadPage()) return;

    const file = input.files?.[0] || null;
    if (!file) return;

    // Own the image flow so the legacy uploader cannot send the original multi-MB file.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    handleImageInput(input, file);
  }

  const observer = new MutationObserver(() => {
    if (!threadPage()) {
      STABLE.conversationId = '';
      STABLE.otherUserId = '';
      STABLE.currentUserId = '';
      STABLE.messages = [];
      cancelPress();
      return;
    }

    // MutationObserver runs before paint. Reapply cached rich media immediately
    // when the legacy poll replaces container.innerHTML.
    applyCachedMessages();
    scheduleSync(90);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Window capture runs before legacy document-capture listeners.
  window.addEventListener('click', onClickCapture, true);
  window.addEventListener('change', onChangeCapture, true);
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', cancelPress, true);
  window.addEventListener('pointercancel', cancelPress, true);
  window.addEventListener('contextmenu', event => {
    const row = event.target?.closest?.('.social-message-row');
    if (!row || !threadPage()) return;
    event.preventDefault();
    openDeleteMenu(row);
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && threadPage()) scheduleSync(0);
  });

  scheduleSync(0);
})();
