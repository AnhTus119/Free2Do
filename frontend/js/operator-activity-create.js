/*
 * Operator tạo hoạt động cho doanh nghiệp đã có tài khoản:
 * 1) tìm doanh nghiệp theo tên/mã trong CSDL (không có thì không thể tạo),
 * 2) nhập thông tin hoạt động (giống form của doanh nghiệp), 3) gửi lên POST /operator/activities.
 */
(function () {
  'use strict';
  const auth = window.AdminAuth;
  const $ = id => document.getElementById(id);
  const TIME_DATE = '2000-01-01';
  let business = null;
  let categories = [];
  let searchTimer = null;
  let searchSeq = 0;

  const escape = value => auth.escapeHTML(value);
  const toast = (message, isError = false) => window.F2D.toast(message, isError ? 'error' : 'success');
  function setError(id, message, inputId) {
    const box = $(id);
    box.textContent = message || '';
    box.hidden = !message;
    if (inputId) $(inputId).classList.toggle('invalid', Boolean(message));
  }

  function renderCategories() {
    $('opCategories').innerHTML = categories.map(category => `
      <label class="op-chip"><input type="checkbox" value="${escape(category.category_id)}">${escape(category.name)}</label>`).join('');
  }

  function lockForm(locked) {
    $('opFormSection').disabled = locked;
    $('opSubmit').disabled = locked;
  }

  function chooseBusiness(item) {
    business = item;
    $('opResults').hidden = true;
    $('opBizSearch').value = item.business_name;
    $('opBizName').textContent = item.business_name;
    $('opBizCode').textContent = item.user_id;
    $('opBizPhone').textContent = item.phone ? `SĐT: ${item.phone}` : 'SĐT: chưa cập nhật';
    $('opBizAddress').textContent = item.business_address ? `Địa chỉ: ${item.business_address}` : '';
    $('opBizDesc').textContent = item.description || '';
    $('opBizCard').hidden = false;
    setError('opBizError', '');
    lockForm(false);
    if (!$('opAddress').value && item.business_address) $('opAddress').value = item.business_address;
  }

  function clearBusiness() {
    business = null;
    $('opBizCard').hidden = true;
    lockForm(true);
  }

  async function searchBusiness() {
    const keyword = $('opBizSearch').value.trim();
    const seq = ++searchSeq;
    if (!keyword) { $('opResults').hidden = true; setError('opBizError', ''); return; }
    try {
      const rows = await auth.authFetch(`/operator/business-profiles?q=${encodeURIComponent(keyword)}`);
      if (seq !== searchSeq) return;
      if (!rows.length) {
        $('opResults').hidden = true;
        setError('opBizError', 'Không tìm thấy doanh nghiệp trùng khớp. Operator chỉ tạo hoạt động cho doanh nghiệp đã có tài khoản trong hệ thống.');
        return;
      }
      setError('opBizError', '');
      const box = $('opResults');
      box.innerHTML = rows.map(row => `<button type="button" class="op-result" data-id="${escape(row.user_id)}">${escape(row.business_name)}<small>${escape(row.user_id)}${row.business_address ? ' · ' + escape(row.business_address) : ''}</small></button>`).join('');
      box.hidden = false;
      box.onclick = event => {
        const button = event.target.closest('.op-result');
        if (button) chooseBusiness(rows.find(row => row.user_id === button.dataset.id));
      };
    } catch (error) { setError('opBizError', error.message); }
  }

  function resetForm() {
    ['opName', 'opDesc', 'opPrice', 'opAddress', 'opMap', 'opOpen', 'opClosed', 'opFrom', 'opUntil', 'opCover', 'opGallery', 'opBizSearch'].forEach(id => { $(id).value = ''; });
    $('opAlways').checked = true;
    $('opUntil').disabled = true;
    $('opUntilWrap').style.opacity = '.5';
    document.querySelectorAll('#opCategories .op-chip').forEach(chip => { chip.classList.remove('active'); chip.querySelector('input').checked = false; });
    setError('opAddressError', '', 'opAddress');
    setError('opBizError', '');
    $('opResults').hidden = true;
    clearBusiness();
  }

  function open() {
    resetForm();
    const overlay = $('opOverlay');
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('show'));
    $('opBizSearch').focus();
  }
  function close() {
    const overlay = $('opOverlay');
    overlay.classList.remove('show');
    setTimeout(() => { overlay.hidden = true; }, 200);
  }

  async function upload(activityId, file, kind) {
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`${auth.API_BASE_URL}/operator/activities/${encodeURIComponent(activityId)}/media/upload?media_kind=${kind}`, {
      method: 'POST', headers: { Authorization: `Bearer ${auth.getToken()}` }, body: form,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || 'Không tải được ảnh/video lên.');
    }
  }

  const timeOrNull = id => ($(id).value ? `${TIME_DATE}T${$(id).value}:00` : null);

  async function submit() {
    if (!business) return setError('opBizError', 'Hãy chọn một doanh nghiệp có trong hệ thống.');
    setError('opAddressError', '', 'opAddress');
    const name = $('opName').value.trim();
    const address = $('opAddress').value.trim();
    if (!name) { $('opName').focus(); return toast('Tên hoạt động là bắt buộc.', true); }
    if (!address) { setError('opAddressError', 'Hãy nhập địa chỉ hoạt động.', 'opAddress'); return $('opAddress').focus(); }
    let mapUrl;
    try { mapUrl = new URL($('opMap').value.trim()); } catch { return toast('Hãy nhập link Google Maps hợp lệ.', true); }
    if (!/(^|\.)google\.[a-z.]+$|(^|\.)goo\.gl$/.test(mapUrl.hostname.toLowerCase())) return toast('Địa điểm phải là link Google Maps.', true);
    const always = $('opAlways').checked;
    const from = $('opFrom').value;
    const until = always ? null : $('opUntil').value;
    if (!always && (!from || !until)) return toast('Hãy nhập ngày áp dụng và ngày kết thúc, hoặc chọn mở vĩnh viễn.', true);
    if (!always && until < from) return toast('Ngày kết thúc phải từ ngày áp dụng trở đi.', true);
    const priceText = $('opPrice').value.trim();
    const price = priceText === '' ? null : Number(priceText);
    if (price != null && (!Number.isInteger(price) || price < 0)) return toast('Giá phải là số nguyên không âm.', true);
    const description = $('opDesc').value.trim();
    if (!description) { $('opDesc').focus(); return toast('Mô tả hoạt động là bắt buộc.', true); }
    if (!$('opCover').files[0]) return toast('Hãy chọn ảnh bìa cho hoạt động.', true);

    const button = $('opSubmit');
    button.disabled = true;
    button.textContent = 'Đang tạo...';
    try {
      const activity = await auth.authFetch('/operator/activities', {
        method: 'POST',
        body: JSON.stringify({
          business_id: business.user_id, name, description, price, address,
          time_open: timeOrNull('opOpen'), time_close: timeOrNull('opClosed'),
          available_from: from ? `${from}T00:00:00` : null, available_until: until ? `${until}T23:59:59` : null,
          always_available: always, google_maps_url: mapUrl.href,
          category_ids: [...document.querySelectorAll('#opCategories input:checked')].map(input => input.value),
        }),
      });
      let uploadError = null;
      try {
        const cover = $('opCover').files[0];
        if (cover) await upload(activity.activity_id, cover, 'cover');
        for (const file of $('opGallery').files) await upload(activity.activity_id, file, 'gallery');
      } catch (error) { uploadError = error; }
      close();
      await window.AdminData?.refresh?.();
      if (uploadError) toast(`Đã tạo hoạt động nhưng chưa tải được ảnh: ${uploadError.message}`, true);
      else toast(`Đã tạo hoạt động "${activity.name}" cho ${business.business_name}.`);
    } catch (error) {
      if (/địa chỉ|google maps|vị trí/i.test(error.message)) { setError('opAddressError', error.message, 'opAddress'); $('opAddress').focus(); }
      else toast(error.message, true);
    } finally {
      button.textContent = 'Tạo hoạt động';
      button.disabled = !business;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    $('openCreateActivity')?.addEventListener('click', open);
    $('opClose').addEventListener('click', close);
    $('opCancel').addEventListener('click', close);
    $('opOverlay').addEventListener('mousedown', event => { if (event.target === $('opOverlay')) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('opOverlay').hidden) close(); });
    $('opSubmit').addEventListener('click', submit);
    $('opBizChange').addEventListener('click', () => { clearBusiness(); $('opBizSearch').value = ''; $('opBizSearch').focus(); });
    $('opBizSearch').addEventListener('input', () => {
      if (business && $('opBizSearch').value.trim() !== business.business_name) clearBusiness();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(searchBusiness, 300);
    });
    $('opAddress').addEventListener('input', () => setError('opAddressError', '', 'opAddress'));
    $('opMap').addEventListener('input', () => setError('opAddressError', '', 'opAddress'));
    $('opAlways').addEventListener('change', event => {
      $('opUntil').disabled = event.target.checked;
      $('opUntilWrap').style.opacity = event.target.checked ? '.5' : '1';
      if (event.target.checked) $('opUntil').value = '';
    });
    $('opCategories').addEventListener('change', event => event.target.closest('.op-chip')?.classList.toggle('active', event.target.checked));
    try { categories = await auth.authFetch('/categories'); renderCategories(); } catch (error) { /* danh mục tải lỗi: vẫn tạo được hoạt động */ }
  });
})();
