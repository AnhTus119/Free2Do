(function () {
  'use strict';

  const data = window.AdminData;
  const tableBody = document.getElementById('activityRows');
  const searchInput = document.getElementById('activitySearch');
  const typeFilter = document.getElementById('typeFilter');
  const priceFilter = document.getElementById('priceFilter');
  const countLabel = document.getElementById('activityCount');
  const pagination = document.getElementById('activityPagination');
  const statusTabs = document.querySelectorAll('.status-tab');
  const pageSize = 10;
  let currentPage = 1;
  let selectedStatus = 'all';

  function startingPrice(activity) {
    return Number(activity.price.split('–')[0].replace(/\D/g, '')) || 0;
  }

  function updateCounts() {
    const activities = data.activities;
    ['all', 'active', 'pending', 'hidden', 'rejected', 'expired'].forEach(status => {
      const element = document.querySelector(`[data-count="${status}"]`);
      if (element) element.textContent = status === 'all' ? activities.length : activities.filter(item => item.status === status).length;
    });
  }

  function filteredActivities() {
    const query = data.normalize(searchInput.value);
    const activities = data.activities.filter(activity => {
      const matchesStatus = selectedStatus === 'all' || activity.status === selectedStatus;
      const matchesType = typeFilter.value === 'all' || activity.type === typeFilter.value;
      const matchesSearch = !query || data.normalize(`${activity.id} ${activity.name} ${data.businessName(activity)}`).includes(query);
      return matchesStatus && matchesType && matchesSearch;
    });
    if (priceFilter.value === 'priceAsc') activities.sort((a, b) => startingPrice(a) - startingPrice(b));
    if (priceFilter.value === 'priceDesc') activities.sort((a, b) => startingPrice(b) - startingPrice(a));
    return activities;
  }

  function renderRows(activities) {
    if (!activities.length) {
      tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Không có hoạt động phù hợp.</td></tr>';
      return;
    }
    tableBody.innerHTML = activities.map(activity => {
      const approve = activity.status === 'pending' ? '<button class="row-btn approve" data-action="approve">Duyệt</button>' : '';
      return `<tr data-id="${data.escapeHTML(activity.id)}" data-type="${data.escapeHTML(activity.type)}">
        <td>${data.escapeHTML(activity.id)}</td><td class="cell-title">${data.escapeHTML(activity.name)}</td>
        <td>${data.escapeHTML(data.businessName(activity))}</td><td>${data.escapeHTML(activity.price)}</td><td>${data.escapeHTML(activity.hours)}</td>
        <td><span class="badge ${data.escapeHTML(activity.status)}">${data.statusLabels[activity.status]}</span></td>
        <td><div class="row-actions"><a class="row-btn" href="activity-profile.html?id=${encodeURIComponent(activity.id)}">Xem</a>${approve}</div></td>
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
    const activities = filteredActivities();
    const totalPages = Math.max(1, Math.ceil(activities.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * pageSize;
    renderRows(activities.slice(start, start + pageSize));
    countLabel.textContent = activities.length
      ? `Hiển thị ${start + 1}–${Math.min(start + pageSize, activities.length)} trong tổng số ${activities.length} Hoạt động`
      : 'Không có hoạt động phù hợp';
    renderPagination(totalPages); updateCounts();
  }

  [searchInput, typeFilter, priceFilter].forEach(control => control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', () => { currentPage = 1; render(); }));
  statusTabs.forEach(tab => tab.addEventListener('click', () => {
    selectedStatus = tab.dataset.status; currentPage = 1;
    statusTabs.forEach(item => item.classList.toggle('active', item === tab)); render();
  }));
  tableBody.addEventListener('click', async event => {
    const button = event.target.closest('[data-action="approve"]');
    if (!button) return;
    try { await data.setStatus('activity', button.closest('tr').dataset.id, 'active'); render(); }
    catch (error) { data.error(error); }
  });

  data.ready.then(render).catch(() => {});
})();
