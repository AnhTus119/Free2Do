(function () {
  'use strict';
  const api = window.CustomerAPI;
  const activitiesBox = document.getElementById('activities');
  const businessesBox = document.getElementById('businesses');
  const radiusSlider = document.getElementById('radiusSlider');
  const radiusValue = document.getElementById('radiusValue');
  const mapResults = document.getElementById('homeMapResults');
  const mapCount = document.getElementById('homeMapResultCount');
  const mapLocation = document.getElementById('homeMapLocation');
  const interestBox = document.querySelector('.match-card .chip-row');
  let position = null;
  let mapController;
  let searchTimer;
  let locationResolveTimer;
  let locationLabel = 'Vị trí hiện tại';
  let locationTouched = false; // người dùng đã tự chọn vị trí thì không ghi đè bằng GPS tới muộn

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
    return `<a class="activity-card" href="${api.escapeHTML(detailHref(item))}"><div class="activity-image">${image ? `<img src="${api.escapeHTML(image)}" alt="">` : '<span>Chưa có ảnh</span>'}</div><div class="activity-body"><div class="activity-title">${api.escapeHTML(item.name)}</div><div class="activity-meta">${api.escapeHTML(item.business_name)} · ${api.escapeHTML(item.address)}</div><div>${api.escapeHTML(api.priceLabel(item.price_text, item.price))} · ★ ${item.avg_rating ?? '—'} (${item.review_count})</div></div></a>`;
  }
  function detailHref(item) {
    const query = new URLSearchParams({ id: item.activity_id });
    if (window.Free2DoMap.validCoordinate(position?.latitude, position?.longitude)) {
      query.set('latitude', position.latitude);
      query.set('longitude', position.longitude);
    }
    return `activity-detail.html?${query}`;
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
    mapResults.innerHTML = items.length ? items.map(item => { const icon = activityImage(item); return `<a class="map-side-item" data-activity-id="${api.escapeHTML(item.activity_id)}" href="${api.escapeHTML(detailHref(item))}"><div class="map-side-img">${icon ? `<img src="${api.escapeHTML(icon)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px">` : '✨'}</div><div class="map-side-info"><h4>${api.escapeHTML(item.name)}</h4><p>${item.distance_km ?? '—'} km · ${api.escapeHTML(api.priceLabel(item.price_text, item.price))} · ★ ${item.avg_rating ?? '—'}</p><span class="map-match-badge">${item.match_score}% phù hợp</span></div></a>`; }).join('') : '<p style="padding:20px;color:var(--muted);">Không có hoạt động phù hợp.</p>';
    try { mapController?.render(position, Number(radiusSlider.value), items); }
    catch (error) { console.warn('Không thể vẽ bản đồ:', error); }
  }
  async function searchNearby(recordHistory = false) {
    if (!window.Free2DoMap.validCoordinate(position?.latitude, position?.longitude)) {
      throw new Error('Chưa xác định được vị trí. Hãy cho phép truy cập GPS hoặc nhập địa chỉ khác.');
    }
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
    const locationInput = document.getElementById('locationInput');
    const resolveTypedLocation = async () => {
      const query = locationInput.value.trim();
      if (!query || query === 'Vị trí hiện tại') return;
      const result = await api.request(`/search/location?query=${encodeURIComponent(query)}`);
      locationTouched = true;
      position = { latitude: result.latitude, longitude: result.longitude };
      locationLabel = result.display_name || query;
      mapLocation.textContent = locationLabel;
      await searchNearby(false);
    };
    locationInput.addEventListener('input', () => {
      mapLocation.textContent = locationInput.value.trim() || locationLabel;
      clearTimeout(locationResolveTimer);
    });
    locationInput.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      resolveTypedLocation().catch(error => alert(error.message));
    });
    locationInput.addEventListener('change', () => {
      locationResolveTimer = setTimeout(() => resolveTypedLocation().catch(error => alert(error.message)), 0);
    });
    interestBox.addEventListener('click', event => {
      const chip = event.target.closest('[data-category-id]');
      if (!chip) return;
      chip.classList.toggle('active');
      queueSearch();
    });
    document.querySelector('.loc-btn')?.addEventListener('click', async () => {
      try {
        position = await window.Free2DoMap.getCurrentPosition();
        locationTouched = true;
        document.getElementById('locationInput').value = 'Vị trí hiện tại';
        locationLabel = 'Vị trí hiện tại';
        mapLocation.textContent = 'Vị trí hiện tại';
        await searchNearby(false);
      } catch (error) { alert(error.message); }
    });
    mapResults.addEventListener('pointerover', event => { const item = event.target.closest('[data-activity-id]'); if (item) mapController?.highlight(item.dataset.activityId, true); });
    mapResults.addEventListener('pointerout', event => { const item = event.target.closest('[data-activity-id]'); if (item) mapController?.highlight(item.dataset.activityId, false); });
    mapController?.onSelectPosition(async selected => {
      position = selected;
      locationTouched = true;
      locationLabel = 'Vị trí đã chọn trên bản đồ';
      locationInput.value = locationLabel;
      mapLocation.textContent = locationLabel;
      await searchNearby(false).catch(error => alert(error.message));
    });
  }
  async function load() {
    // Xin GPS ngay khi mở trang, song song với API. Không dùng tọa độ Hà Nội
    // làm dữ liệu giả trong lúc chờ hoặc khi người dùng từ chối quyền vị trí.
    const gpsPromise = window.Free2DoMap.getCurrentPosition();
    const mapPromise = window.Free2DoMap.create('homeMapBox');
    const [, activities, businesses, categories] = await Promise.all([
      api.requireUser(), api.request('/activities'), api.request('/businesses'), api.request('/categories'),
    ]);
    mapController = await mapPromise;
    activitiesBox.innerHTML = activities.length ? activities.map(activityCard).join('') : '<div class="empty-state">Hiện chưa có hoạt động đang mở.</div>';
    businessesBox.innerHTML = businesses.length ? businesses.map(item => `<a class="activity-card" href="business-detail.html?id=${encodeURIComponent(item.user_id)}"><div class="activity-image">${item.avatar_url ? `<img src="${api.escapeHTML(item.avatar_url)}" alt="Logo ${api.escapeHTML(item.business_name)}">` : '<span>Chưa có logo</span>'}</div><div class="activity-body"><div class="activity-title">${api.escapeHTML(item.business_name)}</div><div class="activity-meta">${api.escapeHTML(item.business_address)}</div><p>${api.escapeHTML(item.description || 'Chưa có mô tả.')}</p><b>${item.activity_count} hoạt động đang mở</b></div></a>`).join('') : '<div class="empty-state">Hiện chưa có doanh nghiệp có hoạt động đang mở.</div>';
    interestBox.innerHTML = categories.map(item => `<div class="chip" data-category-id="${api.escapeHTML(item.category_id)}">${api.escapeHTML(item.name)}</div>`).join('');
    bindFilters();
    mapLocation.textContent = 'Đang lấy vị trí hiện tại…';
    try {
      const gps = await gpsPromise;
      if (!locationTouched) {
        position = gps;
        locationLabel = 'Vị trí hiện tại';
        document.getElementById('locationInput').value = locationLabel;
        mapLocation.textContent = locationLabel;
        await searchNearby(false);
      }
    } catch (error) {
      if (!locationTouched) {
        mapLocation.textContent = 'Chưa xác định vị trí';
        mapResults.innerHTML = `<p style="padding:20px;color:var(--muted);">${api.escapeHTML(error.message)} Bạn vẫn có thể nhập địa chỉ ở ô “Bạn đang ở đâu?”.</p>`;
      }
    }
  }
  document.getElementById('searchActivitiesButton').addEventListener('click', async event => {
    event.preventDefault();
    const typedLocation = document.getElementById('locationInput').value.trim();
    if (typedLocation && !['Vị trí hiện tại', 'Vị trí đã chọn trên bản đồ'].includes(typedLocation)) {
      try {
        const resolved = await api.request(`/search/location?query=${encodeURIComponent(typedLocation)}`);
        position = { latitude: resolved.latitude, longitude: resolved.longitude };
        locationLabel = resolved.display_name || typedLocation;
      } catch (error) { alert(error.message); return; }
    }
    if (!window.Free2DoMap.validCoordinate(position?.latitude, position?.longitude)) {
      alert('Chưa xác định được vị trí. Hãy cho phép truy cập GPS hoặc nhập địa chỉ khác.');
      return;
    }
    const params = new URLSearchParams({ latitude: position.latitude, longitude: position.longitude, location_label: locationLabel,
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
