let reviews = [];
let complaints = new Map();
const filters = { media: false, rating: 0 };

const stars = rating => `<span style="color:#F5B921;letter-spacing:1px;">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</span>`;
const mediaHTML = items => items?.length ? `<div class="rv-media">${items.map(item => item.media_type === 'video'
  ? `<video class="rv-thumb" src="${BusinessAPI.escapeHTML(item.media_url)}" controls></video>`
  : `<img class="rv-thumb" src="${BusinessAPI.escapeHTML(item.media_url)}" alt="Ảnh đánh giá">`).join('')}</div>` : '';

function card(review) {
  const complaint = complaints.get(review.review_id);
  const reply = review.reply;
  return `<article class="rv-card${complaint ? ' complained' : ''}" data-id="${BusinessAPI.escapeHTML(review.review_id)}">
    <div class="rv-top"><div class="nav-avatar" style="width:32px;height:32px;font-size:12px;">${BusinessAPI.escapeHTML(review.reviewer_name.charAt(0))}</div>
      <b>${BusinessAPI.escapeHTML(review.reviewer_name)}</b>${stars(review.rating)}<span class="rv-date">${BusinessAPI.formatDate(review.created_at)}</span></div>
    <div class="rv-meta">Hoạt động: <b>${BusinessAPI.escapeHTML(review.activity_name)}</b></div>
    <p class="rv-text">${BusinessAPI.escapeHTML(review.content || 'Không có nội dung.')}</p>
    ${mediaHTML(review.media)}
    ${reply ? `<div class="biz-reply"><b>Doanh nghiệp phản hồi:</b> ${BusinessAPI.escapeHTML(reply.content)}${mediaHTML(reply.media)}
      <div class="rv-actions"><button class="row-btn" data-action="edit-reply">Sửa</button><button class="row-btn danger" data-action="delete-reply">Xóa</button></div></div>` : ''}
    ${complaint ? `<div class="rv-complaint-note"><b>Khiếu nại ${BusinessAPI.escapeHTML(complaint.status)}:</b> ${BusinessAPI.escapeHTML(complaint.reason)}${complaint.description ? ` — ${BusinessAPI.escapeHTML(complaint.description)}` : ''}</div>` : ''}
    ${!reply ? `<div class="rv-actions"><button class="btn btn-secondary" data-action="toggle-reply">Phản hồi</button>${!complaint ? '<button class="btn btn-ghost" data-action="toggle-complaint">Khiếu nại</button>' : ''}</div>
      <div class="reply-box"><textarea placeholder="Nhập phản hồi..."></textarea><input type="file" accept="image/*,video/*"><button class="btn btn-primary" data-action="submit-reply">Gửi phản hồi</button></div>` : ''}
    ${!complaint ? `<div class="complaint-box"><input class="complaint-reason" placeholder="Lý do khiếu nại"><textarea class="complaint-description" placeholder="Mô tả chi tiết..."></textarea><button class="btn btn-primary" data-action="submit-complaint">Gửi khiếu nại</button></div>` : ''}
  </article>`;
}

function render() {
  const filtered = reviews.filter(review => (!filters.media || review.media?.length) && (!filters.rating || review.rating === filters.rating));
  document.getElementById('c-all').textContent = `(${reviews.length})`;
  document.getElementById('c-media').textContent = `(${reviews.filter(item => item.media?.length).length})`;
  document.getElementById('c-star').textContent = filters.rating ? `${filters.rating} sao` : 'Tất cả';
  document.getElementById('f-all').classList.toggle('active', !filters.media);
  document.getElementById('f-media').classList.toggle('active', filters.media);
  document.getElementById('star-menu').innerHTML = [0, 5, 4, 3, 2, 1].map(value => `<a href="#" data-rating="${value}">${value ? `${value} sao` : 'Tất cả'} <span>${value ? reviews.filter(item => item.rating === value).length : reviews.length}</span></a>`).join('');
  document.getElementById('rv-list').innerHTML = filtered.length ? filtered.map(card).join('') : '<div class="empty-state"><p>Không có đánh giá phù hợp.</p></div>';
}

async function reload() {
  const [items, complaintItems, dashboard] = await Promise.all([
    BusinessAPI.request('/business/reviews'), BusinessAPI.request('/business/complaints'), BusinessAPI.request('/business/dashboard')
  ]);
  reviews = items;
  complaints = new Map(complaintItems.map(item => [item.review_id, item]));
  document.getElementById('review-summary').textContent = `${dashboard.average_rating == null ? 'Chưa có điểm' : `${dashboard.average_rating.toFixed(1)} trung bình`} · ${dashboard.review_count} đánh giá trên tất cả hoạt động`;
  render();
}

document.addEventListener('DOMContentLoaded', async () => {
  try { await BusinessAPI.requireBusiness(); await reload(); }
  catch (error) { BusinessAPI.notify(error.message, 'error'); }
  document.getElementById('f-all').addEventListener('click', () => { filters.media = false; render(); });
  document.getElementById('f-media').addEventListener('click', () => { filters.media = true; render(); });
  document.getElementById('f-star').addEventListener('click', event => { event.stopPropagation(); document.getElementById('star-menu').classList.toggle('show'); });
  document.getElementById('star-menu').addEventListener('click', event => { const link = event.target.closest('[data-rating]'); if (!link) return; event.preventDefault(); filters.rating = Number(link.dataset.rating); document.getElementById('star-menu').classList.remove('show'); render(); });
  document.getElementById('rv-list').addEventListener('click', async event => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const element = button.closest('.rv-card'); const review = reviews.find(item => item.review_id === element.dataset.id);
    const replyBox = element.querySelector('.reply-box'); const complaintBox = element.querySelector('.complaint-box');
    if (button.dataset.action === 'toggle-reply') { complaintBox?.classList.remove('show'); replyBox.classList.toggle('show'); return; }
    if (button.dataset.action === 'toggle-complaint') { replyBox?.classList.remove('show'); complaintBox.classList.toggle('show'); return; }
    try {
      if (button.dataset.action === 'submit-reply') {
        const content = replyBox.querySelector('textarea').value.trim(); if (!content) throw new Error('Vui lòng nhập nội dung phản hồi.');
        const reply = await BusinessAPI.request(`/business/reviews/${review.review_id}/reply`, { method: 'POST', body: { content } });
        const file = replyBox.querySelector('input[type=file]').files[0];
        if (file) { const form = new FormData(); form.append('file', file); await BusinessAPI.request(`/business/review-replies/${reply.reply_id}/media/upload`, { method: 'POST', body: form }); }
      }
      if (button.dataset.action === 'edit-reply') {
        const content = prompt('Nội dung phản hồi mới:', review.reply.content); if (content === null) return;
        await BusinessAPI.request(`/business/review-replies/${review.reply.reply_id}`, { method: 'PATCH', body: { content: content.trim() } });
      }
      if (button.dataset.action === 'delete-reply') {
        if (!confirm('Xóa phản hồi này?')) return;
        await BusinessAPI.request(`/business/review-replies/${review.reply.reply_id}`, { method: 'DELETE' });
      }
      if (button.dataset.action === 'submit-complaint') {
        const reason = complaintBox.querySelector('.complaint-reason').value.trim(); if (!reason) throw new Error('Vui lòng nhập lý do khiếu nại.');
        await BusinessAPI.request('/complaints', { method: 'POST', body: { review_id: review.review_id, reason, description: complaintBox.querySelector('.complaint-description').value.trim() || null } });
      }
      await reload(); BusinessAPI.notify('Đã cập nhật dữ liệu.');
    } catch (error) { BusinessAPI.notify(error.message, 'error'); }
  });
});
