(function () {
  'use strict';
  const api = window.CustomerAPI;
  const form = document.getElementById('businessRequestForm');
  const status = document.getElementById('businessRequestStatus');
  const MAX_PROOFS = 5;
  const proofs = F2D.imagePicker(document.getElementById('proofPicker'), { max: MAX_PROOFS, label: 'Chọn ảnh minh chứng' });
  const STATUS = {
    pending: { label: 'Đang chờ duyệt', pill: 'pending' },
    approved: { label: 'Đã duyệt', pill: 'approved' },
    rejected: { label: 'Đã từ chối', pill: 'rejected' },
  };

  // Mỗi yêu cầu là 1 box có tiêu đề từng mục; minh chứng hiện dạng ảnh, click để phóng to (lightbox chung).
  function requestCard(item) {
    const info = STATUS[item.status] || { label: item.status, pill: 'pending' };
    const statusTime = item.status === 'pending' ? item.created_at : (item.reviewed_at || item.created_at);
    const proofsHTML = item.proofs?.length
      ? `<div class="f2d-thumbs" data-zoom-group>${item.proofs.map((proof, index) => `<button type="button" class="f2d-thumb" data-zoom="${api.escapeHTML(proof.media_url)}" aria-label="Phóng to minh chứng ${index + 1}"><img src="${api.escapeHTML(proof.media_url)}" alt="Minh chứng ${index + 1}" loading="lazy"></button>`).join('')}</div>`
      : '<span class="f2d-empty">Không có ảnh minh chứng</span>';
    return `<article class="request-card">
      <header class="request-card-head"><h3>${api.escapeHTML(item.business_name)}</h3><span class="request-pill ${info.pill}">${api.escapeHTML(info.label)}</span></header>
      <dl class="request-fields">
        <dt>Tên</dt><dd>${api.escapeHTML(item.business_name)}</dd>
        <dt>Trạng thái</dt><dd>${api.escapeHTML(info.label)}: ${api.escapeHTML(F2D.dateTime(statusTime))}</dd>
        ${item.rejection_reason ? `<dt>Lý do từ chối</dt><dd class="reject">${api.escapeHTML(item.rejection_reason)}</dd>` : ''}
        <dt>Thời gian gửi</dt><dd>${api.escapeHTML(F2D.dateTime(item.created_at))}</dd>
        ${item.business_address ? `<dt>Địa chỉ</dt><dd>${api.escapeHTML(item.business_address)}</dd>` : ''}
        <dt>Mô tả</dt><dd>${api.escapeHTML(item.description || 'Chưa có mô tả')}</dd>
        <dt>Minh chứng</dt><dd>${proofsHTML}</dd>
      </dl>
    </article>`;
  }
  function renderHistory(requests) {
    document.getElementById('requestHistory').innerHTML = requests.length
      ? `<h2 class="request-history-title">Lịch sử yêu cầu</h2><div class="request-list">${requests.map(requestCard).join('')}</div>`
      : '';
  }
  function lockForm(message) {
    form.querySelectorAll('input,textarea,button').forEach(element => { element.disabled = true; });
    proofs.setDisabled(true);
    status.textContent = message;
  }

  api.requireUser().then(async me => {
    document.getElementById('businessPhone').value = me.phone || '';
    const requests = await api.request('/business-requests/me');
    renderHistory(requests);
    if (requests.some(item => item.status === 'pending')) {
      lockForm('Bạn đã có một yêu cầu đang chờ xét duyệt.');
    } else if (requests.some(item => item.status === 'approved')) {
      form.style.display = 'none';
      document.getElementById('success-view').style.display = 'block';
      document.querySelector('#success-view h2').textContent = 'Yêu cầu Business đã được duyệt.';
      document.querySelector('#success-view .badge').textContent = 'Đã duyệt';
    }
  }).catch(error => { status.textContent = error.message; });

  form.addEventListener('submit', event => {
    event.preventDefault();
    const button = form.querySelector('button[type=submit]');
    F2D.busy(button, async () => {
      const payload = {
        business_name: document.getElementById('businessName').value.trim(),
        phone: document.getElementById('businessPhone').value.trim() || null,
        business_address: document.getElementById('businessAddress').value.trim() || null,
        description: document.getElementById('businessDescription').value.trim() || null,
      };
      status.textContent = 'Đang gửi yêu cầu...';
      let created;
      try {
        created = await api.request('/business-requests', { method: 'POST', body: payload, toast: false });
      } catch (error) {
        status.textContent = error.message;
        F2D.toast(error.message, 'error');
        return;
      }
      const files = proofs.files();
      if (files.length) {
        const body = new FormData();
        files.forEach(file => body.append('files', file));
        try {
          created = await api.request(`/business-requests/${encodeURIComponent(created.request_id)}/proofs`, { method: 'POST', body, toast: false });
        } catch (error) {
          F2D.toast(`Đã gửi yêu cầu nhưng chưa tải được ảnh minh chứng: ${error.message}`, 'error');
        }
      }
      if (!files.length || created.proofs?.length) F2D.toast('Đã gửi yêu cầu trở thành doanh nghiệp.');
      proofs.clear();
      form.style.display = 'none';
      document.getElementById('success-view').style.display = 'block';
      status.textContent = '';
      renderHistory(await api.request('/business-requests/me').catch(() => [created]));
    });
  });
})();
