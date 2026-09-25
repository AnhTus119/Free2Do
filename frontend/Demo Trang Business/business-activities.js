let activities = [];
let categories = [];
let performance = new Map();
let editingId = null;

function statusClass(status) {
  return ['active', 'pending', 'hidden'].includes(status) ? status : 'hidden';
}

function renderRows() {
  const body = document.getElementById('activity-rows');
  body.innerHTML = activities.length ? activities.map(item => `
    <tr data-id="${BusinessAPI.escapeHTML(item.activity_id)}">
      <td style="font-weight:700;">${BusinessAPI.escapeHTML(item.name)}</td>
      <td>${BusinessAPI.escapeHTML(BusinessAPI.formatTime(item.time_open))}–${BusinessAPI.escapeHTML(BusinessAPI.formatTime(item.time_close))}</td>
      <td>${BusinessAPI.escapeHTML(item.address)}</td>
      <td>${BusinessAPI.escapeHTML(BusinessAPI.formatMoney(item))}</td>
      <td>★ ${item.avg_rating == null ? '—' : Number(item.avg_rating).toFixed(1)} (${item.review_count})</td>
      <td><span class="b-badge ${statusClass(item.status)}">${BusinessAPI.escapeHTML(BusinessAPI.statusLabels[item.status] || item.status)}</span></td>
      <td><div class="row-actions">
        <button class="row-btn" data-action="detail">Xem</button>
        <button class="row-btn" data-action="edit">Chỉnh sửa</button>
        ${item.status !== 'cancelled' ? '<button class="row-btn danger" data-action="cancel">Hủy</button>' : ''}
      </div></td>
    </tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:28px;">Chưa có hoạt động nào.</td></tr>';
}

function renderCategories(selected = []) {
  document.getElementById('f-categories').innerHTML = categories.map(category => `
    <label class="chip ${selected.includes(category.category_id) ? 'active' : ''}">
      <input type="checkbox" value="${BusinessAPI.escapeHTML(category.category_id)}" ${selected.includes(category.category_id) ? 'checked' : ''} hidden>
      ${BusinessAPI.escapeHTML(category.name)}
    </label>`).join('');
}

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

window.openForm = (mode, id = null) => {
  editingId = mode === 'edit' ? id : null;
  const item = activities.find(activity => activity.activity_id === editingId);
  document.getElementById('form-title').textContent = item ? 'Chỉnh sửa hoạt động' : 'Tạo hoạt động mới';
  document.getElementById('f-name').value = item?.name || '';
  document.getElementById('f-description').value = item?.description || '';
  document.getElementById('f-price').value = item?.price ?? '';
  document.getElementById('f-price-text').value = item?.price_text || '';
  document.getElementById('f-address').value = item?.address || '';
  document.getElementById('f-open').value = toLocalInput(item?.time_open);
  document.getElementById('f-close').value = toLocalInput(item?.time_close);
  document.getElementById('f-latitude').value = item?.latitude ?? '';
  document.getElementById('f-longitude').value = item?.longitude ?? '';
  document.getElementById('f-source').value = item?.source_url || '';
  document.getElementById('f-media').value = '';
  renderCategories(item?.category_ids || []);
  document.getElementById('form-overlay').classList.add('show');
  document.getElementById('form-panel').classList.add('show');
};
window.closeForm = () => {
  document.getElementById('form-overlay').classList.remove('show');
  document.getElementById('form-panel').classList.remove('show');
};
window.closeDetail = () => {
  document.getElementById('detail-overlay').classList.remove('show');
  document.getElementById('detail-panel').classList.remove('show');
};

function selectedCategoryIds() {
  return [...document.querySelectorAll('#f-categories input:checked')].map(input => input.value);
}

async function submitActivity() {
  const name = document.getElementById('f-name').value.trim();
  const address = document.getElementById('f-address').value.trim();
  if (!name || !address) return BusinessAPI.notify('Tên và địa chỉ là bắt buộc.', 'error');
  const numberOrNull = id => {
    const value = document.getElementById(id).value.trim();
    return value === '' ? null : Number(value);
  };
  const dateOrNull = id => document.getElementById(id).value ? new Date(document.getElementById(id).value).toISOString() : null;
  const payload = {
    name,
    description: document.getElementById('f-description').value.trim() || null,
    price: numberOrNull('f-price'),
    price_text: document.getElementById('f-price-text').value.trim() || null,
    address,
    time_open: dateOrNull('f-open'),
    time_close: dateOrNull('f-close'),
    latitude: numberOrNull('f-latitude'),
    longitude: numberOrNull('f-longitude'),
    source_url: document.getElementById('f-source').value.trim() || null,
    category_ids: selectedCategoryIds()
  };
  try {
    const activity = await BusinessAPI.request(editingId ? `/activities/${editingId}` : '/activities', {
      method: editingId ? 'PATCH' : 'POST', body: payload
    });
    const files = [...document.getElementById('f-media').files];
    for (const file of files) {
      const form = new FormData();
      form.append('file', file);
      await BusinessAPI.request(`/activities/${activity.activity_id}/media/upload`, { method: 'POST', body: form });
    }
    await reloadActivities();
    closeForm();
    BusinessAPI.notify(editingId ? 'Đã cập nhật và gửi duyệt lại.' : 'Đã tạo hoạt động và gửi chờ duyệt.');
  } catch (error) { BusinessAPI.notify(error.message, 'error'); }
}
window.submitActivity = submitActivity;

function openDetail(id) {
  const item = activities.find(activity => activity.activity_id === id);
  if (!item) return;
  const metrics = performance.get(id) || {};
  document.getElementById('detail-title').textContent = item.name;
  document.getElementById('detail-summary').textContent = `${BusinessAPI.formatMoney(item)} · ${BusinessAPI.formatTime(item.time_open)}–${BusinessAPI.formatTime(item.time_close)} · ${item.address}`;
  document.getElementById('detail-bookmarks').textContent = metrics.bookmark_count || 0;
  document.getElementById('detail-interactions').textContent = metrics.interaction_count || 0;
  document.getElementById('detail-rating').textContent = item.avg_rating == null ? '—' : Number(item.avg_rating).toFixed(1);
  document.getElementById('detail-reviews').textContent = item.review_count || 0;
  document.getElementById('detail-media').innerHTML = item.media?.length ? item.media.map(media => `
    <div style="position:relative;display:inline-block;margin:5px;">
      ${media.media_type === 'video' ? `<video src="${BusinessAPI.escapeHTML(media.media_url)}" controls style="width:120px;height:90px;object-fit:cover;border-radius:8px;"></video>` : `<img src="${BusinessAPI.escapeHTML(media.media_url)}" alt="Media" style="width:120px;height:90px;object-fit:cover;border-radius:8px;">`}
      <button class="row-btn danger" data-delete-activity-media="${BusinessAPI.escapeHTML(media.media_id)}" style="display:block;width:100%;">Xóa</button>
    </div>`).join('') : '<span style="color:var(--muted);font-size:13px;">Chưa có ảnh/video.</span>';
  document.getElementById('detail-edit').dataset.id = id;
  document.getElementById('detail-overlay').classList.add('show');
  document.getElementById('detail-panel').classList.add('show');
}

async function reloadActivities() {
  const [items, analytics] = await Promise.all([
    BusinessAPI.request('/business/activities'),
    BusinessAPI.request('/business/analytics?days=30')
  ]);
  activities = items;
  performance = new Map(analytics.activity_performance.map(item => [item.activity_id, item]));
  renderRows();
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await BusinessAPI.requireBusiness();
    categories = await BusinessAPI.request('/categories', { auth: false });
    await reloadActivities();
  } catch (error) { BusinessAPI.notify(error.message, 'error'); }
  document.getElementById('f-categories').addEventListener('change', event => event.target.closest('.chip')?.classList.toggle('active', event.target.checked));
  document.getElementById('activity-rows').addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const id = button.closest('tr').dataset.id;
    if (button.dataset.action === 'detail') openDetail(id);
    if (button.dataset.action === 'edit') openForm('edit', id);
    if (button.dataset.action === 'cancel' && confirm('Hủy hoạt động này?')) {
      try { await BusinessAPI.request(`/activities/${id}`, { method: 'DELETE' }); await reloadActivities(); BusinessAPI.notify('Đã hủy hoạt động.'); }
      catch (error) { BusinessAPI.notify(error.message, 'error'); }
    }
  });
  document.getElementById('detail-edit').addEventListener('click', event => { const id = event.currentTarget.dataset.id; closeDetail(); openForm('edit', id); });
  document.getElementById('detail-media').addEventListener('click', async event => {
    const button = event.target.closest('[data-delete-activity-media]');
    if (!button || !confirm('Xóa media này?')) return;
    try { await BusinessAPI.request(`/activities/media/${button.dataset.deleteActivityMedia}`, { method: 'DELETE' }); await reloadActivities(); closeDetail(); BusinessAPI.notify('Đã xóa media.'); }
    catch (error) { BusinessAPI.notify(error.message, 'error'); }
  });
});
