/*
 * Chuông thông báo dùng chung cho customer, business và operator.
 * - Một kiểu chuông duy nhất cho cả 3 vai trò: gắn vào chuông có sẵn bên trái menu người dùng
 *   (customer: .nav-icon chứa icon chuông, operator: .header-right .bell), trang chưa có chuông
 *   (business) thì tự thêm đúng chỗ đó. Icon được thay bằng cùng một SVG viền.
 * - Badge số thông báo mới: tối đa "99", từ 100 trở lên hiện "99+", không có thì ẩn.
 * - Panel xổ xuống / cuộn ngược lên bằng CSS transition; đóng bằng nút X, click ra ngoài hoặc ESC.
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
      .f2d-bell-host{position:relative;display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:12px;color:var(--brown,#6E5248);cursor:pointer;user-select:none;transition:background .2s ease,color .2s ease;font-size:0;}
      .f2d-bell-host:hover,.f2d-bell-host[aria-expanded="true"]{background:var(--paper,#FBF7F0);color:var(--rose-dark,#BE4F68);}
      .f2d-bell-host:focus-visible{outline:2px solid var(--rose,#DB6680);outline-offset:2px;}
      .f2d-bell-host svg{width:24px;height:24px;stroke:currentColor;stroke-width:1.9;fill:none;stroke-linecap:round;stroke-linejoin:round;}
      .f2d-dot{position:absolute;top:3px;right:1px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--rose,#DB6680);color:#fff;font:700 10.5px/18px Inter,sans-serif;text-align:center;border:2px solid #fff;box-sizing:border-box;display:none;font-variant-numeric:tabular-nums;}
      .f2d-dot.show{display:block;}
      .f2d-notify-panel{position:fixed;z-index:3000;width:380px;max-width:calc(100vw - 24px);max-height:min(70vh,520px);display:flex;flex-direction:column;background:#fff;border:1px solid var(--line,#EADFCB);border-radius:16px;box-shadow:0 18px 50px rgba(110,82,72,.18);font-family:Inter,sans-serif;color:var(--ink,#2B2420);
        opacity:0;visibility:hidden;pointer-events:none;transform:translateY(-10px);clip-path:inset(0 0 100% 0 round 16px);
        transition:opacity .22s ease,transform .3s cubic-bezier(.2,.8,.2,1),clip-path .3s cubic-bezier(.2,.8,.2,1),visibility 0s linear .3s;}
      .f2d-notify-panel.show{opacity:1;visibility:visible;pointer-events:auto;transform:none;clip-path:inset(0 0 0 0 round 16px);transition:opacity .22s ease,transform .3s cubic-bezier(.2,.8,.2,1),clip-path .3s cubic-bezier(.2,.8,.2,1),visibility 0s;}
      .f2d-notify-head{display:flex;align-items:center;gap:8px;padding:12px 12px 12px 16px;border-bottom:1px solid var(--line,#EADFCB);font-weight:800;font-size:15px;}
      .f2d-notify-head span{flex:1;}
      .f2d-notify-head button{background:none;border:0;color:var(--rose-dark,#BE4F68);font:600 12.5px Inter,sans-serif;cursor:pointer;border-radius:8px;padding:6px 8px;transition:background .2s ease;}
      .f2d-notify-head button:hover{background:var(--paper,#FBF7F0);}
      .f2d-notify-head .f2d-notify-close{width:32px;height:32px;padding:0;font-size:20px;line-height:1;color:var(--muted,#8A7B6E);}
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
      @media (prefers-reduced-motion:reduce){.f2d-notify-panel,.f2d-notify-panel.show,.f2d-notify-item,.f2d-bell-host{transition:none;}}
    `;
    document.head.appendChild(style);
  }

  const BELL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

  function findHost() {
    const existing = document.querySelector('.nav-icon[aria-label="Thông báo"], .nav-icon:has(use[href="#icon-bell"]), .header-right .bell');
    if (existing) return existing;
    const who = document.querySelector('.nav-right .nav-who, .header-right .who');
    if (!who) return null;
    const created = document.createElement('div');
    who.parentNode.insertBefore(created, who);
    return created;
  }

  function prepareHost() {
    host.innerHTML = `${BELL_SVG}<span class="f2d-dot" aria-hidden="true"></span>`;
    host.classList.add('f2d-bell-host');
    host.setAttribute('role', 'button');
    host.setAttribute('tabindex', '0');
    host.setAttribute('aria-label', 'Thông báo');
    host.setAttribute('aria-haspopup', 'dialog');
    host.setAttribute('aria-expanded', 'false');
  }

  const badge = () => host.querySelector('.f2d-dot');

  function updateBadge() {
    const read = readSet();
    const count = items.filter(item => !read.has(item.id)).length;
    const dot = badge();
    dot.textContent = count > 99 ? '99+' : String(count);
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
    panel.innerHTML = '<div class="f2d-notify-head"><span>Thông báo</span><button type="button" data-read-all>Đánh dấu đã đọc</button><button type="button" class="f2d-notify-close" data-close aria-label="Đóng thông báo">&times;</button></div><div class="f2d-notify-list"></div>';
    document.body.appendChild(panel);
    panel.querySelector('[data-close]').addEventListener('click', () => toggle(false));
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
    host.setAttribute('aria-expanded', String(shouldOpen));
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
    prepareHost();
    host.addEventListener('click', event => { event.stopPropagation(); toggle(); });
    host.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
    });
    document.addEventListener('click', event => {
      if (panel?.classList.contains('show') && !panel.contains(event.target)) toggle(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && panel?.classList.contains('show')) { toggle(false); host.focus(); }
    });
    window.addEventListener('resize', () => { if (panel?.classList.contains('show')) placePanel(); });
    refresh(true);
    setInterval(() => refresh(true), POLL_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
