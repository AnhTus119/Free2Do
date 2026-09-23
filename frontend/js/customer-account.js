(function () {
  'use strict';
  const api = window.CustomerAPI;
  const title = document.querySelector('#pane-hoso [style*="font-size:19px"]');
  const subtitle = title?.nextElementSibling;
  let available = [];
  let selected = new Set();
  function selectTab(tab) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `pane-${tab}`));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('main-tabs').style.display = tab === 'hoso' ? 'none' : 'flex';
  }
  window.selectTab = selectTab;
  window.toggleEdit = () => { document.getElementById('edit-mode').style.display = document.getElementById('edit-mode').style.display === 'none' ? 'block' : 'none'; };
  window.saveProfile = async () => {
    const button = document.querySelector('#edit-mode button'); button.disabled = true;
    try {
      await api.request('/users/me/categories', { method: 'PUT', body: JSON.stringify({ category_ids: [...selected] }) });
      document.getElementById('save-toast').textContent = '✓ Đã cập nhật sở thích.';
      document.getElementById('save-toast').style.display = 'block';
      document.getElementById('edit-mode').style.display = 'none';
      renderCategories();
    } catch (error) { alert(error.message); } finally { button.disabled = false; }
  };
  function renderCategories() {
    document.querySelector('#view-mode .chip-row').innerHTML = available.filter(c => selected.has(c.category_id)).map(c => `<span class="chip active">${api.escapeHTML(c.name)}</span>`).join('') || '<span>Chưa chọn sở thích.</span>';
    document.querySelector('#edit-mode .chip-row').innerHTML = available.map(c => `<button type="button" class="chip ${selected.has(c.category_id) ? 'active' : ''}" data-category-id="${api.escapeHTML(c.category_id)}">${api.escapeHTML(c.name)}</button>`).join('');
  }
  document.querySelector('#edit-mode .chip-row').onclick = e => {
    const button = e.target.closest('[data-category-id]'); if (!button) return;
    if (selected.has(button.dataset.categoryId)) selected.delete(button.dataset.categoryId); else selected.add(button.dataset.categoryId);
    renderCategories();
  };
  document.getElementById('favoriteActivities').onclick = async e => {
    const button = e.target.closest('[data-remove-id]'); if (!button) return;
    button.disabled = true;
    try { await api.request(`/bookmarks/${encodeURIComponent(button.dataset.removeId)}`, { method: 'DELETE' }); await renderBookmarks(); }
    catch (error) { alert(error.message); button.disabled = false; }
  };
  async function renderBookmarks() {
    const list = await api.request('/bookmarks/me');
    const results = await Promise.all(list.map(b => api.request(`/activities/${encodeURIComponent(b.activity_id)}`).catch(() => null)));
    const activities = results.filter(Boolean);
    document.getElementById('favoriteActivities').innerHTML = activities.map(a => `<div class="activity-card"><div class="activity-body"><div class="activity-title">${api.escapeHTML(a.name)}</div><div class="activity-meta">${api.escapeHTML(a.address)} · ${api.escapeHTML(api.price(a.price))}</div><a class="btn btn-secondary" href="activity-detail.html?id=${encodeURIComponent(a.activity_id)}">Xem chi tiết</a> <button class="btn btn-ghost" data-remove-id="${api.escapeHTML(a.activity_id)}">Bỏ lưu</button></div></div>`).join('');
    document.getElementById('favoriteEmptyState').style.display = activities.length ? 'none' : 'block';
  }
  api.requireUser().then(async me => {
    if (title) title.textContent = me.name;
    if (subtitle) subtitle.textContent = [me.email, me.phone].filter(Boolean).join(' · ');
    document.querySelector('#pane-hoso .nav-avatar').textContent = me.name[0]?.toUpperCase() || '?';
    const profileInputs = document.querySelectorAll('#edit-mode .field input');
    [me.name, me.email, me.phone || ''].forEach((value, index) => {
      if (profileInputs[index]) profileInputs[index].value = value;
    });
    // No self-service profile update endpoint; only preferences are editable.
    available = await api.request('/categories');
    selected = new Set((await api.request('/users/me/categories')).map(c => c.category_id));
    renderCategories(); await renderBookmarks();
    const historyItems = await api.request('/users/me/search-history');
    const history = document.querySelector('#pane-lichsu');
    history.innerHTML = historyItems.length ? historyItems.map(item => `<div class="history-card"><b>${api.escapeHTML(item.keyword || 'Tìm quanh vị trí đã chọn')}</b><div class="activity-meta">${api.escapeHTML(new Date(item.created_at).toLocaleString('vi-VN'))} · Bán kính ${api.escapeHTML(item.radius)} km${item.budget == null ? '' : ` · ≤ ${api.escapeHTML(api.price(item.budget))}`}</div></div>`).join('') : '<p>Chưa có lịch sử tìm kiếm.</p>';
  }).catch(error => { document.getElementById('favoriteActivities').textContent = error.message; });
  function updateTab() { selectTab(['hoso', 'lichsu'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'yeuthich'); }
  window.addEventListener('hashchange', updateTab); updateTab();
})();
