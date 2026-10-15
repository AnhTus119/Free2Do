/*
 * Chuông thông báo dùng chung cho customer, business và operator.
 * - Gắn vào chuông có sẵn (customer: .nav-icon[aria-label="Thông báo"], operator: .header-right .bell);
 *   trang business chưa có chuông thì tự thêm trước menu người dùng.
 * - Dữ liệu lấy từ GET /notifications (theo vai trò), làm mới mỗi 5 phút và khi quay lại tab.
 * - Trạng thái "đã đọc" lưu trong trình duyệt theo từng tài khoản.
 */
(function () {
  'use strict';
  const config = window.FREE2DO_CONFIG;
  if (!config) return;
  const POLL_MS = 5 * 60 * 1000;
  const ICONS = {
    new_activity: '✨', closing_soon: '⏰', review: '⭐', approved: '✅', hidden: '🚫',
    pending_request: '🏬', pending_activity: '🗓️', report: '🚩', complaint: '⚠️',
  };
  let items = [];
  let panel = null;
  let host = null;
  let lastFetch = 0;

  const token = () => localStorage.getItem('token');
  const accountKey = () => {
    try { return JSON.parse(atob(token().split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; } catch (e) { return String(token() || '').slice(-12); }
  };
  const storeKey = () => `f2d:notif-read:${accountKey()}`;
  const readSet = () => { try { return new Set(JSON.parse(localStorage.getItem(storeKey()) || '[]')); } catch (e) { return new Set(); } };
  const saveRead = set => { try { localStorage.setItem(storeKey(), JSON.stringify([...set])); } catch (e) { /* bỏ qua */ } };
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function timeAgo(value) {
    if (!value) return '';
    const stamp = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`).getTime();
    const seconds = Math.max(0, (Date.now() - stamp) / 1000);
    if (seconds < 90) return 'Vừa xong';
    if (seconds < 3600) return `${Math.round(seconds / 60)} phút trước`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} giờ trước`;
    return `${Math.round(seconds / 86400)} ngày trước`;
  }

  function injectStyles() {
    if (document.getElementById('f2d-notify-style')) return;
    const style = document.createElement('style');
    style.id = 'f2d-notify-style';
    style.textContent = `
      .f2d-bell-host{position:relative;cursor:pointer;user-select:none;}
      .f2d-bell-btn{position:relative;background:none;border:0;font-size:18px;cursor:pointer;padding:6px;line-height:1;color:inherit;}
      .f2d-dot{position:absolute;top:-3px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#DB6680;color:#fff;font:700 10px/16px Inter,sans-serif;text-align:center;border:2px solid #fff;box-sizing:content-box;display:none;}
      .f2d-dot.show{display:block;}
      .f2d-notify-panel{position:fixed;z-index:3000;width:380px;max-width:calc(100vw - 24px);max-height:min(70vh,520px);display:flex;flex-direction:column;background:#fff;border:1px solid #EDE3D2;border-radius:16px;box-shadow:0 18px 50px rgba(40,25,10,.18);opacity:0;transform:translateY(-6px);pointer-events:none;transition:opacity .16s ease,transform .16s ease;font-family:Inter,sans-serif;color:#2B2118;}
      .f2d-notify-panel.show{opacity:1;transform:none;pointer-events:auto;}
      .f2d-notify-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #F1E8D8;font-weight:800;font-size:15px;}
      .f2d-notify-head button{background:none;border:0;color:#C4506A;font:600 12.5px Inter,sans-serif;cursor:pointer;}
      .f2d-notify-list{overflow-y:auto;padding:6px;}
      .f2d-notify-item{display:flex;gap:12px;padding:11px 10px;border-radius:12px;text-decoration:none;color:inherit;cursor:pointer;transition:background .12s ease;}
      .f2d-notify-item:hover{background:#FBF5EA;}
      .f2d-notify-item.unread{background:#FFF4F6;}
      .f2d-notify-icon{flex:0 0 34px;height:34px;border-radius:10px;background:#FAF3E6;display:grid;place-items:center;font-size:16px;}
      .f2d-notify-main{min-width:0;flex:1;}
      .f2d-notify-title{font-weight:700;font-size:13.5px;line-height:1.35;}
      .f2d-notify-body{font-size:12.5px;color:#7A6B5A;margin-top:2px;line-height:1.4;overflow-wrap:anywhere;}
      .f2d-notify-time{font-size:11.5px;color:#A89983;margin-top:4px;}
      .f2d-notify-unread-dot{flex:0 0 8px;height:8px;border-radius:50%;background:#DB6680;margin-top:8px;}
      .f2d-notify-empty{padding:34px 16px;text-align:center;color:#8A7A66;font-size:13.5px;}
      @media (prefers-reduced-motion:reduce){.f2d-notify-panel,.f2d-notify-item{transition:none;}}
    `;
    document.head.appendChild(style);
  }

  function findHost() {
    const existing = document.querySelector('.nav-icon[aria-label="Thông báo"], .header-right .bell');
    if (existing) return existing;
    const who = document.querySelector('.nav-right .nav-who, .header-right .who');
    if (!who) return null;
    const created = document.createElement('button');
    created.type = 'button';
    created.className = 'f2d-bell-btn';
    created.setAttribute('aria-label', 'Thông báo');
    created.textContent = '🔔';
    who.parentNode.insertBefore(created, who);
    return created;
  }

  function badge() {
    let dot = host.querySelector('.f2d-dot');
    if (!dot) {
      host.querySelectorAll('.dot-badge, .badge-dot').forEach(node => node.remove());
      dot = document.createElement('span');
      dot.className = 'f2d-dot';
      host.appendChild(dot);
    }
    return dot;
  }

  function updateBadge() {
    const read = readSet();
    const count = items.filter(item => !read.has(item.id)).length;
    const dot = badge();
    dot.textContent = count > 9 ? '9+' : String(count);
    dot.classList.toggle('show', count > 0);
    host.setAttribute('title', count ? `${count} thông báo chưa đọc` : 'Không có thông báo mới');
  }

  function render() {
    if (!panel) return;
    const read = readSet();
    panel.querySelector('.f2d-notify-list').innerHTML = items.length ? items.map(item => `
      <a class="f2d-notify-item ${read.has(item.id) ? '' : 'unread'}" data-id="${escapeHTML(item.id)}" href="${escapeHTML(item.href || '#')}">
        <div class="f2d-notify-icon">${ICONS[item.kind] || '🔔'}</div>
        <div class="f2d-notify-main">
          <div class="f2d-notify-title">${escapeHTML(item.title)}</div>
          ${item.body ? `<div class="f2d-notify-body">${escapeHTML(item.body)}</div>` : ''}
          <div class="f2d-notify-time">${escapeHTML(timeAgo(item.created_at))}</div>
        </div>
        ${read.has(item.id) ? '' : '<span class="f2d-notify-unread-dot"></span>'}
      </a>`).join('') : '<div class="f2d-notify-empty">Chưa có thông báo mới.</div>';
  }

  function placePanel() {
    const rect = host.getBoundingClientRect();
    panel.style.top = `${Math.round(rect.bottom + 10)}px`;
    panel.style.right = `${Math.max(12, Math.round(window.innerWidth - rect.right - 8))}px`;
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.className = 'f2d-notify-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Thông báo');
    panel.innerHTML = '<div class="f2d-notify-head"><span>Thông báo</span><button type="button" data-read-all>Đánh dấu đã đọc</button></div><div class="f2d-notify-list"></div>';
    document.body.appendChild(panel);
    panel.querySelector('[data-read-all]').addEventListener('click', () => {
      const read = readSet();
      items.forEach(item => read.add(item.id));
      saveRead(read);
      render();
      updateBadge();
    });
    panel.querySelector('.f2d-notify-list').addEventListener('click', event => {
      const row = event.target.closest('.f2d-notify-item');
      if (!row) return;
      const read = readSet();
      read.add(row.dataset.id);
      saveRead(read);
      if (row.getAttribute('href') === '#') { event.preventDefault(); render(); updateBadge(); }
    });
  }

  function toggle(open) {
    if (!panel) buildPanel();
    const shouldOpen = open ?? !panel.classList.contains('show');
    if (shouldOpen) { placePanel(); render(); refresh(true); }
    panel.classList.toggle('show', shouldOpen);
  }

  async function refresh(force = false) {
    if (!token() || (!force && Date.now() - lastFetch < 60 * 1000)) return;
    lastFetch = Date.now();
    try {
      const response = await fetch(`${config.API_BASE_URL}/notifications`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!response.ok) return;
      items = await response.json();
      const ids = new Set(items.map(item => item.id));
      saveRead(new Set([...readSet()].filter(id => ids.has(id)))); // dọn các thông báo đã biến mất
      updateBadge();
      render();
    } catch (error) { /* mạng lỗi: giữ danh sách cũ */ }
  }

  function init() {
    if (!token()) return;
    injectStyles();
    host = findHost();
    if (!host) return;
    host.classList.add('f2d-bell-host');
    host.addEventListener('click', event => { event.stopPropagation(); toggle(); });
    document.addEventListener('click', event => { if (panel && !panel.contains(event.target)) toggle(false); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && panel) toggle(false); });
    window.addEventListener('resize', () => { if (panel?.classList.contains('show')) placePanel(); });
    refresh(true);
    setInterval(() => refresh(true), POLL_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
