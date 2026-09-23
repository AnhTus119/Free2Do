(function () {
  'use strict';

  const {
    requireOperatorAuth, escapeHTML, normalize, statusBadge, shortId,
    formatPrice, formatHours, renderPagination,
  } = window.AdminAuth;
  const {
    getActivities, getCategories, getCategoryIdsByActivity, decideActivity,
  } = window.AdminData;

  requireOperatorAuth();

  const tableBody = document.getElementById('activityRows');
  const searchInput = document.getElementById('activitySearch');
  const typeFilter = document.getElementById('typeFilter');
  const priceFilter = document.getElementById('priceFilter');
  const countLabel = document.getElementById('activityCount');
  const pagination = document.getElementById('activityPagination');
  const statusTabs = document.querySelectorAll('.status-tab');
  const pageSize = 10;

  let activities = [];
  let currentPage = 1;
  let selectedStatus = 'all';

  // Danh mục của từng hoạt động (category_ids) chỉ có ở API chi tiết, không có trong API danh sách.
  // Nên chỉ tải (1 lần) khi người dùng thật sự lọc theo loại hình.
  let categoryIdsByActivity = null;

  // ------------------------- Tải dữ liệu từ API -------------------------

  async function loadActivities() {
    try {
      const [activityList, categories] = await Promise.all([
        getActivities(),
        getCategories(),
      ]);
      activities = activityList;
      fillTypeOptions(categories);
      render();
    } catch (error) {
      console.error(error);
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">${escapeHTML(error.message || 'Không tải được danh sách hoạt động.')}</td></tr>`;
      countLabel.textContent = '';
    }
  }

  function fillTypeOptions(categories) {
    typeFilter.innerHTML = '<option value="all">Tất cả loại hình</option>'
      + categories.map((category) => `<option value="${escapeHTML(category.category_id)}">${escapeHTML(category.name)}</option>`).join('');
  }

  async function ensureCategoryIds() {
    if (categoryIdsByActivity) return;

    categoryIdsByActivity = await getCategoryIdsByActivity(activities);
  }

  // ------------------------- Hiển thị -------------------------

  function updateCounts() {
    ['all', 'active', 'pending', 'hidden', 'cancelled'].forEach((status) => {
      const element = document.querySelector(`[data-count="${status}"]`);
      if (element) {
        element.textContent = status === 'all' ? activities.length : activities.filter((item) => item.status === status).length;
      }
    });
  }

  function filteredActivities() {
    const query = normalize(searchInput.value);
    const rows = activities.filter((activity) => {
      const matchesStatus = selectedStatus === 'all' || activity.status === selectedStatus;
      const matchesType = typeFilter.value === 'all'
        || (categoryIdsByActivity && (categoryIdsByActivity[activity.activity_id] || []).includes(typeFilter.value));
      const matchesSearch = !query
        || normalize(`${activity.activity_id} ${activity.name} ${activity.business_name}`).includes(query);
      return matchesStatus && matchesType && matchesSearch;
    });

    // Hoạt động chưa có giá luôn xếp cuối khi sắp xếp theo giá.
    const priceOf = (activity, missing) => (activity.price === null || activity.price === undefined ? missing : activity.price);
    if (priceFilter.value === 'priceAsc') rows.sort((a, b) => priceOf(a, Infinity) - priceOf(b, Infinity));
    if (priceFilter.value === 'priceDesc') rows.sort((a, b) => priceOf(b, -Infinity) - priceOf(a, -Infinity));
    return rows;
  }

  function renderRows(rows) {
    if (!rows.length) {
      tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Không có hoạt động phù hợp.</td></tr>';
      return;
    }

    tableBody.innerHTML = rows.map((activity) => {
      const approve = activity.status === 'pending'
        ? '<button class="row-btn approve" data-action="approve">Duyệt</button>'
        : '';
      return `<tr data-id="${escapeHTML(activity.activity_id)}">
        <td>${escapeHTML(shortId(activity.activity_id))}</td>
        <td class="cell-title">${escapeHTML(activity.name)}</td>
        <td>${escapeHTML(activity.business_name)}</td>
        <td>${escapeHTML(formatPrice(activity.price))}</td>
        <td>${escapeHTML(formatHours(activity.time_open, activity.time_close))}</td>
        <td>${statusBadge(activity.status)}</td>
        <td><div class="row-actions"><a class="row-btn" href="activity-profile.html?id=${encodeURIComponent(activity.activity_id)}">Xem</a>${approve}</div></td>
      </tr>`;
    }).join('');
  }

  function render() {
    const rows = filteredActivities();
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * pageSize;

    renderRows(rows.slice(start, start + pageSize));
    countLabel.textContent = rows.length
      ? `Hiển thị ${start + 1}–${Math.min(start + pageSize, rows.length)} trong tổng số ${rows.length} Hoạt động`
      : 'Không có hoạt động phù hợp';
    renderPagination(pagination, totalPages, currentPage, (page) => { currentPage = page; render(); });
    updateCounts();
  }

  // ------------------------- Duyệt hoạt động -------------------------

  async function approveActivity(button) {
    const id = button.closest('tr').dataset.id;
    button.disabled = true;
    try {
      const updated = await decideActivity(id, 'approve');
      activities = activities.map((item) => (
        item.activity_id === id ? { ...item, status: updated.status, verified_by: updated.verified_by } : item
      ));
    } catch (error) {
      alert(error.message || 'Không duyệt được hoạt động này.');
    }
    render();
  }

  // ------------------------- Sự kiện -------------------------

  searchInput.addEventListener('input', () => { currentPage = 1; render(); });
  priceFilter.addEventListener('change', () => { currentPage = 1; render(); });

  typeFilter.addEventListener('change', async () => {
    currentPage = 1;
    if (typeFilter.value !== 'all') {
      typeFilter.disabled = true;
      await ensureCategoryIds();
      typeFilter.disabled = false;
    }
    render();
  });

  statusTabs.forEach((tab) => tab.addEventListener('click', () => {
    selectedStatus = tab.dataset.status;
    currentPage = 1;
    statusTabs.forEach((item) => item.classList.toggle('active', item === tab));
    render();
  }));

  tableBody.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="approve"]');
    if (button) approveActivity(button);
  });

  loadActivities();
})();
