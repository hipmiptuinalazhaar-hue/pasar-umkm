'use strict';

/* =========================================================
   PASAR UMKM - MEDIA EXPERIENCE V2
   Reels, story composer/viewer, source picker, dan sell flow.
   ========================================================= */

(() => {
  if (
    typeof STATE === 'undefined' ||
    typeof DATA === 'undefined'
  ) {
    return;
  }

  const MEDIA = {
    reels: [],
    reelMap: new Map(),
    loadingReels: false,
    selectedFile: null,
    selectedKind: '',
    selectedSource: '',
    selectedObjectUrl: '',
    story: null,
    storyCommentsOpen: false,
    reelObserver: null
  };

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

  function notify(message) {
    if (typeof showToast === 'function') {
      showToast(message);
    }
  }

  async function jsonApi(path, options = {}) {
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
      throw new Error(data.error || 'Permintaan belum dapat diproses.');
    }

    return data;
  }

  function requireLogin(message = 'Masuk terlebih dahulu.') {
    if (STATE.user) return true;
    notify(message);
    if (typeof openLogin === 'function') openLogin();
    return false;
  }

  function clearSelectedFile() {
    if (MEDIA.selectedObjectUrl) {
      URL.revokeObjectURL(MEDIA.selectedObjectUrl);
    }

    MEDIA.selectedFile = null;
    MEDIA.selectedKind = '';
    MEDIA.selectedSource = '';
    MEDIA.selectedObjectUrl = '';
  }

  function closeSheet() {
    if (typeof closeBottomSheet === 'function') {
      closeBottomSheet();
    }
  }

  function openSheet(html, key) {
    if (typeof openBottomSheet !== 'function') return;
    openBottomSheet(html, key);
  }

  /* =======================================================
     NAVIGATION
     ======================================================= */

  function patchNavigation() {
    const categories = document.querySelector(
      '.nav-item[data-nav="categories"]'
    );

    if (categories) {
      categories.dataset.nav = 'reels';
      categories.setAttribute('aria-label', 'Reels');

      const icon = categories.querySelector('i');
      if (icon) icon.className = 'ph ph-film-strip';

      const label = categories.querySelector('span');
      if (label) label.textContent = 'Reels';
    }

    const sell = document.querySelector(
      '.nav-item[data-nav="sell"]'
    );

    if (sell) {
      sell.setAttribute('aria-label', 'Buat');
      const label = sell.querySelector(':scope > span:last-child');
      if (label && !label.classList.contains('nav-create-icon')) {
        label.textContent = '';
      }
    }
  }

  function setReelsNavActive() {
    STATE.activeNav = 'reels';

    document.querySelectorAll('.nav-item').forEach(button => {
      const active = button.dataset.nav === 'reels';
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  /* =======================================================
     REELS DATA
     ======================================================= */

  function reelPost(reel) {
    const identity =
      reel.store_name ||
      reel.user_name ||
      'Pengguna';

    const avatar =
      reel.user_avatar_url ||
      reel.store_logo_url ||
      (typeof ASSETS !== 'undefined' ? ASSETS.logo : 'assets/logo.png');

    return {
      id: `reel-${reel.id}`,
      backendId: reel.id,
      isReel: true,
      reelId: reel.id,
      reelUserId: reel.user_id,
      store: {
        id: reel.store_id || '',
        name: identity,
        avatar,
        location: '',
        verified: reel.verification_status === 'verified'
      },
      caption: reel.caption || '',
      createdAt: reel.created_at,
      media: {
        type: 'video',
        src: reel.video_url,
        poster: '',
        alt: reel.caption || `Reels ${identity}`
      },
      likesCount: Number(reel.likes_count || 0),
      commentsCount: Number(reel.comments_count || 0)
    };
  }

  function mergeReelsIntoFeed(reels) {
    const normalPosts = (DATA.posts || []).filter(item => !item?.isReel);
    const reelPosts = reels.map(reelPost);

    for (const reel of reels) {
      const postId = `reel-${reel.id}`;
      if (reel.viewer_liked) STATE.likedPosts.add(postId);
      else STATE.likedPosts.delete(postId);
    }

    DATA.posts = [...normalPosts, ...reelPosts].sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }

  async function loadReels(options = {}) {
    if (MEDIA.loadingReels) return MEDIA.reels;
    MEDIA.loadingReels = true;

    try {
      const data = await jsonApi('/api/reels?limit=50');
      MEDIA.reels = Array.isArray(data.reels) ? data.reels : [];
      MEDIA.reelMap = new Map(
        MEDIA.reels.map(reel => [String(reel.id), reel])
      );

      mergeReelsIntoFeed(MEDIA.reels);

      if (
        options.renderHome !== false &&
        STATE.activeNav === 'home' &&
        typeof renderFeed === 'function'
      ) {
        renderFeed();
      }

      decorateHomeReels();
      return MEDIA.reels;
    } catch (error) {
      console.error('[Pasar UMKM] Reels load error:', error);
      return MEDIA.reels;
    } finally {
      MEDIA.loadingReels = false;
    }
  }

  function reelFromPostId(postId) {
    const id = String(postId || '').replace(/^reel-/, '');
    return MEDIA.reelMap.get(id) || null;
  }

  function decorateHomeReels() {
    for (const reel of MEDIA.reels) {
      const postId = `reel-${reel.id}`;
      const card = document.querySelector(
        `[data-post-id="${CSS.escape(postId)}"]`
      );

      if (!card) continue;
      card.dataset.reelId = String(reel.id);
      card.dataset.reelUserId = String(reel.user_id || '');

      const media = card.querySelector('.post-media.video');
      if (media && !media.querySelector('video')) {
        media.innerHTML = `
          <video
            src="${esc(reel.video_url)}"
            class="home-reel-video"
            playsinline
            controls
            preload="metadata"
          ></video>
        `;
      }

      card.querySelector('[data-action="save"]')?.remove();
    }
  }

  function renderReelCard(reel) {
    const name = reel.store_name || reel.user_name || 'Pengguna';
    const avatar = reel.user_avatar_url || reel.store_logo_url || '';
    const liked = Boolean(reel.viewer_liked);

    return `
      <article class="reel-card" data-reel-card="${esc(reel.id)}">
        <video
          class="reel-video"
          src="${esc(reel.video_url)}"
          playsinline
          loop
          muted
          preload="metadata"
        ></video>
        <div class="reel-gradient"></div>

        <div class="reel-copy">
          <button
            type="button"
            class="reel-author"
            data-media-action="reel-profile"
            data-user-id="${esc(reel.user_id || '')}"
            style="border:0;background:transparent;color:inherit;padding:0;text-align:left;"
          >
            ${avatar
              ? `<img src="${esc(avatar)}" alt="${esc(name)}">`
              : `<span class="reel-author-fallback"><i class="ph ph-user"></i></span>`}
            <strong>${esc(name)}</strong>
          </button>
          ${reel.caption ? `<p class="reel-caption">${esc(reel.caption)}</p>` : ''}
        </div>

        <div class="reel-actions">
          <button
            type="button"
            class="reel-action ${liked ? 'liked' : ''}"
            data-media-action="reel-like"
            data-reel-id="${esc(reel.id)}"
          >
            <i class="${liked ? 'ph-fill' : 'ph'} ph-heart"></i>
            <span>${Number(reel.likes_count || 0)}</span>
          </button>

          <button
            type="button"
            class="reel-action"
            data-media-action="reel-comments"
            data-reel-id="${esc(reel.id)}"
          >
            <i class="ph ph-chat-circle"></i>
            <span>${Number(reel.comments_count || 0)}</span>
          </button>

          <button
            type="button"
            class="reel-action"
            data-media-action="reel-share"
            data-reel-id="${esc(reel.id)}"
          >
            <i class="ph ph-paper-plane-tilt"></i>
            <span>Bagikan</span>
          </button>
        </div>
      </article>
    `;
  }

  function setupReelAutoplay() {
    MEDIA.reelObserver?.disconnect?.();

    MEDIA.reelObserver = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const video = entry.target.querySelector('video');
          if (!video) continue;

          if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
            video.play().catch(() => null);
          } else {
            video.pause();
          }
        }
      },
      { threshold: [0.2, 0.65, 0.9] }
    );

    document.querySelectorAll('.reel-card').forEach(card => {
      MEDIA.reelObserver.observe(card);
    });
  }

  async function openReelsPage(focusId = '') {
    closeSheet();
    if (typeof closeSideMenu === 'function') closeSideMenu();

    document.querySelector('.app')?.classList.remove('account-profile-active');
    if (DOM.storiesSection) DOM.storiesSection.hidden = true;
    if (DOM.homeDiscovery) DOM.homeDiscovery.hidden = true;

    setReelsNavActive();

    if (!MEDIA.reels.length) {
      await loadReels({ renderHome: false });
    }

    if (!DOM.feed) return;

    DOM.feed.innerHTML = `
      <section class="reels-page">
        <header class="reels-page-head">
          <strong>Reels</strong>
          <button type="button" class="reels-create-button" data-media-action="reel-create" aria-label="Buat reels">
            <i class="ph ph-plus"></i>
          </button>
        </header>
        <div class="reels-stack">
          ${MEDIA.reels.length
            ? MEDIA.reels.map(renderReelCard).join('')
            : `<div class="reels-empty"><div><i class="ph ph-film-strip" style="font-size:42px;"></i><p>Belum ada reels.</p></div></div>`}
        </div>
      </section>
    `;

    setupReelAutoplay();

    if (focusId) {
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-reel-card="${CSS.escape(String(focusId))}"]`)
          ?.scrollIntoView({ behavior: 'auto', block: 'start' });
      });
    }
  }

  async function toggleReelLike(reelId) {
    if (!requireLogin('Masuk untuk menyukai reels.')) return;

    const reel = MEDIA.reelMap.get(String(reelId));
    if (!reel) return;

    const nextLiked = !Boolean(reel.viewer_liked);

    try {
      const data = await jsonApi(
        `/api/reels/${encodeURIComponent(reelId)}/like`,
        { method: nextLiked ? 'POST' : 'DELETE' }
      );

      reel.viewer_liked = data.liked;
      reel.likes_count = Number(data.likes_count || 0);

      const postId = `reel-${reelId}`;
      const post = (DATA.posts || []).find(item => item.id === postId);
      if (post) post.likesCount = reel.likes_count;

      if (data.liked) STATE.likedPosts.add(postId);
      else STATE.likedPosts.delete(postId);

      if (typeof refreshPostInteractionUI === 'function') {
        refreshPostInteractionUI(postId);
      }

      document
        .querySelectorAll(`[data-media-action="reel-like"][data-reel-id="${CSS.escape(String(reelId))}"]`)
        .forEach(button => {
          button.classList.toggle('liked', Boolean(data.liked));
          const icon = button.querySelector('i');
          if (icon) icon.className = `${data.liked ? 'ph-fill' : 'ph'} ph-heart`;
          const count = button.querySelector('span');
          if (count) count.textContent = String(reel.likes_count);
        });
    } catch (error) {
      notify(error.message || 'Like reels belum dapat diperbarui.');
    }
  }

  function commentRow(comment) {
    const avatar = comment.user_avatar_url || '';
    return `
      <div class="story-comment-row">
        ${avatar
          ? `<img src="${esc(avatar)}" alt="">`
          : `<span class="story-comment-avatar"><i class="ph ph-user"></i></span>`}
        <div class="story-comment-copy">
          <strong>${esc(comment.user_name || 'Pengguna')}</strong>
          <p>${esc(comment.body || '')}</p>
        </div>
      </div>
    `;
  }

  async function openReelComments(reelId) {
    try {
      const data = await jsonApi(
        `/api/reels/${encodeURIComponent(reelId)}/comments`
      );

      openSheet(
        `
          <section class="auth-shell">
            <h2 id="sheetTitle">Komentar Reels</h2>
            <div id="reelCommentsList">
              ${(data.comments || []).length
                ? data.comments.map(commentRow).join('')
                : '<p class="empty-state-text">Belum ada komentar.</p>'}
            </div>
            <form id="reelCommentForm" data-reel-id="${esc(reelId)}" style="margin-top:12px;">
              <div class="auth-field">
                <input class="auth-input" name="body" maxlength="1000" placeholder="Tulis komentar..." required>
              </div>
              <button type="submit" class="btn-primary" style="width:100%;">Kirim</button>
            </form>
          </section>
        `,
        'reel-comments'
      );
    } catch (error) {
      notify(error.message || 'Komentar belum dapat dimuat.');
    }
  }

  async function submitReelComment(form) {
    if (!requireLogin('Masuk untuk berkomentar.')) return;
    const reelId = String(form.dataset.reelId || '');
    const body = String(new FormData(form).get('body') || '').trim();
    if (!body) return;

    try {
      await jsonApi(
        `/api/reels/${encodeURIComponent(reelId)}/comments`,
        { method: 'POST', body: { body } }
      );

      const reel = MEDIA.reelMap.get(reelId);
      if (reel) reel.comments_count = Number(reel.comments_count || 0) + 1;
      await openReelComments(reelId);
    } catch (error) {
      notify(error.message || 'Komentar belum dapat dikirim.');
    }
  }

  async function shareReel(reelId) {
    const url = `${location.origin}${location.pathname}#reel=${encodeURIComponent(reelId)}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: 'Reels Pasar UMKM', url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        notify('Link reels disalin.');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') notify('Reels belum dapat dibagikan.');
    }
  }

  /* =======================================================
     MEDIA SOURCE PICKER + SELL FLOW
     ======================================================= */

  function openSourcePicker(kind, options = {}) {
    const isStory = kind === 'story';
    const isVideo = kind === 'reel';

    openSheet(
      `
        <section class="auth-shell">
          <div class="media-source-picker ${isStory ? 'three' : ''}">
            <button type="button" class="media-source-choice" data-media-action="pick-source" data-kind="${esc(kind)}" data-source="camera">
              <i class="ph ph-camera"></i>
              <span>Kamera</span>
            </button>
            <button type="button" class="media-source-choice" data-media-action="pick-source" data-kind="${esc(kind)}" data-source="gallery">
              <i class="ph ph-image-square"></i>
              <span>Galeri</span>
            </button>
            ${isStory
              ? `<button type="button" class="media-source-choice" data-media-action="story-text"><i class="ph ph-text-aa"></i><span>Teks</span></button>`
              : ''}
          </div>
          ${options.note ? `<p class="empty-state-text">${esc(options.note)}</p>` : ''}
        </section>
      `,
      `source-${kind}`
    );

    if (isVideo) {
      // Keberadaan variabel ini membuat intent lebih eksplisit untuk pembaca kode.
    }
  }

  function chooseDeviceFile(kind, source) {
    clearSelectedFile();

    const input = document.createElement('input');
    input.type = 'file';
    input.hidden = true;

    if (kind === 'reel') {
      input.accept = 'video/mp4,video/webm,video/quicktime,video/*';
      if (source === 'camera') input.setAttribute('capture', 'environment');
    } else {
      input.accept = 'image/jpeg,image/png,image/webp,image/*';
      if (source === 'camera') input.setAttribute('capture', 'environment');
    }

    document.body.appendChild(input);

    input.addEventListener('change', () => {
      const file = input.files?.[0] || null;
      input.remove();
      if (!file) return;

      MEDIA.selectedFile = file;
      MEDIA.selectedKind = kind;
      MEDIA.selectedSource = source;
      MEDIA.selectedObjectUrl = URL.createObjectURL(file);
      openMediaPreview(kind);
    }, { once: true });

    input.click();
  }

  function openMediaPreview(kind) {
    const file = MEDIA.selectedFile;
    if (!file || !MEDIA.selectedObjectUrl) return;

    const isVideo = kind === 'reel';

    openSheet(
      `
        <section class="auth-shell media-preview-shell">
          <div class="media-preview-frame">
            ${isVideo
              ? `<video src="${esc(MEDIA.selectedObjectUrl)}" controls playsinline></video>`
              : `<img src="${esc(MEDIA.selectedObjectUrl)}" alt="Pratinjau">`}
          </div>
          <div class="media-preview-actions">
            <button type="button" class="menu-sheet-btn" data-media-action="media-retake" data-kind="${esc(kind)}">
              <i class="ph ph-arrow-counter-clockwise"></i> Ulangi
            </button>
            <button type="button" class="btn-primary" data-media-action="media-confirm" data-kind="${esc(kind)}">
              <i class="ph ph-check"></i> Gunakan
            </button>
          </div>
        </section>
      `,
      `preview-${kind}`
    );
  }

  function assignFileToExistingInput(selector, file) {
    const input = document.querySelector(selector);
    if (!input || !file) return false;

    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (error) {
      console.error('[Pasar UMKM] Assign file error:', error);
      return false;
    }
  }

  function insertCaptionSymbol(textarea, symbol) {
    if (!textarea) return;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const prefix = textarea.value.slice(0, start);
    const suffix = textarea.value.slice(end);
    const spacing = prefix && !/\s$/.test(prefix) ? ' ' : '';
    textarea.value = `${prefix}${spacing}${symbol}${suffix}`;
    const caret = (prefix + spacing + symbol).length;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function decorateCaptionEditor(textarea) {
    if (!textarea || textarea.dataset.mediaCaptionEnhanced === 'true') return;
    textarea.dataset.mediaCaptionEnhanced = 'true';
    textarea.placeholder = 'Tulis caption... gunakan @ untuk menandai teman dan # untuk hashtag';

    const helper = document.createElement('div');
    helper.className = 'media-caption-helper';
    helper.innerHTML = `
      <button type="button" class="media-caption-chip" data-media-caption-symbol="@">@ Tandai teman</button>
      <button type="button" class="media-caption-chip" data-media-caption-symbol="#"># Hashtag</button>
    `;
    textarea.insertAdjacentElement('afterend', helper);
  }

  function openExistingPostFormWithFile() {
    if (typeof openPostCreateInfo !== 'function') return;
    const file = MEDIA.selectedFile;
    openPostCreateInfo();

    requestAnimationFrame(() => {
      setTimeout(() => {
        assignFileToExistingInput('#postCreateImage', file);
        decorateCaptionEditor(document.querySelector('#postCreateCaption'));
        clearSelectedFile();
      }, 30);
    });
  }

  function openExistingProductFormWithFile() {
    if (typeof openProductCreateForm !== 'function') return;
    const file = MEDIA.selectedFile;
    openProductCreateForm();

    requestAnimationFrame(() => {
      setTimeout(() => {
        assignFileToExistingInput('#productCreateImage', file);
        clearSelectedFile();
      }, 30);
    });
  }

  function openReelCaptionForm() {
    if (!MEDIA.selectedFile) return;

    openSheet(
      `
        <section class="auth-shell">
          <h2 id="sheetTitle">Reels Baru</h2>
          <div class="media-preview-frame" style="margin-bottom:12px;">
            <video src="${esc(MEDIA.selectedObjectUrl)}" controls playsinline></video>
          </div>
          <form id="reelCreateForm">
            <div class="auth-field">
              <label>Caption</label>
              <textarea id="reelCaption" class="auth-input" name="caption" rows="4" maxlength="2200" placeholder="Tulis caption..."></textarea>
            </div>
            <button type="submit" class="btn-primary" style="width:100%;margin-top:10px;">Bagikan Reels</button>
          </form>
        </section>
      `,
      'reel-create'
    );

    decorateCaptionEditor(document.querySelector('#reelCaption'));
  }

  async function submitReel(form) {
    if (!requireLogin('Masuk untuk membuat reels.')) return;
    const file = MEDIA.selectedFile;
    if (!file) {
      notify('Pilih video terlebih dahulu.');
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    const caption = String(new FormData(form).get('caption') || '').trim();

    if (button) {
      button.disabled = true;
      button.textContent = 'Mengunggah...';
    }

    try {
      const body = new FormData();
      body.append('file', file, file.name || 'reel.mp4');
      body.append('caption', caption);

      const response = await fetch('/api/reels', {
        method: 'POST',
        credentials: 'include',
        body
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok !== true) {
        throw new Error(data.error || 'Reels belum dapat dipublikasikan.');
      }

      clearSelectedFile();
      closeSheet();
      notify('Reels berhasil dipublikasikan.');
      await loadReels({ renderHome: false });
      openReelsPage(data.reel?.id || '');
    } catch (error) {
      notify(error.message || 'Reels belum dapat dipublikasikan.');
      if (button) {
        button.disabled = false;
        button.textContent = 'Bagikan Reels';
      }
    }
  }

  function openNewSellMenu() {
    if (!requireLogin('Masuk untuk membuat konten.')) return;

    openSheet(
      `
        <section class="auth-shell">
          <button type="button" class="menu-sheet-btn" data-media-action="sell-post-source">
            <i class="ph ph-image-square"></i> Buat Postingan
          </button>
          <button type="button" class="menu-sheet-btn" data-media-action="sell-product-source">
            <i class="ph ph-package"></i> Tambah Produk
          </button>
          <button type="button" class="menu-sheet-btn" data-media-action="sell-reel-source">
            <i class="ph ph-film-strip"></i> Reels
          </button>
        </section>
      `,
      'create'
    );
  }

  if (typeof openSell === 'function') {
    openSell = openNewSellMenu;
  }

  /* =======================================================
     STORY COMPOSER + VIEWER
     ======================================================= */

  function storyCreateButton() {
    return STATE.user
      ? `
          <button type="button" class="story-item story-add" data-action="add-story" aria-label="Tambah cerita">
            <span class="story-ring"><i class="ph ph-plus" aria-hidden="true"></i></span>
            <span class="story-name">Cerita Anda</span>
          </button>
        `
      : '';
  }

  function overrideStoryRenderer() {
    if (typeof createStoryTemplate !== 'function') return;

    renderStories = function mediaRenderStories() {
      if (!DOM.stories || !DOM.storiesSection) return;

      const stories = Array.isArray(DATA.stories) ? DATA.stories : [];
      if (!stories.length && !STATE.user) {
        DOM.stories.innerHTML = '';
        DOM.storiesSection.hidden = true;
        return;
      }

      DOM.storiesSection.hidden = false;
      DOM.stories.innerHTML =
        storyCreateButton() +
        stories.map(createStoryTemplate).join('');
    };
  }

  function openStoryComposer() {
    if (!requireLogin('Masuk untuk membuat cerita.')) return;
    openSourcePicker('story');
  }

  if (typeof openAddStory === 'function') {
    openAddStory = openStoryComposer;
  }

  function openStoryTextForm() {
    clearSelectedFile();
    openSheet(
      `
        <section class="auth-shell">
          <h2 id="sheetTitle">Cerita Teks</h2>
          <form id="storyTextForm">
            <div class="auth-field">
              <textarea class="auth-input" name="caption" rows="7" maxlength="1000" placeholder="Tulis cerita..." required></textarea>
            </div>
            <button type="submit" class="btn-primary" style="width:100%;">Bagikan</button>
          </form>
        </section>
      `,
      'story-text'
    );
  }

  function openStoryNextForm() {
    if (!MEDIA.selectedFile || !MEDIA.selectedObjectUrl) return;

    openSheet(
      `
        <section class="auth-shell">
          <h2 id="sheetTitle">Selanjutnya</h2>
          <div class="media-preview-frame" style="margin-bottom:12px;">
            <img src="${esc(MEDIA.selectedObjectUrl)}" alt="Pratinjau cerita">
          </div>
          <form id="storyPhotoForm">
            <div class="auth-field">
              <label>Caption (opsional)</label>
              <textarea class="auth-input" name="caption" rows="3" maxlength="1000" placeholder="Tambahkan teks..."></textarea>
            </div>
            <button type="submit" class="btn-primary" style="width:100%;">Bagikan</button>
          </form>
        </section>
      `,
      'story-next'
    );
  }

  async function publishStory({ caption = '', file = null }) {
    try {
      let imageUrl = '';

      if (file) {
        const uploadBody = new FormData();
        uploadBody.append('file', file, file.name || 'story.jpg');

        const uploadResponse = await fetch('/api/story-v2/upload-image', {
          method: 'POST',
          credentials: 'include',
          body: uploadBody
        });

        const upload = await uploadResponse.json().catch(() => ({}));
        if (!uploadResponse.ok || upload.ok !== true || !upload.image?.url) {
          throw new Error(upload.error || 'Foto cerita gagal diunggah.');
        }

        imageUrl = upload.image.url;
      }

      await jsonApi('/api/story-v2/stories', {
        method: 'POST',
        body: {
          image_url: imageUrl,
          caption: String(caption || '').trim()
        }
      });

      clearSelectedFile();
      closeSheet();
      notify('Cerita dibagikan selama 24 jam.');

      if (typeof window.reloadStories === 'function') {
        await window.reloadStories();
      }

      overrideStoryRenderer();
      if (typeof renderStories === 'function') renderStories();
    } catch (error) {
      notify(error.message || 'Cerita belum dapat dibagikan.');
      throw error;
    }
  }

  function closeStoryViewer() {
    document.querySelector('.story-viewer-v2')?.remove();
    MEDIA.story = null;
    MEDIA.storyCommentsOpen = false;

    if (location.hash.startsWith('#story=')) {
      history.replaceState(null, '', `${location.pathname}${location.search}`);
    }
  }

  function storyViewerTemplate(story) {
    const name = story.store_name || story.user_name || 'Pengguna';
    const avatar = story.user_avatar_url || story.store_logo_url || '';
    const liked = Boolean(story.viewer_liked);
    const time = typeof formatRelativeTime === 'function'
      ? formatRelativeTime(story.created_at)
      : '';

    return `
      <section class="story-viewer-v2" data-story-id="${esc(story.id)}">
        <div>
          <div class="story-viewer-progress"><span></span></div>
          <header class="story-viewer-head">
            <button type="button" class="story-viewer-close" data-media-action="story-close" aria-label="Tutup"><i class="ph ph-arrow-left"></i></button>
            <div class="story-viewer-author">
              ${avatar
                ? `<img src="${esc(avatar)}" alt="${esc(name)}">`
                : `<span class="story-viewer-avatar-fallback"><i class="ph ph-user"></i></span>`}
              <div class="story-viewer-author-copy">
                <strong>${esc(name)}</strong>
                <span>${esc(time)}</span>
              </div>
            </div>
            <button type="button" class="story-viewer-more" data-media-action="story-share" data-story-id="${esc(story.id)}" aria-label="Bagikan"><i class="ph ph-dots-three-vertical"></i></button>
          </header>
        </div>

        <div class="story-viewer-media">
          ${story.image_url
            ? `<img src="${esc(story.image_url)}" alt="Cerita ${esc(name)}">`
            : `<div class="story-viewer-text-only">${esc(story.caption || '')}</div>`}
          ${story.image_url && story.caption
            ? `<div class="story-viewer-caption">${esc(story.caption)}</div>`
            : ''}
          <div class="story-comments-panel" id="storyCommentsPanel" hidden></div>
        </div>

        <form class="story-viewer-actions" id="storyQuickCommentForm" data-story-id="${esc(story.id)}">
          <input class="story-comment-input" name="body" maxlength="500" placeholder="Kirim pesan" autocomplete="off">
          <button type="button" class="story-action-button ${liked ? 'liked' : ''}" data-media-action="story-like" data-story-id="${esc(story.id)}" aria-label="Sukai">
            <i class="${liked ? 'ph-fill' : 'ph'} ph-heart"></i>
          </button>
          <button type="button" class="story-action-button" data-media-action="story-comments" data-story-id="${esc(story.id)}" aria-label="Komentar">
            <i class="ph ph-chat-circle"></i>
          </button>
          <button type="button" class="story-action-button" data-media-action="story-share" data-story-id="${esc(story.id)}" aria-label="Bagikan">
            <i class="ph ph-paper-plane-tilt"></i>
          </button>
        </form>
      </section>
    `;
  }

  async function openStoryV2(storyId, options = {}) {
    const id = String(storyId || '').trim();
    if (!id) return;

    try {
      const data = await jsonApi(
        `/api/story-v2/stories/${encodeURIComponent(id)}`
      );

      MEDIA.story = data.story;
      document.querySelector('.story-viewer-v2')?.remove();
      document.body.insertAdjacentHTML('beforeend', storyViewerTemplate(data.story));

      if (options.pushHash !== false) {
        history.pushState(null, '', `${location.pathname}${location.search}#story=${encodeURIComponent(id)}`);
      }
    } catch (error) {
      notify(error.message || 'Cerita tidak tersedia.');
    }
  }

  if (typeof openStory === 'function') {
    openStory = function mediaOpenStory(storyId) {
      openStoryV2(storyId);
    };
  }

  async function toggleStoryLike(storyId) {
    if (!requireLogin('Masuk untuk menyukai cerita.')) return;
    const story = MEDIA.story;
    if (!story || String(story.id) !== String(storyId)) return;

    const next = !Boolean(story.viewer_liked);

    try {
      const data = await jsonApi(
        `/api/story-v2/stories/${encodeURIComponent(storyId)}/like`,
        { method: next ? 'POST' : 'DELETE' }
      );

      story.viewer_liked = data.liked;
      story.likes_count = Number(data.likes_count || 0);

      const button = document.querySelector(
        `.story-viewer-v2 [data-media-action="story-like"]`
      );
      button?.classList.toggle('liked', Boolean(data.liked));
      const icon = button?.querySelector('i');
      if (icon) icon.className = `${data.liked ? 'ph-fill' : 'ph'} ph-heart`;
    } catch (error) {
      notify(error.message || 'Like cerita belum dapat diperbarui.');
    }
  }

  async function loadStoryComments(storyId) {
    const data = await jsonApi(
      `/api/story-v2/stories/${encodeURIComponent(storyId)}/comments`
    );

    const panel = document.querySelector('#storyCommentsPanel');
    if (!panel) return;

    panel.innerHTML = (data.comments || []).length
      ? data.comments.map(commentRow).join('')
      : '<p style="font-size:10px;color:rgba(255,255,255,.7);">Belum ada komentar.</p>';
    panel.hidden = false;
    MEDIA.storyCommentsOpen = true;
  }

  async function submitStoryComment(form) {
    if (!requireLogin('Masuk untuk berkomentar.')) return;
    const storyId = String(form.dataset.storyId || '');
    const input = form.querySelector('[name="body"]');
    const body = String(input?.value || '').trim();
    if (!body) return;

    try {
      await jsonApi(
        `/api/story-v2/stories/${encodeURIComponent(storyId)}/comments`,
        { method: 'POST', body: { body } }
      );
      if (input) input.value = '';
      await loadStoryComments(storyId);
    } catch (error) {
      notify(error.message || 'Komentar cerita belum dapat dikirim.');
    }
  }

  async function shareStory(storyId) {
    const url = `${location.origin}${location.pathname}#story=${encodeURIComponent(storyId)}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: 'Cerita Pasar UMKM', url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        notify('Link cerita disalin.');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') notify('Cerita belum dapat dibagikan.');
    }
  }

  /* =======================================================
     PROFILE VIDEO TAB
     ======================================================= */

  function reelGrid(reels) {
    if (!reels.length) {
      return `
        <section class="social-account-empty">
          <div class="social-account-empty-icon"><i class="ph ph-film-strip"></i></div>
          <strong>Belum ada reels</strong>
          <p>Video khusus yang dipublikasikan akan tampil di sini.</p>
        </section>
      `;
    }

    return `
      <div class="social-account-grid social-account-post-grid">
        ${reels.map(reel => `
          <button
            type="button"
            class="social-account-grid-item social-account-post-item"
            data-media-action="open-reel"
            data-reel-id="${esc(reel.id)}"
            aria-label="Buka reels"
          >
            <video src="${esc(reel.video_url)}" preload="metadata" muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>
            <span class="social-account-grid-overlay"><i class="ph ph-play"></i></span>
          </button>
        `).join('')}
      </div>
    `;
  }

  async function renderOwnVideoTab(button) {
    const page = document.querySelector('.social-account-page');
    const content = page?.querySelector('#socialAccountContent');
    if (!page || !content || !STATE.user?.id) return;

    page.querySelectorAll('.social-account-tab').forEach(item => {
      item.classList.toggle('active', item === button);
    });

    content.innerHTML = '<section class="social-account-empty"><strong>Memuat reels...</strong></section>';

    try {
      const data = await jsonApi(
        `/api/reels?user_id=${encodeURIComponent(STATE.user.id)}&limit=50`
      );
      content.innerHTML = reelGrid(data.reels || []);
    } catch (error) {
      content.innerHTML = '<section class="social-account-empty"><strong>Reels belum dapat dimuat.</strong></section>';
    }
  }

  if (typeof switchAccountTab === 'function') {
    const originalSwitchAccountTab = switchAccountTab;
    switchAccountTab = function mediaSwitchAccountTab(tab, button) {
      if (tab === 'videos') {
        renderOwnVideoTab(button);
        return;
      }
      originalSwitchAccountTab(tab, button);
    };
  }

  async function renderPublicVideoTab(button) {
    const page = button.closest('.social-universal-profile');
    const grid = page?.querySelector('.social-profile-grid');
    const userId = page?.dataset.userId || '';
    if (!page || !grid || !userId) return;

    page.querySelectorAll('.social-profile-tab').forEach(item => {
      item.classList.toggle('active', item === button);
    });

    grid.innerHTML = '<div class="social-profile-empty"><strong>Memuat reels...</strong></div>';

    try {
      const data = await jsonApi(
        `/api/reels?user_id=${encodeURIComponent(userId)}&limit=50`
      );

      grid.innerHTML = (data.reels || []).length
        ? (data.reels || []).map(reel => `
            <button type="button" class="social-profile-grid-item" data-media-action="open-reel" data-reel-id="${esc(reel.id)}">
              <video src="${esc(reel.video_url)}" preload="metadata" muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>
              <span class="social-profile-grid-type"><i class="ph ph-play"></i></span>
            </button>
          `).join('')
        : '<div class="social-profile-empty"><i class="ph ph-film-strip"></i><strong>Belum ada reels</strong></div>';
    } catch {
      grid.innerHTML = '<div class="social-profile-empty"><strong>Reels belum dapat dimuat.</strong></div>';
    }
  }

  function decoratePublicProfileVideoTab() {
    document.querySelectorAll('.social-universal-profile').forEach(page => {
      const tabs = page.querySelector('.social-profile-tabs');
      if (!tabs || tabs.querySelector('[data-media-action="public-videos"]')) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'social-profile-tab';
      button.dataset.mediaAction = 'public-videos';
      button.setAttribute('aria-label', 'Reels');
      button.innerHTML = '<i class="ph ph-film-strip"></i>';
      tabs.appendChild(button);
      tabs.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
    });
  }

  /* =======================================================
     DEEP LINKS
     ======================================================= */

  async function handleMediaDeepLink() {
    const reelMatch = location.hash.match(/^#reel=([0-9a-f-]{36})$/i);
    if (reelMatch) {
      await loadReels({ renderHome: false });
      await openReelsPage(reelMatch[1]);
      return;
    }

    const storyMatch = location.hash.match(/^#story=([0-9a-f-]{36})$/i);
    if (storyMatch) {
      await openStoryV2(storyMatch[1], { pushHash: false });
    }
  }

  /* =======================================================
     EVENTS
     ======================================================= */

  document.addEventListener('click', event => {
    const captionChip = event.target.closest('[data-media-caption-symbol]');
    if (captionChip) {
      event.preventDefault();
      const textarea = captionChip.parentElement?.previousElementSibling;
      insertCaptionSymbol(textarea, captionChip.dataset.mediaCaptionSymbol || '');
      return;
    }

    const nav = event.target.closest('.nav-item[data-nav="reels"]');
    if (nav) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openReelsPage();
      return;
    }

    const reelPostCard = event.target.closest('[data-post-id^="reel-"]');
    const appAction = event.target.closest('[data-action]');

    if (reelPostCard && appAction) {
      const postId = reelPostCard.dataset.postId || '';
      const reel = reelFromPostId(postId);
      const action = appAction.dataset.action;

      if (reel && ['like', 'comments', 'share', 'seller-profile', 'play-video'].includes(action)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (action === 'like') toggleReelLike(reel.id);
        else if (action === 'comments') openReelComments(reel.id);
        else if (action === 'share') shareReel(reel.id);
        else if (action === 'seller-profile') window.openUserProfile?.(reel.user_id);
        else if (action === 'play-video') {
          const video = reelPostCard.querySelector('video');
          if (video) video.paused ? video.play().catch(() => null) : video.pause();
        }
        return;
      }
    }

    const button = event.target.closest('[data-media-action]');
    if (!button) return;

    const action = button.dataset.mediaAction;

    if (action === 'sell-post-source') {
      openSourcePicker('post');
    } else if (action === 'sell-product-source') {
      openSourcePicker('product');
    } else if (action === 'sell-reel-source' || action === 'reel-create') {
      openSourcePicker('reel');
    } else if (action === 'pick-source') {
      chooseDeviceFile(button.dataset.kind, button.dataset.source);
    } else if (action === 'media-retake') {
      openSourcePicker(button.dataset.kind);
    } else if (action === 'media-confirm') {
      const kind = button.dataset.kind;
      if (kind === 'post') openExistingPostFormWithFile();
      else if (kind === 'product') openExistingProductFormWithFile();
      else if (kind === 'reel') openReelCaptionForm();
      else if (kind === 'story') openStoryNextForm();
    } else if (action === 'story-text') {
      openStoryTextForm();
    } else if (action === 'reel-like') {
      toggleReelLike(button.dataset.reelId);
    } else if (action === 'reel-comments') {
      openReelComments(button.dataset.reelId);
    } else if (action === 'reel-share') {
      shareReel(button.dataset.reelId);
    } else if (action === 'reel-profile') {
      window.openUserProfile?.(button.dataset.userId);
    } else if (action === 'open-reel') {
      openReelsPage(button.dataset.reelId);
    } else if (action === 'story-close') {
      closeStoryViewer();
    } else if (action === 'story-like') {
      toggleStoryLike(button.dataset.storyId);
    } else if (action === 'story-comments') {
      const panel = document.querySelector('#storyCommentsPanel');
      if (MEDIA.storyCommentsOpen && panel) {
        panel.hidden = true;
        MEDIA.storyCommentsOpen = false;
      } else {
        loadStoryComments(button.dataset.storyId).catch(error => notify(error.message));
      }
    } else if (action === 'story-share') {
      shareStory(button.dataset.storyId);
    } else if (action === 'public-videos') {
      renderPublicVideoTab(button);
    }
  }, true);

  document.addEventListener('submit', event => {
    if (event.target?.id === 'reelCreateForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      submitReel(event.target);
      return;
    }

    if (event.target?.id === 'reelCommentForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      submitReelComment(event.target);
      return;
    }

    if (event.target?.id === 'storyTextForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const form = event.target;
      const caption = new FormData(form).get('caption');
      const button = form.querySelector('button[type="submit"]');
      if (button) {
        button.disabled = true;
        button.textContent = 'Membagikan...';
      }
      publishStory({ caption }).catch(() => {
        if (button) {
          button.disabled = false;
          button.textContent = 'Bagikan';
        }
      });
      return;
    }

    if (event.target?.id === 'storyPhotoForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const form = event.target;
      const caption = new FormData(form).get('caption');
      const file = MEDIA.selectedFile;
      const button = form.querySelector('button[type="submit"]');
      if (button) {
        button.disabled = true;
        button.textContent = 'Membagikan...';
      }
      publishStory({ caption, file }).catch(() => {
        if (button) {
          button.disabled = false;
          button.textContent = 'Bagikan';
        }
      });
      return;
    }

    if (event.target?.id === 'storyQuickCommentForm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      submitStoryComment(event.target);
    }
  }, true);

  const observer = new MutationObserver(() => {
    patchNavigation();
    decorateHomeReels();
    decoratePublicProfileVideoTab();

    const postCaption = document.querySelector('#postCreateCaption');
    if (postCaption) decorateCaptionEditor(postCaption);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  window.openReelsPage = openReelsPage;
  window.openReelById = id => openReelsPage(id);
  window.openStoryV2 = openStoryV2;
  window.reloadReels = loadReels;

  async function boot() {
    for (let i = 0; i < 80; i += 1) {
      if (!STATE.loading && DOM.feed) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    patchNavigation();
    overrideStoryRenderer();
    if (typeof renderStories === 'function') renderStories();
    await loadReels({ renderHome: true });
    await handleMediaDeepLink();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0), { once: true });
  } else {
    setTimeout(boot, 0);
  }
})();
