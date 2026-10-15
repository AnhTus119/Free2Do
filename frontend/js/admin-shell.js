/*
 * Khung dùng chung cho các trang operator: menu người dùng (Hồ sơ cá nhân / Đăng xuất)
 * và nút Đăng xuất đưa về trang đăng nhập chung log-in.html.
 */
(function () {
  'use strict';

  // Bộ icon SVG nét đều (thay emoji/ô trống) cho sidebar, thẻ số liệu và menu người dùng.
  const svg = path => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
  const ICONS = {
    dashboard: svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
    customers: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 20c0-2.6-1.2-4.8-3-5.9"/>'),
    businesses: svg('<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9h18M9 20v-6h6v6"/>'),
    activities: svg('<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="m9 15 2 2 4-4"/>'),
    management: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'),
    logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>'),
    check: svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'),
    alert: svg('<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.5h0"/>'),
    lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>'),
  };
  const NAV_ICON = [['dashboard.html', 'dashboard'], ['customers.html', 'customers'], ['businesses.html', 'businesses'], ['activities.html', 'activities'], ['management.html', 'management'], ['operator-settings.html', 'settings'], ['log-in.html', 'logout']];
  const STAT_ICON = [[/khóa|tạm ngưng/i, 'lock'], [/chờ|kiểm tra|cần/i, 'alert'], [/đang|hoạt động bình thường|đang diễn ra/i, 'check'], [/doanh nghiệp/i, 'businesses'], [/hoạt động/i, 'activities'], [/khách hàng/i, 'customers']];

  function decorate() {
    document.querySelectorAll('.sidebar .nav-item').forEach(item => {
      const match = NAV_ICON.find(([href]) => (item.getAttribute('href') || '').startsWith(href));
      const slot = item.querySelector('.ic');
      if (match && slot) slot.innerHTML = ICONS[match[1]];
    });
    // Nhóm menu theo nghiệp vụ: Quản lý (dữ liệu) và Cấu hình (hệ thống).
    const group = document.querySelector('.sidebar .nav-group');
    const firstManaged = group?.querySelector('a[href="customers.html"]');
    if (firstManaged && !group.querySelector('.nav-label')) {
      firstManaged.insertAdjacentHTML('beforebegin', '<div class="nav-label">Quản lý</div>');
      group.querySelector('a[href="management.html"]')?.insertAdjacentHTML('beforebegin', '<div class="nav-label">Cấu hình</div>');
    }
    document.querySelectorAll('.stat-card').forEach(card => {
      const icon = card.querySelector('.stat-icon');
      const label = card.querySelector('.stat-label')?.textContent || '';
      const match = STAT_ICON.find(([pattern]) => pattern.test(label));
      if (icon && match) icon.innerHTML = ICONS[match[1]];
    });
  }

  function logout(event) {
    event?.preventDefault();
    localStorage.removeItem('token');
    window.FREE2DO_CACHE?.clear();
    window.location.href = 'log-in.html';
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .header-right .who{position:relative;cursor:pointer;}
      .f2d-user-menu{position:absolute;top:calc(100% + 10px);right:0;min-width:200px;background:#fff;border:1px solid #EDE3D2;border-radius:14px;box-shadow:0 16px 44px rgba(40,25,10,.16);padding:6px;z-index:3000;opacity:0;transform:translateY(-6px);pointer-events:none;transition:opacity .16s ease,transform .16s ease;}
      .f2d-user-menu.show{opacity:1;transform:none;pointer-events:auto;}
      .f2d-user-menu a{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;color:#2B2118;text-decoration:none;font:600 13.5px Inter,sans-serif;transition:background .12s ease;}
      .f2d-user-menu a:hover{background:#FBF5EA;}
      .f2d-user-menu a.danger{color:#C4506A;}
      .f2d-user-menu svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
      @media (prefers-reduced-motion:reduce){.f2d-user-menu{transition:none;}}
    `;
    document.head.appendChild(style);
  }

  function buildUserMenu() {
    const who = document.querySelector('.header-right .who');
    if (!who || who.querySelector('.f2d-user-menu')) return;
    if (!who.querySelector('.chev')) who.insertAdjacentHTML('beforeend', '<div class="chev">▾</div>');
    const menu = document.createElement('div');
    menu.className = 'f2d-user-menu';
    menu.innerHTML = `<a href="operator-settings.html#profile">${ICONS.user}Hồ sơ cá nhân</a><a href="log-in.html" class="danger" data-logout>${ICONS.logout}Đăng xuất</a>`;
    who.appendChild(menu);
    who.addEventListener('click', event => {
      if (event.target.closest('.f2d-user-menu a')) return;
      menu.classList.toggle('show');
    });
    document.addEventListener('click', event => { if (!who.contains(event.target)) menu.classList.remove('show'); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') menu.classList.remove('show'); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    injectStyles();
    decorate();
    buildUserMenu();
    document.querySelectorAll('a[data-logout]').forEach(link => link.addEventListener('click', logout));
  });
})();
