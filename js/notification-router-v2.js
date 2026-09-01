'use strict';

(() => {
  async function markRead(id) {
    if (!id) return;

    try {
      await fetch(
        `/api/social/notifications/${encodeURIComponent(id)}/read`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { Accept: 'application/json' },
          cache: 'no-store'
        }
      );
      window.refreshNotificationBadge?.();
    } catch (error) {
      console.error('[Pasar UMKM] Notification read error:', error);
    }
  }

  function leaveNotificationShell() {
    document
      .querySelector('.app')
      ?.classList.remove('account-profile-active');

    if (typeof DOM !== 'undefined') {
      if (DOM.storiesSection) DOM.storiesSection.hidden = false;
      if (DOM.homeDiscovery) DOM.homeDiscovery.hidden = false;
    }
  }

  function findPost(entityId) {
    return Array.isArray(DATA?.posts)
      ? DATA.posts.find(item =>
          String(item.backendId || '') === String(entityId) ||
          String(item.id || '') === String(entityId) ||
          String(item.id || '') === `post-${entityId}`
        )
      : null;
  }

  async function openOrder(orderId) {
    if (!orderId) return;

    try {
      const response = await fetch('/api/commerce/orders?scope=buyer', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      const buyerOrder =
        response.ok &&
        data.ok === true &&
        Array.isArray(data.orders) &&
        data.orders.some(order => String(order.id || '') === String(orderId));

      if (buyerOrder) {
        window.openCommerceOrder?.(orderId);
        return;
      }
    } catch (error) {
      console.error('[Pasar UMKM] Order notification context error:', error);
    }

    window.openSellerCommerceOrders?.();
  }

  function openStartSelling() {
    leaveNotificationShell();

    if (typeof openSell === 'function') {
      openSell();
    } else if (typeof navigate === 'function') {
      navigate('sell');
    }
  }

  function openPost(entityId) {
    const post = findPost(entityId);
    leaveNotificationShell();

    if (typeof navigate === 'function') {
      navigate('home');
    }

    if (post && typeof scrollToPost === 'function') {
      requestAnimationFrame(() => {
        setTimeout(() => scrollToPost(post.id), 40);
      });
    } else if (typeof showToast === 'function') {
      showToast('Postingan belum tersedia di feed saat ini.');
    }
  }

  function openProduct(entityId) {
    leaveNotificationShell();

    if (typeof navigate === 'function') {
      navigate('home');
    }

    requestAnimationFrame(() => {
      setTimeout(() => {
        if (entityId && typeof openProductDetail === 'function') {
          openProductDetail(entityId);
        }
      }, 40);
    });
  }

  async function route(row) {
    const type = String(row.dataset.notificationEntityType || '').toLowerCase();
    const entityId = String(row.dataset.notificationEntityId || '');
    const actorId = String(row.dataset.notificationActorId || '');

    if (type === 'start_selling') {
      openStartSelling();
      return;
    }

    if (type === 'profile') {
      leaveNotificationShell();
      window.openUserProfile?.(actorId || entityId);
      return;
    }

    if (type === 'post') {
      openPost(entityId);
      return;
    }

    if (type === 'product') {
      openProduct(entityId);
      return;
    }

    if (type === 'reel') {
      leaveNotificationShell();
      window.openReelById?.(entityId);
      return;
    }

    if (type === 'story') {
      leaveNotificationShell();
      window.openStoryV2?.(entityId);
      return;
    }

    if (type === 'order') {
      leaveNotificationShell();
      await openOrder(entityId);
      return;
    }

    if (type === 'message') {
      leaveNotificationShell();
      window.openSocialMessages?.();
      return;
    }

    if (actorId) {
      leaveNotificationShell();
      window.openUserProfile?.(actorId);
    }
  }

  window.addEventListener(
    'click',
    event => {
      const row = event.target.closest?.(
        '.notification-row[data-notification-id]'
      );

      if (!row) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      row.classList.remove('unread');
      row.querySelector('.notification-unread-dot')?.remove();

      const id = row.dataset.notificationId || '';
      markRead(id);
      route(row);
    },
    true
  );
})();
