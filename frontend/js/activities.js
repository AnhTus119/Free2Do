(function () {
  'use strict';

  const data = window.AdminData;
  const tableBody = document.getElementById('activityRows');
  const searchInput = document.getElementById('activitySearch');
  const typeFilter = document.getElementById('typeFilter');
  const priceFilter = document.getElementById('priceFilter');
  const businessFilter = document.getElementById('businessFilter');
  const activeFilters = document.getElementById('activeFilters');
  // activities.html?business_id=... (từ hồ sơ doanh nghiệp "Xem tất cả") tự lọc theo doanh nghiệp đó.
  let selectedBusiness = new URLSearchParams(location.search).get('business_id') || 'all';
  const countLabel = document.getElementById('activityCount');
  const pagination = document.getElementById('activityPagination');
  const statusTabs = document.querySelectorAll('.status-tab');
  const pageSize = 10;
  let currentPage = 1;
  // Link từ cảnh báo ở Tổng quan: activities.html?status=pending mở sẵn tab tương ứng.
  let selectedStatus = new URLSearchParams(location.search).get('status') || 'all';

  function startingPrice(activity) {
    return Number(activity.price.split('–')[0].replace(/\D/g, '')) || 0;
  }

  function updateCounts() {
    const summary = data.activitySummary;
    const counts = {
      all: summary.total_count, active: summary.active_count, pending: summary.pending_count,
      hidden: summary.hidden_count, rejected: summary.rejected_count, expired: summary.expired_count,
      cancelled: summary.cancelled_count,
    };
    ['all', 'active', 'pending', 'hidden', 'rejected', 'expired', 'cancelled'].forEach(status => {
      const element = document.querySelector(`[data-count="${status}"]`);
      if (element) element.textContent = counts[status];
    });
  }

  // Tab "Tất cả": chờ duyệt lên đầu (chờ lâu nhất trước, tránh quá hạn), rồi đang hoạt động, từ chối, hết hạn, đã ẩn, đã hủy.
  const STATUS_ORDER = { pending: 0, active: 1, rejected: 2, expired: 3, hidden: 4, cancelled: 5 };
  const statusRank = activity => STATUS_ORDER[activity.status] ?? 1;
  const byStatus = (a, b) => statusRank(a) - statusRank(b)
    || (a.status === 'pending' && b.status === 'pending' ? String(a.createdRaw).localeCompare(String(b.createdRaw)) : 0);

  // Bộ lọc loại hình lấy đủ các tag hiện có trong database (tag mới operator thêm sẽ tự xuất hiện).
  function renderTypeFilter() {
    const selected = typeFilter.value || 'all';
    const categories = [...data.categories].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    typeFilter.innerHTML = '<option value="all">Tất cả loại hình</option>'
      + categories.map(item => `<option value="${data.escapeHTML(item.category_id)}">${data.escapeHTML(item.name)}</option>`).join('');
    typeFilter.value = categories.some(item => item.category_id === selected) ? selected : 'all';
  }

  function filteredActivities() {
    const query = data.normalize(searchInput.value);
    const activities = data.activities.filter(activity => {
      const matchesStatus = selectedStatus === 'all' || activity.status === selectedStatus;
      const matchesType = typeFilter.value === 'all' || activity.categoryIds.includes(typeFilter.value);
      const matchesBusiness = selectedBusiness === 'all' || activity.businessId === selectedBusiness;
      const matchesSearch = !query || data.normalize(`${activity.code} ${activity.name} ${data.businessName(activity)}`).includes(query);
      return matchesStatus && matchesType && matchesBusiness && matchesSearch;
    });
    if (priceFilter.value === 'priceAsc') activities.sort((a, b) => startingPrice(a) - startingPrice(b));
    if (priceFilter.value === 'priceDesc') activities.sort((a, b) => startingPrice(b) - startingPrice(a));
    if (selectedStatus === 'all') activities.sort(byStatus); // sort ổn định: giữ thứ tự giá/mới nhất trong từng nhóm
    return activities;
  }

  function renderRows(activities) {
    if (!activities.length) {
      tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Không có hoạt động phù hợp.</td></tr>';
      return;
    }
    tableBody.innerHTML = activities.map(activity => {
      const approve = activity.status === 'pending'
        ? '<button type="button" class="row-btn approve" data-action="approve">Duyệt</button><button type="button" class="row-btn reject" data-action="reject">Từ chối</button>'
        : activity.status === 'active' ? '<button type="button" class="row-btn danger" data-action="delete">Xóa</button>' : '';
      return `<tr data-id="${data.escapeHTML(activity.id)}" data-type="${data.escapeHTML(activity.type)}">
        <td class="cell-code">${data.escapeHTML(activity.code)}</td><td class="cell-title">${data.escapeHTML(activity.name)}</td>
        <td>${data.escapeHTML(data.businessName(activity))}</td><td>${data.escapeHTML(activity.price)}</td><td>${data.escapeHTML(activity.hours)}</td>
        <td><span class="badge ${data.escapeHTML(activity.status)}">${data.statusLabels[activity.status]}</span></td>
        <td><div class="row-actions"><a class="row-btn" href="activity-profile.html?id=${encodeURIComponent(activity.id)}">Xem</a><button type="button" class="row-btn" data-action="edit">Sửa</button>${approve}</div></td>
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

  function renderBusinessFilter() {
    const businesses = data.businesses.filter(item => !item.requestId).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    businessFilter.innerHTML = '<option value="all">Tất cả doanh nghiệp</option>'
      + businesses.map(item => `<option value="${data.escapeHTML(item.id)}">${data.escapeHTML(item.name)}</option>`).join('');
    if (selectedBusiness !== 'all' && !businesses.some(item => item.id === selectedBusiness)) {
      businessFilter.insertAdjacentHTML('beforeend', `<option value="${data.escapeHTML(selectedBusiness)}">Doanh nghiệp không tồn tại</option>`);
    }
    businessFilter.value = selectedBusiness;
    const name = businessFilter.selectedOptions[0]?.textContent;
    activeFilters.innerHTML = selectedBusiness === 'all' ? ''
      : `<span class="filter-chip">Doanh nghiệp: ${data.escapeHTML(name)}<button type="button" data-clear-business aria-label="Xóa bộ lọc doanh nghiệp">✕</button></span>`;
  }

  function setBusiness(value) {
    selectedBusiness = value || 'all';
    const url = new URL(location.href);
    if (selectedBusiness === 'all') url.searchParams.delete('business_id'); else url.searchParams.set('business_id', selectedBusiness);
    history.replaceState(null, '', url);
    currentPage = 1;
    render();
  }

  function render() {
    renderBusinessFilter();
    renderTypeFilter();
    const activities = filteredActivities();
    const totalPages = Math.max(1, Math.ceil(activities.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * pageSize;
    renderRows(activities.slice(start, start + pageSize));
    countLabel.textContent = activities.length
      ? `Hiển thị ${start + 1}-${Math.min(start + pageSize, activities.length)} trong tổng số ${activities.length} hoạt động`
      : 'Không có hoạt động phù hợp';
    renderPagination(totalPages); updateCounts();
  }

  [searchInput, typeFilter, priceFilter].forEach(control => control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', () => { currentPage = 1; render(); }));
  businessFilter.addEventListener('change', () => setBusiness(businessFilter.value));
  activeFilters.addEventListener('click', event => { if (event.target.closest('[data-clear-business]')) setBusiness('all'); });
  if (![...statusTabs].some(tab => tab.dataset.status === selectedStatus)) selectedStatus = 'all';
  statusTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.status === selectedStatus));
  statusTabs.forEach(tab => tab.addEventListener('click', () => {
    selectedStatus = tab.dataset.status; currentPage = 1;
    statusTabs.forEach(item => item.classList.toggle('active', item === tab)); render();
  }));
  const editDialog = document.getElementById('editActivityDialog');
  const editForm = document.getElementById('editActivityForm');
  const editInput = id => document.getElementById(id);
  let editingActivityId = null;

  function setDateTimeInput(id, value) {
    editInput(id).value = value ? String(value).slice(0, 10) : '';
  }
  function setTimeInput(id, value) {
    const match = String(value || '').match(/T(\d{2}:\d{2})/);
    editInput(id).value = match ? match[1] : '';
  }
  function renderEditCategories(categories, selectedIds) {
    const box = editInput('editActivityCategories');
    box.innerHTML = categories.length ? categories.map(category => `
      <button type="button" class="admin-category-option" value="${data.escapeHTML(category.category_id)}" aria-pressed="${selectedIds.includes(category.category_id)}">
        ${data.escapeHTML(category.name)}
      </button>`).join('') : '<span class="f2d-empty">Chưa có danh mục.</span>';
  }
  function setUntilDisabled(disabled) {
    editInput('editActivityUntil').disabled = disabled;
    editInput('editActivityUntilField').classList.toggle('is-disabled', disabled);
  }
  function updateExistingMediaNotice(count) {
    editInput('editActivityExistingMedia').textContent = count
      ? `Đã có ${count} ảnh/video. Tải ảnh bìa mới sẽ thay ảnh bìa hiện tại.`
      : 'Hoạt động chưa có ảnh/video.';
  }
  function bindFileDropzone(dropzoneId, inputId, selectionId, emptyLabel, multiple) {
    const dropzone = editInput(dropzoneId);
    const input = editInput(inputId);
    const selection = editInput(selectionId);
    const updateSelection = () => {
      selection.textContent = input.files.length
        ? [...input.files].map(file => file.name).join(', ')
        : emptyLabel;
    };
    input.addEventListener('change', updateSelection);
    ['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, event => {
      event.preventDefault();
      dropzone.classList.add('is-dragging');
    }));
    ['dragleave', 'dragend'].forEach(type => dropzone.addEventListener(type, event => {
      event.preventDefault();
      dropzone.classList.remove('is-dragging');
    }));
    dropzone.addEventListener('drop', event => {
      event.preventDefault();
      dropzone.classList.remove('is-dragging');
      const files = [...event.dataTransfer.files].filter(file => {
        if (input.accept === 'image/*') return file.type.startsWith('image/');
        return file.type.startsWith('image/') || file.type.startsWith('video/');
      });
      const pickedFiles = multiple ? files : files.slice(0, 1);
      if (!pickedFiles.length) {
        F2D.toast('Định dạng file không được hỗ trợ.', 'error');
        return;
      }
      const transfer = new DataTransfer();
      pickedFiles.forEach(file => transfer.items.add(file));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  bindFileDropzone(
    'editActivityCoverDropzone',
    'editActivityCover',
    'editActivityCoverSelection',
    'Chọn một ảnh bìa',
    false,
  );
  bindFileDropzone(
    'editActivityMediaDropzone',
    'editActivityMedia',
    'editActivityMediaSelection',
    'Có thể chọn nhiều file',
    true,
  );
  async function openActivityEditor(id) {
    editingActivityId = id;
    editDialog.showModal();
    editInput('editActivitySubtitle').textContent = 'Đang tải thông tin mới nhất...';
    editInput('editActivityCategories').innerHTML = '<span class="f2d-empty">Đang tải danh mục...</span>';
    editInput('editActivityCover').value = '';
    editInput('editActivityMedia').value = '';
    editInput('editActivityCoverSelection').textContent = 'Chọn một ảnh bìa';
    editInput('editActivityMediaSelection').textContent = 'Có thể chọn nhiều file';
    try {
      const [activity, categories] = await Promise.all([
        window.AdminAuth.authFetch(`/operator/activities/${encodeURIComponent(id)}`),
        window.AdminAuth.authFetch('/categories'),
      ]);
      editingActivityId = activity.activity_id;
      editInput('editActivitySubtitle').textContent = `${activity.code || 'Hoạt động'} · ${activity.business_name}`;
      editInput('editActivityName').value = activity.name || '';
      editInput('editActivityDescription').value = activity.description || '';
      editInput('editActivityPrice').value = activity.price ?? '';
      editInput('editActivityAddress').value = activity.address || '';
      editInput('editActivityMaps').value = activity.google_maps_url || '';
      setTimeInput('editActivityOpen', activity.time_open);
      setTimeInput('editActivityClose', activity.time_close);
      setDateTimeInput('editActivityFrom', activity.available_from);
      setDateTimeInput('editActivityUntil', activity.available_until);
      editInput('editActivityAlways').checked = Boolean(activity.always_available);
      setUntilDisabled(Boolean(activity.always_available));
      renderEditCategories(categories, activity.category_ids || []);
      const media = activity.media || [];
      updateExistingMediaNotice(media.length);
    } catch (error) {
      editDialog.close();
      F2D.toast(error.message, 'error');
    }
  }

  async function uploadActivityMedia(activityId, file, kind) {
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`${window.AdminAuth.API_BASE_URL}/operator/activities/${encodeURIComponent(activityId)}/media/upload?media_kind=${kind}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${window.AdminAuth.getToken()}` },
      body: form,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.detail || 'Không tải được ảnh/video lên.');
  }

  editInput('editActivityAlways').addEventListener('change', event => {
    setUntilDisabled(event.target.checked);
    if (event.target.checked) editInput('editActivityUntil').value = '';
  });
  editInput('editActivityCategories').addEventListener('click', event => {
    const category = event.target.closest('.admin-category-option');
    if (category) category.setAttribute('aria-pressed', category.getAttribute('aria-pressed') !== 'true');
  });
  editInput('closeActivityEdit').addEventListener('click', () => editDialog.close());
  editInput('cancelActivityEdit').addEventListener('click', () => editDialog.close());
  editDialog.addEventListener('click', event => {
    if (event.target === editDialog) editDialog.close();
  });
  editForm.addEventListener('submit', async event => {
    event.preventDefault();
    const name = editInput('editActivityName').value.trim();
    const address = editInput('editActivityAddress').value.trim();
    const mapsUrl = editInput('editActivityMaps').value.trim();
    const description = editInput('editActivityDescription').value.trim();
    if (!name || !address || !mapsUrl || !description) return F2D.toast('Hãy nhập tên, mô tả, địa chỉ và link Google Maps.', 'error');
    const cover = editInput('editActivityCover').files[0];
    const coverProblem = cover && F2D.imageProblem(cover);
    if (coverProblem) return F2D.toast(coverProblem, 'error');
    const saved = await F2D.ask({
      title: 'Lưu thay đổi hoạt động?', text: 'Thông tin mới sẽ hiển thị ngay với khách hàng.', ok: 'Lưu thay đổi',
      done: 'Đã cập nhật thông tin hoạt động.',
      run: async () => {
        const timeValue = id => editInput(id).value ? `2000-01-01T${editInput(id).value}:00` : null;
        const dateValue = id => editInput(id).value ? `${editInput(id).value}T00:00:00` : null;
        const activity = await window.AdminAuth.authFetch(`/operator/activities/${encodeURIComponent(editingActivityId)}`, {
          method: 'PATCH',
          toast: false,
          body: JSON.stringify({
            name,
            description,
            price: editInput('editActivityPrice').value === '' ? null : Number(editInput('editActivityPrice').value),
            address,
            google_maps_url: mapsUrl,
            time_open: timeValue('editActivityOpen'),
            time_close: timeValue('editActivityClose'),
            available_from: dateValue('editActivityFrom'),
            available_until: editInput('editActivityAlways').checked ? null : dateValue('editActivityUntil'),
            always_available: editInput('editActivityAlways').checked,
            category_ids: [...editInput('editActivityCategories').querySelectorAll('.admin-category-option[aria-pressed="true"]')].map(button => button.value),
          }),
        });
        if (cover) await uploadActivityMedia(activity.activity_id, cover, 'cover');
        for (const file of editInput('editActivityMedia').files) await uploadActivityMedia(activity.activity_id, file, 'gallery');
        return activity;
      },
    });
    if (!saved) return;
    editDialog.close();
    await data.refresh().catch(error => F2D.toast(error.message, 'error'));
    render();
  });

  tableBody.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'edit') {
      await openActivityEditor(button.closest('tr').dataset.id);
      return;
    }
    const id = button.closest('tr').dataset.id;
    const activity = data.activities.find(item => item.id === id);
    const label = activity ? `${activity.code} · ${activity.name}` : 'hoạt động này';
    if (button.dataset.action === 'reject') {
      const rejected = await F2D.ask({
        title: 'Từ chối hoạt động', text: `Doanh nghiệp sẽ nhận email kèm lý do từ chối "${label}".`,
        ok: 'Từ chối', danger: true, done: 'Đã từ chối hoạt động và gửi email cho doanh nghiệp.',
        input: { label: 'Lý do từ chối', placeholder: 'Ví dụ: Ảnh không đúng địa điểm, thiếu giờ mở cửa...', multiline: true, minLength: 3, requiredMessage: 'Hãy nhập lý do từ chối (ít nhất 3 ký tự).' },
        run: reason => data.rejectActivity(id, reason, { quiet: true }),
      });
      if (rejected) render();
      return;
    }
    if (button.dataset.action === 'delete') {
      const deleted = await F2D.ask({
        title: 'Xóa hoạt động?', text: `"${label}" sẽ bị gỡ khỏi FREE2DO và chuyển sang mục Đã hủy (xóa vĩnh viễn sau 60 ngày). Khách hàng sẽ không còn thấy hoạt động này.`,
        ok: 'Xóa hoạt động', danger: true, done: 'Đã xóa hoạt động.',
        run: () => data.deleteActivity(id, { quiet: true }),
      });
      if (deleted) render();
      return;
    }
    if (button.dataset.action !== 'approve') return;
    await runRowAction(button, () => data.setStatus('activity', id, 'active'));
  });

  async function runRowAction(button, action) {
    button.disabled = true;
    try {
      await action();
      render();
    } catch (error) {
      F2D.toast(error.message, 'error');
      button.disabled = false;
    }
  }

  data.ready.then(async () => {
    render();
    const editId = new URLSearchParams(location.search).get('edit_id');
    if (editId) await openActivityEditor(editId);
  }).catch(error => { tableBody.innerHTML = `<tr><td colspan="7">${data.escapeHTML(error.message)}</td></tr>`; });
  window.addEventListener('free2do:admin-data-updated', render);
})();
