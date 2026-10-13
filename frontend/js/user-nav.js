/* Show the signed-in identity and make every logout link clear the token. */
(async function () {
  const token = localStorage.getItem('token');
  document.querySelectorAll('.logout, .side-bottom a[href="admin-login.html"]').forEach(link => {
    link.addEventListener('click', event => { localStorage.removeItem('token'); if (link.classList.contains('logout')) { event.preventDefault(); location.href = '../log-in.html'; } });
  });
  if (!token) {
    document.querySelectorAll('.nav-name').forEach(el => el.textContent = 'Khách');
    document.querySelectorAll('.nav-avatar').forEach(el => el.textContent = 'K');
    return;
  }
  try {
    const me = await window.Free2DoAPI.request('/auth/me', { auth: true });
    if (me.requires_recovery_email) {
      const prefix = location.pathname.includes('/Demo%20Trang') || location.pathname.includes('/Demo Trang') ? '../' : '';
      location.href = `${prefix}recovery-email.html`;
      return;
    }
    document.querySelectorAll('.nav-name, .side-admin-name, .who .name').forEach(el => el.textContent = me.name);
    document.querySelectorAll('.nav-avatar, .side-avatar, .who .avatar').forEach(el => el.textContent = me.name.charAt(0).toUpperCase());
  } catch (error) { console.warn('Không lấy được hồ sơ đăng nhập:', error); }
})();
