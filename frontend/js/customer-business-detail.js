(function () {
  'use strict';
  const api = window.CustomerAPI;
  const id = new URLSearchParams(location.search).get('id');
  async function load() {
    if (!id) throw new Error('Thiếu mã doanh nghiệp.');
    const [business, activities] = await Promise.all([
      api.request(`/businesses/${encodeURIComponent(id)}`),
      api.request('/activities'),
    ]);
    document.title = `FREE2DO — ${business.business_name}`;
    document.getElementById('businessName').textContent = business.business_name;
    document.getElementById('businessAddress').textContent = business.business_address;
    document.getElementById('businessDescription').textContent = business.description || 'Chưa có mô tả.';
    document.getElementById('businessPhone').textContent = business.phone ? `Liên hệ: ${business.phone}` : '';
    document.getElementById('businessLogo').innerHTML = business.avatar_url ? `<img src="${api.escapeHTML(business.avatar_url)}" alt="Logo ${api.escapeHTML(business.business_name)}">` : '<span>Chưa có logo</span>';
    const media = (business.media || []).filter(item => item.media_kind !== 'logo');
    document.getElementById('businessMedia').innerHTML = media.length ? media.map(item => item.media_type === 'video'
      ? `<video src="${api.escapeHTML(item.media_url)}" controls preload="metadata"></video>`
      : `<img src="${api.escapeHTML(item.media_url)}" alt="Hình ảnh ${api.escapeHTML(business.business_name)}" loading="lazy">`).join('') : '<p>Chưa có hình ảnh.</p>';
    const owned = activities.filter(item => item.business_id === id);
    document.getElementById('businessActivities').innerHTML = owned.length ? owned.map(item => {
      const image = (item.media || []).find(asset => asset.media_type === 'image');
      return `<a class="activity-card" href="activity-detail.html?id=${encodeURIComponent(item.activity_id)}"><div class="activity-image">${image ? `<img src="${api.escapeHTML(image.media_url)}" alt="${api.escapeHTML(item.name)}">` : '<span>Chưa có ảnh</span>'}</div><div class="activity-body"><b>${api.escapeHTML(item.name)}</b><div class="activity-meta">${api.escapeHTML(item.address)} · ${api.escapeHTML(api.priceLabel(item.price_text, item.price))}</div></div></a>`;
    }).join('') : '<p>Doanh nghiệp chưa có hoạt động đang mở.</p>';
    if (localStorage.getItem('token')) await api.requireUser();
  }
  load().catch(error => { document.getElementById('businessHero').textContent = error.message; });
})();
