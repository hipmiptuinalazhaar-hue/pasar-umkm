'use strict';

/* =========================================================
   PASAR UMKM - PUBLIC PROFILE IDENTITY
   Menyatukan identitas akun, avatar feed, dan profil publik.
   ========================================================= */

(() => {
  if (
    typeof DATA === 'undefined' ||
    typeof STATE === 'undefined'
  ) {
    return;
  }

  const profilesByStore =
    new Map();

  let loadingPromise = null;

  async function loadPublicProfiles(force = false) {
    if (
      loadingPromise &&
      !force
    ) {
      return loadingPromise;
    }

    loadingPromise = (async () => {
      const response =
        await fetch(
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

      const data =
        await response
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
        const storeId =
          String(profile.store_id || '');

        if (storeId) {
          profilesByStore.set(
            storeId,
            profile
          );
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

  function syncApplicationProfiles() {
    if (Array.isArray(DATA.posts)) {
      for (const post of DATA.posts) {
        const storeId =
          String(post.store?.id || '');

        const profile =
          profilesByStore.get(storeId);

        if (!profile || !post.store) {
          continue;
        }

        post.store.avatar =
          profile.user_avatar_url ||
          profile.logo_url ||
          post.store.avatar;

        post.store.accountName =
          profile.user_name ||
          post.store.name;

        post.store.ownerId =
          profile.user_id || '';
      }
    }

    if (Array.isArray(DATA.stores)) {
      for (const store of DATA.stores) {
        const profile =
          profilesByStore.get(
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
      }
    }
  }

  function applyPublicProfileIdentity(
    storeId
  ) {
    const profile =
      profilesByStore.get(
        String(storeId || '')
      );

    const page =
      document.querySelector(
        '.public-seller-profile'
      );

    if (!profile || !page) {
      return;
    }

    page.dataset.userId =
      String(profile.user_id || '');

    const topbarName =
      page.querySelector(
        '.social-account-topbar strong'
      );

    if (topbarName) {
      topbarName.textContent =
        profile.user_name ||
        profile.store_name ||
        'Profil';
    }

    const profileName =
      page.querySelector(
        '.social-account-name'
      );

    if (profileName) {
      profileName.textContent =
        profile.user_name ||
        profile.store_name ||
        'Pengguna';
    }

    const avatar =
      page.querySelector(
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

    const role =
      page.querySelector(
        '.social-account-role'
      );

    if (role) {
      role.textContent =
        profile.store_name
          ? `Pemilik ${profile.store_name}`
          : 'Pengguna Pasar UMKM';
    }
  }

  if (
    typeof openSellerProfile ===
    'function'
  ) {
    const originalOpenSellerProfile =
      openSellerProfile;

    openSellerProfile =
      async function connectedSellerProfile(
        storeId
      ) {
        try {
          await loadPublicProfiles(true);
        } catch (error) {
          console.error(
            '[Pasar UMKM] Public profile sync error:',
            error
          );
        }

        originalOpenSellerProfile(
          storeId
        );

        applyPublicProfileIdentity(
          storeId
        );
      };
  }

  async function hydrateFeedIdentity() {
    let attempts = 0;

    while (
      STATE.loading &&
      attempts < 40
    ) {
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

  setTimeout(
    hydrateFeedIdentity,
    0
  );
})();
