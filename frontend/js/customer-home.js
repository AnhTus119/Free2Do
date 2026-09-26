(function () {
  'use strict';
  const api = window.CustomerAPI;
  const list = document.getElementById('activities');
  document.getElementById('quickSearch').addEventListener('submit', event => {
    event.preventDefault(); const keyword = document.getElementById('quickKeyword').value.trim();
    location.href = `search.html${keyword ? `?q=${encodeURIComponent(keyword)}` : ''}`;
  });
  async function load() {
    const [activities, businesses] = await Promise.all([api.request('/activities'), api.request('/businesses')]);
    list.innerHTML = activities.length ? activities.map(item => {
      const image = item.media?.find(media => media.media_type === 'image')?.media_url;
      return `<a class="activity-card" href="activity-detail.html?id=${encodeURIComponent(item.activity_id)}"><div class="activity-image">${image ? `<img src="${api.escapeHTML(image)}" alt="">` : '<span>Chưa có ảnh</span>'}</div><div class="activity-body"><div class="activity-title">${api.escapeHTML(item.name)}</div><div class="activity-meta">${api.escapeHTML(item.business_name)} · ${api.escapeHTML(item.address)}</div><div>${api.escapeHTML(api.price(item.price))} · ★ ${item.avg_rating ?? '—'} (${item.review_count})</div></div></a>`;
    }).join('') : '<div class="empty-state">Hiện chưa có hoạt động đang mở.</div>';
    document.getElementById('businesses').innerHTML = businesses.length ? businesses.map(item => `<article class="activity-card"><div class="activity-image">${item.avatar_url ? `<img src="${api.escapeHTML(item.avatar_url)}" alt="">` : '<span>Chưa có logo</span>'}</div><div class="activity-body"><div class="activity-title">${api.escapeHTML(item.business_name)}</div><div class="activity-meta">${api.escapeHTML(item.business_address)}</div><p>${api.escapeHTML(item.description || 'Chưa có mô tả.')}</p><b>${item.activity_count} hoạt động đang mở</b></div></article>`).join('') : '<div class="empty-state">Hiện chưa có doanh nghiệp có hoạt động đang mở.</div>';
    if (localStorage.getItem('token')) {
      try {
        const me = await api.request('/auth/me');
        if (me.account_type === 'user') document.getElementById('identity').innerHTML = `<a class="nav-link" href="account.html#hoso">${api.escapeHTML(me.name)}</a> <a class="logout nav-link" href="#">Đăng xuất</a>`;
      } catch (_) { localStorage.removeItem('token'); }
    }
  }
  load().catch(error => { list.innerHTML = `<div class="empty-state">${api.escapeHTML(error.message)}</div>`; });
})();
