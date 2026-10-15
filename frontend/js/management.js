(function () {
  'use strict';
  const auth = window.AdminAuth;
  const esc = auth.escapeHTML;
  let reports = [];
  let complaints = [];
  let currentMe;

  const STAR = '<path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/>';
  const stars = rating => `<span class="op-stars" role="img" aria-label="${rating} trên 5 sao">${Array.from({ length: 5 }, (_, index) => `<svg viewBox="0 0 24 24" class="${index < rating ? '' : 'empty'}" aria-hidden="true">${STAR}</svg>`).join('')}</span>`;
  const STATUS = { active: 'Đang hiển thị', pending: 'Chờ duyệt', hidden: 'Đã ẩn', cancelled: 'Đã hủy' };
  const activityLabel = item => `${item.activity_code ? `${item.activity_code} · ` : ''}${item.activity_name || 'Hoạt động không còn tồn tại'}`;
  const emptyRow = text => `<p class="op-case-empty">${esc(text)}</p>`;

  async function loadCategories() {
    const rows = await auth.authFetch('/categories');
    document.getElementById('categories').innerHTML = rows.map(item => `<div class="item" data-category="${esc(item.category_id)}"><b>${esc(item.name)}</b> <button data-action="rename">Đổi tên</button> <button class="danger" data-action="delete">Xóa</button></div>`).join('') || '<p>Chưa có danh mục.</p>';
  }

  // ---------- Báo cáo / khiếu nại: danh sách gọn, click để mở khung chi tiết ----------
  function caseRow(kind, item, title, meta) {
    return `<button type="button" class="op-case" data-kind="${kind}" data-id="${esc(kind === 'report' ? item.report_id : item.complaint_id)}">
      <span class="op-case-main">
        <span class="op-case-title">${esc(title)}</span>
        <span class="op-case-meta">${esc(meta)}</span>
      </span>
      <time class="op-case-time">${esc(F2D.dateTime(item.created_at))}</time>
      <span class="op-case-chev" aria-hidden="true">›</span>
    </button>`;
  }
  async function loadReports() {
    reports = await auth.authFetch('/operator/reports?status=pending');
    document.getElementById('reportCount').textContent = reports.length;
    document.getElementById('reports').innerHTML = reports.map(item => caseRow('report', item, item.reason, `${activityLabel(item)} · Người gửi: ${item.reporter_name || 'Không rõ'}`)).join('')
      || emptyRow('Không có báo cáo chờ xử lý.');
  }
  async function loadComplaints() {
    complaints = await auth.authFetch('/operator/complaints?status=pending');
    document.getElementById('complaintCount').textContent = complaints.length;
    document.getElementById('complaints').innerHTML = complaints.map(item => caseRow('complaint', item, item.reason, `${activityLabel(item)} · Đánh giá ${item.review_rating ?? '?'}/5 của ${item.reviewer_name || 'khách hàng'}`)).join('')
      || emptyRow('Không có khiếu nại chờ xử lý.');
  }

  const dialog = () => document.getElementById('caseDialog');
  const field = (label, value) => `<dt>${esc(label)}</dt><dd>${value}</dd>`;

  async function activityBlock(activityId) {
    if (!activityId) return '<p class="op-case-empty">Hoạt động không còn tồn tại.</p>';
    try {
      const activity = await auth.authFetch(`/operator/activities/${encodeURIComponent(activityId)}`);
      const images = (activity.media || []).filter(media => media.media_type !== 'video');
      return `<div class="op-activity-card">
        <div class="op-activity-head"><b>${esc(activity.name)}</b><span class="badge ${esc(activity.status)}">${esc(STATUS[activity.status] || activity.status)}</span></div>
        <dl class="op-fields">
          ${field('Mã hoạt động', esc(activity.code || 'Chưa có mã'))}
          ${field('Doanh nghiệp', esc(activity.business_name || 'Không rõ'))}
          ${field('Địa chỉ', esc(activity.address || 'Chưa cập nhật'))}
          ${field('Mô tả', esc(activity.description || 'Chưa có mô tả'))}
        </dl>
        ${images.length ? `<div class="f2d-thumbs" data-zoom-group>${images.map((media, index) => `<button type="button" class="f2d-thumb" data-zoom="${esc(media.media_url)}" aria-label="Phóng to ảnh hoạt động ${index + 1}"><img src="${esc(media.media_url)}" alt="Ảnh hoạt động ${index + 1}" loading="lazy"></button>`).join('')}</div>` : '<p class="op-case-empty">Hoạt động chưa có ảnh.</p>'}
        <a class="op-link" href="activity-profile.html?id=${encodeURIComponent(activity.activity_id)}">Mở trang hoạt động ›</a>
      </div>`;
    } catch (error) {
      return `<p class="op-case-empty">${esc(error.message)}</p>`;
    }
  }

  async function openCase(kind, id) {
    const item = (kind === 'report' ? reports : complaints).find(entry => (kind === 'report' ? entry.report_id : entry.complaint_id) === id);
    if (!item) return;
    const box = dialog();
    box.dataset.kind = kind;
    box.dataset.id = id;
    document.getElementById('caseTitle').textContent = kind === 'report' ? 'Chi tiết báo cáo hoạt động' : 'Chi tiết khiếu nại đánh giá';
    document.getElementById('caseSub').textContent = activityLabel(item);
    const body = document.getElementById('caseBody');
    const caseSection = kind === 'report'
      ? `<section class="op-case-section"><h3>Nội dung báo cáo</h3><dl class="op-fields">
          ${field('Lý do', esc(item.reason))}
          ${field('Mô tả', esc(item.description || 'Không có mô tả'))}
          ${field('Người gửi', esc(item.reporter_name || 'Không rõ'))}
          ${field('Thời gian', esc(F2D.dateTime(item.created_at)))}
        </dl></section>`
      : `<section class="op-case-section"><h3>Nội dung khiếu nại</h3><dl class="op-fields">
          ${field('Lý do', esc(item.reason))}
          ${field('Mô tả', esc(item.description || 'Không có mô tả'))}
          ${field('Doanh nghiệp gửi', esc(item.complainant_name || 'Không rõ'))}
          ${field('Thời gian', esc(F2D.dateTime(item.created_at)))}
        </dl></section>
        <section class="op-case-section"><h3>Đánh giá gốc</h3>
          <div class="op-review">
            <div class="op-review-top"><b>${esc(item.reviewer_name || 'Khách hàng')}</b>${stars(item.review_rating || 0)}<time>${esc(F2D.dateTime(item.review_created_at))}</time></div>
            <p>${esc(item.review_content || 'Không có nội dung.')}</p>
            ${(item.evidence || []).length ? `<div class="f2d-thumbs" data-zoom-group>${item.evidence.map((media, index) => `<button type="button" class="f2d-thumb" data-zoom="${esc(media.media_url)}" aria-label="Phóng to ảnh đánh giá ${index + 1}"><img src="${esc(media.media_url)}" alt="Ảnh đánh giá ${index + 1}" loading="lazy"></button>`).join('')}</div>` : ''}
            <div class="op-reply"><span>Phản hồi của doanh nghiệp</span>${item.reply_content ? esc(item.reply_content) : '<i>Doanh nghiệp chưa phản hồi.</i>'}</div>
          </div>
        </section>`;
    body.innerHTML = `${caseSection}<section class="op-case-section"><h3>Thông tin hoạt động để xác minh</h3><div id="caseActivity"><p class="op-case-empty">Đang tải thông tin hoạt động...</p></div></section>`;
    document.getElementById('caseActions').innerHTML = kind === 'report'
      ? '<button type="button" class="qa-btn" data-resolve="dismiss">Bỏ qua</button><button type="button" class="qa-btn danger" data-resolve="hide_activity">Ẩn hoạt động</button>'
      : '<button type="button" class="qa-btn" data-resolve="dismiss">Bỏ qua khiếu nại</button><button type="button" class="qa-btn danger" data-resolve="delete_review">Xóa đánh giá</button>';
    if (!box.open) box.showModal();
    document.getElementById('caseActivity').innerHTML = await activityBlock(item.activity_id);
  }

  async function resolveCase(button) {
    const box = dialog();
    const { kind, id } = box.dataset;
    const action = button.dataset.resolve;
    if (action === 'hide_activity' && !confirm('Ẩn hoạt động này khỏi FREE2DO?')) return;
    if (action === 'delete_review' && !confirm('Xóa vĩnh viễn đánh giá bị khiếu nại?')) return;
    const messages = {
      'report:dismiss': 'Đã bỏ qua báo cáo.', 'report:hide_activity': 'Đã ẩn hoạt động và xử lý báo cáo.',
      'complaint:dismiss': 'Đã bỏ qua khiếu nại.', 'complaint:delete_review': 'Đã xóa đánh giá và xử lý khiếu nại.',
    };
    await F2D.busy(button, async () => {
      try {
        await auth.authFetch(`/operator/${kind === 'report' ? 'reports' : 'complaints'}/${encodeURIComponent(id)}/resolve`, {
          method: 'PATCH', body: JSON.stringify({ action }), toast: false,
        });
        box.close();
        F2D.toast(messages[`${kind}:${action}`]);
        await (kind === 'report' ? loadReports() : loadComplaints());
      } catch (error) { F2D.toast(error.message, 'error'); }
    });
  }

  async function loadOperators(me) {
    if (me.level !== 'admin') { document.getElementById('operatorForm').remove(); document.getElementById('operators').textContent = 'Chỉ admin cấp cao được quản lý tài khoản Operator.'; return; }
    const rows = await auth.authFetch('/operator/operators');
    document.getElementById('operators').innerHTML = rows.map(item => `<div class="item" data-operator="${esc(item.operator_id)}"><b>${esc(item.name)}</b> · ${esc(item.email)} · ${esc(item.level)} · ${esc(item.status)}${item.operator_id === me.operator_id ? '' : ' <button data-action="toggle-operator">' + (item.status === 'active' ? 'Vô hiệu hóa' : 'Kích hoạt') + '</button>'}</div>`).join('');
  }

  document.getElementById('categoryForm').onsubmit = async event => {
    event.preventDefault();
    try {
      await auth.authFetch('/operator/categories', { method: 'POST', body: JSON.stringify({ name: document.getElementById('categoryName').value.trim() }), toast: 'Đã thêm danh mục.' });
      event.target.reset();
      await loadCategories();
    } catch (error) { /* toast lỗi đã hiện ở F2D.mutate */ }
  };
  document.getElementById('categories').onclick = async event => {
    const row = event.target.closest('[data-category]');
    if (!row) return;
    try {
      if (event.target.dataset.action === 'delete' && confirm('Xóa danh mục này?')) {
        await auth.authFetch(`/operator/categories/${encodeURIComponent(row.dataset.category)}`, { method: 'DELETE', toast: 'Đã xóa danh mục.' });
      }
      if (event.target.dataset.action === 'rename') {
        const name = prompt('Tên mới:');
        if (!name?.trim()) return;
        await auth.authFetch(`/operator/categories/${encodeURIComponent(row.dataset.category)}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }), toast: 'Đã đổi tên danh mục.' });
      }
      await loadCategories();
    } catch (error) { /* toast lỗi đã hiện ở F2D.mutate */ }
  };
  document.querySelector('.op-cases').addEventListener('click', event => {
    const row = event.target.closest('.op-case');
    if (row) openCase(row.dataset.kind, row.dataset.id);
  });
  document.getElementById('caseActions').addEventListener('click', event => {
    const button = event.target.closest('[data-resolve]');
    if (button) resolveCase(button);
  });
  document.getElementById('caseClose').addEventListener('click', () => dialog().close());
  dialog().addEventListener('click', event => { if (event.target === dialog()) dialog().close(); });

  document.getElementById('operatorForm').onsubmit = async event => {
    event.preventDefault();
    try {
      await auth.authFetch('/operator/operators', {
        method: 'POST', toast: 'Đã tạo tài khoản operator.',
        body: JSON.stringify({ email: document.getElementById('operatorEmail').value.trim(), name: document.getElementById('operatorName').value.trim(), password: document.getElementById('operatorPassword').value, level: document.getElementById('operatorLevel').value }),
      });
      event.target.reset();
      await loadOperators(currentMe);
    } catch (error) { /* toast lỗi đã hiện ở F2D.mutate */ }
  };
  document.getElementById('operators').onclick = async event => {
    const row = event.target.closest('[data-operator]');
    if (!row || event.target.dataset.action !== 'toggle-operator') return;
    const disabled = event.target.textContent.includes('Kích hoạt');
    try {
      await auth.authFetch(`/operator/operators/${encodeURIComponent(row.dataset.operator)}`, {
        method: 'PATCH', body: JSON.stringify({ status: disabled ? 'active' : 'disabled' }),
        toast: disabled ? 'Đã kích hoạt tài khoản.' : 'Đã vô hiệu hóa tài khoản.',
      });
      await loadOperators(currentMe);
    } catch (error) { /* toast lỗi đã hiện ở F2D.mutate */ }
  };

  (async () => {
    currentMe = await auth.authFetch('/operator/me');
    document.getElementById('operatorMe').textContent = `${currentMe.name} · ${currentMe.email} · ${currentMe.level}`;
    await Promise.all([loadCategories(), loadReports(), loadComplaints(), loadOperators(currentMe)]);
    // Link từ chuông thông báo: management.html#report-<id> / #complaint-<id> mở thẳng khung chi tiết.
    const openFromHash = () => {
      const match = location.hash.match(/^#(report|complaint)-(.+)$/);
      if (match) openCase(match[1], decodeURIComponent(match[2]));
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
  })().catch(error => { document.querySelector('.content').textContent = error.message; });
})();
