'use strict';

/* =========================================================
   PASAR UMKM - NOTIFICATION CORE
   Pusat notifikasi real untuk follow, like, dan komentar.
   Juga mengaktifkan kontrol Batal Ikuti pada social graph.
   ========================================================= */

(() => {
  if (typeof STATE === 'undefined') {
    console.error(
      '[Pasar UMKM] Notification core gagal dimuat: STATE tidak tersedia.'
    );
    return;
  }

  const NOTIFICATION = {
    pollTimer: null,
    followingListOwnerId: '',
    loading: false
  };

  function esc(value) {
    if (typeof escapeHTML === 'function') {
      return escapeHTML(String(value ?? ''));
    }

    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function relativeTime(value) {
    if (!value) {
      return '';
    }

    if (typeof formatRelativeTime === 'function') {
      try {
        return formatRelativeTime(value);
      } catch {
        // fallback below
      }
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const diff = Date.now() - date.getTime();
    const minutes = Math.max(1, Math.floor(diff / 60000));

    if (minutes < 60) {
      return `${minutes} mnt`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
      return `${hours} jam`;
    }

    const days = Math.floor(hours / 24);

    if (days < 7) {
      return `${days} hari`;
    }

    return new Intl.DateTimeFormat(
      'id-ID',
      {
        day: 'numeric',
        month: 'short'
      }
    ).format(date);
  }

  async function request(path, options = {}) {
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
      const error = new Error(
        data.error ||
        'Permintaan notifikasi belum dapat diproses.'
      );

      error.status = response.status;
      throw error;
    }

    return data;
  }

  function prepareNotificationView() {
    if (typeof closeBottomSheet === 'function') {
      closeBottomSheet();
    }

    if (typeof closeSideMenu === 'function') {
      closeSideMenu();
    }

    STATE.activeNav = 'home';

    if (typeof updateNavigation === 'function') {
      updateNavigation();
    }

    document
      .querySelector('.app')
      ?.classList.add('account-profile-active');

    if (typeof DOM !== 'undefined') {
      if (DOM.storiesSection) {
        DOM.storiesSection.hidden = true;
      }

      if (DOM.homeDiscovery) {
        DOM.homeDiscovery.hidden = true;
      }
    }
  }

  function leaveNotificationView() {
    document
      .querySelector('.app')
      ?.classList.remove('account-profile-active');

    if (typeof navigate === 'function') {
      navigate('home');
      return;
    }

    if (typeof renderApplication === 'function') {
      STATE.activeNav = 'home';
      renderApplication();
    }
  }

  function notificationIcon(item) {
    const title = String(item.title || '').toLowerCase();
    const entity = String(item.entity_type || item.target_type || '').toLowerCase();

    if (entity === 'profile' || title.includes('pengikut')) {
      return 'ph-user-plus';
    }

    if (title.includes('like')) {
      return 'ph-heart';
    }

    if (entity === 'product') {
      return 'ph-shopping-bag-open';
    }

    if (title.includes('komentar')) {
      return 'ph-chat-circle-text';
    }

    return 'ph-bell';
  }

  function notificationAvatar(item) {
    const avatar = String(item.actor_avatar_url || '').trim();

    if (avatar) {
      return `
        <span class="notification-avatar">
          <img
            src="${esc(avatar)}"
            alt="${esc(item.actor_name || 'Pengguna')}"
            loading="lazy"
            decoding="async"
          >
        </span>
      `;
    }

    return `
      <span class="notification-avatar fallback">
        <i
          class="ph ${notificationIcon(item)}"
          aria-hidden="true"
        ></i>
      </span>
    `;
  }

  function notificationRow(item) {
    return `
      <button
        type="button"
        class="notification-row ${item.is_read ? '' : 'unread'}"
        data-notification-id="${esc(item.id || '')}"
        data-notification-actor-id="${esc(item.actor_user_id || '')}"
        data-notification-entity-type="${esc(item.entity_type || item.target_type || '')}"
        data-notification-entity-id="${esc(item.entity_id || item.target_id || '')}"
      >
        ${notificationAvatar(item)}

        <span class="notification-copy">
          <span class="notification-copy-main">
            <strong>${esc(item.title || 'Notifikasi')}</strong>
            ${
              item.is_read
                ? ''
                : '<span class="notification-unread-dot" aria-label="Belum dibaca"></span>'
            }
          </span>

          <span class="notification-message">
            ${esc(item.message || '')}
          </span>

          <span class="notification-time">
            ${esc(relativeTime(item.created_at))}
          </span>
        </span>

        <span class="notification-open-icon">
          <i class="ph ph-caret-right"></i>
        </span>
      </button>
    `;
  }

  function renderNotificationPage(data) {
    if (typeof DOM === 'undefined' || !DOM.feed) {
      return;
    }

    const notifications = Array.isArray(data.notifications)
      ? data.notifications
      : [];

    DOM.feed.innerHTML = `
      <section class="social-notifications-page">
        <header class="notification-topbar">
          <button
            type="button"
            class="notification-back"
            data-notification-action="back"
            aria-label="Kembali"
          >
            <i class="ph ph-arrow-left"></i>
          </button>

          <strong class="notification-title">
            Notifikasi
          </strong>

          <button
            type="button"
            class="notification-read-all"
            data-notification-action="read-all"
            ${Number(data.unread_count || 0) <= 0 ? 'disabled' : ''}
          >
            Dibaca semua
          </button>
        </header>

        <div class="notification-summary">
          <strong>Aktivitas terbaru</strong>
          <span>
            ${
              Number(data.unread_count || 0) > 0
                ? `${Number(data.unread_count)} belum dibaca`
                : 'Semua sudah dibaca'
            }
          </span>
        </div>

        ${
          notifications.length
            ? `
              <div class="notification-list">
                ${notifications.map(notificationRow).join('')}
              </div>
            `
            : `
              <div class="notification-empty">
                <span class="notification-empty-icon">
                  <i class="ph ph-bell-ringing"></i>
                </span>
                <strong>Belum ada notifikasi</strong>
                <p>
                  Follow, like, dan komentar baru akan muncul di sini.
                </p>
              </div>
            `
        }
      </section>
    `;

    window.scrollTo({
      top: 0,
      behavior: 'auto'
    });

    if (typeof window.syncSocialShell === 'function') {
      window.syncSocialShell();
    }
  }

  async function openNotificationsPage() {
    if (!STATE.user) {
      if (typeof openLogin === 'function') {
        openLogin();
      } else if (typeof showToast === 'function') {
        showToast('Masuk terlebih dahulu untuk melihat notifikasi.');
      }
      return;
    }

    if (NOTIFICATION.loading) {
      return;
    }

    NOTIFICATION.loading = true;
    prepareNotificationView();

    if (typeof DOM !== 'undefined' && DOM.feed) {
      DOM.feed.innerHTML = `
        <section class="social-notifications-page">
          <div class="notification-loading">
            <i class="ph ph-bell-ringing"></i>
            <strong>Memuat notifikasi</strong>
          </div>
        </section>
      `;
    }

    try {
      const data = await request(
        '/api/social/notifications'
      );

      renderNotificationPage(data);
      updateNotificationBadge(data.unread_count);
    } catch (error) {
      console.error(
        '[Pasar UMKM] Notification list error:',
        error
      );

      if (typeof showToast === 'function') {
        showToast(
          error?.message ||
          'Notifikasi belum dapat dimuat.'
        );
      }

      leaveNotificationView();
    } finally {
      NOTIFICATION.loading = false;
    }
  }

  function updateNotificationBadge(value) {
    const count = Math.max(0, Number(value || 0));
    const badge =
      document.querySelector('#notificationButton .badge-dot');

    if (!badge) {
      return;
    }

    badge.hidden = count <= 0;
    badge.dataset.count = String(count);
    badge.textContent = count > 9 ? '9+' : String(count);

    const button = document.getElementById('notificationButton');

    button?.setAttribute(
      'aria-label',
      count > 0
        ? `Notifikasi, ${count} belum dibaca`
        : 'Notifikasi'
    );
  }

  async function refreshNotificationBadge() {
    if (!STATE.user) {
      updateNotificationBadge(0);
      return;
    }

    try {
      const data = await request(
        '/api/social/notifications/unread-count'
      );

      updateNotificationBadge(data.unread_count);
    } catch (error) {
      console.error(
        '[Pasar UMKM] Notification badge error:',
        error
      );
    }
  }

  async function markNotificationRead(notificationId) {
    if (!notificationId) {
      return null;
    }

    try {
      const data = await request(
        `/api/social/notifications/${encodeURIComponent(notificationId)}/read`,
        {
          method: 'PATCH'
        }
      );

      updateNotificationBadge(data.unread_count);
      return data;
    } catch (error) {
      console.error(
        '[Pasar UMKM] Mark notification read error:',
        error
      );
      return null;
    }
  }

  async function markAllNotificationsRead(button) {
    if (button) {
      button.disabled = true;
    }

    try {
      await request(
        '/api/social/notifications/read-all',
        {
          method: 'POST'
        }
      );

      updateNotificationBadge(0);

      document
        .querySelectorAll('.notification-row.unread')
        .forEach(row => {
          row.classList.remove('unread');
          row
            .querySelector('.notification-unread-dot')
            ?.remove();
        });

      const summary = document.querySelector(
        '.notification-summary > span'
      );

      if (summary) {
        summary.textContent = 'Semua sudah dibaca';
      }

      if (typeof showToast === 'function') {
        showToast('Semua notifikasi ditandai sudah dibaca.');
      }
    } catch (error) {
      console.error(
        '[Pasar UMKM] Read all notifications error:',
        error
      );

      if (button) {
        button.disabled = false;
      }

      if (typeof showToast === 'function') {
        showToast(
          error?.message ||
          'Notifikasi belum dapat diperbarui.'
        );
      }
    }
  }

  function openNotificationEntity(row) {
    const actorId = row.dataset.notificationActorId || '';
    const entityType = row.dataset.notificationEntityType || '';
    const entityId = row.dataset.notificationEntityId || '';

    if (entityType === 'profile') {
      if (actorId && typeof window.openUserProfile === 'function') {
        window.openUserProfile(actorId);
      }
      return;
    }

    if (entityType === 'post') {
      const post = Array.isArray(DATA?.posts)
        ? DATA.posts.find(item =>
            String(item.backendId || '') === String(entityId) ||
            String(item.id || '') === `post-${entityId}`
          )
        : null;

      document
        .querySelector('.app')
        ?.classList.remove('account-profile-active');

      if (typeof navigate === 'function') {
        navigate('home');
      }

      if (post && typeof scrollToPost === 'function') {
        setTimeout(() => {
          scrollToPost(post.id);
        }, 60);
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
        setTimeout(() => {
          openProductDetail(entityId);
        }, 60);
      }
      return;
    }

    if (actorId && typeof window.openUserProfile === 'function') {
      window.openUserProfile(actorId);
    }
  }

  function syncProfileUnfollowLabel() {
    document
      .querySelectorAll(
        '.social-profile-action.primary.is-following[data-social-action="toggle-follow"]'
      )
      .forEach(button => {
        const label = button.querySelector('span');
        const icon = button.querySelector('i');

        if (label && label.textContent.trim() !== 'Batal Ikuti') {
          label.textContent = 'Batal Ikuti';
        }

        if (icon) {
          icon.className = 'ph ph-user-minus';
        }
      });
  }

  function decorateFollowingList() {
    syncProfileUnfollowLabel();

    if (
      !STATE.user ||
      String(NOTIFICATION.followingListOwnerId || '') !==
        String(STATE.user.id || '')
    ) {
      return;
    }

    const sheet = document.querySelector('.social-follow-sheet');

    if (!sheet) {
      return;
    }

    const title = sheet.querySelector('.social-follow-head h2');

    if (!title || title.textContent.trim() !== 'Mengikuti') {
      return;
    }

    sheet
      .querySelectorAll('.social-follow-user[data-user-id]')
      .forEach(row => {
        if (row.closest('.social-follow-manage-row')) {
          return;
        }

        const userId = row.dataset.userId || '';

        if (!userId) {
          return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'social-follow-manage-row';

        row.parentNode?.insertBefore(wrapper, row);
        wrapper.appendChild(row);

        const unfollow = document.createElement('button');
        unfollow.type = 'button';
        unfollow.className = 'social-follow-unfollow';
        unfollow.dataset.unfollowUserId = userId;
        unfollow.textContent = 'Batal Ikuti';
        wrapper.appendChild(unfollow);
      });
  }

  async function unfollowFromList(button) {
    const userId = String(button.dataset.unfollowUserId || '').trim();

    if (!userId || !STATE.user) {
      return;
    }

    button.disabled = true;
    button.textContent = 'Memproses...';

    try {
      await request(
        `/api/social/follow/${encodeURIComponent(userId)}`,
        {
          method: 'DELETE'
        }
      );

      const wrapper = button.closest('.social-follow-manage-row');
      wrapper?.remove();

      if (typeof window.decorateOwnProfileSocial === 'function') {
        window.decorateOwnProfileSocial();
      }

      const list = document.querySelector('.social-follow-list');

      if (
        list &&
        !list.querySelector('.social-follow-manage-row')
      ) {
        list.innerHTML = `
          <div class="notification-follow-empty">
            <i class="ph ph-users"></i>
            <strong>Belum mengikuti siapa pun</strong>
          </div>
        `;
      }

      if (typeof showToast === 'function') {
        showToast('Berhasil berhenti mengikuti akun.');
      }
    } catch (error) {
      console.error(
        '[Pasar UMKM] Unfollow from list error:',
        error
      );

      button.disabled = false;
      button.textContent = 'Batal Ikuti';

      if (typeof showToast === 'function') {
        showToast(
          error?.message ||
          'Belum dapat berhenti mengikuti akun.'
        );
      }
    }
  }

  document.addEventListener(
    'click',
    event => {
      const notificationButton = event.target.closest(
        '#notificationButton'
      );

      if (notificationButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openNotificationsPage();
        return;
      }

      const followingTrigger = event.target.closest(
        '[data-social-action="following-list"]'
      );

      if (followingTrigger) {
        NOTIFICATION.followingListOwnerId =
          followingTrigger.dataset.userId || '';
        return;
      }

      const unfollowButton = event.target.closest(
        '[data-unfollow-user-id]'
      );

      if (unfollowButton) {
        event.preventDefault();
        event.stopPropagation();
        unfollowFromList(unfollowButton);
        return;
      }

      const action = event.target.closest(
        '[data-notification-action]'
      );

      if (action) {
        const type = action.dataset.notificationAction;

        if (type === 'back') {
          event.preventDefault();
          leaveNotificationView();
          return;
        }

        if (type === 'read-all') {
          event.preventDefault();
          markAllNotificationsRead(action);
          return;
        }
      }

      const row = event.target.closest(
        '.notification-row[data-notification-id]'
      );

      if (!row) {
        return;
      }

      event.preventDefault();

      const notificationId =
        row.dataset.notificationId || '';

      row.classList.remove('unread');
      row.querySelector('.notification-unread-dot')?.remove();

      markNotificationRead(notificationId);
      openNotificationEntity(row);
    },
    true
  );

  const observer = new MutationObserver(() => {
    decorateFollowingList();
  });

  observer.observe(
    document.body,
    {
      childList: true,
      subtree: true
    }
  );

  document.addEventListener(
    'visibilitychange',
    () => {
      if (!document.hidden) {
        refreshNotificationBadge();
      }
    }
  );

  if (typeof openNotifications === 'function') {
    openNotifications = function notificationCenter() {
      openNotificationsPage();
    };
  }

  window.openSocialNotifications = openNotificationsPage;
  window.refreshNotificationBadge = refreshNotificationBadge;

  function boot() {
    decorateFollowingList();
    refreshNotificationBadge();

    if (NOTIFICATION.pollTimer) {
      clearInterval(NOTIFICATION.pollTimer);
    }

    NOTIFICATION.pollTimer = setInterval(
      refreshNotificationBadge,
      12000
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => setTimeout(boot, 0),
      { once: true }
    );
  } else {
    setTimeout(boot, 0);
  }
})();
