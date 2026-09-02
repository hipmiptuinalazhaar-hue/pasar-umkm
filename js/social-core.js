'use strict';

/* =========================================================
   PASAR UMKM - SOCIAL COMMERCE CORE
   Follow graph, universal public profiles, direct messages,
   clickable comment authors, and shareable profile deep links.
   ========================================================= */

(() => {
  if (
    typeof STATE === 'undefined' ||
    typeof DATA === 'undefined'
  ) {
    console.error(
      '[Pasar UMKM] Social core gagal dimuat: state aplikasi tidak tersedia.'
    );
    return;
  }

  const PROFILE_HASH_PREFIX = '#profile=';
  const POLL_INTERVAL = 5000;

  const SOCIAL = {
    profile: null,
    profileTab: 'posts',
    activeConversationId: '',
    activeConversation: null,
    threadPollTimer: null,
    lastView: 'home',
    openingDeepLink: false
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

  function numberLabel(value) {
    return Number(value || 0)
      .toLocaleString('id-ID');
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

    return new Intl.DateTimeFormat(
      'id-ID',
      {
        hour: '2-digit',
        minute: '2-digit'
      }
    ).format(date);
  }

  function avatarTemplate(url, name, className) {
    const cleanUrl = String(url || '').trim();

    return `
      <span class="${className}">
        ${
          cleanUrl
            ? `
              <img
                src="${esc(cleanUrl)}"
                alt="${esc(name || 'Foto profil')}"
                loading="lazy"
                decoding="async"
              >
            `
            : `
              <i
                class="ph ph-user"
                aria-hidden="true"
              ></i>
            `
        }
      </span>
    `;
  }

  async function socialRequest(path, options = {}) {
    const method = options.method || 'GET';
    const headers = {
      Accept: 'application/json',
      ...(options.headers || {})
    };

    const requestOptions = {
      method,
      credentials: 'include',
      headers,
      cache: 'no-store'
    };

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      requestOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(path, requestOptions);
    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok || data.ok !== true) {
      const error = new Error(
        data.error ||
        'Permintaan belum dapat diproses.'
      );

      error.status = response.status;
      throw error;
    }

    return data;
  }

  function stopThreadPolling() {
    if (SOCIAL.threadPollTimer) {
      clearInterval(SOCIAL.threadPollTimer);
      SOCIAL.threadPollTimer = null;
    }
  }

  function prepareSocialView() {
    stopThreadPolling();

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
      ?.classList.remove('account-profile-active');

    if (typeof DOM !== 'undefined') {
      if (DOM.storiesSection) {
        DOM.storiesSection.hidden = true;
      }

      if (DOM.homeDiscovery) {
        DOM.homeDiscovery.hidden = true;
      }
    }
  }

  function returnHome() {
    stopThreadPolling();
    SOCIAL.profile = null;
    SOCIAL.activeConversationId = '';
    SOCIAL.activeConversation = null;

    if (window.location.hash.startsWith(PROFILE_HASH_PREFIX)) {
      history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}`
      );
    }

    if (typeof navigate === 'function') {
      navigate('home');
      return;
    }

    if (typeof renderApplication === 'function') {
      STATE.activeNav = 'home';
      renderApplication();
    }
  }

  function profileLocation(profile) {
    const values = [
      profile.district,
      profile.city,
      profile.province
    ]
      .map(value => String(value || '').trim())
      .filter(Boolean);

    return [...new Set(values)].join(', ');
  }

  function socialHandle(url, platform) {
    const value = String(url || '').trim();

    if (!value) {
      return '';
    }

    try {
      const parsed = new URL(value);
      const parts = parsed.pathname
        .split('/')
        .filter(Boolean);

      const handle = parts[0] || '';

      if (!handle) {
        return platform;
      }

      return `@${handle.replace(/^@/, '')}`;
    } catch {
      return value;
    }
  }

  function publicLinksTemplate(profile) {
    const links = [];

    const whatsapp = String(profile.whatsapp || '')
      .replace(/\D/g, '');

    if (whatsapp) {
      links.push(`
        <a
          class="social-profile-link whatsapp"
          href="https://wa.me/${esc(whatsapp)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          <i class="ph ph-whatsapp-logo"></i>
          <span>WhatsApp</span>
        </a>
      `);
    }

    if (profile.instagram_url) {
      links.push(`
        <a
          class="social-profile-link instagram"
          href="${esc(profile.instagram_url)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          <i class="ph ph-instagram-logo"></i>
          <span>${esc(
            socialHandle(
              profile.instagram_url,
              'Instagram'
            )
          )}</span>
        </a>
      `);
    }

    if (profile.tiktok_url) {
      links.push(`
        <a
          class="social-profile-link tiktok"
          href="${esc(profile.tiktok_url)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          <i class="ph ph-tiktok-logo"></i>
          <span>${esc(
            socialHandle(
              profile.tiktok_url,
              'TikTok'
            )
          )}</span>
        </a>
      `);
    }

    if (!links.length) {
      return '';
    }

    return `
      <div class="social-profile-links">
        ${links.join('')}
      </div>
    `;
  }

  function profileFeedItems(profile) {
    const storeId = String(profile.store_id || '');

    if (!storeId || !Array.isArray(DATA.posts)) {
      return [];
    }

    return DATA.posts.filter(item =>
      String(item.store?.id || '') === storeId
    );
  }

  function profilePosts(profile) {
    return profileFeedItems(profile)
      .filter(item => !item.product);
  }

  function profileProducts(profile) {
    return profileFeedItems(profile)
      .filter(item => Boolean(item.product));
  }

  function gridItemTemplate(item, kind) {
    const image =
      kind === 'product'
        ? item.product?.image
        : item.media?.src;

    const fallback =
      typeof ASSETS !== 'undefined'
        ? ASSETS.logo
        : 'assets/logo.webp';

    return `
      <button
        type="button"
        class="social-profile-grid-item"
        data-social-action="profile-grid-item"
        data-social-kind="${esc(kind)}"
        data-social-item-id="${esc(item.id || '')}"
        aria-label="Buka ${kind === 'product' ? 'produk' : 'postingan'}"
      >
        <img
          src="${esc(image || fallback)}"
          alt=""
          loading="lazy"
          decoding="async"
        >

        <span class="social-profile-grid-type">
          <i
            class="ph ${
              kind === 'product'
                ? 'ph-shopping-bag-open'
                : 'ph-image'
            }"
            aria-hidden="true"
          ></i>
        </span>
      </button>
    `;
  }

  function profileGridTemplate(profile, tab) {
    const items =
      tab === 'products'
        ? profileProducts(profile)
        : profilePosts(profile);

    if (!items.length) {
      return `
        <div class="social-profile-empty">
          <i
            class="ph ${
              tab === 'products'
                ? 'ph-shopping-bag-open'
                : 'ph-images'
            }"
          ></i>
          <strong>
            ${
              tab === 'products'
                ? 'Belum ada produk'
                : 'Belum ada postingan'
            }
          </strong>
          <span>
            ${
              profile.is_self
                ? 'Konten yang Anda publikasikan akan tampil di sini.'
                : 'Akun ini belum mempublikasikan konten pada bagian ini.'
            }
          </span>
        </div>
      `;
    }

    return items
      .map(item =>
        gridItemTemplate(
          item,
          tab === 'products'
            ? 'product'
            : 'post'
        )
      )
      .join('');
  }

  function renderUniversalProfile(profile) {
    if (
      typeof DOM === 'undefined' ||
      !DOM.feed
    ) {
      return;
    }

    const isSeller = Boolean(profile.store_id);
    const location = profileLocation(profile);
    const avatarUrl =
      profile.user_avatar_url ||
      profile.logo_url ||
      '';

    const roleLabel = isSeller
      ? `Pemilik ${profile.store_name || 'UMKM'}`
      : (
          profile.user_role === 'admin'
            ? 'Administrator Pasar UMKM'
            : 'Pengguna Pasar UMKM'
        );

    const badges = [];

    if (isSeller) {
      badges.push(`
        <span class="social-profile-badge">
          <i class="ph ph-storefront"></i>
          ${esc(profile.store_name || 'UMKM')}
        </span>
      `);

      if (profile.verification_status === 'verified') {
        badges.push(`
          <span class="social-profile-badge verified">
            <i class="ph-fill ph-seal-check"></i>
            UMKM terverifikasi
          </span>
        `);
      } else if (profile.verification_status === 'pending') {
        badges.push(`
          <span class="social-profile-badge">
            <i class="ph ph-clock"></i>
            Verifikasi diproses
          </span>
        `);
      }
    }

    const actions = profile.is_self
      ? ''
      : `
        <div class="social-profile-actions">
          <button
            type="button"
            class="social-profile-action primary ${
              profile.is_following
                ? 'is-following'
                : ''
            }"
            data-social-action="toggle-follow"
            data-user-id="${esc(profile.user_id)}"
          >
            <i
              class="ph ${
                profile.is_following
                  ? 'ph-check'
                  : 'ph-user-plus'
              }"
            ></i>
            <span>
              ${
                profile.is_following
                  ? 'Mengikuti'
                  : 'Ikuti'
              }
            </span>
          </button>

          <button
            type="button"
            class="social-profile-action"
            data-social-action="message-user"
            data-user-id="${esc(profile.user_id)}"
          >
            <i class="ph ph-chat-circle"></i>
            <span>Kirim Pesan</span>
          </button>
        </div>
      `;

    const storeCard = isSeller
      ? `
        <button
          type="button"
          class="social-profile-store-card"
          data-social-action="profile-tab-products"
        >
          <span class="social-profile-store-icon">
            <i class="ph ph-storefront"></i>
          </span>

          <span class="social-profile-store-copy">
            <strong>${esc(profile.store_name || 'Toko')}</strong>
            <span>${numberLabel(profile.product_count)} produk tersedia</span>
          </span>

          <i class="ph ph-caret-right"></i>
        </button>
      `
      : '';

    const tabs = isSeller
      ? `
        <div class="social-profile-tabs">
          <button
            type="button"
            class="social-profile-tab ${
              SOCIAL.profileTab === 'posts'
                ? 'active'
                : ''
            }"
            data-social-action="profile-tab"
            data-tab="posts"
            aria-label="Postingan"
          >
            <i class="ph ph-squares-four"></i>
          </button>

          <button
            type="button"
            class="social-profile-tab ${
              SOCIAL.profileTab === 'products'
                ? 'active'
                : ''
            }"
            data-social-action="profile-tab"
            data-tab="products"
            aria-label="Produk"
          >
            <i class="ph ph-shopping-bag-open"></i>
          </button>
        </div>
      `
      : `
        <div class="social-profile-tabs" style="grid-template-columns:1fr;">
          <button
            type="button"
            class="social-profile-tab active"
            aria-label="Postingan"
          >
            <i class="ph ph-squares-four"></i>
          </button>
        </div>
      `;

    DOM.feed.innerHTML = `
      <section
        class="social-universal-profile social-account-page public-seller-profile"
        data-user-id="${esc(profile.user_id)}"
        data-store-id="${esc(profile.store_id || '')}"
      >
        <header class="social-account-topbar">
          <button
            type="button"
            class="social-profile-top-button"
            data-social-action="profile-back"
            aria-label="Kembali"
          >
            <i class="ph ph-arrow-left"></i>
          </button>

          <strong class="social-profile-title">
            ${esc(profile.user_name || 'Profil')}
          </strong>

          <button
            type="button"
            class="social-profile-top-button"
            data-social-action="share-profile"
            data-user-id="${esc(profile.user_id)}"
            aria-label="Bagikan profil"
          >
            <i class="ph ph-share-network"></i>
          </button>
        </header>

        <section class="social-profile-shell">
          <div class="social-profile-overview">
            ${avatarTemplate(
              avatarUrl,
              profile.user_name,
              'social-profile-avatar'
            )}

            <div class="social-profile-stats">
              <button
                type="button"
                class="social-profile-stat"
                data-social-action="profile-posts-stat"
              >
                <strong>${numberLabel(profile.post_count)}</strong>
                <span>Postingan</span>
              </button>

              <button
                type="button"
                class="social-profile-stat"
                data-social-action="followers-list"
                data-user-id="${esc(profile.user_id)}"
              >
                <strong data-social-count="followers">
                  ${numberLabel(profile.follower_count)}
                </strong>
                <span>Pengikut</span>
              </button>

              <button
                type="button"
                class="social-profile-stat"
                data-social-action="following-list"
                data-user-id="${esc(profile.user_id)}"
              >
                <strong data-social-count="following">
                  ${numberLabel(profile.following_count)}
                </strong>
                <span>Mengikuti</span>
              </button>
            </div>
          </div>

          <div class="social-profile-copy">
            <h1 class="social-profile-name">
              ${esc(profile.user_name || 'Pengguna')}
            </h1>

            <p class="social-profile-role">
              ${esc(roleLabel)}
            </p>

            ${
              badges.length
                ? `<div class="social-profile-badges">${badges.join('')}</div>`
                : ''
            }

            ${
              profile.description
                ? `
                  <p class="social-profile-description">
                    ${esc(profile.description)}
                  </p>
                `
                : ''
            }

            ${
              location
                ? `
                  <div class="social-profile-location">
                    <i class="ph ph-map-pin"></i>
                    <span>${esc(location)}</span>
                  </div>
                `
                : ''
            }

            ${publicLinksTemplate(profile)}
            ${actions}
          </div>
        </section>

        ${storeCard}
        ${tabs}

        <div
          class="social-profile-grid"
          data-social-profile-grid
        >
          ${profileGridTemplate(profile, SOCIAL.profileTab)}
        </div>
      </section>
    `;

    window.scrollTo({
      top: 0,
      behavior: 'auto'
    });

    if (typeof window.centerProfileTitle === 'function') {
      requestAnimationFrame(() =>
        window.centerProfileTitle()
      );
    }
  }

  async function fetchProfileByUser(userId) {
    const data = await socialRequest(
      `/api/social/profile?user_id=${encodeURIComponent(userId)}`
    );

    return data.profile;
  }

  async function fetchProfileByStore(storeId) {
    const data = await socialRequest(
      `/api/social/profile?store_id=${encodeURIComponent(storeId)}`
    );

    return data.profile;
  }

  function pushProfileHash(userId) {
    const hash =
      `${PROFILE_HASH_PREFIX}${encodeURIComponent(userId)}`;

    if (window.location.hash === hash) {
      return;
    }

    history.pushState(
      {
        socialProfile: userId
      },
      '',
      `${window.location.pathname}${window.location.search}${hash}`
    );
  }

  async function openUserProfile(
    userId,
    options = {}
  ) {
    const id = String(userId || '').trim();

    if (!id) {
      return;
    }

    prepareSocialView();

    if (typeof DOM !== 'undefined' && DOM.feed) {
      DOM.feed.innerHTML = `
        <section class="social-universal-profile">
          <div class="social-page-empty">
            <i class="ph ph-user-circle"></i>
            <strong>Memuat profil</strong>
            <span>Menyiapkan informasi pengguna.</span>
          </div>
        </section>
      `;
    }

    try {
      const profile = await fetchProfileByUser(id);

      SOCIAL.profile = profile;
      SOCIAL.profileTab = 'posts';
      SOCIAL.lastView = 'profile';

      renderUniversalProfile(profile);

      if (options.pushHash !== false) {
        pushProfileHash(profile.user_id);
      }
    } catch (error) {
      console.error(
        '[Pasar UMKM] Open user profile error:',
        error
      );

      if (typeof showToast === 'function') {
        showToast(
          error?.message ||
          'Profil belum dapat dibuka.'
        );
      }

      returnHome();
    }
  }

  async function openStoreProfile(storeId) {
    const id = String(storeId || '').trim();

    if (!id) {
      return;
    }

    prepareSocialView();

    try {
      const profile = await fetchProfileByStore(id);

      SOCIAL.profile = profile;
      SOCIAL.profileTab = 'posts';
      SOCIAL.lastView = 'profile';

      renderUniversalProfile(profile);
      pushProfileHash(profile.user_id);
    } catch (error) {
      console.error(
        '[Pasar UMKM] Open store profile error:',
        error
      );

      if (typeof showToast === 'function') {
        showToast(
          error?.message ||
          'Profil UMKM belum dapat dibuka.'
        );
      }
    }
  }

  function updateCurrentProfileFollowDom() {
    if (!SOCIAL.profile) {
      return;
    }

    const page = document.querySelector(
      '.social-universal-profile'
    );

    if (!page) {
      return;
    }

    const followers = page.querySelector(
      '[data-social-count="followers"]'
    );

    const following = page.querySelector(
      '[data-social-count="following"]'
    );

    if (followers) {
      followers.textContent =
        numberLabel(SOCIAL.profile.follower_count);
    }

    if (following) {
      following.textContent =
        numberLabel(SOCIAL.profile.following_count);
    }

    const button = page.querySelector(
      '[data-social-action="toggle-follow"]'
    );

    if (button) {
      button.classList.toggle(
        'is-following',
        Boolean(SOCIAL.profile.is_following)
      );

      button.innerHTML = `
        <i
          class="ph ${
            SOCIAL.profile.is_following
              ? 'ph-check'
              : 'ph-user-plus'
          }"
        ></i>
        <span>
          ${
            SOCIAL.profile.is_following
              ? 'Mengikuti'
              : 'Ikuti'
          }
        </span>
      `;
    }
  }

  async function toggleFollow(userId, button) {
    if (!STATE.user) {
      if (typeof openLogin === 'function') {
        openLogin();
      } else if (typeof showToast === 'function') {
        showToast('Masuk terlebih dahulu untuk mengikuti pengguna.');
      }
      return;
    }

    if (
      String(STATE.user.id || '') ===
      String(userId || '')
    ) {
      return;
    }

    const profileMatches =
      SOCIAL.profile &&
      String(SOCIAL.profile.user_id) === String(userId);

    const isFollowing =
      profileMatches
        ? Boolean(SOCIAL.profile.is_following)
        : false;

    if (button) {
      button.disabled = true;
    }

    try {
      const data = await socialRequest(
        `/api/social/follow/${encodeURIComponent(userId)}`,
        {
          method: isFollowing
            ? 'DELETE'
            : 'POST'
        }
      );

      if (profileMatches) {
        SOCIAL.profile.is_following =
          Boolean(data.is_following);

        SOCIAL.profile.follower_count =
          Number(data.follower_count || 0);

        SOCIAL.profile.following_count =
          Number(data.following_count || 0);

        updateCurrentProfileFollowDom();
      }

      if (typeof showToast === 'function') {
        showToast(
          data.is_following
            ? 'Sekarang mengikuti akun ini.'
            : 'Berhenti mengikuti akun ini.'
        );
      }
    } catch (error) {
      console.error(
        '[Pasar UMKM] Follow error:',
        error
      );

      if (error?.status === 401 && typeof openLogin === 'function') {
        openLogin();
      } else if (typeof showToast === 'function') {
        showToast(
          error?.message ||
          'Status mengikuti belum dapat diperbarui.'
        );
      }
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  }

  function followUserRow(user) {
    const subtitle =
      user.store_name ||
      (
        user.user_role === 'seller'
          ? 'Penjual Pasar UMKM'
          : 'Pengguna Pasar UMKM'
      );

    return `
      <button
        type="button"
        class="social-follow-user"
        data-social-action="open-list-user"
        data-user-id="${esc(user.user_id)}"
      >
        ${avatarTemplate(
          user.user_avatar_url,
          user.user_name,
          'social-follow-avatar'
        )}

        <span class="social-follow-copy">
          <strong>${esc(user.user_name || 'Pengguna')}</strong>
          <span>${esc(subtitle)}</span>
        </span>

        <i class="ph ph-caret-right"></i>
      </button>
    `;
  }

  async function openFollowList(type, userId) {
    if (typeof openBottomSheet !== 'function') {
      return;
    }

    try {
      const data = await socialRequest(
        `/api/social/${type}?user_id=${encodeURIComponent(userId)}`
      );

      const title =
        type === 'followers'
          ? 'Pengikut'
          : 'Mengikuti';

      openBottomSheet(
        `
          <section class="social-follow-sheet">
            <header class="social-follow-head">
              <h2>${title}</h2>

              <button
                type="button"
                class="profile-edit-close"
                data-action="close-sheet"
                aria-label="Tutup"
              >
                <i class="ph ph-x"></i>
              </button>
            </header>

            <div class="social-follow-list">
              ${
                data.users.length
                  ? data.users
                      .map(followUserRow)
                      .join('')
                  : `
                    <div class="social-page-empty" style="min-height:180px;">
                      <i class="ph ph-users"></i>
                      <strong>Belum ada ${title.toLowerCase()}</strong>
                    </div>
                  `
              }
            </div>
          </section>
        `,
        `social-${type}`
      );
    } catch (error) {
      console.error(
        '[Pasar UMKM] Follow list error:',
        error
      );

      if (typeof showToast === 'function') {
        showToast(
          error?.message ||
          'Daftar pengguna belum dapat dimuat.'
        );
      }
    }
  }

  async function shareProfile(userId, name) {
    const url =
      `${window.location.origin}` +
      `${window.location.pathname}` +
      `${PROFILE_HASH_PREFIX}${encodeURIComponent(userId)}`;

    const title =
      `${name || 'Profil'} di Pasar UMKM`;

    try {
      if (navigator.share) {
        await navigator.share({
          title,
          text: `Lihat ${name || 'profil ini'} di Pasar UMKM Lubuklinggau.`,
          url
        });
        return;
      }

      await navigator.clipboard.writeText(url);

      if (typeof showToast === 'function') {
        showToast('Link profil disalin.');
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }

      console.error(
        '[Pasar UMKM] Share profile error:',
        error
      );

      if (typeof showToast === 'function') {
        showToast('Link profil belum dapat dibagikan.');
      }
    }
  }

  function openProfilePostViewer(startId) {
    if (!SOCIAL.profile || typeof DOM === 'undefined' || !DOM.feed) {
      return;
    }

    const items = profilePosts(SOCIAL.profile);
    const startIndex = items.findIndex(item =>
      String(item.id || '') === String(startId || '')
    );

    const ordered =
      startIndex > 0
        ? [
            ...items.slice(startIndex),
            ...items.slice(0, startIndex)
          ]
        : items;

    if (!ordered.length) {
      return;
    }

    prepareSocialView();
    SOCIAL.lastView = 'profile-viewer';

    DOM.feed.innerHTML = `
      <section class="post-viewer-page">
        <header class="post-viewer-topbar">
          <button
            type="button"
            class="post-viewer-back"
            data-social-action="viewer-back-profile"
            aria-label="Kembali ke profil"
          >
            <i class="ph ph-arrow-left"></i>
          </button>

          <strong>Postingan</strong>
        </header>

        <div class="post-viewer-feed">
          ${ordered
            .map(item => `
              <div
                class="post-viewer-item"
                data-post-id="${esc(item.id || '')}"
              >
                ${
                  typeof createPostTemplate === 'function'
                    ? createPostTemplate(item)
                    : ''
                }
              </div>
            `)
            .join('')}
        </div>
      </section>
    `;

    window.scrollTo({
      top: 0,
      behavior: 'auto'
    });
  }

  function renderProfileGrid() {
    if (!SOCIAL.profile) {
      return;
    }

    const grid = document.querySelector(
      '[data-social-profile-grid]'
    );

    if (grid) {
      grid.innerHTML =
        profileGridTemplate(
          SOCIAL.profile,
          SOCIAL.profileTab
        );
    }

    document
      .querySelectorAll('.social-profile-tab')
      .forEach(tab => {
        tab.classList.toggle(
          'active',
          tab.dataset.tab === SOCIAL.profileTab ||
          (
            !tab.dataset.tab &&
            SOCIAL.profileTab === 'posts'
          )
        );
      });
  }

  function conversationAvatar(conversation) {
    return avatarTemplate(
      conversation.other_user_avatar_url,
      conversation.other_user_name,
      'social-conversation-avatar'
    );
  }

  function conversationRow(conversation) {
    const unread = Number(
      conversation.unread_count || 0
    );

    return `
      <button
        type="button"
        class="social-conversation-row"
        data-social-action="open-conversation"
        data-conversation-id="${esc(conversation.id)}"
      >
        ${conversationAvatar(conversation)}

        <span class="social-conversation-copy">
          <strong>
            ${esc(conversation.other_user_name || 'Pengguna')}
          </strong>

          <span class="${unread ? 'unread' : ''}">
            ${esc(
              conversation.last_message ||
              'Mulai percakapan'
            )}
          </span>
        </span>

        <span class="social-conversation-meta">
          <span class="social-conversation-time">
            ${esc(relativeTime(conversation.last_message_at || conversation.updated_at))}
          </span>

          ${
            unread
              ? `<span class="social-conversation-badge">${numberLabel(unread)}</span>`
              : ''
          }
        </span>
      </button>
    `;
  }

  async function openMessagesPage() {
    if (!STATE.user) {
      if (typeof openLogin === 'function') {
        openLogin();
      } else if (typeof showToast === 'function') {
        showToast('Masuk terlebih dahulu untuk melihat pesan.');
      }
      return;
    }

    prepareSocialView();
    SOCIAL.lastView = 'messages';

    if (typeof DOM !== 'undefined' && DOM.feed) {
      DOM.feed.innerHTML = `
        <section class="social-messages-page">
          <header class="social-page-topbar">
            <button
              type="button"
              class="social-page-back"
              data-social-action="messages-back"
            >
              <i class="ph ph-arrow-left"></i>
            </button>

            <strong class="social-page-title">Pesan</strong>
            <span></span>
          </header>

          <div class="social-page-empty">
            <i class="ph ph-chat-circle-dots"></i>
            <strong>Memuat percakapan</strong>
          </div>
        </section>
      `;
    }

    try {
      const data = await socialRequest(
        '/api/social/conversations'
      );

      if (!DOM.feed) {
        return;
      }

      DOM.feed.innerHTML = `
        <section class="social-messages-page">
          <header class="social-page-topbar">
            <button
              type="button"
              class="social-page-back"
              data-social-action="messages-back"
              aria-label="Kembali"
            >
              <i class="ph ph-arrow-left"></i>
            </button>

            <strong class="social-page-title">Pesan</strong>
            <span></span>
          </header>

          ${
            data.conversations.length
              ? `
                <div class="social-messages-list">
                  ${data.conversations
                    .map(conversationRow)
                    .join('')}
                </div>
              `
              : `
                <div class="social-page-empty">
                  <i class="ph ph-chat-circle-dots"></i>
                  <strong>Belum ada percakapan</strong>
                  <span>
                    Buka profil pengguna atau penjual lalu pilih Kirim Pesan.
                  </span>
                </div>
              `
          }
        </section>
      `;

      refreshUnreadBadge();
    } catch (error) {
      console.error(
        '[Pasar UMKM] Messages list error:',
        error
      );

      if (typeof showToast === 'function') {
        showToast(
          error?.message ||
          'Pesan belum dapat dimuat.'
        );
      }
    }
  }

  async function createConversationWithUser(userId) {
    if (!STATE.user) {
      if (typeof openLogin === 'function') {
        openLogin();
      }
      return;
    }

    try {
      const data = await socialRequest(
        '/api/social/conversations',
        {
          method: 'POST',
          body: {
            target_user_id: userId
          }
        }
      );

      if (data.conversation?.id) {
        await openConversation(
          data.conversation.id
        );
      }
    } catch (error) {
      console.error(
        '[Pasar UMKM] Create conversation error:',
        error
      );

      if (error?.status === 401 && typeof openLogin === 'function') {
        openLogin();
      } else if (typeof showToast === 'function') {
        showToast(
          error?.message ||
          'Percakapan belum dapat dibuka.'
        );
      }
    }
  }

  function messageBubble(message) {
    const mine =
      String(message.sender_id || '') ===
      String(STATE.user?.id || '');

    return `
      <div class="social-message-row ${mine ? 'mine' : 'theirs'}">
        <div class="social-message-bubble">
          <p class="social-message-text">
            ${esc(message.message || '')}
          </p>

          <div class="social-message-foot">
            <span>${esc(relativeTime(message.created_at))}</span>
            ${
              mine
                ? `<i class="ph ${message.is_read ? 'ph-checks' : 'ph-check'}"></i>`
                : ''
            }
          </div>
        </div>
      </div>
    `;
  }

  function renderThreadMessages(messages) {
    const container = document.querySelector(
      '[data-social-thread-messages]'
    );

    if (!container) {
      return;
    }

    container.innerHTML =
      messages.length
        ? messages.map(messageBubble).join('')
        : `
          <div class="social-page-empty" style="min-height:220px;">
            <i class="ph ph-chat-circle"></i>
            <strong>Mulai percakapan</strong>
            <span>Kirim pesan pertama untuk memulai obrolan.</span>
          </div>
        `;

    requestAnimationFrame(() => {
      const last = container.lastElementChild;
      last?.scrollIntoView({
        block: 'end',
        behavior: 'auto'
      });
    });
  }

  function renderConversationPage(data) {
    if (!DOM.feed) {
      return;
    }

    const conversation = data.conversation;
    SOCIAL.activeConversation = conversation;

    DOM.feed.innerHTML = `
      <section class="social-conversation-page">
        <header class="social-page-topbar">
          <button
            type="button"
            class="social-page-back"
            data-social-action="thread-back"
            aria-label="Kembali"
          >
            <i class="ph ph-arrow-left"></i>
          </button>

          <button
            type="button"
            class="social-thread-title"
            data-social-action="thread-profile"
            data-user-id="${esc(conversation.other_user_id)}"
            style="border:0;background:transparent;padding:0;"
          >
            ${avatarTemplate(
              conversation.other_user_avatar_url,
              conversation.other_user_name,
              'social-thread-avatar'
            )}

            <span class="social-thread-title-copy">
              <strong>${esc(conversation.other_user_name || 'Pengguna')}</strong>
              <span>${esc(conversation.other_store_name || 'Pasar UMKM')}</span>
            </span>
          </button>

          <button
            type="button"
            class="social-page-action"
            data-social-action="thread-profile"
            data-user-id="${esc(conversation.other_user_id)}"
            aria-label="Lihat profil"
          >
            <i class="ph ph-user-circle"></i>
          </button>
        </header>

        <div
          class="social-thread-messages"
          data-social-thread-messages
        ></div>

        <form
          class="social-thread-composer"
          id="socialThreadComposer"
          autocomplete="off"
        >
          <textarea
            id="socialThreadInput"
            class="social-thread-input"
            maxlength="2000"
            rows="1"
            placeholder="Tulis pesan..."
            aria-label="Tulis pesan"
          ></textarea>

          <button
            id="socialThreadSend"
            type="submit"
            class="social-thread-send"
            aria-label="Kirim pesan"
          >
            <i class="ph-fill ph-paper-plane-tilt"></i>
          </button>
        </form>
      </section>
    `;

    renderThreadMessages(data.messages || []);
  }

  async function loadConversationData(
    conversationId,
    options = {}
  ) {
    const data = await socialRequest(
      `/api/social/conversations/${encodeURIComponent(conversationId)}/messages`
    );

    SOCIAL.activeConversation = data.conversation;

    if (options.messagesOnly) {
      renderThreadMessages(data.messages || []);
    } else {
      renderConversationPage(data);
    }

    refreshUnreadBadge();
    return data;
  }

  function startThreadPolling(conversationId) {
    stopThreadPolling();

    SOCIAL.threadPollTimer = setInterval(
      async () => {
        if (
          document.hidden ||
          SOCIAL.activeConversationId !== conversationId ||
          !document.querySelector('.social-conversation-page')
        ) {
          return;
        }

        try {
          await loadConversationData(
            conversationId,
            {
              messagesOnly: true
            }
          );
        } catch (error) {
          console.error(
            '[Pasar UMKM] Thread poll error:',
            error
          );
        }
      },
      POLL_INTERVAL
    );
  }

  async function openConversation(conversationId) {
    if (!STATE.user) {
      if (typeof openLogin === 'function') {
        openLogin();
      }
      return;
    }

    prepareSocialView();
    SOCIAL.lastView = 'thread';
    SOCIAL.activeConversationId =
      String(conversationId || '');

    try {
      await loadConversationData(
        SOCIAL.activeConversationId
      );

      startThreadPolling(
        SOCIAL.activeConversationId
      );
    } catch (error) {
      console.error(
        '[Pasar UMKM] Open conversation error:',
        error
      );

      if (typeof showToast === 'function') {
        showToast(
          error?.message ||
          'Percakapan belum dapat dibuka.'
        );
      }

      openMessagesPage();
    }
  }

  async function sendThreadMessage(form) {
    const input = document.getElementById(
      'socialThreadInput'
    );

    const button = document.getElementById(
      'socialThreadSend'
    );

    const message = String(
      input?.value || ''
    ).trim();

    if (!message || !SOCIAL.activeConversationId) {
      return;
    }

    if (button) {
      button.disabled = true;
    }

    try {
      await socialRequest(
        `/api/social/conversations/${encodeURIComponent(SOCIAL.activeConversationId)}/messages`,
        {
          method: 'POST',
          body: {
            message
          }
        }
      );

      if (input) {
        input.value = '';
        input.style.height = '';
      }

      await loadConversationData(
        SOCIAL.activeConversationId,
        {
          messagesOnly: true
        }
      );
    } catch (error) {
      console.error(
        '[Pasar UMKM] Send message error:',
        error
      );

      if (typeof showToast === 'function') {
        showToast(
          error?.message ||
          'Pesan belum dapat dikirim.'
        );
      }
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  }

  async function refreshUnreadBadge() {
    const badge =
      typeof DOM !== 'undefined' && DOM.messageButton
        ? DOM.messageButton.querySelector('.badge-dot')
        : document.querySelector('#messageButton .badge-dot');

    if (!badge) {
      return;
    }

    if (!STATE.user) {
      badge.hidden = true;
      return;
    }

    try {
      const data = await socialRequest(
        '/api/social/unread-count'
      );

      const count = Number(
        data.unread_count || 0
      );

      badge.hidden = count <= 0;
      badge.dataset.count = String(count);

      if (typeof DOM !== 'undefined' && DOM.messageButton) {
        DOM.messageButton.setAttribute(
          'aria-label',
          count > 0
            ? `Pesan, ${count} belum dibaca`
            : 'Pesan'
        );
      }
    } catch (error) {
      console.error(
        '[Pasar UMKM] Unread count error:',
        error
      );
    }
  }

  async function decorateOwnProfileSocial() {
    if (!STATE.user) {
      return;
    }

    const page = document.querySelector(
      '.social-account-page:not(.public-seller-profile)'
    );

    if (!page) {
      return;
    }

    try {
      const profile = await fetchProfileByUser(
        STATE.user.id
      );

      page.dataset.userId =
        String(profile.user_id || '');

      const stats = page.querySelectorAll(
        '.social-account-stat'
      );

      if (stats[1]) {
        const count = stats[1].querySelector('strong');
        if (count) {
          count.textContent = numberLabel(profile.follower_count);
        }
        stats[1].dataset.socialAction = 'followers-list';
        stats[1].dataset.userId = profile.user_id;
        stats[1].setAttribute('role', 'button');
        stats[1].tabIndex = 0;
      }

      if (stats[2]) {
        const count = stats[2].querySelector('strong');
        if (count) {
          count.textContent = numberLabel(profile.following_count);
        }
        stats[2].dataset.socialAction = 'following-list';
        stats[2].dataset.userId = profile.user_id;
        stats[2].setAttribute('role', 'button');
        stats[2].tabIndex = 0;
      }
    } catch (error) {
      console.error(
        '[Pasar UMKM] Own profile social decorate error:',
        error
      );
    }
  }

  async function openCommentAuthorProfile(commentItem) {
    const commentId =
      commentItem?.dataset?.commentId || '';

    if (!commentId) {
      return;
    }

    try {
      const data = await socialRequest(
        `/api/social/comment-author?comment_id=${encodeURIComponent(commentId)}`
      );

      if (typeof closeBottomSheet === 'function') {
        closeBottomSheet();
      }

      if (data.user?.user_id) {
        await openUserProfile(
          data.user.user_id
        );
      }
    } catch (error) {
      console.error(
        '[Pasar UMKM] Comment author profile error:',
        error
      );

      if (typeof showToast === 'function') {
        showToast(
          error?.message ||
          'Profil pengguna belum dapat dibuka.'
        );
      }
    }
  }

  function parseProfileHash() {
    if (!window.location.hash.startsWith(PROFILE_HASH_PREFIX)) {
      return '';
    }

    return decodeURIComponent(
      window.location.hash.slice(
        PROFILE_HASH_PREFIX.length
      )
    );
  }

  async function waitForAppReady() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (
        typeof DOM !== 'undefined' &&
        DOM.feed &&
        !STATE.loading
      ) {
        return true;
      }

      await new Promise(resolve =>
        setTimeout(resolve, 100)
      );
    }

    return false;
  }

  async function handleDeepLink() {
    const userId = parseProfileHash();

    if (!userId || SOCIAL.openingDeepLink) {
      return;
    }

    SOCIAL.openingDeepLink = true;

    try {
      const ready = await waitForAppReady();

      if (ready) {
        await openUserProfile(
          userId,
          {
            pushHash: false
          }
        );
      }
    } finally {
      SOCIAL.openingDeepLink = false;
    }
  }

  document.addEventListener(
    'click',
    event => {
      const commentAuthorTarget =
        event.target.closest(
          '.post-comment-name, .post-comment-avatar'
        );

      if (commentAuthorTarget) {
        const commentItem =
          commentAuthorTarget.closest(
            '.post-comment-item[data-comment-id]'
          );

        if (commentItem) {
          event.preventDefault();
          event.stopPropagation();
          openCommentAuthorProfile(commentItem);
          return;
        }
      }

      const actionElement =
        event.target.closest(
          '[data-social-action]'
        );

      if (!actionElement) {
        return;
      }

      const action =
        actionElement.dataset.socialAction;

      switch (action) {
        case 'profile-back':
          if (window.location.hash.startsWith(PROFILE_HASH_PREFIX)) {
            history.back();
          } else {
            returnHome();
          }
          break;

        case 'share-profile':
          if (SOCIAL.profile) {
            shareProfile(
              SOCIAL.profile.user_id,
              SOCIAL.profile.user_name
            );
          }
          break;

        case 'toggle-follow':
          toggleFollow(
            actionElement.dataset.userId,
            actionElement
          );
          break;

        case 'followers-list':
          openFollowList(
            'followers',
            actionElement.dataset.userId
          );
          break;

        case 'following-list':
          openFollowList(
            'following',
            actionElement.dataset.userId
          );
          break;

        case 'open-list-user':
          if (typeof closeBottomSheet === 'function') {
            closeBottomSheet();
          }
          openUserProfile(
            actionElement.dataset.userId
          );
          break;

        case 'message-user':
          createConversationWithUser(
            actionElement.dataset.userId
          );
          break;

        case 'profile-tab':
          SOCIAL.profileTab =
            actionElement.dataset.tab === 'products'
              ? 'products'
              : 'posts';
          renderProfileGrid();
          break;

        case 'profile-tab-products':
          SOCIAL.profileTab = 'products';
          renderProfileGrid();
          document
            .querySelector('.social-profile-tabs')
            ?.scrollIntoView({
              block: 'start',
              behavior: 'smooth'
            });
          break;

        case 'profile-posts-stat':
          SOCIAL.profileTab = 'posts';
          renderProfileGrid();
          document
            .querySelector('.social-profile-tabs')
            ?.scrollIntoView({
              block: 'start',
              behavior: 'smooth'
            });
          break;

        case 'profile-grid-item': {
          const kind = actionElement.dataset.socialKind;
          const itemId = actionElement.dataset.socialItemId;

          if (kind === 'product') {
            const item = profileProducts(SOCIAL.profile || {})
              .find(candidate =>
                String(candidate.id || '') === String(itemId || '')
              );

            if (
              item?.product?.id &&
              typeof openProductDetail === 'function'
            ) {
              openProductDetail(item.product.id);
            }
          } else {
            openProfilePostViewer(itemId);
          }
          break;
        }

        case 'viewer-back-profile':
          if (SOCIAL.profile) {
            prepareSocialView();
            renderUniversalProfile(SOCIAL.profile);
          }
          break;

        case 'open-conversation':
          openConversation(
            actionElement.dataset.conversationId
          );
          break;

        case 'messages-back':
          returnHome();
          break;

        case 'thread-back':
          openMessagesPage();
          break;

        case 'thread-profile':
          stopThreadPolling();
          openUserProfile(
            actionElement.dataset.userId
          );
          break;

        default:
          break;
      }
    },
    true
  );

  document.addEventListener(
    'submit',
    event => {
      const form = event.target.closest(
        '#socialThreadComposer'
      );

      if (!form) {
        return;
      }

      event.preventDefault();
      sendThreadMessage(form);
    }
  );

  document.addEventListener(
    'input',
    event => {
      if (event.target?.id !== 'socialThreadInput') {
        return;
      }

      const input = event.target;
      input.style.height = 'auto';
      input.style.height =
        `${Math.min(input.scrollHeight, 112)}px`;
    }
  );

  document.addEventListener(
    'keydown',
    event => {
      const stat = event.target.closest(
        '.social-account-stat[data-social-action]'
      );

      if (
        !stat ||
        (event.key !== 'Enter' && event.key !== ' ')
      ) {
        return;
      }

      event.preventDefault();
      stat.click();
    }
  );

  window.addEventListener(
    'popstate',
    () => {
      const userId = parseProfileHash();

      if (userId) {
        openUserProfile(
          userId,
          {
            pushHash: false
          }
        );
      } else if (
        document.querySelector(
          '.social-universal-profile, .social-messages-page, .social-conversation-page'
        )
      ) {
        returnHome();
      }
    }
  );

  window.addEventListener(
    'hashchange',
    handleDeepLink
  );

  document.addEventListener(
    'visibilitychange',
    () => {
      if (!document.hidden) {
        refreshUnreadBadge();
      }
    }
  );

  if (typeof openSellerProfile === 'function') {
    openSellerProfile = function socialSellerProfile(storeId) {
      openStoreProfile(storeId);
    };
  }

  if (typeof handleSellerFollow === 'function') {
    handleSellerFollow = async function socialSellerFollow(storeId) {
      try {
        const profile = await fetchProfileByStore(storeId);
        await toggleFollow(profile.user_id);
      } catch (error) {
        if (typeof showToast === 'function') {
          showToast(
            error?.message ||
            'Akun belum dapat diikuti.'
          );
        }
      }
    };
  }

  if (typeof openSellerMessage === 'function') {
    openSellerMessage = async function socialSellerMessage(storeId) {
      try {
        const profile = await fetchProfileByStore(storeId);
        await createConversationWithUser(profile.user_id);
      } catch (error) {
        if (typeof showToast === 'function') {
          showToast(
            error?.message ||
            'Percakapan belum dapat dibuka.'
          );
        }
      }
    };
  }

  if (typeof shareSellerProfile === 'function') {
    shareSellerProfile = async function socialSellerShare(storeId) {
      try {
        const profile = await fetchProfileByStore(storeId);
        await shareProfile(
          profile.user_id,
          profile.user_name
        );
      } catch (error) {
        if (typeof showToast === 'function') {
          showToast('Profil belum dapat dibagikan.');
        }
      }
    };
  }

  if (typeof shareAccountProfile === 'function') {
    shareAccountProfile = async function socialAccountShare() {
      if (!STATE.user?.id) {
        return;
      }

      await shareProfile(
        STATE.user.id,
        STATE.user.name
      );
    };
  }

  if (typeof openMessages === 'function') {
    openMessages = function socialMessages() {
      openMessagesPage();
    };
  }

  window.openUserProfile = openUserProfile;
  window.openSocialMessages = openMessagesPage;
  window.decorateOwnProfileSocial = decorateOwnProfileSocial;
  window.refreshSocialUnreadBadge = refreshUnreadBadge;

  const ownProfileObserver = new MutationObserver(() => {
    const page = document.querySelector(
      '.social-account-page:not(.public-seller-profile)'
    );

    if (
      page &&
      STATE.user &&
      page.dataset.socialDecorated !== 'true'
    ) {
      page.dataset.socialDecorated = 'true';
      decorateOwnProfileSocial();
    }
  });

  ownProfileObserver.observe(
    document.body,
    {
      childList: true,
      subtree: true
    }
  );

  async function bootSocialCore() {
    await waitForAppReady();
    refreshUnreadBadge();
    handleDeepLink();
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => setTimeout(bootSocialCore, 0),
      { once: true }
    );
  } else {
    setTimeout(bootSocialCore, 0);
  }
})();
