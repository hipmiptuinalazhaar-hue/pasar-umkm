'use strict';

(() => {
  let lastUserId = '';
  let timer = null;

  async function sync() {
    const page = document.querySelector('.social-conversation-page');
    if (!page) {
      lastUserId = '';
      return;
    }

    const userId = String(
      page.querySelector('[data-social-action="thread-profile"][data-user-id]')?.dataset?.userId || ''
    ).trim();

    if (!userId || userId === lastUserId) return;
    lastUserId = userId;

    try {
      const resolveResponse = await fetch(
        `/api/chat/conversations/by-user/${encodeURIComponent(userId)}`,
        { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } }
      );
      const resolved = await resolveResponse.json().catch(() => ({}));
      const conversationId = String(resolved.conversation_id || '');
      if (!resolveResponse.ok || resolved.ok !== true || !conversationId) return;

      await fetch(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}/mark-read`,
        { method: 'POST', credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } }
      );

      window.refreshSocialUnreadBadge?.();
    } catch (error) {
      console.error('[Pasar UMKM] Chat mark-read sync error:', error);
    }
  }

  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(sync, 100);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(sync, 0);
})();
