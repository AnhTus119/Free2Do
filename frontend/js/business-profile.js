(function () {
  'use strict';

  const {
    requireOperatorAuth, escapeHTML, statusBadge, shortId, formatDate, formatHours,
    setInfoRows, getQueryParam, showNotFound, operatorLabel,
  } = window.AdminAuth;
  const {
    getUser, getBusinessProfile, getBusinessRequest, decideBusinessRequest, setUserStatus,
    getBusinessActivities, getBusinessAverageRating,
  } = window.AdminData;

  requireOperatorAuth();

  /*
   * Trang này hiển thị 2 loại hồ sơ:
   *  - ?id=<user_id>      : doanh nghiệp đã được duyệt
   *  - ?request=<request_id> : yêu cầu trở thành doanh nghiệp đang chờ duyệt
   */
  const userId = getQueryParam('id');
  const requestId = getQueryParam('request');

  const toggleButton = document.getElementById('toggleBusinessStatus');
  const approveButton = document.getElementById('approveBusinessRequest');
  const rejectButton = document.getElementById('rejectBusinessRequest');

  let owner = null;      // tài khoản user (UserAdminOut)
  let profile = null;    // business_profiles (doanh nghiệp đã duyệt)
  let request = null;    // business_requests (yêu cầu chờ duyệt)
  let activities = [];   // hoạt động của doanh nghiệp

  function setVisible(element, visible) {
    element.style.display = visible ? '' : 'none';
  }

  function notFound(message) {
    showNotFound('businesses.html', 'Quay lại danh sách Doanh nghiệp', 'Không tìm thấy doanh nghiệp', message);
  }

  // ------------------------- Tải dữ liệu từ API -------------------------

  async function loadBusiness() {
    if (!userId && !requestId) {
      notFound('Thiếu mã doanh nghiệp trên đường dẫn.');
      return;
    }

    try {
      if (requestId) {
        request = await getBusinessRequest(requestId);
        owner = await getUser(request.user_id);
      } else {
        [owner, profile] = await Promise.all([
          getUser(userId),
          getBusinessProfile(userId),
        ]);
      }
    } catch (error) {
      notFound(error.message || 'Không tải được thông tin doanh nghiệp.');
      return;
    }

    await renderBusiness();

    if (profile) await loadActivities();
    else renderActivities();
  }

  async function loadActivities() {
    try {
      activities = await getBusinessActivities(profile.user_id);
      renderActivities();
      renderStats(await getBusinessAverageRating(activities));
    } catch (error) {
      console.error(error);
      document.getElementById('businessActivityRows').innerHTML =
        `<tr><td colspan="5" style="text-align:center;">${escapeHTML(error.message || 'Không tải được hoạt động.')}</td></tr>`;
    }
  }

  // ------------------------- Hiển thị -------------------------

  async function renderBusiness() {
    const isRequest = Boolean(request);
    const source = isRequest ? request : profile;
    const name = source.business_name;
    const status = isRequest ? request.status : (owner.status === 'active' ? 'active' : 'blocked');

    document.title = `FREE2DO Admin — ${name}`;
    document.querySelector('.profile-logo').textContent = name.trim().charAt(0).toUpperCase();
    document.querySelector('.profile-name').textContent = name;
    document.querySelector('.profile-meta').textContent =
      `Mã ${isRequest ? 'yêu cầu' : 'Doanh nghiệp'}: ${shortId(isRequest ? request.request_id : profile.user_id)} · ${source.business_address}`;
    document.querySelector('.profile-head > .badge').outerHTML = statusBadge(status);

    const values = {
      'Tên Doanh nghiệp': escapeHTML(name),
      'Chủ tài khoản': escapeHTML(owner.name),
      'Email': escapeHTML(owner.email),
      'Số điện thoại': escapeHTML(source.phone || 'Chưa cung cấp'),
      'Địa chỉ': escapeHTML(source.business_address),
      'Mô tả': escapeHTML(source.description || 'Chưa có mô tả'),
    };
    if (isRequest) {
      values['Ngày gửi yêu cầu'] = escapeHTML(formatDate(request.created_at));
      if (request.status !== 'pending') {
        values['Admin xác minh (verified_by)'] = escapeHTML(await operatorLabel(request.reviewed_by));
      }
    } else {
      values['Admin xác minh (verified_by)'] = escapeHTML(await operatorLabel(profile.verified_by));
      values['Ngày xác minh'] = escapeHTML(formatDate(profile.verified_at));
    }
    setInfoRows(document.querySelectorAll('.profile-grid .card')[0], values);

    if (isRequest) renderStats(null);

    // Nút thao tác thay đổi theo loại hồ sơ
    setVisible(toggleButton, !isRequest);
    setVisible(approveButton, isRequest && request.status === 'pending');
    setVisible(rejectButton, isRequest && request.status === 'pending');
    toggleButton.textContent = owner.status === 'active' ? '🔒 Khóa Doanh nghiệp' : '🔓 Mở khóa Doanh nghiệp';
  }

  function renderStats(averageRating) {
    setInfoRows(document.querySelectorAll('.profile-grid .card')[1], {
      'Tổng Hoạt động': String(activities.length),
      'Đang hoạt động': String(activities.filter((item) => item.status === 'active').length),
      'Chờ duyệt': String(activities.filter((item) => item.status === 'pending').length),
      'Đánh giá trung bình': averageRating ? `${averageRating.toFixed(1)} ★` : 'Chưa có dữ liệu',
    });
  }

  function renderActivities() {
    document.getElementById('businessActivityTitle').textContent = `Hoạt động của Doanh nghiệp này (${activities.length})`;
    document.getElementById('businessActivityRows').innerHTML = activities.length
      ? activities.map((activity) => `<tr>
          <td><div class="cell-title">${escapeHTML(activity.name)}</div><div class="cell-sub">${escapeHTML(shortId(activity.activity_id))}</div></td>
          <td>${escapeHTML(activity.address)}</td>
          <td>${escapeHTML(formatHours(activity.time_open, activity.time_close))}</td>
          <td>${statusBadge(activity.status)}</td>
          <td><a class="row-btn" href="activity-profile.html?id=${encodeURIComponent(activity.activity_id)}">Xem</a></td>
        </tr>`).join('')
      : '<tr><td colspan="5" style="text-align:center;">Doanh nghiệp chưa có hoạt động.</td></tr>';
  }

  // ------------------------- Thao tác -------------------------

  toggleButton.addEventListener('click', async () => {
    toggleButton.disabled = true;
    try {
      owner = await setUserStatus(owner.user_id, owner.status === 'active' ? 'blocked' : 'active');
      await renderBusiness();
    } catch (error) {
      alert(error.message || 'Không cập nhật được trạng thái doanh nghiệp.');
    } finally {
      toggleButton.disabled = false;
    }
  });

  async function decideRequest(action, button) {
    button.disabled = true;
    try {
      await decideBusinessRequest(request.request_id, action);
      // Duyệt xong doanh nghiệp đã có hồ sơ thật -> chuyển sang trang hồ sơ theo user_id; từ chối thì về danh sách.
      window.location.href = action === 'approve'
        ? `business-profile.html?id=${encodeURIComponent(request.user_id)}`
        : 'businesses.html';
    } catch (error) {
      alert(error.message || 'Không xử lý được yêu cầu này.');
      button.disabled = false;
    }
  }

  approveButton.addEventListener('click', () => decideRequest('approve', approveButton));
  rejectButton.addEventListener('click', () => decideRequest('reject', rejectButton));

  loadBusiness();
})();
