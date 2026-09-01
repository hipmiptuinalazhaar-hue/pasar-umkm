'use strict';

/* =========================================================
   PASAR UMKM - NOTIFICATION FUNCTIONALITY BRIDGE
   Menangani entity baru sebelum notification-core fallback
   membuka profil aktor.
   ========================================================= */

(() => {
  async function markRead(notificationId) {
    if (!notificationId) {
      return;
    }

    try {
      await fetch(
        `/api/social/notifications/${encodeURIComponent(notificationId)}/read`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            Accept: 'application/json'
          },
          cache: 'no-store'
        }
      );

      window.refreshNotificationBadge?.();
    } catch (error) {
      console.error(
        '[Pasar UMKM] Notification bridge read error:',
        error
      );
    }
  }

  document.addEventListener(
    'click',
    event => {
      const row = event.target.closest(
        '.notification-row[data-notification-id]'
      );

      if (!row) {
        return;
      }

      const entityType = String(
        row.dataset.notificationEntityType || ''
      ).toLowerCase();

      if (
        entityType !== 'order' &&
        entityType !== 'message'
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      row.classList.remove('unread');
      row.querySelector('.notification-unread-dot')?.remove();

      markRead(row.dataset.notificationId || '');

      if (entityType === 'order') {
        if (typeof closeBottomSheet === 'function') {
          closeBottomSheet();
        }

        window.openCommerceOrder?.(
          row.dataset.notificationEntityId || ''
        );
        return;
      }

      if (entityType === 'message') {
        if (typeof closeBottomSheet === 'function') {
          closeBottomSheet();
        }

        window.openSocialMessages?.();
      }
    },
    true
  );
})();
