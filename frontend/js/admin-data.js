/*
 * Nguồn dữ liệu dùng chung cho giao diện quản trị FREE2DO.
 * Toàn bộ dữ liệu lấy từ backend qua API /operator/... (token của Operator) — không còn dữ liệu mẫu.
 * Các trang admin chỉ gọi các hàm ở đây, không tự viết fetch().
 *
 * Yêu cầu: nạp js/config.js và js/admin-auth.js TRƯỚC file này.
 */
(function () {
  'use strict';

  const { authFetch, parseServerDate } = window.AdminAuth;

  // ------------------------- Người dùng (Khách hàng / chủ Doanh nghiệp) -------------------------

  function getCustomers() {
    return authFetch('/operator/users?role=customer');
  }

  function getAllUsers() {
    return authFetch('/operator/users');
  }

  function getUser(userId) {
    return authFetch(`/operator/users/${encodeURIComponent(userId)}`);
  }

  // Khóa / mở khóa tài khoản: status = 'active' | 'blocked' | 'suspended'
  function setUserStatus(userId, status) {
    return authFetch(`/operator/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  /*
   * Backend chưa có API "đánh giá theo người dùng" nên đi qua từng hoạt động:
   * GET /activities/{id}/reviews rồi lọc các đánh giá do người này viết.
   * Trả về [{ review, activity }] mới nhất trước.
   */
  async function getReviewsByUser(userId) {
    const activities = await getActivities();
    const results = await Promise.allSettled(
      activities.map((activity) => authFetch(`/activities/${activity.activity_id}/reviews`)),
    );

    const reviews = [];
    results.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;
      result.value
        .filter((review) => review.user_id === userId)
        .forEach((review) => reviews.push({ review, activity: activities[index] }));
    });
    return reviews.sort((a, b) => parseServerDate(b.review.created_at) - parseServerDate(a.review.created_at));
  }

  // ------------------------- Doanh nghiệp -------------------------

  function getBusinessProfile(userId) {
    return authFetch(`/operator/business-profiles/${encodeURIComponent(userId)}`);
  }

  function getBusinessRequest(requestId) {
    return authFetch(`/operator/business-requests/${encodeURIComponent(requestId)}`);
  }

  // action = 'approve' | 'reject'
  function decideBusinessRequest(requestId, action) {
    return authFetch(`/operator/business-requests/${requestId}/${action}`, { method: 'PATCH' });
  }

  /*
   * Danh sách doanh nghiệp gộp từ 2 nguồn:
   *  - kind 'business': tài khoản role=business đã được duyệt (id = user_id)
   *  - kind 'request' : yêu cầu trở thành doanh nghiệp đang chờ duyệt (id = request_id)
   */
  async function getBusinesses() {
    const [users, requests, activities] = await Promise.all([
      authFetch('/operator/users?role=business'),
      authFetch('/operator/business-requests?status=pending'),
      getActivities(),
    ]);

    // Tên/địa chỉ doanh nghiệp nằm trong business_profiles -> backend chỉ có API lấy từng hồ sơ.
    const profiles = await Promise.allSettled(users.map((user) => getBusinessProfile(user.user_id)));

    const activityCount = {};
    activities.forEach((activity) => {
      activityCount[activity.business_id] = (activityCount[activity.business_id] || 0) + 1;
    });

    const approved = users.map((user, index) => {
      const profile = profiles[index].status === 'fulfilled' ? profiles[index].value : null;
      return {
        kind: 'business',
        id: user.user_id,
        name: (profile && profile.business_name) || user.name,
        address: (profile && profile.business_address) || 'Chưa cập nhật',
        phone: (profile && profile.phone) || user.phone || '',
        status: user.status === 'active' ? 'active' : 'blocked',
        activityCount: activityCount[user.user_id] || 0,
        sortTime: profile && profile.verified_at ? parseServerDate(profile.verified_at).getTime() : 0,
      };
    });

    const pending = requests.map((request) => ({
      kind: 'request',
      id: request.request_id,
      name: request.business_name,
      address: request.business_address,
      phone: request.phone || '',
      status: 'pending',
      activityCount: 0,
      sortTime: parseServerDate(request.created_at) ? parseServerDate(request.created_at).getTime() : 0,
    }));

    return [...pending, ...approved];
  }

  async function getBusinessActivities(businessUserId) {
    const activities = await getActivities();
    return activities.filter((activity) => activity.business_id === businessUserId);
  }

  // Điểm trung bình toàn doanh nghiệp = trung bình có trọng số theo số đánh giá của từng hoạt động.
  async function getBusinessAverageRating(activities) {
    const details = await Promise.allSettled(activities.map((activity) => getActivityDetail(activity.activity_id)));
    let total = 0;
    let count = 0;
    details.forEach((result) => {
      if (result.status !== 'fulfilled' || !result.value.avg_rating) return;
      total += result.value.avg_rating * result.value.review_count;
      count += result.value.review_count;
    });
    return count ? total / count : null;
  }

  // ------------------------- Hoạt động -------------------------

  function getActivities() {
    return authFetch('/operator/activities');
  }

  function getCategories() {
    return authFetch('/categories');
  }

  function getActivityDetail(activityId) {
    return authFetch(`/operator/activities/${encodeURIComponent(activityId)}`);
  }

  // Danh mục của từng hoạt động (category_ids) chỉ có ở API chi tiết -> { activity_id: [category_id, ...] }
  async function getCategoryIdsByActivity(activities) {
    const details = await Promise.allSettled(activities.map((activity) => getActivityDetail(activity.activity_id)));
    const map = {};
    details.forEach((result, index) => {
      map[activities[index].activity_id] = result.status === 'fulfilled' ? result.value.category_ids : [];
    });
    return map;
  }

  // Các dữ liệu phụ (danh mục, đánh giá...) lỗi thì vẫn trả về phần còn lại.
  function safe(promise, fallback) {
    return promise.catch((error) => {
      console.error(error);
      return fallback;
    });
  }

  /*
   * Dữ liệu đầy đủ cho trang hồ sơ hoạt động. Ném lỗi nếu không tìm thấy hoạt động.
   * ActivityDetail không có tên doanh nghiệp / người xác minh -> lấy thêm từ API danh sách.
   */
  async function getActivityProfile(activityId) {
    const detail = await getActivityDetail(activityId);
    const [list, categories, reviews, users] = await Promise.all([
      safe(getActivities(), []),
      safe(getCategories(), []),
      safe(authFetch(`/activities/${encodeURIComponent(activityId)}/reviews`), []),
      safe(getAllUsers(), []),
    ]);

    const listItem = list.find((item) => item.activity_id === detail.activity_id) || {};
    const activity = {
      ...detail,
      business_name: listItem.business_name || 'Chưa xác định',
      verified_by: listItem.verified_by || null,
      verified_at: listItem.verified_at || null,
      categoryNames: categories.filter((c) => (detail.category_ids || []).includes(c.category_id)).map((c) => c.name),
    };
    return { activity, reviews, users };
  }

  // action = 'approve' | 'hide'
  function decideActivity(activityId, action) {
    return authFetch(`/operator/activities/${activityId}/${action}`, { method: 'PATCH' });
  }

  // Đổi sang trạng thái bất kỳ: 'pending' | 'active' | 'cancelled' | 'hidden'
  function setActivityStatus(activityId, status) {
    return authFetch(`/operator/activities/${activityId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  window.AdminData = {
    getCustomers,
    getAllUsers,
    getUser,
    setUserStatus,
    getReviewsByUser,
    getBusinessProfile,
    getBusinessRequest,
    decideBusinessRequest,
    getBusinesses,
    getBusinessActivities,
    getBusinessAverageRating,
    getActivities,
    getCategories,
    getActivityDetail,
    getCategoryIdsByActivity,
    getActivityProfile,
    decideActivity,
    setActivityStatus,
  };
})();
