'use strict';

/* =========================================================
   PASAR UMKM - EDIT PROFILE
   Replaces the old informational placeholder with a real,
   validated profile editor backed by PATCH /api/profile.
   ========================================================= */

(() => {
  if (
    typeof openAccountEditInfo !== 'function' ||
    typeof openBottomSheet !== 'function'
  ) {
    console.error(
      '[Pasar UMKM] Edit profil gagal dimuat: dependency tidak ditemukan.'
    );
    return;
  }

  const isSellerAccount = () =>
    STATE.user?.role === 'seller' ||
    STATE.user?.role === 'admin';

  const getAvatarTemplate = avatarUrl => {
    const cleanUrl =
      String(avatarUrl || '').trim();

    if (!cleanUrl) {
      return `
        <i
          class="ph ph-user"
          aria-hidden="true"
        ></i>
      `;
    }

    return `
      <img
        src="${escapeHTML(cleanUrl)}"
        alt="Preview foto profil"
      >
    `;
  };

  openAccountEditInfo = function openRealProfileEditor() {
    if (!STATE.user) {
      openLogin();
      return;
    }

    const store =
      STATE.currentStore || null;

    const sellerFields =
      isSellerAccount() && store
        ? `
          <section class="profile-edit-section">
            <h3 class="profile-edit-section-title">
              Profil UMKM
            </h3>

            <div class="profile-edit-field">
              <label
                class="profile-edit-label"
                for="profileEditDescription"
              >
                Bio / deskripsi UMKM
              </label>

              <textarea
                id="profileEditDescription"
                class="profile-edit-textarea"
                maxlength="1200"
                placeholder="Ceritakan singkat usaha Anda..."
              >${escapeHTML(store.description || '')}</textarea>

              <p class="profile-edit-help">
                Teks ini tampil pada profil publik UMKM.
              </p>
            </div>

            <div class="profile-edit-location-grid">
              <div class="profile-edit-field">
                <label
                  class="profile-edit-label"
                  for="profileEditDistrict"
                >
                  Kecamatan
                </label>

                <input
                  id="profileEditDistrict"
                  class="profile-edit-input"
                  type="text"
                  maxlength="100"
                  value="${escapeHTML(store.district || '')}"
                  placeholder="Contoh: Lubuklinggau Utara I"
                >
              </div>

              <div class="profile-edit-field">
                <label
                  class="profile-edit-label"
                  for="profileEditCity"
                >
                  Kota
                </label>

                <input
                  id="profileEditCity"
                  class="profile-edit-input"
                  type="text"
                  maxlength="100"
                  value="${escapeHTML(store.city || 'Lubuklinggau')}"
                  placeholder="Lubuklinggau"
                >
              </div>

              <div class="profile-edit-field">
                <label
                  class="profile-edit-label"
                  for="profileEditProvince"
                >
                  Provinsi
                </label>

                <input
                  id="profileEditProvince"
                  class="profile-edit-input"
                  type="text"
                  maxlength="100"
                  value="${escapeHTML(store.province || 'Sumatera Selatan')}"
                  placeholder="Sumatera Selatan"
                >
              </div>
            </div>
          </section>
        `
        : '';

    openBottomSheet(
      `
        <form
          id="profileEditForm"
          class="profile-edit-sheet"
          novalidate
        >
          <header class="profile-edit-head">
            <div class="profile-edit-title-wrap">
              <h2 class="profile-edit-title">
                Edit profil
              </h2>

              <p class="profile-edit-subtitle">
                Perbarui identitas yang tampil kepada pengguna lain.
              </p>
            </div>

            <button
              type="button"
              class="profile-edit-close"
              data-action="close-sheet"
              aria-label="Tutup edit profil"
            >
              <i class="ph ph-x"></i>
            </button>
          </header>

          <section class="profile-edit-avatar-card">
            <div
              id="profileEditAvatarPreview"
              class="profile-edit-avatar-preview"
            >
              ${getAvatarTemplate(STATE.user.avatar_url)}
            </div>

            <div class="profile-edit-avatar-copy">
              <strong>Foto profil</strong>
              <span>
                Gunakan URL gambar publik berformat HTTPS.
              </span>
            </div>
          </section>

          <section class="profile-edit-section">
            <h3 class="profile-edit-section-title">
              Identitas akun
            </h3>

            <div class="profile-edit-field">
              <label
                class="profile-edit-label"
                for="profileEditName"
              >
                Nama profil
              </label>

              <input
                id="profileEditName"
                class="profile-edit-input"
                type="text"
                minlength="2"
                maxlength="100"
                required
                autocomplete="name"
                value="${escapeHTML(STATE.user.name || '')}"
                placeholder="Nama profil"
              >
            </div>

            <div class="profile-edit-field">
              <label
                class="profile-edit-label"
                for="profileEditAvatarUrl"
              >
                URL foto profil
              </label>

              <input
                id="profileEditAvatarUrl"
                class="profile-edit-input"
                type="url"
                maxlength="2000"
                inputmode="url"
                value="${escapeHTML(STATE.user.avatar_url || '')}"
                placeholder="https://..."
              >

              <p class="profile-edit-help">
                Kosongkan jika ingin memakai avatar bawaan.
              </p>
            </div>
          </section>

          ${sellerFields}

          <div class="profile-edit-actions">
            <button
              type="button"
              class="profile-edit-button secondary"
              data-action="close-sheet"
            >
              Batal
            </button>

            <button
              id="profileEditSubmit"
              type="submit"
              class="profile-edit-button primary"
            >
              Simpan perubahan
            </button>
          </div>
        </form>
      `,
      'profile-edit'
    );
  };

  document.addEventListener(
    'input',
    event => {
      if (
        event.target?.id !==
        'profileEditAvatarUrl'
      ) {
        return;
      }

      const preview =
        document.getElementById(
          'profileEditAvatarPreview'
        );

      if (!preview) {
        return;
      }

      preview.innerHTML =
        getAvatarTemplate(
          event.target.value
        );
    }
  );

  document.addEventListener(
    'submit',
    async event => {
      const form =
        event.target.closest(
          '#profileEditForm'
        );

      if (!form) {
        return;
      }

      event.preventDefault();

      const nameInput =
        document.getElementById(
          'profileEditName'
        );

      const avatarInput =
        document.getElementById(
          'profileEditAvatarUrl'
        );

      const submitButton =
        document.getElementById(
          'profileEditSubmit'
        );

      const name =
        String(
          nameInput?.value || ''
        ).trim();

      const avatarUrl =
        String(
          avatarInput?.value || ''
        ).trim();

      if (
        name.length < 2 ||
        name.length > 100
      ) {
        showToast(
          'Nama profil harus 2 sampai 100 karakter.'
        );
        nameInput?.focus();
        return;
      }

      if (
        avatarUrl &&
        !/^https?:\/\//i.test(avatarUrl)
      ) {
        showToast(
          'URL foto profil harus diawali http:// atau https://.'
        );
        avatarInput?.focus();
        return;
      }

      const payload = {
        name,
        avatar_url:
          avatarUrl || null
      };

      if (
        isSellerAccount() &&
        STATE.currentStore
      ) {
        payload.store = {
          description:
            document.getElementById(
              'profileEditDescription'
            )?.value || '',

          district:
            document.getElementById(
              'profileEditDistrict'
            )?.value || '',

          city:
            document.getElementById(
              'profileEditCity'
            )?.value || '',

          province:
            document.getElementById(
              'profileEditProvince'
            )?.value || ''
        };
      }

      const originalLabel =
        submitButton?.textContent ||
        'Simpan perubahan';

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent =
          'Menyimpan...';
      }

      try {
        const response =
          await fetch(
            '/api/profile',
            {
              method: 'PATCH',
              credentials: 'include',
              headers: {
                'Content-Type':
                  'application/json',
                Accept:
                  'application/json'
              },
              body:
                JSON.stringify(payload),
              cache:
                'no-store'
            }
          );

        const data =
          await response
            .json()
            .catch(() => ({}));

        if (
          !response.ok ||
          data.ok !== true
        ) {
          throw new Error(
            data.error ||
            'Profil belum dapat diperbarui.'
          );
        }

        STATE.user = {
          ...STATE.user,
          ...data.user
        };

        if (data.store) {
          STATE.currentStore =
            data.store;

          const publicStore =
            DATA.stores.find(store =>
              String(store.id || '') ===
              String(data.store.id || '')
            );

          if (publicStore) {
            Object.assign(
              publicStore,
              {
                name:
                  data.store.name ||
                  publicStore.name,
                description:
                  data.store.description || '',
                logo:
                  data.store.logo_url || '',
                district:
                  data.store.district || '',
                city:
                  data.store.city || '',
                province:
                  data.store.province || ''
              }
            );
          }
        }

        if (
          typeof renderSidebar ===
          'function'
        ) {
          renderSidebar();
        }

        closeBottomSheet();
        showToast(
          'Profil berhasil diperbarui.'
        );

        await openAccount();
      } catch (error) {
        console.error(
          '[Pasar UMKM] Profile update error:',
          error
        );

        showToast(
          error?.message ||
          'Profil belum dapat diperbarui.'
        );
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent =
            originalLabel;
        }
      }
    }
  );
})();
