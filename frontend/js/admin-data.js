/*
 * Adapter dữ liệu dùng chung cho giao diện Operator.
 * Không chứa bản ghi mẫu: mọi customer, business, activity và review đều được
 * tải từ FastAPI bằng JWT của Operator.
 */
(function () {
  'use strict';

  const auth = window.AdminAuth;
  const state = {
    customers: [], businesses: [], activities: [], participations: [], categories: [],
    dashboard: null, customerSummary: null, businessSummary: null, activitySummary: null,
  };

  const statusLabels = {
    active: 'Hoạt động', pending: 'Chờ duyệt', hidden: 'Đã ẩn', cancelled: 'Đã hủy',
    rejected: 'Từ chối', expired: 'Hết hạn', locked: 'Đã khóa', blocked: 'Đã khóa',
    suspended: 'Tạm ngưng', approved: 'Đã duyệt',
  };
  const categoryTypes = {
    'ăn uống': 'food', 'giải trí': 'entertainment', 'thể thao': 'entertainment',
    workshop: 'workshop', 'làm đẹp': 'beauty',
  };
  const viDate = value => window.F2D.date(value);
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const parseViDate = value => {
    const parts = String(value || '').split('/').map(Number);
    return parts.length === 3 ? new Date(parts[2], parts[1] - 1, parts[0]) : new Date(0);
  };
  const mapStatus = value => value === 'blocked' || value === 'suspended' ? 'locked' : value;

  function categoryName(ids) {
    const names = (ids || []).map(id => state.categories.find(item => item.category_id === id)?.name).filter(Boolean);
    return names.join(', ') || 'Chưa phân loại';
  }

  function activityType(name) {
    const text = normalize(name);
    return Object.entries(categoryTypes).find(([key]) => text.includes(normalize(key)))?.[1] || 'other';
  }

  function mapCustomer(user, categories = []) {
    return {
      id: user.user_id, code: user.code || '', name: user.name, email: user.email, phone: user.phone || '',
      area: 'Chưa có dữ liệu', registeredAt: viDate(user.created_at), lastLogin: 'Chưa có dữ liệu',
      status: mapStatus(user.status), interests: categories.map(item => item.name),
      participationCount: user.participation_count, reviewCount: user.review_count,
      lastActivityAt: user.last_activity_at ? viDate(user.last_activity_at) : null,
    };
  }

  function mapActivity(activity) {
    const source = activity;
    const category = categoryName(source.category_ids);
    return {
      id: activity.activity_id, code: activity.code || 'Chưa có mã', name: activity.name, businessId: activity.business_id,
      businessName: activity.business_name, type: activityType(category), category,
      categoryIds: source.category_ids || [], rejectionReason: activity.rejection_reason || '',
      price: activity.price_text || auth.formatPrice(activity.price), rawPrice: activity.price,
      hours: auth.formatHours(activity.time_open, activity.time_close), address: activity.address,
      location: activity.latitude == null || activity.longitude == null
        ? '' : `${activity.latitude}, ${activity.longitude}`, latitude: activity.latitude,
      longitude: activity.longitude, status: activity.status,
      description: activity.description || 'Chưa có mô tả.', verifiedBy: activity.verified_by || '',
      verifiedByName: activity.verified_by_name || '', verifiedAt: activity.verified_at || null,
      expireAt: viDate(activity.expire_at), views: null, participants: source.review_count || 0,
      rating: source.avg_rating, createdAt: window.F2D.dateTime(activity.created_at), createdRaw: activity.created_at || '', media: source.media || [], icon: '✨',
    };
  }

  async function load() {
    await auth.requireOperatorAuth();
    const [categories, customers, businessUsers, activities, requests, dashboard,
      customerSummary, businessSummary, activitySummary] = await Promise.all([
      auth.authFetch('/categories'), auth.authFetch('/operator/users?role=customer'),
      auth.authFetch('/operator/users?role=business'), auth.authFetch('/operator/activities'),
      auth.authFetch('/operator/business-requests?status=pending'),
      auth.authFetch('/operator/dashboard'), auth.authFetch('/operator/summaries/customers'),
      auth.authFetch('/operator/summaries/businesses'), auth.authFetch('/operator/activities/summary/counts'),
    ]);
    state.dashboard = dashboard;
    state.customerSummary = customerSummary;
    state.businessSummary = businessSummary;
    state.activitySummary = activitySummary;
    state.categories = categories;
    const customerCategories = await Promise.all(customers.map(user =>
      auth.authFetch(`/operator/users/${encodeURIComponent(user.user_id)}/categories`).catch(() => [])));
    state.customers = customers.map((user, index) => mapCustomer(user, customerCategories[index]));

    const profiles = await Promise.all(businessUsers.map(user =>
      auth.authFetch(`/operator/business-profiles/${encodeURIComponent(user.user_id)}`).catch(() => null)));
    const reviewLists = await Promise.all(activities.map(activity =>
      auth.authFetch(`/activities/${encodeURIComponent(activity.activity_id)}/reviews`).catch(() => [])));

    state.activities = activities.map((activity, index) => mapActivity(activity));
    state.participations = reviewLists.flat().map(review => ({
      activityId: review.activity_id, customerId: review.user_id, customerName: review.reviewer_name,
      date: viDate(review.created_at), status: 'active', rating: review.rating,
    }));

    state.businesses = businessUsers.map((user, index) => {
      const profile = profiles[index];
      return {
        id: user.user_id, code: profile?.business_code || 'Chưa có mã', name: profile?.business_name || user.name,
        address: profile?.business_address || 'Chưa có dữ liệu', type: 'Xem danh sách hoạt động',
        phone: profile?.phone || user.phone || '', profilePhone: profile?.phone || '', hours: 'Xem từng hoạt động', priceRange: 'Xem từng hoạt động',
        status: mapStatus(user.status), verifiedBy: profile?.verified_by || '',
        verifiedAt: profile?.verified_at || null, description: profile?.description || 'Chưa có mô tả.',
        activityCount: user.activity_count, activeActivityCount: user.active_activity_count,
        pendingActivityCount: user.pending_activity_count, averageRating: user.average_rating,
      };
    });

    requests.forEach(request => state.businesses.push({
      id: request.request_id, userId: request.user_id, requestId: request.request_id,
      name: request.business_name, address: request.business_address, type: 'Yêu cầu doanh nghiệp',
      phone: request.phone || '', hours: 'Chưa có dữ liệu', priceRange: 'Chưa có dữ liệu',
      status: 'pending', verifiedBy: '', description: request.description || 'Chưa có mô tả.',
    }));
  }

  async function refreshSummaries() {
    const [dashboard, customerSummary, businessSummary, activitySummary] = await Promise.all([
      auth.authFetch('/operator/dashboard'), auth.authFetch('/operator/summaries/customers'),
      auth.authFetch('/operator/summaries/businesses'), auth.authFetch('/operator/activities/summary/counts'),
    ]);
    state.dashboard = dashboard;
    state.customerSummary = customerSummary;
    state.businessSummary = businessSummary;
    state.activitySummary = activitySummary;
  }

  async function refreshActivity(id) {
    window.FREE2DO_CACHE.clear();
    const activity = await auth.authFetch(`/operator/activities/${encodeURIComponent(id)}`);
    const index = state.activities.findIndex(item => item.id === id);
    if (index === -1) throw new Error('Không tìm thấy hoạt động cần cập nhật.');
    const updated = mapActivity(activity);
    state.activities.splice(index, 1, updated);
    window.dispatchEvent(new Event('free2do:admin-data-updated'));
    return updated;
  }

  let refreshInProgress = false;
  async function refresh() {
    if (refreshInProgress) return;
    refreshInProgress = true;
    try {
      await load();
      window.dispatchEvent(new Event('free2do:admin-data-updated'));
    } finally {
      refreshInProgress = false;
    }
  }

  // Từ chối (kèm lý do, backend gửi email cho doanh nghiệp) và xóa hoạt động đang hiển thị.
  async function rejectActivity(id, reason, { quiet = false } = {}) {
    await auth.authFetch(`/operator/activities/${encodeURIComponent(id)}/reject`, {
      method: 'PATCH', body: JSON.stringify({ reason }), toast: quiet ? false : 'Đã từ chối hoạt động và gửi email cho doanh nghiệp.',
    });
    const item = state.activities.find(entry => entry.id === id);
    if (item) { item.status = 'rejected'; item.rejectionReason = reason; }
    await refreshSummaries();
  }
  async function deleteActivity(id, { quiet = false } = {}) {
    await auth.authFetch(`/operator/activities/${encodeURIComponent(id)}`, { method: 'DELETE', toast: quiet ? false : 'Đã xóa hoạt động.' });
    const item = state.activities.find(entry => entry.id === id);
    if (item) item.status = 'cancelled';
    await refreshSummaries();
  }

  // quiet: không hiện toast (popup xác nhận F2D.ask tự hiện kết quả).
  async function setStatus(kind, id, status, { quiet = false, reason = '' } = {}) {
    if (kind === 'activity') {
      const next = status === 'rejected' ? 'hidden' : status;
      await auth.authFetch(`/operator/activities/${encodeURIComponent(id)}/status`, {
        method: 'PATCH', body: JSON.stringify({ status: next }),
        toast: quiet ? false : { active: 'Đã duyệt và hiển thị hoạt động.', hidden: 'Đã ẩn hoạt động.' }[next] || 'Đã cập nhật trạng thái hoạt động.',
      });
      const item = state.activities.find(entry => entry.id === id);
      if (item) item.status = next;
      await refreshSummaries();
      return;
    }
    const collection = kind === 'customer' ? state.customers : state.businesses;
    const item = collection.find(entry => entry.id === id);
    if (!item) throw new Error('Không tìm thấy bản ghi cần cập nhật.');
    if (kind === 'business' && item.requestId) {
      const action = status === 'active' ? 'approve' : 'reject';
      await auth.authFetch(`/operator/business-requests/${encodeURIComponent(item.requestId)}/${action}`, {
        method: 'PATCH', ...(action === 'reject' ? { body: JSON.stringify({ reason }) } : {}), toast: quiet ? false : action === 'approve' ? 'Đã duyệt yêu cầu doanh nghiệp.' : 'Đã từ chối yêu cầu doanh nghiệp.',
      });
      state.businesses = state.businesses.filter(entry => entry.id !== id);
      await refreshSummaries();
      return;
    }
    const backendStatus = status === 'locked' ? 'blocked' : status;
    await auth.authFetch(`/operator/users/${encodeURIComponent(id)}/status`, {
      method: 'PATCH', body: JSON.stringify({ status: backendStatus }),
      toast: quiet ? false : backendStatus === 'active' ? 'Đã mở khóa tài khoản.' : 'Đã khóa tài khoản.',
    });
    item.status = mapStatus(backendStatus);
    await refreshSummaries();
  }

  // Duyệt/từ chối đơn doanh nghiệp, khóa/mở khóa tài khoản: hỏi xác nhận, giữ popup tới khi có kết quả.
  // Trả về true khi đã đổi trạng thái thành công, null khi người dùng hủy.
  function confirmStatus(kind, id, status, name) {
    const isRequest = kind === 'business' && state.businesses.find(entry => entry.id === id)?.requestId;
    const [title, text, ok, done, danger] = isRequest
      ? (status === 'active'
        ? ['Duyệt doanh nghiệp?', `"${name}" trở thành tài khoản doanh nghiệp và nhận email thông báo.`, 'Duyệt', 'Đã duyệt yêu cầu doanh nghiệp.', false]
        : ['Từ chối doanh nghiệp?', `Yêu cầu của "${name}" bị từ chối; người gửi nhận email thông báo và vẫn là khách hàng.`, 'Từ chối', 'Đã từ chối yêu cầu doanh nghiệp.', true])
      : (status === 'active'
        ? ['Mở khóa tài khoản?', `"${name}" sẽ đăng nhập và sử dụng FREE2DO trở lại.`, 'Mở khóa', 'Đã mở khóa tài khoản.', false]
        : ['Khóa tài khoản?', `"${name}" sẽ không đăng nhập được cho tới khi được mở khóa.`, 'Khóa tài khoản', 'Đã khóa tài khoản.', true]);
    // Từ chối đơn doanh nghiệp bắt buộc nhập lý do (lưu vào đơn và gửi kèm email cho người đăng ký).
    const input = isRequest && status !== 'active'
      ? { label: 'Lý do từ chối', placeholder: 'Ví dụ: Thiếu giấy phép kinh doanh, ảnh minh chứng không rõ...', multiline: true, minLength: 3, requiredMessage: 'Hãy nhập lý do từ chối (ít nhất 3 ký tự).' }
      : null;
    return F2D.ask({ title, text, ok, done, danger, input, run: reason => setStatus(kind, id, status, { quiet: true, reason }) });
  }

  // Nhật ký thao tác operator cho trang hồ sơ đang xem (customer | business | activity).
  async function renderActionLogs(container, targetType, targetId) {
    if (!container || !targetId) return;
    const esc = auth.escapeHTML;
    const row = html => `<div class="alert-row"><div class="alert-text">${html}</div></div>`;
    try {
      const logs = await auth.authFetch(`/operator/action-logs?target_type=${targetType}&target_id=${encodeURIComponent(targetId)}`);
      container.innerHTML = logs.length ? logs.map(log => row(`<b>${esc(log.action)}</b>${log.target_name ? ` · ${esc(log.target_name)}` : ''}`
        + `${log.detail ? `<div class="cell-sub">${esc(log.detail)}</div>` : ''}`
        + `<div class="cell-sub">${esc(log.operator_name)} · ${esc(window.F2D.dateTime(log.created_at))}</div>`)).join('')
        : row('Chưa có thao tác nào.');
    } catch (error) { container.innerHTML = row(esc(error.message)); }
  }

  const data = {
    get customers() { return state.customers; },
    get businesses() { return state.businesses; },
    get activities() { return state.activities; },
    get participations() { return state.participations; },
    get categories() { return state.categories; },
    get dashboard() { return state.dashboard; },
    get customerSummary() { return state.customerSummary; },
    get businessSummary() { return state.businessSummary; },
    get activitySummary() { return state.activitySummary; },
    statusLabels, setStatus, confirmStatus, renderActionLogs, rejectActivity, deleteActivity, refreshActivity, parseViDate, normalize, escapeHTML: auth.escapeHTML, refresh,
    businessName(activity) {
      return state.businesses.find(item => item.id === activity.businessId)?.name
        || activity.businessName || 'Chưa xác định';
    },
  };
  data.ready = load();
  window.AdminData = data;
  let lastRefreshAt = Date.now();
  const refreshAdminData = async () => {
    if (document.visibilityState === 'hidden') return;
    await refresh();
    lastRefreshAt = Date.now();
  };
  window.setInterval(() => {
    refreshAdminData().catch(error => console.error('Không thể làm mới dữ liệu quản trị:', error));
  }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastRefreshAt >= 5 * 60 * 1000) {
      refreshAdminData().catch(error => console.error('Không thể làm mới dữ liệu quản trị:', error));
    }
  });
})();
