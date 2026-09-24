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
    const activities = data.activities.filter(activity => activity.businessId === business.id);
    document.title = `FREE2DO Admin — ${business.name}`;
    document.querySelector('.profile-logo').textContent = business.name.trim().charAt(0).toUpperCase();
    document.querySelector('.profile-name').textContent = business.name;
    document.querySelector('.profile-meta').textContent = `Mã Doanh nghiệp: ${business.id} · ${business.type} · ${business.address}`;
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

    document.getElementById('businessActivityTitle').textContent = `Hoạt động của Doanh nghiệp này (${business.activityCount})`;
    document.getElementById('businessActivityRows').innerHTML = activities.length ? activities.map(activity => `<tr>
      <td>${data.escapeHTML(activity.id)}</td><td>${data.escapeHTML(activity.address)}</td><td>${data.escapeHTML(activity.hours)}</td>
      <td>${badge(activity.status)}</td><td><a class="row-btn" href="activity-profile.html?id=${encodeURIComponent(activity.id)}">Xem</a></td>
    </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;">Doanh nghiệp chưa có hoạt động.</td></tr>';

    const toggleButton = document.getElementById('toggleBusinessStatus');
    toggleButton.textContent = business.status === 'locked' ? '🔓 Mở khóa Doanh nghiệp' : '🔒 Khóa Doanh nghiệp';
  }

  document.getElementById('toggleBusinessStatus').addEventListener('click', async () => {
    try {
      await data.setStatus('business', business.id, business.status === 'locked' ? 'active' : 'locked');
      render();
    } catch (error) { alert(error.message); }
  });

  data.ready.then(() => { id ||= data.businesses[0]?.id; render(); }).catch(error => {
    document.querySelector('.content').textContent = error.message;
  });
})();
