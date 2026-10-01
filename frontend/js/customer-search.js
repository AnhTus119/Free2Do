(function () {
  'use strict';
  const api = window.CustomerAPI;
  const params = new URLSearchParams(location.search);
  const DEFAULT_POSITION = { latitude: 21.0285, longitude: 105.8542 };
  const resultCount = document.getElementById('resultCount');
  const summary = document.getElementById('searchSummary');
  const radiusSlider = document.getElementById('searchRadiusSlider');
  const radiusValue = document.getElementById('searchRadiusValue');
  const mapRadius = document.getElementById('mapRadiusLabel');
  const mapLocation = document.getElementById('mapLocationLabel');
  const mapResults = document.getElementById('mapSideResults');
  const mapCount = document.getElementById('mapResultCount');
  const listResults = document.getElementById('searchResults');
  const detailResults = document.getElementById('detailResults');
  const categoryBox = document.getElementById('interestFilters');
  const sortSelect = document.getElementById('sortSelect');
  let position = DEFAULT_POSITION;
  let mapController;
  let timer;
  let requestSequence = 0;
  let mapSideView = 'list';
  let locationTouched = false; // đã tự chọn vị trí trên bản đồ thì không ghi đè bằng GPS tới muộn
  let locationLabel = params.get('location_label') || 'Vị trí hiện tại';

  const parseMoney = value => {
    const normalized = String(value || '').replace(/[^0-9]/g, '');
    return normalized ? Number(normalized) : null;
  };
  const selectedCategories = () => [...categoryBox.querySelectorAll('[data-category-id].active')].map(item => item.dataset.categoryId);
  function availableMinutes() {
    const hours = Math.min(24, Math.max(0, Number(document.getElementById('freeHours').value) || 0));
    const minutes = Math.min(59, Math.max(0, Number(document.getElementById('freeMinutes').value) || 0));
    const total = Math.trunc(hours * 60 + minutes);
    return total >= 30 ? total : null;
  }
  function selectedBudget() {
    const selected = document.querySelector('input[name="budget"]:checked')?.value;
    if (!selected) return null;
    if (selected === 'free') return 0;
    if (selected === 'custom') return parseMoney(document.getElementById('customBudgetInput').value);
    return Number(selected);
  }
  function imageHTML(item) {
    return item.image_url ? `<img src="${api.escapeHTML(item.image_url)}" alt="" style="width:100%;height:100%;object-fit:cover">` : '✨';
  }
  function detailHref(item) {
    const query = new URLSearchParams({ id: item.activity_id, latitude: position.latitude, longitude: position.longitude });
    return `activity-detail.html?${query}`;
  }
  function listRow(item) {
    return `<a href="${api.escapeHTML(detailHref(item))}" class="activity-list-row"><span><span class="activity-title">${api.escapeHTML(item.name)}</span><span class="activity-biz">${api.escapeHTML(item.business_name)}</span></span><span class="activity-list-address" title="${api.escapeHTML(item.address)}">${api.escapeHTML(item.address)}</span><span class="activity-list-rating">★ ${item.avg_rating ?? '—'}</span><span class="activity-list-price">${api.escapeHTML(api.priceLabel(item.price_text, item.price))}</span><span class="activity-list-distance">${item.distance_km ?? '—'} km</span></a>`;
  }
  function detailCard(item) {
    return `<a href="${api.escapeHTML(detailHref(item))}" class="activity-card"><div class="activity-img" style="background:#F3D9A6;overflow:hidden">${imageHTML(item)}<span class="match-badge">${item.match_score}% phù hợp</span></div><div class="activity-body"><div class="activity-title">${api.escapeHTML(item.name)}</div><div class="activity-biz">${api.escapeHTML(item.business_name)} · ${api.escapeHTML(item.address)}</div><div class="activity-meta">★ ${item.avg_rating ?? '—'} · <span class="activity-price">${api.escapeHTML(api.priceLabel(item.price_text, item.price))}</span> · ${item.distance_km ?? '—'} km · ${api.escapeHTML(api.hours(item.time_open, item.time_close))}</div><div class="why-match">Phù hợp với tiêu chí bạn đã chọn</div></div></a>`;
  }
  function sideRow(item) {
    return `<a class="map-side-item" data-activity-id="${api.escapeHTML(item.activity_id)}" href="${api.escapeHTML(detailHref(item))}"><div class="map-side-img">${imageHTML(item)}</div><div class="map-side-info"><h4>${api.escapeHTML(item.name)}</h4><p>${item.distance_km ?? '—'} km · ${api.escapeHTML(api.priceLabel(item.price_text, item.price))} · ★ ${item.avg_rating ?? '—'}</p><span class="map-match-badge">${item.match_score}% phù hợp</span></div></a>`;
  }
  function render(items) {
    resultCount.textContent = items.length;
    mapCount.textContent = items.length;
    listResults.innerHTML = items.length ? items.map(listRow).join('') : '<p>Không tìm thấy hoạt động phù hợp với thông tin bạn đã chọn.</p>';
    detailResults.innerHTML = items.length ? items.map(detailCard).join('') : '<p>Không tìm thấy hoạt động phù hợp với thông tin bạn đã chọn.</p>';
    mapResults.innerHTML = items.length ? items.map(mapSideView === 'details' ? detailCard : sideRow).join('') : '<p style="padding:20px;">Không có hoạt động phù hợp.</p>';
    try { mapController?.render(position, Number(radiusSlider.value), items); }
    catch (error) { console.warn('Không thể vẽ bản đồ:', error); }
    const categoryNames = [...categoryBox.querySelectorAll('[data-category-id].active')].map(item => item.textContent.trim());
    summary.textContent = `Đang lọc theo: rảnh ${availableMinutes() ?? 0} phút · bán kính ${radiusSlider.value} km · ngân sách ${selectedBudget() == null ? 'không giới hạn' : api.price(selectedBudget())} · sở thích: ${categoryNames.join(', ') || 'tất cả'}`;
  }
  function syncQuery() {
    params.set('latitude', position.latitude);
    params.set('longitude', position.longitude);
    params.set('location_label', locationLabel);
    params.set('radius', radiusSlider.value);
    params.set('hours', document.getElementById('freeHours').value || '0');
    params.set('minutes', document.getElementById('freeMinutes').value || '0');
    params.set('categories', selectedCategories().join('|'));
    const budget = selectedBudget();
    if (budget == null) params.delete('budget'); else params.set('budget', budget);
    history.replaceState(null, '', `${location.pathname}?${params}`);
  }
  async function search(recordHistory = false) {
    const sequence = ++requestSequence;
    syncQuery();
    const items = await api.request('/search', { method: 'POST', body: {
      keyword: params.get('q') || null, latitude: position.latitude, longitude: position.longitude,
      radius: Number(radiusSlider.value), budget: selectedBudget(), free_time: availableMinutes(),
      category_ids: selectedCategories(), sort_by: sortSelect.value, record_history: recordHistory,
    } });
    if (sequence === requestSequence) render(items);
  }
  function queueSearch() {
    clearTimeout(timer);
    timer = setTimeout(() => search(false).catch(error => {
      mapResults.innerHTML = `<p style="padding:20px;">${api.escapeHTML(error.message)}</p>`;
    }), 220);
  }
  function restoreFilters() {
    radiusSlider.value = params.get('radius') || '5';
    radiusValue.textContent = radiusSlider.value;
    mapRadius.textContent = radiusSlider.value;
    document.getElementById('freeHours').value = params.get('hours') || '0';
    document.getElementById('freeMinutes').value = params.get('minutes') || '0';
    const budget = parseMoney(params.get('budget'));
    if (budget != null) {
      const option = budget === 0 ? 'free' : budget <= 200000 ? '200000' : budget <= 500000 ? '500000' : 'custom';
      const radio = document.querySelector(`input[name="budget"][value="${option}"]`);
      if (radio) radio.checked = true;
      if (option === 'custom') {
        document.getElementById('customBudgetInput').hidden = false;
        document.getElementById('customBudgetInput').value = budget;
      }
    }
    if (window.Free2DoMap.validCoordinate(Number(params.get('latitude')), Number(params.get('longitude')))) {
      position = { latitude: Number(params.get('latitude')), longitude: Number(params.get('longitude')) };
    }
  }
  function setView(view) {
    document.getElementById('view-map').style.display = view === 'details' ? 'none' : 'block';
    document.getElementById('view-list').style.display = 'none';
    document.getElementById('view-details').style.display = view === 'details' ? 'block' : 'none';
    document.querySelectorAll('#viewSwitchMobile button').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    if (view !== 'details') setTimeout(() => mapController?.invalidate(), 0);
  }
  function bind() {
    radiusSlider.addEventListener('input', () => { radiusValue.textContent = radiusSlider.value; mapRadius.textContent = radiusSlider.value; queueSearch(); });
    ['freeHours', 'freeMinutes'].forEach(id => document.getElementById(id).addEventListener('input', queueSearch));
    sortSelect.addEventListener('change', queueSearch);
    categoryBox.addEventListener('click', event => { const chip = event.target.closest('[data-category-id]'); if (chip) { chip.classList.toggle('active'); queueSearch(); } });
    document.querySelectorAll('input[name="budget"]').forEach(input => input.addEventListener('change', () => {
      const custom = document.getElementById('customBudgetInput');
      custom.hidden = input.value !== 'custom';
      if (input.value === 'custom') custom.focus();
      queueSearch();
    }));
    document.getElementById('customBudgetInput').addEventListener('input', queueSearch);
    const keywordInput = document.querySelector('.nav-search input');
    if (keywordInput) {
      keywordInput.value = params.get('q') || '';
      keywordInput.addEventListener('input', () => {
        const value = keywordInput.value.trim();
        if (value) params.set('q', value); else params.delete('q');
        queueSearch();
      });
      keywordInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); queueSearch(); }
      });
    }
    document.getElementById('map-list-button').addEventListener('click', () => { mapSideView = 'list'; document.getElementById('map-list-button').classList.add('active'); document.getElementById('map-details-button').classList.remove('active'); queueSearch(); });
    document.getElementById('map-details-button').addEventListener('click', () => { mapSideView = 'details'; document.getElementById('map-details-button').classList.add('active'); document.getElementById('map-list-button').classList.remove('active'); queueSearch(); });
    mapResults.addEventListener('pointerover', event => { const item = event.target.closest('[data-activity-id]'); if (item) mapController?.highlight(item.dataset.activityId, true); });
    mapResults.addEventListener('pointerout', event => { const item = event.target.closest('[data-activity-id]'); if (item) mapController?.highlight(item.dataset.activityId, false); });
    document.addEventListener('click', event => { const button = event.target.closest('#viewSwitchMobile button'); if (button) setView(button.dataset.view); });
  }
  async function load() {
    restoreFilters();
    // Kiểm tra đăng nhập, tải danh mục, dựng bản đồ và định vị GPS chạy song song.
    const needsGps = !params.has('latitude');
    const gpsPromise = needsGps ? window.Free2DoMap.getCurrentPosition().then(found => found, () => null) : null;
    const mapPromise = window.Free2DoMap.create('searchMap', position);
    const [, categories] = await Promise.all([api.requireUser(), api.request('/categories')]);
    mapController = await mapPromise;
    mapController.onSelectPosition(async selected => {
      position = selected;
      locationTouched = true;
      locationLabel = 'Vị trí đã chọn trên bản đồ';
      mapLocation.textContent = locationLabel;
      await search(false).catch(error => { mapResults.innerHTML = `<p style="padding:20px;">${api.escapeHTML(error.message)}</p>`; });
    });
    const initial = new Set((params.get('categories') || '').split('|').filter(Boolean));
    categoryBox.innerHTML = categories.map(item => `<div class="chip ${initial.has(item.category_id) ? 'active' : ''}" data-category-id="${api.escapeHTML(item.category_id)}">${api.escapeHTML(item.name)}</div>`).join('');
    bind();
    let lateGps = null;
    if (needsGps) {
      // Chỉ chờ GPS tối đa 2 giây; chậm hơn thì tìm quanh vị trí mặc định rồi cập nhật khi GPS về.
      const gps = await Promise.race([gpsPromise, new Promise(resolve => setTimeout(() => resolve(undefined), 2000))]);
      if (gps) { position = gps; locationLabel = 'Vị trí hiện tại'; mapLocation.textContent = locationLabel; }
      else { mapLocation.textContent = 'Hà Nội (mặc định)'; if (gps === undefined) lateGps = gpsPromise; }
    } else mapLocation.textContent = locationLabel;
    await search(true);
    setView(matchMedia('(max-width:900px)').matches ? 'details' : 'list');
    lateGps?.then(found => {
      if (!found || locationTouched) return;
      position = found; locationLabel = 'Vị trí hiện tại'; mapLocation.textContent = locationLabel;
      search(false).catch(() => {});
    });
  }
  window.toggleMapView = () => setView('list');
  load().catch(error => { mapResults.innerHTML = `<p style="padding:20px;">${api.escapeHTML(error.message)}</p>`; });
})();
