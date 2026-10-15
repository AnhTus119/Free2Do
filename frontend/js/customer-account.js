(function () {
  'use strict';
  const api = window.CustomerAPI;
  const CUSTOM_INTERESTS_KEY = 'free2do_custom_interests';
  const title = document.querySelector('#pane-hoso [style*="font-size:19px"]');
  const subtitle = title?.nextElementSibling;
  let available = [];
  let selected = new Set();
  let customInterests = []; // sở thích cá nhân: lưu trên server (/users/me/interests), AI dùng để hiểu ngữ cảnh
  let interestSaving = Promise.resolve();
  let currentUser = null;
  function selectTab(tab) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `pane-${tab}`));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('main-tabs').style.display = tab === 'hoso' ? 'none' : 'flex';
  }
  window.selectTab = selectTab;
  window.toggleEdit = () => { document.getElementById('edit-mode').style.display = document.getElementById('edit-mode').style.display === 'none' ? 'block' : 'none'; };
  window.saveProfile = async () => {
    const button = document.getElementById('profileSaveButton'); button.disabled = true;
    try {
      const name = document.getElementById('profileName').value.trim();
      const phone = document.getElementById('profilePhone').value.trim();
      if (!name) throw new Error('Họ và tên không được để trống.');
      const [profile] = await Promise.all([
        api.request('/users/me', { method: 'PATCH', body: { name, phone: phone || null } }),
        api.request('/users/me/categories', { method: 'PUT', body: { category_ids: [...selected] } }),
      ]);
      currentUser = profile;
      if (title) title.textContent = profile.name;
      if (subtitle) subtitle.textContent = [profile.email, profile.phone].filter(Boolean).join(' · ');
      document.querySelectorAll('.nav-name').forEach(element => { element.textContent = profile.name; });
      setAvatar(profile.avatar_url, profile.name);
      document.getElementById('save-toast').textContent = '✓ Đã cập nhật hồ sơ và sở thích.';
      document.getElementById('save-toast').style.display = 'block';
      document.getElementById('edit-mode').style.display = 'none';
      renderCategories();
    } catch (error) { alert(error.message); } finally { button.disabled = false; }
  };
  function renderCategories() {
    const chosenCategories = available.filter(category => selected.has(category.category_id));
    const viewChips = [
      ...chosenCategories.map(category => `<span class="chip active">${api.escapeHTML(category.name)}</span>`),
      ...customInterests.map(interest => `<span class="chip active personal">${api.escapeHTML(interest)}</span>`),
    ];
    document.querySelector('#view-mode .chip-row').innerHTML = viewChips.join('') || '<span>Chưa chọn sở thích.</span>';
    const categoryChips = available.map(category => `<button type="button" class="chip ${selected.has(category.category_id) ? 'active' : ''}" data-category-id="${api.escapeHTML(category.category_id)}">${api.escapeHTML(category.name)}</button>`).join('');
    const editor = document.querySelector('#edit-mode .chip-row');
    const pending = editor.querySelector('.custom-interest-input')?.value || '';
    const hadFocus = document.activeElement?.matches?.('.custom-interest-input');
    editor.innerHTML = `${categoryChips}
      <div class="personal-interests">
        <div class="personal-interests-label">Sở thích cá nhân <span>(nhập rồi nhấn Enter, tối đa ${MAX_INTERESTS})</span></div>
        <div class="personal-interests-row">
          ${customInterests.map((interest, index) => `<span class="chip active personal">${api.escapeHTML(interest)}<button type="button" class="chip-x" data-remove-custom-interest="${index}" aria-label="Xóa ${api.escapeHTML(interest)}">×</button></span>`).join('')}
          <input class="custom-interest-input" type="text" maxlength="60" placeholder="VD: leo núi, nhạc acoustic..." aria-label="Thêm sở thích cá nhân" value="${api.escapeHTML(pending)}">
          <button type="button" class="chip add-chip" data-add-custom-interest>＋ Thêm sở thích</button>
        </div>
        <div class="personal-interests-msg" role="status"></div>
      </div>`;
    if (hadFocus) editor.querySelector('.custom-interest-input').focus();
  }
  const MAX_INTERESTS = 20;
  function interestMessage(text, isError = false) {
    const box = document.querySelector('.personal-interests-msg');
    if (!box) return;
    box.textContent = text || '';
    box.classList.toggle('error', isError);
  }
  // Mỗi thay đổi (thêm/xóa) lưu ngay lên server; các lần lưu xếp hàng để không ghi đè lẫn nhau.
  function saveInterests(next, successText) {
    const previous = customInterests;
    customInterests = next;
    renderCategories();
    interestSaving = interestSaving.then(async () => {
      try {
        const result = await api.request('/users/me/interests', { method: 'PUT', body: { interests: customInterests } });
        customInterests = result.interests;
        renderCategories();
        interestMessage(successText);
      } catch (error) {
        customInterests = previous;
        renderCategories();
        interestMessage(error.message, true);
      }
    });
    return interestSaving;
  }
  function addInterestFromInput() {
    const input = document.querySelector('.custom-interest-input');
    const value = (input?.value || '').replace(/\s+/g, ' ').trim();
    if (!value) return input?.focus();
    if (customInterests.some(item => item.toLocaleLowerCase('vi') === value.toLocaleLowerCase('vi'))) {
      interestMessage(`"${value}" đã có trong danh sách.`, true);
      return;
    }
    if (customInterests.length >= MAX_INTERESTS) {
      interestMessage(`Bạn chỉ có thể lưu tối đa ${MAX_INTERESTS} sở thích cá nhân.`, true);
      return;
    }
    input.value = '';
    saveInterests([...customInterests, value], `✓ Đã thêm "${value}".`);
  }
  async function loadCustomInterests() {
    try {
      customInterests = (await api.request('/users/me/interests')).interests;
      // Chuyển sở thích cũ từng lưu trong trình duyệt lên server (chỉ một lần).
      const legacy = JSON.parse(localStorage.getItem(CUSTOM_INTERESTS_KEY) || '[]');
      localStorage.removeItem(CUSTOM_INTERESTS_KEY);
      const extra = Array.isArray(legacy) ? legacy.filter(item => typeof item === 'string' && item.trim()) : [];
      if (extra.length) await saveInterests([...customInterests, ...extra].slice(0, MAX_INTERESTS));
    } catch (error) { console.warn('Không tải được sở thích cá nhân:', error); }
    renderCategories();
  }
  document.querySelector('#edit-mode .chip-row').onclick = e => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-add-custom-interest')) return addInterestFromInput();
    if (button.hasAttribute('data-remove-custom-interest')) {
      const removed = customInterests[Number(button.dataset.removeCustomInterest)];
      saveInterests(customInterests.filter((_, index) => index !== Number(button.dataset.removeCustomInterest)), `Đã xóa "${removed}".`);
      return;
    }
    if (!button.dataset.categoryId) return;
    if (selected.has(button.dataset.categoryId)) selected.delete(button.dataset.categoryId); else selected.add(button.dataset.categoryId);
    renderCategories();
  };
  document.querySelector('#edit-mode .chip-row').onkeydown = e => {
    if (!e.target.matches('.custom-interest-input')) return;
    if (e.key === 'Enter') { e.preventDefault(); addInterestFromInput(); }
    else if (e.key === 'Escape') { e.target.value = ''; interestMessage(''); }
  };
  document.getElementById('favoriteActivities').onclick = async e => {
    const button = e.target.closest('[data-remove-id]'); if (!button) return;
    button.disabled = true;
    try { await api.request(`/bookmarks/${encodeURIComponent(button.dataset.removeId)}`, { method: 'DELETE' }); await renderBookmarks(); }
    catch (error) { alert(error.message); button.disabled = false; }
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
    catch (error) { alert(error.message); }
  });
  document.getElementById('avatarPresets').addEventListener('click', async event => {
    const button = event.target.closest('[data-preset-id]'); if (!button) return;
    try { const preset = await api.request(`/media/avatar/preset/${encodeURIComponent(button.dataset.presetId)}`, { method: 'PUT' }); currentUser.avatar_url = preset.media_url; setAvatar(preset.media_url, currentUser.name); }
    catch (error) { alert(error.message); }
  });
  document.getElementById('removeAvatar').addEventListener('click', async () => {
    try { await api.request('/media/avatar', { method: 'DELETE' }); currentUser.avatar_url = null; setAvatar(null, currentUser.name); }
    catch (error) { alert(error.message); }
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
    const [categoryRows, presets] = await Promise.all([api.request('/categories'), api.request('/media/avatar-presets')]);
    available = categoryRows;
    document.getElementById('avatarPresets').innerHTML = presets.map(item => `<button type="button" class="chip" data-preset-id="${api.escapeHTML(item.preset_id)}"><img src="${api.escapeHTML(item.media_url)}" alt="${api.escapeHTML(item.name)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover"> ${api.escapeHTML(item.name)}</button>`).join('') || '<span>Chưa có ảnh mẫu.</span>';
    const userCategories = await api.request('/users/me/categories');
    selected = new Set(userCategories.map(category => category.category_id));
    renderCategories(); await loadCustomInterests(); await renderBookmarks();
    const historyItems = await api.request('/users/me/search-history');
    const history = document.querySelector('#pane-lichsu');
    history.innerHTML = historyItems.length ? historyItems.map(item => `<div class="history-card"><b>${api.escapeHTML(item.keyword || 'Tìm quanh vị trí đã chọn')}</b><div class="activity-meta">${api.escapeHTML(new Date(item.created_at).toLocaleString('vi-VN'))} · Bán kính ${api.escapeHTML(item.radius)} km${item.budget == null ? '' : ` · ≤ ${api.escapeHTML(api.price(item.budget))}`}${item.free_time == null ? '' : ` · ${api.escapeHTML(item.free_time)} phút`}</div><a class="btn btn-secondary" href="search.html${item.keyword ? `?q=${encodeURIComponent(item.keyword)}` : ''}">Tìm lại</a></div>`).join('') : '<p>Chưa có lịch sử tìm kiếm.</p>';
  }).catch(error => { document.getElementById('favoriteActivities').textContent = error.message; });
  function updateTab() { selectTab(['hoso', 'lichsu'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'yeuthich'); }
  window.addEventListener('hashchange', updateTab); updateTab();
})();
