(function () {
  'use strict';

  const {
    requireOperatorAuth, escapeHTML, statusBadge, shortId, formatPrice, formatHours,
    formatDate, ratingStars, setInfoRows, getQueryParam, showNotFound, operatorLabel,
  } = window.AdminAuth;
  const { getActivityProfile, decideActivity, setActivityStatus } = window.AdminData;

  requireOperatorAuth();

  const id = getQueryParam('id');
  let activity = null;

  const toggleButton = document.getElementById('toggleActivityVisibility');
  const approveButton = document.getElementById('approveActivity');

  function setVisible(element, visible) {
    element.style.display = visible ? '' : 'none';
  }

  function notFound(message) {
    showNotFound('activities.html', 'Quay lại danh sách Hoạt động', 'Không tìm thấy hoạt động', message);
  }

  // ------------------------- Tải dữ liệu từ API -------------------------

  async function loadActivity() {
    if (!id) {
      notFound('Thiếu mã hoạt động trên đường dẫn.');
      return;
    }

    let data;
    try {
      data = await getActivityProfile(id);
    } catch (error) {
      notFound(error.message || 'Không tải được thông tin hoạt động.');
      return;
    }

    activity = data.activity;
    await renderActivity();
    renderMedia();
    renderReviews(data.reviews, data.users);
  }

  // ------------------------- Hiển thị -------------------------

  async function renderActivity() {
    const businessLink = `<a href="business-profile.html?id=${encodeURIComponent(activity.business_id)}" style="color:var(--rose-dark);font-weight:600;text-decoration:none;">${escapeHTML(activity.business_name)}</a>`;

    document.title = `FREE2DO Admin — ${activity.name}`;
    document.querySelector('.profile-name').textContent = activity.name;
    document.querySelector('.profile-meta').innerHTML =
      `Mã Hoạt động: ${escapeHTML(shortId(activity.activity_id))} · Doanh nghiệp: ${businessLink}`;
    document.querySelector('.profile-head > .badge').outerHTML = statusBadge(activity.status);

    const verifier = await operatorLabel(activity.verified_by);
    const cards = document.querySelectorAll('.profile-grid .card');
    setInfoRows(cards[0], {
      'Tên Hoạt động': escapeHTML(activity.name),
      'Doanh nghiệp': businessLink,
      'Mô tả': escapeHTML(activity.description || 'Chưa có mô tả'),
      'Danh mục': escapeHTML(activity.categoryNames.join(', ') || 'Chưa phân loại'),
      'Ngân sách': escapeHTML(formatPrice(activity.price)),
      'Địa chỉ': escapeHTML(activity.address),
      'Vị trí (lat, long)': escapeHTML(`${activity.latitude}, ${activity.longitude}`),
      'Giờ hoạt động': escapeHTML(formatHours(activity.time_open, activity.time_close)),
      'Admin xác minh (verified_by)': escapeHTML(verifier),
      'Ngày xác minh': escapeHTML(activity.verified_at ? formatDate(activity.verified_at) : 'Chưa xác minh'),
    });
    setInfoRows(cards[1], {
      'Số đánh giá': String(activity.review_count || 0),
      'Đánh giá trung bình': activity.avg_rating ? `${activity.avg_rating.toFixed(1)} ★` : 'Chưa có đánh giá',
      'Số hình ảnh / video': String((activity.media || []).length),
      'Ngày tạo': escapeHTML(formatDate(activity.created_at)),
    });

    renderHistory(verifier);

    // Nút thao tác theo trạng thái hiện tại:
    //  pending -> duyệt hoặc từ chối | active -> ẩn | hidden -> hiện lại | cancelled -> không thao tác
    setVisible(approveButton, activity.status === 'pending');
    setVisible(toggleButton, activity.status !== 'cancelled');
    toggleButton.textContent = {
      hidden: '👁️ Hiện Hoạt động',
      pending: '🙈 Từ chối Hoạt động',
    }[activity.status] || '🙈 Ẩn Hoạt động';
  }

  function isSafeUrl(url) {
    return /^https?:\/\//i.test(url);
  }

  function renderMedia() {
    const container = document.getElementById('activityMedia');
    const media = activity.media || [];

    container.innerHTML = media.length
      ? media.map((item) => {
        const isVideo = String(item.media_type).toLowerCase().includes('video');
        const link = isSafeUrl(item.media_url)
          ? `<a href="${escapeHTML(item.media_url)}" target="_blank" rel="noopener noreferrer" style="color:inherit;">${escapeHTML(item.media_url)}</a>`
          : escapeHTML(item.media_url);
        return `<div class="alert-row" style="cursor:default;">
          <div class="alert-ic" style="background:var(--cream);">${isVideo ? '🎬' : '🖼️'}</div>
          <div class="alert-text" style="word-break:break-all;">${link}</div>
          <div class="alert-chev">${escapeHTML(item.media_type)}</div>
        </div>`;
      }).join('')
      : `<div class="alert-row" style="cursor:default;">
          <div class="alert-ic" style="background:var(--danger-bg);">📎</div>
          <div class="alert-text">Doanh nghiệp chưa tải lên hình ảnh hoặc video nào</div>
        </div>`;
  }

  function renderReviews(reviews, users) {
    const usersById = Object.fromEntries(users.map((user) => [user.user_id, user]));

    document.getElementById('activityReviewTitle').textContent = `Đánh giá của Khách hàng (${reviews.length})`;
    document.getElementById('activityCustomerRows').innerHTML = reviews.length
      ? reviews.map((review) => {
        const user = usersById[review.user_id];
        const nameCell = user
          ? `<a href="customer-profile.html?id=${encodeURIComponent(user.user_id)}" style="color:inherit;text-decoration:none;">${escapeHTML(user.name)}</a>`
          : escapeHTML(`Người dùng ${shortId(review.user_id)}`);
        const content = review.content || '—';
        const shortContent = content.length > 100 ? `${content.slice(0, 100)}…` : content;
        return `<tr>
          <td class="cell-title">${nameCell}</td>
          <td>${escapeHTML(formatDate(review.created_at))}</td>
          <td title="${escapeHTML(content)}">${escapeHTML(shortContent)}</td>
          <td>${ratingStars(review.rating)}</td>
        </tr>`;
      }).join('')
      : '<tr><td colspan="4" style="text-align:center;">Chưa có khách hàng đánh giá.</td></tr>';
  }

  // Backend chỉ lưu người xử lý gần nhất (verified_by / verified_at), chưa có bảng lịch sử đầy đủ.
  function renderHistory(verifier) {
    const container = document.getElementById('activityHistory');

    if (!activity.verified_at) {
      container.innerHTML = '<div class="alert-row" style="cursor:default;"><div class="alert-ic" style="background:var(--warn-bg);">⏳</div><div class="alert-text">Chưa có thao tác nào của Admin trên Hoạt động này</div></div>';
      return;
    }

    const isHidden = activity.status === 'hidden';
    container.innerHTML = `<div class="alert-row" style="cursor:default;">
      <div class="alert-ic" style="background:${isHidden ? 'var(--hidden-bg)' : 'var(--success-bg)'};">${isHidden ? '🙈' : '✅'}</div>
      <div class="alert-text">${escapeHTML(verifier)} ${isHidden ? 'đã ẩn / từ chối Hoạt động này' : 'đã duyệt Hoạt động này'}</div>
      <div class="alert-chev">${escapeHTML(formatDate(activity.verified_at))}</div>
    </div>`;
  }

  // ------------------------- Thao tác -------------------------

  async function changeStatus(button, request) {
    button.disabled = true;
    try {
      await request();
      await loadActivity();
    } catch (error) {
      alert(error.message || 'Không cập nhật được trạng thái hoạt động.');
    } finally {
      button.disabled = false;
    }
  }

  toggleButton.addEventListener('click', () => {
    if (!activity) return;
    if (activity.status === 'hidden') changeStatus(toggleButton, () => setActivityStatus(activity.activity_id, 'active'));
    else changeStatus(toggleButton, () => decideActivity(activity.activity_id, 'hide'));
  });

  approveButton.addEventListener('click', () => {
    if (activity) changeStatus(approveButton, () => decideActivity(activity.activity_id, 'approve'));
  });

  loadActivity();
})();
