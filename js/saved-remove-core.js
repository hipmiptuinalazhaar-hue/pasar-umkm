'use strict';

/* =========================================================
   PASAR UMKM - SAVED REMOVE CORE
   Menambahkan fungsi hapus pada viewer Tersimpan tanpa
   membongkar modul Saved yang sudah stabil.
   ========================================================= */

(() => {
  function decorateSavedViewer() {
    document
      .querySelectorAll(
        '.saved-post-viewer .post-viewer-item[data-viewer-post-id]'
      )
      .forEach(item => {
        if (item.querySelector('[data-saved-remove-id]')) {
          return;
        }

        const postId = String(
          item.dataset.viewerPostId || ''
        ).trim();

        if (!postId) {
          return;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'menu-sheet-btn saved-remove-button';
        button.dataset.savedRemoveId = postId;
        button.innerHTML = `
          <i class="ph ph-bookmark-simple-slash" aria-hidden="true"></i>
          <span>Hapus dari Tersimpan</span>
        `;

        item.appendChild(button);
      });
  }

  function reopenSavedWhenEmpty() {
    const remaining = document.querySelector(
      '.saved-post-viewer .post-viewer-item[data-viewer-post-id]'
    );

    if (remaining) {
      return;
    }

    const back = document.querySelector(
      '[data-action="saved-viewer-back"]'
    );

    back?.click();
  }

  document.addEventListener(
    'click',
    event => {
      const button = event.target.closest(
        '[data-saved-remove-id]'
      );

      if (!button) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const postId = String(
        button.dataset.savedRemoveId || ''
      ).trim();

      if (!postId) {
        return;
      }

      if (!STATE?.savedPosts?.has(postId)) {
        button.closest('.post-viewer-item')?.remove();
        reopenSavedWhenEmpty();
        return;
      }

      button.disabled = true;
      const label = button.querySelector('span');

      if (label) {
        label.textContent = 'Menghapus...';
      }

      if (typeof toggleSave === 'function') {
        toggleSave(postId);
      }

      window.setTimeout(() => {
        const stillSaved = Boolean(
          STATE?.savedPosts?.has(postId)
        );

        if (!stillSaved) {
          button.closest('.post-viewer-item')?.remove();
          reopenSavedWhenEmpty();
          return;
        }

        button.disabled = false;

        if (label) {
          label.textContent = 'Hapus dari Tersimpan';
        }
      }, 700);
    },
    true
  );

  const observer = new MutationObserver(
    decorateSavedViewer
  );

  observer.observe(
    document.body,
    {
      childList: true,
      subtree: true
    }
  );

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      decorateSavedViewer,
      { once: true }
    );
  } else {
    decorateSavedViewer();
  }
})();
