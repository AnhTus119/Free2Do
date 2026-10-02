(function () {
  'use strict';
  const api = window.CustomerAPI;
  const form = document.getElementById('businessRequestForm');
  const status = document.getElementById('businessRequestStatus');
  function renderHistory(requests) {
    const labels = { pending: 'Đang chờ duyệt', approved: 'Đã duyệt', rejected: 'Đã từ chối' };
    const history = document.getElementById('requestHistory');
    history.innerHTML = requests.length
      ? `<h2>Lịch sử yêu cầu</h2>${requests.map(item => `<article class="history-card"><b>${api.escapeHTML(item.business_name)}</b><div class="activity-meta">${api.escapeHTML(labels[item.status] || item.status)} · ${api.escapeHTML(new Date(item.created_at).toLocaleString('vi-VN'))}</div><p>${api.escapeHTML(item.business_address)}</p>${item.description ? `<p>${api.escapeHTML(item.description)}</p>` : ''}${item.rejection_reason ? `<p style="color:#b42318">Lý do từ chối: ${api.escapeHTML(item.rejection_reason)}</p>` : ''}</article>`).join('')}`
      : '';
  }
  api.requireUser().then(async me => {
    document.getElementById('businessPhone').value = me.phone || '';
    const requests = await api.request('/business-requests/me');
    renderHistory(requests);
    if (requests.some(item => item.status === 'pending')) {
      form.querySelectorAll('input,textarea,button').forEach(element => { element.disabled = true; });
      status.textContent = 'Bạn đã có một yêu cầu đang chờ xét duyệt.';
    } else if (requests.some(item => item.status === 'approved')) {
      form.style.display = 'none';
      document.getElementById('success-view').style.display = 'block';
      document.querySelector('#success-view h2').textContent = 'Yêu cầu Business đã được duyệt.';
      document.querySelector('#success-view .badge').textContent = 'Đã duyệt';
    }
  }).catch(error => { status.textContent = error.message; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const payload = {
      business_name: document.getElementById('businessName').value.trim(),
      phone: document.getElementById('businessPhone').value.trim() || null,
      business_address: document.getElementById('businessAddress').value.trim() || null,
      description: document.getElementById('businessDescription').value.trim() || null,
    };
    const button = form.querySelector('button[type=submit]');
    button.disabled = true; status.textContent = 'Đang gửi yêu cầu…';
    try {
      const created = await api.request('/business-requests', { method: 'POST', body: payload });
      form.style.display = 'none'; document.getElementById('success-view').style.display = 'block';
      renderHistory([created]);
    } catch (error) { status.textContent = error.message; button.disabled = false; }
  });
})();
