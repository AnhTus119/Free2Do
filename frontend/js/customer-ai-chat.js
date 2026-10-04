(function () {
  'use strict';
  const api = window.CustomerAPI;
  const style = document.createElement('style');
  style.textContent = `
    #free2do-ai-toggle{position:fixed;right:22px;bottom:22px;z-index:9998;border:0;border-radius:28px;padding:13px 18px;background:#df5c7b;color:#fff;font-weight:700;box-shadow:0 5px 20px #0003;cursor:pointer}
    #free2do-ai-panel{position:fixed;right:22px;bottom:78px;z-index:9999;width:min(390px,calc(100vw - 28px));height:min(590px,calc(100vh - 110px));background:#fff;border:1px solid #eadcc7;border-radius:18px;box-shadow:0 14px 44px #0003;display:none;overflow:hidden;color:#302622}
    #free2do-ai-panel.open{display:flex;flex-direction:column}#free2do-ai-head{padding:14px 16px;background:#fff5e3;border-bottom:1px solid #eadcc7;display:flex;justify-content:space-between;align-items:center;font-weight:700}
    #free2do-ai-close{border:0;background:transparent;font-size:23px;cursor:pointer;color:#60483e}#free2do-ai-messages{padding:14px;overflow:auto;flex:1;background:#fffcf7}
    .free2do-ai-message{max-width:90%;padding:10px 12px;margin:0 0 10px;border-radius:13px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.45;font-size:14px}
    .free2do-ai-message.assistant{background:#fff;border:1px solid #eee2d1}.free2do-ai-message.user{margin-left:auto;background:#df5c7b;color:#fff}
    .free2do-ai-card{padding:9px;margin-top:8px;border:1px solid #eadcc7;border-radius:11px;background:#fff;cursor:pointer}.free2do-ai-card strong{display:block}.free2do-ai-card small{display:block;color:#77695f;margin-top:3px}
    #free2do-ai-form{display:flex;gap:8px;padding:10px;border-top:1px solid #eadcc7;background:#fff}#free2do-ai-input{min-width:0;flex:1;resize:none;border:1px solid #ddcfbd;border-radius:10px;padding:10px;font:inherit;max-height:110px}#free2do-ai-send{border:0;border-radius:10px;background:#df5c7b;color:#fff;padding:0 14px;font-weight:700;cursor:pointer}#free2do-ai-send:disabled{opacity:.55;cursor:wait}
    @media(max-width:600px){#free2do-ai-toggle{right:12px;bottom:76px}#free2do-ai-panel{right:8px;bottom:128px;width:calc(100vw - 16px);height:min(65vh,560px)}}`;
  document.head.append(style);

  const toggle = document.createElement('button');
  toggle.id = 'free2do-ai-toggle'; toggle.type = 'button'; toggle.textContent = '✨ Hỏi FREE2DO AI';
  const panel = document.createElement('section');
  panel.id = 'free2do-ai-panel'; panel.setAttribute('aria-label', 'Trợ lý FREE2DO AI');
  panel.innerHTML = '<div id="free2do-ai-head"><span>✨ Trợ lý FREE2DO</span><button id="free2do-ai-close" type="button" aria-label="Đóng">×</button></div><div id="free2do-ai-messages" aria-live="polite"></div><form id="free2do-ai-form"><textarea id="free2do-ai-input" rows="1" maxlength="2000" placeholder="Ví dụ: Tối nay có gì dưới 200.000đ?" required></textarea><button id="free2do-ai-send" type="submit">Gửi</button></form>';
  document.body.append(toggle, panel);

  const messageBox = panel.querySelector('#free2do-ai-messages');
  const input = panel.querySelector('#free2do-ai-input');
  const sendButton = panel.querySelector('#free2do-ai-send');
  const history = [];
  let busy = false;

  function addMessage(role, content, recommendations = []) {
    const bubble = document.createElement('div');
    bubble.className = `free2do-ai-message ${role}`;
    bubble.textContent = content;
    if (role === 'assistant') recommendations.slice(0, 5).forEach(item => {
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'free2do-ai-card';
      const name = document.createElement('strong'); name.textContent = item.name || 'Hoạt động';
      const meta = document.createElement('small');
      const distance = item.distance_km == null ? 'Chưa có khoảng cách' : `${item.distance_km} km`;
      meta.textContent = `${distance} · ${api.priceLabel(item.price_text, item.price)} · ★ ${item.avg_rating ?? '—'} · ${item.match_score}% phù hợp`;
      card.append(name, meta);
      card.addEventListener('click', () => {
        const context = window.Free2DoCustomerHome?.getAIContext?.() || {};
        const query = new URLSearchParams({ id: item.activity_id });
        if (context.latitude != null && context.longitude != null) {
          query.set('latitude', context.latitude); query.set('longitude', context.longitude);
        }
        location.href = `activity-detail.html?${query}`;
      });
      bubble.append(card);
    });
    messageBox.append(bubble);
    messageBox.scrollTop = messageBox.scrollHeight;
  }

  function formatContext() {
    const context = window.Free2DoCustomerHome?.getAIContext?.() || {};
    return {
      latitude: context.latitude,
      longitude: context.longitude,
      radius: context.radius || 5,
      budget: context.budget,
      free_time: context.free_time,
      category_ids: context.category_ids || [],
    };
  }

  toggle.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) input.focus();
  });
  panel.querySelector('#free2do-ai-close').addEventListener('click', () => panel.classList.remove('open'));
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); panel.querySelector('form').requestSubmit(); }
  });
  panel.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || busy) return;
    busy = true; sendButton.disabled = true;
    addMessage('user', message);
    input.value = '';
    const pending = document.createElement('div'); pending.className = 'free2do-ai-message assistant'; pending.textContent = 'Đang tìm hiểu yêu cầu…'; messageBox.append(pending);
    try {
      const result = await api.request('/ai/chat', { method: 'POST', body: { ...formatContext(), message, history: history.slice(-8) } });
      pending.remove();
      addMessage('assistant', result.reply, result.recommendations || []);
      history.push({ role: 'user', content: message }, { role: 'assistant', content: result.reply });
      history.splice(0, Math.max(0, history.length - 10));
      if (result.recommendations?.length) window.Free2DoCustomerHome?.showAIRecommendations(result.recommendations);
    } catch (error) {
      pending.remove(); addMessage('assistant', error.message || 'Không gửi được yêu cầu. Vui lòng thử lại.');
    } finally { busy = false; sendButton.disabled = false; input.focus(); }
  });
  addMessage('assistant', 'Chào bạn! Mình có thể hiểu yêu cầu bằng lời và tìm hoạt động thật trong Free2Do. Hãy cho mình biết bạn muốn làm gì nhé.');
})();
