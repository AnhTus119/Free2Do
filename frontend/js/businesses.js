(function () {
  'use strict';

  const {
    requireOperatorAuth, escapeHTML, normalize, statusBadge, shortId, renderPagination,
  } = window.AdminAuth;
  const { getBusinesses, decideBusinessRequest, setUserStatus } = window.AdminData;

  requireOperatorAuth();

  const tableBody = document.getElementById('businessRows');
  const searchInput = document.getElementById('businessSearch');
  const statusFilter = document.getElementById('statusFilter');
  const sortFilter = document.getElementById('activityFilter');
  const countLabel = document.getElementById('businessCount');
  const pagination = document.getElementById('businessPagination');
  const statFilters = document.querySelectorAll('.stat-filter');
  const pageSize = 10;

  // Mỗi dòng: { kind: 'business' | 'request', id, name, address, phone, status, activityCount } — xem AdminData.getBusinesses()
  let businesses = [];
  let currentPage = 1;

  // ------------------------- Tải dữ liệu từ API -------------------------

  async function loadBusinesses() {
    try {
      businesses = await getBusinesses();
      render();
    } catch (error) {
      console.error(error);
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">${escapeHTML(error.message || 'Không tải được danh sách doanh nghiệp.')}</td></tr>`;
      countLabel.textContent = '';
    }
  }

  // ------------------------- Hiển thị -------------------------

  function profileLink(business) {
    const param = business.kind === 'request' ? 'request' : 'id';
    return `business-profile.html?${param}=${encodeURIComponent(business.id)}`;
  }

  function updateStats() {
    document.getElementById('totalBusinesses').textContent = businesses.length;
    ['active', 'pending', 'blocked'].forEach((status) => {
      const id = status === 'blocked' ? 'lockedBusinesses' : `${status}Businesses`;
      document.getElementById(id).textContent = businesses.filter((item) => item.status === status).length;
    });
  }

  function filteredBusinesses() {
    const query = normalize(searchInput.value);
    const rows = businesses.filter((business) => {
      const matchesStatus = statusFilter.value === 'all' || business.status === statusFilter.value;
      const matchesSearch = !query
        || normalize(`${business.id} ${business.name} ${business.address} ${business.phone}`).includes(query);
      return matchesStatus && matchesSearch;
    });

    rows.sort(sortFilter.value === 'mostActivities'
      ? (first, second) => second.activityCount - first.activityCount
      : (first, second) => second.sortTime - first.sortTime);
    return rows;
  }

  function renderRows(rows) {
    if (!rows.length) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Không có doanh nghiệp phù hợp.</td></tr>';
      return;
    }

    tableBody.innerHTML = rows.map((business) => {
      let action = '<button class="row-btn danger" data-action="lock">Khóa</button>';
      if (business.status === 'pending') action = '<button class="row-btn approve" data-action="approve">Duyệt</button>';
      if (business.status === 'blocked') action = '<button class="row-btn approve" data-action="unlock">Mở khóa</button>';

      return `<tr data-id="${escapeHTML(business.id)}">
        <td>${escapeHTML(shortId(business.id))}</td>
        <td><div class="cell-title">${escapeHTML(business.name)}</div><div class="cell-sub">${escapeHTML(business.address)}</div></td>
        <td>${escapeHTML(business.phone || 'Chưa cung cấp')}</td>
        <td>${business.activityCount}</td>
        <td>${statusBadge(business.status)}</td>
        <td><div class="row-actions"><a class="row-btn" href="${profileLink(business)}">Xem</a>${action}</div></td>
      </tr>`;
    }).join('');
  }

  function render() {
    const rows = filteredBusinesses();
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * pageSize;

    renderRows(rows.slice(start, start + pageSize));
    countLabel.textContent = rows.length
      ? `Hiển thị ${start + 1}–${Math.min(start + pageSize, rows.length)} trong tổng số ${rows.length} Doanh nghiệp`
      : 'Không có doanh nghiệp phù hợp';
    renderPagination(pagination, totalPages, currentPage, (page) => { currentPage = page; render(); });
    updateStats();
    statFilters.forEach((card) => card.classList.toggle('selected', card.dataset.status === statusFilter.value));
  }

  // ------------------------- Duyệt / khóa / mở khóa -------------------------

  async function handleAction(button) {
    const id = button.closest('tr').dataset.id;
    const action = button.dataset.action;
    button.disabled = true;

    try {
      if (action === 'approve') {
        // Duyệt yêu cầu -> backend tạo hồ sơ doanh nghiệp mới nên phải tải lại toàn bộ danh sách.
        await decideBusinessRequest(id, 'approve');
        await loadBusinesses();
        return;
      }

      const updated = await setUserStatus(id, action === 'unlock' ? 'active' : 'blocked');
      businesses = businesses.map((item) => (item.id === id ? { ...item, status: updated.status === 'active' ? 'active' : 'blocked' } : item));
    } catch (error) {
      alert(error.message || 'Không xử lý được yêu cầu này.');
    }
    render();
  }

  // ------------------------- Sự kiện -------------------------

  [searchInput, statusFilter, sortFilter].forEach((control) => {
    control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', () => { currentPage = 1; render(); });
  });

  statFilters.forEach((card) => card.addEventListener('click', () => {
    statusFilter.value = card.dataset.status;
    currentPage = 1;
    render();
  }));

  tableBody.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (button) handleAction(button);
  });

  loadBusinesses();
})();
