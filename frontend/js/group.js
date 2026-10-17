(function () {
  'use strict';

  const api = window.CustomerAPI;
  const params = new URLSearchParams(location.search);
  // Link mời: /g/<mã mời> (link ngắn), /g/<tên>--<mã> (link cũ) hoặc ?groupInvite=<mã>.
  function inviteCodeFromPath() {
    const segment = decodeURIComponent(location.pathname).match(/\/g\/([^/]+)\/?$/)?.[1];
    if (!segment) return null;
    const legacy = segment.match(/--([A-Za-z0-9]+)$/);
    if (legacy) return legacy[1];
    return /^[A-Za-z0-9]+$/.test(segment) ? segment : null;
  }
  const inviteCode = params.get('groupInvite') || inviteCodeFromPath();
  // pending_group_invite: chỉ dùng cho lời mời người dùng đã bấm "Đồng ý" (đi qua đăng nhập).
  // Nhóm đang xem lưu riêng, để lần đăng nhập sau (tài khoản khác) không bị đưa vào nhóm này.
  const VIEWING_KEY = 'f2d:viewing-group';
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
  let refreshPending = false;
  let pendingGroupAction = null;
  let userSessionStarted = false;
  let recommendationsLoadedForGroup = null;
  let recommendationsLoadGroupId = null;
  let recommendationsLoadPromise = null;
  let activeGroupId = null;

  const escapeValue = value => api.escapeHTML(value ?? '');
  const money = value => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
  const categoryName = id => categories.find(item => item.category_id === id)?.name || id;

  function displayGroupName(group) {
    if (typeof group.group_name === 'string' && group.group_name.trim()) return group.group_name.trim();
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

  // Vị trí thành viên: nút GPS hoặc địa chỉ gõ tay được tra trên bản đồ (cùng API trang tìm kiếm) trước khi lưu.
  // Tọa độ đã có nằm ở data-lat/data-lng của ô; sửa chữ trong ô thì xóa để tra lại.
  const GPS_LABEL = 'Vị trí hiện tại (GPS)';
  function addressField(attrs, member = null) {
    const coords = member?.latitude != null && member?.longitude != null ? ` data-lat="${member.latitude}" data-lng="${member.longitude}"` : '';
    return `<input ${attrs} data-address value="${escapeValue(member?.address || '')}"${coords} required placeholder="Ví dụ: Dương Nội, Hà Đông"><button type="button" class="g-loc-gps" data-gps>📍 Dùng vị trí hiện tại</button><small class="g-loc-hint" aria-live="polite"></small>`;
  }
  const locationHint = (input, text) => { const hint = input.parentElement.querySelector('.g-loc-hint'); if (hint) hint.textContent = text; };
  document.addEventListener('input', event => {
    if (!event.target.matches('[data-address]')) return;
    delete event.target.dataset.lat; delete event.target.dataset.lng;
    locationHint(event.target, '');
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-gps]');
    if (!button) return;
    const input = button.parentElement.querySelector('[data-address]');
    if (!navigator.geolocation) { F2D.toast('Trình duyệt không hỗ trợ định vị.', 'error'); return; }
    locationHint(input, 'Đang lấy vị trí...');
    navigator.geolocation.getCurrentPosition(position => {
      input.value = GPS_LABEL;
      input.dataset.lat = position.coords.latitude; input.dataset.lng = position.coords.longitude;
      locationHint(input, '✓ Đã lấy vị trí GPS của bạn');
    }, () => { locationHint(input, ''); F2D.toast('Không lấy được vị trí. Hãy cho phép truy cập vị trí hoặc nhập địa chỉ.', 'error'); },
    { enableHighAccuracy: true, timeout: 10000 });
  });
  async function resolveAddress(input) {
    const address = input.value.trim();
    if (input.dataset.lat && input.dataset.lng) return { address, latitude: Number(input.dataset.lat), longitude: Number(input.dataset.lng) };
    if (address.length < 3) throw new Error('Địa chỉ quá ngắn. Hãy nhập rõ phường/quận hoặc dùng vị trí hiện tại.');
    let result;
    try { result = await api.request(`/search/location?query=${encodeURIComponent(address)}`); }
    catch (error) { throw new Error(`Không tìm thấy “${address}” trên bản đồ. Hãy nhập rõ hơn (phường, quận) hoặc dùng vị trí hiện tại.`); }
    input.dataset.lat = result.latitude; input.dataset.lng = result.longitude;
    locationHint(input, `✓ ${result.display_name}`);
    return { address, latitude: result.latitude, longitude: result.longitude };
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
      <label>Địa chỉ${addressField('name="member-address"')}</label>
      <label>Ngân sách tối đa<input name="member-budget" type="number" min="0" step="1000" required placeholder="Ví dụ: 200000"></label>
      <div class="interest-input"><label>Sở thích</label><div class="interest-chips">${interestOptions('member-interests')}</div></div>
    </div>`;
    form.querySelector('.remove-member-btn').style.display = 'none';
    document.getElementById('memberForms').appendChild(form);
  };

  window.removeMemberForm = function (button) {
    const form = button.closest('.member-form');
    if (form.dataset.host === 'true') {
      F2D.toast('Thành viên số 1 là host và không thể xóa.', 'error');
      return;
    }
    if (document.querySelectorAll('#memberForms .member-form').length === 1) {
      F2D.toast('Nhóm cần ít nhất một thành viên.', 'error');
      return;
    }
    form.remove();
  };

  // Link rút gọn cùng domain với web: https://<domain>/g/<mã mời>.
  function inviteUrl(group) {
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
      F2D.toast('Hãy nhập thông tin và tạo nhóm trước khi sao chép link mời.', 'error');
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
      F2D.toast('Vui lòng nhập đầy đủ thông tin cho tất cả thành viên.', 'error');
      return;
    }
    try {
      const joining = joinMode;
      const groupName = document.getElementById('groupNameInput').value.trim();
      if (!joining && !groupName) {
        F2D.toast('Vui lòng nhập tên nhóm.', 'error');
        return;
      }
      for (const [index, form] of forms.entries()) {
        Object.assign(members[index], await resolveAddress(form.querySelector('[name="member-address"]')));
      }
      currentGroup = joining
        ? await api.request(`/groups/invite/${encodeURIComponent(inviteCode)}/join`, { method: 'POST', body: members[0] })
        : await api.request('/groups', { method: 'POST', body: { host: members[0], group_name: groupName } });
      if (!joining) sessionStorage.setItem(VIEWING_KEY, currentGroup.invite_code);
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
      F2D.toast(error.message, 'error');
    }
  };

  function applyGroup(group) {
    const groupChanged = activeGroupId !== group.group_id;
    if (groupChanged) {
      recommendations = [];
      recommendationsLoadedForGroup = null;
      recommendationsLoadGroupId = null;
      recommendationsLoadPromise = null;
      document.getElementById('group-result').style.display = 'none';
      document.getElementById('groupVoteSummary').innerHTML = '';
      document.getElementById('bestMatch').innerHTML = '';
      document.getElementById('suggestionCards').innerHTML = '';
      document.getElementById('suggestions').style.display = 'none';
      document.getElementById('suggestionsToggle').style.display = 'none';
      document.getElementById('suggestionsToggle').textContent = 'Xem gợi ý khác';
    }
    activeGroupId = group.group_id;
    currentGroup = group;
    groupMembers = group.members;
    selectedActivity = group.selected_activity;
    document.getElementById('groupHome').style.display = 'none';
    document.getElementById('groupWorkspace').classList.remove('group-home-mode');
    document.getElementById('currentGroupTitle').textContent = displayGroupName(group);
    document.getElementById('createdMembers').style.display = 'block';
    document.getElementById('deleteGroupSection').hidden = !group.is_host;
    if (groupChanged) selectTab('matching');
    document.getElementById('inviteLink').value = inviteUrl(group);
    document.getElementById('groupInviteToolbar').style.display = 'flex';
    document.getElementById('groupLinkStatus').textContent = '';
    // Giữ đúng thư mục trang (link tương đối như home.html vẫn chạy); link rút gọn chỉ dùng khi sao chép.
    if (!/\/g\//.test(location.pathname)) history.replaceState(null, '', `${location.pathname}?groupInvite=${encodeURIComponent(group.invite_code)}`);
    renderCreatedMembers();
    renderExpense();
    updateExpenseButton();
    if (!group.search_started) {
      recommendationsLoadedForGroup = null;
      recommendations = [];
      document.getElementById('group-result').style.display = 'none';
    } else if (group.selected_activity) {
      renderSelectedActivity(group.selected_activity);
      document.getElementById('group-result').style.display = 'block';
    } else if (recommendationsLoadedForGroup === group.group_id) {
      document.getElementById('group-result').style.display = 'block';
      renderRecommendations();
      renderVoteSummary();
    } else if (recommendationsLoadedForGroup !== group.group_id) {
      document.getElementById('group-result').style.display = 'block';
      loadGroupRecommendations().catch(error => console.warn('Không thể tải gợi ý hoạt động:', error.message));
    }
    if (group.search_started) syncDecisionWidget();
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
    } catch (error) { F2D.toast(error.message, 'error'); }
  };

  window.requestGroupLeave = async function (index) {
    const member = groupMembers[index];
    if (!member || currentGroup.is_host || member.user_id !== currentUser?.user_id) return;
    try {
      applyGroup(await api.request(`/groups/${currentGroup.group_id}/members/${member.member_id}/leave-request`, { method: 'POST' }));
      F2D.toast('Yêu cầu từ chối tham gia đã được gửi và đang chờ host duyệt.');
    }
    catch (error) { F2D.toast(error.message, 'error'); }
  };
  window.resolveGroupLeave = async function (index, action) {
    const member = groupMembers[index];
    if (!currentGroup?.is_host || !member) return;
    try { applyGroup(await api.request(`/groups/${currentGroup.group_id}/members/${member.member_id}/leave-request`, { method: 'PATCH', body: { action } })); }
    catch (error) { F2D.toast(error.message, 'error'); }
  };

  window.openGroupActionConfirm = function (action) {
    if (action === 'rejectActivity' && (!currentGroup?.selected_activity || currentGroup.is_host || ownMember()?.confirmation_status !== 'pending')) return;
    if (action === 'leave' && (!currentGroup || currentGroup.is_host)) return;
    if (action === 'deleteActivity' && (!currentGroup?.is_host || !currentGroup.selected_activity)) return;
    if (action === 'deleteGroup' && (!currentGroup?.is_host || currentGroup.status !== 'active')) return;
    if (action === 'closeVoting' && (!currentGroup?.is_host || currentGroup.voting_closed)) return;
    pendingGroupAction = action;
    document.getElementById('groupActionConfirmTitle').textContent = action === 'rejectActivity' ? 'Bạn chắc chắn KHÔNG tham gia hoạt động?' : action === 'deleteGroup' ? 'Xác nhận xóa nhóm' : action === 'closeVoting' ? 'Đóng bình chọn?' : 'Xác nhận';
    document.getElementById('groupActionConfirmText').textContent = action === 'rejectActivity'
      ? 'Nếu không tham gia, bạn sẽ tự động bị thoát khỏi nhóm.'
      : action === 'deleteGroup'
        ? 'Bạn có chắc chắn muốn xóa nhóm này?'
      : action === 'closeVoting'
        ? 'Sau khi đóng, thành viên không thể đổi phiếu nữa và nhóm sẽ chốt kết quả bình chọn.'
      : `Bạn có chắc chắn muốn "${action === 'leave' ? 'Từ chối tham gia' : 'Xóa hoạt động'}"?`;
    document.getElementById('confirmGroupActionButton').textContent = action === 'rejectActivity' ? 'Xác nhận' : action === 'closeVoting' ? 'Đóng bình chọn' : 'Chắc chắn';
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
    if (action === 'closeVoting') {
      try {
        applyGroup(await api.request(`/groups/${currentGroup.group_id}/voting/close`, { method: 'POST' }));
      } catch (error) {
        F2D.toast(error.message, 'error');
      }
      return;
    }
    if (action === 'deleteActivity') {
      F2D.toast('Chưa thể xóa hoạt động đã chọn vì API hiện tại chưa hỗ trợ thao tác này. Chưa có thay đổi nào được lưu.', 'error');
      return;
    }
    if (action === 'deleteGroup') {
      try {
        await api.request(`/groups/${currentGroup.group_id}`, { method: 'DELETE' });
        if (socket) {
          socket.onclose = null;
          socket.close();
          socket = null;
        }
        clearTimeout(reconnectTimer);
        currentGroup = null;
        returnToGroupList();
      } catch (error) {
        F2D.toast(error.message, 'error');
      }
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
        F2D.toast('Bạn đã rời khỏi nhóm.');
        returnToGroupList();
      } else {
        applyGroup(group);
      }
    } catch (error) {
      F2D.toast(error.message, 'error');
    }
  };

  async function renderGroupHistory() {
    const list = document.getElementById('yourGroupsList');
    if (!list) return;
    try {
      const rows = await api.request('/groups/me?limit=500');
      if (!rows.length) {
        list.innerHTML = '<p class="your-groups-empty">Bạn chưa tạo hoặc tham gia nhóm nào.</p>';
        return;
      }
      list.innerHTML = rows.map(group => {
        const createdAt = F2D.date(group.created_at, 'Không rõ');
        const role = group.is_host ? 'Host' : 'Thành viên';
        return `<button type="button" class="your-group-card" onclick="openPastGroup('${escapeValue(group.invite_code)}')"><span><span class="your-group-name">${escapeValue(displayGroupName(group))}</span><span class="your-group-meta"><span>Ngày lập: ${escapeValue(createdAt)}</span><span>${Number(group.members.length)} thành viên</span></span></span><span class="your-group-role">${role}</span></button>`;
      }).join('');
    } catch (error) {
      list.innerHTML = `<p class="your-groups-empty">Không tải được danh sách nhóm: ${escapeValue(error.message)}</p>`;
    }
  }

  window.openPastGroup = async function (code) {
    try {
      const group = await api.request(`/groups/invite/${encodeURIComponent(code)}`);
      sessionStorage.setItem(VIEWING_KEY, group.invite_code);
      applyGroup(group);
      connectRealtime();
    }
    catch (error) { F2D.toast(error.message, 'error'); }
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
      F2D.toast('Bạn chỉ được sửa thông tin của mình.', 'error');
      return;
    }
    editingMemberIndex = index;
    document.getElementById('memberEditTitle').textContent = member.name;
    document.getElementById('memberEditAvatar').textContent = member.name.charAt(0).toUpperCase();
    document.getElementById('memberEditFields').innerHTML = `<label class="member-edit-field">Tên<input id="edit-name" value="${escapeValue(member.name)}"></label><label class="member-edit-field">Rảnh mấy giờ<input id="edit-hours" type="number" min="0.5" max="24" step="0.5" value="${escapeValue(member.free_hours)}"></label><label class="member-edit-field">Địa chỉ${addressField('id="edit-address"', member)}</label><label class="member-edit-field">Ngân sách tối đa<input id="edit-budget" type="number" min="0" step="1000" value="${escapeValue(member.budget)}"></label><div class="member-edit-interests"><label>Sở thích</label><div class="interest-chips">${interestOptions('edit-interests', member.category_ids)}</div></div>`;
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
      F2D.toast('Vui lòng nhập đầy đủ thông tin thành viên.', 'error');
      return;
    }
    try {
      Object.assign(payload, await resolveAddress(document.getElementById('edit-address')));
      applyGroup(await api.request(`/groups/${currentGroup.group_id}/members/${member.member_id}`, { method: 'PATCH', body: payload }));
      closeMemberEdit();
      if (document.getElementById('group-result').style.display === 'block') await showGroupResult();
    } catch (error) {
      F2D.toast(error.message, 'error');
    }
  };

  window.selectTab = function (name) {
    if (name === 'expense' && !currentGroup?.confirmation_complete) return;
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.toggle('active', pane.id === `pane-${name}`));
    document.querySelectorAll('.tab-btn').forEach(button => button.classList.toggle('active', button.dataset.tab === name));
    if (name === 'expense') renderExpense();
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
      logo_url: activity.business_logo_url,
      score: activity.match_score,
      distance: activity.distance_km,
    };
  }

  // Ảnh vuông bo góc: logo doanh nghiệp -> ảnh bìa -> biểu tượng.
  function thumbHTML(view, size = 48) {
    const url = view.logo_url || view.media_url;
    const box = `width:${size}px;height:${size}px;border-radius:${Math.round(size / 4)}px;flex:0 0 auto;`;
    return url
      ? `<img class="g-thumb" src="${escapeValue(url)}" alt="" style="${box}object-fit:cover;" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'g-thumb g-thumb-empty',textContent:'✨',style:'${box}'}))">`
      : `<div class="g-thumb g-thumb-empty" style="${box}">✨</div>`;
  }

  function myVotes() {
    return new Set(ownMember()?.vote_activity_ids || []);
  }

  function tallyFor(activityId) {
    return (currentGroup?.vote_tally || []).find(row => sameActivityId(row.activity_id, activityId));
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
      ? 'Tất cả các thành viên đã xác nhận tham gia. Chia chi phí'
      : currentGroup?.selected_activity
        ? 'Chờ tất cả thành viên đồng ý'
        : 'Chia chi phí sau khi chốt hoạt động';
  }

  function renderSelectedActivity(activity) {
    selectedActivity = activity;
    const view = activityView(activity);
    const self = ownMember();
    const ownDecision = !currentGroup.is_host && self?.confirmation_status === 'pending'
      ? `<p class="section-sub" style="margin:12px 0 0">Bạn có xác nhận tham gia hoạt động này không?</p><div class="group-actions"><button class="btn btn-primary" type="button" onclick="respondToActivity('accept')">Xác nhận tham gia</button><button class="btn btn-secondary" type="button" onclick="openGroupActionConfirm('rejectActivity')">Không tham gia</button></div>`
      : '';
    const confirmations = groupMembers.map(member => `<div class="group-vote-row"><span>${escapeValue(member.name)}${member.is_host ? ' · Host' : ''}</span><span class="group-vote-choice">${member.confirmation_status === 'accepted' ? 'Đã đồng ý' : 'Đang chờ xác nhận'}</span></div>`).join('');
    document.getElementById('groupVoteSummary').innerHTML = `<div class="group-vote-summary"><h3>Xác nhận hoạt động</h3>${confirmations}${ownDecision}</div>`;
    document.getElementById('bestMatch').innerHTML = `<button class="suggestion-card g-row-card" type="button" onclick="openActivityPopup('${escapeValue(view.id)}')" style="width:100%;text-align:left;">${thumbHTML(view, 56)}<div style="min-width:0"><div class="g-chosen-label">Hoạt động nhóm đã chốt</div><div class="activity-title">${escapeValue(view.name)}</div><div class="activity-biz">${escapeValue(view.address)} · ${escapeValue(view.price)}</div><div class="member-crit">★ ${view.rating ?? 'Chưa có'} · ${escapeValue(view.hours)} · ${escapeValue(view.categories)}</div></div></button>`;
    document.getElementById('suggestionCards').innerHTML = '';
    document.getElementById('suggestions').style.display = 'none';
    document.getElementById('suggestionsToggle').style.display = 'none';
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
    const tally = currentGroup.vote_tally || [];
    const voters = new Set(tally.flatMap(row => row.voter_member_ids));
    const maxVotes = Math.max(1, ...tally.map(row => row.votes));
    const tied = new Set(currentGroup.tied_activity_ids || []);
    const rows = tally.length ? tally.map(row => {
      const names = groupMembers.filter(member => row.voter_member_ids.includes(member.member_id)).map(member => member.name).join(', ');
      return `<div class="g-tally-row ${tied.has(row.activity_id) ? 'tied' : ''}">
        ${thumbHTML({ logo_url: row.business_logo_url, media_url: row.media_url }, 38)}
        <div class="g-tally-main"><div class="g-tally-name">${escapeValue(row.name)}</div>
          <div class="g-tally-bar"><span style="width:${Math.round(row.votes / maxVotes * 100)}%"></span></div>
          <div class="g-tally-voters">${escapeValue(names)}</div></div>
        <div class="g-tally-count">${row.votes}<small>phiếu</small></div></div>`;
    }).join('') : '<p class="section-sub" style="margin:0">Chưa có phiếu nào. Hãy bấm "Bình chọn" trên các hoạt động bạn thích, chọn bao nhiêu cũng được.</p>';
    let status;
    let action = '';
    if (!currentGroup.voting_closed) {
      status = `${voters.size}/${groupMembers.length} thành viên đã bình chọn. Mỗi người chọn được nhiều hoạt động.`;
      if (currentGroup.is_host) action = `<button class="btn btn-primary g-pulse" type="button" onclick="closeGroupVoting()" ${tally.length ? '' : 'disabled'}>Đóng bình chọn & chốt kết quả</button>`;
      else status += ' Host sẽ đóng bình chọn khi mọi người sẵn sàng.';
    } else if (tied.size > 1) {
      status = `Có ${tied.size} hoạt động cùng ${maxVotes} phiếu cao nhất.`;
      action = currentGroup.is_host
        ? (currentGroup.random_pick
          ? '<button class="btn btn-secondary" type="button" onclick="openDecisionWidget()">Xem kết quả random</button>'
          : '<button class="btn btn-primary g-pulse" type="button" onclick="randomizeGroupActivity()">🎲 Random hoạt động nhiều vote nhất</button>')
        : '<span class="g-wait">Đang chờ host random hoạt động…</span>';
    } else {
      status = 'Đã đóng bình chọn.';
    }
    container.innerHTML = `<div class="group-vote-summary g-fade"><h3>${currentGroup.voting_closed ? 'Kết quả bình chọn' : 'Bình chọn hoạt động'}</h3>${rows}<p class="section-sub" style="margin:10px 0 0">${status}</p>${action ? `<div class="group-actions">${action}</div>` : ''}</div>`;
  }

  window.closeGroupVoting = function () {
    openGroupActionConfirm('closeVoting');
  };

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
      if (currentGroup.selected_activity) {
        renderSelectedActivity(currentGroup.selected_activity);
      } else {
        renderRecommendations();
        renderVoteSummary();
      }
      document.getElementById('group-result').style.display = 'block';
      return recommendations.length > 0;
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
        F2D.toast('Không tìm thấy hoạt động phù hợp cho nhóm.', 'error');
      }
    } catch (error) {
      F2D.toast(error.message, 'error');
    }
  };

  function renderBestMatch(activity, persist) {
    selectedActivity = activity;
    document.getElementById('bestMatch').innerHTML = recommendationCard(activity, true);
    updateExpenseButton();
    if (!persist) renderExpense();
  }

  function renderRecommendations() {
    const orderedRecommendations = getOrderedRecommendations();
    const best = orderedRecommendations[0];
    if (!best) {
      document.getElementById('bestMatch').innerHTML = '<p class="section-sub" style="margin:0">Chưa tìm thấy hoạt động phù hợp cho cả nhóm.</p>';
      document.getElementById('suggestionCards').innerHTML = '';
      document.getElementById('groupVoteSummary').innerHTML = '';
      document.getElementById('suggestions').style.display = 'none';
      document.getElementById('suggestionsToggle').style.display = 'none';
      return;
    }
    renderBestMatch(best, false);
    document.getElementById('suggestionCards').innerHTML = orderedRecommendations.slice(1).map(suggestionCard).join('');
    // Danh sách gợi ý giữ nguyên trạng thái mở/ẩn qua các lần bình chọn và tải lại trang,
    // chỉ đóng khi người dùng bấm "Ẩn gợi ý" hoặc host đã đóng bình chọn.
    const canShow = orderedRecommendations.length > 1 && !currentGroup?.voting_closed;
    const open = canShow && suggestionsOpen();
    document.getElementById('suggestions').style.display = open ? 'block' : 'none';
    document.getElementById('suggestionsToggle').style.display = canShow ? 'block' : 'none';
    document.getElementById('suggestionsToggle').textContent = open ? 'Ẩn gợi ý' : 'Xem gợi ý khác';
  }

  function suggestionsKey() {
    return `f2d-group-suggestions-open:${currentGroup?.group_id}`;
  }

  function suggestionsOpen() {
    try { return localStorage.getItem(suggestionsKey()) === '1'; } catch { return false; }
  }

  function recommendationCard(activity, best = false) {
    const view = activityView(activity);
    const voted = myVotes().has(view.id);
    const votes = tallyFor(view.id)?.votes || 0;
    const closed = Boolean(currentGroup?.voting_closed);
    const action = ownMember() && !closed
      ? `<button class="btn ${voted ? 'btn-secondary g-voted' : 'btn-primary'} suggestion-card-action" type="button" onclick="voteActivity('${escapeValue(view.id)}')">${voted ? '✓ Đã bình chọn · Bỏ chọn' : 'Bình chọn'}</button>`
      : '';
    const badge = votes ? `<span class="g-vote-badge">${votes} phiếu</span>` : '';
    return `<div class="suggestion-card ${voted ? 'is-voted' : ''}"><button class="suggestion-details g-row-card" type="button" onclick="openActivityPopup('${escapeValue(view.id)}')">${thumbHTML(view, 52)}<div style="min-width:0"><div class="activity-title">${best ? '✨ ' : ''}${escapeValue(view.name)} ${badge}</div><div class="activity-biz">${escapeValue(view.address)} · ${escapeValue(view.price)}</div><div class="member-crit">★ ${view.rating ?? 'Chưa có'} · ${escapeValue(view.hours)} · ${escapeValue(view.categories)} · ${view.score}% phù hợp${view.distance != null ? ` · cách điểm hẹn ${view.distance} km` : ''}</div></div></button>${action}</div>`;
  }

  function suggestionCard(activity) {
    return recommendationCard(activity);
  }

  window.voteActivity = async function (activityId) {
    const member = ownMember();
    if (!member || currentGroup.selected_activity || currentGroup.voting_closed) return;
    const activity = findActivity(activityId);
    if (!activity) {
      F2D.toast('Không tìm thấy hoạt động. Hãy tải lại gợi ý và thử lại.', 'error');
      return;
    }
    try {
      applyGroup(await api.request(`/groups/${currentGroup.group_id}/members/${member.member_id}/vote`, {
        method: 'POST', body: { activity_id: activity.activity_id },
      }));
      if (document.getElementById('activityOverlay').classList.contains('open')) openActivityPopup(activityId);
    } catch (error) {
      F2D.toast(error.message, 'error');
    }
  };

  window.randomizeGroupActivity = async function () {
    if (!currentGroup?.is_host) return;
    try {
      applyGroup(await api.request(`/groups/${currentGroup.group_id}/randomize`, { method: 'POST' }));
    } catch (error) {
      F2D.toast(error.message, 'error');
    }
  };

  window.toggleSuggestions = function () {
    const suggestions = document.getElementById('suggestions');
    const button = document.getElementById('suggestionsToggle');
    const isHidden = suggestions.style.display === 'none' || !suggestions.style.display;
    suggestions.style.display = isHidden ? 'block' : 'none';
    button.textContent = isHidden ? 'Ẩn gợi ý' : 'Xem gợi ý khác';
    try {
      if (isHidden) localStorage.setItem(suggestionsKey(), '1');
      else localStorage.removeItem(suggestionsKey());
    } catch { /* trình duyệt chặn bộ nhớ: chỉ không nhớ được trạng thái */ }
  };

  function getOrderedRecommendations() {
    const votes = myVotes();
    return [...recommendations.filter(item => votes.has(item.activity_id)), ...recommendations.filter(item => !votes.has(item.activity_id))];
  }

  window.confirmRandomPick = async function () {
    const pick = currentGroup?.random_pick;
    if (!currentGroup?.is_host || !pick) return;
    try {
      applyGroup(await api.request(`/groups/${currentGroup.group_id}/activity`, { method: 'PUT', body: { activity_id: pick.activity_id } }));
    } catch (error) {
      F2D.toast(error.message, 'error');
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
    const image = (view.logo_url || view.media_url)
      ? `<img src="${escapeValue(view.logo_url || view.media_url)}" alt="${escapeValue(view.name)}" style="display:block;width:180px;height:180px;margin:0 auto;object-fit:cover;border-radius:18px;">`
      : '<div style="font-size:42px;text-align:center;background:#F3D9A6;border-radius:12px;padding:20px;">✨</div>';
    const member = ownMember();
    const selectedVote = myVotes().has(id);
    const selectButton = member && !currentGroup.selected_activity && !currentGroup.voting_closed
      ? `<button type="button" class="btn ${selectedVote ? 'btn-secondary' : 'btn-primary'}" onclick="voteActivity('${escapeValue(id)}')">${selectedVote ? '✓ Đã bình chọn · Bỏ chọn' : 'Bình chọn'}</button>`
      : '';
    document.getElementById('activityPopupTitle').textContent = view.name;
    document.getElementById('activityPopupBody').innerHTML = `${image}<div class="activity-popup-meta"><div><b>Địa chỉ</b><br>${escapeValue(view.address)}</div><div><b>Giá</b><br>${escapeValue(view.price)}</div><div><b>Thời gian</b><br>${escapeValue(view.hours)}</div><div><b>Đánh giá</b><br>★ ${view.rating ?? 'Chưa có'}</div></div><p style="line-height:1.6;color:var(--muted);">${escapeValue(view.description)}</p><div class="group-actions"><a href="activity-detail.html?id=${encodeURIComponent(id)}" class="btn btn-secondary">Chi tiết</a>${selectButton}</div>`;
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
    document.getElementById('expenseActivity').innerHTML = `<div style="background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">${thumbHTML(view, 52)}<div style="min-width:0"><div class="g-chosen-label">${escapeValue(displayGroupName(currentGroup))}</div><div class="member-name">${escapeValue(view.name)}</div><div class="member-crit">${escapeValue(view.hours)} · ${groupMembers.length} người tham gia</div></div></div>`;
    document.getElementById('expenseTotal').textContent = money(currentGroup.total_amount);
    const expenseEntry = document.getElementById('expenseTotalEntry');
    expenseEntry.hidden = !currentGroup.is_host;
    const expenseTotalInput = document.getElementById('expenseTotalInput');
    expenseTotalInput.value = String(Math.round(currentGroup.total_amount || 0));
    document.getElementById('expensePerPerson').textContent = money(currentGroup.total_amount / groupMembers.length);
    document.getElementById('expensePaid').textContent = money(currentGroup.paid_amount);
    document.getElementById('expenseMissing').textContent = money(currentGroup.missing_amount);
    document.getElementById('paymentRows').innerHTML = groupMembers.map((member, index) => {
      const payment = member.payment;
      const remindLabel = remindButtonLabel(member);
      const status = payment.status === 'paid' ? '<span class="pay-badge paid">Đã trả</span>' : '<span class="pay-badge unpaid">Chưa trả</span>';
      const actions = currentGroup.is_host && payment.status !== 'paid'
        ? `<div class="payment-actions"><button class="btn btn-secondary" type="button" onclick="markMemberPaid(${index})">Đã trả</button><button class="btn btn-secondary ${remindLabel === 'Đã nhắc' ? 'g-reminded' : ''}" type="button" onclick="remindMember(${index})" ${remindLabel === 'Đã nhắc' ? 'disabled' : ''}>${remindLabel}</button></div>`
        : '';
      return `<div class="split-row"><div class="member-avatar">${escapeValue(member.name.charAt(0).toUpperCase())}</div><div><div class="member-name">${escapeValue(member.name)} ${status}</div><div class="member-crit">${money(payment.amount)}</div></div><div class="split-amount">${money(payment.amount)}</div>${actions}</div>`;
    }).join('');
    if (currentGroup.is_host) {
      document.getElementById('saveExpenseTotal').onclick = updateGroupExpense;
    }
  };

  async function updateGroupExpense() {
    const input = document.getElementById('expenseTotalInput');
    const total = Number(input?.value);
    if (!Number.isSafeInteger(total) || total < 0) {
      F2D.toast('Vui lòng nhập tổng chi phí là số nguyên không âm.', 'error');
      return;
    }
    try {
      applyGroup(await api.request(`/groups/${currentGroup.group_id}/expense`, {
        method: 'PUT',
        body: { total_amount: total },
      }));
    } catch (error) {
      F2D.toast(error.message, 'error');
    }
  }

  // "Đã nhắc" chỉ giữ trong trang hiện tại 30 phút; reload hoặc hết 30 phút thì thành "Nhắc lại".
  // Máy chủ vẫn chặn gửi email nhắc lần 2 trong 30 phút.
  const REMIND_COOLDOWN_MS = 30 * 60 * 1000;
  const remindedHere = new Map();
  function remindButtonLabel(member) {
    const at = remindedHere.get(member.member_id);
    if (at && Date.now() - at < REMIND_COOLDOWN_MS) return 'Đã nhắc';
    return member.payment.reminded_at ? 'Nhắc lại' : 'Nhắc thanh toán';
  }

  async function paymentAction(index, action) {
    if (!currentGroup.is_host) return F2D.toast('Chỉ host được cập nhật thanh toán.', 'error');
    try {
      const member = groupMembers[index];
      const group = await api.request(`/groups/${currentGroup.group_id}/payments/${member.member_id}`, { method: 'PATCH', body: { action } });
      if (action === 'remind') {
        remindedHere.set(member.member_id, Date.now());
        setTimeout(() => { remindedHere.delete(member.member_id); renderExpense(); }, REMIND_COOLDOWN_MS);
      }
      applyGroup(group);
    } catch (error) {
      F2D.toast(error.message, 'error');
    }
  }

  window.markMemberPaid = index => paymentAction(index, 'paid');
  window.remindMember = index => paymentAction(index, 'remind');

  async function refreshGroup() {
    if (!currentGroup) return;
    if (refreshInFlight) {
      refreshPending = true;
      return;
    }
    refreshInFlight = true;
    const groupId = currentGroup.group_id;
    try {
      window.FREE2DO_CACHE?.clear();
      const group = await api.request(`/groups/${groupId}`);
      if (currentGroup?.group_id === groupId) applyGroup(group);
    } catch (error) {
      if (error.status === 404) {
        returnToGroupList();
        return;
      }
      console.warn('Không thể đồng bộ nhóm:', error.message);
    } finally {
      refreshInFlight = false;
      if (refreshPending) {
        refreshPending = false;
        refreshGroup();
      }
    }
  }

  function connectRealtime() {
    if (!currentGroup || !localStorage.getItem('token')) return;
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
    clearTimeout(reconnectTimer);
    const base = window.FREE2DO_CONFIG.API_BASE_URL.replace(/^http/, 'ws');
    const connectedSocket = new WebSocket(`${base}/groups/${encodeURIComponent(currentGroup.group_id)}/ws?token=${encodeURIComponent(localStorage.getItem('token'))}`);
    socket = connectedSocket;
    connectedSocket.onopen = refreshGroup;
    connectedSocket.onmessage = event => {
      let message;
      try { message = JSON.parse(event.data); } catch (_) { return; }
      if (message.type === 'group_updated' || message.type === 'presence') refreshGroup();
    };
    connectedSocket.onclose = () => {
      if (socket !== connectedSocket) return;
      socket = null;
      reconnectTimer = setTimeout(connectRealtime, 3000);
    };
    connectedSocket.onerror = () => {
      if (socket === connectedSocket) connectedSocket.close();
    };
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
      F2D.toast(error.message, 'error');
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

  function initialize() {
    // Không hỏi lại với nhóm chính mình vừa tạo/mở (URL có ?groupInvite do applyGroup ghi vào).
    if (inviteCode && sessionStorage.getItem('pending_group_invite') !== inviteCode && sessionStorage.getItem(VIEWING_KEY) !== inviteCode) {
      document.getElementById('groupInviteConsent').classList.add('open');
      return;
    }
    initializeGroupPage();
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


  // ---------------------------------------------------------------------------
  // Widget kết quả bình chọn: random (có hoạt ảnh + Skip) -> chốt -> chúc mừng.
  // Hiện cho cả host và thành viên; chỉ host bấm được nút. Đồng bộ realtime qua applyGroup.
  // ---------------------------------------------------------------------------
  const CHEERS = [
    '🎉 Chốt kèo thành công! Cả nhóm sẽ cùng đi <b>{name}</b>. Chúc mọi người một buổi thật vui, nhớ chụp thật nhiều ảnh nha!',
    '🥳 Quyết định đã có! <b>{name}</b> đang chờ cả nhóm. Ai đến muộn thì bao trà sữa cả hội nhé 😄',
    '✨ Tuyệt vời! Nhóm mình đã chọn <b>{name}</b>. Chúc cả nhóm có một khoảng thời gian rảnh thật đáng nhớ!',
    '🎊 Xong! <b>{name}</b> chính thức lên lịch. Sạc đầy pin điện thoại, mang theo năng lượng tích cực và quẩy thôi!',
  ];
  let widgetSeq = null;      // random_seq đã thấy trên trang này
  let widgetState = null;    // 'rolling' | 'pick' | 'celebrate' | null
  let rollTimer = null;

  function widgetEl() {
    let overlay = document.getElementById('decisionWidget');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'decisionWidget';
    overlay.className = 'g-decision-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = '<div class="g-decision-card"><button type="button" class="g-decision-close" aria-label="Đóng" onclick="closeDecisionWidget()">×</button><div class="g-decision-body"></div></div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function showWidget(html, state) {
    const overlay = widgetEl();
    widgetState = state;
    const body = overlay.querySelector('.g-decision-body');
    body.innerHTML = html;
    body.classList.remove('g-swap');
    void body.offsetWidth; // chạy lại hoạt ảnh chuyển nội dung
    body.classList.add('g-swap');
    if (!overlay.classList.contains('open')) {
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  }

  window.closeDecisionWidget = function () {
    clearTimeout(rollTimer);
    widgetState = null;
    const overlay = document.getElementById('decisionWidget');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  };

  function tiedCandidates() {
    const tied = new Set(currentGroup?.tied_activity_ids || []);
    return (currentGroup?.vote_tally || []).filter(row => tied.has(row.activity_id));
  }

  function slotHTML(row, extraClass = '') {
    return `<div class="g-slot ${extraClass}">${thumbHTML({ logo_url: row.business_logo_url, media_url: row.media_url }, 64)}<div class="g-slot-name">${escapeValue(row.name)}</div></div>`;
  }

  function pickHTML() {
    const pick = currentGroup.random_pick;
    const row = { business_logo_url: pick.business_logo_url, media_url: pick.media_url, name: pick.name };
    const view = activityView(pick);
    const actions = currentGroup.is_host
      ? `<div class="g-decision-actions"><button class="btn btn-secondary" type="button" onclick="randomizeGroupActivity()">🎲 Random Again</button><button class="btn btn-primary" type="button" onclick="confirmRandomPick()">Chốt hoạt động</button></div>`
      : '<p class="g-wait" style="text-align:center;margin-top:16px">Host đang cân nhắc: chốt luôn hay random lại…</p>';
    return `<div class="g-decision-kicker">Kết quả random · lần ${currentGroup.random_seq}</div>
      <h2 class="g-decision-title">Hoạt động được chọn</h2>
      ${slotHTML(row, 'g-slot-win')}
      <div class="g-decision-meta">${escapeValue(view.address)} · ${escapeValue(view.price)} · ${escapeValue(view.hours)}</div>
      ${actions}`;
  }

  function playRoll() {
    clearTimeout(rollTimer);
    const candidates = tiedCandidates();
    const pickId = currentGroup.random_pick.activity_id;
    if (candidates.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      showWidget(pickHTML(), 'pick');
      return;
    }
    showWidget(`<div class="g-decision-kicker">Đang random trong ${candidates.length} hoạt động hòa phiếu</div>
      <h2 class="g-decision-title">Hồi hộp quá… 🥁</h2>
      <div class="g-slot-window" id="gSlotWindow"></div>
      <div class="g-decision-actions"><button class="btn btn-secondary" type="button" id="gSkipRoll">Bỏ qua hoạt ảnh ⏭</button></div>`, 'rolling');
    const windowBox = document.getElementById('gSlotWindow');
    // Dừng đúng ở hoạt động máy chủ đã random: lùi vị trí bắt đầu để bước cuối rơi vào pick.
    const steps = 18; // kết quả do máy chủ random; client chỉ diễn hoạt ảnh
    const pickIndex = Math.max(0, candidates.findIndex(row => row.activity_id === pickId));
    let index = ((pickIndex - steps) % candidates.length + candidates.length) % candidates.length;
    let step = 0;
    const finish = () => {
      clearTimeout(rollTimer);
      if (widgetState === 'rolling') showWidget(pickHTML(), 'pick');
    };
    document.getElementById('gSkipRoll').onclick = finish;
    const tick = () => {
      if (widgetState !== 'rolling') return;
      step += 1;
      index = (index + 1) % candidates.length;
      windowBox.innerHTML = slotHTML(candidates[index], 'g-slot-tick');
      if (step >= steps) { rollTimer = setTimeout(finish, 650); return; }
      rollTimer = setTimeout(tick, 55 + Math.pow(step / steps, 3) * 380); // chậm dần
    };
    tick();
  }

  function celebrate(activity) {
    const view = activityView(activity);
    let hash = 0;
    for (const char of String(activity.activity_id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const text = CHEERS[hash % CHEERS.length].replace('{name}', escapeValue(view.name));
    showWidget(`<div class="g-decision-kicker">${currentGroup.final_method === 'random' ? 'Đã chốt từ kết quả random' : 'Hoạt động nhiều phiếu nhất'}</div>
      <h2 class="g-decision-title">Chúc mừng cả nhóm! 🎉</h2>
      ${slotHTML({ business_logo_url: activity.business_logo_url, media_url: activity.media_url, name: activity.name }, 'g-slot-win')}
      <p class="g-cheer">${text}</p>
      <p class="g-decision-meta">Bước tiếp theo: các thành viên xác nhận tham gia, sau đó mở phần chia chi phí.</p>
      <div class="g-decision-actions"><button class="btn btn-primary" type="button" onclick="closeDecisionWidget()">Tiếp tục</button></div>`, 'celebrate');
    // Pháo giấy tưng bừng: một loạt bắn ngay, loạt thứ hai sau 1,1 giây.
    const card = document.querySelector('.g-decision-card');
    F2D.confetti(card);
    setTimeout(() => { if (widgetState === 'celebrate') F2D.confetti(card, { pieces: 90 }); }, 1100);
  }

  function syncDecisionWidget() {
    const group = currentGroup;
    if (!group) return;
    const firstSync = widgetSeq === null;
    const selected = group.selected_activity;
    if (selected && group.final_method) {
      const key = `f2d:celebrated:${group.group_id}`;
      let seen = null;
      try { seen = localStorage.getItem(key); } catch (e) { /* bỏ qua */ }
      if (seen !== selected.activity_id || widgetState === 'pick' || widgetState === 'rolling') {
        try { localStorage.setItem(key, selected.activity_id); } catch (e) { /* bỏ qua */ }
        clearTimeout(rollTimer);
        celebrate(selected);
      }
    } else if (group.random_pick) {
      // Chỉ mở lại khi có lần random mới; người dùng đã đóng widget thì không tự bật lại.
      if (group.random_seq !== widgetSeq) {
        if (firstSync) showWidget(pickHTML(), 'pick'); else playRoll();
      }
    } else if (widgetState === 'pick' || widgetState === 'rolling') {
      closeDecisionWidget();
    }
    widgetSeq = group.random_seq || 0;
  }

  window.openDecisionWidget = function () {
    if (currentGroup?.random_pick) showWidget(pickHTML(), 'pick');
  };

  selectTab('matching');
  initialize();
})();
