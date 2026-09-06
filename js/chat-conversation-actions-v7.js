'use strict';

/* =========================================================
   PASAR UMKM - CHAT V7 CONVERSATION GESTURE ADAPTER
   Restores long-press / context-menu access to the existing
   Chat V7 conversation action owner. No duplicate API/state.
   ========================================================= */

(() => {
  if (window.PasarChatConversationActions?.version === '1.0') return;

  const press = {
    timer: null,
    row: null,
    x: 0,
    y: 0,
    suppressUntil: 0
  };

  function cancelPress() {
    window.clearTimeout(press.timer);
    press.timer = null;
    press.row = null;
  }

  function conversationRow(target) {
    return target?.closest?.('[data-chat-v7-row]') || null;
  }

  function openRowActions(row) {
    const menu = row?.querySelector?.(
      '[data-chat-v7-action="conversation-menu"][data-conversation-id]'
    );
    if (!menu) return false;

    if (navigator.vibrate) navigator.vibrate(24);
    menu.click();
    press.suppressUntil = Date.now() + 800;
    return true;
  }

  function beginPress(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target?.closest?.('.chat-v7-row-menu')) return;

    const row = conversationRow(event.target);
    if (!row) return;

    cancelPress();
    press.row = row;
    press.x = Number(event.clientX || 0);
    press.y = Number(event.clientY || 0);
    press.timer = window.setTimeout(() => {
      const current = press.row;
      press.timer = null;
      press.row = null;
      openRowActions(current);
    }, 520);
  }

  function movePress(event) {
    if (!press.timer) return;
    const dx = Math.abs(Number(event.clientX || 0) - press.x);
    const dy = Math.abs(Number(event.clientY || 0) - press.y);
    if (dx > 12 || dy > 12) cancelPress();
  }

  function suppressFollowUpClick(event) {
    if (Date.now() >= press.suppressUntil) return;
    if (!conversationRow(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function openContextMenu(event) {
    const row = conversationRow(event.target);
    if (!row) return;
    event.preventDefault();
    event.stopPropagation();
    openRowActions(row);
  }

  function normalizeActionSheet(scope = document) {
    const deleteButton = scope.querySelector?.(
      '.chat-v7-action-sheet [data-chat-v7-action="conversation-state"][data-state-action="delete_me"]'
    );
    if (!deleteButton || deleteButton.dataset.chatDeleteLabelV2 === 'true') return;

    deleteButton.dataset.chatDeleteLabelV2 = 'true';
    deleteButton.innerHTML = '<i class="ph ph-trash" aria-hidden="true"></i>Hapus percakapan';
    deleteButton.setAttribute(
      'aria-label',
      'Hapus percakapan ini dari daftar pesan Anda'
    );
  }

  window.addEventListener('pointerdown', beginPress, true);
  window.addEventListener('pointermove', movePress, true);
  window.addEventListener('pointerup', cancelPress, true);
  window.addEventListener('pointercancel', cancelPress, true);
  window.addEventListener('click', suppressFollowUpClick, true);
  window.addEventListener('contextmenu', openContextMenu, true);

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        normalizeActionSheet(node);
      }
    }
    normalizeActionSheet(document);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  window.PasarChatConversationActions = Object.freeze({
    version: '1.0',
    openForRow: openRowActions
  });
})();