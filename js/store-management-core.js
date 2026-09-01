'use strict';

/* =========================================================
   PASAR UMKM - STORE MANAGEMENT CORE
   Mengaktifkan pengelolaan data UMKM dari menu Kelola Toko.
   ========================================================= */

(() => {
  if (
    typeof STATE === 'undefined' ||
    typeof openBottomSheet !== 'function'
  ) {
    return;
  }

  function esc(value) {
    return typeof escapeHTML === 'function'
      ? escapeHTML(String(value ?? ''))
      : String(value ?? '');
  }

  async function api(options = {}) {
    const response = await fetch(
      '/api/store-management',
      {
        method: options.method || 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          ...(options.body
            ? { 'Content-Type': 'application/json' }
            : {})
        },
        ...(options.body
          ? { body: JSON.stringify(options.body) }
          : {})
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok !== true) {
      throw new Error(
        data.error ||
        'Data UMKM belum dapat diproses.'
      );
    }

    return data;
  }

  function categoryOptions(selectedId) {
    const categories = Array.isArray(CATEGORIES)
      ? CATEGORIES
      : [];

    return `
      <option value="">Tanpa kategori</option>
      ${categories.map(category => `
        <option
          value="${esc(category.id)}"
          ${String(category.id) === String(selectedId || '') ? 'selected' : ''}
        >
          ${esc(category.name)}
        </option>
      `).join('')}
    `;
  }

  function syncStore(store) {
    if (!store) {
      return;
    }

    STATE.currentStore = {
      ...(STATE.currentStore || {}),
      ...store
    };

    const publicStore = Array.isArray(DATA.stores)
      ? DATA.stores.find(item =>
          String(item.id || '') === String(store.id || '')
        )
      : null;

    if (publicStore) {
      Object.assign(publicStore, {
        name: store.name || '',
        categoryId: store.category_id || '',
        description: store.description || '',
        phone: store.phone || '',
        whatsapp: store.whatsapp || '',
        address: store.address || '',
        district: store.district || '',
        city: store.city || '',
        province: store.province || ''
      });
    }
  }

  function renderForm(store) {
    openBottomSheet(
      `
        <section class="auth-shell">
          <h2 id="sheetTitle">Kelola Toko</h2>

          <form id="storeManagementForm">
            <div class="auth-field">
              <label for="storeManageName">Nama UMKM</label>
              <input
                id="storeManageName"
                name="name"
                class="auth-input"
                maxlength="150"
                value="${esc(store.name || '')}"
                required
              >
            </div>

            <div class="auth-field">
              <label for="storeManageCategory">Kategori</label>
              <select
                id="storeManageCategory"
                name="category_id"
                class="auth-input"
              >
                ${categoryOptions(store.category_id)}
              </select>
            </div>

            <div class="auth-field">
              <label for="storeManageDescription">Deskripsi usaha</label>
              <textarea
                id="storeManageDescription"
                name="description"
                class="auth-input"
                rows="3"
                maxlength="2000"
              >${esc(store.description || '')}</textarea>
            </div>

            <div class="auth-field">
              <label for="storeManagePhone">Nomor telepon</label>
              <input
                id="storeManagePhone"
                name="phone"
                class="auth-input"
                inputmode="tel"
                maxlength="30"
                value="${esc(store.phone || '')}"
              >
            </div>

            <div class="auth-field">
              <label for="storeManageWhatsapp">WhatsApp</label>
              <input
                id="storeManageWhatsapp"
                name="whatsapp"
                class="auth-input"
                inputmode="tel"
                maxlength="30"
                value="${esc(store.whatsapp || '')}"
              >
            </div>

            <div class="auth-field">
              <label for="storeManageEmail">Email UMKM</label>
              <input
                id="storeManageEmail"
                name="email"
                class="auth-input"
                type="email"
                maxlength="255"
                value="${esc(store.email || '')}"
              >
            </div>

            <div class="auth-field">
              <label for="storeManageAddress">Alamat lengkap</label>
              <textarea
                id="storeManageAddress"
                name="address"
                class="auth-input"
                rows="3"
                maxlength="1200"
              >${esc(store.address || '')}</textarea>
            </div>

            <div class="auth-field">
              <label for="storeManageDistrict">Kecamatan</label>
              <input
                id="storeManageDistrict"
                name="district"
                class="auth-input"
                maxlength="100"
                value="${esc(store.district || '')}"
              >
            </div>

            <div class="auth-field">
              <label for="storeManageCity">Kota</label>
              <input
                id="storeManageCity"
                name="city"
                class="auth-input"
                maxlength="100"
                value="${esc(store.city || 'Lubuklinggau')}"
              >
            </div>

            <div class="auth-field">
              <label for="storeManageProvince">Provinsi</label>
              <input
                id="storeManageProvince"
                name="province"
                class="auth-input"
                maxlength="100"
                value="${esc(store.province || 'Sumatera Selatan')}"
              >
            </div>

            <button
              type="submit"
              class="btn-primary"
              style="width:100%;margin-top:12px;"
            >
              Simpan Data Toko
            </button>
          </form>

          <button
            type="button"
            class="menu-sheet-btn"
            data-store-manage-action="orders"
            style="margin-top:12px;"
          >
            <i class="ph ph-receipt"></i>
            Pesanan Masuk
          </button>

          <button
            type="button"
            class="menu-sheet-btn"
            data-store-manage-action="products"
          >
            <i class="ph ph-package"></i>
            Produk Saya
          </button>

          <button
            type="button"
            class="menu-sheet-btn"
            data-store-manage-action="profile"
          >
            <i class="ph ph-user-circle"></i>
            Foto, sosial media & profil akun
          </button>
        </section>
      `,
      'seller-store'
    );
  }

  async function openStoreManagement() {
    if (!STATE.user) {
      if (typeof openLogin === 'function') {
        openLogin();
      }
      return;
    }

    openBottomSheet(
      `
        <h2 id="sheetTitle">Kelola Toko</h2>
        <section class="empty-state">
          <i class="ph ph-spinner-gap"></i>
          <strong class="empty-state-title">Memuat data toko...</strong>
        </section>
      `,
      'seller-store'
    );

    try {
      const data = await api();
      syncStore(data.store);
      renderForm(data.store);
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'Data UMKM belum dapat dimuat.');
      }
    }
  }

  async function submitStore(form) {
    const button = form.querySelector('button[type="submit"]');
    const values = new FormData(form);

    if (button) {
      button.disabled = true;
      button.textContent = 'Menyimpan...';
    }

    try {
      const data = await api({
        method: 'PATCH',
        body: {
          name: values.get('name'),
          category_id: values.get('category_id') || null,
          description: values.get('description'),
          phone: values.get('phone'),
          whatsapp: values.get('whatsapp'),
          email: values.get('email'),
          address: values.get('address'),
          district: values.get('district'),
          city: values.get('city'),
          province: values.get('province')
        }
      });

      syncStore(data.store);
      renderForm(data.store);

      if (typeof showToast === 'function') {
        showToast('Data UMKM berhasil diperbarui.');
      }
    } catch (error) {
      if (typeof showToast === 'function') {
        showToast(error.message || 'Data UMKM belum dapat disimpan.');
      }

      if (button) {
        button.disabled = false;
        button.textContent = 'Simpan Data Toko';
      }
    }
  }

  document.addEventListener(
    'submit',
    event => {
      if (event.target?.id !== 'storeManagementForm') {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      submitStore(event.target);
    },
    true
  );

  document.addEventListener(
    'click',
    event => {
      const button = event.target.closest(
        '[data-store-manage-action]'
      );

      if (!button) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const action = button.dataset.storeManageAction;

      if (action === 'orders') {
        window.openSellerCommerceOrders?.();
      } else if (action === 'products') {
        if (typeof openSellerProducts === 'function') {
          openSellerProducts();
        }
      } else if (action === 'profile') {
        if (typeof openAccountEditInfo === 'function') {
          openAccountEditInfo();
        }
      }
    },
    true
  );

  if (typeof openSellerStore === 'function') {
    openSellerStore = function managedSellerStore() {
      openStoreManagement();
    };
  }

  window.openStoreManagement = openStoreManagement;
})();
