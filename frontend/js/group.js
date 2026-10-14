(function () {
  'use strict';

  const api = window.CustomerAPI;
  const GROUP_NAMES_KEY = 'free2do_group_names';
  const params = new URLSearchParams(location.search);

  // Hỗ trợ link cũ /g/<slug>--<code>, query ?groupInvite=<code>,
  // và link mới chỉ có slug ở root: /ten-nhom.
  // Link ngắn: /g/<mã>. Mã mời chỉ gồm chữ + số; slug cũ luôn có dấu "-".
  function groupSegmentFromPath() {
    const match = decodeURIComponent(location.pathname).match(/\/g\/([^/]+)\/?$/);
    return match ? match[1] : null;
  }
  function inviteCodeFromPath() {
    const segment = groupSegmentFromPath();
    if (!segment) return null;
    const legacy = segment.match(/--([A-Za-z0-9]+)$/);
    if (legacy) return legacy[1];
    return /^[A-Za-z0-9]+$/.test(segment) ? segment : null;
  }
  function groupSlugFromPath() {
    const path = decodeURIComponent(location.pathname);
    const segment = groupSegmentFromPath();
    if (segment) return /^[A-Za-z0-9]+$/.test(segment) || /--[A-Za-z0-9]+$/.test(segment) ? null : segment;
    if (/\.html?$/i.test(path) || path === '/') return null;
    const match = path.match(/^\/([^/]+)\/?$/);
    return match ? match[1] : null;
  }
  let inviteCode = params.get('groupInvite') || inviteCodeFromPath();
  const incomingGroupSlug = inviteCode ? null : groupSlugFromPath();
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
  let pendingGroupAction = null;
  let userSessionStarted = false;
  let recommendationsLoadedForGroup = null;
  let recommendationsLoadGroupId = null;
  let recommendationsLoadPromise = null;
  let activeGroupId = null;

  const escapeValue = value => api.escapeHTML(value ?? '');
  const money = value => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
  const categoryName = id => categories.find(item => item.category_id === id)?.name || id;

  function getGroupNames() {
    try {
      const value = JSON.parse(localStorage.getItem(GROUP_NAMES_KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (error) {
      console.warn('Không thể đọc tên nhóm đã lưu trên trình duyệt:', error);
      return {};
    }
  }

  function saveGroupName(inviteCodeValue, name) {
    const names = getGroupNames();
    names[inviteCodeValue] = name;
    localStorage.setItem(GROUP_NAMES_KEY, JSON.stringify(names));
  }

  function displayGroupName(group, names) {
    const savedName = names[group.invite_code];
    if (typeof savedName === 'string' && savedName.trim()) return savedName.trim();
    const host = group.members.find(member => member.is_host);
    return host ? `Nhóm của ${host.name}` : 'Nhóm chưa đặt tên';
  }

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
    if (!joinMode) {
      document.querySelector('#groupFormStep .group-actions .btn-primary').textContent = 'Tạo nhóm';
    }
    document.getElementById('groupNameField').style.display = joinMode ? 'none' : 'block';
    if (!joinMode && !currentGroup) document.getElementById('groupNameInput').value = '';
    document.getElementById('groupFormStep').style.display = 'block';
    document.getElementById('inviteSuccessStep').style.display = 'none';
    document.getElementById('groupOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    if (!document.getElementById('memberForms').children.length) {
      addMemberForm(joinMode || !currentGroup);
    }
  };

  window.closeGroupModal = function () {
    if (joinMode) {
      joinMode = false;
      sessionStorage.removeItem('pending_group_invite');
      history.replaceState(null, '', location.pathname);
      document.getElementById('groupModalTitle').textContent = 'Tạo nhóm ghép lịch';
      document.querySelector('#groupModalTitle + p').textContent = 'Nhập thông tin của bạn để tạo nhóm và gửi link mời.';
      document.querySelector('#groupFormStep .group-actions .btn-primary').textContent = 'Tạo nhóm';
    }
    document.getElementById('groupOverlay').classList.remove('open');
    document.getElementById('groupFormStep').style.display = 'block';
    document.getElementById('inviteSuccessStep').style.display = 'none';
    document.body.style.overflow = '';
  };

  window.addMemberForm = function (isFirst = false) {
    if (document.querySelector('#memberForms .member-form')) return;
    memberFormCount += 1;
    const form = document.createElement('div');
    form.className = 'member-form';
    form.dataset.memberNumber = String(memberFormCount);
    form.dataset.host = String(!joinMode);
    form.innerHTML = `<button class="remove-member-btn" type="button" onclick="removeMemberForm(this)" aria-label="Xóa thành viên">×</button><h3>${joinMode ? 'Thông tin của bạn' : 'Thông tin của bạn (Host)'}</h3><div class="member-form-grid">
      <label>Tên<input name="member-name" required placeholder="Nhập tên" value="${isFirst ? escapeValue(currentUser?.name || '') : ''}"></label>
      <label>Rảnh mấy giờ<input name="member-hours" type="number" min="0.5" max="24" step="0.5" required placeholder="Ví dụ: 2"></label>
      <label>Địa chỉ<input name="member-address" required placeholder="Nhập khu vực hoặc địa chỉ"></label>
      <label>Ngân sách tối đa<input name="member-budget" type="number" min="0" step="1000" required placeholder="Ví dụ: 200000"></label>
      <div class="interest-input"><label>Sở thích</label><div class="interest-chips">${interestOptions('member-interests')}</div></div>
    </div>`;
    form.querySelector('.remove-member-btn').style.display = 'none';
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

  function slugifyGroupName(name) {
    const slug = String(name || 'nhom-free2do')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
      .replace(/-+$/g, '');
    return slug || 'nhom-free2do';
  }

  function inviteUrl(group) {
    // Link rút gọn cùng domain với web: https://<domain>/g/<mã mời>.
    // Các link cũ (/g/ten--ma và /ten-nhom) vẫn mở được.
    return `${location.origin}/g/${encodeURIComponent(group.invite_code)}`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (_) {
      const input = document.createElement('textarea');
      input.value = text;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand('copy');
      input.remove();
      if (!copied) throw new Error('Không thể sao chép link.');
    }
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
      await copyText(input.value);
      document.getElementById('inviteCopyStatus').textContent = 'Đã sao chép link nhóm.';
    } catch (error) {
      document.getElementById('inviteCopyStatus').textContent = `${error.message} Hãy thử sao chép thủ công.`;
    }
  };

  window.copyGroupLink = async function () {
    if (!currentGroup) return;
    const text = inviteUrl(currentGroup);
    try {
      await copyText(text);
      document.getElementById('groupLinkStatus').textContent = 'Đã sao chép link nhóm.';
    } catch (error) {
      document.getElementById('groupLinkStatus').textContent = `${error.message} Hãy thử sao chép thủ công.`;
    }
  };

  window.createGroup = async function () {
    const forms = [...document.querySelectorAll('#memberForms .member-form')];
    const members = forms.map(memberPayload);
    if (!members.length || members.some(member => !validMember(member))) {
      alert('Vui lòng nhập đầy đủ thông tin cho tất cả thành viên.');
      return;
    }
    try {
      const joining = joinMode;
      const groupName = document.getElementById('groupNameInput').value.trim();
      if (!joining && !groupName) {
        alert('Vui lòng nhập tên nhóm.');
        return;
      }
      currentGroup = joining
        ? await api.request(`/groups/invite/${encodeURIComponent(inviteCode)}/join`, { method: 'POST', body: members[0] })
        : await api.request('/groups', { method: 'POST', body: { host: members[0], group_name: groupName } });
      if (!joining) {
        try {
          saveGroupName(currentGroup.invite_code, groupName);
        } catch (error) {
          alert(`Nhóm đã được tạo nhưng không lưu được tên nhóm trên trình duyệt: ${error.message}`);
        }
      }
      if (!joining) sessionStorage.setItem('pending_group_invite', currentGroup.invite_code);
      joinMode = false;
      applyGroup(currentGroup);
      closeGroupModal();
      connectRealtime();
      if (joining) {
        sessionStorage.removeItem('pending_group_invite');
      } else {
        document.getElementById('inviteCopyStatus').textContent = '';
        document.getElementById('groupFormStep').style.display = 'none';
        document.getElementById('inviteSuccessStep').style.display = 'block';
        document.getElementById('inviteLink').value = inviteUrl(currentGroup);
        document.getElementById('groupOverlay').classList.add('open');
        document.body.style.overflow = 'hidden';
      }
    } catch (error) {
      alert(error.message);
    }
  };

  function applyGroup(group) {
    const groupChanged = activeGroupId !== group.group_id;
    activeGroupId = group.group_id;
    currentGroup = group;
    groupMembers = group.members;
    selectedActivity = group.selected_activity;
    const names = getGroupNames();
    document.getElementById('groupHome').style.display = 'none';
    document.getElementById('groupWorkspace').classList.remove('group-home-mode');
    document.getElementById('currentGroupTitle').textContent = displayGroupName(group, names);
    document.getElementById('createdMembers').style.display = 'block';
    if (groupChanged) selectTab('matching');
    if (group.confirmation_complete) selectTab('expense');
    else selectTab('matching');
    document.getElementById('inviteLink').value = inviteUrl(group);
    document.getElementById('groupInviteToolbar').style.display = 'flex';
    document.getElementById('groupLinkStatus').textContent = '';
    history.replaceState(null, '', inviteUrl(group));
    renderCreatedMembers();
    renderExpense();
    updateExpenseButton();
    if (!group.search_started) {
      if (recommendationsLoadedForGroup === group.group_id) {
        recommendationsLoadedForGroup = null;
        recommendations = [];
        document.getElementById('group-result').style.display = 'none';
      }
    } else if (group.selected_activity) {
      renderSelectedActivity(group.selected_activity);
      document.getElementById('group-result').style.display = 'block';
    } else if (recommendationsLoadedForGroup === group.group_id) {
      document.getElementById('group-result').style.display = 'block';
      renderVoteSummary();
    } else if (recommendationsLoadedForGroup !== group.group_id) {
      document.getElementById('group-result').style.display = 'block';
      loadGroupRecommendations().catch(error => console.warn('Không thể tải gợi ý hoạt động:', error.message));
    }
  }

  window.renderCreatedMembers = function () {
    document.getElementById('memberCountTitle').textContent = `Thành viên trong nhóm (${groupMembers.length})`;
    document.getElementById('memberCards').innerHTML = groupMembers.map((member, index) => {
      const online = member.user_id ? (member.is_online ? ' · Đang online' : ' · Ngoại tuyến') : ' · Khách được host thêm';
      const readyButton = currentGroup.status === 'active' && !currentGroup.search_started && member.user_id === currentUser?.user_id
        ? `<button class="btn ${member.is_ready ? 'btn-secondary' : 'btn-primary'}" type="button" onclick="toggleMemberReady(${index})">${member.is_ready ? 'Đã sẵn sàng' : 'Tôi đã sẵn sàng'}</button>` : '';
      return `<div class="member-card"><button type="button" onclick="openMemberEdit(${index})" style="display:flex;align-items:center;gap:14px;flex:1;text-align:left;cursor:pointer;border:0;background:transparent;color:inherit;padding:0;"><div class="member-avatar">${escapeValue(member.name.charAt(0).toUpperCase())}</div><div><div class="member-name">${escapeValue(member.name)}${member.is_host ? ' · Host' : ''} · ${member.is_ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'}${member.leave_status === 'pending' ? ' · Xin rời nhóm' : member.leave_status === 'rejected' ? ' · Yêu cầu bị từ chối' : ''}</div><div class="member-crit"><span>◷ Rảnh ${escapeValue(member.free_hours)} giờ</span> · <span>⌖ ${escapeValue(member.address)}</span> · <span>▣ ≤${Number(member.budget).toLocaleString('vi-VN')} ₫</span> · <span>✦ ${escapeValue(member.category_names.join(', '))}</span><span>${escapeValue(online)}</span></div></div></button>${readyButton}</div>`;
    }).join('');
    const lifecycleActions = document.getElementById('groupLifecycleActions');
    lifecycleActions.innerHTML = '';
    const startButton = document.querySelector('#createdMembers > button.btn-block');
    startButton.disabled = !currentGroup.is_host || !currentGroup.all_ready || currentGroup.search_started;
    startButton.textContent = currentGroup.search_started ? 'Đã tìm hoạt động phù hợp' : currentGroup.all_ready ? 'Tìm hoạt động phù hợp cho cả nhóm' : 'Chờ tất cả thành viên sẵn sàng';
    renderGroupHistory();
  };

  window.toggleMemberReady = async function (index) {
    const member = groupMembers[index];
    if (!member || member.user_id !== currentUser?.user_id) return;
    try {
      applyGroup(await api.request(`/groups/${currentGroup.group_id}/members/${member.member_id}/ready`, {
        method: 'PATCH', body: { is_ready: !member.is_ready },
      }));
    } catch (error) { alert(error.message); }
  };

  window.requestGroupLeave = async function (index) {
    const member = groupMembers[index];
    if (!member || currentGroup.is_host || member.user_id !== currentUser?.user_id) return;
    try {
      applyGroup(await api.request(`/groups/${currentGroup.group_id}/members/${member.member_id}/leave-request`, { method: 'POST' }));
      alert('Yêu cầu từ chối tham gia đã được gửi và đang chờ host duyệt.');
    }
    catch (error) { alert(error.message); }
  };
  window.resolveGroupLeave = async function (index, action) {
    const member = groupMembers[index];
    if (!currentGroup?.is_host || !member) return;
    try { applyGroup(await api.request(`/groups/${currentGroup.group_id}/members/${member.member_id}/leave-request`, { method: 'PATCH', body: { action } })); }
    catch (error) { alert(error.message); }
  };

  window.openGroupActionConfirm = function (action) {
    if (action === 'rejectActivity' && (!currentGroup?.selected_activity || currentGroup.is_host || ownMember()?.confirmation_status !== 'pending')) return;
    if (action === 'leave' && (!currentGroup || currentGroup.is_host)) return;
    if (action === 'deleteActivity' && (!currentGroup?.is_host || !currentGroup.selected_activity)) return;
    pendingGroupAction = action;
    document.getElementById('groupActionConfirmTitle').textContent = 'Xác nhận';
    document.getElementById('groupActionConfirmText').textContent = action === 'rejectActivity'
      ? 'Bạn có chắc chắn muốn từ chối hoạt động? Nếu từ chối, bạn sẽ bị thoát khỏi nhóm.'
      : `Bạn có chắc chắn muốn "${action === 'leave' ? 'Từ chối tham gia' : 'Xóa hoạt động'}"?`;
    document.getElementById('confirmGroupActionButton').textContent = action === 'rejectActivity' ? 'Từ chối và rời nhóm' : 'Chắc chắn';
    document.getElementById('groupActionConfirm').classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  window.closeGroupActionConfirm = function () {
    pendingGroupAction = null;
    document.getElementById('groupActionConfirm').classList.remove('open');
    document.body.style.overflow = '';
  };

  window.confirmGroupAction = async function () {
    const action = pendingGroupAction;
    closeGroupActionConfirm();
    if (action === 'rejectActivity') {
      await respondToActivity('reject');
      return;
    }
    if (action === 'leave') {
      const index = groupMembers.findIndex(member => member.user_id === currentUser?.user_id);
      if (index >= 0) await requestGroupLeave(index);
      return;
    }
    if (action === 'deleteActivity') {
      alert('Chưa thể xóa hoạt động đã chọn vì API hiện tại chưa hỗ trợ thao tác này. Chưa có thay đổi nào được lưu.');
    }
  };

  window.respondToActivity = async function (action) {
    const member = ownMember();
    if (!member || !currentGroup?.selected_activity) return;
    try {
      const group = await api.request(`/groups/${currentGroup.group_id}/members/${member.member_id}/confirmation`, {
        method: 'PATCH', body: { action },
      });
      if (action === 'reject') {
        alert('Bạn đã rời khỏi nhóm.');
        returnToGroupList();
      } else {
        applyGroup(group);
      }
    } catch (error) {
      alert(error.message);
    }
  };

  async function renderGroupHistory() {
    const list = document.getElementById('yourGroupsList');
    if (!list) return;
    try {
      const rows = await api.request('/groups/me?limit=500');
      const names = getGroupNames();
      if (!rows.length) {
        list.innerHTML = '<p class="your-groups-empty">Bạn chưa tạo hoặc tham gia nhóm nào.</p>';
        return;
      }
      list.innerHTML = rows.map(group => {
        const createdAt = group.created_at ? new Date(group.created_at).toLocaleDateString('vi-VN') : 'Không rõ';
        const role = group.is_host ? 'Host' : 'Thành viên';
        return `<button type="button" class="your-group-card" onclick="openPastGroup('${escapeValue(group.invite_code)}')"><span><span class="your-group-name">${escapeValue(displayGroupName(group, names))}</span><span class="your-group-meta"><span>Ngày lập: ${escapeValue(createdAt)}</span><span>${Number(group.members.length)} thành viên</span></span></span><span class="your-group-role">${role}</span></button>`;
      }).join('');
    } catch (error) {
      list.innerHTML = `<p class="your-groups-empty">Không tải được danh sách nhóm: ${escapeValue(error.message)}</p>`;
    }
  }

  window.openPastGroup = async function (code) {
    try {
      const group = await api.request(`/groups/invite/${encodeURIComponent(code)}`);
      sessionStorage.setItem('pending_group_invite', group.invite_code);
      applyGroup(group);
      connectRealtime();
    }
    catch (error) { alert(error.message); }
  };

  window.returnToGroupList = function () {
    if (socket) {
      socket.onclose = null;
      socket.close();
      socket = null;
    }
    clearTimeout(reconnectTimer);
    currentGroup = null;
    activeGroupId = null;
    groupMembers = [];
    selectedActivity = null;
    recommendations = [];
    recommendationsLoadedForGroup = null;
    recommendationsLoadGroupId = null;
    recommendationsLoadPromise = null;
    document.getElementById('groupWorkspace').classList.add('group-home-mode');
    document.getElementById('groupHome').style.display = 'block';
    history.replaceState(null, '', location.pathname);
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(button => button.classList.remove('active'));
    renderGroupHistory();
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    if (name === 'expense' && !currentGroup?.confirmation_complete) return;
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

  function sameActivityId(left, right) {
    return left != null && right != null && String(left) === String(right);
  }

  function updateExpenseButton() {
    const button = document.getElementById('resultExpenseButton');
    if (!button) return;
    const canViewExpenses = Boolean(currentGroup?.confirmation_complete);
    button.disabled = !canViewExpenses;
    document.querySelector('.tab-btn[data-tab="expense"]').disabled = !canViewExpenses;
    button.textContent = canViewExpenses
      ? 'Xem chia chi phí'
      : currentGroup?.selected_activity
        ? 'Chờ tất cả thành viên đồng ý'
        : 'Chia chi phí sau khi chốt hoạt động';
  }

  function renderSelectedActivity(activity) {
    selectedActivity = activity;
    const view = activityView(activity);
    const self = ownMember();
    const waiting = groupMembers.filter(member => member.confirmation_status !== 'accepted').length;
    const ownDecision = !currentGroup.is_host && self?.confirmation_status === 'pending'
      ? `<div class="group-actions"><button class="btn btn-primary" type="button" onclick="respondToActivity('accept')">Đồng ý</button><button class="btn btn-secondary" type="button" onclick="openGroupActionConfirm('rejectActivity')">Từ chối</button></div>`
      : '';
    const confirmations = groupMembers.map(member => `<div class="group-vote-row"><span>${escapeValue(member.name)}${member.is_host ? ' · Host' : ''}</span><span class="group-vote-choice">${member.confirmation_status === 'accepted' ? 'Đã đồng ý' : 'Đang chờ xác nhận'}</span></div>`).join('');
    document.getElementById('groupVoteSummary').innerHTML = `<div class="group-vote-summary"><h3>Xác nhận hoạt động</h3>${confirmations}<p class="section-sub" style="margin:10px 0 0">${waiting ? `Còn ${waiting} thành viên chưa xác nhận.` : 'Mọi người đã đồng ý. Đang mở bước chia chi phí.'}</p>${ownDecision}</div>`;
    document.getElementById('bestMatch').innerHTML = `<div class="group-avg"><div class="lbl">Hoạt động được chọn</div></div><button class="suggestion-card" type="button" onclick="openActivityPopup('${escapeValue(view.id)}')" style="width:100%;text-align:left;"><div class="activity-title">✓ ${escapeValue(view.name)}</div><div class="activity-biz">${escapeValue(view.address)} · ${escapeValue(view.price)}</div><div class="member-crit">★ ${view.rating ?? '—'} · ${escapeValue(view.hours)} · ${escapeValue(view.categories)}</div></button>`;
    updateExpenseButton();
    renderExpense();
  }

  function ownMember() {
    return groupMembers.find(member => member.user_id === currentUser?.user_id);
  }

  function renderVoteSummary() {
    const container = document.getElementById('groupVoteSummary');
    if (!currentGroup?.search_started || currentGroup.selected_activity || !recommendations.length) {
      container.innerHTML = '';
      return;
    }
    const allVoted = groupMembers.every(member => member.activity_vote_id);
    const choices = new Set(groupMembers.map(member => member.activity_vote_id).filter(Boolean));
    const choiceRows = groupMembers.map(member => {
      const choice = recommendations.find(activity => sameActivityId(activity.activity_id, member.activity_vote_id));
      return `<div class="group-vote-row"><span>${escapeValue(member.name)}${member.is_host ? ' · Host' : ''}</span><span class="group-vote-choice">${choice ? escapeValue(choice.name) : 'Chưa chọn'}</span></div>`;
    }).join('');
    let hostAction = '';
    if (currentGroup.is_host && allVoted && choices.size === 1) {
      hostAction = `<button class="btn btn-primary" type="button" onclick="selectActivity('${escapeValue([...choices][0])}')">Chốt lựa chọn chung</button>`;
    } else if (currentGroup.is_host && allVoted && choices.size > 1) {
      hostAction = '<button class="btn btn-primary" type="button" onclick="randomizeGroupActivity()">Random trong các hoạt động thành viên đã chọn</button>';
    }
    const progress = groupMembers.filter(member => member.activity_vote_id).length;
    const status = allVoted
      ? choices.size === 1 ? 'Tất cả thành viên đã chọn cùng một hoạt động.' : 'Các lựa chọn khác nhau. Host có thể random trong những hoạt động đã được chọn.'
      : `Đã có ${progress}/${groupMembers.length} thành viên chọn hoạt động.`;
    container.innerHTML = `<div class="group-vote-summary"><h3>Tổng hợp lựa chọn của thành viên</h3>${choiceRows}<p class="section-sub" style="margin:10px 0 0">${status}</p>${hostAction ? `<div class="group-actions">${hostAction}</div>` : ''}</div>`;
  }

  async function loadGroupRecommendations() {
    const group = currentGroup;
    if (!group?.search_started) return false;
    if (recommendationsLoadedForGroup === group.group_id) return recommendations.length > 0;
    if (recommendationsLoadPromise && recommendationsLoadGroupId === group.group_id) {
      return recommendationsLoadPromise;
    }

    recommendationsLoadGroupId = group.group_id;
    const loadPromise = (async () => {
      const results = await api.request(`/groups/${group.group_id}/recommendations`);
      if (currentGroup?.group_id !== group.group_id || !currentGroup.search_started) return false;
      recommendations = results;
      recommendationsLoadedForGroup = group.group_id;
      const best = recommendations[0];
      if (currentGroup.selected_activity) {
        renderSelectedActivity(currentGroup.selected_activity);
      } else if (best) {
        renderBestMatch(best, false);
        document.getElementById('suggestionCards').innerHTML = recommendations.slice(1).map(suggestionCard).join('');
        document.getElementById('suggestions').style.display = recommendations.length > 1 ? 'block' : 'none';
        document.getElementById('suggestionsToggle').textContent = 'Ẩn gợi ý';
        renderVoteSummary();
      } else {
        document.getElementById('bestMatch').innerHTML = '<p class="section-sub" style="margin:0">Chưa tìm thấy hoạt động phù hợp cho cả nhóm.</p>';
        document.getElementById('suggestionCards').innerHTML = '';
        document.getElementById('groupVoteSummary').innerHTML = '';
      }
      if (currentGroup.selected_activity) {
        document.getElementById('suggestionCards').innerHTML = recommendations
          .filter(activity => !sameActivityId(activity.activity_id, currentGroup.selected_activity.activity_id))
          .map(suggestionCard).join('');
      }
      document.getElementById('group-result').style.display = 'block';
      return Boolean(best);
    })();
    recommendationsLoadPromise = loadPromise;
    try {
      return await loadPromise;
    } finally {
      if (recommendationsLoadPromise === loadPromise) {
        recommendationsLoadPromise = null;
        recommendationsLoadGroupId = null;
      }
    }
  }

  window.showGroupResult = async function () {
    if (!currentGroup) return;
    try {
      if (!currentGroup.is_host) throw new Error('Chỉ host được bắt đầu tìm hoạt động.');
      if (!currentGroup.all_ready) throw new Error('Tất cả thành viên cần nhấn sẵn sàng trước.');
      if (!currentGroup.search_started) applyGroup(await api.request(`/groups/${currentGroup.group_id}/start`, { method: 'POST' }));
      const hasRecommendations = await loadGroupRecommendations();
      if (!hasRecommendations) {
        alert('Không tìm thấy hoạt động phù hợp cho nhóm.');
      }
    } catch (error) {
      alert(error.message);
    }
  };

  function renderBestMatch(activity, persist) {
    selectedActivity = activity;
    const view = activityView(activity);
    document.getElementById('bestMatch').innerHTML = `<div class="group-avg"><div class="pct">${Number(view.score ?? 0)}%</div><div class="lbl">Hoạt động phù hợp nhất cho cả nhóm</div></div>${recommendationCard(activity, true)}`;
    updateExpenseButton();
    if (!persist) renderExpense();
  }

  function recommendationCard(activity, best = false) {
    const view = activityView(activity);
    const vote = sameActivityId(ownMember()?.activity_vote_id, view.id);
    const action = ownMember()
      ? `<button class="btn ${vote ? 'btn-secondary' : 'btn-primary'}" type="button" onclick="voteActivity('${escapeValue(view.id)}')">${vote ? 'Đã chọn · Đổi lựa chọn' : 'Tôi thích hoạt động này'}</button>`
      : '';
    return `<div class="suggestion-card" style="display:flex;flex-direction:column;gap:12px;"><button type="button" onclick="openActivityPopup('${escapeValue(view.id)}')" style="width:100%;text-align:left;border:0;background:transparent;padding:0;color:inherit;cursor:pointer;"><div class="activity-title">${best ? '✨ ' : ''}${escapeValue(view.name)}</div><div class="activity-biz">${escapeValue(view.address)} · ${escapeValue(view.price)}</div><div class="member-crit">★ ${view.rating ?? '—'} · ${escapeValue(view.hours)} · ${escapeValue(view.categories)} · ${view.score}% phù hợp</div></button>${action}</div>`;
  }

  function suggestionCard(activity) {
    return recommendationCard(activity);
  }

  window.voteActivity = async function (activityId) {
    const member = ownMember();
    if (!member || currentGroup.selected_activity) return;
    const activity = findActivity(activityId);
    if (!activity) {
      alert('Không tìm thấy hoạt động để ghi nhận lựa chọn. Hãy tải lại gợi ý và thử lại.');
      return;
    }
    try {
      applyGroup(await api.request(`/groups/${currentGroup.group_id}/members/${member.member_id}/vote`, {
        method: 'POST', body: { activity_id: activity.activity_id },
      }));
      renderVoteSummary();
      document.getElementById('bestMatch').innerHTML = recommendations[0]
        ? `<div class="group-avg"><div class="pct">${Number(recommendations[0].match_score ?? 0)}%</div><div class="lbl">Hoạt động phù hợp nhất cho cả nhóm</div></div>${recommendationCard(recommendations[0], true)}`
        : '';
      document.getElementById('suggestionCards').innerHTML = recommendations.slice(1).map(suggestionCard).join('');
      closeActivityPopup();
    } catch (error) {
      alert(error.message);
    }
  };

  window.randomizeGroupActivity = async function () {
    if (!currentGroup?.is_host) return;
    try {
      applyGroup(await api.request(`/groups/${currentGroup.group_id}/randomize`, { method: 'POST' }));
    } catch (error) {
      alert(error.message);
    }
  };

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
      renderSelectedActivity(currentGroup.selected_activity);
      document.getElementById('suggestions').style.display = 'none';
      document.getElementById('suggestionsToggle').textContent = 'Xem gợi ý khác';
      closeActivityPopup();
    } catch (error) {
      alert(error.message);
    }
  };

  function findActivity(id) {
    if (sameActivityId(selectedActivity?.activity_id, id)) return selectedActivity;
    return recommendations.find(item => sameActivityId(item.activity_id, id));
  }

  window.openActivityPopup = function (id) {
    const activity = findActivity(id);
    if (!activity) return;
    const view = activityView(activity);
    const image = view.media_url
      ? `<img src="${escapeValue(view.media_url)}" alt="${escapeValue(view.name)}" style="width:100%;height:180px;object-fit:cover;border-radius:12px;">`
      : '<div style="font-size:42px;text-align:center;background:#F3D9A6;border-radius:12px;padding:20px;">✨</div>';
    const member = ownMember();
    const selectedVote = sameActivityId(member?.activity_vote_id, id);
    const selectButton = member && !currentGroup.selected_activity
      ? `<button type="button" class="btn ${selectedVote ? 'btn-secondary' : 'btn-primary'}" onclick="voteActivity('${escapeValue(id)}')">${selectedVote ? 'Đã chọn · Đổi lựa chọn' : 'Tôi thích hoạt động này'}</button>`
      : '';
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

  async function initializeGroupPage() {
    if (userSessionStarted) return;
    userSessionStarted = true;
    try {
      [currentUser, categories] = await Promise.all([
        api.requireUser(),
        api.request('/categories'),
      ]);
      if (!categories.length) throw new Error('Hệ thống chưa có danh mục sở thích.');
      renderGroupHistory();
      if (inviteCode) {
        try {
          applyGroup(await api.request(`/groups/invite/${encodeURIComponent(inviteCode)}`));
          sessionStorage.removeItem('pending_group_invite');
          connectRealtime();
        } catch (error) {
          if (error.status !== 403) throw error;
          openJoinProfileModal();
        }
      }
    } catch (error) {
      userSessionStarted = false;
      alert(error.message);
    }
  }

  function openJoinProfileModal() {
    joinMode = true;
    document.getElementById('groupModalTitle').textContent = 'Tham gia nhóm';
    document.querySelector('#groupModalTitle + p').textContent = 'Nhập thông tin của bạn để tham gia nhóm.';
    document.querySelector('#groupFormStep .group-actions .btn-primary').textContent = 'Vào nhóm';
    document.querySelector('#groupOverlay .add-member-btn').style.display = 'none';
    openGroupModal();
  }

  window.declineGroupInvite = function () {
    if (sessionStorage.getItem('pending_group_invite') === inviteCode) {
      sessionStorage.removeItem('pending_group_invite');
    }
    document.getElementById('groupInviteConsent').classList.remove('open');
    location.replace('home.html');
  };

  window.acceptGroupInvite = function () {
    if (!inviteCode) return;
    sessionStorage.setItem('pending_group_invite', inviteCode);
    document.getElementById('groupInviteConsent').classList.remove('open');
    if (!localStorage.getItem('token')) {
      location.href = `../log-in.html?groupInvite=${encodeURIComponent(inviteCode)}`;
      return;
    }
    initializeGroupPage();
  };

  async function initialize() {
    try {
      if (!inviteCode && incomingGroupSlug) {
        const resolved = await api.request(`/groups/slug/${encodeURIComponent(incomingGroupSlug)}`);
        inviteCode = resolved.invite_code;
      }
      if (inviteCode && sessionStorage.getItem('pending_group_invite') !== inviteCode) {
        document.getElementById('groupInviteConsent').classList.add('open');
        return;
      }
      initializeGroupPage();
    } catch (error) {
      console.error('Không thể mở link nhóm:', error);
      alert(error.message || 'Không tìm thấy nhóm hoặc link mời không còn hợp lệ.');
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
  document.getElementById('groupActionConfirm').addEventListener('click', function (event) {
    if (event.target === this) closeGroupActionConfirm();
  });
  window.addEventListener('beforeunload', () => socket?.close());
  // Quay lại tab sau một lúc: đồng bộ ngay và nối lại kết nối realtime nếu đã rớt.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !currentGroup) return;
    refreshGroup();
    if (!socket || socket.readyState > WebSocket.OPEN) connectRealtime();
  });
  setInterval(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) refreshGroup();
  }, 8000);
  setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) socket.send('ping');
  }, 25000);

  selectTab('matching');
  initialize();
})();
