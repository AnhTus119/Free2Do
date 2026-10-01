(function () {
  'use strict';
  const api = window.CustomerAPI;
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const text = (key, value) => { const node = document.getElementById(key); if (node) node.textContent = value; };
  const mediaHTML = (item, own = false) => {
    const url = api.escapeHTML(item.media_url);
    const content = item.media_type === 'video'
      ? `<video src="${url}" controls preload="metadata"></video>`
      : `<img src="${url}" alt="Media đánh giá" loading="lazy">`;
    return `<span class="review-media-item">${content}${own && item.media_id ? `<button class="delete-review-media" data-media-id="${api.escapeHTML(item.media_id)}" type="button">Xóa</button>` : ''}</span>`;
  };
  function renderGallery(activity) {
    const slots = [...document.querySelectorAll('#activityGallery > div')];
    const media = activity.media || [];
    slots.forEach((slot, index) => {
      const item = media[index];
      if (!item) { slot.innerHTML = index === 0 ? '<span>Chưa có hình ảnh</span>' : ''; return; }
      const url = api.escapeHTML(item.media_url);
      slot.innerHTML = item.media_type === 'video'
        ? `<video src="${url}" controls preload="metadata" style="width:100%;height:100%;object-fit:cover"></video>`
        : `<img src="${url}" alt="${api.escapeHTML(activity.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover">`;
    });
  }
  function renderReviews(reviews, me) {
    document.getElementById('activityReviews').innerHTML = reviews.length ? reviews.map(review => {
      const own = me?.user_id === review.user_id;
      const media = (review.media || []).map(item => mediaHTML(item, own)).join('');
      const replyMedia = (review.reply?.media || []).map(item => mediaHTML(item)).join('');
      const reply = review.reply ? `<div class="business-reply"><b>Phản hồi từ doanh nghiệp</b><p>${api.escapeHTML(review.reply.content)}</p><div class="review-media-list">${replyMedia}</div></div>` : '';
      return `<article class="review-card" data-review-id="${api.escapeHTML(review.review_id)}" data-rating="${review.rating}" data-content="${api.escapeHTML(review.content || '')}"><div class="review-top"><div class="review-name">${api.escapeHTML(review.reviewer_name)}</div><div class="review-stars">${'★'.repeat(Math.max(0, Math.min(5, review.rating)))}</div><div class="review-date">${api.escapeHTML(new Date(review.created_at).toLocaleDateString('vi-VN'))}</div></div><div class="review-text">${api.escapeHTML(review.content || '')}</div><div class="review-media-list">${media}</div>${reply}${own ? '<div class="review-actions"><button class="btn btn-secondary edit-review" type="button">Sửa</button><button class="btn btn-ghost delete-review" type="button">Xóa</button></div>' : ''}</article>`;
    }).join('') : '<p>Chưa có đánh giá.</p>';
  }
  function buildReviewForm(existingReview, me) {
    if (!me || existingReview) return;
    const form = document.createElement('form');
    form.className = 'review-form';
    form.innerHTML = '<h3>Viết đánh giá</h3><label>Điểm (1–5)<input id="newRating" type="number" min="1" max="5" value="5" required></label><label>Nội dung<textarea id="newReview" rows="3" maxlength="3000"></textarea></label><label>Ảnh/video (có thể chọn nhiều)<input id="newReviewMedia" type="file" accept="image/*,video/*" multiple></label><button class="btn btn-primary" type="submit">Gửi đánh giá</button><p id="reviewStatus" class="form-status"></p>';
    document.getElementById('activityReviews').parentElement.after(form);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const rating = Number(document.getElementById('newRating').value);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
      const button = form.querySelector('button[type=submit]'); const status = document.getElementById('reviewStatus');
      button.disabled = true; status.textContent = 'Đang gửi đánh giá…';
      try {
        const review = await api.request('/reviews', { method: 'POST', body: { activity_id: id, rating, content: document.getElementById('newReview').value.trim() || null } });
        for (const file of [...document.getElementById('newReviewMedia').files]) {
          const body = new FormData(); body.append('file', file);
          await api.request(`/reviews/${encodeURIComponent(review.review_id)}/media/upload`, { method: 'POST', body });
        }
        location.reload();
      } catch (error) { status.textContent = error.message; button.disabled = false; }
    });
  }
  async function run() {
    if (!id) throw new Error('Thiếu mã hoạt động.');
    const origin = new URLSearchParams();
    if (params.has('latitude') && params.has('longitude')) {
      origin.set('latitude', params.get('latitude'));
      origin.set('longitude', params.get('longitude'));
    }
    const hasToken = Boolean(localStorage.getItem('token'));
    const [activity, categories, reviews, me, bookmarks] = await Promise.all([
      api.request(`/activities/${encodeURIComponent(id)}${origin.size ? `?${origin}` : ''}`), api.request('/categories'),
      api.request(`/activities/${encodeURIComponent(id)}/reviews`),
      hasToken ? api.requireUser().catch(() => null) : null,
      hasToken ? api.request('/bookmarks/me').catch(() => []) : [],
    ]);
    const matched = categories.filter(item => (activity.category_ids || []).includes(item.category_id));
    text('activityName', activity.name); text('activityMeta', `${activity.business_name} · ${activity.address}${activity.avg_rating == null ? '' : ` · ★ ${activity.avg_rating} (${activity.review_count} đánh giá)`}`);
    text('activityPrice', api.priceLabel(activity.price_text, activity.price)); text('activityDuration', 'Theo khung giờ');
    text('activityHours', api.hours(activity.time_open, activity.time_close)); text('activityDistance', activity.distance_km == null ? 'Chưa chọn vị trí tìm kiếm' : `${activity.distance_km} km`);
    text('activityDescription', activity.description || 'Chưa có mô tả.'); text('activityMapPin', `${activity.name} · ${activity.address}`);
    text('sideActivityPrice', api.priceLabel(activity.price_text, activity.price)); text('sideActivityMeta', api.hours(activity.time_open, activity.time_close));
    text('reviewsTitle', `Đánh giá (${reviews.length})`);
    document.getElementById('activityTags').innerHTML = matched.map(item => `<span class="tag">${api.escapeHTML(item.name)}</span>`).join('');
    renderGallery(activity); renderReviews(reviews, me); buildReviewForm(reviews.find(review => review.user_id === me?.user_id), me);
    const mapsLine = document.getElementById('activityMapsLine');
    const mapsLinkText = document.getElementById('activityMapsLink');
    if (activity.google_maps_url && mapsLine && mapsLinkText) {
      mapsLinkText.href = activity.google_maps_url;
      mapsLinkText.textContent = activity.google_maps_url;
      mapsLinkText.title = activity.google_maps_url;
      mapsLine.style.display = '';
    }
    const mapLink = document.getElementById('mapLink');
    if (activity.google_maps_url) {
      mapLink.href = activity.google_maps_url;
      mapLink.target = '_blank';
      mapLink.rel = 'noopener noreferrer';
      mapLink.style.display = '';
      mapLink.dataset.googleMapsUrl = activity.google_maps_url;
      mapLink.title = activity.google_maps_url;
    }
    document.getElementById('detailSearchForm').addEventListener('submit', event => {
      event.preventDefault(); const keyword = document.getElementById('detailSearchInput').value.trim();
      location.href = `search.html${keyword ? `?q=${encodeURIComponent(keyword)}` : ''}`;
    });
    document.getElementById('activityReviews').addEventListener('click', async event => {
      const card = event.target.closest('[data-review-id]'); if (!card) return;
      try {
        if (event.target.closest('.delete-review-media')) { if (!confirm('Xóa ảnh/video này khỏi đánh giá?')) return; await api.request(`/reviews/media/${encodeURIComponent(event.target.closest('.delete-review-media').dataset.mediaId)}`, { method: 'DELETE' }); location.reload(); return; }
        if (event.target.closest('.delete-review')) { if (confirm('Xóa đánh giá này?')) { await api.request(`/reviews/${encodeURIComponent(card.dataset.reviewId)}`, { method: 'DELETE' }); location.reload(); } }
        if (event.target.closest('.edit-review')) {
          const rating = Number(prompt('Điểm mới (1–5):', card.dataset.rating)); if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
          const content = prompt('Nội dung mới:', card.dataset.content); if (content === null) return;
          await api.request(`/reviews/${encodeURIComponent(card.dataset.reviewId)}`, { method: 'PATCH', body: { rating, content: content.trim() || null } }); location.reload();
        }
      } catch (error) { alert(error.message); }
    });
    document.title = `FREE2DO — ${activity.name}`;
    const favorite = document.getElementById('favoriteButton'); const label = document.getElementById('favoriteLabel'); let saved = false;
    if (me?.account_type === 'user') saved = bookmarks.some(item => item.activity_id === id);
    const updateFavorite = () => { label.textContent = saved ? 'Đã yêu thích' : 'Lưu vào yêu thích'; favorite.classList.toggle('is-favorite', saved); }; updateFavorite();
    favorite.onclick = async () => { if (!me) return location.href = '../log-in.html'; favorite.disabled = true; try { await api.request(`/bookmarks/${encodeURIComponent(id)}`, { method: saved ? 'DELETE' : 'POST' }); saved = !saved; updateFavorite(); } catch (error) { alert(error.message); } finally { favorite.disabled = false; } };
    document.getElementById('reportActivity').onclick = async event => { event.preventDefault(); if (!me) return location.href = '../log-in.html'; const reason = prompt('Lý do báo cáo hoạt động:'); if (!reason?.trim()) return; const description = prompt('Mô tả thêm (không bắt buộc):') ?? ''; try { await api.request('/reports', { method: 'POST', body: { activity_id: id, reason: reason.trim(), description: description.trim() || null } }); alert('Đã gửi báo cáo.'); } catch (error) { alert(error.message); } };
  }
  run().catch(error => { document.querySelector('.wrap').innerHTML = `<div class="card" style="padding:24px">${api.escapeHTML(error.message)}</div>`; });
})();
