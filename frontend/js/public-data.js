/* API-backed compatibility adapter for the customer discovery pages. */
(function () {
  'use strict';
  const base = window.FREE2DO_CONFIG.API_BASE_URL;
  const state = { activities: [], businesses: [], customers: [], participations: [], categories: [] };
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
  const price = value => value == null ? 'Chưa cập nhật' : `${Number(value).toLocaleString('vi-VN')} ₫`;
  const hours = (open, close) => {
    if (!open && !close) return 'Chưa cập nhật';
    const format = value => new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    return [open, close].filter(Boolean).map(format).join(' – ');
  };
  async function request(path) {
    const response = await fetch(`${base}${path}`);
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.detail || 'Không tải được dữ liệu từ máy chủ.');
    return body;
  }
  async function load() {
    const [categories, activities] = await Promise.all([request('/categories'), request('/activities')]);
    const reviews = await Promise.all(activities.map(item => request(`/activities/${encodeURIComponent(item.activity_id)}/reviews`).catch(() => [])));
    state.categories = categories;
    const categoryMap = new Map(categories.map(item => [item.category_id, item.name]));
    state.activities = activities.map((item, index) => ({
      id: item.activity_id, businessId: item.business_id, businessName: item.business_name,
      name: item.name, description: item.description || 'Chưa có mô tả.', price: item.price_text || price(item.price),
      rawPrice: item.price, address: item.address,
      location: item.latitude == null || item.longitude == null ? '' : `${item.latitude}, ${item.longitude}`,
      latitude: item.latitude, longitude: item.longitude, hours: hours(item.time_open, item.time_close),
      status: item.status, category: item.category_ids.map(id => categoryMap.get(id)).filter(Boolean).join(', ') || 'Chưa phân loại',
      categoryIds: item.category_ids, rating: item.avg_rating, reviewCount: item.review_count,
      media: item.media, icon: '✨',
    }));
    const uniqueBusinesses = new Map();
    state.activities.forEach(item => uniqueBusinesses.set(item.businessId, { id: item.businessId, name: item.businessName }));
    state.businesses = [...uniqueBusinesses.values()];
    state.participations = reviews.flat().map(review => ({
      activityId: review.activity_id, customerId: review.user_id, customerName: review.reviewer_name,
      date: new Date(review.created_at).toLocaleDateString('vi-VN'), status: 'active',
      rating: review.rating, content: review.content || '',
    }));
    const uniqueCustomers = new Map();
    state.participations.forEach(item => uniqueCustomers.set(item.customerId, { id: item.customerId, name: item.customerName }));
    state.customers = [...uniqueCustomers.values()];
  }
  const data = {
    get activities() { return state.activities; },
    get businesses() { return state.businesses; },
    get customers() { return state.customers; },
    get participations() { return state.participations; },
    get categories() { return state.categories; },
    escapeHTML,
    businessName(activity) { return activity.businessName || state.businesses.find(item => item.id === activity.businessId)?.name || 'Chưa xác định'; },
  };
  data.ready = load();
  window.AdminData = data;
})();
