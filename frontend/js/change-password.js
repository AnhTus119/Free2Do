// Trang bắt buộc đổi mật khẩu lần đầu (tài khoản tạo bằng backend/bootstrap_admin.py).
// Backend chặn mọi API khác (HTTP 428) cho tới khi POST /auth/change-password thành công.
(function () {
  'use strict';
  const API = window.FREE2DO_CONFIG.API_BASE_URL;
  const token = localStorage.getItem('token');
  const form = document.getElementById('change-password-form');
  const message = form.querySelector('.form-message');
  if (!token) { location.replace('log-in.html'); return; }

  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { localStorage.removeItem('token'); location.replace('log-in.html'); }
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Không đổi được mật khẩu. Vui lòng thử lại.');
    return data;
  }
  const home = me => me.redirect || (me.account_type === 'operator' ? 'admin.html' : 'Demo Trang Customer/home.html');

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const current = document.getElementById('current-password').value;
    const next = document.getElementById('new-password').value;
    message.style.color = '#b42318';
    if (next.length < 8) { message.textContent = 'Mật khẩu mới phải có ít nhất 8 ký tự.'; return; }
    if (next !== document.getElementById('new-password-confirm').value) { message.textContent = 'Mật khẩu nhập lại không khớp.'; return; }
    if (next === current) { message.textContent = 'Mật khẩu mới phải khác mật khẩu hiện tại.'; return; }
    message.textContent = '';
    await F2D.busy(form.querySelector('button[type=submit]'), async () => {
      try {
        await request('/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password: current, new_password: next }) });
        message.style.color = '';
        message.textContent = 'Đã đổi mật khẩu. Đang chuyển trang...';
        location.replace(home(await request('/auth/me')));
      } catch (error) { message.textContent = error.message; }
    });
  });

  document.getElementById('change-password-logout').addEventListener('click', () => localStorage.removeItem('token'));

  // Mở nhầm trang khi không còn bị buộc đổi mật khẩu: về thẳng trang chính.
  window.FREE2DO_BACKEND_READY.then(() => request('/auth/me')).then(me => {
    if (me.requires_recovery_email) location.replace('recovery-email.html');
    else if (!me.requires_password_change) location.replace(home(me));
  }).catch(error => { message.textContent = error.message; });
})();
