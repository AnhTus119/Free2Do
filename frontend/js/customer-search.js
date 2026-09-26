(function () {
  'use strict';
  const api = window.CustomerAPI;
  const form = document.getElementById('searchForm');
  const results = document.getElementById('results');
  const status = document.getElementById('locationStatus');
  let position;
  function currentPosition() {
    if (position) return Promise.resolve(position);
    if (!navigator.geolocation) return Promise.reject(new Error('Trình duyệt không hỗ trợ định vị.'));
    status.textContent = 'Đang lấy vị trí…';
    return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
      value => { position = value.coords; status.textContent = 'Đã lấy vị trí hiện tại.'; resolve(position); },
      () => reject(new Error('Không thể lấy vị trí. Hãy cấp quyền định vị cho trang web.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 },
    ));
  }
  function optionalNumber(id) { const value = document.getElementById(id).value; return value === '' ? null : Number(value); }
  function render(items) {
    if (!items.length) { results.className = 'message'; results.textContent = 'Không có hoạt động phù hợp.'; return; }
    results.className = '';
    results.innerHTML = items.map(item => `<article class="result"><h3><a href="activity-detail.html?id=${encodeURIComponent(item.activity_id)}">${api.escapeHTML(item.name)}</a></h3><div class="meta">${api.escapeHTML(item.business_name)} · ${api.escapeHTML(item.address)}</div><p>${api.escapeHTML(item.description || 'Chưa có mô tả.')}</p><div><span class="score">${item.match_score}% phù hợp</span> · ${item.distance_km} km · ${api.escapeHTML(api.price(item.price))} · ★ ${item.avg_rating ?? '—'} (${item.review_count})</div></article>`).join('');
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = form.querySelector('button[type=submit]'); button.disabled = true;
    try {
      const coords = await currentPosition();
      const payload = { keyword: document.getElementById('keyword').value.trim() || null,
        latitude: coords.latitude, longitude: coords.longitude, radius: Number(document.getElementById('radius').value),
        budget: optionalNumber('budget'), free_time: optionalNumber('freeTime'),
        category_ids: [...document.querySelectorAll('[name=category]:checked')].map(input => input.value), sort_by: document.getElementById('sortBy').value };
      results.className = 'message'; results.textContent = 'Đang tìm…';
      render(await api.request('/search', { method: 'POST', body: payload }));
    } catch (error) { results.className = 'message'; results.textContent = error.message; }
    finally { button.disabled = false; }
  });
  api.requireUser().then(async () => {
    const categories = await api.request('/categories');
    document.getElementById('categoryList').innerHTML = categories.map(item => `<label><input type="checkbox" name="category" value="${api.escapeHTML(item.category_id)}"> ${api.escapeHTML(item.name)}</label>`).join('') || '<span>Chưa có danh mục.</span>';
    const query = new URLSearchParams(location.search).get('q'); if (query) { document.getElementById('keyword').value = query; form.requestSubmit(); }
  }).catch(error => { results.textContent = error.message; });
})();
