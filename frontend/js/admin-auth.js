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
  function requireOperatorAuth() {
    if (!getToken()) {
      goToLogin();
    }
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


  // ------------------------- Helper dùng chung cho các trang danh sách / hồ sơ -------------------------

  // Nhãn hiển thị + class CSS của badge theo status trả về từ backend.
  // accounts.status: active | blocked | suspended  —  activities.status: pending | active | hidden | cancelled
  const STATUS_LABELS = {
    active: 'Hoạt động',
    pending: 'Chờ duyệt',
    blocked: 'Đã khóa',
    suspended: 'Tạm đình chỉ',
    hidden: 'Đã ẩn',
    cancelled: 'Đã hủy',
    approved: 'Đã duyệt',
    rejected: 'Từ chối',
  };
  const STATUS_BADGE_CLASS = {
    blocked: 'locked',
    suspended: 'locked',
    cancelled: 'expired',
    approved: 'active',
  };

  function statusBadge(status) {
    const cssClass = STATUS_BADGE_CLASS[status] || status;
    return `<span class="badge ${escapeHTML(cssClass)}">${escapeHTML(STATUS_LABELS[status] || status)}</span>`;
  }

  // Bỏ dấu tiếng Việt + chữ thường, dùng cho ô tìm kiếm.
  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase();
  }

  // Backend dùng UUID rất dài -> hiển thị rút gọn 8 ký tự đầu (khi cần, tìm kiếm vẫn khớp UUID đầy đủ).
  function shortId(id) {
    return id ? String(id).slice(0, 8).toUpperCase() : '';
  }

  // created_at / verified_at do backend lưu bằng datetime.utcnow() nên chuỗi trả về không có "Z".
  // Thêm "Z" để trình duyệt hiểu đúng là UTC rồi đổi sang giờ máy người dùng.
  function parseServerDate(value) {
    if (!value) return null;
    const text = String(value);
    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(text);
    const date = new Date(hasZone ? text : `${text}Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value) {
    const date = parseServerDate(value);
    return date ? date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Chưa có';
  }

  function formatDateTime(value) {
    const date = parseServerDate(value);
    return date
      ? date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
      : 'Chưa có';
  }

  function ratingStars(rating) {
    const value = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    return value ? '★'.repeat(value) + '☆'.repeat(5 - value) : '—';
  }

  // Gán giá trị vào các dòng .info-row của một card theo nhãn (.info-label).
  // values[label] là HTML đã escape sẵn. Dòng nào không có trong values sẽ bị ẩn.
  function setInfoRows(card, values) {
    card.querySelectorAll('.info-row').forEach((row) => {
      const label = row.querySelector('.info-label').textContent.trim();
      if (Object.prototype.hasOwnProperty.call(values, label)) {
        row.style.display = '';
        row.querySelector('.info-value').innerHTML = values[label];
      } else {
        row.style.display = 'none';
      }
    });
  }

  // Phân trang dạng ‹ 1 2 3 › dùng cho các bảng danh sách.
  function renderPagination(container, totalPages, currentPage, onChange) {
    container.innerHTML = '';
    if (totalPages <= 1) return;

    const add = (label, page, extraClass = '') => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `page-btn${extraClass}`;
      button.textContent = label;
      button.disabled = page < 1 || page > totalPages;
      button.addEventListener('click', () => onChange(page));
      container.appendChild(button);
    };

    add('‹', currentPage - 1, currentPage === 1 ? ' disabled' : '');
    for (let page = 1; page <= totalPages; page += 1) add(String(page), page, page === currentPage ? ' active' : '');
    add('›', currentPage + 1, currentPage === totalPages ? ' disabled' : '');
  }

  // Trang hồ sơ: đọc ?id=... trên URL.
  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  // Thay nội dung trang bằng thông báo lỗi / không tìm thấy (dùng cho các trang hồ sơ).
  function showNotFound(backHref, backLabel, title, message) {
    document.querySelector('.content').innerHTML = `
      <a href="${escapeHTML(backHref)}" class="back-link">← ${escapeHTML(backLabel)}</a>
      <div class="card" style="padding:24px;margin-top:20px;">
        <h3>${escapeHTML(title)}</h3>
        <p>${escapeHTML(message)}</p>
      </div>`;
  }

  // Map operator_id -> tên hiển thị (dùng cho cột "Admin xác minh").
  // /operator/operators chỉ dành cho admin cấp cao; nếu không được phép thì chỉ biết tên của chính mình.
  let operatorNamesPromise = null;
  function getOperatorNames() {
    if (!operatorNamesPromise) {
      operatorNamesPromise = (async () => {
        const names = {};
        try {
          const operators = await authFetch('/operator/operators');
          operators.forEach((op) => { names[op.operator_id] = op.name; });
        } catch (error) {
          try {
            const me = await authFetch('/operator/me');
            names[me.operator_id] = me.name;
          } catch (innerError) {
            // bỏ qua: sẽ hiển thị mã rút gọn
          }
        }
        return names;
      })();
    }
    return operatorNamesPromise;
  }

  async function operatorLabel(operatorId) {
    if (!operatorId) return 'Chưa xác minh';
    const names = await getOperatorNames();
    return names[operatorId] || `Operator ${shortId(operatorId)}`;
  }

  // Điền tên + vai trò của tài khoản đang đăng nhập vào sidebar và header.
  async function fillAdminInfo() {
    if (!getToken()) return;
    try {
      const me = await authFetch('/operator/me');
      if (!me) return;
      const name = me.name || 'Admin';
      const initial = name.trim().charAt(0).toUpperCase() || 'A';
      const role = me.level === 'admin' ? 'Quản trị viên' : 'Nhân viên';

      document.querySelectorAll('.side-admin-name, .who .name').forEach((el) => { el.textContent = name; });
      document.querySelectorAll('.side-avatar, .who .avatar').forEach((el) => { el.textContent = initial; });
      document.querySelectorAll('.side-admin-role').forEach((el) => { el.textContent = role; });
    } catch (error) {
      console.error(error);
    }
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
    STATUS_LABELS,
    statusBadge,
    normalize,
    shortId,
    parseServerDate,
    formatDate,
    formatDateTime,
    ratingStars,
    setInfoRows,
    renderPagination,
    getQueryParam,
    showNotFound,
    getOperatorNames,
    operatorLabel,
    fillAdminInfo,
  };

  document.addEventListener('DOMContentLoaded', () => {
    bindLogoutLinks();
    fillAdminInfo();
  });
})();
