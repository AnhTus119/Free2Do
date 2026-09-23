(function () {
  'use strict';

  const {
    requireOperatorAuth, escapeHTML, normalize, statusBadge, shortId, renderPagination,
  } = window.AdminAuth;
  const { getCustomers, setUserStatus } = window.AdminData;

  requireOperatorAuth();

  const tableBody = document.getElementById('customerRows');
  const searchInput = document.getElementById('customerSearch');
  const statusFilter = document.getElementById('statusFilter');
  const sortFilter = document.getElementById('dateFilter');
  const countLabel = document.getElementById('customerCount');
  const pagination = document.getElementById('customerPagination');
  const statFilters = document.querySelectorAll('.stat-filter');
  const pageSize = 10;

  // Danh sách khách hàng tải từ backend, giữ trong bộ nhớ để lọc/phân trang không cần gọi lại API.
  let customers = [];
  let currentPage = 1;

  // ------------------------- Tải dữ liệu từ API -------------------------

  async function loadCustomers() {
    try {
      customers = await getCustomers();
      render();
    } catch (error) {
      console.error(error);
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">${escapeHTML(error.message || 'Không tải được danh sách khách hàng.')}</td></tr>`;
      countLabel.textContent = '';
    }
  }

  // ------------------------- Hiển thị -------------------------

  function updateStats() {
    document.getElementById('totalCustomers').textContent = customers.length;
    document.getElementById('activeCustomers').textContent = customers.filter((item) => item.status === 'active').length;
    document.getElementById('lockedCustomers').textContent = customers.filter((item) => item.status === 'blocked').length;
  }

  function filteredCustomers() {
    const query = normalize(searchInput.value);
    const direction = sortFilter.value === 'nameDesc' ? -1 : 1;

    return customers
      .filter((customer) => {
        const matchesStatus = statusFilter.value === 'all' || customer.status === statusFilter.value;
        const matchesSearch = !query
          || normalize(`${customer.user_id} ${customer.name} ${customer.email} ${customer.phone}`).includes(query);
        return matchesStatus && matchesSearch;
      })
      .sort((first, second) => direction * first.name.localeCompare(second.name, 'vi'));
  }

  function renderRows(rows) {
    if (!rows.length) {
      tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Không có khách hàng phù hợp.</td></tr>';
      return;
    }

    tableBody.innerHTML = rows.map((customer) => {
      const isActive = customer.status === 'active';
      return `
        <tr data-id="${escapeHTML(customer.user_id)}">
          <td><div class="cell-title">${escapeHTML(customer.name)}</div><div class="cell-sub">${escapeHTML(shortId(customer.user_id))}</div></td>
          <td>${escapeHTML(customer.email)}</td>
          <td>${escapeHTML(customer.phone || 'Chưa cung cấp')}</td>
          <td>${statusBadge(customer.status)}</td>
          <td><div class="row-actions">
            <a class="row-btn" href="customer-profile.html?id=${encodeURIComponent(customer.user_id)}">Xem</a>
            <button class="row-btn ${isActive ? 'danger' : 'approve'}" data-action="toggle-status">${isActive ? 'Khóa' : 'Mở khóa'}</button>
          </div></td>
        </tr>`;
    }).join('');
  }

  function render() {
    const rows = filteredCustomers();
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * pageSize;

    renderRows(rows.slice(start, start + pageSize));
    countLabel.textContent = rows.length
      ? `Hiển thị ${start + 1}–${Math.min(start + pageSize, rows.length)} trong tổng số ${rows.length} Khách hàng`
      : 'Không có khách hàng phù hợp';
    renderPagination(pagination, totalPages, currentPage, (page) => { currentPage = page; render(); });
    updateStats();
    statFilters.forEach((card) => card.classList.toggle('selected', card.dataset.status === statusFilter.value));
  }

  // ------------------------- Khóa / mở khóa tài khoản -------------------------

  async function toggleStatus(button) {
    const id = button.closest('tr').dataset.id;
    const customer = customers.find((item) => item.user_id === id);
    if (!customer) return;

    const nextStatus = customer.status === 'active' ? 'blocked' : 'active';
    button.disabled = true;
    try {
      const updated = await setUserStatus(id, nextStatus);
      customers = customers.map((item) => (item.user_id === id ? updated : item));
    } catch (error) {
      alert(error.message || 'Không cập nhật được trạng thái tài khoản.');
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
    const button = event.target.closest('[data-action="toggle-status"]');
    if (button) toggleStatus(button);
  });

  loadCustomers();
})();
