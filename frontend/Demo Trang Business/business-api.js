(() => {
  const config = window.FREE2DO_CONFIG;
  if (!config?.API_BASE_URL) throw new Error('Thiếu FREE2DO_CONFIG.API_BASE_URL');
  const base = config.API_BASE_URL.replace(/\/$/, '');

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = localStorage.getItem('token');
    if (options.auth !== false) {
      if (!token) {
        location.href = '../log-in.html';
        throw new Error('Vui lòng đăng nhập.');
      }
      headers.set('Authorization', `Bearer ${token}`);
    }
    const fetchOptions = { ...options, headers };
    delete fetchOptions.auth;
    if (fetchOptions.body && !(fetchOptions.body instanceof FormData) && typeof fetchOptions.body !== 'string') {
      headers.set('Content-Type', 'application/json');
      fetchOptions.body = JSON.stringify(fetchOptions.body);
    }
    const response = await fetch(`${base}${path}`, fetchOptions);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('token');
        location.href = '../log-in.html';
      }
      const detail = payload?.detail;
      throw new Error(typeof detail === 'string' ? detail : `Yêu cầu thất bại (${response.status}).`);
    }
    return payload;
  }

  async function requireBusiness() {
    const me = await request('/auth/me');
    if (me.role !== 'business') {
      location.href = me.account_type === 'operator'
        ? '../admin.html'
        : '../Demo Trang Customer/home.html';
      throw new Error('Tài khoản không có quyền Business.');
    }
    const profile = await request('/business/me');
    applyIdentity(me, profile);
    return { me, profile };
  }

  function applyIdentity(me, profile) {
    const name = profile.business_name || me.name || 'Doanh nghiệp';
    const initial = name.trim().charAt(0).toUpperCase() || 'B';
    document.querySelectorAll('[data-business-name]').forEach(node => { node.textContent = name; });
    document.querySelectorAll('[data-business-email]').forEach(node => { node.textContent = me.email || '—'; });
    document.querySelectorAll('[data-business-avatar]').forEach(node => {
      node.textContent = initial;
      if (profile.avatar_url) {
        node.style.backgroundImage = `url("${String(profile.avatar_url).replace(/"/g, '%22')}")`;
        node.style.backgroundSize = 'cover';
        node.style.backgroundPosition = 'center';
        node.setAttribute('aria-label', name);
      }
    });
  }

  function logout() {
    localStorage.removeItem('token');
    location.href = '../log-in.html';
  }

  function bindShell() {
    document.querySelectorAll('[data-logout]').forEach(link => link.addEventListener('click', event => {
      event.preventDefault();
      logout();
    }));
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }
  const formatNumber = value => Number(value || 0).toLocaleString('vi-VN');
  const formatMoney = activity => activity.price_text || (activity.price == null
    ? 'Miễn phí'
    : `${Number(activity.price).toLocaleString('vi-VN')} ₫`);
  const formatDate = value => value ? new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(new Date(value)) : '—';
  const formatTime = value => value ? new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(value)) : '—';
  const statusLabels = {
    active: 'Đang hiển thị', pending: 'Chờ duyệt', hidden: 'Đã ẩn', cancelled: 'Đã hủy'
  };
  const notify = (message, type = 'success') => {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:9999;max-width:360px;padding:13px 17px;border-radius:12px;color:#fff;font:600 13px Inter,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.18)';
      document.body.appendChild(toast);
    }
    toast.style.background = type === 'error' ? '#B42318' : '#287A52';
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { toast.hidden = true; }, 3200);
  };

  window.toggleMenu = event => {
    event?.stopPropagation();
    document.getElementById('nav-user-menu')?.classList.toggle('show');
  };
  window.toggleMobileMenu = () => document.getElementById('mobile-nav')?.classList.toggle('show');
  window.addEventListener('click', event => {
    if (!event.target.closest('.nav-who')) document.getElementById('nav-user-menu')?.classList.remove('show');
  });
  document.addEventListener('DOMContentLoaded', bindShell);

  window.BusinessAPI = {
    request, requireBusiness, applyIdentity, logout, escapeHTML, formatNumber,
    formatMoney, formatDate, formatTime, statusLabels, notify
  };
})();
