'use strict';

/* =========================================================
   PASAR UMKM - PUBLIC PROFILE IDENTITY
   Satu sumber identitas untuk feed, akun, dan profil publik.
   ========================================================= */

(() => {
  if (
    typeof DATA === 'undefined' ||
    typeof STATE === 'undefined'
  ) {
    return;
  }

  const profilesByStore = new Map();
  let loadingPromise = null;

  async function loadPublicProfiles(force = false) {
    if (loadingPromise && !force) {
      return loadingPromise;
    }

    loadingPromise = (async () => {
      const response = await fetch(
        '/api/public-profiles',
        {
          method: 'GET',
          credentials: 'include',
          headers: {
            Accept: 'application/json'
          },
          cache: 'no-store'
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (
        !response.ok ||
        data.ok !== true ||
        !Array.isArray(data.profiles)
      ) {
        throw new Error(
          data.error ||
          'Profil publik belum dapat dimuat.'
        );
      }

      profilesByStore.clear();

      for (const profile of data.profiles) {
        const storeId = String(
          profile.store_id || ''
        );

        if (storeId) {
          profilesByStore.set(storeId, profile);
        }
      }

      syncApplicationProfiles();
      return profilesByStore;
    })();

    try {
      return await loadingPromise;
    } finally {
      loadingPromise = null;
    }
  }

  function whatsappHref(value) {
    let digits = String(value || '')
      .replace(/\D/g, '');

    if (!digits) {
      return '';
    }

    if (digits.startsWith('0')) {
      digits = `62${digits.slice(1)}`;
    } else if (digits.startsWith('8')) {
      digits = `62${digits}`;
    }

    return `https://wa.me/${digits}`;
  }

  function socialHandle(url, platform) {
    if (!url) {
      return '';
    }

    try {
      const parsed = new URL(url, window.location.origin);
      const parts = parsed.pathname
        .split('/')
        .filter(Boolean);

      const last = parts[parts.length - 1] || '';

      if (platform === 'tiktok') {
        return `@${last.replace(/^@/, '')}`;
      }

      return `@${last.replace(/^@/, '')}`;
    } catch {
      return '';
    }
  }

  function syncApplicationProfiles() {
    if (Array.isArray(DATA.posts)) {
      for (const post of DATA.posts) {
        const storeId = String(post.store?.id || '');
        const profile = profilesByStore.get(storeId);

        if (!profile || !post.store) {
          continue;
        }

        post.store.businessName =
          profile.store_name ||
          post.store.businessName ||
          post.store.name;

        post.store.name =
          profile.user_name ||
          post.store.name;

        post.store.avatar =
          profile.user_avatar_url ||
          profile.logo_url ||
          post.store.avatar;

        post.store.accountName =
          profile.user_name ||
          post.store.name;

        post.store.ownerId =
          profile.user_id || '';

        post.store.whatsapp =
          profile.whatsapp || '';
      }
    }

    if (Array.isArray(DATA.stores)) {
      for (const store of DATA.stores) {
        const profile = profilesByStore.get(
          String(store.id || '')
        );

        if (!profile) {
          continue;
        }

        store.profileUserName =
          profile.user_name || '';
        store.profileAvatar =
          profile.user_avatar_url || '';
        store.description =
          profile.description || '';
        store.district =
          profile.district || '';
        store.city =
          profile.city || '';
        store.province =
          profile.province || '';
        store.whatsapp =
          profile.whatsapp || '';
        store.instagramUrl =
          profile.instagram_url || '';
        store.tiktokUrl =
          profile.tiktok_url || '';
      }
    }
  }

  function renderContactLinks(page, profile) {
    if (!page || !profile) {
      return;
    }

    page.querySelector(
      '.profile-public-links'
    )?.remove();

    const links = [];
    const waHref = whatsappHref(profile.whatsapp);

    if (waHref) {
      links.push(`
        <a
          class="profile-public-link whatsapp"
          href="${escapeHTML(waHref)}"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Hubungi melalui WhatsApp"
        >
          <i class="ph ph-whatsapp-logo"></i>
          <span>${escapeHTML(profile.whatsapp)}</span>
        </a>
      `);
    }

    if (profile.instagram_url) {
      links.push(`
        <a
          class="profile-public-link instagram"
          href="${escapeHTML(profile.instagram_url)}"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Buka Instagram"
        >
          <i class="ph ph-instagram-logo"></i>
          <span>${escapeHTML(
            socialHandle(
              profile.instagram_url,
              'instagram'
            ) || 'Instagram'
          )}</span>
        </a>
      `);
    }

    if (profile.tiktok_url) {
      links.push(`
        <a
          class="profile-public-link tiktok"
          href="${escapeHTML(profile.tiktok_url)}"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Buka TikTok"
        >
          <i class="ph ph-tiktok-logo"></i>
          <span>${escapeHTML(
            socialHandle(
              profile.tiktok_url,
              'tiktok'
            ) || 'TikTok'
          )}</span>
        </a>
      `);
    }

    if (!links.length) {
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'profile-public-links';
    wrapper.innerHTML = links.join('');

    const description = page.querySelector(
      '.social-account-description'
    );
    const actions = page.querySelector(
      '.social-account-actions'
    );

    if (description) {
      description.insertAdjacentElement(
        'afterend',
        wrapper
      );
    } else if (actions) {
      actions.insertAdjacentElement(
        'beforebegin',
        wrapper
      );
    }
  }

  function applyPublicProfileIdentity(storeId) {
    const profile = profilesByStore.get(
      String(storeId || '')
    );
    const page = document.querySelector(
      '.public-seller-profile'
    );

    if (!profile || !page) {
      return;
    }

    page.dataset.userId = String(
      profile.user_id || ''
    );

    const topbarName = page.querySelector(
      '.social-account-topbar strong'
    );

    if (topbarName) {
      topbarName.textContent =
        profile.user_name ||
        profile.store_name ||
        'Profil';
    }

    const profileName = page.querySelector(
      '.social-account-name'
    );

    if (profileName) {
      profileName.textContent =
        profile.user_name ||
        profile.store_name ||
        'Pengguna';
    }

    const avatar = page.querySelector(
      '.social-account-avatar'
    );
    const avatarUrl =
      profile.user_avatar_url ||
      profile.logo_url ||
      '';

    if (avatar && avatarUrl) {
      avatar.innerHTML = `
        <img
          src="${escapeHTML(avatarUrl)}"
          alt="${escapeHTML(
            profile.user_name ||
            profile.store_name ||
            'Foto profil'
          )}"
          loading="eager"
          decoding="async"
        >
      `;
    }

    const role = page.querySelector(
      '.social-account-role'
    );

    if (role) {
      role.textContent =
        profile.store_name
          ? `Pemilik ${profile.store_name}`
          : 'Pengguna Pasar UMKM';
    }

    const description = page.querySelector(
      '.social-account-description'
    );

    if (description) {
      description.textContent =
        profile.description || '';
      description.hidden = !profile.description;
    }

    renderContactLinks(page, profile);
  }

  if (typeof openSellerProfile === 'function') {
    const originalOpenSellerProfile = openSellerProfile;

    openSellerProfile =
      async function connectedSellerProfile(storeId) {
        try {
          await loadPublicProfiles(true);
        } catch (error) {
          console.error(
            '[Pasar UMKM] Public profile sync error:',
            error
          );
        }

        originalOpenSellerProfile(storeId);
        applyPublicProfileIdentity(storeId);
      };
  }

  window.decorateOwnProfileContacts =
    async function decorateOwnProfileContacts() {
      if (!STATE.user) {
        return;
      }

      try {
        const response = await fetch('/api/profile', {
          method: 'GET',
          credentials: 'include',
          headers: {
            Accept: 'application/json'
          },
          cache: 'no-store'
        });

        const data = await response
          .json()
          .catch(() => ({}));

        if (
          !response.ok ||
          data.ok !== true ||
          !data.store
        ) {
          return;
        }

        const page = document.querySelector(
          '.social-account-page:not(.public-seller-profile)'
        );

        renderContactLinks(
          page,
          data.store
        );
      } catch (error) {
        console.error(
          '[Pasar UMKM] Own profile contact render error:',
          error
        );
      }
    };

  async function hydrateFeedIdentity() {
    let attempts = 0;

    while (STATE.loading && attempts < 40) {
      await new Promise(resolve =>
        setTimeout(resolve, 100)
      );
      attempts += 1;
    }

    try {
      await loadPublicProfiles();

      if (
        STATE.activeNav === 'home' &&
        typeof renderFeed === 'function'
      ) {
        renderFeed();
      }
    } catch (error) {
      console.error(
        '[Pasar UMKM] Feed profile hydration error:',
        error
      );
    }
  }

  window.refreshPublicProfileIdentity =
    async function refreshPublicProfileIdentity() {
      await loadPublicProfiles(true);

      if (
        STATE.activeNav === 'home' &&
        typeof renderFeed === 'function'
      ) {
        renderFeed();
      }
    };

  setTimeout(hydrateFeedIdentity, 0);
})();
