(function () {
  'use strict';
  const api = window.CustomerAPI;
  const title = document.querySelector('#pane-hoso [style*="font-size:19px"]');
  const subtitle = title?.nextElementSibling;
  // Editor sở thích dùng chung (js/main.js), cũng là editor của popup chọn sở thích sau đăng ký.
  const interests = F2D.interestsEditor(document.querySelector('#edit-mode .chip-row'), api);
  let currentUser = null;
  function selectTab(tab) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `pane-${tab}`));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('main-tabs').style.display = tab === 'hoso' ? 'none' : 'flex';
  }
  window.selectTab = selectTab;
  window.toggleEdit = () => { document.getElementById('edit-mode').style.display = document.getElementById('edit-mode').style.display === 'none' ? 'block' : 'none'; };
  // Kiểm tra tại chỗ trước, rồi hỏi xác nhận; lỗi máy chủ hiện trong popup, form giữ nguyên nội dung đã nhập.
  window.saveProfile = async () => {
    const name = document.getElementById('profileName').value.trim().replace(/\s+/g, ' ');
    const phone = document.getElementById('profilePhone').value.trim();
    if (!name) return F2D.toast('Họ và tên không được để trống.', 'error');
    if (name.length < 2 || name.length > 50 || !/^\p{L}+(?: \p{L}+)*$/u.test(name)) {
      return F2D.toast('Họ và tên chỉ gồm chữ cái tiếng Việt hoặc tiếng Anh và khoảng trắng (2-50 ký tự), không chứa số hay ký tự đặc biệt.', 'error');
    }
    const saved = await F2D.ask({
      title: 'Lưu thay đổi hồ sơ?', text: 'Họ tên, số điện thoại và sở thích mới sẽ được cập nhật.', ok: 'Lưu thay đổi',
      done: 'Đã cập nhật hồ sơ và sở thích.',
      run: () => Promise.all([
        api.request('/users/me', { method: 'PATCH', body: { name, phone: phone || null }, toast: false }),
        interests.save(),
      ]),
    });
    if (!saved) return;
    const [profile] = saved;
    currentUser = profile;
    if (title) title.textContent = profile.name;
    if (subtitle) subtitle.textContent = [profile.email, profile.phone].filter(Boolean).join(' · ');
    document.querySelectorAll('.nav-name').forEach(element => { element.textContent = profile.name; });
    setAvatar(profile.avatar_url, profile.name);
    document.getElementById('edit-mode').style.display = 'none';
    renderCategories();
  };
  function renderCategories() {
    const chips = interests.chosenLabels().map(label => `<span class="chip active">${api.escapeHTML(label)}</span>`);
    document.querySelector('#view-mode .chip-row').innerHTML = chips.join('') || '<span>Chưa chọn sở thích.</span>';
  }
  document.getElementById('favoriteActivities').onclick = async e => {
    const button = e.target.closest('[data-remove-id]'); if (!button) return;
    button.disabled = true;
    try { await api.request(`/bookmarks/${encodeURIComponent(button.dataset.removeId)}`, { method: 'DELETE' }); await renderBookmarks(); }
    catch (error) { F2D.toast(error.message, 'error'); button.disabled = false; }
  };
  function setAvatar(url, name) {
    document.querySelectorAll('.nav-avatar').forEach(element => {
      element.innerHTML = url ? `<img src="${api.escapeHTML(url)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : api.escapeHTML(name?.[0]?.toUpperCase() || '?');
    });
  }
  document.getElementById('avatarUploadForm').addEventListener('submit', async event => {
    event.preventDefault(); const file = document.getElementById('avatarFile').files[0]; if (!file) return;
    const form = new FormData(); form.append('file', file);
    try { const asset = await api.request('/media/avatar', { method: 'POST', body: form }); currentUser.avatar_url = asset.media_url; setAvatar(asset.media_url, currentUser.name); }
    catch (error) { F2D.toast(error.message, 'error'); }
  });
  document.getElementById('avatarPresets').addEventListener('click', async event => {
    const button = event.target.closest('[data-preset-id]'); if (!button) return;
    try { const preset = await api.request(`/media/avatar/preset/${encodeURIComponent(button.dataset.presetId)}`, { method: 'PUT' }); currentUser.avatar_url = preset.media_url; setAvatar(preset.media_url, currentUser.name); }
    catch (error) { F2D.toast(error.message, 'error'); }
  });
  document.getElementById('removeAvatar').addEventListener('click', async () => {
    try { await api.request('/media/avatar', { method: 'DELETE' }); currentUser.avatar_url = null; setAvatar(null, currentUser.name); }
    catch (error) { F2D.toast(error.message, 'error'); }
  });
  async function renderBookmarks() {
    const list = await api.request('/bookmarks/me');
    const results = await Promise.all(list.map(b => api.request(`/activities/${encodeURIComponent(b.activity_id)}`).catch(() => null)));
    const activities = results.filter(Boolean);
    document.getElementById('favoriteActivities').innerHTML = activities.map(a => `<div class="activity-card"><div class="activity-body"><div class="activity-title">${api.escapeHTML(a.name)}</div><div class="activity-meta">${api.escapeHTML(a.address)} · ${api.escapeHTML(api.price(a.price))}</div><a class="btn btn-secondary" href="activity-detail.html?id=${encodeURIComponent(a.activity_id)}">Xem chi tiết</a> <button class="btn btn-ghost" data-remove-id="${api.escapeHTML(a.activity_id)}">Bỏ lưu</button></div></div>`).join('');
    document.getElementById('favoriteEmptyState').style.display = activities.length ? 'none' : 'block';
  }
  api.requireUser().then(async me => {
    currentUser = me;
    if (title) title.textContent = me.name;
    if (subtitle) subtitle.textContent = [me.email, me.phone].filter(Boolean).join(' · ');
    setAvatar(me.avatar_url, me.name);
    document.getElementById('profileName').value = me.name;
    document.getElementById('profileEmail').value = me.email || '';
    document.getElementById('profilePhone').value = me.phone || '';
    const [, presets] = await Promise.all([interests.load(), api.request('/media/avatar-presets')]);
    document.getElementById('avatarPresets').innerHTML = presets.map(item => `<button type="button" class="chip" data-preset-id="${api.escapeHTML(item.preset_id)}"><img src="${api.escapeHTML(item.media_url)}" alt="${api.escapeHTML(item.name)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover"> ${api.escapeHTML(item.name)}</button>`).join('') || '<span>Chưa có ảnh mẫu.</span>';
    renderCategories(); await renderBookmarks();
    renderMyReviews().catch(error => { reviewBox.innerHTML = `<p class="f2d-empty">${api.escapeHTML(error.message)}</p>`; });
    historyItems = await api.request('/users/me/search-history');
    renderHistory();
  }).catch(error => { document.getElementById('favoriteActivities').textContent = error.message; });
  // ---------- Lịch sử tìm kiếm: xóa 1 mục (nút ×), xóa các mục đã chọn, xóa tất cả ----------
  let historyItems = [];
  const selectedHistory = new Set();
  const historyPane = document.querySelector('#pane-lichsu');
  function renderHistory() {
    if (!historyItems.length) {
      historyPane.innerHTML = '<div class="search-history-empty">Chưa có lịch sử tìm kiếm.</div>';
      return;
    }
    historyPane.innerHTML = `<div class="search-history-toolbar">
        <label class="search-history-check"><input type="checkbox" data-history-all aria-label="Chọn tất cả lịch sử tìm kiếm"> Chọn tất cả</label>
        <button type="button" class="btn btn-secondary" data-history-delete="selected"></button>
        <button type="button" class="btn btn-secondary search-history-danger" data-history-delete="all">Xóa tất cả (${historyItems.length})</button>
      </div>
      <div class="search-history-list">${historyItems.map(renderHistoryItem).join('')}</div>`;
    updateHistoryToolbar();
  }
  function updateHistoryToolbar() {
    const button = historyPane.querySelector('[data-history-delete="selected"]');
    const all = historyPane.querySelector('[data-history-all]');
    if (!button) return;
    button.textContent = `Xóa đã chọn (${selectedHistory.size})`;
    button.disabled = !selectedHistory.size;
    all.checked = selectedHistory.size === historyItems.length;
    all.indeterminate = selectedHistory.size > 0 && !all.checked;
  }
  function forgetHistory(ids) {
    const removed = new Set(ids);
    historyItems = historyItems.filter(item => !removed.has(item.search_id));
    ids.forEach(id => selectedHistory.delete(id));
    renderHistory();
  }
  historyPane.addEventListener('change', event => {
    if (event.target.matches('[data-history-all]')) {
      selectedHistory.clear();
      if (event.target.checked) historyItems.forEach(item => selectedHistory.add(item.search_id));
      historyPane.querySelectorAll('[data-history-id]').forEach(box => { box.checked = event.target.checked; });
    } else if (event.target.matches('[data-history-id]')) {
      selectedHistory[event.target.checked ? 'add' : 'delete'](event.target.dataset.historyId);
    }
    updateHistoryToolbar();
  });
  historyPane.addEventListener('click', async event => {
    const remove = event.target.closest('[data-history-remove]');
    if (remove) {
      // Xóa 1 mục: không cần hỏi lại; nút bị khóa tới khi máy chủ trả kết quả.
      await F2D.busy(remove, async () => {
        try {
          await api.request('/users/me/search-history', { method: 'DELETE', body: { search_ids: [remove.dataset.historyRemove] }, toast: false });
          forgetHistory([remove.dataset.historyRemove]);
          F2D.toast('Đã xóa mục lịch sử tìm kiếm.');
        } catch (error) { F2D.toast(error.message, 'error'); }
      });
      return;
    }
    const bulk = event.target.closest('[data-history-delete]');
    if (!bulk) return;
    // Gửi đúng các id đang hiển thị/đã chọn nên số trong câu hỏi luôn khớp với số mục bị xóa.
    const ids = bulk.dataset.historyDelete === 'all'
      ? historyItems.map(item => item.search_id)
      : historyItems.filter(item => selectedHistory.has(item.search_id)).map(item => item.search_id);
    if (!ids.length) return;
    const result = await F2D.ask({
      title: 'Xóa lịch sử tìm kiếm?', text: `Bạn có chắc chắn muốn xóa ${ids.length} mục lịch sử tìm kiếm? Thao tác này không thể hoàn tác.`,
      ok: `Xóa ${ids.length} mục`, danger: true, done: output => `Đã xóa ${output.deleted} mục lịch sử tìm kiếm.`,
      run: () => api.request('/users/me/search-history', { method: 'DELETE', body: { search_ids: ids }, toast: false }),
    });
    if (result) forgetHistory(ids);
  });
  // Mỗi lần tìm là 1 box: tên vị trí (đậm), ngày tìm, bán kính; "Tìm lại" chạy lại đúng vị trí + bán kính.
  function renderHistoryItem(item) {
    const label = item.location_label || 'Vị trí đã chọn';
    const radius = Number(item.radius);
    const query = new URLSearchParams({ latitude: item.latitude, longitude: item.longitude, location_label: label, radius: String(radius) });
    if (item.keyword) query.set('q', item.keyword);
    if (item.budget != null) query.set('budget', String(item.budget));
    if (item.free_time != null) { query.set('hours', String(Math.floor(item.free_time / 60))); query.set('minutes', String(item.free_time % 60)); }
    const id = api.escapeHTML(item.search_id);
    return `<article class="search-history-card">
      <input type="checkbox" class="search-history-select" data-history-id="${id}" ${selectedHistory.has(item.search_id) ? 'checked' : ''} aria-label="Chọn lịch sử tìm kiếm ${api.escapeHTML(label)}">
      <div class="search-history-info">
        <h3 class="search-history-place">${api.escapeHTML(label)}</h3>
        <p>Ngày tìm kiếm: ${api.escapeHTML(F2D.dateTime(item.created_at))}</p>
        <p>Bán kính: ${api.escapeHTML(Number.isInteger(radius) ? radius : radius.toFixed(1))}km</p>
        ${item.keyword ? `<p>Từ khóa: ${api.escapeHTML(item.keyword)}</p>` : ''}
      </div>
      <a class="search-history-again" href="search.html?${query}">Tìm lại</a>
      <button type="button" class="search-history-remove" data-history-remove="${id}" aria-label="Xóa mục lịch sử tìm kiếm này" title="Xóa">×</button>
    </article>`;
  }
  // Lịch sử đánh giá cá nhân: xem, sửa (sao + nội dung) và xóa ngay tại tab.
  const reviewBox = document.getElementById('myReviews');
  let myReviews = [];
  const stars = rating => '★'.repeat(rating) + '☆'.repeat(5 - rating);
  function reviewCard(review) {
    const esc = api.escapeHTML;
    const thumb = review.activity_image ? `<img src="${esc(review.activity_image)}" alt="" loading="lazy">` : '✨';
    const hidden = review.activity_status === 'active' ? '' : ' · <em>Hoạt động không còn hiển thị</em>';
    return `<article class="my-review" data-review-id="${esc(review.review_id)}">
      <a class="my-review-thumb" href="activity-detail.html?id=${encodeURIComponent(review.activity_id)}">${thumb}</a>
      <div>
        <h3><a href="activity-detail.html?id=${encodeURIComponent(review.activity_id)}">${esc(review.activity_name)}</a></h3>
        <div class="my-review-meta"><span class="my-review-stars" aria-label="${review.rating} sao">${stars(review.rating)}</span> · ${esc(F2D.dateTime(review.updated_at || review.created_at))}${review.updated_at ? ' (đã sửa)' : ''}${hidden}</div>
        ${review.content ? `<p class="my-review-content">${esc(review.content)}</p>` : ''}
        ${review.reply ? `<div class="my-review-reply"><b>Phản hồi của doanh nghiệp:</b> ${esc(review.reply.content)}</div>` : ''}
        <div class="my-review-actions"><button type="button" class="btn btn-secondary" data-review-edit>Sửa</button><button type="button" class="btn btn-ghost" data-review-delete>Xóa</button></div>
      </div>
    </article>`;
  }
  async function renderMyReviews() {
    myReviews = await api.request('/users/me/reviews');
    reviewBox.innerHTML = myReviews.length ? myReviews.map(reviewCard).join('')
      : '<div class="search-history-empty">Bạn chưa đánh giá hoạt động nào.</div>';
  }
  reviewBox.addEventListener('click', async event => {
    const card = event.target.closest('[data-review-id]');
    if (!card) return;
    const review = myReviews.find(item => item.review_id === card.dataset.reviewId);
    if (event.target.closest('[data-review-delete]')) {
      if (!await F2D.ask({ title: 'Xóa đánh giá?', text: `Đánh giá cho "${review.activity_name}" sẽ bị xóa vĩnh viễn.`, ok: 'Xóa', danger: true, done: 'Đã xóa đánh giá.',
        run: () => api.request(`/reviews/${encodeURIComponent(review.review_id)}`, { method: 'DELETE', toast: false }) })) return;
      await renderMyReviews().catch(error => F2D.toast(error.message, 'error'));
    } else if (event.target.closest('[data-review-edit]')) {
      const actions = card.querySelector('.my-review-actions');
      actions.outerHTML = `<form class="my-review-edit"><select name="rating" aria-label="Số sao">${[5, 4, 3, 2, 1].map(value => `<option value="${value}" ${value === review.rating ? 'selected' : ''}>${stars(value)} (${value})</option>`).join('')}</select><textarea name="content" rows="3" maxlength="2000" placeholder="Nội dung đánh giá">${api.escapeHTML(review.content || '')}</textarea><div class="my-review-actions"><button type="submit" class="btn btn-primary">Lưu</button><button type="button" class="btn btn-ghost" data-review-cancel>Hủy</button></div></form>`;
    } else if (event.target.closest('[data-review-cancel]')) {
      card.outerHTML = reviewCard(review);
    }
  });
  reviewBox.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.target;
    const id = form.closest('[data-review-id]').dataset.reviewId;
    F2D.busy(form.querySelector('[type="submit"]'), async () => {
      try {
        await api.request(`/reviews/${encodeURIComponent(id)}`, { method: 'PATCH', body: { rating: Number(form.rating.value), content: form.content.value.trim() } });
        await renderMyReviews();
        F2D.toast('Đã cập nhật đánh giá.');
      } catch (error) { F2D.toast(error.message, 'error'); }
    });
  });
  function updateTab() { selectTab(['hoso', 'lichsu', 'danhgia'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'yeuthich'); }
  window.addEventListener('hashchange', updateTab); updateTab();
})();
