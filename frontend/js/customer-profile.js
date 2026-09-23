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
    if (!id) throw new Error('Thiếu mã khách hàng. Hãy mở từ danh sách khách hàng.');
    const customer = await window.AdminAuth.authFetch(`/operator/users/${encodeURIComponent(id)}`);
    if (customer.role_name !== 'customer') throw new Error('Tài khoản này không phải khách hàng.');
    document.title = `FREE2DO Admin — ${customer.name}`;
    document.querySelector('.profile-logo').textContent = customer.name.charAt(0).toUpperCase();
    document.querySelector('.profile-name').textContent = customer.name;
    document.querySelector('.profile-meta').textContent = `${customer.user_id} · ${customer.email}`;
    document.querySelector('.profile-head > .badge').className = `badge ${customer.status === 'active' ? 'active' : 'locked'}`;
    document.querySelector('.profile-head > .badge').textContent = data.statusLabels[customer.status] || customer.status;
    const cards = document.querySelectorAll('.profile-grid .card');
    rows(cards[0], { 'Họ và tên': customer.name, 'Email': customer.email,
      'Số điện thoại': customer.phone || 'Chưa cung cấp', 'Trạng thái tài khoản': data.statusLabels[customer.status] || customer.status });
    rows(cards[1], {});
    document.getElementById('customerActivityRows').innerHTML = '<tr><td colspan="5" style="text-align:center;">Backend chưa có API lịch sử tham gia hoạt động của khách hàng.</td></tr>';
    const edit = document.querySelector('.profile-head > button.qa-btn');
    edit.onclick = async () => {
      const name = prompt('Họ và tên:', customer.name);
      if (name === null) return;
      const phone = prompt('Số điện thoại:', customer.phone || '');
      if (phone === null) return;
      if (!name.trim()) return alert('Tên không được để trống.');
      edit.disabled = true;
      try { await window.AdminAuth.authFetch(`/operator/users/${encodeURIComponent(id)}`, {
        method: 'PATCH', body: JSON.stringify({ name: name.trim(), phone: phone.trim() || null }) }); await render(); }
      catch (error) { alert(error.message); } finally { edit.disabled = false; }
    };
    const button = document.getElementById('toggleCustomerStatus');
    button.textContent = customer.status === 'active' ? '🔒 Khóa tài khoản' : '🔓 Mở khóa tài khoản';
    button.onclick = async () => {
      button.disabled = true;
      try { await data.setStatus('customer', id, customer.status === 'active' ? 'locked' : 'active'); await render(); }
      catch (error) { alert(error.message); } finally { button.disabled = false; }
    };
  }
  render().catch(error => { document.querySelector('.content').innerHTML = `<div class="card" style="padding:24px">${escape(error.message)}</div>`; });
})();
