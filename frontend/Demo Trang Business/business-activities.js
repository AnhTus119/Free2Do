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
      <td>${item.is_approved ? `${item.avg_rating == null ? 'Chưa có' : `★ ${Number(item.avg_rating).toFixed(1)}`} (${item.review_count})` : '—'}</td>
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

// Giờ mở/đóng chỉ lưu giờ-phút: máy chủ giữ dạng datetime không múi giờ với ngày cố định.
const TIME_DATE = '2000-01-01';
function toTimeInput(value) {
  const match = String(value || '').match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '';
}
function timeOrNull(id) {
  const value = document.getElementById(id).value;
  return value ? `${TIME_DATE}T${value}:00` : null;
}
function setAddressError(message) {
  const box = document.getElementById('f-address-error');
  box.textContent = message || '';
  box.hidden = !message;
  document.getElementById('f-address').classList.toggle('invalid', Boolean(message));
}
const ADDRESS_ERROR_PATTERN = /địa chỉ|google maps|vị trí/i;

window.openForm = (mode, id = null) => {
  editingId = mode === 'edit' ? id : null;
  const item = activities.find(activity => activity.activity_id === editingId);
  document.getElementById('form-title').textContent = item ? 'Chỉnh sửa hoạt động' : 'Tạo hoạt động mới';
  document.getElementById('f-name').value = item?.name || '';
  document.getElementById('f-description').value = item?.description || '';
  document.getElementById('f-price').value = item?.price ?? '';
  document.getElementById('f-address').value = item?.address || '';
  document.getElementById('f-open').value = toTimeInput(item?.time_open);
  document.getElementById('f-close').value = toTimeInput(item?.time_close);
  setAddressError('');
  document.getElementById('f-source').value = item?.google_maps_url || item?.source_url || '';
  document.getElementById('f-always').checked = item?.always_available !== false;
  document.getElementById('f-available-from').value = item?.available_from?.slice(0, 10) || '';
  document.getElementById('f-available-until').value = item?.available_until?.slice(0, 10) || '';
  document.getElementById('availability-end-wrap').classList.toggle('is-disabled', document.getElementById('f-always').checked);
  document.getElementById('f-available-until').disabled = document.getElementById('f-always').checked;
  document.getElementById('f-cover').value = '';
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

// Nguyên nhân tạo 1 ra 2: nút không bị khóa trong lúc chờ xác minh Google Maps (vài giây)
// nên bấm lần 2 gửi thêm một POST. Khóa nút suốt cả luồng tạo + tải ảnh.
function submitActivity() {
  return F2D.busy(document.getElementById('f-submit'), saveActivity);
}

async function saveActivity() {
  const name = document.getElementById('f-name').value.trim();
  const address = document.getElementById('f-address').value.trim();
  setAddressError('');
  if (!name) return BusinessAPI.notify('Tên hoạt động là bắt buộc.', 'error');
  if (!address) { setAddressError('Hãy nhập địa chỉ hoạt động.'); return document.getElementById('f-address').focus(); }
  const submittedLink = document.getElementById('f-source').value.trim();
  let mapUrl;
  try {
    mapUrl = new URL(submittedLink);
  } catch {
    return BusinessAPI.notify('Hãy nhập link Google Maps hợp lệ.', 'error');
  }
  if (!/(^|\.)google\.[a-z.]+$|(^|\.)goo\.gl$/.test(mapUrl.hostname.toLowerCase())) {
    return BusinessAPI.notify('Địa điểm phải là link Google Maps.', 'error');
  }
  const numberOrNull = id => {
    const value = document.getElementById(id).value.trim();
    return value === '' ? null : Number(value);
  };
  const currentActivity = activities.find(activity => activity.activity_id === editingId);
  const alwaysAvailable = document.getElementById('f-always').checked;
  const availableFrom = document.getElementById('f-available-from').value;
  const availableUntil = alwaysAvailable ? null : document.getElementById('f-available-until').value;
  if (!alwaysAvailable && (!availableFrom || !availableUntil)) return BusinessAPI.notify('Hãy nhập ngày bắt đầu và ngày kết thúc, hoặc chọn mở vĩnh viễn.', 'error');
  if (!alwaysAvailable && availableFrom && availableUntil && availableUntil < availableFrom) {
    return BusinessAPI.notify('Ngày kết thúc phải từ ngày bắt đầu trở đi.', 'error');
  }
  const price = numberOrNull('f-price');
  if (price != null && (!Number.isInteger(price) || price < 0)) return BusinessAPI.notify('Giá phải là số nguyên không âm.', 'error');
  const payload = {
    name,
    description: document.getElementById('f-description').value.trim() || null,
    price,
    address,
    time_open: timeOrNull('f-open'),
    time_close: timeOrNull('f-close'),
    available_from: availableFrom ? `${availableFrom}T00:00:00` : null,
    available_until: availableUntil ? `${availableUntil}T23:59:59` : null,
    always_available: alwaysAvailable,
    source_url: currentActivity?.source_url || null,
    google_maps_url: submittedLink,
    category_ids: selectedCategoryIds()
  };
  try {
    const activity = await BusinessAPI.request(editingId ? `/activities/${editingId}` : '/activities', {
      method: editingId ? 'PATCH' : 'POST', body: payload
    });
    const upload = async (file, kind) => {
      const form = new FormData();
      form.append('file', file);
      await BusinessAPI.request(`/activities/${activity.activity_id}/media/upload?media_kind=${kind}`, { method: 'POST', body: form });
    };
    const cover = document.getElementById('f-cover').files[0];
    if (cover) await upload(cover, 'cover');
    for (const file of document.getElementById('f-media').files) {
      await upload(file, 'gallery');
    }
    await reloadActivities();
    closeForm();
    BusinessAPI.notify(editingId ? 'Đã cập nhật và gửi duyệt lại.' : 'Đã tạo hoạt động và gửi chờ duyệt.');
  } catch (error) {
    if (ADDRESS_ERROR_PATTERN.test(error.message)) {
      setAddressError(error.message);
      document.getElementById('f-address').focus();
    } else BusinessAPI.notify(error.message, 'error');
  }
}
window.submitActivity = submitActivity;

const STAR = '<path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/>';
const starRow = rating => `<span class="ad-stars" role="img" aria-label="${rating} trên 5 sao">${Array.from({ length: 5 }, (_, index) => `<svg viewBox="0 0 24 24" class="${index < Math.round(rating) ? '' : 'empty'}" aria-hidden="true">${STAR}</svg>`).join('')}</span>`;

// Popup "Xem" hoạt động: tên -> 4 ô số liệu -> thông tin chi tiết + ảnh/video -> đánh giá -> nút Chỉnh sửa.
async function openDetail(id) {
  const item = activities.find(activity => activity.activity_id === id);
  if (!item) return;
  const esc = BusinessAPI.escapeHTML;
  const metrics = performance.get(id) || {};
  document.getElementById('detail-title').textContent = item.name;
  const badge = document.getElementById('detail-status');
  badge.className = `b-badge ${statusClass(item.status)}`;
  badge.textContent = BusinessAPI.statusLabels[item.status] || item.status;
  document.querySelector('#detail-panel .ad-stats').style.display = item.is_approved ? '' : 'none';
  document.getElementById('detail-review-list').closest('.ad-section').style.display = item.is_approved ? '' : 'none';
  document.getElementById('detail-bookmarks').textContent = metrics.bookmark_count || 0;
  document.getElementById('detail-interactions').textContent = metrics.interaction_count || 0;
  document.getElementById('detail-rating').textContent = item.avg_rating == null ? '0' : Number(item.avg_rating).toFixed(1);
  document.getElementById('detail-reviews').textContent = item.review_count || 0;
  const hours = item.time_open || item.time_close
    ? `${BusinessAPI.formatTime(item.time_open)} - ${BusinessAPI.formatTime(item.time_close)}` : 'Chưa cập nhật';
  const period = item.always_available
    ? 'Mở vĩnh viễn'
    : `${BusinessAPI.formatDate(item.available_from)} đến ${BusinessAPI.formatDate(item.available_until)}`;
  document.getElementById('detail-info').innerHTML = [
    ['Mã hoạt động', item.code || 'Chưa có mã'],
    ['Giá', BusinessAPI.formatMoney(item)],
    ['Giờ mở cửa', hours],
    ['Thời gian áp dụng', period],
    ['Địa chỉ', item.address || 'Chưa cập nhật'],
    ['Mô tả', item.description || 'Chưa có mô tả'],
  ].map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('');
  document.getElementById('detail-media').innerHTML = item.media?.length ? item.media.map(media => `
    <div class="ad-media-item">
      ${media.media_type === 'video'
        ? `<video src="${esc(media.media_url)}" controls preload="metadata"></video>`
        : `<img src="${esc(media.media_url)}" alt="Ảnh hoạt động" data-zoom loading="lazy">`}
      <button type="button" class="row-btn danger" data-delete-activity-media="${esc(media.media_id)}">Xóa</button>
    </div>`).join('') : '<span class="f2d-empty">Chưa có ảnh/video.</span>';
  document.getElementById('detail-all-reviews').href = `reviews.html?activity_id=${encodeURIComponent(id)}`;
  document.getElementById('detail-edit').dataset.id = id;
  document.getElementById('detail-overlay').classList.add('show');
  document.getElementById('detail-panel').classList.add('show');

  const list = document.getElementById('detail-review-list');
  const summary = document.getElementById('detail-review-summary');
  summary.innerHTML = item.is_approved && item.review_count
    ? `<b>${Number(item.avg_rating || 0).toFixed(1)}</b>${starRow(item.avg_rating || 0)}<span class="f2d-empty">${item.review_count} đánh giá</span>`
    : '';
  list.innerHTML = '<span class="f2d-empty">Đang tải đánh giá...</span>';
  try {
    const reviews = (await BusinessAPI.request('/business/reviews')).filter(review => review.activity_id === id);
    list.innerHTML = reviews.length ? reviews.slice(0, 5).map(review => `<article class="ad-review">
        <div class="ad-review-top"><b>${esc(review.reviewer_name)}</b>${starRow(review.rating)}<time>${esc(BusinessAPI.formatDateTime(review.created_at))}</time></div>
        <p>${esc(review.content || 'Không có nội dung.')}</p>
        ${review.reply ? `<div class="ad-reply">Phản hồi của bạn: ${esc(review.reply.content)}</div>` : ''}
      </article>`).join('') : '<span class="f2d-empty">Hoạt động này chưa có đánh giá.</span>';
  } catch (error) {
    list.innerHTML = `<span class="f2d-empty">${esc(error.message)}</span>`;
  }
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
  document.getElementById('f-address').addEventListener('input', () => setAddressError(''));
  document.getElementById('f-source').addEventListener('input', () => setAddressError(''));
  document.getElementById('f-categories').addEventListener('change', event => event.target.closest('.chip')?.classList.toggle('active', event.target.checked));
  document.getElementById('f-always').addEventListener('change', event => {
    document.getElementById('availability-end-wrap').classList.toggle('is-disabled', event.target.checked);
    document.getElementById('f-available-until').disabled = event.target.checked;
    if (event.target.checked) document.getElementById('f-available-until').value = '';
  });
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
window.addEventListener('free2do:business-data-refresh', () => {
  reloadActivities().catch(error => BusinessAPI.notify(error.message, 'error'));
});
