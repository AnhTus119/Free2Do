(function () {
  'use strict';
  const base = window.FREE2DO_CONFIG.API_BASE_URL;
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  async function request(path, options = {}) {
    const token = localStorage.getItem('token');
    const isForm = options.body instanceof FormData;
    const body = options.body && !isForm && typeof options.body !== 'string'
      ? JSON.stringify(options.body) : options.body;
    const isRead = !options.method || String(options.method).toUpperCase() === 'GET';
    let response;
    // Render gói Free có thể đang "ngủ" nên lần gọi đầu hay bị rớt kết nối: yêu cầu đọc dữ liệu
    // được thử lại 1 lần trước khi báo lỗi. Thời gian chờ 45s để đủ cho cold-start.
    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      try {
        response = await fetch(`${base}${path}`, {
          ...options, body,
          signal: options.signal || controller.signal,
          headers: { ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
        });
        break;
      } catch (error) {
        if (error.name === 'AbortError') throw new Error('Máy chủ phản hồi quá lâu. Vui lòng thử lại.');
        if (isRead && attempt === 0) { await new Promise(resolve => setTimeout(resolve, 800)); continue; }
        throw new Error('Không thể kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại.');
      } finally {
        clearTimeout(timeout);
      }
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401 && token) localStorage.removeItem('token');
      const detail = payload?.detail;
      const message = Array.isArray(detail)
        ? detail.map(item => item.msg).filter(Boolean).join(', ')
        : detail;
      const error = new Error(typeof message === 'string' ? message : 'Yêu cầu thất bại. Vui lòng thử lại.');
      error.status = response.status;
      throw error;
    }
    return payload;
  }
  async function requireUser() {
    if (!localStorage.getItem('token')) { location.href = '../log-in.html'; throw new Error('Vui lòng đăng nhập.'); }
    let me;
    try { me = await request('/auth/me'); }
    catch (error) {
      if (error.status === 401) location.href = '../log-in.html';
      throw error;
    }
    if (me.requires_recovery_email) {
      location.href = '../recovery-email.html';
      throw new Error('Cần xác minh email khôi phục.');
    }
    if (me.account_type !== 'user' || me.role === 'business') {
      location.href = me.role === 'business' ? '../Demo Trang Business/business-home.html' : '../dashboard.html';
      throw new Error('Tài khoản không phải người dùng.');
    }
    const username = me.username || me.name || '';
    document.querySelectorAll('.nav-name').forEach(el => { el.textContent = username; });
    document.querySelectorAll('.nav-avatar').forEach(el => {
      if (me.avatar_url) el.innerHTML = `<img src="${escapeHTML(me.avatar_url)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      else el.textContent = username[0]?.toUpperCase() || '?';
    });
    return me;
  }
  function logout() {
    ['token', 'access_token', 'user_token', 'operator_token'].forEach(key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
    location.replace(new URL('../log-in.html', location.href).href);
  }
  // Capture phase giúp đăng xuất vẫn chạy dù menu cha có onclick hoặc script khác
  // đóng dropdown trước khi sự kiện tới document.
  document.addEventListener('click', event => {
    if (!event.target.closest('.logout, [data-logout]')) return;
    event.preventDefault();
    event.stopPropagation();
    logout();
  }, true);
  window.toggleUserMenu = event => {
    event.stopPropagation();
    document.getElementById('user-dropdown')?.classList.toggle('open');
  };
  document.addEventListener('click', () => document.getElementById('user-dropdown')?.classList.remove('open'));
  const price = value => value == null ? 'Chưa cập nhật' : `${Number(value).toLocaleString('vi-VN')} ₫`;
  const priceLabel = (text, value) => {
    const label = String(text || '').trim();
    return label && !/^\d+(?:[.,]\d+)?$/.test(label) ? label : price(value ?? (label || null));
  };
  const hours = (a, b) => {
    const values = [a, b].filter(Boolean).map(value => new Date(value));
    if (!values.length) return 'Chưa cập nhật';
    const timeOnly = values.every(value => value.getFullYear() === 2000);
    return values.map(value => timeOnly
      ? value.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      : value.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })).join(' – ');
  };
  window.CustomerAPI = { request, requireUser, logout, escapeHTML, price, priceLabel, hours };
})();
