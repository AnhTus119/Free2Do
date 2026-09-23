/* Dữ liệu quản trị lấy từ API. Các trường không có trong backend được hiển thị rõ là chưa có dữ liệu. */
(function () {
  'use strict';
  const { authFetch, escapeHTML, formatPrice, formatHours } = window.AdminAuth;
  const state = { customers: [], businesses: [], activities: [], participations: [], requests: [], categories: [] };
  const statusLabels = { active: 'Đang hoạt động', blocked: 'Đã khóa', suspended: 'Tạm ngưng', locked: 'Đã khóa', pending: 'Chờ duyệt', hidden: 'Đã ẩn', cancelled: 'Đã hủy', rejected: 'Từ chối' };
  function normalize(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function parseViDate(value) { return Date.parse(value) || 0; }
  function date(value) { return value ? new Date(value).toLocaleDateString('vi-VN') : 'Chưa có dữ liệu'; }
  function businessName(activity) { return activity.businessName || state.businesses.find(b => b.id === activity.businessId)?.name || 'Chưa có dữ liệu'; }
  function activityOf(row) {
    return { ...row, id: row.activity_id, businessId: row.business_id, businessName: row.business_name,
      hours: formatHours(row.time_open, row.time_close), price: formatPrice(row.price), priceRaw: row.price,
      location: `${row.latitude}, ${row.longitude}`, createdAt: date(row.created_at),
      verifiedBy: row.verified_by || 'Chưa xác minh', category: 'Chưa có dữ liệu', type: '',
      rating: null, views: null, participants: null, icon: '🗓️' };
  }
  async function load() {
    await window.AdminAuth.requireOperatorAuth();
    const [users, activities, requests, categories] = await Promise.all([
      authFetch('/operator/users'), authFetch('/operator/activities'),
      authFetch('/operator/business-requests'), authFetch('/categories')
    ]);
    const businessUsers = users.filter(u => u.role_name === 'business');
    const profiles = await Promise.all(businessUsers.map(u => authFetch(`/operator/business-profiles/${encodeURIComponent(u.user_id)}`)));
    state.customers = users.filter(u => u.role_name === 'customer').map(u => ({
      ...u, id: u.user_id, status: u.status === 'blocked' || u.status === 'suspended' ? 'locked' : u.status,
      rawStatus: u.status, registeredAt: 'Chưa có dữ liệu', lastLogin: 'Chưa có dữ liệu',
      interests: [], area: 'Chưa có dữ liệu' }));
    state.activities = activities.map(activityOf);
    state.requests = requests;
    state.categories = categories;
    state.businesses = businessUsers.map((u, i) => ({
      ...u, ...profiles[i], id: u.user_id, userId: u.user_id, name: profiles[i].business_name,
      address: profiles[i].business_address, status: u.status === 'blocked' || u.status === 'suspended' ? 'locked' : u.status,
      phone: profiles[i].phone || u.phone, type: 'Chưa có dữ liệu', hours: 'Chưa có dữ liệu',
      priceRange: 'Chưa có dữ liệu', verifiedBy: profiles[i].verified_by || 'Chưa xác minh'
    })).concat(requests.filter(r => r.status === 'pending').map(r => ({
      ...r, id: r.request_id, userId: r.user_id, requestId: r.request_id,
      name: r.business_name, address: r.business_address, status: 'pending',
      type: 'Chưa có dữ liệu', hours: 'Chưa có dữ liệu', priceRange: 'Chưa có dữ liệu', verifiedBy: 'Chưa xác minh'
    })));
    return state;
  }
  async function setStatus(entity, id, status) {
    if (entity === 'activity') {
      const current = state.activities.find(a => a.id === id);
      if (status === 'active' && current?.status === 'pending') {
        await authFetch(`/operator/activities/${encodeURIComponent(id)}/approve`, { method: 'PATCH' });
      } else if (status === 'hidden' && ['pending', 'active'].includes(current?.status)) {
        await authFetch(`/operator/activities/${encodeURIComponent(id)}/hide`, { method: 'PATCH' });
      } else {
        await authFetch(`/operator/activities/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      }
    } else if (entity === 'business' && state.businesses.find(b => b.id === id)?.requestId) {
      if (status !== 'active') throw new Error('Yêu cầu chờ duyệt cần được duyệt hoặc từ chối.');
      await authFetch(`/operator/business-requests/${encodeURIComponent(id)}/approve`, { method: 'PATCH' });
    } else {
      await authFetch(`/operator/users/${encodeURIComponent(id)}/status`, {
        method: 'PATCH', body: JSON.stringify({ status: status === 'locked' ? 'blocked' : status })
      });
    }
    return load();
  }
  async function rejectBusiness(id) {
    await authFetch(`/operator/business-requests/${encodeURIComponent(id)}/reject`, { method: 'PATCH' });
    return load();
  }
  window.AdminData = { ...state, get customers() { return state.customers; }, get businesses() { return state.businesses; },
    get activities() { return state.activities; }, get requests() { return state.requests; },
    get categories() { return state.categories; }, participations: [], statusLabels,
    load, setStatus, rejectBusiness, normalize, parseViDate, date, escapeHTML, businessName, formatPrice, formatHours };
})();
