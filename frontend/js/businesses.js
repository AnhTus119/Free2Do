(function () {
  'use strict';

  const data = window.AdminData;
  const tableBody = document.getElementById('businessRows');
  const searchInput = document.getElementById('businessSearch');
  const statusFilter = document.getElementById('statusFilter');
  const activityFilter = document.getElementById('activityFilter');
  const countLabel = document.getElementById('businessCount');
  const pagination = document.getElementById('businessPagination');
  const statFilters = document.querySelectorAll('.stat-filter');
  const pageSize = 10;
  let currentPage = 1;

  function activityCount(id) {
    return data.activities.filter(activity => activity.businessId === id).length;
  }

  function updateStats() {
    const businesses = data.businesses;
    document.getElementById('totalBusinesses').textContent = businesses.length;
    ['active', 'pending', 'locked'].forEach(status => {
      const element = document.getElementById(`${status}Businesses`);
      element.textContent = businesses.filter(item => item.status === status).length;
    });
  }

  function filteredBusinesses() {
    const query = data.normalize(searchInput.value);
    const businesses = data.businesses.filter(business => {
      const matchesStatus = statusFilter.value === 'all' || business.status === statusFilter.value;
      const matchesSearch = !query || data.normalize(`${business.id} ${business.name} ${business.address} ${business.type}`).includes(query);
      return matchesStatus && matchesSearch;
    });
    if (activityFilter.value === 'mostActivities') {
      businesses.sort((first, second) => activityCount(second.id) - activityCount(first.id));
    }
    return businesses;
  }

  function renderRows(businesses) {
    if (!businesses.length) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Không có doanh nghiệp phù hợp.</td></tr>';
      return;
    }
    tableBody.innerHTML = businesses.map(business => {
      let action = `<button class="row-btn danger" data-action="lock">Khóa</button>`;
      if (business.status === 'pending') action = '<button class="row-btn approve" data-action="approve">Duyệt</button>';
      if (business.status === 'locked') action = '<button class="row-btn approve" data-action="unlock">Mở khóa</button>';
      return `<tr data-id="${data.escapeHTML(business.id)}">
        <td>${data.escapeHTML(business.id)}</td>
        <td><div class="cell-title">${data.escapeHTML(business.name)}</div><div class="cell-sub">${data.escapeHTML(business.address)}</div></td>
        <td>${data.escapeHTML(business.type)}</td><td>${activityCount(business.id)}</td>
        <td><span class="badge ${data.escapeHTML(business.status)}">${data.statusLabels[business.status]}</span></td>
        <td><div class="row-actions"><a class="row-btn" href="business-profile.html?id=${encodeURIComponent(business.id)}">Xem</a>${action}</div></td>
      </tr>`;
    }).join('');
  }

  function renderPagination(totalPages) {
    pagination.innerHTML = '';
    if (totalPages <= 1) return;
    const makeButton = (label, page, extra = '') => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = `page-btn${extra}`; button.textContent = label;
      button.disabled = page < 1 || page > totalPages;
      button.addEventListener('click', () => { currentPage = page; render(); });
      return button;
    };
    pagination.appendChild(makeButton('‹', currentPage - 1, currentPage === 1 ? ' disabled' : ''));
    for (let page = 1; page <= totalPages; page += 1) pagination.appendChild(makeButton(String(page), page, page === currentPage ? ' active' : ''));
    pagination.appendChild(makeButton('›', currentPage + 1, currentPage === totalPages ? ' disabled' : ''));
  }

  function render() {
    const businesses = filteredBusinesses();
    const totalPages = Math.max(1, Math.ceil(businesses.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * pageSize;
    renderRows(businesses.slice(start, start + pageSize));
    countLabel.textContent = businesses.length
      ? `Hiển thị ${start + 1}–${Math.min(start + pageSize, businesses.length)} trong tổng số ${businesses.length} Doanh nghiệp`
      : 'Không có doanh nghiệp phù hợp';
    renderPagination(totalPages); updateStats();
    statFilters.forEach(card => card.classList.toggle('selected', card.dataset.status === statusFilter.value));
  }

  [searchInput, statusFilter, activityFilter].forEach(control => control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', () => { currentPage = 1; render(); }));
  statFilters.forEach(card => card.addEventListener('click', () => { statusFilter.value = card.dataset.status; currentPage = 1; render(); }));
  tableBody.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = button.closest('tr').dataset.id;
    const nextStatus = button.dataset.action === 'approve' || button.dataset.action === 'unlock' ? 'active' : 'locked';
    try { await data.setStatus('business', id, nextStatus); render(); }
    catch (error) { data.error(error); }
  });

  data.ready.then(render).catch(() => {});
})();
