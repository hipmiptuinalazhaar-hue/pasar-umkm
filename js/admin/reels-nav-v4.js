(() => {
  if (window.__PASAR_REELS_ADMIN_NAV_V4__) return;
  window.__PASAR_REELS_ADMIN_NAV_V4__ = true;

  function mount() {
    const sidebar = document.querySelector('.sidebar-nav');
    if (!sidebar || sidebar.querySelector('[data-reels-admin-link]')) return false;
    const group = [...sidebar.querySelectorAll('.sidebar-nav-group')].find(section => /Marketplace/i.test(section.textContent || '')) || sidebar.lastElementChild;
    const items = group?.querySelector('.sidebar-nav-items') || sidebar;
    const link = document.createElement('a');
    link.className = 'nav-link';
    link.href = '/admin/reels.html';
    link.dataset.reelsAdminLink = 'true';
    link.innerHTML = '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 9 5 3-5 3Z"/></svg><span class="nav-label">Moderasi Reels</span>';
    items.appendChild(link);
    return true;
  }

  const observer = new MutationObserver(() => mount());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();
