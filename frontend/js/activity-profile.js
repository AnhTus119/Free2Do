(function () {
  'use strict';
  const data = window.AdminData;
  const id = new URLSearchParams(location.search).get('id');
  const escape = data.escapeHTML;
  function rows(card, values) {
    card.querySelectorAll('.info-row').forEach(row => {
      const label = row.querySelector('.info-label').textContent.trim();
      row.querySelector('.info-value').textContent = values[label] ?? 'API chưa cung cấp';
    });
  }
  async function render() {
    await data.load();
    if (!id) throw new Error('Thiếu mã hoạt động. Hãy mở từ danh sách hoạt động.');
    const activity = await window.AdminAuth.authFetch(`/operator/activities/${encodeURIComponent(id)}`);
    const listItem = data.activities.find(item => item.id === id);
    const business = data.businesses.find(b => b.userId === activity.business_id && !b.requestId);
    document.title = `FREE2DO Admin — ${activity.name}`;
    document.querySelector('.profile-logo').textContent = '🗓️';
    document.querySelector('.profile-name').textContent = activity.name;
    document.querySelector('.profile-meta').textContent = `Mã Hoạt động: ${id} · Doanh nghiệp: ${listItem?.businessName || business?.name || activity.business_id}`;
    document.querySelector('.profile-head > .badge').className = `badge ${activity.status}`;
    document.querySelector('.profile-head > .badge').textContent = data.statusLabels[activity.status] || activity.status;
    const cards = document.querySelectorAll('.profile-grid .card');
    rows(cards[0], {
      'Tên Hoạt động': activity.name, 'Doanh nghiệp': listItem?.businessName || business?.name || activity.business_id,
      'Mô tả': activity.description || 'Chưa có mô tả', 'Ngân sách': data.formatPrice(activity.price),
      'Địa chỉ': activity.address, 'Vị trí (lat, long)': `${activity.latitude}, ${activity.longitude}`,
      'Giờ hoạt động': data.formatHours(activity.time_open, activity.time_close)
    });
    rows(cards[1], { 'Đánh giá trung bình': activity.avg_rating == null ? 'Chưa có đánh giá' : `${activity.avg_rating} ★`,
      'Ngày tạo': data.date(activity.created_at) });
    document.getElementById('activityCustomerRows').innerHTML = '<tr><td colspan="4" style="text-align:center;">Backend chưa có API danh sách người tham gia hoạt động.</td></tr>';
    const edit = document.querySelector('.profile-head > button.qa-btn');
    edit.onclick = async () => {
      const name = prompt('Tên hoạt động:', activity.name);
      if (name === null) return;
      const address = prompt('Địa chỉ:', activity.address);
      if (address === null) return;
      const priceInput = prompt('Giá (VNĐ):', activity.price ?? '');
      if (priceInput === null) return;
      const price = priceInput.trim() === '' ? null : Number(priceInput);
      if (!name.trim() || !address.trim() || (price !== null && (!Number.isFinite(price) || price < 0))) return alert('Thông tin không hợp lệ.');
      edit.disabled = true;
      try { await window.AdminAuth.authFetch(`/operator/activities/${encodeURIComponent(id)}`, {
        method: 'PATCH', body: JSON.stringify({ name: name.trim(), address: address.trim(), price }) }); await render(); }
      catch (error) { alert(error.message); } finally { edit.disabled = false; }
    };
    const toggle = document.getElementById('toggleActivityVisibility');
    const approve = document.getElementById('approveActivity');
    toggle.hidden = !['active', 'pending', 'hidden'].includes(activity.status);
    toggle.textContent = activity.status === 'hidden' ? '👁️ Hiện Hoạt động' : '🙈 Ẩn Hoạt động';
    approve.hidden = activity.status !== 'pending';
    async function change(status, button) {
      button.disabled = true;
      try { await data.setStatus('activity', id, status); await render(); }
      catch (error) { alert(error.message); } finally { button.disabled = false; }
    }
    toggle.onclick = () => change(activity.status === 'hidden' ? 'active' : 'hidden', toggle);
    approve.onclick = () => change('active', approve);
  }
  render().catch(error => { document.querySelector('.content').innerHTML = `<div class="card" style="padding:24px">${escape(error.message)}</div>`; });
})();
