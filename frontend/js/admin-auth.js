/*
 * Helper dùng chung cho các trang quản trị (admin-login.html, dashboard.html,
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
    window.location.href = 'admin-login.html';
  }

  /**
   * Gọi API kèm Authorization: Bearer <token>.
   * path: vd '/operator/dashboard' (không cần domain).
   * Nếu 401 -> tự đăng xuất và chuyển về trang login.
   * Ném lỗi (Error) kèm message tiếng Việt lấy từ backend khi request thất bại.
   */
  async function authFetch(path, options = {}) {
    const token = getToken();
    if (!token) {
      goToLogin();
      throw new Error('Chưa đăng nhập');
    }

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

    return data;
  }

  /**
   * Gọi ở đầu mỗi trang admin (trừ admin-login.html) để chặn truy cập khi
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
    document.querySelectorAll('a[href="admin-login.html"]').forEach((link) => {
      link.addEventListener('click', () => clearToken());
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
    const fmt = (value) => new Date(value).toLocaleString('vi-VN', {
      hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
    });
    if (timeOpen && timeClose) return `${fmt(timeOpen)} – ${fmt(timeClose)}`;
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
