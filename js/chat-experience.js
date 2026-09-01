'use strict';

(() => {
  if (typeof STATE === 'undefined') return;

  const CHAT = {
    activeConversationId: '',
    metaLoading: false,
    metaTimer: null,
    listTimer: null,
    listSyncing: false,
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

  function syncViewport() {
    const viewport = window.visualViewport;
    const height = Math.max(
      320,
      Math.round(viewport?.height || window.innerHeight || 720)
    );

    document.documentElement.style.setProperty(
      '--chat-visual-height',
      `${height}px`
    );
  }

  function setChatShellState() {
    const app = document.querySelector('.app');
    const thread = document.querySelector('.social-conversation-page');
    const active = Boolean(thread);

    app?.classList.toggle('chat-thread-active', active);
    document.body.classList.toggle('chat-thread-body', active);

    if (active) syncViewport();
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
      const currentUserId = String(data.current_user_id || STATE.user?.id || '');
      const count = Math.min(rows.length, messages.length);

      for (let offset = 1; offset <= count; offset += 1) {
        const row = rows[rows.length - offset];
        const meta = messages[messages.length - offset];
        row.dataset.messageId = String(meta.id || '');
        row.dataset.messageMine =
          String(meta.sender_id || '') === currentUserId
            ? 'true'
            : 'false';
      }
    } catch (error) {
      console.error('[Pasar UMKM] Sync message meta error:', error);
    } finally {
      CHAT.metaLoading = false;
    }
  }

  function scheduleThreadMeta() {
    clearTimeout(CHAT.metaTimer);
    CHAT.metaTimer = setTimeout(syncThreadMeta, 100);
  }

  async function syncConversationListState() {
    if (CHAT.listSyncing) return;

    const page = document.querySelector('.social-messages-page');
    const list = page?.querySelector('.social-messages-list');
    if (!list) return;

    CHAT.listSyncing = true;

    try {
      const data = await api('/api/social/conversations');
      const conversations = Array.isArray(data.conversations)
        ? data.conversations
        : [];

      const signature = conversations
        .map(item => [
          item.id,
          item.viewer_pinned ? 1 : 0,
          item.viewer_archived ? 1 : 0,
          item.last_message_at || item.updated_at || ''
        ].join(':'))
        .join('|');

      if (list.dataset.chatStateSignature === signature) {
        return;
      }

      const rowMap = new Map(
        [...list.querySelectorAll('.social-conversation-row')]
          .map(row => [String(row.dataset.conversationId || ''), row])
      );

      const activeRows = [];
      const archivedRows = [];

      for (const conversation of conversations) {
        const id = String(conversation.id || '');
        const row = rowMap.get(id);
        if (!row) continue;

        row.dataset.conversationPinned = conversation.viewer_pinned ? 'true' : 'false';
        row.dataset.conversationArchived = conversation.viewer_archived ? 'true' : 'false';
        row.classList.toggle('is-pinned', Boolean(conversation.viewer_pinned));
        row.classList.toggle('is-archived', Boolean(conversation.viewer_archived));

        if (conversation.viewer_archived) {
          archivedRows.push(row);
        } else {
          activeRows.push(row);
        }
      }

      list.innerHTML = '';

      const activeWrap = document.createElement('div');
      activeWrap.className = 'chat-active-conversations';
      activeRows.forEach(row => activeWrap.appendChild(row));
      list.appendChild(activeWrap);

      if (archivedRows.length) {
        const archive = document.createElement('details');
        archive.className = 'chat-archived-section';
        archive.innerHTML = `
          <summary>
            <span><i class="ph ph-archive"></i> Diarsipkan</span>
            <strong>${archivedRows.length}</strong>
          </summary>
          <div class="chat-archived-list"></div>
        `;

        const archiveList = archive.querySelector('.chat-archived-list');
        archivedRows.forEach(row => archiveList.appendChild(row));
        list.appendChild(archive);
      }

      list.dataset.chatStateSignature = signature;
    } catch (error) {
      console.error('[Pasar UMKM] Sync conversation state error:', error);
    } finally {
      CHAT.listSyncing = false;
    }
  }

  function scheduleConversationState() {
    clearTimeout(CHAT.listTimer);
    CHAT.listTimer = setTimeout(syncConversationListState, 140);
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

    const name = row.querySelector('.social-conversation-copy strong')
      ?.textContent?.trim() || 'percakapan';
    const pinned = row.dataset.conversationPinned === 'true';
    const archived = row.dataset.conversationArchived === 'true';

    openSheet(
      `
        <section class="chat-action-sheet">
          <h2 id="sheetTitle">${esc(name)}</h2>
          <p class="chat-action-hint">Kelola percakapan ini.</p>

          <button
            type="button"
            class="menu-sheet-btn"
            data-chat-action="conversation-${pinned ? 'unpin' : 'pin'}"
            data-conversation-id="${esc(conversationId)}"
          >
            <i class="ph ph-push-pin"></i>
            ${pinned ? 'Lepas sematan' : 'Sematkan'}
          </button>

          <button
            type="button"
            class="menu-sheet-btn"
            data-chat-action="conversation-${archived ? 'unarchive' : 'archive'}"
            data-conversation-id="${esc(conversationId)}"
          >
            <i class="ph ph-archive"></i>
            ${archived ? 'Keluarkan dari arsip' : 'Arsipkan'}
          </button>

          <button
            type="button"
            class="menu-sheet-btn chat-danger-action"
            data-chat-action="conversation-delete-me"
            data-conversation-id="${esc(conversationId)}"
          >
            <i class="ph ph-trash"></i>
            Hapus pesan
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
      toast('Tahan pesan sekali lagi setelah data pesan dimuat.');
      return;
    }

    const mine = row.dataset.messageMine === 'true';

    openSheet(
      `
        <section class="chat-action-sheet">
          <h2 id="sheetTitle">Hapus Pesan</h2>

          <button
            type="button"
            class="menu-sheet-btn"
            data-chat-action="message-delete-me"
            data-message-id="${esc(messageId)}"
          >
            <i class="ph ph-trash"></i>
            Hapus untuk saya
          </button>

          ${mine ? `
            <button
              type="button"
              class="menu-sheet-btn chat-danger-action"
              data-chat-action="message-delete-everyone"
              data-message-id="${esc(messageId)}"
            >
              <i class="ph ph-trash-simple"></i>
              Hapus untuk semua
            </button>
          ` : ''}
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

      if (navigator.vibrate) navigator.vibrate(30);

      if (target.classList.contains('social-conversation-row')) {
        conversationMenu(target);
      } else {
        messageMenu(target);
      }
    }, 520);
  }

  function moveLongPress(event) {
    if (!CHAT.longPressTimer) return;

    const dx = Math.abs(Number(event.clientX || 0) - CHAT.pressStartX);
    const dy = Math.abs(Number(event.clientY || 0) - CHAT.pressStartY);
    if (dx > 12 || dy > 12) cancelLongPress();
  }

  async function conversationAction(conversationId, action) {
    try {
      await api(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/action`,
        { method: 'POST', body: { action } }
      );

      closeSheet();

      toast(
        action === 'pin'
          ? 'Percakapan disematkan.'
          : action === 'unpin'
            ? 'Sematan percakapan dilepas.'
            : action === 'archive'
              ? 'Percakapan diarsipkan.'
              : action === 'unarchive'
                ? 'Percakapan dikembalikan dari arsip.'
                : 'Percakapan dihapus dari akun Anda.'
      );

      if (typeof window.openSocialMessages === 'function') {
        await window.openSocialMessages();
      }
      window.refreshSocialUnreadBadge?.();
    } catch (error) {
      toast(error.message || 'Percakapan belum dapat diperbarui.');
    }
  }

  async function messageAction(messageId, action) {
    if (action === 'delete_everyone') {
      const confirmed = window.confirm('Hapus pesan ini untuk semua?');
      if (!confirmed) return;
    }

    try {
      await api(
        `/api/chat/messages/${encodeURIComponent(messageId)}/action`,
        { method: 'POST', body: { action } }
      );

      closeSheet();
      document
        .querySelector(`.social-message-row[data-message-id="${CSS.escape(messageId)}"]`)
        ?.remove();

      toast(
        action === 'delete_everyone'
          ? 'Pesan dihapus untuk semua.'
          : 'Pesan dihapus untuk Anda.'
      );

      window.refreshSocialUnreadBadge?.();
    } catch (error) {
      toast(error.message || 'Pesan belum dapat dihapus.');
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
      const conversationId = action.dataset.conversationId;
      const messageId = action.dataset.messageId;

      if (name === 'conversation-pin') {
        conversationAction(conversationId, 'pin');
      } else if (name === 'conversation-unpin') {
        conversationAction(conversationId, 'unpin');
      } else if (name === 'conversation-archive') {
        conversationAction(conversationId, 'archive');
      } else if (name === 'conversation-unarchive') {
        conversationAction(conversationId, 'unarchive');
      } else if (name === 'conversation-delete-me') {
        conversationAction(conversationId, 'delete_me');
      } else if (name === 'message-delete-me') {
        messageAction(messageId, 'delete_me');
      } else if (name === 'message-delete-everyone') {
        messageAction(messageId, 'delete_everyone');
      }
    },
    true
  );

  document.addEventListener(
    'focusin',
    event => {
      if (event.target?.id === 'socialThreadInput') {
        requestAnimationFrame(syncViewport);
        setTimeout(syncViewport, 80);
        setTimeout(syncViewport, 280);
      }
    },
    true
  );

  window.addEventListener('resize', syncViewport, { passive: true });
  window.visualViewport?.addEventListener('resize', syncViewport, { passive: true });
  window.visualViewport?.addEventListener('scroll', syncViewport, { passive: true });

  const observer = new MutationObserver(() => {
    setChatShellState();

    if (document.querySelector('.social-conversation-page')) {
      scheduleThreadMeta();
    } else {
      CHAT.activeConversationId = '';
    }

    if (document.querySelector('.social-messages-page .social-messages-list')) {
      scheduleConversationState();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  syncViewport();
  setChatShellState();
})();
