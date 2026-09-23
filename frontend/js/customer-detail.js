(function () {
  'use strict';
  const api = window.CustomerAPI;
  const id = new URLSearchParams(location.search).get('id');
  const text = (key, value) => { document.getElementById(key).textContent = value; };
  async function run() {
    if (!id) throw new Error('Thiếu mã hoạt động.');
    const [activity, categories, reviews] = await Promise.all([
      api.request(`/activities/${encodeURIComponent(id)}`), api.request('/categories'),
      api.request(`/activities/${encodeURIComponent(id)}/reviews`)
    ]);
    const matched = categories.filter(c => activity.category_ids.includes(c.category_id));
    text('activityName', activity.name);
    text('galleryIcon', '🗓️');
    text('activityMeta', activity.address + (activity.avg_rating == null ? '' : ` · ★ ${activity.avg_rating} (${activity.review_count} đánh giá)`));
    text('activityPrice', api.price(activity.price));
    text('activityDuration', 'Chưa có dữ liệu');
    text('activityHours', api.hours(activity.time_open, activity.time_close));
    text('activityDistance', 'Chưa có vị trí của bạn');
    text('activityDescription', activity.description || 'Chưa có mô tả.');
    text('activityMapPin', activity.name);
    text('sideActivityPrice', api.price(activity.price));
    text('sideActivityMeta', api.hours(activity.time_open, activity.time_close));
    text('reviewsTitle', `Đánh giá (${reviews.length})`);
    document.getElementById('activityTags').innerHTML = matched.map(c => `<span class="tag">${api.escapeHTML(c.name)}</span>`).join('');
    document.getElementById('activityReviews').innerHTML = reviews.length ? reviews.map(r => `<div class="review-card"><div class="review-top"><div class="review-name">Khách hàng</div><div class="review-stars">${'★'.repeat(Math.max(0, Math.min(5, r.rating)))}</div><div class="review-date">${api.escapeHTML(new Date(r.created_at).toLocaleDateString('vi-VN'))}</div></div><div class="review-text">${api.escapeHTML(r.content || '')}</div></div>`).join('') : '<p>Chưa có đánh giá.</p>';
    document.title = `FREE2DO — ${activity.name}`;
    const favorite = document.getElementById('favoriteButton');
    const label = document.getElementById('favoriteLabel');
    let saved = false;
    if (localStorage.getItem('token')) {
      try { const list = await api.request('/bookmarks/me'); saved = list.some(x => x.activity_id === id); }
      catch (error) { favorite.title = error.message; }
    }
    function update() { label.textContent = saved ? 'Đã yêu thích' : 'Lưu vào yêu thích'; favorite.classList.toggle('is-favorite', saved); }
    update();
    favorite.onclick = async () => {
      if (!localStorage.getItem('token')) return location.href = '../log-in.html';
      favorite.disabled = true;
      try { await api.request(`/bookmarks/${encodeURIComponent(id)}`, { method: saved ? 'DELETE' : 'POST' }); saved = !saved; update(); }
      catch (error) { alert(error.message); } finally { favorite.disabled = false; }
    };
    const report = document.getElementById('reportActivity');
    report.onclick = async e => {
      e.preventDefault();
      if (!localStorage.getItem('token')) return location.href = '../log-in.html';
      const reason = prompt('Lý do báo cáo hoạt động:');
      if (!reason?.trim()) return;
      try { await api.request('/reports', { method: 'POST', body: JSON.stringify({ activity_id: id, reason: reason.trim() }) }); alert('Đã gửi báo cáo.'); }
      catch (error) { alert(error.message); }
    };
    const reviewBox = document.createElement('div');
    reviewBox.innerHTML = '<h3>Viết đánh giá</h3><label>Điểm (1–5) <input id="newRating" type="number" min="1" max="5" value="5"></label> <input id="newReview" placeholder="Nội dung đánh giá"> <button class="btn btn-primary" id="postReview" type="button">Gửi đánh giá</button>';
    document.getElementById('activityReviews').after(reviewBox);
    document.getElementById('postReview').onclick = async () => {
      if (!localStorage.getItem('token')) return location.href = '../log-in.html';
      const rating = Number(document.getElementById('newRating').value);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return alert('Điểm phải từ 1 đến 5.');
      try { await api.request('/reviews', { method: 'POST', body: JSON.stringify({ activity_id: id, rating, content: document.getElementById('newReview').value.trim() }) }); location.reload(); }
      catch (error) { alert(error.message); }
    };
  }
  run().catch(error => { document.querySelector('.wrap').innerHTML = `<div class="card" style="padding:24px">${api.escapeHTML(error.message)}</div>`; });
})();
