'use strict';

/* =========================================================
   PASAR UMKM - SOCIAL EXPERIENCE V3
   Presentation-only controller. It does not own social APIs,
   chat, commerce, or persistence. Existing functional modules
   remain the source of truth.
   ========================================================= */

(() => {
  if (window.PasarSocialExperience?.version === '3.0') {
    return;
  }

  const P3 = {
    scheduled: false,
    observer: null
  };

  function roleName() {
    const role = String(
      typeof STATE !== 'undefined'
        ? STATE.user?.role || 'buyer'
        : 'buyer'
    ).toLowerCase();

    if (role === 'seller' || role === 'admin') {
      return role;
    }

    return 'buyer';
  }

  function scheduleUpgrade() {
    if (P3.scheduled) {
      return;
    }

    P3.scheduled = true;

    requestAnimationFrame(() => {
      P3.scheduled = false;
      upgradeCurrentSurface();
    });
  }

  function upgradeOwnProfile(page) {
    if (!page || page.dataset.p3Upgraded === 'true') {
      return;
    }

    page.dataset.p3Upgraded = 'true';
    page.dataset.p3Role = roleName();

    page
      .querySelectorAll('.social-account-top-button')
      .forEach(button => {
        if (!button.hasAttribute('aria-label')) {
          button.setAttribute('aria-label', 'Aksi profil');
        }
      });

    page
      .querySelectorAll('.social-account-stat')
      .forEach(stat => {
        if (stat.dataset.socialAction) {
          stat.setAttribute('role', 'button');
          stat.setAttribute('tabindex', '0');
        }
      });

    const sellerEntry = page.querySelector(
      '.social-account-commerce'
    );

    if (sellerEntry) {
      sellerEntry.setAttribute(
        'aria-label',
        'Buka Seller Center'
      );

      const title = sellerEntry.querySelector(
        '.social-account-commerce-copy strong'
      );

      const subtitle = sellerEntry.querySelector(
        '.social-account-commerce-copy span'
      );

      if (title) {
        title.textContent = 'Seller Center';
      }

      if (subtitle) {
        subtitle.textContent =
          'Kelola produk, pesanan, dan profil toko';
      }
    }

    const avatarEdit = page.querySelector(
      '.social-account-avatar-add'
    );

    avatarEdit?.setAttribute(
      'aria-label',
      'Ubah foto dan profil'
    );

    page
      .querySelectorAll('.social-account-tab')
      .forEach(tab => {
        tab.setAttribute(
          'aria-pressed',
          String(tab.classList.contains('active'))
        );
      });
  }

  function upgradePublicProfile(page) {
    if (!page || page.dataset.p3Upgraded === 'true') {
      return;
    }

    page.dataset.p3Upgraded = 'true';
    page.dataset.p3Role =
      page.dataset.storeId
        ? 'seller'
        : 'buyer';

    const storeCard = page.querySelector(
      '.social-profile-store-card'
    );

    if (storeCard) {
      storeCard.setAttribute(
        'aria-label',
        'Lihat produk toko'
      );

      const copy = storeCard.querySelector(
        '.social-profile-store-copy strong'
      );

      if (copy && !copy.dataset.p3Original) {
        copy.dataset.p3Original = copy.textContent.trim();
        copy.textContent = `Kunjungi ${copy.textContent.trim()}`;
      }
    }

    page
      .querySelectorAll('.social-profile-stat')
      .forEach(stat => {
        if (stat.dataset.socialAction) {
          stat.setAttribute('aria-pressed', 'false');
        }
      });

    page
      .querySelectorAll('.social-profile-action')
      .forEach(button => {
        const action = button.dataset.socialAction;

        if (action === 'toggle-follow') {
          button.setAttribute(
            'aria-label',
            button.classList.contains('is-following')
              ? 'Berhenti mengikuti akun'
              : 'Ikuti akun'
          );
        }

        if (action === 'message-user') {
          button.setAttribute(
            'aria-label',
            'Kirim pesan ke akun ini'
          );
        }
      });

    page
      .querySelectorAll('.social-profile-tab')
      .forEach(tab => {
        tab.setAttribute(
          'aria-pressed',
          String(tab.classList.contains('active'))
        );
      });
  }

  function upgradeComments(sheet) {
    if (!sheet || sheet.dataset.p3Upgraded === 'true') {
      return;
    }

    sheet.dataset.p3Upgraded = 'true';
    document.body.classList.add('p3-comments-open');

    /*
     * The old permanent emoji rail generated seven third-party
     * Twemoji requests every time comments opened. Native keyboard
     * emoji remains available without consuming vertical space.
     */
    sheet.querySelector('.post-comment-reactions')?.remove();

    const list = sheet.querySelector('.post-comments-list');
    const title = sheet.querySelector(':scope > h2');
    const count = list
      ? list.querySelectorAll(
          '.post-comment-thread, .post-comment-item[data-comment-id]'
        ).length
      : 0;

    if (title && count > 0 && !title.querySelector('.p3-comment-count')) {
      const badge = document.createElement('span');
      badge.className = 'p3-comment-count';
      badge.textContent = String(count);
      title.appendChild(badge);
    }

    sheet
      .querySelectorAll('.post-comment-name, .post-comment-avatar')
      .forEach(target => {
        target.setAttribute('role', 'button');
        target.setAttribute('tabindex', '0');
        target.setAttribute('aria-label', 'Buka profil pengguna');
      });

    sheet
      .querySelectorAll('[data-action="comment-delete"]')
      .forEach(button => {
        button.setAttribute('aria-label', 'Hapus komentar');
        button.setAttribute('title', 'Hapus komentar');
      });

    sheet
      .querySelectorAll('[data-action="comment-reply"]')
      .forEach(button => {
        button.setAttribute('aria-label', 'Balas komentar');
      });

    const input = sheet.querySelector('.post-comment-input');
    if (input) {
      input.setAttribute('enterkeyhint', 'send');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('spellcheck', 'true');
    }

    const send = sheet.querySelector('.post-comment-send');
    send?.setAttribute('title', 'Kirim komentar');
  }

  function upgradeNotifications(page) {
    if (!page || page.dataset.p3Upgraded === 'true') {
      return;
    }

    page.dataset.p3Upgraded = 'true';

    const readAll = page.querySelector(
      '.notification-read-all'
    );

    if (readAll) {
      readAll.textContent = 'Baca semua';
      readAll.setAttribute(
        'aria-label',
        'Tandai semua notifikasi sudah dibaca'
      );
    }

    page
      .querySelectorAll('.notification-row')
      .forEach(row => {
        const title = row
          .querySelector('.notification-copy-main strong')
          ?.textContent
          ?.trim();

        const message = row
          .querySelector('.notification-message')
          ?.textContent
          ?.trim();

        row.setAttribute(
          'aria-label',
          [title, message].filter(Boolean).join('. ')
        );
      });
  }

  function upgradeStoryStrip(section) {
    if (!section || section.dataset.p3Upgraded === 'true') {
      return;
    }

    section.dataset.p3Upgraded = 'true';

    section
      .querySelectorAll('.story-item')
      .forEach(item => {
        if (!item.hasAttribute('aria-label')) {
          item.setAttribute('aria-label', 'Buka cerita');
        }
      });
  }

  function upgradeStoryViewer(viewer) {
    if (!viewer || viewer.dataset.p3Upgraded === 'true') {
      return;
    }

    viewer.dataset.p3Upgraded = 'true';
    viewer.setAttribute('role', 'dialog');
    viewer.setAttribute('aria-modal', 'true');
    viewer.setAttribute('aria-label', 'Cerita');

    viewer
      .querySelector('.story-viewer-close')
      ?.setAttribute('aria-label', 'Tutup cerita');

    viewer
      .querySelector('.story-viewer-more')
      ?.setAttribute('aria-label', 'Opsi cerita');

    viewer
      .querySelectorAll('.story-action-button')
      .forEach(button => {
        if (button.hasAttribute('aria-label')) {
          return;
        }

        const icon = button.querySelector('i')?.className || '';

        if (icon.includes('heart')) {
          button.setAttribute('aria-label', 'Sukai cerita');
        } else if (icon.includes('chat')) {
          button.setAttribute('aria-label', 'Lihat komentar cerita');
        } else if (icon.includes('paper-plane') || icon.includes('share')) {
          button.setAttribute('aria-label', 'Bagikan cerita');
        } else {
          button.setAttribute('aria-label', 'Aksi cerita');
        }
      });

    viewer
      .querySelector('.story-comment-input')
      ?.setAttribute('enterkeyhint', 'send');
  }

  function upgradeReels(page) {
    if (!page || page.dataset.p3Upgraded === 'true') {
      return;
    }

    page.dataset.p3Upgraded = 'true';

    page
      .querySelectorAll('.reel-card')
      .forEach(card => {
        const video = card.querySelector('video');
        if (video) {
          video.setAttribute('playsinline', '');
          video.setAttribute('preload', 'metadata');
        }
      });

    page
      .querySelectorAll('.reel-author')
      .forEach(author => {
        author.setAttribute('aria-label', 'Buka profil pembuat reels');
      });

    page
      .querySelectorAll('.reel-action')
      .forEach(button => {
        if (button.hasAttribute('aria-label')) {
          return;
        }

        const icon = button.querySelector('i')?.className || '';

        if (icon.includes('heart')) {
          button.setAttribute('aria-label', 'Sukai reels');
        } else if (icon.includes('chat')) {
          button.setAttribute('aria-label', 'Komentar reels');
        } else {
          button.setAttribute('aria-label', 'Bagikan reels');
        }
      });
  }

  function upgradeFollowSheet(sheet) {
    if (!sheet || sheet.dataset.p3Upgraded === 'true') {
      return;
    }

    sheet.dataset.p3Upgraded = 'true';

    sheet
      .querySelectorAll('.social-follow-user')
      .forEach(row => {
        if (!row.hasAttribute('aria-label')) {
          const name = row
            .querySelector('.social-follow-copy strong')
            ?.textContent
            ?.trim();

          row.setAttribute(
            'aria-label',
            name
              ? `Buka profil ${name}`
              : 'Buka profil pengguna'
          );
        }
      });

    sheet
      .querySelectorAll('.social-follow-unfollow')
      .forEach(button => {
        button.setAttribute('aria-label', 'Berhenti mengikuti pengguna');
      });
  }

  function upgradePostViewer(page) {
    if (!page || page.dataset.p3Upgraded === 'true') {
      return;
    }

    page.dataset.p3Upgraded = 'true';

    page
      .querySelector('.post-viewer-back')
      ?.setAttribute('aria-label', 'Kembali ke profil');
  }

  function cleanBodyState() {
    if (!document.querySelector('.post-comments-sheet')) {
      document.body.classList.remove('p3-comments-open');
    }
  }

  function syncTabStates() {
    document
      .querySelectorAll(
        '.social-account-page[data-p3-upgraded="true"] .social-account-tab, ' +
        '.social-universal-profile[data-p3-upgraded="true"] .social-profile-tab'
      )
      .forEach(tab => {
        tab.setAttribute(
          'aria-pressed',
          String(tab.classList.contains('active'))
        );
      });
  }

  function upgradeCurrentSurface() {
    document
      .querySelectorAll(
        '.social-account-page:not(.public-seller-profile):not(.social-universal-profile)'
      )
      .forEach(upgradeOwnProfile);

    document
      .querySelectorAll('.social-universal-profile')
      .forEach(upgradePublicProfile);

    document
      .querySelectorAll('.post-comments-sheet')
      .forEach(upgradeComments);

    document
      .querySelectorAll('.social-notifications-page')
      .forEach(upgradeNotifications);

    document
      .querySelectorAll('.stories-section:not([hidden])')
      .forEach(upgradeStoryStrip);

    document
      .querySelectorAll('.story-viewer-v2')
      .forEach(upgradeStoryViewer);

    document
      .querySelectorAll('.reels-page')
      .forEach(upgradeReels);

    document
      .querySelectorAll('.social-follow-sheet')
      .forEach(upgradeFollowSheet);

    document
      .querySelectorAll('.post-viewer-page')
      .forEach(upgradePostViewer);

    syncTabStates();
    cleanBodyState();
  }

  document.addEventListener(
    'keydown',
    event => {
      const target = event.target.closest?.(
        '.post-comments-sheet[data-p3-upgraded="true"] ' +
        '.post-comment-name[role="button"], ' +
        '.post-comments-sheet[data-p3-upgraded="true"] ' +
        '.post-comment-avatar[role="button"]'
      );

      if (
        !target ||
        (event.key !== 'Enter' && event.key !== ' ')
      ) {
        return;
      }

      event.preventDefault();
      target.click();
    }
  );

  document.addEventListener(
    'click',
    event => {
      if (
        event.target.closest?.(
          '.social-account-tab, .social-profile-tab, ' +
          '[data-social-action="toggle-follow"]'
        )
      ) {
        requestAnimationFrame(syncTabStates);
      }
    },
    true
  );

  P3.observer = new MutationObserver(() => {
    scheduleUpgrade();
  });

  P3.observer.observe(
    document.body,
    {
      childList: true,
      subtree: true
    }
  );

  window.PasarSocialExperience = Object.freeze({
    version: '3.0',
    upgrade: upgradeCurrentSurface
  });

  scheduleUpgrade();
})();
