(function () {
  'use strict';
  const api = window.CustomerAPI;
  const params = new URLSearchParams(location.search);
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
  const keywordInput = document.querySelector('.nav-search input');
  const todayTime = document.getElementById('todayTime');
  const otherTime = document.getElementById('otherTime');
  const dateFilter = document.getElementById('dateFilter');
  const startTimeFilter = document.getElementById('startTimeFilter');
  const timeFilterLabel = document.getElementById('timeFilterLabel');
  let position = null;
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
  function updateTodayLabel() {
    const hours = Math.min(24, Math.max(0, Number(document.getElementById('freeHours').value) || 0));
    const minutes = Math.min(59, Math.max(0, Number(document.getElementById('freeMinutes').value) || 0));
    timeFilterLabel.textContent = `Hôm nay, rảnh ${Math.trunc(hours)} giờ ${Math.trunc(minutes)} phút`;
  }
  function selectedBudget() {
    const selected = document.querySelector('input[name="budget"]:checked')?.value;
    if (!selected) return null;
    if (selected === 'free') return 0;
    if (selected === 'custom') return parseMoney(document.getElementById('customBudgetInput').value);
    return Number(selected);
  }
  function selectedSchedule() {
    if (!otherTime.checked) return null;
    const date = dateFilter.value;
    const time = startTimeFilter.value;
    if (!date || !time) return { date, time, valid: false };
    const [hours, minutes] = time.split(':').map(Number);
    return { date, time, startMinutes: hours * 60 + minutes, valid: true };
  }
  function activityMatchesSchedule(item) {
    const schedule = selectedSchedule();
    if (!schedule) return true;
    if (!schedule.valid || !item.time_open || !item.time_close) return false;
    const open = new Date(item.time_open);
    const close = new Date(item.time_close);
    if (Number.isNaN(open.getTime()) || Number.isNaN(close.getTime())) return false;
    const openMinutes = open.getHours() * 60 + open.getMinutes();
    let closeMinutes = close.getHours() * 60 + close.getMinutes();
    if (closeMinutes <= openMinutes) closeMinutes += 24 * 60;
    let selected = schedule.startMinutes;
    if (selected < openMinutes && closeMinutes > 24 * 60) selected += 24 * 60;
    return selected >= openMinutes && selected + (availableMinutes() || 0) <= closeMinutes;
  }
  function renderSearchError(message) {
    const safe = api.escapeHTML(message);
    mapResults.innerHTML = `<p style="padding:20px;">${safe}</p>`;
    listResults.innerHTML = `<p>${safe}</p>`;
    detailResults.innerHTML = `<p>${safe}</p>`;
  }
  function imageHTML(item) {
    return item.image_url ? `<img src="${api.escapeHTML(item.image_url)}" alt="" style="width:100%;height:100%;object-fit:cover">` : '✨';
  }
  function detailHref(item) {
    const query = new URLSearchParams({ id: item.activity_id });
    if (window.Free2DoMap.validCoordinate(position?.latitude, position?.longitude)) {
      query.set('latitude', position.latitude);
      query.set('longitude', position.longitude);
    }
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
    const schedule = selectedSchedule();
    const scheduleText = schedule?.valid ? `${schedule.date} lúc ${schedule.time}` : 'hôm nay';
    summary.textContent = `Đang lọc theo: ${scheduleText} · rảnh ${availableMinutes() ?? 0} phút · bán kính ${radiusSlider.value} km · ngân sách ${selectedBudget() == null ? 'không giới hạn' : api.price(selectedBudget())} · sở thích: ${categoryNames.join(', ') || 'tất cả'}`;
  }
  function syncQuery() {
    if (window.Free2DoMap.validCoordinate(position?.latitude, position?.longitude)) {
      params.set('latitude', position.latitude);
      params.set('longitude', position.longitude);
    } else {
      params.delete('latitude');
      params.delete('longitude');
    }
    params.set('location_label', locationLabel);
    params.set('radius', radiusSlider.value);
    params.set('hours', document.getElementById('freeHours').value || '0');
    params.set('minutes', document.getElementById('freeMinutes').value || '0');
    params.set('time_mode', otherTime.checked ? 'other' : 'today');
    if (otherTime.checked && dateFilter.value) params.set('date', dateFilter.value); else params.delete('date');
    if (otherTime.checked && startTimeFilter.value) params.set('start_time', startTimeFilter.value); else params.delete('start_time');
    params.set('categories', selectedCategories().join('|'));
    const budget = selectedBudget();
    if (budget == null) params.delete('budget'); else params.set('budget', budget);
    history.replaceState(null, '', `${location.pathname}?${params}`);
  }
  async function search(recordHistory = false) {
    if (!window.Free2DoMap.validCoordinate(position?.latitude, position?.longitude)) {
      throw new Error('Chưa xác định được vị trí. Hãy cho phép truy cập GPS hoặc chọn vị trí khác.');
    }
    const sequence = ++requestSequence;
    const currentKeyword = keywordInput?.value.trim() || null;
    if (currentKeyword) params.set('q', currentKeyword); else params.delete('q');
    syncQuery();
    const items = await api.request('/search', { method: 'POST', body: {
      keyword: currentKeyword, latitude: position.latitude, longitude: position.longitude,
      radius: Number(radiusSlider.value), budget: selectedBudget(), free_time: availableMinutes(),
      category_ids: selectedCategories(), sort_by: sortSelect.value, record_history: recordHistory,
    } });
    if (sequence === requestSequence) render(items.filter(activityMatchesSchedule));
  }
  function queueSearch() {
    clearTimeout(timer);
    timer = setTimeout(() => search(false).catch(error => {
      renderSearchError(error.message);
    }), 220);
  }
  function restoreFilters() {
    radiusSlider.value = params.get('radius') || '5';
    radiusValue.textContent = radiusSlider.value;
    mapRadius.textContent = radiusSlider.value;
    document.getElementById('freeHours').value = params.get('hours') || '0';
    document.getElementById('freeMinutes').value = params.get('minutes') || '0';
    const otherSelected = params.get('time_mode') === 'other';
    otherTime.checked = otherSelected;
    todayTime.checked = !otherSelected;
    dateFilter.value = params.get('date') || '';
    startTimeFilter.value = params.get('start_time') || '';
    dateFilter.hidden = !otherSelected;
    startTimeFilter.hidden = !otherSelected;
    updateTodayLabel();
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
      locationTouched = true;
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
    ['freeHours', 'freeMinutes'].forEach(id => document.getElementById(id).addEventListener('input', () => {
      updateTodayLabel();
      queueSearch();
    }));
    const toggleSchedule = () => {
      const chooseOther = otherTime.checked;
      dateFilter.hidden = !chooseOther;
      startTimeFilter.hidden = !chooseOther;
      if (chooseOther) {
        const now = new Date();
        const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        dateFilter.min = localDate;
        if (!dateFilter.value) dateFilter.value = localDate;
        if (!startTimeFilter.value) startTimeFilter.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      }
      queueSearch();
    };
    todayTime.addEventListener('change', toggleSchedule);
    otherTime.addEventListener('change', toggleSchedule);
    dateFilter.addEventListener('change', queueSearch);
    startTimeFilter.addEventListener('change', queueSearch);
    sortSelect.addEventListener('change', queueSearch);
    categoryBox.addEventListener('click', event => { const chip = event.target.closest('[data-category-id]'); if (chip) { chip.classList.toggle('active'); queueSearch(); } });
    document.querySelectorAll('input[name="budget"]').forEach(input => input.addEventListener('change', () => {
      const custom = document.getElementById('customBudgetInput');
      custom.hidden = input.value !== 'custom';
      if (input.value === 'custom') custom.focus();
      queueSearch();
    }));
    document.getElementById('customBudgetInput').addEventListener('input', queueSearch);
    if (keywordInput) {
      keywordInput.value = params.get('q') || '';
      keywordInput.addEventListener('input', () => {
        const value = keywordInput.value.trim();
        if (value) params.set('q', value); else params.delete('q');
        queueSearch();
      });
      keywordInput.addEventListener('search', queueSearch);
      keywordInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          clearTimeout(timer);
          search(false).catch(error => renderSearchError(error.message));
        }
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
    // Gọi GPS ngay khi mở trang. Chỉ bỏ qua GPS nếu URL đã mang tọa độ do
    // người dùng chủ động chọn ở trang trước.
    const needsGps = !window.Free2DoMap.validCoordinate(position?.latitude, position?.longitude);
    const gpsPromise = needsGps ? window.Free2DoMap.getCurrentPosition() : null;
    const mapPromise = window.Free2DoMap.create('searchMap');
    const [, categories] = await Promise.all([api.requireUser(), api.request('/categories')]);
    mapController = await mapPromise;
    mapController.onSelectPosition(async selected => {
      position = selected;
      locationTouched = true;
      locationLabel = 'Vị trí đã chọn trên bản đồ';
      mapLocation.textContent = locationLabel;
      await search(false).catch(error => renderSearchError(error.message));
    });
    const initial = new Set((params.get('categories') || '').split('|').filter(Boolean));
    categoryBox.innerHTML = categories.map(item => `<div class="chip ${initial.has(item.category_id) ? 'active' : ''}" data-category-id="${api.escapeHTML(item.category_id)}">${api.escapeHTML(item.name)}</div>`).join('');
    bind();
    if (needsGps) {
      mapLocation.textContent = 'Đang lấy vị trí hiện tại…';
      try {
        const gps = await gpsPromise;
        if (!locationTouched) {
          position = gps;
          locationLabel = 'Vị trí hiện tại';
          mapLocation.textContent = locationLabel;
        }
      } catch (error) {
        mapLocation.textContent = 'Chưa xác định vị trí';
        renderSearchError(error.message);
        setView(matchMedia('(max-width:900px)').matches ? 'details' : 'list');
        return;
      }
    } else mapLocation.textContent = locationLabel;
    await search(true);
    setView(matchMedia('(max-width:900px)').matches ? 'details' : 'list');
  }
  window.toggleMapView = () => setView('list');
  load().catch(error => renderSearchError(error.message));
})();
