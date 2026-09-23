/* Shared adapter for operator pages. API responses, never local sample data. */
(function () {
  'use strict';
  const auth = window.AdminAuth;
  auth.requireOperatorAuth();
  const get = auth.authFetch;
  const e = auth.escapeHTML;
  const labels = { active: 'Hoạt động', pending: 'Chờ duyệt', hidden: 'Đã ẩn', cancelled: 'Đã hủy', blocked: 'Đã khóa', suspended: 'Tạm ngưng', approved: 'Đã duyệt', rejected: 'Từ chối' };
  const badge = status => `<span class="badge ${e(status)}">${e(labels[status] || status || '—')}</span>`;
  const date = value => value ? new Date(value).toLocaleDateString('vi-VN') : 'Chưa có dữ liệu';
  const value = input => input === null || input === undefined || input === '' ? 'Chưa có dữ liệu' : e(input);
  const normal = input => String(input ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const error = (target, message) => { target.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#b3293a">${e(message)}</td></tr>`; };
  async function changeUser(id, status) {
    return get(`/operator/users/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  }
  async function changeActivity(id, status) {
    return get(`/operator/activities/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  }
  function pagination(container, count, page, pageSize, onPage) {
    container.replaceChildren();
    const max = Math.ceil(count / pageSize);
    if (max <= 1) return;
    const add = (label, next) => {
      const button = document.createElement('button');
      button.className = `page-btn${next === page ? ' active' : ''}`;
      button.textContent = label;
      button.disabled = next < 1 || next > max;
      button.addEventListener('click', () => onPage(next));
      container.append(button);
    };
    add('‹', page - 1);
    for (let i = 1; i <= max; i++) add(String(i), i);
    add('›', page + 1);
  }
  function rowsInfo(total, page, size, noun) {
    return total ? `Hiển thị ${(page - 1) * size + 1}–${Math.min(page * size, total)} trong tổng số ${total} ${noun}` : `Không có ${noun} phù hợp`;
  }
  window.AdminAPI = { get, e, labels, badge, date, value, normal, error, changeUser, changeActivity, pagination, rowsInfo, price: auth.formatPrice, hours: auth.formatHours };
})();
