(function () {
  'use strict';
  const api = window.CustomerAPI;
  const DEFAULT_POSITION = { latitude: 21.0285, longitude: 105.8542 };
  const activitiesBox = document.getElementById('activities');
  const businessesBox = document.getElementById('businesses');
  const radiusSlider = document.getElementById('radiusSlider');
  const radiusValue = document.getElementById('radiusValue');
  const mapResults = document.getElementById('homeMapResults');
  const mapCount = document.getElementById('homeMapResultCount');
  const mapLocation = document.getElementById('homeMapLocation');
  const interestBox = document.querySelector('.match-card .chip-row');
  let position = DEFAULT_POSITION;
  let mapController;
  let searchTimer;

  const parseMoney = value => {
    const normalized = String(value || '').replace(/[^0-9]/g, '');
    return normalized ? Number(normalized) : null;
  };
  function freeMinutes() {
    const hours = Math.min(24, Math.max(0, Number(document.getElementById('freeHours').value) || 0));
    const minutes = Math.min(59, Math.max(0, Number(document.getElementById('freeMinutes').value) || 0));
    const total = Math.trunc(hours * 60 + minutes);
    return total >= 30 ? total : null;
  }
  const selectedCategoryIds = () => [...interestBox.querySelectorAll('[data-category-id].active')].map(item => item.dataset.categoryId);
  const activityImage = item => item.image_url
    || item.media?.find(media => media.media_type === 'image')?.media_url || null;
  function activityCard(item) {
    const image = activityImage(item);
    return `<a class="activity-card" href="activity-detail.html?id=${encodeURIComponent(item.activity_id)}"><div class="activity-image">${image ? `<img src="${api.escapeHTML(image)}" alt="">` : '<span>Chưa có ảnh</span>'}</div><div class="activity-body"><div class="activity-title">${api.escapeHTML(item.name)}</div><div class="activity-meta">${api.escapeHTML(item.business_name)} · ${api.escapeHTML(item.address)}</div><div>${api.escapeHTML(api.priceLabel(item.price_text, item.price))} · ★ ${item.avg_rating ?? '—'} (${item.review_count})</div></div></a>`;
  }
  function paginate(box, nav, perPage) {
    let page = 1;
    function render() {
      const items = [...box.children].filter(item => !item.classList.contains('empty-state'));
      const size = perPage();
      const total = Math.max(1, Math.ceil(items.length / size));
      page = Math.min(page, total);
      items.forEach((item, index) => { item.style.display = index >= (page - 1) * size && index < page * size ? '' : 'none'; });
      if (total <= 1) { nav.innerHTML = ''; return; }
      nav.innerHTML = `<button data-page="prev" ${page === 1 ? 'disabled' : ''}>‹</button>${Array.from({ length: total }, (_, index) => `<button data-page="${index + 1}" class="${page === index + 1 ? 'active' : ''}">${index + 1}</button>`).join('')}<button data-page="next" ${page === total ? 'disabled' : ''}>›</button>`;
    }
    nav.addEventListener('click', event => {
      const button = event.target.closest('[data-page]');
      if (!button || button.disabled) return;
      page = button.dataset.page === 'prev' ? page - 1 : button.dataset.page === 'next' ? page + 1 : Number(button.dataset.page);
      render();
    });
    new MutationObserver(render).observe(box, { childList: true });
    window.addEventListener('resize', render);
    render();
  }
  function renderMapResults(items) {
    mapCount.textContent = items.length;
    mapResults.innerHTML = items.length ? items.map(item => { const icon = activityImage(item); return `<a class="map-side-item" data-activity-id="${api.escapeHTML(item.activity_id)}" href="activity-detail.html?id=${encodeURIComponent(item.activity_id)}"><div class="map-side-img">${icon ? `<img src="${api.escapeHTML(icon)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px">` : '✨'}</div><div class="map-side-info"><h4>${api.escapeHTML(item.name)}</h4><p>${item.distance_km ?? '—'} km · ${api.escapeHTML(api.priceLabel(item.price_text, item.price))} · ★ ${item.avg_rating ?? '—'}</p><span class="map-match-badge">${item.match_score}% phù hợp</span></div></a>`; }).join('') : '<p style="padding:20px;color:var(--muted);">Không có hoạt động phù hợp.</p>';
    try { mapController?.render(position, Number(radiusSlider.value), items); }
    catch (error) { console.warn('Không thể vẽ bản đồ:', error); }
  }
  async function searchNearby(recordHistory = false) {
    const items = await api.request('/search', { method: 'POST', body: {
      latitude: position.latitude, longitude: position.longitude, radius: Number(radiusSlider.value),
      budget: parseMoney(document.getElementById('budgetInput').value), free_time: freeMinutes(),
      category_ids: selectedCategoryIds(), sort_by: 'match', record_history: recordHistory,
    } });
    renderMapResults(items);
  }
  function queueSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => searchNearby(false).catch(error => {
      mapResults.innerHTML = `<p style="padding:20px;color:var(--muted);">${api.escapeHTML(error.message)}</p>`;
    }), 250);
  }
  function bindFilters() {
    radiusSlider.addEventListener('input', () => { radiusValue.textContent = radiusSlider.value; queueSearch(); });
    ['freeHours', 'freeMinutes', 'budgetInput'].forEach(id => document.getElementById(id).addEventListener('input', queueSearch));
    document.getElementById('locationInput').addEventListener('input', () => { mapLocation.textContent = document.getElementById('locationInput').value.trim() || 'Vị trí hiện tại'; });
    interestBox.addEventListener('click', event => {
      const chip = event.target.closest('[data-category-id]');
      if (!chip) return;
      chip.classList.toggle('active');
      queueSearch();
    });
    document.querySelector('.loc-btn')?.addEventListener('click', async () => {
      try {
        position = await window.Free2DoMap.getCurrentPosition();
        document.getElementById('locationInput').value = 'Vị trí hiện tại';
        mapLocation.textContent = 'Vị trí hiện tại';
        await searchNearby(false);
      } catch (error) { alert(error.message); }
    });
    mapResults.addEventListener('pointerover', event => { const item = event.target.closest('[data-activity-id]'); if (item) mapController?.highlight(item.dataset.activityId, true); });
    mapResults.addEventListener('pointerout', event => { const item = event.target.closest('[data-activity-id]'); if (item) mapController?.highlight(item.dataset.activityId, false); });
  }
  async function load() {
    await api.requireUser();
    mapController = await window.Free2DoMap.create('homeMapBox', position);
    const [activities, businesses, categories, preferences] = await Promise.all([
      api.request('/activities'), api.request('/businesses'), api.request('/categories'), api.request('/users/me/categories'),
    ]);
    activitiesBox.innerHTML = activities.length ? activities.map(activityCard).join('') : '<div class="empty-state">Hiện chưa có hoạt động đang mở.</div>';
    businessesBox.innerHTML = businesses.length ? businesses.map(item => `<a class="activity-card" href="business-detail.html?id=${encodeURIComponent(item.user_id)}"><div class="activity-image">${item.avatar_url ? `<img src="${api.escapeHTML(item.avatar_url)}" alt="Logo ${api.escapeHTML(item.business_name)}">` : '<span>Chưa có logo</span>'}</div><div class="activity-body"><div class="activity-title">${api.escapeHTML(item.business_name)}</div><div class="activity-meta">${api.escapeHTML(item.business_address)}</div><p>${api.escapeHTML(item.description || 'Chưa có mô tả.')}</p><b>${item.activity_count} hoạt động đang mở</b></div></a>`).join('') : '<div class="empty-state">Hiện chưa có doanh nghiệp có hoạt động đang mở.</div>';
    const preferred = new Set(preferences.map(item => item.category_id));
    interestBox.innerHTML = categories.map(item => `<div class="chip ${preferred.has(item.category_id) ? 'active' : ''}" data-category-id="${api.escapeHTML(item.category_id)}">${api.escapeHTML(item.name)}</div>`).join('');
    bindFilters();
    try { position = await window.Free2DoMap.getCurrentPosition(); mapLocation.textContent = 'Vị trí hiện tại'; }
    catch (_) { mapLocation.textContent = 'Hà Nội (mặc định)'; }
    await searchNearby(false);
  }
  document.getElementById('searchActivitiesButton').addEventListener('click', event => {
    event.preventDefault();
    const params = new URLSearchParams({ latitude: position.latitude, longitude: position.longitude,
      radius: radiusSlider.value, hours: document.getElementById('freeHours').value || '0',
      minutes: document.getElementById('freeMinutes').value || '0', budget: document.getElementById('budgetInput').value.trim(),
      categories: selectedCategoryIds().join('|') });
    location.href = `search.html?${params}`;
  });
  const perPage = () => window.innerWidth <= 600 ? 3 : window.innerWidth <= 900 ? 4 : 6;
  paginate(activitiesBox, document.getElementById('activitiesPager'), perPage);
  paginate(businessesBox, document.getElementById('businessesPager'), perPage);
  load().catch(error => { activitiesBox.innerHTML = `<div class="empty-state">${api.escapeHTML(error.message)}</div>`; });
})();
