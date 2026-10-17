(() => {
  const config = window.FREE2DO_CONFIG;
  if (!config?.API_BASE_URL) throw new Error('Thiếu FREE2DO_CONFIG.API_BASE_URL');
  const base = config.API_BASE_URL.replace(/\/$/, '');

  // Mọi yêu cầu ghi đi qua F2D.mutate (js/main.js): khóa nút vừa bấm + toast thành công/thất bại.
  function request(path, options = {}) {
    const { toast, ...rest } = options;
    return window.F2D ? window.F2D.mutate(rest.method, path, () => send(path, rest), { toast }) : send(path, rest);
  }
  async function send(path, options = {}) {
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
    const cache = window.FREE2DO_CACHE;
    const isRead = !fetchOptions.method || String(fetchOptions.method).toUpperCase() === 'GET';
    if (isRead) { const hit = cache.get(path); if (hit !== undefined) return hit; } else cache.clear();
    if (fetchOptions.body && !(fetchOptions.body instanceof FormData) && typeof fetchOptions.body !== 'string') {
      headers.set('Content-Type', 'application/json');
      fetchOptions.body = JSON.stringify(fetchOptions.body);
    }
    const response = await fetch(`${base}${path}`, fetchOptions);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('token');
        cache.clear();
        location.href = '../log-in.html';
      }
      const detail = payload?.detail;
      throw new Error(typeof detail === 'string' ? detail : `Yêu cầu thất bại (${response.status}).`);
    }
    if (isRead) cache.set(path, payload);
    return payload;
  }

  async function requireBusiness() {
    const me = await request('/auth/me');
    if (me.requires_recovery_email) {
      location.href = '../recovery-email.html';
      throw new Error('Cần xác minh email khôi phục.');
    }
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
    document.querySelectorAll('[data-business-email]').forEach(node => { node.textContent = me.email || 'Chưa cập nhật'; });
    document.querySelectorAll('[data-business-avatar]').forEach(node => {
      node.textContent = profile.avatar_url ? '' : initial; // có logo thì không chồng chữ cái lên ảnh
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
  const formatDate = value => window.F2D.date(value, 'Chưa cập nhật');
  const formatDateTime = value => window.F2D.dateTime(value, 'Chưa cập nhật');
  const formatTime = value => value ? new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(value)) : 'Chưa có';
  const statusLabels = {
    active: 'Đang hiển thị', pending: 'Chờ duyệt', hidden: 'Đã ẩn', cancelled: 'Đã hủy',
    rejected: 'Bị từ chối', expired: 'Hết hạn chờ duyệt'
  };
  const notify = (message, type = 'success') => window.F2D.toast(message, type);

  let lastRefreshAt = Date.now();
  window.setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    window.FREE2DO_CACHE?.clear();
    window.dispatchEvent(new Event('free2do:business-data-refresh'));
    lastRefreshAt = Date.now();
  }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastRefreshAt < 5 * 60 * 1000) return;
    window.FREE2DO_CACHE?.clear();
    window.dispatchEvent(new Event('free2do:business-data-refresh'));
    lastRefreshAt = Date.now();
  });

  window.toggleMenu = event => {
    event?.stopPropagation();
    document.getElementById('nav-user-menu')?.classList.toggle('show');
  };
  // ESC đóng panel trượt (tạo/xem hoạt động) cho người dùng bàn phím.
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (document.getElementById('detail-panel')?.classList.contains('show')) window.closeDetail?.();
    else if (document.getElementById('form-panel')?.classList.contains('show')) window.closeForm?.();
  });
  window.toggleMobileMenu = () => document.getElementById('mobile-nav')?.classList.toggle('show');
  window.addEventListener('click', event => {
    if (!event.target.closest('.nav-who')) document.getElementById('nav-user-menu')?.classList.remove('show');
  });
  document.addEventListener('DOMContentLoaded', bindShell);

  window.BusinessAPI = {
    request, requireBusiness, applyIdentity, logout, escapeHTML, formatNumber,
    formatMoney, formatDate, formatDateTime, formatTime, statusLabels, notify
  };
})();
