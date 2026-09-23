(function () {
  'use strict';
  const api = window.CustomerAPI;
  api.requireUser().then(async () => {
    const requests = await api.request('/business-requests/me');
    const pending = requests.find(r => r.status === 'pending');
    if (pending) {
      document.getElementById('form-view').innerHTML = '<h2>Yêu cầu của bạn đang chờ duyệt</h2><p>Bạn sẽ được thông báo khi có kết quả.</p>';
    }
  }).catch(error => { alert(error.message); });
  window.submitForm = async function () {
    const fields = document.querySelectorAll('#form-view .field');
    const value = i => fields[i].querySelector('input,textarea')?.value.trim() || '';
    const business_name = value(0), phone = value(1), business_address = value(2), description = value(3);
    if (!business_name || !business_address) return alert('Vui lòng nhập tên và địa chỉ doanh nghiệp.');
    const button = document.querySelector('#form-view button[onclick="submitForm()"]');
    button.disabled = true;
    try {
      await api.requireUser();
      await api.request('/business-requests', { method: 'POST', body: JSON.stringify({ business_name, phone: phone || null, business_address, description: description || null }) });
      document.getElementById('form-view').style.display = 'none';
      document.getElementById('success-view').style.display = 'block';
    } catch (error) { alert(error.message); } finally { button.disabled = false; }
  };
})();
