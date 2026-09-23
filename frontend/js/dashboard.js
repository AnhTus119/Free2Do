(function () {
  'use strict';

  const { authFetch, requireOperatorAuth, escapeHTML, formatPrice, formatHours } = window.AdminAuth;

  requireOperatorAuth();

  const PAGE_SIZE = 10;
  const DEFAULT_ROWS = 4;

  // Dữ liệu tải từ backend, giữ trong bộ nhớ để phân trang/mở modal không cần gọi lại API.
  let pendingActivities = [];
  let pendingBusinessRequests = [];

  let showingAllActivities = false;
  let activityPage = 1;

  let showingAllBusinesses = false;
  let businessPage = 1;

  // ------------------------- Tải dữ liệu từ API -------------------------

  async function loadDashboard() {
    try {
      const [summary, customers, activeActivities, pendingActivitiesRes, pendingRequestsRes] = await Promise.all([
        authFetch('/operator/dashboard'),
        authFetch('/operator/users?role=customer'),
        authFetch('/operator/activities?status=active'),
        authFetch('/operator/activities?status=pending'),
        authFetch('/operator/business-requests?status=pending'),
      ]);

      pendingActivities = pendingActivitiesRes;
      pendingBusinessRequests = pendingRequestsRes;

      renderStats(summary, customers, activeActivities);
      renderPendingActivities();
      renderPendingBusinesses();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Không tải được dữ liệu tổng quan.');
    }
  }

  function renderStats(summary, customers, activeActivities) {
    const lockedCustomers = customers.filter((c) => c.status === 'blocked').length;
    const missingPhoneRequests = pendingBusinessRequests.filter((r) => !r.phone).length;
    const pendingTotal = summary.pending_request_count + pendingActivities.length;

    const stats = document.querySelectorAll('.stats-grid .stat-num');
    const values = [
      customers.length,
      summary.business_count,
      summary.activity_count,
      activeActivities.length,
      pendingTotal,
      lockedCustomers,
    ];
    values.forEach((value, index) => {
      if (stats[index]) stats[index].textContent = value;
    });

    document.getElementById('pendingActivityAlert').textContent = pendingActivities.length;
    document.getElementById('pendingBusinessAlert').textContent = pendingBusinessRequests.length;
    document.getElementById('missingPhoneAlert').textContent = missingPhoneRequests;
    document.getElementById('lockedCustomerAlert').textContent = lockedCustomers;
  }

  // ------------------------- Bảng phân trang dùng chung -------------------------

  function renderPageButtons(container, total, currentPage, onChange) {
    const totalPages = Math.ceil(total / PAGE_SIZE);
    container.innerHTML = '';

    const add = (label, page, active = false) => {
      const button = document.createElement('button');
      button.className = `page-btn${active ? ' active' : ''}`;
      button.textContent = label;
      button.disabled = page < 1 || page > totalPages;
      button.addEventListener('click', () => onChange(page));
      container.appendChild(button);
    };

    add('‹', currentPage - 1);
    for (let page = 1; page <= totalPages; page += 1) add(String(page), page, page === currentPage);
    add('›', currentPage + 1);
  }

  // ------------------------- Hoạt động chờ duyệt -------------------------

  function renderPendingActivities() {
    const start = showingAllActivities ? (activityPage - 1) * PAGE_SIZE : 0;
    const rows = showingAllActivities
      ? pendingActivities.slice(start, start + PAGE_SIZE)
      : pendingActivities.slice(0, DEFAULT_ROWS);

    document.getElementById('pendingCount').textContent = `(${pendingActivities.length})`;

    document.getElementById('pendingTableBody').innerHTML = rows.length
      ? rows.map((activity) => `
          <tr>
            <td>
              <div class="cell-title">${escapeHTML(activity.name)}</div>
              <div class="cell-sub">${escapeHTML(formatPrice(activity.price))}</div>
            </td>
            <td>${escapeHTML(activity.business_name)}</td>
            <td>${escapeHTML(activity.address)}</td>
            <td><span class="badge pending">Chờ duyệt</span></td>
            <td>
              <div class="row-actions">
                <button class="row-btn viewmore" data-activity-id="${escapeHTML(activity.activity_id)}">Xem thêm</button>
              </div>
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="5" style="text-align:center;">Không có hoạt động chờ duyệt.</td></tr>';

    const pagination = document.getElementById('pendingPagination');
    const toggle = document.querySelector('#toggleViewAll a');
    toggle.textContent = showingAllActivities ? 'Thu gọn ↑' : 'Xem tất cả';
    pagination.classList.toggle('show', showingAllActivities && pendingActivities.length > PAGE_SIZE);

    if (showingAllActivities && pendingActivities.length > PAGE_SIZE) {
      document.getElementById('paginationInfo').textContent =
        `Hiển thị ${start + 1}–${Math.min(start + PAGE_SIZE, pendingActivities.length)} trong ${pendingActivities.length} hoạt động`;
      renderPageButtons(document.getElementById('paginationBtns'), pendingActivities.length, activityPage, (page) => {
        activityPage = page;
        renderPendingActivities();
      });
    }
  }

  const activityModal = document.getElementById('activityModal');

  function openActivityModal(id) {
    const activity = pendingActivities.find((item) => item.activity_id === id);
    if (!activity) return;

    document.getElementById('modalTitle').textContent = activity.name;
    document.getElementById('modalSub').textContent = formatPrice(activity.price);
    document.getElementById('modalDesc').textContent = activity.description || 'Chưa có mô tả.';
    document.getElementById('modalImage').className = 'modal-image empty';
    document.getElementById('modalImage').textContent = 'Chưa có hình ảnh mô tả';

    const information = [
      ['Doanh nghiệp', activity.business_name],
      ['Ngân sách', formatPrice(activity.price)],
      ['Địa chỉ', activity.address],
      ['Giờ hoạt động', formatHours(activity.time_open, activity.time_close)],
      ['Admin xác minh', activity.verified_by || 'Chưa xác minh'],
    ];
    document.getElementById('modalInfo').innerHTML = information.map(([label, value]) => `
      <div class="info-row">
        <span class="info-label">${escapeHTML(label)}</span>
        <span class="info-value">${escapeHTML(value)}</span>
      </div>
    `).join('');

    document.getElementById('modalApprove').onclick = () => decideActivity(id, 'approve');
    document.getElementById('modalReject').onclick = () => decideActivity(id, 'hide');
    activityModal.classList.add('open');
  }

  async function decideActivity(id, action) {
    try {
      await authFetch(`/operator/activities/${id}/${action}`, { method: 'PATCH' });
      activityModal.classList.remove('open');
      await loadDashboard();
    } catch (error) {
      alert(error.message || 'Không xử lý được hoạt động này.');
    }
  }

  // ------------------------- Doanh nghiệp chờ duyệt -------------------------

  function renderPendingBusinesses() {
    const start = showingAllBusinesses ? (businessPage - 1) * PAGE_SIZE : 0;
    const rows = showingAllBusinesses
      ? pendingBusinessRequests.slice(start, start + PAGE_SIZE)
      : pendingBusinessRequests.slice(0, DEFAULT_ROWS);

    document.getElementById('bizPendingCount').textContent = `(${pendingBusinessRequests.length})`;

    document.getElementById('bizTableBody').innerHTML = rows.length
      ? rows.map((request) => `
          <tr>
            <td><div class="cell-title">${escapeHTML(request.business_name)}</div></td>
            <td>${escapeHTML(request.phone || 'Chưa cung cấp')}</td>
            <td>${escapeHTML(request.business_address)}</td>
            <td><span class="badge pending">Chờ duyệt</span></td>
            <td>
              <div class="row-actions">
                <button class="row-btn viewmore" data-business-id="${escapeHTML(request.request_id)}">Xem thêm</button>
              </div>
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="5" style="text-align:center;">Không có doanh nghiệp chờ duyệt.</td></tr>';

    const pagination = document.getElementById('bizPagination');
    const toggle = document.querySelector('#toggleBizViewAll a');
    toggle.textContent = showingAllBusinesses ? 'Thu gọn ↑' : 'Xem tất cả';
    pagination.classList.toggle('show', showingAllBusinesses && pendingBusinessRequests.length > PAGE_SIZE);

    if (showingAllBusinesses && pendingBusinessRequests.length > PAGE_SIZE) {
      document.getElementById('bizPaginationInfo').textContent =
        `Hiển thị ${start + 1}–${Math.min(start + PAGE_SIZE, pendingBusinessRequests.length)} trong ${pendingBusinessRequests.length} yêu cầu`;
      renderPageButtons(document.getElementById('bizPaginationBtns'), pendingBusinessRequests.length, businessPage, (page) => {
        businessPage = page;
        renderPendingBusinesses();
      });
    }
  }

  const businessModal = document.getElementById('businessModal');

  function openBusinessModal(id) {
    const request = pendingBusinessRequests.find((item) => item.request_id === id);
    if (!request) return;

    document.getElementById('bizModalTitle').textContent = request.business_name;
    document.getElementById('bizModalSub').textContent = request.business_address;
    document.getElementById('bizModalDesc').textContent = request.description || 'Chưa có mô tả.';

    const information = [
      ['Số điện thoại', request.phone || 'Chưa cung cấp'],
      ['Địa chỉ', request.business_address],
    ];
    document.getElementById('bizModalInfo').innerHTML = information.map(([label, value]) => `
      <div class="info-row">
        <span class="info-label">${escapeHTML(label)}</span>
        <span class="info-value">${escapeHTML(value)}</span>
      </div>
    `).join('');

    document.getElementById('bizModalImage').className = 'modal-image empty';
    document.getElementById('bizModalImage').textContent = 'Chưa có hình ảnh minh họa';
    document.getElementById('bizModalLicense').className = 'modal-image modal-license empty';
    document.getElementById('bizModalLicense').textContent = 'Chưa có minh chứng giấy phép hoạt động';

    document.getElementById('bizModalApprove').onclick = () => decideBusiness(id, 'approve');
    document.getElementById('bizModalReject').onclick = () => decideBusiness(id, 'reject');
    businessModal.classList.add('open');
  }

  async function decideBusiness(id, action) {
    try {
      await authFetch(`/operator/business-requests/${id}/${action}`, { method: 'PATCH' });
      businessModal.classList.remove('open');
      await loadDashboard();
    } catch (error) {
      alert(error.message || 'Không xử lý được yêu cầu này.');
    }
  }

  // ------------------------- Sự kiện -------------------------

  document.getElementById('toggleViewAll').addEventListener('click', () => {
    showingAllActivities = !showingAllActivities;
    activityPage = 1;
    renderPendingActivities();
  });

  document.getElementById('toggleBizViewAll').addEventListener('click', () => {
    showingAllBusinesses = !showingAllBusinesses;
    businessPage = 1;
    renderPendingBusinesses();
  });

  document.getElementById('pendingTableBody').addEventListener('click', (event) => {
    const button = event.target.closest('[data-activity-id]');
    if (button) openActivityModal(button.dataset.activityId);
  });

  document.getElementById('bizTableBody').addEventListener('click', (event) => {
    const button = event.target.closest('[data-business-id]');
    if (button) openBusinessModal(button.dataset.businessId);
  });

  document.getElementById('modalClose').addEventListener('click', () => activityModal.classList.remove('open'));
  document.getElementById('bizModalClose').addEventListener('click', () => businessModal.classList.remove('open'));

  [activityModal, businessModal].forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.classList.remove('open');
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      activityModal.classList.remove('open');
      businessModal.classList.remove('open');
    }
  });

  loadDashboard();
})();
