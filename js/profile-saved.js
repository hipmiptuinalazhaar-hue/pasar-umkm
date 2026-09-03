'use strict';

/* =========================================================
   PASAR UMKM - SAVED PROFILE TAB
   3-column saved grid + full scrollable saved viewer.
   Loaded after app.js so stable core code stays untouched.
   ========================================================= */

(() => {
  if (typeof createAccountTabContent !== 'function') {
    console.error(
      '[Pasar UMKM] Saved tab patch gagal: createAccountTabContent tidak ditemukan.'
    );
    return;
  }

  const originalCreateAccountTabContent =
    createAccountTabContent;


  function getSavedItems() {
    return DATA.posts.filter(post =>
      STATE.savedPosts.has(
        String(post.id || '')
      )
    );
  }


  function getSavedPreviewImage(item) {
    if (item?.product) {
      return (
        item.product.image ||
        item.product.image_url ||
        ASSETS.logo
      );
    }

    return (
      item?.media?.src ||
      ASSETS.logo
    );
  }


  function getSavedPreviewAlt(item) {
    if (item?.product) {
      return (
        item.product.name ||
        'Produk tersimpan'
      );
    }

    return (
      item?.media?.alt ||
      item?.caption ||
      'Postingan tersimpan'
    );
  }


  function renderSavedItems() {
    const savedItems =
      getSavedItems();

    if (!savedItems.length) {
      return `
        <section class="social-account-empty">

          <div class="social-account-empty-icon">
            <i class="ph ph-bookmark-simple"></i>
          </div>

          <strong>
            Belum ada yang disimpan
          </strong>

          <p>
            Postingan dan produk yang Anda simpan
            akan tampil di sini.
          </p>

        </section>
      `;
    }

    return `
      <div
        class="social-account-grid social-account-post-grid saved-profile-grid"
      >

        ${savedItems
          .map(item => `
            <button
              type="button"
              class="social-account-grid-item social-account-post-item saved-profile-item"
              data-saved-item-id="${escapeHTML(
                item.id || ''
              )}"
              aria-label="Buka ${escapeHTML(
                item.product?.name ||
                item.caption ||
                'item tersimpan'
              )}"
            >

              <img
                src="${escapeHTML(
                  getSavedPreviewImage(item)
                )}"
                alt="${escapeHTML(
                  getSavedPreviewAlt(item)
                )}"
                loading="lazy"
                decoding="async"
              >

              <span class="social-account-grid-overlay">
                <i class="ph ${
                  item.product
                    ? 'ph-shopping-bag'
                    : 'ph-images'
                }"></i>
              </span>

            </button>
          `)
          .join('')}

      </div>
    `;
  }


  createAccountTabContent =
    function patchedCreateAccountTabContent(tab) {
      if (tab !== 'saved') {
        return originalCreateAccountTabContent(tab);
      }

      return renderSavedItems();
    };


  function openSavedItemViewer(
    selectedItemId
  ) {
    const savedItems =
      getSavedItems();

    const selectedItem =
      savedItems.find(item =>
        String(item.id || '') ===
        String(selectedItemId || '')
      );

    if (!selectedItem) {
      showToast(
        'Item tersimpan tidak ditemukan.'
      );
      return;
    }

    const orderedItems = [
      selectedItem,
      ...savedItems.filter(item =>
        String(item.id || '') !==
        String(selectedItem.id || '')
      )
    ];

    closeBottomSheet();
    closeSideMenu();

    STATE.activeNav = 'account';
    updateNavigation();

    const app =
      document.querySelector('.app');

    app?.classList.add(
      'account-profile-active'
    );

    if (DOM.storiesSection) {
      DOM.storiesSection.hidden = true;
    }

    if (DOM.homeDiscovery) {
      DOM.homeDiscovery.hidden = true;
    }

    if (!DOM.feed) {
      return;
    }

    DOM.feed.innerHTML = `
      <section class="post-viewer-page saved-post-viewer">

        <header class="post-viewer-header">

          <button
            type="button"
            class="post-viewer-back"
            data-action="saved-viewer-back"
            aria-label="Kembali ke item tersimpan"
          >
            <i class="ph ph-arrow-left"></i>
          </button>

          <div class="post-viewer-header-copy">
            <strong>
              Tersimpan
            </strong>
          </div>

        </header>

        <div class="post-viewer-list">

          ${orderedItems
            .map(item => `
              <div
                class="post-viewer-item"
                data-viewer-post-id="${escapeHTML(
                  item.id || ''
                )}"
              >
                ${createPostTemplate(item)}
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


  async function reopenSavedTab() {
    await openAccount();

    const savedButton =
      document.querySelector(
        '.social-account-tab[data-tab="saved"]'
      );

    if (savedButton) {
      switchAccountTab(
        'saved',
        savedButton
      );
    }
  }


  document.addEventListener(
    'click',
    event => {
      const backButton =
        event.target.closest(
          '[data-action="saved-viewer-back"]'
        );

      if (backButton) {
        event.preventDefault();
        event.stopImmediatePropagation();

        reopenSavedTab();
        return;
      }

      const savedItem =
        event.target.closest(
          '.saved-profile-item[data-saved-item-id]'
        );

      if (!savedItem) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      openSavedItemViewer(
        savedItem.dataset.savedItemId
      );
    }
  );
})();

