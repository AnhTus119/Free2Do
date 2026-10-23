(function () {
  'use strict';
  const api = window.CustomerAPI;
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const text = (key, value) => { const node = document.getElementById(key); if (node) node.textContent = value; };
  const isOwnReview = (review, me) => me?.user_id != null && String(me.user_id) === String(review.user_id);
  const mediaHTML = (item, own = false) => {
    const url = api.escapeHTML(item.media_url);
    const content = item.media_type === 'video'
      ? `<video src="${url}" controls preload="metadata"></video>`
      : `<img src="${url}" alt="Media đánh giá" loading="lazy" data-zoom="${url}">`;
    return `<span class="review-media-item">${content}${own && item.media_id ? `<button class="delete-review-media" data-media-id="${api.escapeHTML(item.media_id)}" type="button">Xóa</button>` : ''}</span>`;
  };
  function renderGallery(activity) {
    const gallery = document.getElementById('activityGallery');
    const businessPhotos = window.Free2DoBusinessMedia?.gallery(activity) || [];
    const media = [...(activity.media || []), ...businessPhotos].sort((a, b) => (a.media_kind === 'cover' ? -1 : 0) - (b.media_kind === 'cover' ? -1 : 0));
    const visibleMedia = media.slice(0, 5);
    gallery.classList.remove('activity-photo-grid--1', 'activity-photo-grid--2', 'activity-photo-grid--3', 'activity-photo-grid--4', 'activity-photo-grid--5');
    gallery.classList.add(`activity-photo-grid--${visibleMedia.length}`);
    if (!media.length) {
      gallery.innerHTML = '<div class="activity-photo-empty">Chưa có hình ảnh</div>';
      return;
    }
    gallery.innerHTML = visibleMedia.map((item, index) => {
      const url = api.escapeHTML(item.media_url);
      const more = index === 4 && media.length > 5 ? `<span class="activity-photo-more">+${media.length - 4}</span>` : '';
      return item.media_type === 'video'
        ? `<div class="activity-photo-item"><video src="${url}" controls preload="metadata" aria-label="Video ${index + 1}"></video>${more}</div>`
        : `<button class="activity-photo-item" type="button" data-gallery-index="${index}" aria-label="Xem ảnh ${index + 1} trên ${media.length}"><img src="${url}" alt="${api.escapeHTML(activity.name)} - ảnh ${index + 1}" loading="lazy">${more}</button>`;
    }).join('');
    gallery.onclick = event => {
      const button = event.target.closest('.activity-photo-item');
      if (!button || event.target.closest('video')) return;
      if (button.dataset.galleryIndex != null) F2D.lightbox(media.map(item => ({ url: item.media_url, type: item.media_type, alt: activity.name })), Number(button.dataset.galleryIndex));
    };
  }
  function renderReviews(reviews, me) {
    document.getElementById('activityReviews').innerHTML = reviews.length ? reviews.map(review => {
      const own = isOwnReview(review, me);
      const media = (review.media || []).map(item => mediaHTML(item, own)).join('');
      const replyMedia = (review.reply?.media || []).map(item => mediaHTML(item)).join('');
      const reply = review.reply ? `<div class="business-reply"><b>Phản hồi từ doanh nghiệp</b><p>${api.escapeHTML(review.reply.content)}</p><div class="review-media-list">${replyMedia}</div></div>` : '';
      return `<article class="review-card" data-zoom-group data-review-id="${api.escapeHTML(review.review_id)}" data-rating="${review.rating}" data-content="${api.escapeHTML(review.content || '')}"><div class="review-top"><div class="review-name">${api.escapeHTML(review.reviewer_name)}</div><div class="review-stars">${'★'.repeat(Math.max(0, Math.min(5, review.rating)))}</div><div class="review-date">${api.escapeHTML(F2D.dateTime(review.created_at))}</div></div><div class="review-text">${api.escapeHTML(review.content || '')}</div><div class="review-media-list">${media}</div>${reply}${own ? '<div class="review-actions"><button class="btn btn-secondary edit-review" type="button">Sửa</button><button class="btn btn-ghost delete-review" type="button">Xóa</button></div>' : ''}</article>`;
    }).join('') : '<p>Chưa có đánh giá.</p>';
  }
  function buildReviewForm(existingReview, me) {
    let formArea = document.getElementById('reviewFormArea');
    if (me && existingReview) {
      formArea?.remove();
      return;
    }
    if (!formArea) {
      formArea = document.createElement('div');
      formArea.id = 'reviewFormArea';
      document.getElementById('activityReviews').parentElement.after(formArea);
    }
    if (!me) {
      formArea.innerHTML = '<div class="review-form"><h3>Viết đánh giá</h3><p>Đăng nhập để chấm sao và chia sẻ trải nghiệm của bạn.</p><a class="btn btn-primary" href="../log-in.html">Đăng nhập để đánh giá</a></div>';
      return;
    }
    renderReviewEditor(null, formArea, me);
  }

  function renderReviewEditor(existingReview, formArea, me, { alreadyReviewed = false } = {}) {
    const form = document.createElement('form');
    form.className = 'review-form';
    const currentRating = existingReview ? Number(existingReview.rating) : 0;
    const starsMarkup = Array.from({ length: 5 }, (_, index) => {
      const rating = index + 1;
      const selected = rating <= currentRating;
      return `<button class="review-rating-star${selected ? ' selected' : ''}" type="button" role="radio" aria-checked="${rating === currentRating}" aria-label="${rating} sao" data-rating="${rating}" ${alreadyReviewed ? 'disabled' : ''}>★</button>`;
    }).join('');
    form.innerHTML = `<h3>${existingReview ? 'Chỉnh sửa đánh giá của bạn' : 'Viết đánh giá'}</h3>${alreadyReviewed ? '<p class="form-status">Bạn đã đánh giá hoạt động này. Hãy dùng nút “Sửa” trên đánh giá hiện có để cập nhật.</p>' : ''}<div class="review-rating-control"><span style="font-size:13px;font-weight:600;">Đánh giá</span><div class="review-rating-stars" role="radiogroup" aria-label="Chọn số sao">${starsMarkup}</div><span class="review-rating-value">${currentRating ? `${currentRating} sao` : 'Chưa chọn'}</span><input class="new-rating" type="hidden" value="${currentRating}"></div><label>Nội dung<textarea class="new-review" rows="3" maxlength="3000" ${alreadyReviewed ? 'disabled' : ''}>${api.escapeHTML(existingReview?.content || '')}</textarea></label><label>Ảnh/video (có thể chọn nhiều)<input class="new-review-media" type="file" accept="image/*,video/*" multiple ${alreadyReviewed ? 'disabled' : ''}></label><div class="review-media-preview" aria-live="polite"></div><div><button class="btn btn-primary" type="submit" ${alreadyReviewed ? 'disabled' : ''}>${existingReview ? 'Lưu thay đổi' : 'Gửi đánh giá'}</button>${existingReview ? '<button class="btn btn-secondary review-form-cancel" type="button">Hủy sửa</button>' : ''}</div><p class="form-status review-status"></p>`;
    formArea.replaceChildren(form);
    const uploadInput = form.querySelector('.new-review-media');
    const preview = form.querySelector('.review-media-preview');
    let previewUrls = [];
    // Cùng giới hạn với backend (supabase_storage.py): ảnh JPG/PNG/WEBP/GIF ≤ 5MB, video MP4/WEBM/MOV ≤ 25MB.
    const mediaProblem = file => {
      const isVideo = ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type);
      if (!isVideo && !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
        return `"${file.name}" không đúng định dạng. Chỉ nhận ảnh JPG, PNG, WEBP, GIF hoặc video MP4, WEBM, MOV.`;
      }
      const limit = isVideo ? 25 : 5;
      return file.size > limit * 1024 * 1024 ? `"${file.name}" lớn hơn ${limit}MB.` : '';
    };
    const filesProblem = () => [...uploadInput.files].map(mediaProblem).find(Boolean) || '';
    uploadInput.addEventListener('change', () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      previewUrls = [];
      preview.replaceChildren();
      const problem = filesProblem();
      form.querySelector('.review-status').textContent = problem;
      if (problem) {
        uploadInput.value = '';
        F2D.toast(problem, 'error');
        return;
      }
      for (const file of uploadInput.files) {
        const url = URL.createObjectURL(file);
        previewUrls.push(url);
        const item = document.createElement('div');
        item.className = 'review-media-preview-item';
        if (file.type.startsWith('video/')) {
          const video = document.createElement('video');
          video.src = url;
          video.muted = true;
          video.preload = 'metadata';
          item.append(video);
        } else {
          const image = document.createElement('img');
          image.src = url;
          image.alt = `Ảnh xem trước: ${file.name}`;
          item.append(image);
        }
        preview.append(item);
      }
    });
    const stars = [...form.querySelectorAll('.review-rating-star')];
    const updateRating = rating => {
      form.querySelector('.new-rating').value = String(rating);
      form.querySelector('.review-rating-value').textContent = `${rating} sao`;
      stars.forEach((star, index) => {
        const selected = index < rating;
        star.classList.toggle('selected', selected);
        star.setAttribute('aria-checked', String(Number(star.dataset.rating) === rating));
      });
    };
    stars.forEach(star => {
      star.addEventListener('click', () => updateRating(Number(star.dataset.rating)));
      star.addEventListener('mouseenter', () => {
        stars.forEach((item, index) => item.classList.toggle('preview', index < Number(star.dataset.rating)));
      });
    });
    form.querySelector('.review-rating-stars').addEventListener('mouseleave', () => stars.forEach(star => star.classList.remove('preview')));
    form.querySelector('.review-form-cancel')?.addEventListener('click', () => formArea.remove());
    if (alreadyReviewed) return;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const rating = Number(form.querySelector('.new-rating').value);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        form.querySelector('.review-status').textContent = 'Vui lòng chọn số sao trước khi gửi đánh giá.';
        return;
      }
      const button = form.querySelector('button[type=submit]'); const status = form.querySelector('.review-status');
      // File sai định dạng/quá dung lượng: báo ngay, không lưu đánh giá.
      const problem = filesProblem();
      if (problem) { status.textContent = problem; return; }
      button.disabled = true; status.textContent = 'Đang gửi đánh giá…';
      let created = null;
      try {
        const payload = { rating, content: form.querySelector('.new-review').value.trim() || null };
        const review = existingReview
          ? await api.request(`/reviews/${encodeURIComponent(existingReview.review_id)}`, { method: 'PATCH', body: payload })
          : await api.request('/reviews', { method: 'POST', body: { activity_id: id, ...payload } });
        if (!existingReview) created = review;
        for (const file of [...uploadInput.files]) {
          const body = new FormData(); body.append('file', file);
          await api.request(`/reviews/${encodeURIComponent(review.review_id)}/media/upload`, { method: 'POST', body });
        }
        location.reload();
      } catch (error) {
        // Đánh giá mới mà tải ảnh/video lỗi: xóa đánh giá vừa tạo để không lưu đánh giá thiếu media.
        if (created) await api.request(`/reviews/${encodeURIComponent(created.review_id)}`, { method: 'DELETE', toast: false }).catch(() => {});
        status.textContent = created ? `Chưa lưu đánh giá vì tải ảnh/video lỗi: ${error.message}` : error.message;
        button.disabled = false;
      }
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
    text('activityDescription', activity.description || 'Chưa có mô tả.');
    text('activityLocation', activity.address || '');
    text('sideActivityPrice', api.priceLabel(activity.price_text, activity.price)); text('sideActivityMeta', api.hours(activity.time_open, activity.time_close));
    text('reviewsTitle', `Đánh giá (${reviews.length})`);
    document.getElementById('activityTags').innerHTML = matched.map(item => `<span class="tag">${api.escapeHTML(item.name)}</span>`).join('');
    renderGallery(activity); renderReviews(reviews, me); buildReviewForm(reviews.find(review => isOwnReview(review, me)), me);
    if (activity.google_maps_url) {
      const directionsLink = document.getElementById('activityDirectionsLink');
      directionsLink.href = activity.google_maps_url;
      document.getElementById('activityDirectionsRow').hidden = false;
    }
    document.getElementById('detailSearchForm').addEventListener('submit', event => {
      event.preventDefault(); const keyword = document.getElementById('detailSearchInput').value.trim();
      location.href = `search.html${keyword ? `?q=${encodeURIComponent(keyword)}` : ''}`;
    });
    document.getElementById('activityReviews').addEventListener('click', async event => {
      const card = event.target.closest('[data-review-id]'); if (!card) return;
      try {
        const mediaButton = event.target.closest('.delete-review-media');
        if (mediaButton) {
          if (await F2D.ask({ title: 'Xóa ảnh/video?', text: 'Ảnh/video này sẽ bị xóa vĩnh viễn khỏi đánh giá.', ok: 'Xóa', danger: true, done: 'Đã xóa ảnh/video.',
            run: () => api.request(`/reviews/media/${encodeURIComponent(mediaButton.dataset.mediaId)}`, { method: 'DELETE', toast: false }) })) location.reload();
          return;
        }
        if (event.target.closest('.delete-review')) {
          if (await F2D.ask({ title: 'Xóa đánh giá?', text: 'Đánh giá cùng ảnh/video đính kèm sẽ bị xóa vĩnh viễn.', ok: 'Xóa', danger: true, done: 'Đã xóa đánh giá.',
            run: () => api.request(`/reviews/${encodeURIComponent(card.dataset.reviewId)}`, { method: 'DELETE', toast: false }) })) location.reload();
        }
        if (event.target.closest('.edit-review')) {
          if (card.querySelector('.review-inline-form')) return;
          const formArea = document.createElement('div');
          formArea.className = 'review-inline-form';
          card.append(formArea);
          renderReviewEditor({
            review_id: card.dataset.reviewId,
            rating: Number(card.dataset.rating),
            content: card.dataset.content,
          }, formArea, me);
          formArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } catch (error) { F2D.toast(error.message, 'error'); }
    });
    document.title = `FREE2DO | ${activity.name}`;
    const favorite = document.getElementById('favoriteButton'); const label = document.getElementById('favoriteLabel'); let saved = false;
    if (me?.account_type === 'user') saved = bookmarks.some(item => item.activity_id === id);
    const updateFavorite = () => { label.textContent = saved ? 'Đã yêu thích' : 'Lưu vào yêu thích'; favorite.classList.toggle('is-favorite', saved); }; updateFavorite();
    favorite.onclick = async () => { if (!me) return location.href = '../log-in.html'; favorite.disabled = true; try { await api.request(`/bookmarks/${encodeURIComponent(id)}`, { method: saved ? 'DELETE' : 'POST' }); saved = !saved; updateFavorite(); } catch (error) { F2D.toast(error.message, 'error'); } finally { favorite.disabled = false; } };
    // Báo cáo 2 bước trong popup chung: lý do, rồi mô tả (bắt buộc, backend cũng kiểm tra).
    document.getElementById('reportActivity').onclick = async event => {
      event.preventDefault();
      if (!me) return location.href = '../log-in.html';
      const reason = await F2D.ask({ title: 'Báo cáo hoạt động', text: 'Bước 1/2: lý do báo cáo.', ok: 'Tiếp tục',
        input: { label: 'Lý do', placeholder: 'Ví dụ: Sai giờ mở cửa, địa chỉ không đúng...', maxLength: 200, requiredMessage: 'Vui lòng nhập lý do báo cáo.' } });
      if (!reason) return;
      await F2D.ask({ title: 'Báo cáo hoạt động', text: `Bước 2/2: mô tả chi tiết. Lý do: ${reason}`, ok: 'Gửi báo cáo', done: 'Đã gửi báo cáo. Cảm ơn bạn!',
        input: { label: 'Mô tả', placeholder: 'Mô tả cụ thể điều bạn thấy chưa đúng', multiline: true, requiredMessage: 'Vui lòng nhập mô tả báo cáo.' },
        run: description => api.request('/reports', { method: 'POST', body: { activity_id: id, reason, description }, toast: false }) });
    };
  }
  run().catch(error => { document.querySelector('.wrap').innerHTML = `<div class="card" style="padding:24px">${api.escapeHTML(error.message)}</div>`; });
})();
