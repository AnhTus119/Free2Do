(function () {
  'use strict';

  const {
    requireOperatorAuth, escapeHTML, statusBadge, shortId, formatDate, ratingStars,
    setInfoRows, getQueryParam, showNotFound,
  } = window.AdminAuth;
  const { getUser, setUserStatus, getReviewsByUser } = window.AdminData;

  requireOperatorAuth();

  const id = getQueryParam('id');
  let customer = null;

  const toggleButton = document.getElementById('toggleCustomerStatus');

  function notFound(message) {
    showNotFound('customers.html', 'Quay lại danh sách Khách hàng', 'Không tìm thấy khách hàng', message);
  }

  // ------------------------- Tải dữ liệu từ API -------------------------

  async function loadCustomer() {
    if (!id) {
      notFound('Thiếu mã khách hàng trên đường dẫn.');
      return;
    }

    try {
      customer = await getUser(id);
    } catch (error) {
      notFound(error.message || 'Không tải được thông tin khách hàng.');
      return;
    }

    renderCustomer();
    loadReviews();
  }

  async function loadReviews() {
    try {
      renderReviews(await getReviewsByUser(customer.user_id));
    } catch (error) {
      console.error(error);
      document.getElementById('customerActivityRows').innerHTML =
        `<tr><td colspan="5" style="text-align:center;">${escapeHTML(error.message || 'Không tải được đánh giá.')}</td></tr>`;
    }
  }

  // ------------------------- Hiển thị -------------------------

  function renderCustomer() {
    document.title = `FREE2DO Admin — ${customer.name}`;
    document.querySelector('.profile-logo').textContent = customer.name.trim().charAt(0).toUpperCase();
    document.querySelector('.profile-name').textContent = customer.name;
    document.querySelector('.profile-meta').textContent = `${shortId(customer.user_id)} · ${customer.email}`;
    document.querySelector('.profile-head > .badge').outerHTML = statusBadge(customer.status);

    const cards = document.querySelectorAll('.profile-grid .card');
    setInfoRows(cards[0], {
      'Họ và tên': escapeHTML(customer.name),
      'Email': escapeHTML(customer.email),
      'Số điện thoại': escapeHTML(customer.phone || 'Chưa cung cấp'),
      'Mã người dùng': escapeHTML(customer.user_id),
      'Trạng thái tài khoản': statusBadge(customer.status),
    });

    toggleButton.textContent = customer.status === 'active' ? 'Khóa tài khoản' : 'Mở khóa tài khoản';
  }

  function renderReviews(reviews) {
    const cards = document.querySelectorAll('.profile-grid .card');
    const average = reviews.length
      ? reviews.reduce((sum, item) => sum + item.review.rating, 0) / reviews.length
      : 0;

    setInfoRows(cards[1], {
      'Đánh giá đã viết': String(reviews.length),
      'Điểm đánh giá trung bình': reviews.length ? `${average.toFixed(1)} ★` : 'Chưa có dữ liệu',
      'Đánh giá gần nhất': reviews.length ? escapeHTML(formatDate(reviews[0].review.created_at)) : 'Chưa có',
    });

    document.getElementById('customerReviewTitle').textContent = `Đánh giá đã viết (${reviews.length})`;
    document.getElementById('customerActivityRows').innerHTML = reviews.length
      ? reviews.map(({ review, activity }) => {
        const content = review.content || '—';
        const shortContent = content.length > 100 ? `${content.slice(0, 100)}…` : content;
        return `<tr>
          <td class="cell-title"><a href="activity-profile.html?id=${encodeURIComponent(activity.activity_id)}" style="color:inherit;text-decoration:none;">${escapeHTML(activity.name)}</a></td>
          <td>${escapeHTML(activity.business_name)}</td>
          <td>${escapeHTML(formatDate(review.created_at))}</td>
          <td title="${escapeHTML(content)}">${escapeHTML(shortContent)}</td>
          <td>${ratingStars(review.rating)}</td>
        </tr>`;
      }).join('')
      : '<tr><td colspan="5" style="text-align:center;">Khách hàng chưa viết đánh giá nào.</td></tr>';
  }

  // ------------------------- Khóa / mở khóa -------------------------

  toggleButton.addEventListener('click', async () => {
    if (!customer) return;
    toggleButton.disabled = true;
    try {
      customer = await setUserStatus(customer.user_id, customer.status === 'active' ? 'blocked' : 'active');
      renderCustomer();
    } catch (error) {
      alert(error.message || 'Không cập nhật được trạng thái tài khoản.');
    } finally {
      toggleButton.disabled = false;
    }
  });

  loadCustomer();
})();
