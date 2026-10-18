/*
 * Helper dùng chung cho các trang quản trị (dashboard.html,
 * customers.html, businesses.html, activities.html...).
 * Xử lý: lưu/đọc JWT, gọi API có kèm Authorization header, bảo vệ trang admin,
 * và vài hàm format dùng chung (giá, ngày giờ, escape HTML).
 *
 * Yêu cầu: nạp js/config.js TRƯỚC file này (để có window.FREE2DO_CONFIG).
 */
(function () {
  'use strict';

  const API_BASE_URL = window.FREE2DO_CONFIG.API_BASE_URL;
  const TOKEN_KEY = 'token'; // dùng chung key với login.js/register.js của trang người dùng

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  function goToLogin() {
    clearToken();
    window.FREE2DO_CACHE.clear();
    window.location.href = 'log-in.html';
  }

  /**
   * Gọi API kèm Authorization: Bearer <token>.
   * path: vd '/operator/dashboard' (không cần domain).
   * Nếu 401 -> tự đăng xuất và chuyển về trang login.
   * Ném lỗi (Error) kèm message tiếng Việt lấy từ backend khi request thất bại.
   */
  // Mọi yêu cầu ghi đi qua F2D.mutate (js/main.js): khóa nút vừa bấm + toast thành công/thất bại.
  function authFetch(path, options = {}) {
    const { toast, ...rest } = options;
    return window.F2D ? window.F2D.mutate(rest.method, path, () => send(path, rest), { toast }) : send(path, rest);
  }
  async function send(path, options = {}) {
    const token = getToken();
    if (!token) {
      goToLogin();
      throw new Error('Chưa đăng nhập');
    }

    const cache = window.FREE2DO_CACHE;
    const isRead = !options.method || String(options.method).toUpperCase() === 'GET';
    if (isRead) { const hit = cache.get(path); if (hit !== undefined) return hit; } else cache.clear();

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    if (response.status === 401) {
      goToLogin();
      throw new Error('Phiên đăng nhập đã hết hạn');
    }

    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {
      throw new Error((data && data.detail) || 'Có lỗi xảy ra, vui lòng thử lại.');
    }

    if (isRead) cache.set(path, data);
    return data;
  }

  /**
   * Gọi ở đầu mỗi trang admin để chặn truy cập khi
   * chưa đăng nhập. Không xác minh role='operator' ở đây (việc đó đã làm
   * lúc đăng nhập) — chỉ cần có token là coi như đã qua bước đăng nhập.
   */
  let validation;
  async function requireOperatorAuth() {
    if (!getToken()) { goToLogin(); throw new Error('Chưa đăng nhập'); }
    if (!validation) validation = authFetch('/auth/me').then(me => {
      if (me.requires_recovery_email) {
        window.location.href = 'recovery-email.html';
        throw new Error('Cần xác minh email khôi phục.');
      }
      if (me.requires_password_change) {
        window.location.href = 'change-password.html';
        throw new Error('Cần đổi mật khẩu trước khi tiếp tục.');
      }
      if (me.account_type !== 'operator') {
        window.location.href = 'log-in.html';
        throw new Error('Tài khoản không có quyền quản trị.');
      }
      document.querySelectorAll('.side-admin-name, .who .name').forEach((element) => {
        element.textContent = me.name || me.email;
      });
      document.querySelectorAll('.side-admin-role').forEach((element) => {
        element.textContent = me.level === 'admin' ? 'Quản trị viên cấp cao' : 'Nhân viên vận hành';
      });
      document.querySelectorAll('.who .avatar').forEach((element) => {
        element.textContent = (me.name || me.email || '?').charAt(0).toUpperCase();
      });
      return me;
    }).catch(error => { validation = null; throw error; });
    return validation;
  }

  function bindLogoutLinks() {
    document.querySelectorAll('a[data-logout]').forEach((link) => {
      link.addEventListener('click', () => { clearToken(); window.FREE2DO_CACHE.clear(); });
    });
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    })[character]);
  }

  function formatPrice(price) {
    if (price === null || price === undefined) return 'Chưa cập nhật';
    return `${Number(price).toLocaleString('vi-VN')} ₫`;
  }

  function formatHours(timeOpen, timeClose) {
    if (!timeOpen && !timeClose) return 'Chưa cập nhật';
    // Giờ mở/đóng cửa lưu kèm ngày giả 2000-01-01 (chỉ là giờ trong ngày) nên chỉ hiện HH:mm.
    const fmt = (value) => {
      const date = new Date(value);
      return date.getFullYear() === 2000
        ? date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        : date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    };
    if (timeOpen && timeClose) return `${fmt(timeOpen)} - ${fmt(timeClose)}`;
    return fmt(timeOpen || timeClose);
  }

  window.AdminAuth = {
    API_BASE_URL,
    getToken,
    setToken,
    clearToken,
    authFetch,
    requireOperatorAuth,
    bindLogoutLinks,
    escapeHTML,
    formatPrice,
    formatHours,
  };

  document.addEventListener('DOMContentLoaded', bindLogoutLinks);
})();
