'use strict';

/* =========================================================
   PASAR UMKM - CHAT MEDIA EXPERIENCE
   Attachment ala WhatsApp: galeri, kamera, lokasi, voice note.
   ========================================================= */

(() => {
  if (typeof STATE === 'undefined') return;

  const MEDIA = {
    conversationId: '',
    syncTimer: null,
    syncBusy: false,
    recorder: null,
    recorderStream: null,
    recorderChunks: [],
    recordingStartedAt: 0,
    recordingTimer: null,
    uploading: false
  };

  function toast(message) {
    if (typeof showToast === 'function') showToast(message);
  }

  function esc(value) {
    return typeof escapeHTML === 'function'
      ? escapeHTML(String(value ?? ''))
      : String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
  }

  async function jsonRequest(path, options = {}) {
    const headers = { Accept: 'application/json' };
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

  async function resolveConversationId() {
    const page = threadPage();
    if (!page) {
      MEDIA.conversationId = '';
      return '';
    }

    const profileButton = page.querySelector(
      '[data-social-action="thread-profile"][data-user-id]'
    );
    const otherUserId = String(profileButton?.dataset?.userId || '').trim();

    if (!otherUserId) return MEDIA.conversationId;

    try {
      const data = await jsonRequest(
        `/api/chat/conversations/by-user/${encodeURIComponent(otherUserId)}`
      );
      MEDIA.conversationId = String(data.conversation_id || '');
      return MEDIA.conversationId;
    } catch (error) {
      console.error('[Pasar UMKM] Rich chat conversation resolve error:', error);
      return '';
    }
  }

  function syncVisualViewport() {
    const viewport = window.visualViewport;
    const height = Math.max(280, Math.round(viewport?.height || window.innerHeight || 720));
    const top = Math.max(0, Math.round(viewport?.offsetTop || 0));

    document.documentElement.style.setProperty('--chat-visual-height', `${height}px`);
    document.documentElement.style.setProperty('--chat-visual-top', `${top}px`);
  }

  function updateComposerMode() {
    const page = threadPage();
    if (!page) return;

    const input = page.querySelector('#socialThreadInput');
    const form = page.querySelector('#socialThreadComposer');
    if (!input || !form) return;

    const hasText = String(input.value || '').trim().length > 0;
    form.classList.toggle('chat-has-text', hasText);
  }

  function closeAttachmentPopover() {
    document.querySelector('.chat-attachment-popover')?.remove();
  }

  function attachmentPopover(form) {
    closeAttachmentPopover();

    const popover = document.createElement('div');
    popover.className = 'chat-attachment-popover';
    popover.innerHTML = `
      <button type="button" data-chat-media-action="gallery">
        <span class="chat-attach-icon gallery"><i class="ph-fill ph-images"></i></span>
        <span>Galeri</span>
      </button>
      <button type="button" data-chat-media-action="camera">
        <span class="chat-attach-icon camera"><i class="ph-fill ph-camera"></i></span>
        <span>Kamera</span>
      </button>
      <button type="button" data-chat-media-action="location">
        <span class="chat-attach-icon location"><i class="ph-fill ph-map-pin"></i></span>
        <span>Lokasi</span>
      </button>
    `;
    form.appendChild(popover);
  }

  function ensureComposerControls() {
    const page = threadPage();
    if (!page) return;

    const form = page.querySelector('#socialThreadComposer');
    const input = page.querySelector('#socialThreadInput');
    const send = page.querySelector('#socialThreadSend');
    if (!form || !input || !send) return;

    if (form.dataset.richComposerReady === 'true') {
      updateComposerMode();
      return;
    }

    form.dataset.richComposerReady = 'true';
    form.classList.add('chat-rich-composer');

    const field = document.createElement('div');
    field.className = 'chat-input-shell';

    const attach = document.createElement('button');
    attach.type = 'button';
    attach.className = 'chat-composer-icon chat-attach-toggle';
    attach.dataset.chatMediaAction = 'attachments';
    attach.setAttribute('aria-label', 'Lampirkan');
    attach.innerHTML = '<i class="ph ph-paperclip"></i>';

    const camera = document.createElement('button');
    camera.type = 'button';
    camera.className = 'chat-composer-icon chat-camera-shortcut';
    camera.dataset.chatMediaAction = 'camera';
    camera.setAttribute('aria-label', 'Kamera');
    camera.innerHTML = '<i class="ph ph-camera"></i>';

    const voice = document.createElement('button');
    voice.type = 'button';
    voice.className = 'chat-voice-button';
    voice.dataset.chatMediaAction = 'voice';
    voice.setAttribute('aria-label', 'Voice note');
    voice.innerHTML = '<i class="ph-fill ph-microphone"></i>';

    const galleryInput = document.createElement('input');
    galleryInput.type = 'file';
    galleryInput.accept = 'image/jpeg,image/png,image/webp';
    galleryInput.className = 'chat-hidden-input';
    galleryInput.dataset.chatMediaInput = 'gallery';

    const cameraInput = document.createElement('input');
    cameraInput.type = 'file';
    cameraInput.accept = 'image/jpeg,image/png,image/webp';
    cameraInput.setAttribute('capture', 'environment');
    cameraInput.className = 'chat-hidden-input';
    cameraInput.dataset.chatMediaInput = 'camera';

    input.parentNode.insertBefore(field, input);
    field.appendChild(attach);
    field.appendChild(input);
    field.appendChild(camera);

    form.insertBefore(voice, send.nextSibling);
    form.appendChild(galleryInput);
    form.appendChild(cameraInput);

    input.addEventListener('input', updateComposerMode);
    input.addEventListener('focus', () => {
      closeAttachmentPopover();
      requestAnimationFrame(syncVisualViewport);
      setTimeout(syncVisualViewport, 80);
      setTimeout(syncVisualViewport, 250);
    });

    updateComposerMode();
    syncVisualViewport();
  }

  async function uploadFile(file, kind) {
    if (!file || MEDIA.uploading) return null;

    const conversationId = MEDIA.conversationId || await resolveConversationId();
    if (!conversationId) throw new Error('Percakapan belum tersedia.');

    MEDIA.uploading = true;

    try {
      const form = new FormData();
      form.append('file', file, file.name || (kind === 'audio' ? 'voice.webm' : 'chat.jpg'));
      form.append('kind', kind);
      form.append('conversation_id', conversationId);

      const response = await fetch('/api/chat/media/upload', {
        method: 'POST',
        credentials: 'include',
        body: form
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.ok !== true) {
        throw new Error(data.error || 'Media gagal diunggah.');
      }

      return data.media
        ? { ...data.media, conversation_id: conversationId }
        : null;
    } finally {
      MEDIA.uploading = false;
    }
  }

  async function cleanupUploadedMedia(media) {
    const conversationId = String(media?.conversation_id || '').trim();
    const mediaUrl = String(media?.url || '').trim();
    if (!conversationId || !mediaUrl) return;

    try {
      await jsonRequest('/api/chat/media/cleanup', {
        method: 'POST',
        body: {
          conversation_id: conversationId,
          media_url: mediaUrl
        }
      });
    } catch (error) {
      if (error?.status !== 409) {
        console.error('[Pasar UMKM] Unused chat media cleanup error:', error);
      }
    }
  }

  async function sendRich(payload, fixedConversationId = '') {
    const conversationId =
      String(fixedConversationId || '').trim() ||
      MEDIA.conversationId ||
      await resolveConversationId();
    if (!conversationId) throw new Error('Percakapan belum tersedia.');

    const data = await jsonRequest(
      `/api/chat/conversations/${encodeURIComponent(conversationId)}/rich-message`,
      { method: 'POST', body: payload }
    );

    appendOptimisticMessage(data.message);
    scheduleRichSync();
    window.refreshSocialUnreadBadge?.();
    return data.message;
  }

  function richContent(message) {
    const type = String(message?.message_type || 'text');

    if (type === 'image' && message.media_url) {
      return `
        <button type="button" class="chat-photo-message" data-chat-open-media="${esc(message.media_url)}">
          <img src="${esc(message.media_url)}" alt="Foto chat" loading="lazy" decoding="async">
        </button>
      `;
    }

    if (type === 'audio' && message.media_url) {
      return `
        <div class="chat-voice-message">
          <span class="chat-voice-avatar"><i class="ph-fill ph-microphone"></i></span>
          <audio controls preload="metadata" src="${esc(message.media_url)}"></audio>
        </div>
      `;
    }

    if (type === 'location' && Number.isFinite(Number(message.latitude)) && Number.isFinite(Number(message.longitude))) {
      const lat = Number(message.latitude).toFixed(6);
      const lng = Number(message.longitude).toFixed(6);
      const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
      return `
        <a class="chat-location-message" href="${esc(mapUrl)}" target="_blank" rel="noopener noreferrer">
          <span class="chat-location-map"><i class="ph-fill ph-map-pin"></i></span>
          <span class="chat-location-copy">
            <strong>Lokasi dibagikan</strong>
            <small>${esc(lat)}, ${esc(lng)}</small>
          </span>
        </a>
      `;
    }

    return null;
  }

  function appendOptimisticMessage(message) {
    const container = threadPage()?.querySelector('[data-social-thread-messages]');
    if (!container || !message) return;

    container.querySelector('.social-page-empty')?.remove();

    const row = document.createElement('div');
    row.className = 'social-message-row mine';
    row.dataset.messageId = String(message.id || '');
    row.dataset.messageMine = 'true';
    row.dataset.richOptimistic = 'true';

    const time = new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(message.created_at || Date.now()));

    row.innerHTML = `
      <div class="social-message-bubble">
        <div class="social-message-text">${richContent(message) || esc(message.message || '')}</div>
        <div class="social-message-foot"><span>${esc(time)}</span><i class="ph ph-checks"></i></div>
      </div>
    `;

    container.appendChild(row);
    requestAnimationFrame(() => row.scrollIntoView({ block: 'end' }));
  }

  function decorateRichRow(row, message, currentUserId) {
    if (!row || !message) return;

    row.dataset.messageId = String(message.id || '');
    row.dataset.messageMine = String(message.sender_id || '') === String(currentUserId || '') ? 'true' : 'false';

    const content = richContent(message);
    if (!content) return;

    const text = row.querySelector('.social-message-text');
    if (!text) return;

    const signature = `${message.id}:${message.message_type}:${message.media_url || ''}:${message.latitude || ''}:${message.longitude || ''}`;
    if (text.dataset.richSignature === signature) return;

    text.innerHTML = content;
    text.dataset.richSignature = signature;
    row.classList.add('chat-rich-message-row');
  }

  async function syncRichMessages() {
    if (MEDIA.syncBusy) return;
    const page = threadPage();
    if (!page) return;

    MEDIA.syncBusy = true;
    try {
      const conversationId = MEDIA.conversationId || await resolveConversationId();
      if (!conversationId) return;

      const data = await jsonRequest(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/rich-meta`
      );

      const rows = [...page.querySelectorAll('.social-message-row')];
      const messages = Array.isArray(data.messages) ? data.messages : [];
      const count = Math.min(rows.length, messages.length);

      for (let offset = 1; offset <= count; offset += 1) {
        decorateRichRow(
          rows[rows.length - offset],
          messages[messages.length - offset],
          data.current_user_id
        );
      }
    } catch (error) {
      console.error('[Pasar UMKM] Rich message sync error:', error);
    } finally {
      MEDIA.syncBusy = false;
    }
  }

  function scheduleRichSync() {
    clearTimeout(MEDIA.syncTimer);
    MEDIA.syncTimer = setTimeout(syncRichMessages, 120);
  }

  async function handleImage(file) {
    if (!file) return;

    let media = null;

    try {
      toast('Mengunggah foto...');
      media = await uploadFile(file, 'image');
      if (!media?.url) throw new Error('Foto gagal diunggah.');

      await sendRich({
        type: 'image',
        media_url: media.url,
        media_name: media.original_filename || file.name || 'Foto'
      }, media.conversation_id);
      toast('Foto terkirim.');
    } catch (error) {
      if (media?.url) await cleanupUploadedMedia(media);
      toast(error.message || 'Foto belum dapat dikirim.');
    }
  }

  async function shareLocation() {
    closeAttachmentPopover();

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
          toast('Lokasi terkirim.');
        } catch (error) {
          toast(error.message || 'Lokasi belum dapat dikirim.');
        }
      },
      error => {
        console.error('[Pasar UMKM] Geolocation error:', error);
        toast('Izin lokasi diperlukan untuk membagikan lokasi.');
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000
      }
    );
  }

  function preferredAudioType() {
    if (typeof MediaRecorder === 'undefined') return '';

    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ];

    return candidates.find(type => MediaRecorder.isTypeSupported?.(type)) || '';
  }

  function stopRecorderTracks() {
    MEDIA.recorderStream?.getTracks?.().forEach(track => track.stop());
    MEDIA.recorderStream = null;
  }

  function setRecordingUI(active) {
    const page = threadPage();
    const form = page?.querySelector('#socialThreadComposer');
    const input = page?.querySelector('#socialThreadInput');
    const voice = page?.querySelector('.chat-voice-button');

    form?.classList.toggle('is-recording', active);
    if (voice) {
      voice.innerHTML = active
        ? '<i class="ph-fill ph-stop"></i>'
        : '<i class="ph-fill ph-microphone"></i>';
      voice.setAttribute('aria-label', active ? 'Hentikan dan kirim voice note' : 'Voice note');
    }

    if (input) {
      input.placeholder = active ? 'Merekam voice note...' : 'Tulis pesan...';
      input.disabled = active;
    }
  }

  function updateRecordingTimer() {
    const form = threadPage()?.querySelector('#socialThreadComposer');
    if (!form || !MEDIA.recordingStartedAt) return;

    const seconds = Math.floor((Date.now() - MEDIA.recordingStartedAt) / 1000);
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    form.dataset.recordingTime = `${mm}:${ss}`;
  }

  async function startVoiceNote() {
    if (MEDIA.recorder?.state === 'recording') {
      MEDIA.recorder.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast('Browser ini belum mendukung voice note.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredAudioType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      MEDIA.recorderStream = stream;
      MEDIA.recorder = recorder;
      MEDIA.recorderChunks = [];
      MEDIA.recordingStartedAt = Date.now();

      recorder.addEventListener('dataavailable', event => {
        if (event.data?.size) MEDIA.recorderChunks.push(event.data);
      });

      recorder.addEventListener('stop', async () => {
        const durationSeconds = Math.max(
          1,
          Math.round((Date.now() - MEDIA.recordingStartedAt) / 1000)
        );
        clearInterval(MEDIA.recordingTimer);
        MEDIA.recordingTimer = null;
        setRecordingUI(false);
        stopRecorderTracks();

        const blob = new Blob(MEDIA.recorderChunks, {
          type: recorder.mimeType || MEDIA.recorderChunks[0]?.type || 'audio/webm'
        });
        MEDIA.recorderChunks = [];
        MEDIA.recorder = null;
        MEDIA.recordingStartedAt = 0;

        if (!blob.size) {
          toast('Voice note kosong.');
          return;
        }

        let media = null;

        try {
          toast('Mengirim voice note...');
          const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
          const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type });
          media = await uploadFile(file, 'audio');
          if (!media?.url) throw new Error('Voice note gagal diunggah.');

          await sendRich({
            type: 'audio',
            media_url: media.url,
            media_name: file.name,
            duration_seconds: durationSeconds
          }, media.conversation_id);
          toast('Voice note terkirim.');
        } catch (error) {
          if (media?.url) await cleanupUploadedMedia(media);
          toast(error.message || 'Voice note belum dapat dikirim.');
        }
      });

      recorder.start(250);
      setRecordingUI(true);
      updateRecordingTimer();
      MEDIA.recordingTimer = setInterval(updateRecordingTimer, 500);
    } catch (error) {
      console.error('[Pasar UMKM] Voice note permission error:', error);
      stopRecorderTracks();
      toast('Izin mikrofon diperlukan untuk voice note.');
    }
  }

  function handleMediaAction(button) {
    const action = button.dataset.chatMediaAction;
    const page = threadPage();
    if (!page) return;

    if (action === 'attachments') {
      const form = page.querySelector('#socialThreadComposer');
      if (form) {
        page.querySelector('#socialThreadInput')?.blur();
        attachmentPopover(form);
      }
      return;
    }

    if (action === 'gallery') {
      closeAttachmentPopover();
      page.querySelector('[data-chat-media-input="gallery"]')?.click();
      return;
    }

    if (action === 'camera') {
      closeAttachmentPopover();
      page.querySelector('[data-chat-media-input="camera"]')?.click();
      return;
    }

    if (action === 'location') {
      shareLocation();
      return;
    }

    if (action === 'voice') {
      startVoiceNote();
    }
  }

  document.addEventListener('click', event => {
    const mediaAction = event.target.closest('[data-chat-media-action]');
    if (mediaAction) {
      event.preventDefault();
      event.stopPropagation();
      handleMediaAction(mediaAction);
      return;
    }

    const openMedia = event.target.closest('[data-chat-open-media]');
    if (openMedia) {
      event.preventDefault();
      const url = String(openMedia.dataset.chatOpenMedia || '');
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (!event.target.closest('.chat-attachment-popover, .chat-attach-toggle')) {
      closeAttachmentPopover();
    }
  }, true);

  document.addEventListener('change', event => {
    const input = event.target.closest('[data-chat-media-input]');
    if (!input) return;

    const file = input.files?.[0] || null;
    input.value = '';
    if (file) handleImage(file);
  });

  const observer = new MutationObserver(() => {
    if (!threadPage()) {
      MEDIA.conversationId = '';
      closeAttachmentPopover();
      return;
    }

    ensureComposerControls();
    syncVisualViewport();
    scheduleRichSync();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  window.visualViewport?.addEventListener('resize', syncVisualViewport);
  window.visualViewport?.addEventListener('scroll', syncVisualViewport);
  window.addEventListener('resize', syncVisualViewport);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && threadPage()) {
      ensureComposerControls();
      syncVisualViewport();
      scheduleRichSync();
    }
  });

  ensureComposerControls();
  syncVisualViewport();
  scheduleRichSync();
})();
