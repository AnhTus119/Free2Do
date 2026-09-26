let profileState;
let accountState;
let mediaState = [];

function renderProfile() {
  BusinessAPI.applyIdentity(accountState, profileState);
  document.getElementById('profile-name').textContent = profileState.business_name;
  document.getElementById('profile-description').textContent = profileState.description || 'Chưa có mô tả.';
  document.getElementById('profile-phone').textContent = profileState.phone || 'Chưa cung cấp';
  document.getElementById('profile-email').textContent = accountState.email || '—';
  document.getElementById('profile-address').textContent = profileState.business_address;
  document.getElementById('edit-name').value = profileState.business_name || '';
  document.getElementById('edit-phone').value = profileState.phone || '';
  document.getElementById('edit-address').value = profileState.business_address || '';
  document.getElementById('edit-description').value = profileState.description || '';
}

function renderMedia() {
  const target = document.getElementById('business-media-list');
  target.innerHTML = mediaState.length ? mediaState.map(item => `
    <div style="border:1px solid var(--line);border-radius:12px;padding:10px;">
      <img src="${BusinessAPI.escapeHTML(item.media_url)}" alt="${BusinessAPI.escapeHTML(item.media_kind)}" style="width:100%;height:120px;object-fit:cover;border-radius:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;">
        <b>${BusinessAPI.escapeHTML(item.media_kind)}</b>
        <button class="row-btn danger" data-delete-media="${BusinessAPI.escapeHTML(item.media_id)}">Xóa</button>
      </div>
    </div>`).join('') : '<p style="color:var(--muted);font-size:13px;">Chưa có logo, ảnh gallery hoặc menu.</p>';
}

window.toggleEdit = () => {
  const edit = document.getElementById('edit-mode');
  const opening = edit.style.display !== 'block';
  edit.style.display = opening ? 'block' : 'none';
  document.getElementById('view-mode').style.display = opening ? 'none' : 'block';
};

async function saveProfile() {
  try {
    profileState = await BusinessAPI.request('/business/me', { method: 'PATCH', body: {
      business_name: document.getElementById('edit-name').value.trim(),
      phone: document.getElementById('edit-phone').value.trim() || null,
      business_address: document.getElementById('edit-address').value.trim(),
      description: document.getElementById('edit-description').value.trim() || null
    }});
    renderProfile();
    toggleEdit();
    BusinessAPI.notify('Cập nhật hồ sơ thành công.');
  } catch (error) { BusinessAPI.notify(error.message, 'error'); }
}

async function uploadMedia() {
  const file = document.getElementById('media-file').files[0];
  const kind = document.getElementById('media-kind').value;
  if (!file) return BusinessAPI.notify('Vui lòng chọn ảnh.', 'error');
  const form = new FormData();
  form.append('file', file);
  try {
    const item = await BusinessAPI.request(`/business/media?kind=${encodeURIComponent(kind)}`, { method: 'POST', body: form });
    mediaState.unshift(item);
    if (kind === 'logo') profileState = await BusinessAPI.request('/business/me');
    renderProfile(); renderMedia();
    document.getElementById('media-file').value = '';
    BusinessAPI.notify('Đã tải ảnh lên kho lưu trữ.');
  } catch (error) { BusinessAPI.notify(error.message, 'error'); }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const context = await BusinessAPI.requireBusiness();
    accountState = context.me; profileState = context.profile;
    mediaState = await BusinessAPI.request('/business/media');
    renderProfile(); renderMedia();
  } catch (error) { BusinessAPI.notify(error.message, 'error'); }
  document.getElementById('save-profile').addEventListener('click', saveProfile);
  document.getElementById('upload-media').addEventListener('click', uploadMedia);
  document.getElementById('business-media-list').addEventListener('click', async event => {
    const button = event.target.closest('[data-delete-media]');
    if (!button || !confirm('Xóa ảnh này?')) return;
    try {
      await BusinessAPI.request(`/business/media/${button.dataset.deleteMedia}`, { method: 'DELETE' });
      mediaState = mediaState.filter(item => item.media_id !== button.dataset.deleteMedia);
      profileState = await BusinessAPI.request('/business/me');
      renderProfile(); renderMedia();
      BusinessAPI.notify('Đã xóa ảnh.');
    } catch (error) { BusinessAPI.notify(error.message, 'error'); }
  });
});