/* P4.12 loader: kept separate so the saved-tab patch can fail independently. */
(() => {
  if (!document.querySelector('link[data-chat-whatsapp-v5]')) {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = 'css/chat-whatsapp-v5.css?v=5.0';
    style.dataset.chatWhatsappV5 = 'true';
    document.head.appendChild(style);
  }

  if (!document.querySelector('script[data-chat-whatsapp-v5]')) {
    const script = document.createElement('script');
    script.src = 'js/chat-whatsapp-v5.js?v=5.0';
    script.defer = true;
    script.dataset.chatWhatsappV5 = 'true';
    document.body.appendChild(script);
  }
})();

/* =========================================================
   UI-P2 COMMERCE BOOTSTRAP
   Tiny always-on intent router. Heavy commerce JS/CSS are
   fetched only when a commerce route is actually requested.
   ========================================================= */

window.__PASAR_COMMERCE_V2__ = true;

(() => {
  const intentSelector = [
    '[data-nav="cart"]',
    '[data-nav="sell"]',
    '[data-action="sell"]',
    '[data-action="product-create"]',
    '[data-action="product-edit"]',
    '[data-action="product-detail"]',
    '[data-action="buy-now"]',
    '[data-menu-action="store"]',
    '[data-menu-action="seller-products"]',
    '[data-menu-action="orders"]',
    '[data-function-action="checkout-open"]',
    '[data-function-action="seller-orders-open"]',
    '[data-function-action="seller-products-open"]',
    '[data-function-action="seller-profile-edit"]',
    '[data-store-manage-action="edit"]',
    '[data-store-manage-action="orders"]',
    '[data-store-manage-action="products"]'
  ].join(',');

  let commercePromise = null;

  function commerceTarget(event) {
    return event.target?.closest?.(intentSelector) || null;
  }

  function ensureStyle() {
    const existing = document.querySelector('link[data-commerce-v2-style]');
    if (existing) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = 'css/commerce-experience-v2.css?v=2.0';
      style.dataset.commerceV2Style = 'true';
      style.onload = () => resolve();
      style.onerror = () => reject(new Error('Commerce stylesheet gagal dimuat.'));
      document.head.appendChild(style);
    });
  }

  function ensureScript() {
    if (window.PasarCommerce?.version === '2.0') {
      return Promise.resolve(window.PasarCommerce);
    }

    const existing = document.querySelector('script[data-commerce-v2-script]');
    if (existing) {
      return new Promise((resolve, reject) => {
        const started = Date.now();
        const timer = window.setInterval(() => {
          if (window.PasarCommerce?.version === '2.0') {
            window.clearInterval(timer);
            resolve(window.PasarCommerce);
          } else if (Date.now() - started > 5000) {
            window.clearInterval(timer);
            reject(new Error('Commerce module belum siap.'));
          }
        }, 30);
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'js/commerce-experience-v2.js?v=2.0';
      script.dataset.commerceV2Script = 'true';
      script.onload = () => {
        if (window.PasarCommerce?.version === '2.0') {
          resolve(window.PasarCommerce);
        } else {
          reject(new Error('Commerce module tidak terinisialisasi.'));
        }
      };
      script.onerror = () => reject(new Error('Commerce module gagal dimuat.'));
      document.body.appendChild(script);
    });
  }

  function loadCommerce() {
    if (!commercePromise) {
      commercePromise = Promise.all([
        ensureStyle(),
        ensureScript()
      ]).then(([, module]) => module).catch(error => {
        commercePromise = null;
        throw error;
      });
    }

    return commercePromise;
  }

  document.addEventListener('pointerdown', event => {
    if (!commerceTarget(event)) return;
    loadCommerce().catch(() => {});
  }, { capture: true, passive: true });

  document.addEventListener('click', async event => {
    const target = commerceTarget(event);
    if (!target) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    try {
      const commerce = await loadCommerce();
      await commerce.handleIntent(target);
    } catch (error) {
      console.error('[Pasar UMKM] Commerce bootstrap error:', error);
      if (typeof showToast === 'function') {
        showToast('Fitur perdagangan belum dapat dibuka.');
      }
    }
  }, true);
})();
