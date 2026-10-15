(function () {
  'use strict';

  const data = window.AdminData;
  let id = new URLSearchParams(window.location.search).get('id');
  let activity = null;

  function badge(status) {
    return `<span class="badge ${data.escapeHTML(status)}">${data.statusLabels[status]}</span>`;
  }

  function safeMediaUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
    } catch (error) {
      return '#';
    }
  }

  function setInfoRows(card, values) {
    card.querySelectorAll('.info-row').forEach(row => {
      const label = row.querySelector('.info-label').textContent.trim();
      if (Object.hasOwn(values, label)) row.querySelector('.info-value').innerHTML = values[label];
    });
  }

  function showNotFound() {
    document.querySelector('.content').innerHTML = `<a href="activities.html" class="back-link">← Quay lại danh sách Hoạt động</a><div class="card" style="padding:24px;margin-top:20px;"><h3>Không tìm thấy hoạt động</h3><p>Mã “${data.escapeHTML(id)}” không tồn tại trong cơ sở dữ liệu.</p></div>`;
  }

  function renderParticipants() {
    const participants = data.participations.filter(item => item.activityId === activity.id);
    const tbody = document.getElementById('activityCustomerRows');
    tbody.innerHTML = participants.length ? participants.map(item => {
      const customer = data.customers.find(entry => entry.id === item.customerId);
      if (!customer) return '';
      const stars = item.rating ? '★'.repeat(item.rating) + '☆'.repeat(5 - item.rating) : 'Chưa có';
      return `<tr><td class="cell-title"><a href="customer-profile.html?id=${encodeURIComponent(customer.id)}" style="color:inherit;text-decoration:none;">${data.escapeHTML(customer.name)}</a></td><td>${data.escapeHTML(item.date)}</td><td>${badge(item.status)}</td><td>${stars}</td></tr>`;
    }).join('') : '<tr><td colspan="4" style="text-align:center;">Chưa có khách hàng tham gia.</td></tr>';
  }

  function render() {
    activity = data.activities.find(item => item.id === id);
    if (!activity) { showNotFound(); return; }
    const business = data.businesses.find(item => item.id === activity.businessId);
    const businessDisplay = business
      ? `<a href="business-profile.html?id=${encodeURIComponent(business.id)}" style="color:var(--rose-dark);font-weight:600;text-decoration:none;">${data.escapeHTML(business.name)}</a>`
      : data.escapeHTML(data.businessName(activity));

    document.title = `FREE2DO Admin | ${activity.name}`;
    document.querySelector('.profile-logo').textContent = activity.icon || '🗓️';
    document.querySelector('.profile-name').textContent = activity.name;
    document.querySelector('.profile-meta').innerHTML = `Mã Hoạt động: ${data.escapeHTML(activity.code)} · Doanh nghiệp: ${businessDisplay}`;
    document.querySelector('.profile-head > .badge').outerHTML = badge(activity.status);

    const cards = document.querySelectorAll('.profile-grid .card');
    setInfoRows(cards[0], {
      'Tên Hoạt động': data.escapeHTML(activity.name), 'Doanh nghiệp': businessDisplay,
      'Mô tả': data.escapeHTML(activity.description), 'Ngân sách': data.escapeHTML(activity.price),
      'Địa chỉ': data.escapeHTML(activity.address), 'Vị trí (lat, long)': data.escapeHTML(activity.location || 'Chưa cung cấp'),
      'Giờ hoạt động': data.escapeHTML(activity.hours),
      'Admin xác minh (verified_by)': data.escapeHTML(activity.verifiedBy || 'Chưa xác minh'),
      'Hạn hoạt động (expire_at)': data.escapeHTML(activity.expireAt || 'Chưa thiết lập')
    });
    setInfoRows(cards[1], {
      'Lượt xem': activity.views == null ? 'Chưa có dữ liệu' : String(activity.views),
      'Lượt tham gia': String(activity.participants),
      'Đánh giá trung bình': activity.rating ? `${activity.rating.toFixed(1)} ★` : 'Chưa có đánh giá',
      'Ngày tạo': data.escapeHTML(activity.createdAt)
    });
    // Ảnh/video của chính hoạt động (activities_media), hiển thị dạng ảnh, click để phóng to.
    // Minh chứng đăng ký doanh nghiệp nằm ở hồ sơ doanh nghiệp, không lẫn vào đây.
    document.getElementById('activityMedia').innerHTML = activity.media.length
      ? `<div class="f2d-thumbs" data-zoom-group>${activity.media.map((item, index) => item.media_type === 'video'
        ? `<div class="f2d-thumb"><video src="${data.escapeHTML(safeMediaUrl(item.media_url))}" controls preload="metadata"></video></div>`
        : `<button type="button" class="f2d-thumb" data-zoom="${data.escapeHTML(safeMediaUrl(item.media_url))}" aria-label="Phóng to ảnh ${index + 1}"><img src="${data.escapeHTML(safeMediaUrl(item.media_url))}" alt="Ảnh hoạt động ${index + 1}" loading="lazy"></button>`).join('')}</div>`
      : '<p class="f2d-empty">Hoạt động chưa có ảnh/video.</p>';
    renderParticipants();
    document.getElementById('toggleActivityVisibility').textContent = activity.status === 'hidden' ? '👁️ Hiện Hoạt động' : '🙈 Ẩn Hoạt động';
    document.getElementById('approveActivity').hidden = activity.status === 'active';
  }

  document.getElementById('toggleActivityVisibility').addEventListener('click', async () => {
    try {
      await data.setStatus('activity', activity.id, activity.status === 'hidden' ? 'active' : 'hidden'); render();
    } catch (error) { F2D.toast(error.message, 'error'); }
  });
  document.getElementById('approveActivity').addEventListener('click', async () => {
    try { await data.setStatus('activity', activity.id, 'active'); render(); }
    catch (error) { F2D.toast(error.message, 'error'); }
  });

  data.ready.then(() => { id ||= data.activities[0]?.id; render(); }).catch(error => {
    document.querySelector('.content').textContent = error.message;
  });
  window.addEventListener('free2do:admin-data-updated', render);
})();
