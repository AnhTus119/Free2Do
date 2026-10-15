let reviews = [];
let activities = [];
let complaints = new Map();
// Lọc kết hợp kiểu AND: hoạt động + số sao + có ảnh/video.
const filters = {
  activityId: new URLSearchParams(location.search).get('activity_id') || '',
  rating: 0,
  media: false,
};

const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z';
const starIcon = (empty = false) => `<svg class="rv-star${empty ? ' empty' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
const stars = rating => `<span class="rv-rating" role="img" aria-label="${rating} trên 5 sao">${Array.from({ length: 5 }, (_, index) => starIcon(index >= rating)).join('')}</span>`;
const esc = value => BusinessAPI.escapeHTML(value);
const mediaHTML = (items, editable = false) => items?.length ? `<div class="rv-media">${items.map(item => `<span>${item.media_type === 'video'
  ? `<video class="rv-thumb" src="${esc(item.media_url)}" controls></video>`
  : `<img class="rv-thumb" src="${esc(item.media_url)}" data-zoom alt="Ảnh đánh giá">`}${editable ? `<button type="button" class="row-btn danger" data-action="delete-reply-media" data-media-id="${esc(item.media_id)}">Xóa file</button>` : ''}</span>`).join('')}</div>` : '';

function card(review) {
  const complaint = complaints.get(review.review_id);
  const reply = review.reply;
  return `<article data-zoom-group class="rv-card${complaint ? ' complained' : ''}" data-id="${esc(review.review_id)}">
    <div class="rv-top"><div class="nav-avatar" style="width:32px;height:32px;font-size:12px;">${esc(review.reviewer_name.charAt(0))}</div>
      <b>${esc(review.reviewer_name)}</b>${stars(review.rating)}<span class="rv-date">${BusinessAPI.formatDateTime(review.created_at)}</span></div>
    <div class="rv-meta">Hoạt động: <b>${esc(review.activity_name)}</b>${review.activity_code ? ` (${esc(review.activity_code)})` : ''}</div>
    <p class="rv-text">${esc(review.content || 'Không có nội dung.')}</p>
    ${mediaHTML(review.media)}
    ${reply ? `<div class="biz-reply"><b>Doanh nghiệp phản hồi:</b> ${esc(reply.content)}${mediaHTML(reply.media, true)}
      <div class="rv-actions"><button type="button" class="row-btn" data-action="toggle-reply">Sửa phản hồi</button><button type="button" class="row-btn danger" data-action="delete-reply">Xóa phản hồi</button></div></div>` : ''}
    ${complaint ? `<div class="rv-complaint-note"><b>Khiếu nại đang chờ xử lý:</b> ${esc(complaint.reason)}${complaint.description ? `. ${esc(complaint.description)}` : ''}</div>` : ''}
    ${!reply || !complaint ? `<div class="rv-actions">${!reply ? '<button type="button" class="btn btn-secondary" data-action="toggle-reply">Phản hồi</button>' : ''}${!complaint ? '<button type="button" class="btn btn-ghost" data-action="toggle-complaint">Khiếu nại</button>' : ''}</div>` : ''}
    <div class="reply-box"><textarea placeholder="Nhập phản hồi..." aria-label="Nội dung phản hồi">${reply ? esc(reply.content) : ''}</textarea>${reply ? '' : '<input type="file" accept="image/*,video/*" aria-label="Đính kèm ảnh hoặc video">'}<button type="button" class="btn btn-primary" data-action="submit-reply">${reply ? 'Lưu phản hồi' : 'Gửi phản hồi'}</button></div>
    ${!complaint ? `<div class="complaint-box"><input class="complaint-reason" placeholder="Lý do khiếu nại" aria-label="Lý do khiếu nại"><textarea class="complaint-description" placeholder="Mô tả chi tiết..." aria-label="Mô tả chi tiết"></textarea><button type="button" class="btn btn-primary" data-action="submit-complaint">Gửi khiếu nại</button></div>` : ''}
  </article>`;
}

function render() {
  const byActivity = reviews.filter(review => !filters.activityId || review.activity_id === filters.activityId);
  const withMedia = byActivity.filter(review => !filters.media || review.media?.length);
  const filtered = withMedia.filter(review => !filters.rating || review.rating === filters.rating);
  const count = value => withMedia.filter(review => !value || review.rating === value).length;
  document.getElementById('f-stars').innerHTML = [0, 5, 4, 3, 2, 1].map(value => `<button type="button" class="rv-pill" data-rating="${value}" aria-pressed="${filters.rating === value}" aria-label="${value ? `${value} sao` : 'Tất cả số sao'}">${value ? `${value}${starIcon()}` : 'Tất cả'} <small>${count(value)}</small></button>`).join('');
  document.getElementById('f-media').setAttribute('aria-pressed', String(filters.media));
  document.getElementById('c-media').textContent = byActivity.filter(review => review.media?.length).length;
  document.getElementById('rv-list').innerHTML = filtered.length
    ? filtered.map(card).join('')
    : '<div class="empty-state"><p>Không có đánh giá phù hợp với bộ lọc.</p></div>';
}

function renderActivityOptions() {
  const select = document.getElementById('f-activity');
  select.innerHTML = '<option value="">Tất cả</option>' + activities.map(item => `<option value="${esc(item.activity_id)}">${esc(item.name)}</option>`).join('');
  if (!activities.some(item => item.activity_id === filters.activityId)) filters.activityId = '';
  select.value = filters.activityId;
}

async function reload() {
  const [items, complaintItems, dashboard, activityItems] = await Promise.all([
    BusinessAPI.request('/business/reviews'), BusinessAPI.request('/business/complaints'),
    BusinessAPI.request('/business/dashboard'), BusinessAPI.request('/business/activities'),
  ]);
  reviews = items;
  activities = activityItems;
  complaints = new Map(complaintItems.map(item => [item.review_id, item]));
  document.getElementById('review-summary').textContent = `${dashboard.average_rating == null ? 'Chưa có điểm' : `${dashboard.average_rating.toFixed(1)} trung bình`} · ${dashboard.review_count} đánh giá trên tất cả hoạt động`;
  renderActivityOptions();
  render();
}

async function handleAction(button, element, review) {
  const replyBox = element.querySelector('.reply-box');
  const complaintBox = element.querySelector('.complaint-box');
  const action = button.dataset.action;
  if (action === 'toggle-reply') {
    complaintBox?.classList.remove('show');
    replyBox.classList.toggle('show');
    replyBox.querySelector('textarea').focus();
    return;
  }
  if (action === 'toggle-complaint') {
    replyBox?.classList.remove('show');
    complaintBox.classList.toggle('show');
    complaintBox.querySelector('input').focus();
    return;
  }
  let message;
  if (action === 'submit-reply') {
    const content = replyBox.querySelector('textarea').value.trim();
    if (!content) return BusinessAPI.notify('Vui lòng nhập nội dung phản hồi.', 'error');
    if (review.reply) {
      await BusinessAPI.request(`/business/review-replies/${review.reply.reply_id}`, { method: 'PATCH', body: { content }, toast: false });
      message = 'Đã chỉnh sửa phản hồi thành công.';
    } else {
      const reply = await BusinessAPI.request(`/business/reviews/${review.review_id}/reply`, { method: 'POST', body: { content }, toast: false });
      const file = replyBox.querySelector('input[type=file]')?.files[0];
      if (file) {
        const form = new FormData();
        form.append('file', file);
        await BusinessAPI.request(`/business/review-replies/${reply.reply_id}/media/upload`, { method: 'POST', body: form, toast: false });
      }
      message = 'Đã gửi phản hồi.';
    }
  }
  if (action === 'delete-reply-media') {
    if (!confirm('Xóa file này khỏi phản hồi?')) return;
    await BusinessAPI.request(`/business/review-replies/media/${encodeURIComponent(button.dataset.mediaId)}`, { method: 'DELETE', toast: false });
    message = 'Đã xóa file khỏi phản hồi.';
  }
  if (action === 'delete-reply') {
    if (!confirm('Xóa phản hồi này?')) return;
    await BusinessAPI.request(`/business/review-replies/${review.reply.reply_id}`, { method: 'DELETE', toast: false });
    message = 'Đã xóa phản hồi.';
  }
  if (action === 'submit-complaint') {
    const reason = complaintBox.querySelector('.complaint-reason').value.trim();
    if (!reason) return BusinessAPI.notify('Vui lòng nhập lý do khiếu nại.', 'error');
    await BusinessAPI.request('/complaints', {
      method: 'POST', toast: false,
      body: { review_id: review.review_id, reason, description: complaintBox.querySelector('.complaint-description').value.trim() || null },
    });
    message = 'Đã gửi khiếu nại tới FREE2DO.';
  }
  if (!message) return;
  await reload();
  BusinessAPI.notify(message);
}

document.addEventListener('DOMContentLoaded', async () => {
  try { await BusinessAPI.requireBusiness(); await reload(); }
  catch (error) { BusinessAPI.notify(error.message, 'error'); }
  document.getElementById('f-activity').addEventListener('change', event => {
    filters.activityId = event.target.value;
    const url = new URL(location.href);
    if (filters.activityId) url.searchParams.set('activity_id', filters.activityId); else url.searchParams.delete('activity_id');
    history.replaceState(null, '', url);
    render();
  });
  document.getElementById('f-stars').addEventListener('click', event => {
    const pill = event.target.closest('[data-rating]');
    if (!pill) return;
    filters.rating = Number(pill.dataset.rating);
    render();
  });
  document.getElementById('f-media').addEventListener('click', () => { filters.media = !filters.media; render(); });
  document.getElementById('rv-list').addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const element = button.closest('.rv-card');
    const review = reviews.find(item => item.review_id === element.dataset.id);
    const busyButton = button.dataset.action.startsWith('toggle') ? null : button;
    F2D.busy(busyButton, () => handleAction(button, element, review).catch(error => BusinessAPI.notify(error.message, 'error')));
  });
});
window.addEventListener('free2do:business-data-refresh', () => {
  if (document.querySelector('.reply-box.show, .complaint-box.show')) return;
  reload().catch(error => BusinessAPI.notify(error.message, 'error'));
});
