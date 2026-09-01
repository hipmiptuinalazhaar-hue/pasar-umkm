'use strict';

(() => {
  if (typeof STATE === 'undefined') return;

  const CHAT = {
    activeConversationId: '',
    metaLoading: false,
    metaTimer: null,
    longPressTimer: null,
    pressStartX: 0,
    pressStartY: 0,
    pressTarget: null,
    suppressClickUntil: 0
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

  function toast(message) {
    if (typeof showToast === 'function') showToast(message);
  }

  async function api(path, options = {}) {
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

  function setChatShellState() {
    const app = document.querySelector('.app');
    const thread = document.querySelector('.social-conversation-page');
    app?.classList.toggle('chat-thread-active', Boolean(thread));
  }

  async function resolveActiveConversationId() {
    const page = document.querySelector('.social-conversation-page');
    if (!page) {
      CHAT.activeConversationId = '';
      return '';
    }

    const profileButton = page.querySelector(
      '[data-social-action="thread-profile"][data-user-id]'
    );
    const otherUserId = String(profileButton?.dataset?.userId || '').trim();

    if (!otherUserId) return CHAT.activeConversationId;

    try {
      const data = await api(
        `/api/chat/conversations/by-user/${encodeURIComponent(otherUserId)}`
      );
      CHAT.activeConversationId = String(data.conversation_id || '');
      return CHAT.activeConversationId;
    } catch (error) {
      console.error('[Pasar UMKM] Resolve conversation error:', error);
      return '';
    }
  }

  function removeStateDecorations(row) {
    row.classList.remove('is-pinned', 'is-archived');
    row.querySelector('.chat-message-state')?.remove();
  }

  function decorateMessageRow(row, meta) {
    if (!row || !meta) return;

    row.dataset.messageId = String(meta.id || '');
    row.dataset.messagePinned = meta.viewer_pinned ? 'true' : 'false';
    row.dataset.messageArchived = meta.viewer_archived ? 'true' : 'false';

    removeStateDecorations(row);

    if (meta.viewer_pinned) row.classList.add('is-pinned');
    if (meta.viewer_archived) row.classList.add('is-archived');

    if (meta.viewer_pinned || meta.viewer_archived) {
      const state = document.createElement('span');
      state.className = 'chat-message-state';
      state.innerHTML = [
        meta.viewer_pinned ? '<i class="ph-fill ph-push-pin"></i> Disematkan' : '',
        meta.viewer_archived ? '<i class="ph ph-archive"></i> Diarsipkan' : ''
      ].filter(Boolean).join(' · ');
      row.querySelector('.social-message-bubble')?.appendChild(state);
    }
  }

  function updatePinnedBanner(messages) {
    const page = document.querySelector('.social-conversation-page');
    if (!page) return;

    page.querySelector('.chat-pinned-banner')?.remove();

    const pinned = (messages || []).filter(item => item.viewer_pinned);
    if (!pinned.length) return;

    const banner = document.createElement('button');
    banner.type = 'button';
    banner.className = 'chat-pinned-banner';
    banner.innerHTML = `
      <i class="ph-fill ph-push-pin"></i>
      <span>${pinned.length} pesan disematkan</span>
      <i class="ph ph-caret-down"></i>
    `;

    const topbar = page.querySelector('.social-page-topbar');
    topbar?.insertAdjacentElement('afterend', banner);

    banner.addEventListener('click', () => {
      const targetId = String(pinned[pinned.length - 1]?.id || '');
      page
        .querySelector(`.social-message-row[data-message-id="${CSS.escape(targetId)}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  async function syncThreadMeta() {
    if (CHAT.metaLoading) return;
    const page = document.querySelector('.social-conversation-page');
    if (!page) return;

    CHAT.metaLoading = true;

    try {
      const conversationId =
        CHAT.activeConversationId ||
        await resolveActiveConversationId();

      if (!conversationId) return;

      const data = await api(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages-meta`
      );

      const rows = [...page.querySelectorAll('.social-message-row')];
      const messages = Array.isArray(data.messages) ? data.messages : [];
      const count = Math.min(rows.length, messages.length);

      for (let offset = 1; offset <= count; offset += 1) {
        decorateMessageRow(
          rows[rows.length - offset],
          messages[messages.length - offset]
        );
      }

      updatePinnedBanner(messages);
    } catch (error) {
      console.error('[Pasar UMKM] Sync message meta error:', error);
    } finally {
      CHAT.metaLoading = false;
    }
  }

  function scheduleThreadMeta() {
    clearTimeout(CHAT.metaTimer);
    CHAT.metaTimer = setTimeout(syncThreadMeta, 120);
  }

  function openSheet(html, key) {
    if (typeof openBottomSheet === 'function') {
      openBottomSheet(html, key);
    }
  }

  function closeSheet() {
    if (typeof closeBottomSheet === 'function') closeBottomSheet();
  }

  function conversationMenu(row) {
    const conversationId = String(row?.dataset?.conversationId || '').trim();
    if (!conversationId) return;

    const name = row.querySelector('.social-conversation-copy strong')?.textContent?.trim() || 'percakapan';

    openSheet(
      `
        <section class="chat-action-sheet">
          <h2 id="sheetTitle">${esc(name)}</h2>
          <p class="chat-action-hint">Pilih tindakan untuk percakapan ini.</p>

          <button
            type="button"
            class="menu-sheet-btn"
            data-chat-action="conversation-delete-me"
            data-conversation-id="${esc(conversationId)}"
          >
            <i class="ph ph-trash"></i>
            Hapus untuk saya
          </button>

          <button
            type="button"
            class="menu-sheet-btn chat-danger-action"
            data-chat-action="conversation-delete-everyone"
            data-conversation-id="${esc(conversationId)}"
          >
            <i class="ph ph-trash-simple"></i>
            Hapus untuk semua
          </button>
        </section>
      `,
      'chat-conversation-actions'
    );
  }

  function messageMenu(row) {
    const messageId = String(row?.dataset?.messageId || '').trim();
    if (!messageId) {
      scheduleThreadMeta();
      toast('Tahan pesan sekali lagi setelah data chat dimuat.');
      return;
    }

    const pinned = row.dataset.messagePinned === 'true';
    const archived = row.dataset.messageArchived === 'true';

    openSheet(
      `
        <section class="chat-action-sheet">
          <h2 id="sheetTitle">Tindakan Pesan</h2>

          <button
            type="button"
            class="menu-sheet-btn"
            data-chat-action="message-${pinned ? 'unpin' : 'pin'}"
            data-message-id="${esc(messageId)}"
          >
            <i class="ph ph-push-pin"></i>
            ${pinned ? 'Lepas sematan' : 'Sematkan'}
          </button>

          <button
            type="button"
            class="menu-sheet-btn"
            data-chat-action="message-${archived ? 'unarchive' : 'archive'}"
            data-message-id="${esc(messageId)}"
          >
            <i class="ph ph-archive"></i>
            ${archived ? 'Keluarkan dari arsip' : 'Arsipkan'}
          </button>

          <button
            type="button"
            class="menu-sheet-btn chat-danger-action"
            data-chat-action="message-delete-me"
            data-message-id="${esc(messageId)}"
          >
            <i class="ph ph-trash"></i>
            Hapus pesan
          </button>
        </section>
      `,
      'chat-message-actions'
    );
  }

  function cancelLongPress() {
    if (CHAT.longPressTimer) {
      clearTimeout(CHAT.longPressTimer);
      CHAT.longPressTimer = null;
    }
    CHAT.pressTarget = null;
  }

  function beginLongPress(event) {
    if (event.button !== undefined && event.button !== 0) return;

    const conversation = event.target.closest('.social-conversation-row');
    const message = event.target.closest('.social-message-row');
    const target = conversation || message;
    if (!target) return;

    cancelLongPress();
    CHAT.pressTarget = target;
    CHAT.pressStartX = Number(event.clientX || 0);
    CHAT.pressStartY = Number(event.clientY || 0);

    CHAT.longPressTimer = setTimeout(() => {
      CHAT.longPressTimer = null;
      CHAT.suppressClickUntil = Date.now() + 900;

      if (navigator.vibrate) navigator.vibrate(35);

      if (target.classList.contains('social-conversation-row')) {
        conversationMenu(target);
      } else {
        messageMenu(target);
      }
    }, 560);
  }

  function moveLongPress(event) {
    if (!CHAT.longPressTimer) return;

    const dx = Math.abs(Number(event.clientX || 0) - CHAT.pressStartX);
    const dy = Math.abs(Number(event.clientY || 0) - CHAT.pressStartY);
    if (dx > 12 || dy > 12) cancelLongPress();
  }

  async function conversationAction(conversationId, action) {
    if (action === 'delete_everyone') {
      const confirmed = window.confirm(
        'Hapus seluruh percakapan untuk kedua akun? Tindakan ini tidak dapat dibatalkan.'
      );
      if (!confirmed) return;
    }

    try {
      await api(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/action`,
        { method: 'POST', body: { action } }
      );

      closeSheet();
      document
        .querySelector(`.social-conversation-row[data-conversation-id="${CSS.escape(conversationId)}"]`)
        ?.remove();

      toast(
        action === 'delete_everyone'
          ? 'Percakapan dihapus untuk semua.'
          : 'Percakapan dihapus dari akun Anda.'
      );

      window.refreshSocialUnreadBadge?.();
    } catch (error) {
      toast(error.message || 'Percakapan belum dapat dihapus.');
    }
  }

  async function messageAction(messageId, action) {
    try {
      await api(
        `/api/chat/messages/${encodeURIComponent(messageId)}/action`,
        { method: 'POST', body: { action } }
      );

      closeSheet();

      if (action === 'delete_me') {
        document
          .querySelector(`.social-message-row[data-message-id="${CSS.escape(messageId)}"]`)
          ?.remove();
        toast('Pesan dihapus dari akun Anda.');
      } else {
        toast(
          action === 'pin'
            ? 'Pesan disematkan.'
            : action === 'unpin'
              ? 'Sematan dilepas.'
              : action === 'archive'
                ? 'Pesan diarsipkan.'
                : 'Pesan dikeluarkan dari arsip.'
        );
      }

      await syncThreadMeta();
    } catch (error) {
      toast(error.message || 'Pesan belum dapat diperbarui.');
    }
  }

  document.addEventListener('pointerdown', beginLongPress, true);
  document.addEventListener('pointermove', moveLongPress, true);
  document.addEventListener('pointerup', cancelLongPress, true);
  document.addEventListener('pointercancel', cancelLongPress, true);

  document.addEventListener(
    'click',
    event => {
      if (
        Date.now() < CHAT.suppressClickUntil &&
        event.target.closest('.social-conversation-row, .social-message-row')
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      const action = event.target.closest('[data-chat-action]');
      if (!action) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const name = String(action.dataset.chatAction || '');

      if (name === 'conversation-delete-me') {
        conversationAction(action.dataset.conversationId, 'delete_me');
      } else if (name === 'conversation-delete-everyone') {
        conversationAction(action.dataset.conversationId, 'delete_everyone');
      } else if (name === 'message-pin') {
        messageAction(action.dataset.messageId, 'pin');
      } else if (name === 'message-unpin') {
        messageAction(action.dataset.messageId, 'unpin');
      } else if (name === 'message-archive') {
        messageAction(action.dataset.messageId, 'archive');
      } else if (name === 'message-unarchive') {
        messageAction(action.dataset.messageId, 'unarchive');
      } else if (name === 'message-delete-me') {
        messageAction(action.dataset.messageId, 'delete_me');
      }
    },
    true
  );

  const observer = new MutationObserver(() => {
    setChatShellState();

    if (document.querySelector('.social-conversation-page')) {
      scheduleThreadMeta();
    } else {
      CHAT.activeConversationId = '';
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  setChatShellState();
})();
