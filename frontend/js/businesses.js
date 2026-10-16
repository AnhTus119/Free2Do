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
  let editingBusinessId = null;
  let existingProofCount = 0;

  function activityCount(id) {
    return data.businesses.find(business => business.id === id)?.activityCount || 0;
  }

  function updateStats() {
    const summary = data.businessSummary;
    document.getElementById('totalBusinesses').textContent = summary.total_count;
    document.getElementById('activeBusinesses').textContent = summary.active_count;
    document.getElementById('pendingBusinesses').textContent = summary.pending_count;
    document.getElementById('lockedBusinesses').textContent = summary.locked_count;
  }

  function filteredBusinesses() {
    const query = data.normalize(searchInput.value);
    const businesses = data.businesses.filter(business => {
      const matchesStatus = statusFilter.value === 'all' || business.status === statusFilter.value;
      const matchesSearch = !query || data.normalize(`${business.code || ''} ${business.name} ${business.address} ${business.type}`).includes(query);
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
        <td class="cell-code">${data.escapeHTML(business.code || 'Chờ duyệt')}</td>
        <td><div class="cell-title">${data.escapeHTML(business.name)}</div><div class="cell-sub">${data.escapeHTML(business.address)}</div></td>
        <td>${data.escapeHTML(business.type)}</td><td>${activityCount(business.id)}</td>
        <td><span class="badge ${data.escapeHTML(business.status)}">${data.statusLabels[business.status]}</span></td>
        <td><div class="row-actions"><a class="row-btn" href="business-profile.html?id=${encodeURIComponent(business.id)}">Xem</a>${business.requestId ? '' : '<button type="button" class="row-btn" data-action="edit">Sửa</button>'}${action}</div></td>
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
  const editDialog = document.getElementById('editBusinessDialog');
  async function openBusinessEditor(business) {
    if (business.requestId) return;
    editingBusinessId = business.id;
    existingProofCount = 0;
    document.getElementById('editBusinessName').value = business.name || '';
    document.getElementById('editBusinessPhone').value = business.phone || '';
    document.getElementById('editBusinessAddress').value = business.address === 'Chưa có dữ liệu' ? '' : (business.address || '');
    document.getElementById('editBusinessDescription').value = business.description === 'Chưa có mô tả.' ? '' : (business.description || '');
    document.getElementById('editBusinessProofs').value = '';
    document.getElementById('editBusinessProofsSelection').textContent = 'Mọi định dạng · không giới hạn số lượng';
    document.getElementById('editBusinessProofsNote').textContent = 'Đang tải thông tin minh chứng...';
    editDialog.showModal();
    try {
      const [requests, directProofs] = await Promise.all([
        window.AdminAuth.authFetch(`/operator/business-requests?user_id=${encodeURIComponent(business.id)}&status=approved`),
        window.AdminAuth.authFetch(`/operator/business-profiles/${encodeURIComponent(business.id)}/proofs`),
      ]);
      if (editingBusinessId !== business.id) return;
      existingProofCount = requests.reduce((total, request) => total + (request.proofs?.length || 0), 0) + directProofs.length;
      document.getElementById('editBusinessProofsNote').textContent = `Đã có ${existingProofCount} file minh chứng.`;
    } catch (error) {
      document.getElementById('editBusinessProofsNote').textContent = `Không tải được thông tin minh chứng: ${error.message}`;
    }
  }

  async function uploadBusinessProofs(businessId, files) {
    const form = new FormData();
    [...files].forEach(file => form.append('files', file));
    const response = await fetch(`${window.AdminAuth.API_BASE_URL}/operator/business-profiles/${encodeURIComponent(businessId)}/proofs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: form,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.detail || 'Không tải được file minh chứng lên.');
    window.FREE2DO_CACHE.clear();
    return result;
  }

  function bindFileDropzone(dropzoneId, inputId, selectionId, emptyLabel, multiple) {
    const dropzone = document.getElementById(dropzoneId);
    const input = document.getElementById(inputId);
    const selection = document.getElementById(selectionId);
    const updateSelection = () => {
      const names = [...input.files].map(file => file.name);
      selection.textContent = names.length
        ? `${names.length} file đã chọn: ${names.join(', ')}`
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
      const files = [...event.dataTransfer.files];
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
    'editBusinessProofsDropzone',
    'editBusinessProofs',
    'editBusinessProofsSelection',
    'Mọi định dạng · không giới hạn số lượng',
    true,
  );

  document.getElementById('closeBusinessEdit').addEventListener('click', () => editDialog.close());
  document.getElementById('cancelBusinessEdit').addEventListener('click', () => editDialog.close());
  editDialog.addEventListener('click', event => {
    if (event.target === editDialog) editDialog.close();
  });
  document.getElementById('editBusinessForm').addEventListener('submit', event => {
    event.preventDefault();
    const name = document.getElementById('editBusinessName').value.trim();
    if (!name) return F2D.toast('Tên doanh nghiệp không được để trống.', 'error');
    const button = document.getElementById('saveBusinessEdit');
    F2D.busy(button, async () => {
      try {
        const proofFiles = document.getElementById('editBusinessProofs').files;
        await window.AdminAuth.authFetch(`/operator/business-profiles/${encodeURIComponent(editingBusinessId)}`, {
          method: 'PATCH',
          toast: false,
          body: JSON.stringify({
            business_name: name,
            phone: document.getElementById('editBusinessPhone').value.trim() || null,
            business_address: document.getElementById('editBusinessAddress').value.trim() || null,
            description: document.getElementById('editBusinessDescription').value.trim() || null,
          }),
        });
        if (proofFiles.length) {
          const media = await uploadBusinessProofs(editingBusinessId, proofFiles);
          existingProofCount += media.length;
          document.getElementById('editBusinessProofsNote').textContent = `Đã có ${existingProofCount} file minh chứng.`;
        }
        editDialog.close();
        await data.refresh();
        render();
        F2D.toast(proofFiles.length ? 'Đã cập nhật hồ sơ và tải minh chứng lên.' : 'Đã cập nhật hồ sơ doanh nghiệp.');
      } catch (error) {
        F2D.toast(error.message, 'error');
      }
    });
  });

  tableBody.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = button.closest('tr').dataset.id;
    if (button.dataset.action === 'edit') {
      const business = data.businesses.find(item => item.id === id);
      if (business) await openBusinessEditor(business);
      return;
    }
    const nextStatus = button.dataset.action === 'approve' || button.dataset.action === 'unlock' ? 'active' : 'locked';
    button.disabled = true;
    try {
      await data.setStatus('business', id, nextStatus);
      render();
    } catch (error) {
      F2D.toast(error.message, 'error');
      button.disabled = false;
    }
  });

  data.ready.then(render).catch(error => { tableBody.innerHTML = `<tr><td colspan="6">${data.escapeHTML(error.message)}</td></tr>`; });
  window.addEventListener('free2do:admin-data-updated', render);
})();
