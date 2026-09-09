'use strict';

/* PASAR UMKM - REELS ADVANCED CREATOR V4 (R6 + R10) */
(() => {
  if (window.PasarReelsAdvancedV4?.version === '4.0') return;

  const BASE = '/api/reels-v4';
  const ADVANCED = `${BASE}/advanced`;
  const metadataCache = new Map();
  let libraryPromise = null;
  let metadataTimer = 0;
  let composerOverlays = [];
  let synth = null;
  let audioContext = null;

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toast(message) {
    window.showToast?.(message);
  }

  async function request(path, options = {}) {
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
      const error = new Error(data.error || 'Fitur Reels belum dapat diproses.');
      error.status = response.status;
      error.code = data.code;
      throw error;
    }
    return data;
  }

  function activeUserId() {
    return String(window.STATE?.user?.id || '');
  }

  function loadAudioLibrary() {
    if (!libraryPromise) {
      libraryPromise = request(`${ADVANCED}/audio-library`)
        .then(data => data.tracks || [])
        .catch(error => {
          libraryPromise = null;
          throw error;
        });
    }
    return libraryPromise;
  }

  async function loadMetadata(ids) {
    const unique = [...new Set(ids.map(String).filter(Boolean))].filter(id => !metadataCache.has(id));
    if (!unique.length) return;
    const data = await request(`${ADVANCED}/metadata?ids=${encodeURIComponent(unique.slice(0, 30).join(','))}`);
    for (const item of data.metadata || []) metadataCache.set(String(item.id), item);
    for (const id of unique) if (!metadataCache.has(id)) metadataCache.set(id, null);
  }

  function overlayMarkup(item, index) {
    return `<span class="reels-v4-text-overlay reels-v4-text-${esc(item.position || 'center')} reels-v4-text-${esc(item.size || 'medium')}" data-overlay-index="${index}" data-overlay-start="${Number(item.start || 0)}" data-overlay-end="${Number(item.end || 5)}" hidden>${esc(item.text || '')}</span>`;
  }

  function renderCardAdvanced(card, meta) {
    if (!card || !meta) return;
    card.dataset.advancedDecorated = 'true';
    let layer = card.querySelector('.reels-v4-text-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'reels-v4-text-layer';
      layer.setAttribute('aria-hidden', 'true');
      card.appendChild(layer);
    }
    const overlays = Array.isArray(meta.text_overlays) ? meta.text_overlays : [];
    layer.innerHTML = overlays.map(overlayMarkup).join('');

    if (meta.audio_track_key) {
      const label = card.querySelector('.reels-v4-audio-label');
      if (label) label.innerHTML = `<i class="ph ph-music-note"></i>${esc(meta.audio_track_label || 'Audio Pasar')} <small>• dibuat platform</small>`;
    }

    const author = card.querySelector('.reels-v4-author');
    const sellerId = String(author?.dataset.userId || '');
    const content = card.querySelector('.reels-v4-content');
    if (sellerId && sellerId !== activeUserId() && content && !content.querySelector('[data-r4-advanced-action="chat-seller"]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'reels-v4-chat-seller';
      button.dataset.r4AdvancedAction = 'chat-seller';
      button.dataset.userId = sellerId;
      button.dataset.reelId = String(card.dataset.reelId || '');
      button.innerHTML = '<i class="ph ph-chat-circle-dots"></i><span>Chat Penjual</span>';
      content.appendChild(button);
    }
  }

  function decorateCards() {
    const cards = [...document.querySelectorAll('.reels-v4-card[data-reel-id]')];
    if (!cards.length) return;
    const missing = cards.map(card => card.dataset.reelId).filter(id => !metadataCache.has(String(id)));
    if (missing.length) {
      clearTimeout(metadataTimer);
      metadataTimer = setTimeout(async () => {
        try {
          await loadMetadata(missing);
          decorateCards();
        } catch (error) {
          console.error('[Pasar UMKM] Reels advanced metadata:', error);
        }
      }, 40);
    }
    for (const card of cards) {
      const id = String(card.dataset.reelId);
      renderCardAdvanced(card, metadataCache.get(id) || { text_overlays: [] });
    }
  }

  function syncTextOverlays(video) {
    const card = video.closest('.reels-v4-card');
    if (!card) return;
    const current = Number(video.currentTime || 0);
    card.querySelectorAll('.reels-v4-text-overlay').forEach(node => {
      const start = Number(node.dataset.overlayStart || 0);
      const end = Number(node.dataset.overlayEnd || 0);
      node.hidden = !(current >= start && current <= end);
    });
  }

  function stopSynth() {
    if (!synth) return;
    try { synth.oscillators.forEach(node => node.stop()); } catch {}
    try { synth.lfo?.stop(); } catch {}
    try { synth.gain?.disconnect(); } catch {}
    synth = null;
  }

  function synthProfile(meta) {
    if (!meta?.audio_track_key) return null;
    if (meta.synth_profile === 'calm') return { root: 146.83, fifth: 220, lfo: 1.35 };
    if (meta.synth_profile === 'bright') return { root: 261.63, fifth: 392, lfo: 2.05 };
    return { root: 196, fifth: 293.66, lfo: 1.8 };
  }

  async function startSynth(card, meta) {
    const profile = synthProfile(meta);
    const video = card?.querySelector('.reels-v4-video');
    if (!profile || !video || video.muted || video.paused) {
      stopSynth();
      return;
    }
    if (synth?.reelId === String(card.dataset.reelId)) return;
    stopSynth();
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    audioContext ||= new AudioCtx();
    try { await audioContext.resume(); } catch {}
    if (audioContext.state !== 'running') return;

    const mix = Math.max(0, Math.min(1, Number(meta.audio_mix ?? 1) || 0));
    const gain = audioContext.createGain();
    gain.gain.value = 0.018 * mix;
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const lfo = audioContext.createOscillator();
    const lfoGain = audioContext.createGain();
    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.value = profile.root;
    osc2.frequency.value = profile.fifth;
    lfo.frequency.value = profile.lfo;
    lfoGain.gain.value = 0.007 * mix;
    lfo.connect(lfoGain).connect(gain.gain);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioContext.destination);
    osc1.start();
    osc2.start();
    lfo.start();
    synth = { reelId: String(card.dataset.reelId), oscillators: [osc1, osc2], lfo, gain };
  }

  function syncSynthFromCard(card) {
    if (!card) return;
    const meta = metadataCache.get(String(card.dataset.reelId));
    if (!meta?.audio_track_key) {
      if (synth?.reelId === String(card.dataset.reelId)) stopSynth();
      return;
    }
    startSynth(card, meta).catch(() => stopSynth());
  }

  function composerPreview() {
    return document.querySelector('#reelsV4Preview');
  }

  function renderComposerOverlayList(form) {
    const list = form.querySelector('[data-r4-overlay-list]');
    if (!list) return;
    list.innerHTML = composerOverlays.length
      ? composerOverlays.map((item, index) => `<div class="reels-v4-overlay-row"><div><strong>${esc(item.text)}</strong><span>${esc(item.position)} • ${item.start.toFixed(1)}–${item.end.toFixed(1)} dtk</span></div><button type="button" data-r4-advanced-action="remove-overlay" data-overlay-index="${index}" aria-label="Hapus teks"><i class="ph ph-x"></i></button></div>`).join('')
      : '<p class="reels-v4-helper">Belum ada teks overlay.</p>';

    const preview = composerPreview();
    if (!preview) return;
    let layer = preview.querySelector('.reels-v4-preview-text-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'reels-v4-preview-text-layer';
      preview.appendChild(layer);
    }
    layer.innerHTML = composerOverlays.map((item, index) => `<span class="reels-v4-preview-overlay reels-v4-text-${esc(item.position)} reels-v4-text-${esc(item.size)}" data-preview-overlay="${index}" hidden>${esc(item.text)}</span>`).join('');
    const video = preview.querySelector('video');
    if (video) syncComposerPreview(video);
  }

  function syncComposerPreview(video) {
    const preview = composerPreview();
    if (!preview) return;
    const current = Number(video.currentTime || 0);
    preview.querySelectorAll('[data-preview-overlay]').forEach(node => {
      const item = composerOverlays[Number(node.dataset.previewOverlay)];
      node.hidden = !item || current < item.start || current > item.end;
    });
  }

  function addOverlay(form) {
    const text = String(form.querySelector('[name="advanced_overlay_text"]')?.value || '').trim().slice(0, 120);
    if (!text) return toast('Isi teks overlay terlebih dahulu.');
    if (composerOverlays.length >= 6) return toast('Maksimal 6 teks overlay per Reels.');
    const position = String(form.querySelector('[name="advanced_overlay_position"]')?.value || 'center');
    const size = String(form.querySelector('[name="advanced_overlay_size"]')?.value || 'medium');
    const start = Math.max(0, Math.min(180, Number(form.querySelector('[name="advanced_overlay_start"]')?.value || 0) || 0));
    let end = Number(form.querySelector('[name="advanced_overlay_end"]')?.value || 0) || 0;
    if (end <= start) end = Math.min(180, start + 5);
    composerOverlays.push({ text, position, size, start, end: Math.min(180, end) });
    const textInput = form.querySelector('[name="advanced_overlay_text"]');
    if (textInput) textInput.value = '';
    renderComposerOverlayList(form);
  }

  async function prefillTemplate(form) {
    const sourceId = String(form.elements.template_of_reel_id?.value || '');
    if (!sourceId) return;
    try {
      await loadMetadata([sourceId]);
      const meta = metadataCache.get(sourceId);
      if (!meta) return;
      composerOverlays = Array.isArray(meta.text_overlays) ? meta.text_overlays.map(item => ({ ...item })) : [];
      const audio = form.querySelector('#reelsV4AdvancedAudio');
      if (audio) audio.value = meta.audio_track_key || (meta.audio_mode === 'muted' ? 'muted' : 'original');
      renderComposerOverlayList(form);
    } catch {}
  }

  async function decorateComposer(form) {
    if (!form || form.dataset.advancedReady === 'true') return;
    form.dataset.advancedReady = 'true';
    composerOverlays = [];
    let tracks = [];
    try { tracks = await loadAudioLibrary(); } catch {}

    const helper = form.querySelector('.reels-v4-helper');
    const panel = document.createElement('section');
    panel.className = 'reels-v4-advanced-editor';
    panel.innerHTML = `
      <div class="reels-v4-field">
        <label>Audio library aman hak cipta</label>
        <select id="reelsV4AdvancedAudio" name="advanced_audio_track">
          ${(tracks.length ? tracks : [
            { track_key:'original', label:'Original audio' },
            { track_key:'muted', label:'Tanpa audio' }
          ]).map(track => `<option value="${esc(track.track_key)}">${esc(track.label)}</option>`).join('')}
        </select>
        <p class="reels-v4-helper">Track “Pasar” dibuat secara sintetis oleh platform, bukan katalog musik pihak ketiga.</p>
      </div>
      <div class="reels-v4-overlay-editor">
        <strong>Teks overlay</strong>
        <div class="reels-v4-field"><input name="advanced_overlay_text" maxlength="120" placeholder="Contoh: Diskon hari ini"></div>
        <div class="reels-v4-range reels-v4-range-advanced">
          <div class="reels-v4-field"><label>Posisi</label><select name="advanced_overlay_position"><option value="top">Atas</option><option value="center" selected>Tengah</option><option value="bottom">Bawah</option></select></div>
          <div class="reels-v4-field"><label>Ukuran</label><select name="advanced_overlay_size"><option value="small">Kecil</option><option value="medium" selected>Sedang</option><option value="large">Besar</option></select></div>
          <div class="reels-v4-field"><label>Mulai</label><input name="advanced_overlay_start" type="number" min="0" max="180" step="0.1" value="0"></div>
          <div class="reels-v4-field"><label>Selesai</label><input name="advanced_overlay_end" type="number" min="0.1" max="180" step="0.1" value="5"></div>
        </div>
        <button class="reels-v4-secondary" type="button" data-r4-advanced-action="add-overlay"><i class="ph ph-text-t"></i> Tambah teks</button>
        <div class="reels-v4-overlay-list" data-r4-overlay-list></div>
      </div>`;
    if (helper) helper.before(panel);
    else form.prepend(panel);
    renderComposerOverlayList(form);
    prefillTemplate(form);
  }

  function advancedPayload(form) {
    const selected = String(form.querySelector('#reelsV4AdvancedAudio')?.value || 'original');
    return {
      text_overlays: composerOverlays,
      audio_track_key: selected,
      audio_mix: 1
    };
  }

  async function publishAdvanced(form, draft = false) {
    const file = document.querySelector('#reelsV4File')?.files?.[0];
    if (!file) return toast('Pilih video terlebih dahulu.');
    const submit = form.querySelector('button[type="submit"]');
    const draftButton = form.querySelector('[data-r4-action="draft"]');
    const activeButton = draft ? draftButton : submit;
    if (activeButton?.disabled) return;
    if (activeButton) {
      activeButton.disabled = true;
      activeButton.dataset.oldLabel = activeButton.textContent;
      activeButton.textContent = draft ? 'Menyimpan...' : 'Mengunggah...';
    }
    try {
      const data = new FormData(form);
      data.append('file', file, file.name || 'reel.mp4');
      const selected = String(form.querySelector('#reelsV4AdvancedAudio')?.value || 'original');
      data.set('audio_mode', selected === 'original' ? 'original' : 'muted');
      const response = await fetch(draft ? `${BASE}/drafts` : BASE, {
        method: 'POST', credentials: 'include', cache: 'no-store', body: data,
        headers: { Accept: 'application/json' }
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) throw new Error(result.error || 'Reels gagal dipublikasikan.');
      const id = String(draft ? result.draft?.id || '' : result.reel?.id || '');
      if (!id) throw new Error('ID Reels tidak tersedia setelah upload.');
      await request(`${ADVANCED}/${draft ? 'drafts' : 'reels'}/${encodeURIComponent(id)}`, {
        method: 'PUT', body: advancedPayload(form)
      });
      window.closeBottomSheet?.();
      toast(draft ? 'Draft Reels tersimpan.' : 'Reels berhasil dipublikasikan.');
      if (!draft) {
        metadataCache.delete(id);
        await window.PasarReelsV4?.open?.(id);
      }
    } catch (error) {
      toast(error.message || 'Reels belum dapat diproses.');
    } finally {
      if (activeButton) {
        activeButton.disabled = false;
        activeButton.textContent = activeButton.dataset.oldLabel || (draft ? 'Simpan Draft' : 'Publikasikan');
      }
    }
  }

  function loadStyle(href, marker) {
    if (document.querySelector(`link[data-${marker}]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset[marker.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = 'true';
      link.onload = resolve;
      link.onerror = reject;
      document.head.appendChild(link);
    });
  }

  function loadScript(src, marker) {
    if (window.PasarChatV7?.version === '7.0') return Promise.resolve();
    const found = document.querySelector(`script[data-${marker}]`);
    if (found) return new Promise(resolve => found.addEventListener('load', resolve, { once: true }));
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset[marker.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = 'true';
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  async function ensureChatRuntime() {
    if (window.PasarChatV7?.version === '7.0') return window.PasarChatV7;
    await Promise.all([
      loadStyle('css/chat-experience-v7.css?v=7.0', 'reels-chat-v7-style'),
      loadStyle('css/chat-commerce-v8.css?v=8.0', 'reels-chat-v8-style')
    ]);
    await loadScript('js/chat-experience-v7.js?v=7.0', 'reels-chat-v7-script');
    return window.PasarChatV7;
  }

  async function chatSeller(button) {
    const userId = String(button.dataset.userId || '');
    const reelId = String(button.dataset.reelId || '');
    if (!userId) return;
    if (!window.STATE?.user) {
      toast('Masuk untuk chat penjual.');
      window.openLogin?.();
      return;
    }
    try {
      await fetch(`${BASE}/events`, {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ events: [{ reel_id: reelId, event_type: 'chat_click', watch_ms: 0, metadata: { source: 'reels_v4_chat_seller' } }] })
      });
      const chat = await ensureChatRuntime();
      document.body.classList.remove('reels-v4-active');
      if (chat?.openWithUser) await chat.openWithUser(userId);
      else throw new Error('Chat belum siap.');
    } catch (error) {
      toast(error.message || 'Chat penjual belum dapat dibuka.');
    }
  }

  window.addEventListener('submit', event => {
    const form = event.target;
    if (form?.id !== 'reelsV4ComposerForm' || form.dataset.advancedReady !== 'true') return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    publishAdvanced(form, false);
  }, true);

  window.addEventListener('click', event => {
    const button = event.target.closest?.('[data-r4-advanced-action], .reels-v4-composer [data-r4-action="draft"]');
    if (!button) return;
    const form = button.closest('#reelsV4ComposerForm') || document.querySelector('#reelsV4ComposerForm');
    if (button.matches('[data-r4-action="draft"]') && form?.dataset.advancedReady === 'true') {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      publishAdvanced(form, true); return;
    }
    const action = button.dataset.r4AdvancedAction;
    if (action === 'add-overlay' && form) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); addOverlay(form);
    } else if (action === 'remove-overlay' && form) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      composerOverlays.splice(Number(button.dataset.overlayIndex), 1); renderComposerOverlayList(form);
    } else if (action === 'chat-seller') {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); chatSeller(button);
    }
  }, true);

  document.addEventListener('timeupdate', event => {
    if (event.target?.matches('.reels-v4-video')) syncTextOverlays(event.target);
    if (event.target?.closest?.('#reelsV4Preview')) syncComposerPreview(event.target);
  }, true);
  document.addEventListener('play', event => {
    if (event.target?.matches('.reels-v4-video')) syncSynthFromCard(event.target.closest('.reels-v4-card'));
  }, true);
  document.addEventListener('pause', event => {
    if (event.target?.matches('.reels-v4-video') && synth?.reelId === String(event.target.closest('.reels-v4-card')?.dataset.reelId)) stopSynth();
  }, true);
  document.addEventListener('click', event => {
    if (!event.target.closest?.('.reels-v4-audio')) return;
    setTimeout(() => syncSynthFromCard(event.target.closest('.reels-v4-card')), 30);
  }, true);

  const observer = new MutationObserver(() => {
    decorateCards();
    const form = document.querySelector('#reelsV4ComposerForm');
    if (form) decorateComposer(form).catch(error => console.error('[Pasar UMKM] Advanced composer:', error));
  });
  observer.observe(document.body, { childList: true, subtree: true });
  decorateCards();

  window.PasarReelsAdvancedV4 = Object.freeze({
    version: '4.0',
    loadMetadata,
    loadAudioLibrary,
    stopAudio: stopSynth
  });
})();
