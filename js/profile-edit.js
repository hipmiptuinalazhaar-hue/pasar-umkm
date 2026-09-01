'use strict';

/* =========================================================
   PASAR UMKM - EDIT PROFILE
   Native avatar picker + contact and social profile editor.
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

  const AVATAR_SIZE = 512;
  const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
  const MAX_UPLOAD_BYTES = 500 * 1024;

  let pendingAvatarBlob = null;
  let pendingAvatarPreviewUrl = '';
  let avatarProcessing = false;

  const isSellerAccount = () =>
    STATE.user?.role === 'seller' ||
    STATE.user?.role === 'admin';

  const getAvatarTemplate = avatarUrl => {
    const cleanUrl = String(avatarUrl || '').trim();

    if (!cleanUrl) {
      return `
        <i class="ph ph-user" aria-hidden="true"></i>
      `;
    }

    return `
      <img
        src="${escapeHTML(cleanUrl)}"
        alt="Preview foto profil"
      >
    `;
  };

  function clearPendingAvatar() {
    pendingAvatarBlob = null;
    avatarProcessing = false;

    if (pendingAvatarPreviewUrl) {
      URL.revokeObjectURL(pendingAvatarPreviewUrl);
      pendingAvatarPreviewUrl = '';
    }
  }

  function setAvatarStatus(message) {
    const status = document.getElementById(
      'profileEditAvatarStatus'
    );

    if (status) {
      status.textContent = message;
    }
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Foto tidak dapat dibaca.'));
      };

      image.src = objectUrl;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(resolve => {
      canvas.toBlob(
        blob => resolve(blob),
        type,
        quality
      );
    });
  }

  async function createAvatarBlob(file) {
    if (!file) {
      throw new Error('Pilih foto terlebih dahulu.');
    }

    if (
      !['image/jpeg', 'image/png', 'image/webp']
        .includes(file.type)
    ) {
      throw new Error(
        'Format foto harus JPG, PNG, atau WebP.'
      );
    }

    if (file.size > MAX_SOURCE_BYTES) {
      throw new Error(
        'Foto terlalu besar. Maksimal 12 MB sebelum diproses.'
      );
    }

    const image = await loadImageFromFile(file);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;

    if (!sourceWidth || !sourceHeight) {
      throw new Error('Ukuran foto tidak valid.');
    }

    const cropSize = Math.min(sourceWidth, sourceHeight);
    const sourceX = Math.max(
      0,
      (sourceWidth - cropSize) / 2
    );
    const sourceY = Math.max(
      0,
      (sourceHeight - cropSize) / 2
    );

    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;

    const context = canvas.getContext('2d', {
      alpha: true
    });

    if (!context) {
      throw new Error(
        'Pemrosesan foto tidak didukung browser ini.'
      );
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      image,
      sourceX,
      sourceY,
      cropSize,
      cropSize,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE
    );

    let quality = 0.86;
    let blob = await canvasToBlob(
      canvas,
      'image/webp',
      quality
    );

    while (
      blob &&
      blob.size > MAX_UPLOAD_BYTES &&
      quality > 0.56
    ) {
      quality -= 0.1;
      blob = await canvasToBlob(
        canvas,
        'image/webp',
        quality
      );
    }

    if (!blob || blob.size > MAX_UPLOAD_BYTES) {
      quality = 0.8;
      blob = await canvasToBlob(
        canvas,
        'image/jpeg',
        quality
      );
    }

    while (
      blob &&
      blob.size > MAX_UPLOAD_BYTES &&
      quality > 0.5
    ) {
      quality -= 0.1;
      blob = await canvasToBlob(
        canvas,
        'image/jpeg',
        quality
      );
    }

    if (!blob || blob.size > MAX_UPLOAD_BYTES) {
      throw new Error(
        'Foto masih terlalu besar setelah diproses. Pilih foto lain.'
      );
    }

    return blob;
  }

  async function uploadPendingAvatar() {
    if (!pendingAvatarBlob) {
      return null;
    }

    const response = await fetch(
      '/api/profile/avatar',
      {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': pendingAvatarBlob.type,
          Accept: 'application/json'
        },
        body: pendingAvatarBlob,
        cache: 'no-store'
      }
    );

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok || data.ok !== true) {
      throw new Error(
        data.error ||
        'Foto profil belum dapat disimpan.'
      );
    }

    return data.user || null;
  }

  function syncStoreState(storeData) {
    if (!storeData) {
      return;
    }

    STATE.currentStore = storeData;

    const publicStore = DATA.stores.find(store =>
      String(store.id || '') ===
      String(storeData.id || '')
    );

    if (!publicStore) {
      return;
    }

    Object.assign(publicStore, {
      name: storeData.name || publicStore.name,
      description: storeData.description || '',
      logo: storeData.logo_url || '',
      district: storeData.district || '',
      city: storeData.city || '',
      province: storeData.province || '',
      whatsapp: storeData.whatsapp || '',
      instagramUrl: storeData.instagram_url || '',
      tiktokUrl: storeData.tiktok_url || ''
    });
  }

  async function hydrateEditableProfile() {
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

      if (!response.ok || data.ok !== true) {
        return;
      }

      if (data.user) {
        STATE.user = {
          ...STATE.user,
          ...data.user
        };
      }

      if (data.store) {
        syncStoreState(data.store);
      }
    } catch (error) {
      console.error(
        '[Pasar UMKM] Profile editor hydrate error:',
        error
      );
    }
  }

  function createSellerFields(store) {
    if (!isSellerAccount() || !store) {
      return '';
    }

    return `
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
              placeholder="Lubuklinggau Utara I"
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

      <section class="profile-edit-section">
        <h3 class="profile-edit-section-title">
          Kontak & sosial media
        </h3>

        <p class="profile-edit-section-note">
          Pengunjung dapat mengetuk kontak ini langsung dari profil Anda.
        </p>

        <div class="profile-edit-field">
          <label
            class="profile-edit-label"
            for="profileEditWhatsapp"
          >
            WhatsApp
          </label>
          <div class="profile-edit-input-shell">
            <i class="ph ph-whatsapp-logo"></i>
            <input
              id="profileEditWhatsapp"
              class="profile-edit-input profile-edit-input-with-icon"
              type="tel"
              maxlength="30"
              inputmode="tel"
              value="${escapeHTML(store.whatsapp || '')}"
              placeholder="08xxxxxxxxxx atau +62xxxxxxxxxx"
            >
          </div>
        </div>

        <div class="profile-edit-field">
          <label
            class="profile-edit-label"
            for="profileEditInstagram"
          >
            Instagram
          </label>
          <div class="profile-edit-input-shell">
            <i class="ph ph-instagram-logo"></i>
            <input
              id="profileEditInstagram"
              class="profile-edit-input profile-edit-input-with-icon"
              type="text"
              maxlength="240"
              value="${escapeHTML(store.instagram_url || '')}"
              placeholder="@username atau instagram.com/username"
            >
          </div>
        </div>

        <div class="profile-edit-field">
          <label
            class="profile-edit-label"
            for="profileEditTiktok"
          >
            TikTok
          </label>
          <div class="profile-edit-input-shell">
            <i class="ph ph-tiktok-logo"></i>
            <input
              id="profileEditTiktok"
              class="profile-edit-input profile-edit-input-with-icon"
              type="text"
              maxlength="240"
              value="${escapeHTML(store.tiktok_url || '')}"
              placeholder="@username atau tiktok.com/@username"
            >
          </div>
        </div>
      </section>
    `;
  }

  openAccountEditInfo = async function openRealProfileEditor() {
    if (!STATE.user) {
      openLogin();
      return;
    }

    clearPendingAvatar();
    await hydrateEditableProfile();

    const store = STATE.currentStore || null;

    openBottomSheet(
      `
        <form
          id="profileEditForm"
          class="profile-edit-sheet"
          novalidate
        >
          <header class="profile-edit-head">
            <div class="profile-edit-title-wrap">
              <h2 class="profile-edit-title">Edit profil</h2>
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
            <button
              id="profileEditAvatarPicker"
              type="button"
              class="profile-edit-avatar-picker"
              aria-label="Pilih foto profil dari perangkat"
            >
              <span
                id="profileEditAvatarPreview"
                class="profile-edit-avatar-preview"
              >
                ${getAvatarTemplate(STATE.user.avatar_url)}
              </span>
              <span
                class="profile-edit-avatar-camera"
                aria-hidden="true"
              >
                <i class="ph ph-camera"></i>
              </span>
            </button>

            <div class="profile-edit-avatar-copy">
              <strong>Foto profil</strong>
              <span>
                Ketuk foto untuk memilih gambar dari perangkat.
              </span>
              <small id="profileEditAvatarStatus">
                JPG, PNG, atau WebP. Foto otomatis dirapikan menjadi persegi.
              </small>
            </div>

            <input
              id="profileEditAvatarFile"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
            >
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
          </section>

          ${createSellerFields(store)}

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

  document.addEventListener('click', event => {
    const picker = event.target.closest(
      '#profileEditAvatarPicker'
    );

    if (!picker || avatarProcessing) {
      return;
    }

    const fileInput = document.getElementById(
      'profileEditAvatarFile'
    );

    if (!fileInput) {
      return;
    }

    fileInput.value = '';
    fileInput.click();
  });

  document.addEventListener('change', async event => {
    if (event.target?.id !== 'profileEditAvatarFile') {
      return;
    }

    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const picker = document.getElementById(
      'profileEditAvatarPicker'
    );

    avatarProcessing = true;
    picker?.classList.add('is-processing');
    setAvatarStatus('Menyiapkan foto...');

    try {
      const blob = await createAvatarBlob(file);

      if (pendingAvatarPreviewUrl) {
        URL.revokeObjectURL(pendingAvatarPreviewUrl);
      }

      pendingAvatarBlob = blob;
      pendingAvatarPreviewUrl = URL.createObjectURL(blob);

      const preview = document.getElementById(
        'profileEditAvatarPreview'
      );

      if (preview) {
        preview.innerHTML = getAvatarTemplate(
          pendingAvatarPreviewUrl
        );
      }

      setAvatarStatus('Foto siap disimpan.');
    } catch (error) {
      console.error(
        '[Pasar UMKM] Avatar process error:',
        error
      );
      setAvatarStatus('Foto belum dipilih.');
      showToast(
        error?.message || 'Foto tidak dapat diproses.'
      );
    } finally {
      avatarProcessing = false;
      picker?.classList.remove('is-processing');
    }
  });

  document.addEventListener('submit', async event => {
    const form = event.target.closest('#profileEditForm');

    if (!form) {
      return;
    }

    event.preventDefault();

    if (avatarProcessing) {
      showToast('Tunggu foto selesai diproses.');
      return;
    }

    const nameInput = document.getElementById(
      'profileEditName'
    );
    const submitButton = document.getElementById(
      'profileEditSubmit'
    );
    const name = String(nameInput?.value || '').trim();

    if (name.length < 2 || name.length > 100) {
      showToast(
        'Nama profil harus 2 sampai 100 karakter.'
      );
      nameInput?.focus();
      return;
    }

    const payload = { name };

    if (isSellerAccount() && STATE.currentStore) {
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
          )?.value || '',
        whatsapp:
          document.getElementById(
            'profileEditWhatsapp'
          )?.value || '',
        instagram_url:
          document.getElementById(
            'profileEditInstagram'
          )?.value || '',
        tiktok_url:
          document.getElementById(
            'profileEditTiktok'
          )?.value || ''
      };
    }

    const originalLabel =
      submitButton?.textContent || 'Simpan perubahan';

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Menyimpan...';
    }

    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(payload),
        cache: 'no-store'
      });

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok || data.ok !== true) {
        throw new Error(
          data.error || 'Profil belum dapat diperbarui.'
        );
      }

      STATE.user = {
        ...STATE.user,
        ...data.user
      };

      syncStoreState(data.store || null);

      if (pendingAvatarBlob) {
        if (submitButton) {
          submitButton.textContent = 'Mengunggah foto...';
        }

        const avatarUser = await uploadPendingAvatar();

        if (avatarUser) {
          STATE.user = {
            ...STATE.user,
            ...avatarUser
          };
        }
      }

      if (typeof renderSidebar === 'function') {
        renderSidebar();
      }

      if (
        typeof window.refreshPublicProfileIdentity ===
        'function'
      ) {
        await window
          .refreshPublicProfileIdentity()
          .catch(() => {});
      }

      clearPendingAvatar();
      closeBottomSheet();
      showToast('Profil berhasil diperbarui.');
      await openAccount();
    } catch (error) {
      console.error(
        '[Pasar UMKM] Profile update error:',
        error
      );
      showToast(
        error?.message || 'Profil belum dapat diperbarui.'
      );
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalLabel;
      }
    }
  });
})();
