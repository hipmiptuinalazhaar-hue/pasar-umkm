'use strict';

/* =========================================================
   PASAR UMKM - SAVED PROFILE TAB
   Targeted extension loaded after app.js.
   Keeps the existing app.js untouched while activating
   the profile "Disimpan" tab from STATE.savedPosts.
   ========================================================= */

(() => {
  if (typeof createAccountTabContent !== 'function') {
    console.error('[Pasar UMKM] Saved tab patch gagal: createAccountTabContent tidak ditemukan.');
    return;
  }

  const originalCreateAccountTabContent =
    createAccountTabContent;

  createAccountTabContent = function patchedCreateAccountTabContent(tab) {
    if (tab !== 'saved') {
      return originalCreateAccountTabContent(tab);
    }

    const savedItems =
      DATA.posts.filter(post =>
        STATE.savedPosts.has(
          String(post.id || '')
        )
      );

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
      <div class="social-account-saved-feed">
        ${savedItems
          .map(item => createPostTemplate(item))
          .join('')}
      </div>
    `;
  };
})();
