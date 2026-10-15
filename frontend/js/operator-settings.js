(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let me = null;

  function say(id, message, ok = true) {
    const box = $(id);
    box.textContent = message || '';
    box.className = `s-msg ${message ? (ok ? 'ok' : 'err') : ''}`;
  }

  function showTab(name) {
    const target = document.querySelector(`.settings-tab[data-tab="${name}"]:not([hidden])`) ? name : 'profile';
    document.querySelectorAll('.settings-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === target));
    document.querySelectorAll('.settings-card').forEach(card => card.classList.toggle('active', card.id === `tab-${target}`));
    if (location.hash !== `#${target}`) history.replaceState(null, '', `#${target}`);
  }

  async function load() {
    me = await AdminAuth.authFetch('/operator/me');
    $('pName').value = me.name || '';
    $('pEmail').value = me.email || '';
    $('pLevel').value = me.level === 'admin' ? 'Quản trị viên cấp cao' : 'Nhân viên vận hành';
    $('emailToggle').checked = me.email_notifications !== false;
    $('operatorsTab').hidden = me.level !== 'admin';
    showTab(location.hash.slice(1) || 'profile');
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try { await AdminAuth.requireOperatorAuth(); await load(); } catch (error) { say('profileMsg', error.message, false); return; }

    document.querySelector('.settings-tabs').addEventListener('click', event => {
      const tab = event.target.closest('.settings-tab');
      if (tab) showTab(tab.dataset.tab);
    });
    window.addEventListener('hashchange', () => showTab(location.hash.slice(1) || 'profile'));

    $('profileForm').addEventListener('submit', async event => {
      event.preventDefault();
      const button = event.submitter; button.disabled = true;
      try {
        me = await AdminAuth.authFetch('/operator/me', { method: 'PATCH', body: JSON.stringify({ name: $('pName').value.trim() }) });
        document.querySelectorAll('.side-admin-name, .who .name').forEach(node => { node.textContent = me.name; });
        document.querySelectorAll('.who .avatar, .side-avatar').forEach(node => { node.textContent = me.name.charAt(0).toUpperCase(); });
        say('profileMsg', '✓ Đã lưu hồ sơ.');
      } catch (error) { say('profileMsg', error.message, false); }
      button.disabled = false;
    });

    $('passwordForm').addEventListener('submit', async event => {
      event.preventDefault();
      if ($('pwNew').value !== $('pwConfirm').value) return say('passwordMsg', 'Mật khẩu nhập lại không khớp.', false);
      const button = event.submitter; button.disabled = true;
      try {
        await AdminAuth.authFetch('/auth/change-password', {
          method: 'POST', body: JSON.stringify({ current_password: $('pwCurrent').value, new_password: $('pwNew').value }),
        });
        event.target.reset();
        say('passwordMsg', '✓ Đã đổi mật khẩu.');
      } catch (error) { say('passwordMsg', error.message, false); }
      button.disabled = false;
    });

    $('emailToggle').addEventListener('change', async event => {
      try {
        me = await AdminAuth.authFetch('/operator/me', { method: 'PATCH', body: JSON.stringify({ email_notifications: event.target.checked }) });
        say('notifyMsg', event.target.checked ? '✓ Đã bật email thông báo.' : '✓ Đã tắt email thông báo.');
      } catch (error) { event.target.checked = !event.target.checked; say('notifyMsg', error.message, false); }
    });
  });
})();
