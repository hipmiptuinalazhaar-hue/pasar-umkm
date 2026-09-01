'use strict';

/* =========================================================
   PASAR UMKM - SAVED PROFILE TAB
   Full saved item renderer + clickable saved viewer.
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
      <div class="post-viewer-list saved-profile-list">

        ${savedItems
          .map(item => `
            <div
              class="post-viewer-item saved-profile-item"
              data-saved-item-id="${escapeHTML(
                item.id || ''
              )}"
            >
              ${createPostTemplate(item)}
            </div>
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

    if (selectedItem.product?.id) {
      openProductDetail(
        selectedItem.product.id
      );
      return;
    }

    const savedPosts =
      savedItems.filter(item =>
        !item.product
      );

    const orderedPosts = [
      selectedItem,
      ...savedPosts.filter(item =>
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

          ${orderedPosts
            .map(post => `
              <div
                class="post-viewer-item"
                data-viewer-post-id="${escapeHTML(
                  post.id || ''
                )}"
              >
                ${createPostTemplate(post)}
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

      const interactiveTarget =
        event.target.closest(
          'button, a, input, textarea, select, ' +
          '[data-action], [data-menu-action]'
        );

      if (
        interactiveTarget &&
        interactiveTarget !== savedItem
      ) {
        return;
      }

      openSavedItemViewer(
        savedItem.dataset.savedItemId
      );
    }
  );
})();
