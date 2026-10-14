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
      : `<img src="${url}" alt="Media đánh giá" loading="lazy" data-review-image="${url}">`;
    return `<span class="review-media-item">${content}${own && item.media_id ? `<button class="delete-review-media" data-media-id="${api.escapeHTML(item.media_id)}" type="button">Xóa</button>` : ''}</span>`;
  };
  function renderGallery(activity) {
    const gallery = document.getElementById('activityGallery');
    const businessPhotos = window.Free2DoBusinessMedia?.gallery(activity) || [];
    const media = [...(activity.media || []), ...businessPhotos].sort((a, b) => (a.media_kind === 'cover' ? -1 : 0) - (b.media_kind === 'cover' ? -1 : 0));
    const visibleMedia = media.slice(0, 5);
    gallery.classList.remove('activity-photo-grid--1', 'activity-photo-grid--2', 'activity-photo-grid--3', 'activity-photo-grid--4', 'activity-photo-grid--5');
    gallery.classList.add(`activity-photo-grid--${visibleMedia.length}`);
    let lightbox;
    const openLightbox = index => {
      if (!media.length) return;
      if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000e;display:flex;align-items:center;justify-content:center;color:white;';
        lightbox.innerHTML = '<button data-prev aria-label="Ảnh trước" style="position:absolute;left:20px;font-size:32px">‹</button><button data-close aria-label="Đóng" style="position:absolute;right:20px;top:16px;font-size:30px">×</button><div data-image style="max-width:88vw;max-height:86vh"></div><button data-next aria-label="Ảnh tiếp" style="position:absolute;right:20px;font-size:32px">›</button><span data-count style="position:absolute;bottom:16px"></span>';
        lightbox.addEventListener('click', event => {
          if (event.target === lightbox || event.target.closest('[data-close]')) { lightbox.remove(); lightbox = null; }
          else if (event.target.closest('[data-prev]')) show(index - 1);
          else if (event.target.closest('[data-next]')) show(index + 1);
        });
        document.body.append(lightbox);
      }
      const show = next => {
        index = (next + media.length) % media.length;
        const item = media[index];
        const url = api.escapeHTML(item.media_url);
        lightbox.querySelector('[data-image]').innerHTML = item.media_type === 'video'
          ? `<video src="${url}" controls autoplay style="max-width:88vw;max-height:86vh"></video>`
          : `<img src="${url}" alt="${api.escapeHTML(activity.name)}" style="max-width:88vw;max-height:86vh;object-fit:contain;border-radius:14px">`;
        lightbox.querySelector('[data-count]').textContent = `${index + 1} / ${media.length}`;
      };
      show(index);
    };
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
      if (button.dataset.galleryIndex != null) openLightbox(Number(button.dataset.galleryIndex));
    };
  }
  function renderReviews(reviews, me) {
    document.getElementById('activityReviews').innerHTML = reviews.length ? reviews.map(review => {
      const own = isOwnReview(review, me);
      const media = (review.media || []).map(item => mediaHTML(item, own)).join('');
      const replyMedia = (review.reply?.media || []).map(item => mediaHTML(item)).join('');
      const reply = review.reply ? `<div class="business-reply"><b>Phản hồi từ doanh nghiệp</b><p>${api.escapeHTML(review.reply.content)}</p><div class="review-media-list">${replyMedia}</div></div>` : '';
      return `<article class="review-card" data-review-id="${api.escapeHTML(review.review_id)}" data-rating="${review.rating}" data-content="${api.escapeHTML(review.content || '')}"><div class="review-top"><div class="review-name">${api.escapeHTML(review.reviewer_name)}</div><div class="review-stars">${'★'.repeat(Math.max(0, Math.min(5, review.rating)))}</div><div class="review-date">${api.escapeHTML(new Date(review.created_at).toLocaleDateString('vi-VN'))}</div></div><div class="review-text">${api.escapeHTML(review.content || '')}</div><div class="review-media-list">${media}</div>${reply}${own ? '<div class="review-actions"><button class="btn btn-secondary edit-review" type="button">Sửa</button><button class="btn btn-ghost delete-review" type="button">Xóa</button></div>' : ''}</article>`;
    }).join('') : '<p>Chưa có đánh giá.</p>';
  }
  function setupReviewImageLightbox() {
    const lightbox = document.getElementById('reviewImageLightbox');
    const image = document.getElementById('reviewImageLarge');
    const closeButton = document.getElementById('closeReviewImage');
    const previousButton = document.getElementById('previousReviewImage');
    const nextButton = document.getElementById('nextReviewImage');
    const count = document.getElementById('reviewImageCount');
    let reviewImages = [];
    let currentIndex = 0;
    const showImage = index => {
      if (!reviewImages.length) return;
      currentIndex = (index + reviewImages.length) % reviewImages.length;
      const thumbnail = reviewImages[currentIndex];
      image.src = thumbnail.dataset.reviewImage;
      image.alt = thumbnail.alt || 'Ảnh đánh giá phóng to';
      count.textContent = `${currentIndex + 1} / ${reviewImages.length}`;
      previousButton.hidden = reviewImages.length < 2;
      nextButton.hidden = reviewImages.length < 2;
    };
    const close = () => {
      lightbox.classList.remove('open');
      image.removeAttribute('src');
      reviewImages = [];
      count.textContent = '';
      document.body.style.overflow = '';
    };
    document.getElementById('activityReviews').addEventListener('click', event => {
      const thumbnail = event.target.closest('[data-review-image]');
      const reviewCard = thumbnail?.closest('[data-review-id]');
      if (!thumbnail || !reviewCard) return;
      reviewImages = [...reviewCard.querySelectorAll('[data-review-image]')];
      currentIndex = reviewImages.indexOf(thumbnail);
      showImage(currentIndex);
      lightbox.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
    closeButton.addEventListener('click', close);
    previousButton.addEventListener('click', () => showImage(currentIndex - 1));
    nextButton.addEventListener('click', () => showImage(currentIndex + 1));
    lightbox.addEventListener('click', event => {
      if (event.target === lightbox) close();
    });
    document.addEventListener('keydown', event => {
      if (!lightbox.classList.contains('open')) return;
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft') showImage(currentIndex - 1);
      if (event.key === 'ArrowRight') showImage(currentIndex + 1);
    });
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
    uploadInput.addEventListener('change', () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      previewUrls = [];
      preview.replaceChildren();
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
      button.disabled = true; status.textContent = 'Đang gửi đánh giá…';
      try {
        const payload = { rating, content: form.querySelector('.new-review').value.trim() || null };
        const review = existingReview
          ? await api.request(`/reviews/${encodeURIComponent(existingReview.review_id)}`, { method: 'PATCH', body: payload })
          : await api.request('/reviews', { method: 'POST', body: { activity_id: id, ...payload } });
        for (const file of [...uploadInput.files]) {
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
    text('activityDescription', activity.description || 'Chưa có mô tả.');
    text('activityLocation', activity.address || '');
    text('sideActivityPrice', api.priceLabel(activity.price_text, activity.price)); text('sideActivityMeta', api.hours(activity.time_open, activity.time_close));
    text('reviewsTitle', `Đánh giá (${reviews.length})`);
    document.getElementById('activityTags').innerHTML = matched.map(item => `<span class="tag">${api.escapeHTML(item.name)}</span>`).join('');
    renderGallery(activity); renderReviews(reviews, me); setupReviewImageLightbox(); buildReviewForm(reviews.find(review => isOwnReview(review, me)), me);
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
        if (event.target.closest('.delete-review-media')) { if (!confirm('Xóa ảnh/video này khỏi đánh giá?')) return; await api.request(`/reviews/media/${encodeURIComponent(event.target.closest('.delete-review-media').dataset.mediaId)}`, { method: 'DELETE' }); location.reload(); return; }
        if (event.target.closest('.delete-review')) { if (confirm('Xóa đánh giá này?')) { await api.request(`/reviews/${encodeURIComponent(card.dataset.reviewId)}`, { method: 'DELETE' }); location.reload(); } }
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
