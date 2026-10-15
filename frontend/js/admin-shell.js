/*
 * Khung dùng chung cho các trang operator: menu người dùng (Hồ sơ cá nhân / Đăng xuất)
 * và nút Đăng xuất đưa về trang đăng nhập chung log-in.html.
 */
(function () {
  'use strict';

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
    menu.innerHTML = '<a href="operator-settings.html#profile">👤 Hồ sơ cá nhân</a><a href="log-in.html" class="danger" data-logout>↩ Đăng xuất</a>';
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
    buildUserMenu();
    document.querySelectorAll('a[data-logout]').forEach(link => link.addEventListener('click', logout));
  });
})();
