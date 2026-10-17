(function () {
  'use strict';
  // Trợ lý FREE2DO trên mọi trang customer. Nút kéo thả kiểu Google Meet: thả ra thì hút về cạnh trái/phải
  // gần nhất, kéo quá mép thì thu thành tab mũi tên; khi đang mở chat thì không kéo được.
  // Vị trí nút + lịch sử chat lưu theo phiên đăng nhập ('f2d:ai-chat', xóa khi login/logout).
  const api = window.CustomerAPI;
  if (!api || document.getElementById('free2do-ai-toggle')) return;
  const STORE_KEY = 'f2d:ai-chat';
  const MARGIN = 14;
  const style = document.createElement('style');
  style.textContent = `
    #free2do-ai-toggle{position:fixed;z-index:9998;border:0;border-radius:28px;padding:13px 18px;background:#df5c7b;color:#fff;font:700 14px/1.2 Inter,sans-serif;white-space:nowrap;box-shadow:0 5px 20px #0003;cursor:grab;touch-action:none;user-select:none;transition:left .28s cubic-bezier(.2,.8,.2,1),top .28s cubic-bezier(.2,.8,.2,1),transform .2s}
    #free2do-ai-toggle.dragging{transition:none;cursor:grabbing;transform:scale(1.05)}
    #free2do-ai-toggle.locked{cursor:pointer}
    #free2do-ai-toggle[hidden],#free2do-ai-tab[hidden]{display:none}
    #free2do-ai-tab{position:fixed;z-index:9998;width:26px;height:56px;border:0;background:#df5c7b;color:#fff;font-size:18px;font-weight:800;cursor:pointer;box-shadow:0 4px 14px #0003}
    #free2do-ai-tab.left{left:0;border-radius:0 14px 14px 0}#free2do-ai-tab.right{right:0;border-radius:14px 0 0 14px}
    #free2do-ai-panel{position:fixed;z-index:9999;width:min(400px,calc(100vw - 28px));height:min(600px,calc(100vh - 40px));background:#fff;border:1px solid #eadcc7;border-radius:18px;box-shadow:0 14px 44px #0003;display:none;overflow:hidden;color:#302622;font-family:Inter,sans-serif}
    #free2do-ai-panel.open{display:flex;flex-direction:column}
    #free2do-ai-head{padding:13px 16px;background:#fff5e3;border-bottom:1px solid #eadcc7;display:flex;justify-content:space-between;align-items:center;font-weight:700;gap:8px}
    #free2do-ai-head button{border:0;background:transparent;cursor:pointer;color:#60483e}
    #free2do-ai-close{font-size:23px;line-height:1}#free2do-ai-clear{font-size:12px;font-weight:600;text-decoration:underline}
    #free2do-ai-messages{padding:14px;overflow:auto;flex:1;background:#fffcf7}
    .free2do-ai-message{max-width:92%;padding:10px 12px;margin:0 0 10px;border-radius:13px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5;font-size:14px}
    .free2do-ai-message.assistant{background:#fff;border:1px solid #eee2d1}.free2do-ai-message.user{margin-left:auto;background:#df5c7b;color:#fff}
    .free2do-ai-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;white-space:normal}
    .free2do-ai-chip{padding:3px 9px;border-radius:999px;background:#fff1f3;color:#a8455c;font-size:12px;font-weight:600}
    .free2do-ai-card{display:flex;gap:10px;width:100%;padding:8px;margin-top:8px;border:1px solid #eadcc7;border-radius:12px;background:#fff;cursor:pointer;text-align:left;font:inherit;color:inherit;white-space:normal;transition:border-color .15s,box-shadow .15s}
    .free2do-ai-card:hover{border-color:#df5c7b;box-shadow:0 4px 14px #df5c7b22}
    .free2do-ai-thumb{flex:0 0 64px;height:64px;border-radius:9px;overflow:hidden;background:#ffebc6;display:flex;align-items:center;justify-content:center;font-size:22px}
    .free2do-ai-thumb img{width:100%;height:100%;object-fit:cover}
    .free2do-ai-card strong{display:block;font-size:14px;line-height:1.3}.free2do-ai-card small{display:block;color:#77695f;margin-top:3px;font-size:12px;line-height:1.4}
    .free2do-ai-card em{display:block;color:#5c7a42;font-style:normal;font-size:12px;margin-top:3px}
    .free2do-ai-typing span{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:#c9a99a;animation:f2dAiDot 1s infinite}
    .free2do-ai-typing span:nth-child(2){animation-delay:.15s}.free2do-ai-typing span:nth-child(3){animation-delay:.3s}
    @keyframes f2dAiDot{0%,60%,100%{opacity:.3;transform:none}30%{opacity:1;transform:translateY(-3px)}}
    #free2do-ai-form{display:flex;gap:8px;padding:10px;border-top:1px solid #eadcc7;background:#fff}
    #free2do-ai-input{min-width:0;flex:1;resize:none;border:1px solid #ddcfbd;border-radius:10px;padding:10px;font:inherit;max-height:110px}
    #free2do-ai-send{border:0;border-radius:10px;background:#df5c7b;color:#fff;padding:0 14px;font-weight:700;cursor:pointer}#free2do-ai-send:disabled{opacity:.55;cursor:wait}
    @media(max-width:600px){#free2do-ai-panel{left:8px!important;right:8px;width:auto;height:min(70vh,560px)}}
    @media(prefers-reduced-motion:reduce){#free2do-ai-toggle{transition:none}.free2do-ai-typing span{animation:none}}`;
  document.head.append(style);

  const toggle = document.createElement('button');
  toggle.id = 'free2do-ai-toggle'; toggle.type = 'button'; toggle.textContent = '✨ Hỏi FREE2DO AI';
  toggle.setAttribute('aria-label', 'Mở trợ lý FREE2DO AI (kéo để di chuyển)');
  const tab = document.createElement('button');
  tab.id = 'free2do-ai-tab'; tab.type = 'button'; tab.hidden = true;
  tab.setAttribute('aria-label', 'Hiện nút trợ lý FREE2DO AI');
  const panel = document.createElement('section');
  panel.id = 'free2do-ai-panel'; panel.setAttribute('aria-label', 'Trợ lý FREE2DO AI');
  panel.innerHTML = '<div id="free2do-ai-head"><span>✨ Trợ lý FREE2DO</span><span><button id="free2do-ai-clear" type="button">Xóa chat</button> <button id="free2do-ai-close" type="button" aria-label="Đóng">×</button></span></div><div id="free2do-ai-messages" aria-live="polite"></div><form id="free2do-ai-form"><textarea id="free2do-ai-input" rows="1" maxlength="2000" placeholder="Ví dụ: Trời mưa, tối nay đi đâu dưới 200k?" required></textarea><button id="free2do-ai-send" type="submit">Gửi</button></form>';
  document.body.append(toggle, tab, panel);

  const messageBox = panel.querySelector('#free2do-ai-messages');
  const input = panel.querySelector('#free2do-ai-input');
  const sendButton = panel.querySelector('#free2do-ai-send');
  const saved = api.stored(STORE_KEY) || {};
  const state = { side: saved.side === 'left' ? 'left' : 'right', y: Number(saved.y) || null, tucked: Boolean(saved.tucked), messages: Array.isArray(saved.messages) ? saved.messages.slice(-30) : [] };
  const save = () => api.stored(STORE_KEY, state);
  let busy = false;

  // ---------- vị trí nút ----------
  const maxY = () => window.innerHeight - toggle.offsetHeight - MARGIN;
  const clampY = y => Math.min(Math.max(MARGIN, y), Math.max(MARGIN, maxY()));
  function place() {
    const y = clampY(state.y ?? window.innerHeight - toggle.offsetHeight - 22 - (window.innerWidth <= 600 ? 56 : 0));
    toggle.style.top = `${y}px`;
    toggle.style.left = `${state.side === 'left' ? MARGIN : window.innerWidth - toggle.offsetWidth - MARGIN}px`;
    toggle.hidden = state.tucked;
    tab.hidden = !state.tucked;
    tab.className = state.side;
    tab.textContent = state.side === 'left' ? '›' : '‹';
    tab.style.top = `${Math.min(Math.max(MARGIN, y - 6), window.innerHeight - 56 - MARGIN)}px`;
    if (panel.classList.contains('open')) placePanel();
  }
  function placePanel() {
    const rect = toggle.getBoundingClientRect();
    const height = panel.offsetHeight;
    const top = rect.top > window.innerHeight / 2 ? rect.top - height - 10 : rect.bottom + 10;
    panel.style.top = `${Math.min(Math.max(MARGIN, top), window.innerHeight - height - MARGIN)}px`;
    panel.style.left = state.side === 'left' ? `${MARGIN}px` : '';
    panel.style.right = state.side === 'right' ? `${MARGIN}px` : '';
  }

  let drag = null;
  toggle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const rect = toggle.getBoundingClientRect();
    drag = { startX: event.clientX, startY: event.clientY, dx: event.clientX - rect.left, dy: event.clientY - rect.top, moved: false };
    try { toggle.setPointerCapture(event.pointerId); } catch (error) { /* con trỏ đã nhả trước khi bắt */ }
  });
  toggle.addEventListener('pointermove', event => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
    drag.moved = true;
    if (panel.classList.contains('open')) return; // đang mở chat: không kéo, cũng không coi là bấm
    toggle.classList.add('dragging');
    toggle.style.left = `${event.clientX - drag.dx}px`;
    toggle.style.top = `${event.clientY - drag.dy}px`;
  });
  toggle.addEventListener('pointerup', event => {
    if (!drag) return;
    const wasDrag = drag.moved;
    drag = null;
    toggle.classList.remove('dragging');
    if (!wasDrag) { openPanel(!panel.classList.contains('open')); return; }
    if (panel.classList.contains('open')) return;
    const rect = toggle.getBoundingClientRect();
    state.side = rect.left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right';
    // Kéo quá mép (nút lọt ra ngoài màn hình quá 1/3) -> thu thành tab mũi tên.
    state.tucked = rect.left < -rect.width / 3 || rect.right > window.innerWidth + rect.width / 3 || event.clientX <= 2 || event.clientX >= window.innerWidth - 2;
    state.y = clampY(rect.top);
    place();
    save();
  });
  toggle.addEventListener('pointercancel', () => { drag = null; toggle.classList.remove('dragging'); place(); });
  toggle.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPanel(!panel.classList.contains('open')); } });
  tab.addEventListener('click', () => { state.tucked = false; place(); save(); toggle.focus(); });
  window.addEventListener('resize', place);

  function openPanel(open) {
    panel.classList.toggle('open', open);
    toggle.classList.toggle('locked', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) { placePanel(); input.focus(); messageBox.scrollTop = messageBox.scrollHeight; }
  }
  panel.querySelector('#free2do-ai-close').addEventListener('click', () => openPanel(false));

  // ---------- tin nhắn ----------
  const esc = value => api.escapeHTML(value ?? '');
  function card(item) {
    const thumb = item.image_url || item.business_logo_url;
    const meta = [item.distance_km == null ? null : `${item.distance_km} km`, api.priceLabel(item.price_text, item.price),
      item.avg_rating ? `★ ${item.avg_rating}` : null].filter(Boolean).join(' · ');
    return `<button type="button" class="free2do-ai-card" data-activity-id="${esc(item.activity_id)}"><span class="free2do-ai-thumb">${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : '✨'}</span><span><strong>${esc(item.name)}</strong><small>${esc(meta)}</small>${item.reason ? `<em>${esc(item.reason)}</em>` : ''}</span></button>`;
  }
  function render(message) {
    const bubble = document.createElement('div');
    bubble.className = `free2do-ai-message ${message.role}`;
    bubble.textContent = message.content;
    if (message.understood?.length) {
      bubble.insertAdjacentHTML('beforeend', `<div class="free2do-ai-chips">${message.understood.map(chip => `<span class="free2do-ai-chip">${esc(chip)}</span>`).join('')}</div>`);
    }
    if (message.recommendations?.length) bubble.insertAdjacentHTML('beforeend', message.recommendations.map(card).join(''));
    messageBox.append(bubble);
    messageBox.scrollTop = messageBox.scrollHeight;
  }
  function greet() {
    render({ role: 'assistant', content: 'Chào bạn! Hãy nói mình biết bạn muốn làm gì, ở đâu, ngân sách bao nhiêu, trời mưa hay nắng… Mình sẽ tìm hoạt động thật trên FREE2DO.' });
  }
  messageBox.addEventListener('click', event => {
    const item = event.target.closest('[data-activity-id]');
    if (!item) return;
    const query = new URLSearchParams({ id: item.dataset.activityId });
    const context = currentContext();
    if (context.latitude != null && context.longitude != null) { query.set('latitude', context.latitude); query.set('longitude', context.longitude); }
    location.href = `${new URL('activity-detail.html', document.baseURI).pathname}?${query}`;
  });
  panel.querySelector('#free2do-ai-clear').addEventListener('click', () => {
    state.messages = []; save(); messageBox.innerHTML = ''; greet();
  });

  // Ngữ cảnh: trang home cung cấp trực tiếp; trang khác dùng vị trí đã chọn ở home trong phiên.
  function currentContext() {
    const home = window.Free2DoCustomerHome?.getAIContext?.();
    if (home) return home;
    const stored = api.stored('f2d:home-location');
    return stored ? { latitude: stored.latitude, longitude: stored.longitude, location_label: stored.label } : {};
  }
  function showOnMap(result) {
    const target = window.Free2DoCustomerHome || window.Free2DoCustomerSearch;
    if (target && result.recommendations?.length) target.showAIRecommendations(result.recommendations, result.location);
  }

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); panel.querySelector('form').requestSubmit(); }
  });
  panel.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || busy) return;
    busy = true; sendButton.disabled = true;
    const userMessage = { role: 'user', content: message };
    render(userMessage);
    input.value = '';
    const pending = document.createElement('div');
    pending.className = 'free2do-ai-message assistant free2do-ai-typing';
    pending.innerHTML = '<span></span><span></span><span></span>';
    messageBox.append(pending);
    messageBox.scrollTop = messageBox.scrollHeight;
    const context = currentContext();
    try {
      const result = await api.request('/ai/chat', { method: 'POST', toast: false, body: {
        message, history: state.messages.slice(-8).map(item => ({ role: item.role, content: item.content.slice(0, 2000) })),
        latitude: context.latitude ?? null, longitude: context.longitude ?? null, location_label: context.location_label || null,
        radius: context.radius || 5, budget: context.budget ?? null, free_time: context.free_time ?? null, category_ids: context.category_ids || [],
      } });
      pending.remove();
      const reply = { role: 'assistant', content: result.reply, understood: result.understood || [], recommendations: result.recommendations || [] };
      render(reply);
      state.messages.push(userMessage, reply);
      state.messages = state.messages.slice(-30);
      save();
      showOnMap(result);
    } catch (error) {
      pending.remove();
      render({ role: 'assistant', content: error.message || 'Không gửi được yêu cầu. Vui lòng thử lại.' });
    } finally { busy = false; sendButton.disabled = false; input.focus(); }
  });

  if (state.messages.length) state.messages.forEach(render); else greet();
  place();
})();
