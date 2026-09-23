/* Data adapter shared by the operator and customer screens. No sample records. */
(function () {
  'use strict';
  const api = window.Free2DoAPI;
  const isCustomerPage = location.pathname.includes('Demo%20Trang%20Customer') || location.pathname.includes('Demo Trang Customer');
  const state = { customers: [], businesses: [], activities: [], participations: [], requests: [], dashboard: null };
  const statusLabels = { active: 'Hoạt động', pending: 'Chờ duyệt', locked: 'Đã khóa', blocked: 'Đã khóa', suspended: 'Tạm ngưng', hidden: 'Đã ẩn', rejected: 'Từ chối', cancelled: 'Đã hủy', approved: 'Đã duyệt' };
  const formatDate = value => value ? new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa có dữ liệu';
  const formatTime = value => value ? new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa thiết lập';
  const money = value => value == null ? 'Chưa có giá' : `${Number(value).toLocaleString('vi-VN')} ₫`;
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
  const parseViDate = value => { const [d,m,y] = String(value || '').split('/').map(Number); return y ? new Date(y,m-1,d) : new Date(0); };
  const mapUser = user => ({ id: user.user_id, name: user.name, email: user.email, phone: user.phone || 'Chưa cung cấp', area: 'Chưa có dữ liệu', registeredAt: formatDate(user.created_at), lastLogin: 'Chưa có dữ liệu', status: user.status === 'blocked' ? 'locked' : user.status, interests: [] });
  const mapBusiness = (user, profile, request) => ({ id: user?.user_id || request?.user_id, requestId: request?.request_id, name: profile?.business_name || request?.business_name || user?.name || 'Chưa có tên', address: profile?.business_address || request?.business_address || 'Chưa cung cấp', type: 'Doanh nghiệp', phone: profile?.phone || request?.phone || user?.phone || '', hours: 'Chưa có dữ liệu', priceRange: 'Chưa có dữ liệu', status: request ? 'pending' : (user?.status === 'blocked' ? 'locked' : user?.status || 'active'), verifiedBy: profile?.verified_by || '', description: profile?.description || request?.description || '' });
  const categoryType = value => { const label = normalize(value); return /workshop|thu cong|nghe thuat/.test(label) ? 'workshop' : /lam dep|spa/.test(label) ? 'beauty' : /an uong|cafe|ca phe/.test(label) ? 'food' : /giai tri|phim|the thao/.test(label) ? 'entertainment' : 'all'; };
  const mapActivity = item => ({ id: item.activity_id, name: item.name, businessId: item.business_id, businessName: item.business_name || '', type: categoryType(item.category_name || ''), category: 'Chưa phân loại', price: money(item.price), hours: `${formatTime(item.time_open)} – ${formatTime(item.time_close)}`, address: item.address, location: `${item.latitude}, ${item.longitude}`, status: item.status, description: item.description || '', verifiedBy: item.verified_by || '', expireAt: '', views: null, participants: null, rating: item.avg_rating || 0, createdAt: formatDate(item.created_at), icon: '🗓️' });
  async function refresh() {
    if (isCustomerPage) {
      const [activities, categories] = await Promise.all([api.request('/activities'), api.request('/categories')]);
      const names = new Map(categories.map(c => [c.category_id, c.name]));
      state.activities = activities.map(item => { const result = mapActivity(item); result.category = names.get(item.category_ids?.[0]) || 'Chưa phân loại'; result.type = categoryType(result.category); return result; });
      return;
    }
    const auth = window.AdminAuth;
    await auth.requireOperatorAuth();
    const [users, activities, requests, dashboard, categories] = await Promise.all([
      auth.authFetch('/operator/users'),
      auth.authFetch('/operator/activities'),
      auth.authFetch('/operator/business-requests'),
      auth.authFetch('/operator/dashboard'),
      api.request('/categories')
    ]);
    const customers = users.filter(u => u.role_name === 'customer');
    const businesses = users.filter(u => u.role_name === 'business');
    const profiles = await Promise.all(businesses.map(async u => {
      try { return await auth.authFetch(`/operator/business-profiles/${encodeURIComponent(u.user_id)}`); }
      catch (error) { if (!error.message.includes('404')) console.warn(error); return null; }
    }));
    state.customers = customers.map(mapUser);
    state.requests = requests;
    state.businesses = businesses.map((user, i) => mapBusiness(user, profiles[i]));
    state.businesses.push(...requests.filter(r => r.status === 'pending' && !businesses.some(u => u.user_id === r.user_id)).map(r => mapBusiness(users.find(u => u.user_id === r.user_id), null, r)));
    const names = new Map(categories.map(c => [c.category_id, c.name]));
    state.activities = activities.map(item => { const result = mapActivity(item); result.category = names.get(item.category_ids?.[0]) || 'Chưa phân loại'; result.type = categoryType(result.category); return result; });
    state.dashboard = dashboard;
  }
  async function setStatus(entity, id, status) {
    if (entity === 'activity') {
      await window.AdminAuth.authFetch(`/operator/activities/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status: status === 'rejected' ? 'hidden' : status }) });
    } else if (entity === 'business') {
      const item = state.businesses.find(x => x.id === id);
      if (item?.requestId && item.status === 'pending') {
        const action = status === 'active' ? 'approve' : 'reject';
        await window.AdminAuth.authFetch(`/operator/business-requests/${encodeURIComponent(item.requestId)}/${action}`, { method: 'PATCH' });
      } else {
        await window.AdminAuth.authFetch(`/operator/users/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status: status === 'locked' ? 'blocked' : status }) });
      }
    } else {
      await window.AdminAuth.authFetch(`/operator/users/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status: status === 'locked' ? 'blocked' : status }) });
    }
    await refresh();
  }
  function error(error) {
    console.error(error);
    const notice = document.createElement('div');
    notice.setAttribute('role', 'alert');
    notice.style.cssText = 'position:fixed;z-index:9999;top:12px;left:50%;transform:translateX(-50%);max-width:90vw;padding:14px 20px;border-radius:8px;background:#b42318;color:white;box-shadow:0 4px 20px #0004';
    notice.textContent = error.message || 'Không tải được dữ liệu từ máy chủ.';
    document.body.prepend(notice);
    setTimeout(() => notice.remove(), 7000);
  }
  const ready = refresh().catch(e => { error(e); throw e; });
  window.AdminData = { get customers(){return state.customers;}, get businesses(){return state.businesses;}, get activities(){return state.activities;}, get participations(){return state.participations;}, get dashboard(){return state.dashboard;}, get requests(){return state.requests;}, ready, refresh, error, statusLabels, setStatus, parseViDate, normalize, escapeHTML, businessName(activity){ return state.businesses.find(x => x.id === activity.businessId)?.name || activity.businessName || 'Chưa xác định'; } };
})();
