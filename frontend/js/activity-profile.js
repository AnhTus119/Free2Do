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

  // ---------- Đánh giá: danh sách gọn, bấm để xem chi tiết (cùng kiểu khung khiếu nại ở management) ----------
  const STAR = '<path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/>';
  const stars = rating => `<span class="op-stars" role="img" aria-label="${rating} trên 5 sao">${Array.from({ length: 5 }, (_, index) => `<svg viewBox="0 0 24 24" class="${index < rating ? '' : 'empty'}" aria-hidden="true">${STAR}</svg>`).join('')}</span>`;
  const esc = value => data.escapeHTML(value);
  let reviews = [];
  let reviewsFor = null;

  function mediaThumbs(media, label) {
    if (!media?.length) return '';
    return `<div class="f2d-thumbs" data-zoom-group>${media.map((item, index) => item.media_type === 'video'
      ? `<div class="f2d-thumb"><video src="${esc(safeMediaUrl(item.media_url))}" controls preload="metadata"></video></div>`
      : `<button type="button" class="f2d-thumb" data-zoom="${esc(safeMediaUrl(item.media_url))}" aria-label="Phóng to ${label} ${index + 1}"><img src="${esc(safeMediaUrl(item.media_url))}" alt="${label} ${index + 1}" loading="lazy"></button>`).join('')}</div>`;
  }

  async function loadReviews() {
    if (reviewsFor === activity.id) return;
    reviewsFor = activity.id;
    const list = document.getElementById('activityReviews');
    try {
      reviews = await window.AdminAuth.authFetch(`/activities/${encodeURIComponent(activity.id)}/reviews`);
    } catch (error) {
      reviewsFor = null;
      list.innerHTML = `<p class="op-case-empty">${esc(error.message)}</p>`;
      return;
    }
    document.getElementById('activityReviewCount').textContent = reviews.length;
    list.innerHTML = reviews.map(review => `<button type="button" class="op-case" data-review="${esc(review.review_id)}">
        <span class="op-case-main">
          <span class="op-case-title">${stars(review.rating)} ${esc(review.reviewer_name)}</span>
          <span class="op-case-meta">${esc(review.content || 'Không có nội dung.')}${review.media.length ? ` · ${review.media.length} ảnh/video` : ''}${review.reply ? ' · Đã phản hồi' : ''}</span>
        </span>
        <time class="op-case-time">${esc(F2D.dateTime(review.created_at))}</time>
        <span class="op-case-chev" aria-hidden="true">›</span>
      </button>`).join('') || '<p class="op-case-empty">Hoạt động chưa có đánh giá.</p>';
  }

  function openReview(reviewId) {
    const review = reviews.find(item => item.review_id === reviewId);
    if (!review) return;
    const field = (label, value) => `<dt>${esc(label)}</dt><dd>${value}</dd>`;
    document.getElementById('reviewDialogSub').textContent = `${activity.code} · ${activity.name}`;
    document.getElementById('reviewDialogBody').innerHTML = `<section class="op-case-section"><dl class="op-fields">
        ${field('Khách hàng', esc(review.reviewer_name))}
        ${field('Số sao', `${stars(review.rating)} ${review.rating}/5`)}
        ${field('Thời gian', esc(F2D.dateTime(review.created_at)))}
        ${review.updated_at ? field('Chỉnh sửa lúc', esc(F2D.dateTime(review.updated_at))) : ''}
      </dl></section>
      <section class="op-case-section"><h3>Nội dung đánh giá</h3>
        <div class="op-review"><p>${esc(review.content || 'Không có nội dung.')}</p>${mediaThumbs(review.media, 'ảnh đánh giá')}</div>
      </section>
      <section class="op-case-section"><h3>Phản hồi của doanh nghiệp</h3>
        ${review.reply
          ? `<div class="op-reply"><span>${esc(F2D.dateTime(review.reply.updated_at || review.reply.created_at))}</span>${esc(review.reply.content)}</div>${mediaThumbs(review.reply.media, 'ảnh phản hồi')}`
          : '<p class="op-case-empty">Doanh nghiệp chưa phản hồi.</p>'}
      </section>`;
    document.getElementById('reviewDialog').showModal();
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
    // Ảnh bìa: ưu tiên media_kind "cover", không có thì lấy ảnh đầu tiên.
    const images = activity.media.filter(item => item.media_type === 'image');
    const cover = images.find(item => item.media_kind === 'cover') || images[0];
    document.getElementById('activityCover').innerHTML = cover
      ? `<img src="${data.escapeHTML(safeMediaUrl(cover.media_url))}" alt="Ảnh bìa ${data.escapeHTML(activity.name)}">`
      : '<span>Hoạt động chưa có ảnh bìa</span>';
    document.querySelector('.profile-name').textContent = activity.name;
    document.getElementById('activityChips').innerHTML = [
      `Mã: <b>${data.escapeHTML(activity.code)}</b>`, `🏬 ${businessDisplay}`,
      `💰 ${data.escapeHTML(activity.price)}`, `🕒 ${data.escapeHTML(activity.hours)}`,
    ].map(item => `<span class="ap-chip">${item}</span>`).join('');
    const status = document.getElementById('activityStatus');
    status.className = `badge ap-status ${activity.status}`;
    status.textContent = data.statusLabels[activity.status];

    const cards = document.querySelectorAll('.profile-grid .card');
    setInfoRows(cards[0], {
      'Tên Hoạt động': data.escapeHTML(activity.name), 'Doanh nghiệp': businessDisplay,
      'Mô tả': data.escapeHTML(activity.description), 'Ngân sách': data.escapeHTML(activity.price),
      'Địa chỉ': data.escapeHTML(activity.address), 'Vị trí (lat, long)': data.escapeHTML(activity.location || 'Chưa cung cấp'),
      'Giờ hoạt động': data.escapeHTML(activity.hours),
      'Người duyệt / xử lý': activity.verifiedBy
        ? `${data.escapeHTML(activity.verifiedByName || 'Operator đã xóa')}${activity.verifiedAt ? ` · ${data.escapeHTML(window.F2D.dateTime(activity.verifiedAt))}` : ''}`
        : 'Chưa duyệt',
      'Hạn chờ duyệt': activity.status === 'pending' ? data.escapeHTML(activity.expireAt || 'Không giới hạn') : 'Không áp dụng',
      'Lý do từ chối': data.escapeHTML(activity.rejectionReason || 'Không có'),
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
    loadReviews();
    data.renderActionLogs(document.getElementById('actionLogs'), 'activity', activity.id);
    document.getElementById('toggleActivityVisibility').textContent = activity.status === 'hidden' ? '👁️ Hiện Hoạt động' : '🙈 Ẩn Hoạt động';
    document.getElementById('rejectionReasonRow').hidden = activity.status !== 'rejected';
    // Chỉ hoạt động đang chờ duyệt mới duyệt được; hết hạn/bị từ chối/đã hủy thì không.
    document.getElementById('approveActivity').hidden = activity.status !== 'pending';
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
  document.getElementById('activityReviews').addEventListener('click', event => {
    const row = event.target.closest('[data-review]');
    if (row) openReview(row.dataset.review);
  });
  const reviewDialog = document.getElementById('reviewDialog');
  document.getElementById('reviewDialogClose').addEventListener('click', () => reviewDialog.close());
  reviewDialog.addEventListener('click', event => { if (event.target === reviewDialog) reviewDialog.close(); });
  document.getElementById('editActivityProfile').addEventListener('click', () => {
    if (!activity) return;
    window.location.href = `activities.html?edit_id=${encodeURIComponent(activity.id)}`;
  });

  data.ready.then(() => { id ||= data.activities[0]?.id; render(); }).catch(error => {
    document.querySelector('.content').textContent = error.message;
  });
  window.addEventListener('free2do:admin-data-updated', render);
})();
