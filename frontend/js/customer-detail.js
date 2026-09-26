(function () {
  'use strict';
  const api = window.CustomerAPI;
  const id = new URLSearchParams(location.search).get('id');
  const text = (key, value) => { const node = document.getElementById(key); if (node) node.textContent = value; };
  async function run() {
    if (!id) throw new Error('Thiếu mã hoạt động.');
    const [activity, categories, reviews, me] = await Promise.all([
      api.request(`/activities/${encodeURIComponent(id)}`), api.request('/categories'),
      api.request(`/activities/${encodeURIComponent(id)}/reviews`),
      localStorage.getItem('token') ? api.request('/auth/me').catch(() => null) : null,
    ]);
    const matched = categories.filter(item => activity.category_ids.includes(item.category_id));
    text('activityName', activity.name); text('galleryIcon', ''); text('activityMeta', activity.address + (activity.avg_rating == null ? '' : ` · ★ ${activity.avg_rating} (${activity.review_count} đánh giá)`));
    text('activityPrice', api.price(activity.price)); text('activityDuration', 'Do backend quản lý');
    text('activityHours', api.hours(activity.time_open, activity.time_close)); text('activityDistance', 'Xem khoảng cách tại trang tìm kiếm');
    text('activityDescription', activity.description || 'Chưa có mô tả.'); text('activityMapPin', activity.name);
    text('sideActivityPrice', api.price(activity.price)); text('sideActivityMeta', api.hours(activity.time_open, activity.time_close));
    text('reviewsTitle', `Đánh giá (${reviews.length})`);
    document.getElementById('activityTags').innerHTML = matched.map(item => `<span class="tag">${api.escapeHTML(item.name)}</span>`).join('');
    const gallery = activity.media?.filter(item => item.media_type === 'image') || [];
    if (gallery.length) document.getElementById('galleryIcon').innerHTML = `<img src="${api.escapeHTML(gallery[0].media_url)}" alt="" style="width:100%;height:100%;object-fit:cover">`;
    document.getElementById('activityReviews').innerHTML = reviews.length ? reviews.map(review => {
      const own = me?.user_id === review.user_id;
      const media = (review.media || []).map(item => `<span><img src="${api.escapeHTML(item.media_url)}" alt="" style="width:90px;height:90px;object-fit:cover;border-radius:8px">${own ? `<button class="delete-review-media" data-media-id="${api.escapeHTML(item.media_id)}" type="button">Xóa ảnh</button>` : ''}</span>`).join('');
      return `<article class="review-card" data-review-id="${api.escapeHTML(review.review_id)}"><div class="review-top"><div class="review-name">${api.escapeHTML(review.reviewer_name)}</div><div class="review-stars">${'★'.repeat(Math.max(0, Math.min(5, review.rating)))}</div><div class="review-date">${api.escapeHTML(new Date(review.created_at).toLocaleDateString('vi-VN'))}</div></div><div class="review-text">${api.escapeHTML(review.content || '')}</div><div>${media}</div>${own ? '<button class="btn btn-secondary edit-review" type="button">Sửa</button> <button class="btn btn-ghost delete-review" type="button">Xóa</button>' : ''}</article>`;
    }).join('') : '<p>Chưa có đánh giá.</p>';
    document.getElementById('activityReviews').addEventListener('click', async event => {
      const card = event.target.closest('[data-review-id]'); if (!card) return;
      try {
        if (event.target.closest('.delete-review-media')) { await api.request(`/reviews/media/${encodeURIComponent(event.target.closest('.delete-review-media').dataset.mediaId)}`, { method: 'DELETE' }); location.reload(); }
        if (event.target.closest('.delete-review')) { if (confirm('Xóa đánh giá này?')) { await api.request(`/reviews/${encodeURIComponent(card.dataset.reviewId)}`, { method: 'DELETE' }); location.reload(); } }
        if (event.target.closest('.edit-review')) {
          const rating = Number(prompt('Điểm mới (1–5):')); if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
          const content = prompt('Nội dung mới:'); if (content === null) return;
          await api.request(`/reviews/${encodeURIComponent(card.dataset.reviewId)}`, { method: 'PATCH', body: { rating, content } }); location.reload();
        }
      } catch (error) { alert(error.message); }
    });
    document.title = `FREE2DO — ${activity.name}`;
    const favorite = document.getElementById('favoriteButton'); const label = document.getElementById('favoriteLabel'); let saved = false;
    if (me?.account_type === 'user') { const bookmarks = await api.request('/bookmarks/me').catch(() => []); saved = bookmarks.some(item => item.activity_id === id); }
    const updateFavorite = () => { label.textContent = saved ? 'Đã yêu thích' : 'Lưu vào yêu thích'; favorite.classList.toggle('is-favorite', saved); }; updateFavorite();
    favorite.onclick = async () => { if (!me) return location.href = '../log-in.html'; favorite.disabled = true; try { await api.request(`/bookmarks/${encodeURIComponent(id)}`, { method: saved ? 'DELETE' : 'POST' }); saved = !saved; updateFavorite(); } catch (error) { alert(error.message); } finally { favorite.disabled = false; } };
    document.getElementById('reportActivity').onclick = async event => { event.preventDefault(); if (!me) return location.href = '../log-in.html'; const reason = prompt('Lý do báo cáo hoạt động:'); if (!reason?.trim()) return; try { await api.request('/reports', { method: 'POST', body: { activity_id: id, reason: reason.trim() } }); alert('Đã gửi báo cáo.'); } catch (error) { alert(error.message); } };
    const reviewBox = document.createElement('form'); reviewBox.innerHTML = '<h3>Viết đánh giá</h3><label>Điểm (1–5) <input id="newRating" type="number" min="1" max="5" value="5"></label><input id="newReview" placeholder="Nội dung đánh giá"><label>Ảnh/video (không bắt buộc) <input id="newReviewMedia" type="file" accept="image/*,video/*"></label><button class="btn btn-primary" type="submit">Gửi đánh giá</button>'; document.getElementById('activityReviews').after(reviewBox);
    reviewBox.onsubmit = async event => { event.preventDefault(); if (!me) return location.href = '../log-in.html'; const rating = Number(document.getElementById('newRating').value); if (!Number.isInteger(rating) || rating < 1 || rating > 5) return alert('Điểm phải từ 1 đến 5.'); try { const review = await api.request('/reviews', { method: 'POST', body: { activity_id: id, rating, content: document.getElementById('newReview').value.trim() } }); const file = document.getElementById('newReviewMedia').files[0]; if (file) { const form = new FormData(); form.append('file', file); await api.request(`/reviews/${encodeURIComponent(review.review_id)}/media/upload`, { method: 'POST', body: form }); } location.reload(); } catch (error) { alert(error.message); } };
  }
  run().catch(error => { document.querySelector('.wrap').innerHTML = `<div class="card" style="padding:24px">${api.escapeHTML(error.message)}</div>`; });
})();
