(function () {
  'use strict';
  const base = window.FREE2DO_CONFIG.API_BASE_URL;
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  async function request(path, options = {}) {
    const token = localStorage.getItem('token');
    const isForm = options.body instanceof FormData;
    const body = options.body && !isForm && typeof options.body !== 'string'
      ? JSON.stringify(options.body) : options.body;
    const response = await fetch(`${base}${path}`, {
      ...options, body,
      headers: { ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401 && token) localStorage.removeItem('token');
      const detail = payload?.detail;
      throw new Error(typeof detail === 'string' ? detail : 'Yêu cầu thất bại. Vui lòng thử lại.');
    }
    return payload;
  }
  async function requireUser() {
    if (!localStorage.getItem('token')) { location.href = '../log-in.html'; throw new Error('Vui lòng đăng nhập.'); }
    const me = await request('/auth/me');
    if (me.requires_recovery_email) {
      location.href = '../recovery-email.html';
      throw new Error('Cần xác minh email khôi phục.');
    }
    if (me.account_type !== 'user' || me.role === 'business') {
      location.href = me.role === 'business' ? '../Demo Trang Business/business-home.html' : '../dashboard.html';
      throw new Error('Tài khoản không phải người dùng.');
    }
    document.querySelectorAll('.nav-name').forEach(el => { el.textContent = me.name; });
    document.querySelectorAll('.nav-avatar').forEach(el => {
      if (me.avatar_url) el.innerHTML = `<img src="${escapeHTML(me.avatar_url)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      else el.textContent = me.name?.[0]?.toUpperCase() || '?';
    });
    return me;
  }
  document.addEventListener('click', e => {
    if (e.target.closest('a.logout')) { e.preventDefault(); localStorage.removeItem('token'); location.href = '../log-in.html'; }
  });
  window.toggleUserMenu = event => {
    event.stopPropagation();
    document.getElementById('user-dropdown')?.classList.toggle('open');
  };
  window.CustomerAPI = { request, requireUser, escapeHTML,
    price: value => value == null ? 'Chưa cập nhật' : `${Number(value).toLocaleString('vi-VN')} ₫`,
    hours: (a, b) => !a && !b ? 'Chưa cập nhật' : [a, b].filter(Boolean).map(v => new Date(v).toLocaleString('vi-VN')).join(' – ') };
})();
