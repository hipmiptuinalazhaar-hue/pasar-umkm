'use strict';

/* =========================================================
   PASAR UMKM - NOTIFICATION CLICK FIX
   Intercept pada window capture supaya satu klik notifikasi
   hanya menjalankan satu navigasi target.
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
        '[Pasar UMKM] Notification click mark-read error:',
        error
      );
    }
  }

  function findPostByBackendId(entityId) {
    if (!Array.isArray(DATA?.posts)) {
      return null;
    }

    return DATA.posts.find(item =>
      String(item.backendId || '') === String(entityId) ||
      String(item.id || '') === `post-${entityId}` ||
      String(item.id || '') === String(entityId)
    ) || null;
  }

  async function openOrder(orderId) {
    if (!orderId) {
      return;
    }

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
      const buyerOwnsOrder =
        response.ok &&
        data.ok === true &&
        Array.isArray(data.orders) &&
        data.orders.some(order =>
          String(order.id || '') === String(orderId)
        );

      if (buyerOwnsOrder) {
        window.openCommerceOrder?.(orderId);
        return;
      }
    } catch (error) {
      console.error(
        '[Pasar UMKM] Notification order context error:',
        error
      );
    }

    if (typeof window.openSellerCommerceOrders === 'function') {
      window.openSellerCommerceOrders();
      return;
    }

    window.openCommerceOrder?.(orderId);
  }

  async function routeNotification(row) {
    const actorId = String(
      row.dataset.notificationActorId || ''
    ).trim();
    const entityType = String(
      row.dataset.notificationEntityType || ''
    ).trim().toLowerCase();
    const entityId = String(
      row.dataset.notificationEntityId || ''
    ).trim();

    if (typeof closeBottomSheet === 'function') {
      closeBottomSheet();
    }

    if (entityType === 'profile') {
      if (actorId) {
        window.openUserProfile?.(actorId);
      }
      return;
    }

    if (entityType === 'post') {
      document
        .querySelector('.app')
        ?.classList.remove('account-profile-active');

      if (typeof navigate === 'function') {
        navigate('home');
      }

      const post = findPostByBackendId(entityId);

      if (post && typeof scrollToPost === 'function') {
        window.setTimeout(
          () => scrollToPost(post.id),
          80
        );
      } else if (typeof showToast === 'function') {
        showToast('Postingan belum tersedia di feed saat ini.');
      }
      return;
    }

    if (entityType === 'product') {
      document
        .querySelector('.app')
        ?.classList.remove('account-profile-active');

      if (typeof navigate === 'function') {
        navigate('home');
      }

      if (entityId && typeof openProductDetail === 'function') {
        window.setTimeout(
          () => openProductDetail(entityId),
          80
        );
      }
      return;
    }

    if (entityType === 'order') {
      await openOrder(entityId);
      return;
    }

    if (entityType === 'message') {
      window.openSocialMessages?.();
      return;
    }

    if (actorId) {
      window.openUserProfile?.(actorId);
    }
  }

  window.addEventListener(
    'click',
    event => {
      const row = event.target.closest?.(
        '.notification-row[data-notification-id]'
      );

      if (!row) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      row.classList.remove('unread');
      row.querySelector('.notification-unread-dot')?.remove();

      markRead(
        row.dataset.notificationId || ''
      );

      routeNotification(row);
    },
    true
  );
})();
