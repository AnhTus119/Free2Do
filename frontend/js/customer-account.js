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
  window.saveProfile = () => F2D.busy(document.getElementById('profileSaveButton'), async () => {
    try {
      const name = document.getElementById('profileName').value.trim().replace(/\s+/g, ' ');
      const phone = document.getElementById('profilePhone').value.trim();
      if (!name) throw new Error('Họ và tên không được để trống.');
      if (name.length < 2 || name.length > 50 || !/^\p{L}+(?: \p{L}+)*$/u.test(name)) {
        throw new Error('Họ và tên chỉ gồm chữ cái tiếng Việt hoặc tiếng Anh và khoảng trắng (2-50 ký tự), không chứa số hay ký tự đặc biệt.');
      }
      const [profile] = await Promise.all([
        api.request('/users/me', { method: 'PATCH', body: { name, phone: phone || null }, toast: false }),
        interests.save(),
      ]);
      currentUser = profile;
      if (title) title.textContent = profile.name;
      if (subtitle) subtitle.textContent = [profile.email, profile.phone].filter(Boolean).join(' · ');
      document.querySelectorAll('.nav-name').forEach(element => { element.textContent = profile.name; });
      setAvatar(profile.avatar_url, profile.name);
      F2D.toast('Đã cập nhật hồ sơ và sở thích.');
      document.getElementById('edit-mode').style.display = 'none';
      renderCategories();
    } catch (error) { F2D.toast(error.message, 'error'); }
  });
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
    const historyItems = await api.request('/users/me/search-history');
    const history = document.querySelector('#pane-lichsu');
    history.innerHTML = historyItems.length
      ? `<div class="search-history-list">${historyItems.map(renderHistoryItem).join('')}</div>`
      : '<div class="search-history-empty">Chưa có lịch sử tìm kiếm.</div>';
  }).catch(error => { document.getElementById('favoriteActivities').textContent = error.message; });
  // Mỗi lần tìm là 1 box: tên vị trí (đậm), ngày tìm, bán kính; "Tìm lại" chạy lại đúng vị trí + bán kính.
  function renderHistoryItem(item) {
    const label = item.location_label || 'Vị trí đã chọn';
    const radius = Number(item.radius);
    const query = new URLSearchParams({ latitude: item.latitude, longitude: item.longitude, location_label: label, radius: String(radius) });
    if (item.keyword) query.set('q', item.keyword);
    if (item.budget != null) query.set('budget', String(item.budget));
    if (item.free_time != null) { query.set('hours', String(Math.floor(item.free_time / 60))); query.set('minutes', String(item.free_time % 60)); }
    return `<article class="search-history-card">
      <div class="search-history-info">
        <h3 class="search-history-place">${api.escapeHTML(label)}</h3>
        <p>Ngày tìm kiếm: ${api.escapeHTML(F2D.dateTime(item.created_at))}</p>
        <p>Bán kính: ${api.escapeHTML(Number.isInteger(radius) ? radius : radius.toFixed(1))}km</p>
        ${item.keyword ? `<p>Từ khóa: ${api.escapeHTML(item.keyword)}</p>` : ''}
      </div>
      <a class="search-history-again" href="search.html?${query}">Tìm lại</a>
    </article>`;
  }
  function updateTab() { selectTab(['hoso', 'lichsu'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'yeuthich'); }
  window.addEventListener('hashchange', updateTab); updateTab();
})();
