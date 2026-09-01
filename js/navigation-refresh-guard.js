'use strict';

/* =========================================================
   PASAR UMKM - REFRESH NAVIGATION GUARD
   Deep link profil tetap bisa dibuka dari link yang dibagikan,
   tetapi refresh halaman tidak mengunci pengguna di profil yang
   sebelumnya dibuka dari dalam aplikasi.
   ========================================================= */

(() => {
  const hash = String(window.location.hash || '');

  if (!hash.startsWith('#profile=')) {
    return;
  }

  const navigationEntry =
    performance.getEntriesByType?.('navigation')?.[0] || null;

  const legacyReload =
    performance.navigation &&
    performance.navigation.type === 1;

  const isReload =
    navigationEntry?.type === 'reload' ||
    legacyReload;

  if (!isReload) {
    return;
  }

  history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}`
  );
})();
