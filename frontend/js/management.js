(function () {
  'use strict';
  const auth = window.AdminAuth;
  const esc = auth.escapeHTML;
  async function loadCategories() {
    const rows = await auth.authFetch('/categories');
    document.getElementById('categories').innerHTML = rows.map(item => `<div class="item" data-category="${esc(item.category_id)}"><b>${esc(item.name)}</b> <button data-action="rename">Đổi tên</button> <button class="danger" data-action="delete">Xóa</button></div>`).join('') || '<p>Chưa có danh mục.</p>';
  }
  async function loadReports() {
    const rows = await auth.authFetch('/operator/reports?status=pending');
    document.getElementById('reports').innerHTML = rows.map(item => `<div class="item" data-report="${esc(item.report_id)}"><b>${esc(item.reason)}</b><p>${esc(item.description || '')}</p><span class="muted">Activity: ${esc(item.activity_id)}</span> <button data-action="dismiss-report">Bỏ qua</button> <button class="danger" data-action="hide-activity">Ẩn hoạt động</button></div>`).join('') || '<p>Không có báo cáo chờ xử lý.</p>';
  }
  async function loadComplaints() {
    const rows = await auth.authFetch('/operator/complaints?status=pending');
    document.getElementById('complaints').innerHTML = rows.map(item => `<div class="item" data-complaint="${esc(item.complaint_id)}"><b>${esc(item.reason)}</b><p>${esc(item.description || '')}</p><span class="muted">Review: ${esc(item.review_id)}</span> <button data-action="dismiss-complaint">Bỏ qua</button> <button class="danger" data-action="delete-review">Xóa đánh giá</button></div>`).join('') || '<p>Không có khiếu nại chờ xử lý.</p>';
  }
  async function loadOperators(me) {
    if (me.level !== 'admin') { document.getElementById('operatorForm').remove(); document.getElementById('operators').textContent = 'Chỉ admin cấp cao được quản lý tài khoản Operator.'; return; }
    const rows = await auth.authFetch('/operator/operators');
    document.getElementById('operators').innerHTML = rows.map(item => `<div class="item" data-operator="${esc(item.operator_id)}"><b>${esc(item.name)}</b> · ${esc(item.email)} · ${esc(item.level)} · ${esc(item.status)}${item.operator_id === me.operator_id ? '' : ' <button data-action="toggle-operator">' + (item.status === 'active' ? 'Vô hiệu hóa' : 'Kích hoạt') + '</button>'}</div>`).join('');
  }
  document.getElementById('categoryForm').onsubmit = async event => { event.preventDefault(); try { await auth.authFetch('/operator/categories', { method: 'POST', body: JSON.stringify({ name: document.getElementById('categoryName').value.trim() }) }); event.target.reset(); await loadCategories(); } catch (error) { alert(error.message); } };
  document.getElementById('categories').onclick = async event => { const row = event.target.closest('[data-category]'); if (!row) return; try { if (event.target.dataset.action === 'delete' && confirm('Xóa danh mục này?')) await auth.authFetch(`/operator/categories/${encodeURIComponent(row.dataset.category)}`, { method: 'DELETE' }); if (event.target.dataset.action === 'rename') { const name = prompt('Tên mới:'); if (!name?.trim()) return; await auth.authFetch(`/operator/categories/${encodeURIComponent(row.dataset.category)}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) }); } await loadCategories(); } catch (error) { alert(error.message); } };
  document.getElementById('reports').onclick = async event => { const row = event.target.closest('[data-report]'); if (!row || !event.target.dataset.action) return; const action = event.target.dataset.action === 'hide-activity' ? 'hide_activity' : 'dismiss'; try { await auth.authFetch(`/operator/reports/${encodeURIComponent(row.dataset.report)}/resolve`, { method: 'PATCH', body: JSON.stringify({ action }) }); await loadReports(); } catch (error) { alert(error.message); } };
  document.getElementById('complaints').onclick = async event => { const row = event.target.closest('[data-complaint]'); if (!row || !event.target.dataset.action) return; const action = event.target.dataset.action === 'delete-review' ? 'delete_review' : 'dismiss'; try { await auth.authFetch(`/operator/complaints/${encodeURIComponent(row.dataset.complaint)}/resolve`, { method: 'PATCH', body: JSON.stringify({ action }) }); await loadComplaints(); } catch (error) { alert(error.message); } };
  let currentMe;
  document.getElementById('operatorForm').onsubmit = async event => { event.preventDefault(); try { await auth.authFetch('/operator/operators', { method: 'POST', body: JSON.stringify({ email: document.getElementById('operatorEmail').value.trim(), name: document.getElementById('operatorName').value.trim(), password: document.getElementById('operatorPassword').value, level: document.getElementById('operatorLevel').value }) }); event.target.reset(); await loadOperators(currentMe); } catch (error) { alert(error.message); } };
  document.getElementById('operators').onclick = async event => { const row = event.target.closest('[data-operator]'); if (!row || event.target.dataset.action !== 'toggle-operator') return; const disabled = event.target.textContent.includes('Kích hoạt'); try { await auth.authFetch(`/operator/operators/${encodeURIComponent(row.dataset.operator)}`, { method: 'PATCH', body: JSON.stringify({ status: disabled ? 'active' : 'disabled' }) }); await loadOperators(currentMe); } catch (error) { alert(error.message); } };
  (async () => { currentMe = await auth.authFetch('/operator/me'); document.getElementById('operatorMe').textContent = `${currentMe.name} · ${currentMe.email} · ${currentMe.level}`; await Promise.all([loadCategories(), loadReports(), loadComplaints(), loadOperators(currentMe)]); })().catch(error => { document.querySelector('.content').textContent = error.message; });
})();
