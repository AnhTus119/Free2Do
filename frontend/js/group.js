(function () {
  'use strict';

  const api = window.CustomerAPI;
  const params = new URLSearchParams(location.search);
  const inviteCode = params.get('groupInvite');
  let currentUser = null;
  let categories = [];
  let currentGroup = null;
  let groupMembers = [];
  let recommendations = [];
  let selectedActivity = null;
  let editingMemberIndex = -1;
  let memberFormCount = 0;
  let joinMode = false;
  let socket = null;
  let reconnectTimer = null;
  let refreshInFlight = false;

  const escapeValue = value => api.escapeHTML(value ?? '');
  const money = value => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
  const categoryName = id => categories.find(item => item.category_id === id)?.name || id;

  function interestOptions(name, selected = []) {
    return categories.map(category => `<label class="interest-option"><input type="checkbox" name="${name}" value="${escapeValue(category.category_id)}" ${selected.includes(category.category_id) ? 'checked' : ''}><span>${escapeValue(category.name)}</span></label>`).join('');
  }

  function memberPayload(form) {
    const value = name => form.querySelector(`[name="${name}"]`).value.trim();
    return {
      name: value('member-name'),
      free_hours: Number(value('member-hours')),
      address: value('member-address'),
      budget: Number(value('member-budget')),
      category_ids: [...form.querySelectorAll('[name="member-interests"]:checked')].map(input => input.value),
    };
  }

  function validMember(member) {
    return member.name && member.free_hours > 0 && member.address && member.budget >= 0 && member.category_ids.length;
  }

  window.openGroupModal = function () {
    document.getElementById('groupOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    if (!document.getElementById('memberForms').children.length) {
      addMemberForm(joinMode || !currentGroup);
    }
  };

  window.closeGroupModal = function () {
    document.getElementById('groupOverlay').classList.remove('open');
    document.body.style.overflow = '';
  };

  window.addMemberForm = function (isFirst = false) {
    if (joinMode && document.querySelector('#memberForms .member-form')) return;
    memberFormCount += 1;
    const form = document.createElement('div');
    form.className = 'member-form';
    form.dataset.memberNumber = String(memberFormCount);
    form.dataset.host = String(isFirst && !joinMode);
    form.innerHTML = `<button class="remove-member-btn" type="button" onclick="removeMemberForm(this)" aria-label="Xóa thành viên">×</button><h3>${joinMode ? 'Thông tin của bạn' : `Thành viên ${memberFormCount}`}</h3><div class="member-form-grid">
      <label>Tên<input name="member-name" required placeholder="Nhập tên" value="${isFirst ? escapeValue(currentUser?.name || '') : ''}"></label>
      <label>Rảnh mấy giờ<input name="member-hours" type="number" min="0.5" max="24" step="0.5" required placeholder="Ví dụ: 2"></label>
      <label>Địa chỉ<input name="member-address" required placeholder="Nhập khu vực hoặc địa chỉ"></label>
      <label>Ngân sách tối đa<input name="member-budget" type="number" min="0" step="1000" required placeholder="Ví dụ: 200000"></label>
      <div class="interest-input"><label>Sở thích</label><div class="interest-chips">${interestOptions('member-interests')}</div></div>
    </div>`;
    if (isFirst || joinMode) form.querySelector('.remove-member-btn').style.display = 'none';
    document.getElementById('memberForms').appendChild(form);
  };

  window.removeMemberForm = function (button) {
    const form = button.closest('.member-form');
    if (form.dataset.host === 'true') {
      alert('Thành viên số 1 là host và không thể xóa.');
      return;
    }
    if (document.querySelectorAll('#memberForms .member-form').length === 1) {
      alert('Nhóm cần ít nhất một thành viên.');
      return;
    }
    form.remove();
  };

  function inviteUrl(group) {
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('groupInvite', group.invite_code);
    return url.toString();
  }

  window.createInviteLink = function () {
    if (!currentGroup) {
      alert('Hãy nhập thông tin và tạo nhóm trước khi sao chép link mời.');
      return;
    }
    const input = document.getElementById('inviteLink');
    input.value = inviteUrl(currentGroup);
    const button = document.getElementById('copyInviteButton');
    button.textContent = 'Sao chép link';
    button.onclick = copyInviteLink;
  };

  window.copyInviteLink = async function () {
    const input = document.getElementById('inviteLink');
    if (!input.value) createInviteLink();
    if (!input.value) return;
    try {
      await navigator.clipboard.writeText(input.value);
    } catch (_) {
      input.select();
      document.execCommand('copy');
    }
    alert('Đã sao chép link nhóm.');
  };

  window.createGroup = async function () {
    const forms = [...document.querySelectorAll('#memberForms .member-form')];
    const members = forms.map(memberPayload);
    if (!members.length || members.some(member => !validMember(member))) {
      alert('Vui lòng nhập đầy đủ thông tin cho tất cả thành viên.');
      return;
    }
    try {
      currentGroup = joinMode
        ? await api.request(`/groups/invite/${encodeURIComponent(inviteCode)}/join`, { method: 'POST', body: members[0] })
        : await api.request('/groups', { method: 'POST', body: { members } });
      joinMode = false;
      applyGroup(currentGroup);
      closeGroupModal();
      connectRealtime();
    } catch (error) {
      alert(error.message);
    }
  };

  function applyGroup(group) {
    currentGroup = group;
    groupMembers = group.members;
    selectedActivity = group.selected_activity;
    document.getElementById('groupStart').style.display = 'none';
    document.getElementById('createdMembers').style.display = 'block';
    document.getElementById('inviteLink').value = inviteUrl(group);
    document.getElementById('copyInviteButton').textContent = 'Sao chép link';
    document.getElementById('copyInviteButton').onclick = copyInviteLink;
    history.replaceState(null, '', inviteUrl(group));
    renderCreatedMembers();
    renderExpense();
  }

  window.renderCreatedMembers = function () {
    document.getElementById('memberCountTitle').textContent = `Thành viên trong nhóm (${groupMembers.length})`;
    document.getElementById('memberCards').innerHTML = groupMembers.map((member, index) => {
      const online = member.user_id ? (member.is_online ? ' · Đang online' : ' · Ngoại tuyến') : ' · Khách được host thêm';
      return `<button class="member-card" type="button" onclick="openMemberEdit(${index})" style="width:100%;text-align:left;cursor:pointer;"><div class="member-avatar">${escapeValue(member.name.charAt(0).toUpperCase())}</div><div><div class="member-name">${escapeValue(member.name)}${member.is_host ? ' · Host' : ''}</div><div class="member-crit"><span>◷ Rảnh ${escapeValue(member.free_hours)} giờ</span> · <span>⌖ ${escapeValue(member.address)}</span> · <span>▣ ≤${Number(member.budget).toLocaleString('vi-VN')} ₫</span> · <span>✦ ${escapeValue(member.category_names.join(', '))}</span><span>${escapeValue(online)}</span></div></div></button>`;
    }).join('');
  };

  window.openMemberEdit = function (index) {
    const member = groupMembers[index];
    if (!currentGroup.is_host && member.user_id !== currentUser.user_id) {
      alert('Bạn chỉ được sửa thông tin của mình.');
      return;
    }
    editingMemberIndex = index;
    document.getElementById('memberEditTitle').textContent = member.name;
    document.getElementById('memberEditAvatar').textContent = member.name.charAt(0).toUpperCase();
    document.getElementById('memberEditFields').innerHTML = `<label class="member-edit-field">Tên<input id="edit-name" value="${escapeValue(member.name)}"></label><label class="member-edit-field">Rảnh mấy giờ<input id="edit-hours" type="number" min="0.5" max="24" step="0.5" value="${escapeValue(member.free_hours)}"></label><label class="member-edit-field">Địa chỉ<input id="edit-address" value="${escapeValue(member.address)}"></label><label class="member-edit-field">Ngân sách tối đa<input id="edit-budget" type="number" min="0" step="1000" value="${escapeValue(member.budget)}"></label><div class="member-edit-interests"><label>Sở thích</label><div class="interest-chips">${interestOptions('edit-interests', member.category_ids)}</div></div>`;
    document.getElementById('memberEditOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  window.closeMemberEdit = function () {
    document.getElementById('memberEditOverlay').classList.remove('open');
    document.body.style.overflow = '';
  };

  window.saveMemberEdit = async function () {
    const member = groupMembers[editingMemberIndex];
    const payload = {
      name: document.getElementById('edit-name').value.trim(),
      free_hours: Number(document.getElementById('edit-hours').value),
      address: document.getElementById('edit-address').value.trim(),
      budget: Number(document.getElementById('edit-budget').value),
      category_ids: [...document.querySelectorAll('[name="edit-interests"]:checked')].map(input => input.value),
    };
    if (!validMember(payload)) {
      alert('Vui lòng nhập đầy đủ thông tin thành viên.');
      return;
    }
    try {
      applyGroup(await api.request(`/groups/${currentGroup.group_id}/members/${member.member_id}`, { method: 'PATCH', body: payload }));
      closeMemberEdit();
      if (document.getElementById('group-result').style.display === 'block') await showGroupResult();
    } catch (error) {
      alert(error.message);
    }
  };

  window.selectTab = function (name) {
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.toggle('active', pane.id === `pane-${name}`));
    document.querySelectorAll('.tab-btn').forEach(button => button.classList.toggle('active', button.dataset.tab === name));
    if (name === 'expense') {
      const savedActivityId = currentGroup?.selected_activity?.activity_id;
      if (currentGroup?.is_host && selectedActivity?.activity_id && selectedActivity.activity_id !== savedActivityId) {
        selectActivity(selectedActivity.activity_id);
      } else {
        renderExpense();
      }
    }
  };

  function activityView(activity) {
    return {
      id: activity.activity_id,
      name: activity.name,
      description: activity.description || '',
      address: activity.address,
      price: api.priceLabel(activity.price_text, activity.price),
      amount: activity.price || 0,
      hours: api.hours(activity.time_open, activity.time_close),
      rating: activity.avg_rating,
      categories: (activity.category_ids || []).map(categoryName).join(', '),
      media_url: activity.media_url,
      score: activity.match_score,
    };
  }

  window.showGroupResult = async function () {
    if (!currentGroup) return;
    try {
      recommendations = await api.request(`/groups/${currentGroup.group_id}/recommendations`);
      const best = recommendations[0];
      if (!best) {
        alert('Không tìm thấy hoạt động phù hợp cho nhóm.');
        return;
      }
      renderBestMatch(best, false);
      document.getElementById('suggestionCards').innerHTML = recommendations.slice(1).map(suggestionCard).join('');
      document.getElementById('group-result').style.display = 'block';
    } catch (error) {
      alert(error.message);
    }
  };

  function renderBestMatch(activity, persist) {
    selectedActivity = activity;
    const view = activityView(activity);
    document.getElementById('bestMatch').innerHTML = `<div class="group-avg"><div class="pct">${Number(view.score ?? 0)}%</div><div class="lbl">Độ phù hợp cao nhất cho cả nhóm</div></div><button class="suggestion-card" type="button" onclick="openActivityPopup('${escapeValue(view.id)}')" style="width:100%;text-align:left;"><div class="activity-title">✨ ${escapeValue(view.name)}</div><div class="activity-biz">${escapeValue(view.address)} · ${escapeValue(view.price)}</div><div class="member-crit">★ ${view.rating ?? '—'} · ${escapeValue(view.hours)} · ${escapeValue(view.categories)}</div></button>`;
    if (!persist) renderExpense();
  }

  function suggestionCard(activity) {
    const view = activityView(activity);
    return `<button class="suggestion-card" type="button" onclick="openActivityPopup('${escapeValue(view.id)}')"><div class="activity-title">✨ ${escapeValue(view.name)}</div><div class="activity-biz">${escapeValue(view.address)}</div><div class="member-crit">${escapeValue(view.price)} · ★ ${view.rating ?? '—'} · ${view.score}% phù hợp</div></button>`;
  }

  window.toggleSuggestions = function () {
    const suggestions = document.getElementById('suggestions');
    const button = document.getElementById('suggestionsToggle');
    const isHidden = suggestions.style.display === 'none' || !suggestions.style.display;
    suggestions.style.display = isHidden ? 'block' : 'none';
    button.textContent = isHidden ? 'Ẩn gợi ý' : 'Xem gợi ý khác';
  };

  window.selectActivity = async function (id) {
    if (!currentGroup.is_host) {
      alert('Chỉ host được chốt hoạt động.');
      return;
    }
    try {
      applyGroup(await api.request(`/groups/${currentGroup.group_id}/activity`, { method: 'PUT', body: { activity_id: id } }));
      const selected = recommendations.find(item => item.activity_id === id);
      if (selected) renderBestMatch(selected, true);
      document.getElementById('suggestions').style.display = 'none';
      document.getElementById('suggestionsToggle').textContent = 'Xem gợi ý khác';
      closeActivityPopup();
    } catch (error) {
      alert(error.message);
    }
  };

  function findActivity(id) {
    if (selectedActivity?.activity_id === id) return selectedActivity;
    return recommendations.find(item => item.activity_id === id);
  }

  window.openActivityPopup = function (id) {
    const activity = findActivity(id);
    if (!activity) return;
    const view = activityView(activity);
    const image = view.media_url
      ? `<img src="${escapeValue(view.media_url)}" alt="${escapeValue(view.name)}" style="width:100%;height:180px;object-fit:cover;border-radius:12px;">`
      : '<div style="font-size:42px;text-align:center;background:#F3D9A6;border-radius:12px;padding:20px;">✨</div>';
    const selectButton = currentGroup.is_host ? `<button type="button" class="btn btn-primary" onclick="selectActivity('${escapeValue(id)}')">Chọn hoạt động</button>` : '';
    document.getElementById('activityPopupTitle').textContent = view.name;
    document.getElementById('activityPopupBody').innerHTML = `${image}<div class="activity-popup-meta"><div><b>Địa chỉ</b><br>${escapeValue(view.address)}</div><div><b>Giá</b><br>${escapeValue(view.price)}</div><div><b>Thời gian</b><br>${escapeValue(view.hours)}</div><div><b>Đánh giá</b><br>★ ${view.rating ?? '—'}</div></div><p style="line-height:1.6;color:var(--muted);">${escapeValue(view.description)}</p><div class="group-actions"><a href="activity-detail.html?id=${encodeURIComponent(id)}" class="btn btn-secondary">Chi tiết</a>${selectButton}</div>`;
    document.getElementById('activityOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  window.closeActivityPopup = function () {
    document.getElementById('activityOverlay').classList.remove('open');
    document.body.style.overflow = '';
  };

  window.renderExpense = function () {
    if (!currentGroup || !selectedActivity || !groupMembers.length) return;
    const view = activityView(selectedActivity);
    document.getElementById('expenseActivity').innerHTML = `<div style="background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px;"><div class="result-thumb" style="background:#DDE3CB;">✨</div><div><div class="member-name">${escapeValue(view.name)}</div><div class="member-crit">${escapeValue(view.hours)} · ${groupMembers.length} người tham gia</div></div></div>`;
    document.getElementById('expenseTotal').textContent = money(currentGroup.total_amount);
    document.getElementById('expensePerPerson').textContent = money(groupMembers[0]?.payment.amount || 0);
    document.getElementById('expensePaid').textContent = money(currentGroup.paid_amount);
    document.getElementById('expenseMissing').textContent = money(currentGroup.missing_amount);
    document.getElementById('paymentRows').innerHTML = groupMembers.map((member, index) => {
      const payment = member.payment;
      const reminded = Boolean(payment.reminded_at);
      const status = payment.status === 'paid' ? '<span class="pay-badge paid">Đã trả</span>' : '<span class="pay-badge unpaid">Chưa trả</span>';
      const actions = currentGroup.is_host && payment.status !== 'paid'
        ? `<div class="payment-actions"><button class="btn btn-secondary" type="button" onclick="markMemberPaid(${index})">Đã trả</button><button class="btn btn-secondary" type="button" onclick="remindMember(${index})">${reminded ? 'Đã nhắc' : 'Nhắc thanh toán'}</button></div>`
        : '';
      return `<div class="split-row"><div class="member-avatar">${escapeValue(member.name.charAt(0).toUpperCase())}</div><div><div class="member-name">${escapeValue(member.name)} ${status}</div><div class="member-crit">${money(payment.amount)}</div></div><div class="split-amount">${money(payment.amount)}</div>${actions}</div>`;
    }).join('');
  };

  async function paymentAction(index, action) {
    if (!currentGroup.is_host) return alert('Chỉ host được cập nhật thanh toán.');
    try {
      const member = groupMembers[index];
      applyGroup(await api.request(`/groups/${currentGroup.group_id}/payments/${member.member_id}`, { method: 'PATCH', body: { action } }));
    } catch (error) {
      alert(error.message);
    }
  }

  window.markMemberPaid = index => paymentAction(index, 'paid');
  window.remindMember = index => paymentAction(index, 'remind');

  async function refreshGroup() {
    if (!currentGroup || refreshInFlight) return;
    refreshInFlight = true;
    try {
      applyGroup(await api.request(`/groups/${currentGroup.group_id}`));
    } catch (error) {
      console.warn('Không thể đồng bộ nhóm:', error.message);
    } finally {
      refreshInFlight = false;
    }
  }

  function connectRealtime() {
    if (!currentGroup || !localStorage.getItem('token')) return;
    if (socket) socket.close();
    clearTimeout(reconnectTimer);
    const base = window.FREE2DO_CONFIG.API_BASE_URL.replace(/^http/, 'ws');
    socket = new WebSocket(`${base}/groups/${encodeURIComponent(currentGroup.group_id)}/ws?token=${encodeURIComponent(localStorage.getItem('token'))}`);
    socket.onmessage = event => {
      let message;
      try { message = JSON.parse(event.data); } catch (_) { return; }
      if (message.type === 'group_updated' || message.type === 'presence') refreshGroup();
    };
    socket.onclose = () => {
      socket = null;
      reconnectTimer = setTimeout(connectRealtime, 3000);
    };
    socket.onerror = () => socket?.close();
  }

  async function initialize() {
    try {
      [currentUser, categories] = await Promise.all([
        api.requireUser(),
        api.request('/categories'),
      ]);
      if (!categories.length) throw new Error('Hệ thống chưa có danh mục sở thích.');
      if (inviteCode) {
        try {
          applyGroup(await api.request(`/groups/invite/${encodeURIComponent(inviteCode)}`));
          connectRealtime();
        } catch (error) {
          if (error.status !== 403) throw error;
          joinMode = true;
          document.getElementById('groupModalTitle').textContent = 'Tham gia nhóm';
          document.querySelector('#groupModalTitle + p').textContent = 'Nhập thông tin của bạn để tham gia nhóm.';
          document.querySelector('#groupOverlay .add-member-btn').style.display = 'none';
          openGroupModal();
        }
      }
    } catch (error) {
      alert(error.message);
    }
  }

  document.getElementById('groupOverlay').addEventListener('click', function (event) {
    if (event.target === this) closeGroupModal();
  });
  document.getElementById('memberEditOverlay').addEventListener('click', function (event) {
    if (event.target === this) closeMemberEdit();
  });
  document.getElementById('activityOverlay').addEventListener('click', function (event) {
    if (event.target === this) closeActivityPopup();
  });
  window.addEventListener('beforeunload', () => socket?.close());
  setInterval(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) refreshGroup();
  }, 8000);
  setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) socket.send('ping');
  }, 25000);

  selectTab('matching');
  initialize();
})();

