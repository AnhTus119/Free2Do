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
    if (!id) throw new Error('Thiếu mã doanh nghiệp. Hãy mở từ danh sách doanh nghiệp.');
    const entry = data.businesses.find(b => b.id === id);
    if (!entry) throw new Error('Không tìm thấy doanh nghiệp.');
    const pending = Boolean(entry.requestId);
    const profile = pending ? await window.AdminAuth.authFetch(`/operator/business-requests/${encodeURIComponent(id)}`)
      : await window.AdminAuth.authFetch(`/operator/business-profiles/${encodeURIComponent(id)}`);
    const user = pending ? null : await window.AdminAuth.authFetch(`/operator/users/${encodeURIComponent(id)}`);
    const activities = data.activities.filter(a => a.businessId === (pending ? profile.user_id : id));
    const name = profile.business_name;
    document.title = `FREE2DO Admin — ${name}`;
    document.querySelector('.profile-logo').textContent = name.charAt(0).toUpperCase();
    document.querySelector('.profile-name').textContent = name;
    document.querySelector('.profile-meta').textContent = `${pending ? 'Mã yêu cầu' : 'Mã Doanh nghiệp'}: ${id} · ${profile.business_address}`;
    document.querySelector('.profile-head > .badge').className = `badge ${pending ? 'pending' : user.status === 'active' ? 'active' : 'locked'}`;
    document.querySelector('.profile-head > .badge').textContent = pending ? 'Chờ duyệt' : data.statusLabels[user.status] || user.status;
    const cards = document.querySelectorAll('.profile-grid .card');
    rows(cards[0], { 'Tên Doanh nghiệp': name, 'Số điện thoại': profile.phone || 'Chưa cung cấp',
      'Admin xác minh (verified_by)': profile.verified_by || 'Chưa xác minh', 'Mô tả': profile.description || 'Chưa có mô tả' });
    rows(cards[1], { 'Tổng Hoạt động': String(activities.length),
      'Đang hoạt động': String(activities.filter(a => a.status === 'active').length),
      'Chờ duyệt': String(activities.filter(a => a.status === 'pending').length) });
    document.getElementById('businessActivityTitle').textContent = `Hoạt động của Doanh nghiệp này (${activities.length})`;
    document.getElementById('businessActivityRows').innerHTML = activities.length ? activities.map(a => `<tr>
      <td>${escape(a.id)}</td><td>${escape(a.address)}</td><td>${escape(a.hours)}</td>
      <td><span class="badge ${escape(a.status)}">${escape(data.statusLabels[a.status] || a.status)}</span></td>
      <td><a class="row-btn" href="activity-profile.html?id=${encodeURIComponent(a.id)}">Xem</a></td></tr>`).join('')
      : '<tr><td colspan="5" style="text-align:center;">Chưa có hoạt động.</td></tr>';
    const edit = document.querySelector('.profile-head > button.qa-btn');
    edit.hidden = pending;
    edit.onclick = async () => {
      const business_name = prompt('Tên doanh nghiệp:', profile.business_name);
      if (business_name === null) return;
      const business_address = prompt('Địa chỉ:', profile.business_address);
      if (business_address === null) return;
      const description = prompt('Mô tả:', profile.description || '');
      if (description === null) return;
      if (!business_name.trim() || !business_address.trim()) return alert('Tên và địa chỉ không được để trống.');
      edit.disabled = true;
      try { await window.AdminAuth.authFetch(`/operator/business-profiles/${encodeURIComponent(id)}`, {
        method: 'PATCH', body: JSON.stringify({ business_name: business_name.trim(), business_address: business_address.trim(), description: description.trim() }) }); await render(); }
      catch (error) { alert(error.message); } finally { edit.disabled = false; }
    };
    const button = document.getElementById('toggleBusinessStatus');
    button.textContent = pending ? '✅ Duyệt doanh nghiệp' : user.status === 'active' ? '🔒 Khóa Doanh nghiệp' : '🔓 Mở khóa Doanh nghiệp';
    button.onclick = async () => {
      button.disabled = true;
      try {
        await data.setStatus('business', id, pending ? 'active' : user.status === 'active' ? 'locked' : 'active');
        if (pending) location.href = `business-profile.html?id=${encodeURIComponent(profile.user_id)}`;
        else await render();
      } catch (error) { alert(error.message); } finally { button.disabled = false; }
    };
    let reject = document.getElementById('rejectBusinessRequest');
    if (!reject && pending) { reject = document.createElement('button'); reject.id = 'rejectBusinessRequest'; reject.className = 'qa-btn'; button.after(reject); }
    if (reject) {
      reject.hidden = !pending; reject.textContent = '✕ Từ chối yêu cầu';
      reject.onclick = async () => {
        reject.disabled = true;
        try { await data.rejectBusiness(id); location.href = 'businesses.html'; }
        catch (error) { alert(error.message); reject.disabled = false; }
      };
    }
  }
  render().catch(error => { document.querySelector('.content').innerHTML = `<div class="card" style="padding:24px">${escape(error.message)}</div>`; });
})();
