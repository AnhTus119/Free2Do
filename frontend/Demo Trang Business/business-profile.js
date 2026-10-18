let profileState;
let accountState;
let mediaState = [];

const KINDS = { logo: 'logo', gallery: 'ảnh gallery', menu: 'ảnh menu' };
const MISSING = 'Chưa cập nhật';

function setText(id, value) {
  const node = document.getElementById(id);
  const text = String(value ?? '').trim();
  node.textContent = text || MISSING;
  node.classList.toggle('is-empty', !text);
}

function renderProfile() {
  BusinessAPI.applyIdentity(accountState, profileState);
  document.getElementById('profile-name').textContent = profileState.business_name;
  const status = document.getElementById('profile-status');
  status.className = `bp-status ${profileState.verified_at ? 'verified' : 'pending'}`;
  status.textContent = profileState.verified_at ? 'Đã xác minh' : 'Chờ xác minh';
  document.getElementById('profile-tagline').textContent = profileState.verified_at
    ? `Đối tác FREE2DO từ ${BusinessAPI.formatDate(profileState.verified_at)}`
    : 'Hồ sơ đang chờ FREE2DO xác minh';
  const about = document.getElementById('profile-description');
  about.textContent = profileState.description || 'Chưa có phần giới thiệu. Bấm "Chỉnh sửa hồ sơ" để thêm vài dòng về doanh nghiệp của bạn.';
  about.classList.toggle('is-empty', !profileState.description);
  setText('profile-phone', profileState.phone);
  setText('profile-email', accountState.email || accountState.recovery_email);
  setText('profile-address', profileState.business_address);
  setText('profile-code', profileState.business_code);
}

function renderMedia() {
  Object.keys(KINDS).forEach(kind => {
    const items = mediaState.filter(item => item.media_kind === kind);
    document.getElementById(`media-${kind}`).innerHTML = items.map((item, index) => `
      <div class="f2d-thumb">
        <img src="${BusinessAPI.escapeHTML(item.media_url)}" alt="${BusinessAPI.escapeHTML(`${KINDS[kind]} ${index + 1}`)}" data-zoom loading="lazy">
        <button type="button" class="f2d-thumb-remove" data-delete-media="${BusinessAPI.escapeHTML(item.media_id)}" data-kind="${kind}" aria-label="Xóa ${BusinessAPI.escapeHTML(KINDS[kind])} ${index + 1}">&times;</button>
      </div>`).join('');
  });
}

async function refreshProfile() {
  profileState = await BusinessAPI.request('/business/me');
  renderProfile();
}

async function uploadFiles(kind, files) {
  const pickerZone = document.querySelector(`#picker-${kind} .f2d-dropzone`);
  pickerZone.classList.add('is-disabled');
  let uploaded = 0;
  try {
    for (const file of files) {
      const form = new FormData();
      form.append('file', file);
      const item = await BusinessAPI.request(`/business/media?kind=${encodeURIComponent(kind)}`, { method: 'POST', body: form, toast: false });
      if (kind === 'logo') mediaState = mediaState.filter(media => media.media_kind !== 'logo');
      mediaState.unshift(item);
      uploaded += 1;
    }
    if (kind === 'logo') await refreshProfile();
    BusinessAPI.notify(kind === 'logo' ? 'Đã cập nhật logo.' : `Đã tải lên ${uploaded} ${KINDS[kind]}.`);
  } catch (error) {
    BusinessAPI.notify(uploaded ? `Đã tải ${uploaded} ảnh, ảnh còn lại lỗi: ${error.message}` : error.message, 'error');
  } finally {
    pickerZone.classList.remove('is-disabled');
    renderMedia();
  }
}

const dialog = () => document.getElementById('edit-dialog');

function openEdit() {
  document.getElementById('edit-name').value = profileState.business_name || '';
  document.getElementById('edit-phone').value = profileState.phone || '';
  document.getElementById('edit-address').value = profileState.business_address || '';
  document.getElementById('edit-description').value = profileState.description || '';
  dialog().showModal();
}

async function saveProfile(event) {
  event.preventDefault();
  const name = document.getElementById('edit-name').value.trim();
  const address = document.getElementById('edit-address').value.trim();
  if (!name) return BusinessAPI.notify('Tên doanh nghiệp không được để trống.', 'error');
  if (!address) return BusinessAPI.notify('Địa chỉ không được để trống.', 'error');
  const body = {
    business_name: name,
    phone: document.getElementById('edit-phone').value.trim() || null,
    business_address: address,
    description: document.getElementById('edit-description').value.trim() || null,
  };
  const saved = await F2D.ask({
    title: 'Lưu hồ sơ doanh nghiệp?', text: 'Tên, số điện thoại, địa chỉ và mô tả mới sẽ hiển thị với khách hàng.', ok: 'Lưu thay đổi',
    done: 'Đã chỉnh sửa hồ sơ thành công.',
    run: () => BusinessAPI.request('/business/me', { method: 'PATCH', toast: false, body }),
  });
  if (!saved) return;
  profileState = saved;
  renderProfile();
  dialog().close();
}

async function deleteMedia(button) {
  const kind = button.dataset.kind;
  const deleted = await F2D.ask({
    title: kind === 'logo' ? 'Xóa logo hiện tại?' : `Xóa ${KINDS[kind]} này?`, text: 'Ảnh sẽ bị xóa vĩnh viễn.',
    ok: 'Xóa', danger: true, done: 'Đã xóa ảnh.',
    run: () => BusinessAPI.request(`/business/media/${encodeURIComponent(button.dataset.deleteMedia)}`, { method: 'DELETE', toast: false }),
  });
  if (!deleted) return;
  mediaState = mediaState.filter(item => item.media_id !== button.dataset.deleteMedia);
  if (kind === 'logo') await refreshProfile().catch(error => BusinessAPI.notify(error.message, 'error'));
  renderMedia();
}

document.addEventListener('DOMContentLoaded', async () => {
  Object.keys(KINDS).forEach(kind => F2D.imagePicker(document.getElementById(`picker-${kind}`), {
    max: kind === 'logo' ? 1 : 10,
    label: kind === 'logo' ? 'Chọn logo' : 'Chọn ảnh',
    hint: kind === 'logo' ? 'JPG, PNG hoặc WEBP, tối đa 5MB' : 'JPG, PNG hoặc WEBP, mỗi ảnh tối đa 5MB',
    onFiles: files => uploadFiles(kind, files),
  }));
  try {
    const context = await BusinessAPI.requireBusiness();
    accountState = context.me; profileState = context.profile;
    mediaState = await BusinessAPI.request('/business/media');
    renderProfile(); renderMedia();
  } catch (error) { BusinessAPI.notify(error.message, 'error'); }
  document.getElementById('open-edit').addEventListener('click', openEdit);
  document.getElementById('cancel-edit').addEventListener('click', () => dialog().close());
  document.getElementById('edit-form').addEventListener('submit', saveProfile);
  document.querySelector('.bp-wrap').addEventListener('click', event => {
    const button = event.target.closest('[data-delete-media]');
    if (button) deleteMedia(button);
  });
});
window.addEventListener('free2do:business-data-refresh', async () => {
  if (dialog()?.open) return;
  try {
    const context = await BusinessAPI.requireBusiness();
    accountState = context.me;
    profileState = context.profile;
    mediaState = await BusinessAPI.request('/business/media');
    renderProfile();
    renderMedia();
  } catch (error) {
    BusinessAPI.notify(error.message, 'error');
  }
});
