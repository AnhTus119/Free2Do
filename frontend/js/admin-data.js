/*
 * Adapter dữ liệu dùng chung cho giao diện Operator.
 * Không chứa bản ghi mẫu: mọi customer, business, activity và review đều được
 * tải từ FastAPI bằng JWT của Operator.
 */
(function () {
  'use strict';

  const auth = window.AdminAuth;
  const state = { customers: [], businesses: [], activities: [], participations: [], categories: [] };

  const statusLabels = {
    active: 'Hoạt động', pending: 'Chờ duyệt', hidden: 'Đã ẩn', cancelled: 'Đã hủy',
    rejected: 'Từ chối', expired: 'Hết hạn', locked: 'Đã khóa', blocked: 'Đã khóa',
    suspended: 'Tạm ngưng', approved: 'Đã duyệt',
  };
  const categoryTypes = {
    'ăn uống': 'food', 'giải trí': 'entertainment', 'thể thao': 'entertainment',
    workshop: 'workshop', 'làm đẹp': 'beauty',
  };
  const viDate = value => value ? new Date(value).toLocaleDateString('vi-VN') : 'Chưa có dữ liệu';
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
      id: user.user_id, name: user.name, email: user.email, phone: user.phone || '',
      area: 'Chưa có dữ liệu', registeredAt: viDate(user.created_at), lastLogin: 'Chưa có dữ liệu',
      status: mapStatus(user.status), interests: categories.map(item => item.name),
    };
  }

  function mapActivity(activity, detail, reviews) {
    const source = detail || activity;
    const category = categoryName(source.category_ids);
    return {
      id: activity.activity_id, name: activity.name, businessId: activity.business_id,
      businessName: activity.business_name, type: activityType(category), category,
      price: auth.formatPrice(activity.price), rawPrice: activity.price,
      hours: auth.formatHours(activity.time_open, activity.time_close), address: activity.address,
      location: `${activity.latitude}, ${activity.longitude}`, latitude: activity.latitude,
      longitude: activity.longitude, status: activity.status,
      description: activity.description || 'Chưa có mô tả.', verifiedBy: activity.verified_by || '',
      expireAt: viDate(activity.expire_at), views: null, participants: reviews.length,
      rating: source.avg_rating, createdAt: viDate(activity.created_at), media: source.media || [], icon: '✨',
    };
  }

  async function load() {
    await auth.requireOperatorAuth();
    const [categories, customers, businessUsers, activities, requests] = await Promise.all([
      auth.authFetch('/categories'), auth.authFetch('/operator/users?role=customer'),
      auth.authFetch('/operator/users?role=business'), auth.authFetch('/operator/activities'),
      auth.authFetch('/operator/business-requests?status=pending'),
    ]);
    state.categories = categories;
    const customerCategories = await Promise.all(customers.map(user =>
      auth.authFetch(`/operator/users/${encodeURIComponent(user.user_id)}/categories`).catch(() => [])));
    state.customers = customers.map((user, index) => mapCustomer(user, customerCategories[index]));

    const profiles = await Promise.all(businessUsers.map(user =>
      auth.authFetch(`/operator/business-profiles/${encodeURIComponent(user.user_id)}`).catch(() => null)));
    const details = await Promise.all(activities.map(activity =>
      auth.authFetch(`/operator/activities/${encodeURIComponent(activity.activity_id)}`).catch(() => null)));
    const reviewLists = await Promise.all(activities.map(activity =>
      auth.authFetch(`/activities/${encodeURIComponent(activity.activity_id)}/reviews`).catch(() => [])));

    state.activities = activities.map((activity, index) => mapActivity(activity, details[index], reviewLists[index]));
    state.participations = reviewLists.flat().map(review => ({
      activityId: review.activity_id, customerId: review.user_id, customerName: review.reviewer_name,
      date: viDate(review.created_at), status: 'active', rating: review.rating,
    }));

    state.businesses = businessUsers.map((user, index) => {
      const profile = profiles[index];
      const ownActivities = state.activities.filter(activity => activity.businessId === user.user_id);
      const types = [...new Set(ownActivities.map(activity => activity.category).filter(Boolean))];
      return {
        id: user.user_id, name: profile?.business_name || user.name,
        address: profile?.business_address || 'Chưa có dữ liệu', type: types.join(', ') || 'Chưa phân loại',
        phone: profile?.phone || user.phone || '', hours: 'Xem từng hoạt động', priceRange: 'Xem từng hoạt động',
        status: mapStatus(user.status), verifiedBy: profile?.verified_by || '',
        verifiedAt: profile?.verified_at || null, description: profile?.description || 'Chưa có mô tả.',
      };
    });

    requests.forEach(request => state.businesses.push({
      id: request.request_id, userId: request.user_id, requestId: request.request_id,
      name: request.business_name, address: request.business_address, type: 'Yêu cầu doanh nghiệp',
      phone: request.phone || '', hours: 'Chưa có dữ liệu', priceRange: 'Chưa có dữ liệu',
      status: 'pending', verifiedBy: '', description: request.description || 'Chưa có mô tả.',
    }));
  }

  async function setStatus(kind, id, status) {
    if (kind === 'activity') {
      const next = status === 'rejected' ? 'hidden' : status;
      await auth.authFetch(`/operator/activities/${encodeURIComponent(id)}/status`, {
        method: 'PATCH', body: JSON.stringify({ status: next }),
      });
      const item = state.activities.find(entry => entry.id === id);
      if (item) item.status = next;
      return;
    }
    const collection = kind === 'customer' ? state.customers : state.businesses;
    const item = collection.find(entry => entry.id === id);
    if (!item) throw new Error('Không tìm thấy bản ghi cần cập nhật.');
    if (kind === 'business' && item.requestId) {
      const action = status === 'active' ? 'approve' : 'reject';
      await auth.authFetch(`/operator/business-requests/${encodeURIComponent(item.requestId)}/${action}`, { method: 'PATCH' });
      state.businesses = state.businesses.filter(entry => entry.id !== id);
      return;
    }
    const backendStatus = status === 'locked' ? 'blocked' : status;
    await auth.authFetch(`/operator/users/${encodeURIComponent(id)}/status`, {
      method: 'PATCH', body: JSON.stringify({ status: backendStatus }),
    });
    item.status = mapStatus(backendStatus);
  }

  const data = {
    get customers() { return state.customers; },
    get businesses() { return state.businesses; },
    get activities() { return state.activities; },
    get participations() { return state.participations; },
    get categories() { return state.categories; },
    statusLabels, setStatus, parseViDate, normalize, escapeHTML: auth.escapeHTML,
    businessName(activity) {
      return state.businesses.find(item => item.id === activity.businessId)?.name
        || activity.businessName || 'Chưa xác định';
    },
  };
  data.ready = load();
  window.AdminData = data;
})();
