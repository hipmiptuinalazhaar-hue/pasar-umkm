'use strict';

/* =========================================================
   PASAR UMKM - STORY RENDER FUNCTION FIX
   Seller/admin tetap dapat membuat cerita ketika belum ada
   cerita aktif. Renderer lama menyembunyikan seluruh section.
   ========================================================= */

(() => {
  if (
    typeof renderStories !== 'function' ||
    typeof createStoryTemplate !== 'function'
  ) {
    return;
  }

  renderStories = function functionalRenderStories() {
    if (!DOM.stories || !DOM.storiesSection) {
      return;
    }

    const stories = Array.isArray(DATA.stories)
      ? DATA.stories
      : [];

    const canCreate = Boolean(
      STATE.user &&
      (
        STATE.user.role === 'seller' ||
        STATE.user.role === 'admin'
      )
    );

    if (!stories.length && !canCreate) {
      DOM.stories.innerHTML = '';
      DOM.storiesSection.hidden = true;
      return;
    }

    DOM.storiesSection.hidden = false;

    const createButton = canCreate
      ? `
          <button
            type="button"
            class="story-item story-add"
            data-action="add-story"
            aria-label="Tambah cerita"
          >
            <span class="story-ring">
              <i class="ph ph-plus" aria-hidden="true"></i>
            </span>
            <span class="story-name">Cerita Anda</span>
          </button>
        `
      : '';

    DOM.stories.innerHTML =
      createButton +
      stories.map(createStoryTemplate).join('');
  };
})();
