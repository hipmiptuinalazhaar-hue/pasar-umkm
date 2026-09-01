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

  async function openOrderNotification(orderId) {
    if (!orderId) {
      return;
    }

    /*
     * Seller juga boleh menjadi buyer. Jadi jangan menebak konteks
     * hanya dari role. Cek dulu apakah order ini milik user sebagai buyer.
     */
    try {
      const response = await fetch(
        '/api/commerce/orders?scope=buyer',
        {
          method: 'GET',
          credentials: 'include',
          headers: {
            Accept: 'application/json'
          },
          cache: 'no-store'
        }
      );

      const data = await response.json().catch(() => ({}));
      const isBuyerOrder =
        response.ok &&
        data.ok === true &&
        Array.isArray(data.orders) &&
        data.orders.some(order =>
          String(order.id || '') === String(orderId)
        );

      if (isBuyerOrder) {
        window.openCommerceOrder?.(orderId);
        return;
      }
    } catch (error) {
      console.error(
        '[Pasar UMKM] Order notification context check error:',
        error
      );
    }

    if (typeof window.openSellerCommerceOrders === 'function') {
      window.openSellerCommerceOrders();
      return;
    }

    window.openCommerceOrder?.(orderId);
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

        openOrderNotification(
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
