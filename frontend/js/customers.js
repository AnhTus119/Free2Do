(function () {
  'use strict';

  const { escapeHTML, normalize, parseViDate, setStatus, statusLabels } = window.AdminData;
  const tableBody = document.getElementById('customerRows');
  const searchInput = document.getElementById('customerSearch');
  const statusFilter = document.getElementById('statusFilter');
  const dateFilter = document.getElementById('dateFilter');
  const countLabel = document.getElementById('customerCount');
  const pagination = document.getElementById('customerPagination');
  const statFilters = document.querySelectorAll('.stat-filter');
  const pageSize = 10;
  let currentPage = 1;

  function getCustomers() {
    return window.AdminData.customers;
  }

  function updateStats() {
    const summary = window.AdminData.customerSummary;
    document.getElementById('totalCustomers').textContent = summary.total_count;
    document.getElementById('activeCustomers').textContent = summary.active_count;
    document.getElementById('lockedCustomers').textContent = summary.locked_count;
  }

  function filteredCustomers() {
    const query = normalize(searchInput.value);
    return getCustomers()
      .filter(customer => {
        const matchesStatus = statusFilter.value === 'all' || customer.status === statusFilter.value;
        const matchesSearch = !query || normalize(`${customer.id} ${customer.name} ${customer.email}`).includes(query);
        return matchesStatus && matchesSearch;
      })
      .sort((first, second) => {
        const difference = parseViDate(first.registeredAt) - parseViDate(second.registeredAt);
        return dateFilter.value === 'oldest' ? difference : -difference;
      });
  }

  function renderRows(customers) {
    if (!customers.length) {
      tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Không có khách hàng phù hợp.</td></tr>';
      return;
    }

    tableBody.innerHTML = customers.map(customer => {
      const isLocked = customer.status === 'locked';
      return `
        <tr data-id="${escapeHTML(customer.id)}">
          <td><div class="cell-title">${escapeHTML(customer.name)}</div><div class="cell-sub">${escapeHTML(customer.id)}</div></td>
          <td>${escapeHTML(customer.email)}</td>
          <td>${escapeHTML(customer.registeredAt)}</td>
          <td><span class="badge ${escapeHTML(customer.status)}">${statusLabels[customer.status]}</span></td>
          <td><div class="row-actions">
            <a class="row-btn" href="customer-profile.html?id=${encodeURIComponent(customer.id)}">Xem</a>
            <button class="row-btn ${isLocked ? 'approve' : 'danger'}" data-action="toggle-status">${isLocked ? 'Mở khóa' : 'Khóa'}</button>
          </div></td>
        </tr>`;
    }).join('');
  }

  function renderPagination(totalPages) {
    pagination.innerHTML = '';
    if (totalPages <= 1) return;

    const makeButton = (label, page, className = '') => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `page-btn${className}`;
      button.textContent = label;
      button.disabled = page < 1 || page > totalPages;
      button.addEventListener('click', () => { currentPage = page; render(); });
      return button;
    };

    pagination.appendChild(makeButton('‹', currentPage - 1, currentPage === 1 ? ' disabled' : ''));
    for (let page = 1; page <= totalPages; page += 1) {
      pagination.appendChild(makeButton(String(page), page, page === currentPage ? ' active' : ''));
    }
    pagination.appendChild(makeButton('›', currentPage + 1, currentPage === totalPages ? ' disabled' : ''));
  }

  function render() {
    const customers = filteredCustomers();
    const totalPages = Math.max(1, Math.ceil(customers.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * pageSize;
    renderRows(customers.slice(start, start + pageSize));
    countLabel.textContent = customers.length
      ? `Hiển thị ${start + 1}–${Math.min(start + pageSize, customers.length)} trong tổng số ${customers.length} Khách hàng`
      : 'Không có khách hàng phù hợp';
    renderPagination(totalPages);
    updateStats();
    statFilters.forEach(card => card.classList.toggle('selected', card.dataset.status === statusFilter.value));
  }

  [searchInput, statusFilter, dateFilter].forEach(control => {
    control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', () => { currentPage = 1; render(); });
  });

  statFilters.forEach(card => card.addEventListener('click', () => {
    statusFilter.value = card.dataset.status;
    currentPage = 1;
    render();
  }));

  tableBody.addEventListener('click', async event => {
    const button = event.target.closest('[data-action="toggle-status"]');
    if (!button) return;
    const id = button.closest('tr').dataset.id;
    const customer = getCustomers().find(item => item.id === id);
    button.disabled = true;
    try {
      await setStatus('customer', id, customer.status === 'locked' ? 'active' : 'locked');
      render();
    } catch (error) {
      alert(error.message);
      button.disabled = false;
    }
  });

  window.AdminData.ready.then(render).catch(error => { tableBody.innerHTML = `<tr><td colspan="5">${escapeHTML(error.message)}</td></tr>`; });
})();
