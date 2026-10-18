(function () {
  'use strict';

  const data = window.AdminData;
  let id = new URLSearchParams(window.location.search).get('id');
  let business = null;

  function badge(status) {
    return `<span class="badge ${data.escapeHTML(status)}">${data.statusLabels[status]}</span>`;
  }

  function setInfoRows(card, values) {
    card.querySelectorAll('.info-row').forEach(row => {
      const label = row.querySelector('.info-label').textContent.trim();
      if (Object.hasOwn(values, label)) row.querySelector('.info-value').innerHTML = values[label];
    });
  }

  function showNotFound() {
    document.querySelector('.content').innerHTML = `<a href="businesses.html" class="back-link">← Quay lại danh sách Doanh nghiệp</a><div class="card" style="padding:24px;margin-top:20px;"><h3>Không tìm thấy doanh nghiệp</h3><p>Mã “${data.escapeHTML(id)}” không tồn tại trong cơ sở dữ liệu.</p></div>`;
  }

  function render() {
    business = data.businesses.find(item => item.id === id);
    if (!business) { showNotFound(); return; }
    data.renderActionLogs(document.getElementById('actionLogs'), 'business', business.userId || business.id);
    const activities = data.activities.filter(activity => activity.businessId === business.id);
    document.title = `FREE2DO Admin | ${business.name}`;
    document.querySelector('.profile-logo').textContent = business.name.trim().charAt(0).toUpperCase();
    document.querySelector('.profile-name').textContent = business.name;
    document.querySelector('.profile-meta').textContent = `Mã Doanh nghiệp: ${business.code || 'Yêu cầu chờ duyệt'} · ${business.type} · ${business.address}`;
    document.querySelector('.profile-head > .badge').outerHTML = badge(business.status);

    const cards = document.querySelectorAll('.profile-grid .card');
    setInfoRows(cards[0], {
      'Tên Doanh nghiệp': data.escapeHTML(business.name), 'Loại hình': data.escapeHTML(business.type),
      'Số điện thoại': data.escapeHTML(business.phone || 'Chưa cung cấp'), 'Giờ mở cửa': data.escapeHTML(business.hours),
      'Giá tham khảo': data.escapeHTML(business.priceRange),
      'Admin xác minh (verified_by)': data.escapeHTML(business.verifiedBy || 'Chưa xác minh'),
      'Mô tả': data.escapeHTML(business.description)
    });
    setInfoRows(cards[1], {
      'Tổng Hoạt động': String(business.activityCount),
      'Đang hoạt động': String(business.activeActivityCount),
      'Chờ duyệt': String(business.pendingActivityCount),
      'Đánh giá trung bình': business.averageRating == null ? 'Chưa có dữ liệu' : `${business.averageRating.toFixed(1)} ★`
    });

    document.getElementById('businessActivitiesLink').href = `activities.html?business_id=${encodeURIComponent(business.id)}`;
    renderProofs();
    document.getElementById('businessActivityTitle').textContent = `Hoạt động của Doanh nghiệp này (${business.activityCount})`;
    document.getElementById('businessActivityRows').innerHTML = activities.length ? activities.map(activity => `<tr>
      <td class="cell-code">${data.escapeHTML(activity.code)}</td><td>${data.escapeHTML(activity.address)}</td><td>${data.escapeHTML(activity.hours)}</td>
      <td>${badge(activity.status)}</td><td><a class="row-btn" href="activity-profile.html?id=${encodeURIComponent(activity.id)}">Xem</a></td>
    </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;">Doanh nghiệp chưa có hoạt động.</td></tr>';

    const toggleButton = document.getElementById('toggleBusinessStatus');
    toggleButton.textContent = business.status === 'locked' ? '🔓 Mở khóa Doanh nghiệp' : '🔒 Khóa Doanh nghiệp';
  }

  // Minh chứng từ đơn đăng ký và hồ sơ doanh nghiệp, tách riêng khỏi ảnh hoạt động.
  let proofsFor = null;
  async function renderProofs() {
    if (proofsFor === business.id) return;
    proofsFor = business.id;
    const box = document.getElementById('businessProofs');
    try {
      const [requests, profileProofs] = await Promise.all([
        business.requestId
          ? window.AdminAuth.authFetch(`/operator/business-requests/${encodeURIComponent(business.requestId)}`).then(request => [request])
          : window.AdminAuth.authFetch(`/operator/business-requests?user_id=${encodeURIComponent(business.id)}&status=approved`),
        window.AdminAuth.authFetch(`/operator/business-profiles/${encodeURIComponent(business.id)}/proofs`),
      ]);
      const proofs = [
        ...requests.flatMap(request => request.proofs || []),
        ...profileProofs,
      ];
      box.innerHTML = proofs.length
        ? `<div class="f2d-thumbs" data-zoom-group>${proofs.map((proof, index) => {
          if (proof.media_type && proof.media_type !== 'image') {
            const fileName = new URL(proof.media_url).pathname.split('/').pop() || `Minh-chung-${index + 1}`;
            return `<a class="f2d-proof-file" href="${data.escapeHTML(proof.media_url)}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">📎</span><span>${data.escapeHTML(fileName)}</span></a>`;
          }
          return `<button type="button" class="f2d-thumb" data-zoom="${data.escapeHTML(proof.media_url)}" aria-label="Phóng to minh chứng ${index + 1}"><img src="${data.escapeHTML(proof.media_url)}" alt="Minh chứng ${index + 1}" loading="lazy"></button>`;
        }).join('')}</div>`
        : '<p class="f2d-empty">Doanh nghiệp chưa gửi file minh chứng.</p>';
    } catch (error) {
      box.innerHTML = `<p class="f2d-empty">${data.escapeHTML(error.message)}</p>`;
    }
  }

  const editDialog = document.getElementById('editBusinessDialog');
  document.getElementById('closeBusinessProfileEdit').addEventListener('click', () => editDialog.close());
  document.getElementById('editBusiness').addEventListener('click', () => {
    if (!business || business.requestId) return F2D.toast('Chỉ sửa được hồ sơ của doanh nghiệp đã được duyệt.', 'error');
    document.getElementById('ebName').value = business.name || '';
    document.getElementById('ebPhone').value = business.phone || '';
    document.getElementById('ebAddress').value = business.address === 'Chưa có dữ liệu' ? '' : (business.address || '');
    document.getElementById('ebDescription').value = business.description === 'Chưa có mô tả.' ? '' : (business.description || '');
    editDialog.showModal();
  });
  document.getElementById('ebCancel').addEventListener('click', () => editDialog.close());
  document.getElementById('editBusinessForm').addEventListener('submit', async event => {
    event.preventDefault();
    const name = document.getElementById('ebName').value.trim();
    if (!name) return F2D.toast('Tên doanh nghiệp không được để trống.', 'error');
    const saved = await F2D.ask({
      title: 'Lưu hồ sơ doanh nghiệp?', text: `Thông tin mới của "${name}" sẽ hiển thị ngay với khách hàng.`, ok: 'Lưu thay đổi',
      done: 'Đã chỉnh sửa thành công.',
      run: () => window.AdminAuth.authFetch(`/operator/business-profiles/${encodeURIComponent(business.id)}`, {
        method: 'PATCH', toast: false,
        body: JSON.stringify({
          business_name: name,
          phone: document.getElementById('ebPhone').value.trim() || null,
          business_address: document.getElementById('ebAddress').value.trim() || null,
          description: document.getElementById('ebDescription').value.trim() || null,
        }),
      }),
    });
    if (!saved) return;
    editDialog.close();
    await data.refresh().catch(error => F2D.toast(error.message, 'error'));
    render();
  });

  document.getElementById('toggleBusinessStatus').addEventListener('click', async () => {
    if (await data.confirmStatus('business', business.id, business.status === 'locked' ? 'active' : 'locked', business.name)) render();
  });

  data.ready.then(() => { id ||= data.businesses[0]?.id; render(); }).catch(error => {
    document.querySelector('.content').textContent = error.message;
  });
  window.addEventListener('free2do:admin-data-updated', render);
})();
