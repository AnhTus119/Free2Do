(function () {
  'use strict';

  const data = window.AdminData;
  let id = new URLSearchParams(window.location.search).get('id');
  let customer = null;

  function badge(status) {
    return `<span class="badge ${data.escapeHTML(status)}">${data.statusLabels[status]}</span>`;
  }

  function showNotFound() {
    document.querySelector('.content').innerHTML = `
      <a href="customers.html" class="back-link">← Quay lại danh sách Khách hàng</a>
      <div class="card" style="padding:24px;margin-top:20px;">
        <h3>Không tìm thấy khách hàng</h3>
        <p>Mã khách hàng “${data.escapeHTML(id)}” không tồn tại trong cơ sở dữ liệu.</p>
      </div>`;
  }

  function setInfoRows(card, values) {
    card.querySelectorAll('.info-row').forEach(row => {
      const label = row.querySelector('.info-label').textContent.trim();
      if (Object.hasOwn(values, label)) row.querySelector('.info-value').innerHTML = values[label];
    });
  }

  function ratingStars(rating) {
    return rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : '—';
  }

  function render() {
    customer = data.customers.find(item => item.id === id);
    if (!customer) { showNotFound(); return; }

    document.title = `FREE2DO Admin — ${customer.name}`;
    document.querySelector('.profile-logo').textContent = customer.name.trim().charAt(0).toUpperCase();
    document.querySelector('.profile-name').textContent = customer.name;
    document.querySelector('.profile-meta').textContent = `${customer.id} · ${customer.email} · Đăng ký ngày ${customer.registeredAt}`;
    document.querySelector('.profile-head > .badge').outerHTML = badge(customer.status);

    const cards = document.querySelectorAll('.profile-grid .card');
    const participationRows = data.participations.filter(item => item.customerId === customer.id);

    setInfoRows(cards[0], {
      'Họ và tên': data.escapeHTML(customer.name),
      'Email': data.escapeHTML(customer.email),
      'Số điện thoại': data.escapeHTML(customer.phone),
      'Khu vực': data.escapeHTML(customer.area),
      'Ngày đăng ký': data.escapeHTML(customer.registeredAt),
      'Đăng nhập gần nhất': data.escapeHTML(customer.lastLogin),
      'Trạng thái tài khoản': badge(customer.status)
    });
    setInfoRows(cards[1], {
      'Hoạt động đã tham gia': String(customer.participationCount),
      'Đánh giá đã viết': String(customer.reviewCount),
      'Hoạt động gần nhất': customer.lastActivityAt ? data.escapeHTML(customer.lastActivityAt) : 'Chưa có',
      'Sở thích đã chọn': data.escapeHTML(customer.interests.join(', '))
    });

    const tbody = document.getElementById('customerActivityRows');
    tbody.innerHTML = participationRows.length ? participationRows.map(item => {
      const activity = data.activities.find(entry => entry.id === item.activityId);
      if (!activity) return '';
      const business = data.businessName(activity);
      return `<tr>
        <td class="cell-title"><a href="activity-profile.html?id=${encodeURIComponent(activity.id)}" style="color:inherit;text-decoration:none;">${data.escapeHTML(activity.name)}</a></td>
        <td>${data.escapeHTML(business)}</td><td>${data.escapeHTML(item.date)}</td>
        <td>${badge(item.status)}</td><td>${ratingStars(item.rating)}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="5" style="text-align:center;">Khách hàng chưa tham gia hoạt động nào.</td></tr>';

    const toggleButton = document.getElementById('toggleCustomerStatus');
    toggleButton.textContent = customer.status === 'locked' ? '🔓 Mở khóa tài khoản' : '🔒 Khóa tài khoản';
  }

  document.getElementById('toggleCustomerStatus').addEventListener('click', async () => {
    try {
      await data.setStatus('customer', customer.id, customer.status === 'locked' ? 'active' : 'locked');
      render();
    } catch (error) { alert(error.message); }
  });

  data.ready.then(() => { id ||= data.customers[0]?.id; render(); }).catch(error => {
    document.querySelector('.content').textContent = error.message;
  });
})();
