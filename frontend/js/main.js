/*
 * Thành phần dùng chung cho cả 3 khu (Customer, Business, Operator). Nạp ngay sau js/config.js.
 *  - F2D.toast(message, type)        : thông báo nổi, không chặn thao tác (type: 'success' | 'error').
 *  - F2D.busy(button, fn)            : khóa nút + hiện trạng thái đang xử lý trong lúc chạy fn, chống bấm lặp.
 *  - F2D.mutate(method, path, run)   : các hàm gọi API (CustomerAPI / BusinessAPI / AdminAuth) bọc mọi
 *                                      POST/PUT/PATCH/DELETE qua đây: tự khóa nút vừa bấm, tự hiện toast
 *                                      thành công/thất bại. Lời gọi truyền { toast: false } để tắt,
 *                                      hoặc { toast: 'Nội dung' } để đổi câu thông báo.
 *  - F2D.dateTime(v) / F2D.date(v)   : "15/10/2026 [07:34]" / "15/10/2026" theo giờ Việt Nam, không có giây.
 *                                      Chuỗi không kèm múi giờ từ backend được hiểu là UTC.
 *  - F2D.lightbox(items, index)      : xem ảnh/video phóng to. Click ảnh để phóng to/thu nhỏ, đóng bằng X,
 *                                      click nền hoặc ESC, mũi tên trái/phải để chuyển ảnh.
 *    Không cần gọi tay: mọi phần tử có [data-zoom] (giá trị = URL, bỏ trống thì lấy src) tự mở lightbox;
 *    các ảnh nằm chung một [data-zoom-group] được xem lần lượt.
 *  - F2D.ask({ title, text, ok, danger, input }) : popup xác nhận cùng tông giao diện, thay confirm()/prompt().
 *                                      Trả về true (hoặc nội dung ô nhập nếu có input) khi đồng ý, null khi hủy.
 *                                      input: { label, placeholder, value, required, multiline, maxLength }.
 */
(function () {
  'use strict';
  const TZ = 'Asia/Ho_Chi_Minh';
  const script = document.currentScript;
  if (script && !document.getElementById('f2d-common-css')) {
    const link = document.createElement('link');
    link.id = 'f2d-common-css';
    link.rel = 'stylesheet';
    link.href = new URL('../css/common.css', script.src).href;
    document.head.append(link);
  }

  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ---------- Ngày giờ ----------
  function toDate(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const text = String(value);
    // Backend lưu UTC dạng "2026-10-15T00:34:12.123" (không có Z) -> gắn Z để không bị hiểu là giờ máy.
    const date = new Date(/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?$/.test(text) ? `${text}Z` : text);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const partsFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  function parts(value) {
    const date = toDate(value);
    if (!date) return null;
    return Object.fromEntries(partsFormatter.formatToParts(date).map(part => [part.type, part.value]));
  }
  function date(value, fallback = 'Chưa có dữ liệu') {
    const p = parts(value);
    return p ? `${p.day}/${p.month}/${p.year}` : fallback;
  }
  function dateTime(value, fallback = 'Chưa có dữ liệu') {
    const p = parts(value);
    return p ? `${p.day}/${p.month}/${p.year} [${p.hour}:${p.minute}]` : fallback;
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(message, type = 'success') {
    if (!message) return;
    let node = document.getElementById('f2d-toast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'f2d-toast';
      node.className = 'f2d-toast';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      document.body.append(node);
    }
    node.classList.toggle('error', type === 'error');
    node.textContent = message;
    node.classList.remove('show');
    void node.offsetWidth; // chạy lại hiệu ứng khi toast mới thay toast cũ
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), type === 'error' ? 4800 : 3200);
  }

  // ---------- Chống bấm lặp ----------
  async function busy(button, fn) {
    if (!button) return fn();
    if (button.classList.contains('is-busy')) return undefined;
    const wasDisabled = button.disabled;
    button.disabled = true;
    button.classList.add('is-busy');
    button.setAttribute('aria-busy', 'true');
    try {
      return await fn();
    } finally {
      button.classList.remove('is-busy');
      button.removeAttribute('aria-busy');
      button.disabled = wasDisabled;
    }
  }
  function activeButton() {
    const element = document.activeElement;
    if (!element || element === document.body) return null;
    if (element.matches('button, input[type=submit], input[type=button]')) return element;
    return element.form?.querySelector('button[type=submit], button:not([type]), input[type=submit]') || null;
  }

  // Các yêu cầu ghi không phải "lưu dữ liệu" (tìm kiếm, chat AI, đăng nhập/OTP) có thông báo riêng.
  const QUIET_PATHS = /^\/(search|ai\/|auth\/)/;
  const DEFAULT_MESSAGES = {
    POST: 'Đã lưu thành công', PUT: 'Đã chỉnh sửa thành công', PATCH: 'Đã chỉnh sửa thành công', DELETE: 'Đã xóa thành công',
  };
  async function mutate(method, path, run, options = {}) {
    const verb = String(method || 'GET').toUpperCase();
    if (verb === 'GET') return run();
    const quiet = options.toast === false || (options.toast == null && QUIET_PATHS.test(path));
    const button = options.button === undefined ? activeButton() : options.button;
    try {
      // Nút đã được khóa bởi F2D.busy ở lời gọi ngoài thì chỉ chạy, không khóa lần hai.
      const result = button && !button.classList.contains('is-busy') ? await busy(button, run) : await run();
      if (!quiet) toast(typeof options.toast === 'string' ? options.toast : DEFAULT_MESSAGES[verb]);
      return result;
    } catch (error) {
      if (!quiet) toast(error?.message || 'Thao tác thất bại. Vui lòng thử lại.', 'error');
      throw error;
    }
  }

  // ---------- Popup xác nhận / nhập liệu ----------
  function ask({ title, text = '', ok = 'Xác nhận', cancel = 'Hủy', danger = false, input = null } = {}) {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog');
      dialog.className = 'f2d-modal f2d-ask';
      dialog.setAttribute('aria-labelledby', 'f2dAskTitle');
      const field = input
        ? `<label class="f2d-ask-field"><span>${escapeHTML(input.label || '')}</span>${input.multiline
          ? `<textarea rows="4" maxlength="${input.maxLength || 1000}" placeholder="${escapeHTML(input.placeholder || '')}">${escapeHTML(input.value || '')}</textarea>`
          : `<input type="text" maxlength="${input.maxLength || 200}" placeholder="${escapeHTML(input.placeholder || '')}" value="${escapeHTML(input.value || '')}">`}</label>
          <p class="f2d-ask-error" role="alert"></p>`
        : '';
      dialog.innerHTML = `<form method="dialog" class="f2d-modal-card">
          <h2 class="f2d-modal-title" id="f2dAskTitle">${escapeHTML(title)}</h2>
          ${text ? `<p class="f2d-modal-sub">${escapeHTML(text)}</p>` : ''}
          ${field ? `<div class="f2d-modal-body">${field}</div>` : ''}
          <div class="f2d-modal-actions">
            <button type="button" class="f2d-ask-btn" data-cancel>${escapeHTML(cancel)}</button>
            <button type="submit" class="f2d-ask-btn primary${danger ? ' danger' : ''}">${escapeHTML(ok)}</button>
          </div>
        </form>`;
      document.body.append(dialog);
      const control = dialog.querySelector('input, textarea');
      let result = null;
      dialog.querySelector('form').addEventListener('submit', event => {
        if (control) {
          const value = control.value.trim();
          if (input.required !== false && value.length < (input.minLength || 1)) {
            event.preventDefault();
            dialog.querySelector('.f2d-ask-error').textContent = input.requiredMessage || 'Vui lòng nhập nội dung.';
            control.focus();
            return;
          }
          result = value;
        } else {
          result = true;
        }
      });
      dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
      dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });
      dialog.showModal();
      (control || dialog.querySelector('[type=submit]')).focus();
    });
  }

  // ---------- Lightbox ----------
  let box = null;
  let items = [];
  let index = 0;
  function closeLightbox() {
    if (!box) return;
    box.classList.remove('open');
    document.body.style.overflow = '';
    box.querySelector('[data-f2d-stage]').innerHTML = '';
  }
  function showItem(next) {
    if (!items.length) return;
    index = (next + items.length) % items.length;
    const item = items[index];
    const url = escapeHTML(item.url);
    box.querySelector('[data-f2d-stage]').innerHTML = item.type === 'video'
      ? `<video src="${url}" controls autoplay></video>`
      : `<img src="${url}" alt="${escapeHTML(item.alt || 'Ảnh phóng to')}">`;
    const many = items.length > 1;
    box.querySelector('[data-f2d-prev]').hidden = !many;
    box.querySelector('[data-f2d-next]').hidden = !many;
    box.querySelector('[data-f2d-count]').textContent = many ? `${index + 1} / ${items.length}` : '';
  }
  function lightbox(list, start = 0) {
    items = (list || []).map(item => typeof item === 'string' ? { url: item } : item).filter(item => item?.url);
    if (!items.length) return;
    if (!box) {
      box = document.createElement('div');
      box.className = 'f2d-lightbox';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', 'Xem ảnh');
      box.innerHTML = '<button type="button" class="f2d-lb-close" data-f2d-close aria-label="Đóng">&times;</button>'
        + '<button type="button" class="f2d-lb-nav prev" data-f2d-prev aria-label="Ảnh trước">&#8249;</button>'
        + '<div class="f2d-lb-stage" data-f2d-stage></div>'
        + '<button type="button" class="f2d-lb-nav next" data-f2d-next aria-label="Ảnh tiếp theo">&#8250;</button>'
        + '<span class="f2d-lb-count" data-f2d-count aria-live="polite"></span>';
      box.addEventListener('click', event => {
        if (event.target.closest('[data-f2d-close]') || event.target === box || event.target.matches('[data-f2d-stage]')) return closeLightbox();
        if (event.target.closest('[data-f2d-prev]')) return showItem(index - 1);
        if (event.target.closest('[data-f2d-next]')) return showItem(index + 1);
        if (event.target.matches('[data-f2d-stage] img')) event.target.classList.toggle('zoomed');
      });
      document.addEventListener('keydown', event => {
        if (!box.classList.contains('open')) return;
        if (event.key === 'Escape') closeLightbox();
        if (event.key === 'ArrowLeft') showItem(index - 1);
        if (event.key === 'ArrowRight') showItem(index + 1);
      });
      document.body.append(box);
    }
    showItem(start);
    box.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  const zoomItem = element => ({
    url: element.dataset.zoom || element.currentSrc || element.src,
    type: element.dataset.zoomType || (element.tagName === 'VIDEO' ? 'video' : 'image'),
    alt: element.alt,
  });
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-zoom]');
    if (!target) return;
    event.preventDefault();
    const group = target.closest('[data-zoom-group]');
    const list = group ? [...group.querySelectorAll('[data-zoom]')] : [target];
    lightbox(list.map(zoomItem), list.indexOf(target));
  });

  // ---------- Editor sở thích (hồ sơ cá nhân + popup sau đăng ký) ----------
  // Chọn tag có sẵn (/categories) + nhập sở thích cá nhân. Chỉ ghi lên server khi gọi save().
  const MAX_INTERESTS = 20;
  const LEGACY_INTERESTS_KEY = 'free2do_custom_interests';
  function interestsEditor(container, api) {
    const state = { categories: [], selected: new Set(), custom: [] };
    const message = (text, isError = false) => {
      const box = container.querySelector('.personal-interests-msg');
      if (!box) return;
      box.textContent = text || '';
      box.classList.toggle('error', isError);
    };
    function render() {
      const pending = container.querySelector('.custom-interest-input')?.value || '';
      const hadFocus = document.activeElement?.matches?.('.custom-interest-input') && container.contains(document.activeElement);
      container.innerHTML = `<div class="interest-tags">${state.categories.map(category => `<button type="button" class="chip ${state.selected.has(category.category_id) ? 'active' : ''}" data-category-id="${escapeHTML(category.category_id)}" aria-pressed="${state.selected.has(category.category_id)}">${escapeHTML(category.name)}</button>`).join('')}</div>
        <div class="personal-interests">
          <div class="personal-interests-label">Sở thích cá nhân <span>(nhập rồi nhấn Enter, tối đa ${MAX_INTERESTS})</span></div>
          <div class="personal-interests-row">
            ${state.custom.map((interest, index) => `<span class="chip active personal">${escapeHTML(interest)}<button type="button" class="chip-x" data-remove-custom-interest="${index}" aria-label="Xóa ${escapeHTML(interest)}">&times;</button></span>`).join('')}
            <input class="custom-interest-input" type="text" maxlength="60" placeholder="VD: leo núi, nhạc acoustic..." aria-label="Thêm sở thích cá nhân" value="${escapeHTML(pending)}">
            <button type="button" class="chip add-chip" data-add-custom-interest>＋ Thêm sở thích</button>
          </div>
          <div class="personal-interests-msg" role="status"></div>
        </div>`;
      if (hadFocus) container.querySelector('.custom-interest-input').focus();
    }
    function addFromInput() {
      const input = container.querySelector('.custom-interest-input');
      const value = (input?.value || '').replace(/\s+/g, ' ').trim();
      if (!value) return input?.focus();
      if (state.custom.some(item => item.toLocaleLowerCase('vi') === value.toLocaleLowerCase('vi'))) return message(`"${value}" đã có trong danh sách.`, true);
      if (state.custom.length >= MAX_INTERESTS) return message(`Bạn chỉ có thể lưu tối đa ${MAX_INTERESTS} sở thích cá nhân.`, true);
      input.value = '';
      state.custom = [...state.custom, value];
      render();
      container.querySelector('.custom-interest-input')?.focus();
    }
    container.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || !container.contains(button)) return;
      if (button.hasAttribute('data-add-custom-interest')) return addFromInput();
      if (button.hasAttribute('data-remove-custom-interest')) {
        state.custom = state.custom.filter((_, index) => index !== Number(button.dataset.removeCustomInterest));
        return render();
      }
      const id = button.dataset.categoryId;
      if (!id) return;
      if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
      render();
    });
    container.addEventListener('keydown', event => {
      if (!event.target.matches('.custom-interest-input')) return;
      if (event.key === 'Enter') { event.preventDefault(); addFromInput(); }
      else if (event.key === 'Escape') { event.stopPropagation(); event.target.value = ''; message(''); }
    });
    return {
      state,
      render,
      async load() {
        const [categories, mine, interests] = await Promise.all([
          api.request('/categories'), api.request('/users/me/categories'), api.request('/users/me/interests'),
        ]);
        state.categories = categories;
        state.selected = new Set(mine.map(category => category.category_id));
        state.custom = interests.interests;
        // Sở thích cũ từng lưu trong trình duyệt: gộp vào và chuyển lên server một lần.
        let legacy = [];
        try { legacy = JSON.parse(localStorage.getItem(LEGACY_INTERESTS_KEY) || '[]'); localStorage.removeItem(LEGACY_INTERESTS_KEY); } catch (error) { legacy = []; }
        const extra = Array.isArray(legacy) ? legacy.filter(item => typeof item === 'string' && item.trim()) : [];
        if (extra.length) {
          state.custom = (await api.request('/users/me/interests', { method: 'PUT', body: { interests: [...state.custom, ...extra].slice(0, MAX_INTERESTS) }, toast: false })).interests;
        }
        render();
      },
      async save() {
        const [, interests] = await Promise.all([
          api.request('/users/me/categories', { method: 'PUT', body: { category_ids: [...state.selected] }, toast: false }),
          api.request('/users/me/interests', { method: 'PUT', body: { interests: state.custom }, toast: false }),
        ]);
        state.custom = interests.interests;
        render();
      },
      chosenLabels() {
        return [
          ...state.categories.filter(category => state.selected.has(category.category_id)).map(category => category.name),
          ...state.custom,
        ];
      },
    };
  }

  // ---------- Chọn ảnh: vùng kéo thả + lưới ảnh xem trước + xóa trước khi gửi ----------
  // options.max: số ảnh tối đa; options.maxMB; options.accept;
  // options.onFiles(files): nếu có thì tải lên ngay (không giữ trong picker), vd hồ sơ doanh nghiệp.
  const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
  function imagePicker(container, options = {}) {
    const max = options.max || 5;
    const maxMB = options.maxMB || 5;
    const accept = options.accept || IMAGE_ACCEPT;
    const picked = [];
    const inputId = `f2d-pick-${Math.random().toString(36).slice(2, 8)}`;
    container.classList.add('f2d-picker');
    container.innerHTML = `<label class="f2d-dropzone" for="${inputId}">
        <input id="${inputId}" type="file" accept="${escapeHTML(accept)}" ${max > 1 ? 'multiple' : ''} class="f2d-sr-only">
        <span class="f2d-dropzone-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.5-4.5L6 21"/></svg></span>
        <span class="f2d-dropzone-text"><b>${escapeHTML(options.label || 'Chọn ảnh')}</b> hoặc kéo thả vào đây</span>
        <span class="f2d-dropzone-hint">${escapeHTML(options.hint || `JPG, PNG hoặc WEBP, tối đa ${max} ảnh, mỗi ảnh tối đa ${maxMB}MB`)}</span>
      </label>
      <div class="f2d-thumbs" data-zoom-group></div>`;
    const input = container.querySelector('input');
    const zone = container.querySelector('.f2d-dropzone');
    const grid = container.querySelector('.f2d-thumbs');
    function render() {
      grid.innerHTML = picked.map((item, index) => `<div class="f2d-thumb"><img src="${item.url}" alt="Ảnh đã chọn ${index + 1}" data-zoom><button type="button" class="f2d-thumb-remove" data-remove="${index}" aria-label="Bỏ ảnh ${index + 1}">&times;</button></div>`).join('');
      zone.classList.toggle('is-full', !options.onFiles && picked.length >= max);
    }
    function add(fileList) {
      const allowed = accept.split(',');
      const files = [...fileList].filter(file => {
        if (!allowed.includes(file.type)) { toast(`"${file.name}" không phải ảnh JPG, PNG hoặc WEBP.`, 'error'); return false; }
        if (file.size > maxMB * 1024 * 1024) { toast(`"${file.name}" lớn hơn ${maxMB}MB.`, 'error'); return false; }
        return true;
      });
      if (options.onFiles) { if (files.length) options.onFiles(files.slice(0, max)); return; }
      const room = max - picked.length;
      if (files.length > room) toast(`Chỉ chọn được tối đa ${max} ảnh.`, 'error');
      files.slice(0, Math.max(0, room)).forEach(file => picked.push({ file, url: URL.createObjectURL(file) }));
      render();
    }
    input.addEventListener('change', () => { add(input.files); input.value = ''; });
    grid.addEventListener('click', event => {
      const button = event.target.closest('[data-remove]');
      if (!button) return;
      const [removed] = picked.splice(Number(button.dataset.remove), 1);
      URL.revokeObjectURL(removed.url);
      render();
    });
    ['dragenter', 'dragover'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(type => zone.addEventListener(type, () => zone.classList.remove('is-over')));
    zone.addEventListener('drop', event => { event.preventDefault(); add(event.dataTransfer.files); });
    return {
      files: () => picked.map(item => item.file),
      clear() { picked.splice(0).forEach(item => URL.revokeObjectURL(item.url)); render(); },
      setDisabled(disabled) { input.disabled = disabled; zone.classList.toggle('is-disabled', disabled); },
    };
  }

  // ---------- Chiều sâu & chuyển động (chỉ transform/opacity, tắt khi reduced-motion) ----------
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Lớp nền: vài bong bóng màu palette trôi chậm phía sau nội dung (z-index âm, không bắt chuột).
  function ambient() {
    if (document.querySelector('.f2d-ambient')) return;
    const layer = document.createElement('div');
    layer.className = 'f2d-ambient';
    layer.setAttribute('aria-hidden', 'true');
    const bubbles = [
      [340, 6, 12, 'rose', 26], [220, 78, 6, 'cream', 32], [160, 88, 58, 'sage', 24],
      [280, 14, 70, 'cream', 36], [120, 52, 30, 'pink', 22], [90, 30, 88, 'rose', 28], [200, 64, 84, 'pink', 30],
    ];
    layer.innerHTML = bubbles.map(([size, x, y, tone, dur], i) =>
      `<span class="f2d-bubble ${tone}" style="--s:${size}px;--x:${x}%;--y:${y}%;--t:${dur}s;--d:-${i * 3.7}s"></span>`).join('');
    document.body.prepend(layer);
  }

  // Thành phần hiện lên khi cuộn tới: nâng 18px + mờ dần, so le 70ms trong cùng một nhóm.
  // Nội dung luôn hiện nếu script lỗi: class ẩn chỉ được gắn bởi chính script này.
  const REVEAL = '.activity-card,.history-card,.search-history-card,.request-card,.rv-card,.bp-card,.ad-stat,.stat-card,.biz-stat-card,.management-panel,.section > .card,.profile-head,.table-panel,.match-card,.welcome,.f2d-thumb';
  let revealObserver = null;
  function scanReveal(root = document) {
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    revealObserver ||= new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      el.classList.add('f2d-in');
      revealObserver.unobserve(el);
      // Xong hiệu ứng vào thì gỡ class để hover/transition riêng của thẻ hoạt động lại bình thường.
      setTimeout(() => el.classList.add('f2d-done'), 1200);
    }), { rootMargin: '0px 0px -6% 0px' });
    const fresh = [...root.querySelectorAll(REVEAL)].filter(el => !el.classList.contains('f2d-reveal') && !el.classList.contains('f2d-done') && !el.closest('dialog, .f2d-lightbox, .slide-panel:not(.show)'));
    fresh.forEach(el => {
      const siblings = [...el.parentElement.children].filter(node => node.matches(REVEAL));
      el.style.setProperty('--rd', `${Math.min(siblings.indexOf(el), 8) * 70}ms`);
      el.classList.add('f2d-reveal');
      revealObserver.observe(el);
    });
  }

  // Gợn sóng nhỏ tại điểm bấm trên mọi nút: phản hồi rõ ràng mà vẫn tối giản.
  const PRESSABLE = '.btn,.qa-btn,.row-btn,.chip,.rv-pill,.page-btn,.status-tab,.nav-link,.search-history-again,.op-case,.tab-btn';
  function ripple(event) {
    const target = event.target.closest(PRESSABLE);
    if (!target || target.disabled || reduceMotion) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const dot = document.createElement('span');
    dot.className = 'f2d-ripple';
    dot.style.cssText = `width:${size}px;height:${size}px;left:${event.clientX - rect.left - size / 2}px;top:${event.clientY - rect.top - size / 2}px`;
    if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
    target.classList.add('f2d-has-ripple');
    target.append(dot);
    dot.addEventListener('animationend', () => dot.remove());
  }

  // Pháo giấy: hai ống bắn từ hai góc dưới + một đợt rơi từ trên, nhiều hình (giấy, tròn, ruy băng).
  const CONFETTI_COLORS = ['#DB6680', '#FF9DA3', '#FFEBC6', '#B2BD8B', '#F5B921', '#BE4F68', '#8FB8DE'];
  function confetti(host, { pieces = 140 } = {}) {
    if (reduceMotion || !host) return;
    const layer = document.createElement('div');
    layer.className = 'f2d-confetti';
    layer.setAttribute('aria-hidden', 'true');
    host.append(layer);
    const { width, height } = host.getBoundingClientRect();
    const rand = (min, max) => min + Math.random() * (max - min);
    const animations = [];
    for (let i = 0; i < pieces; i += 1) {
      const piece = document.createElement('i');
      const shape = i % 3;
      piece.className = shape === 0 ? 'rect' : shape === 1 ? 'dot' : 'ribbon';
      piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      layer.append(piece);
      const wave = i % 3; // 0: ống trái, 1: ống phải, 2: mưa từ trên
      const startX = wave === 0 ? 0 : wave === 1 ? width : rand(0, width);
      const startY = wave === 2 ? -20 : height;
      const dx = wave === 0 ? rand(width * 0.15, width * 0.85) : wave === 1 ? -rand(width * 0.15, width * 0.85) : rand(-60, 60);
      const peak = wave === 2 ? rand(height * 0.4, height) : -rand(height * 0.55, height * 1.05);
      const spin = rand(360, 1080) * (Math.random() < 0.5 ? -1 : 1);
      const delay = wave === 2 ? rand(250, 900) : rand(0, 220);
      animations.push(piece.animate([
        { transform: `translate(${startX}px, ${startY}px) rotate(0deg) scale(${rand(0.7, 1.2)})`, opacity: 1 },
        { transform: `translate(${startX + dx * 0.7}px, ${startY + peak}px) rotate(${spin * 0.6}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${startX + dx}px, ${height + 40}px) rotate(${spin}deg)`, opacity: 0 },
      ], { duration: rand(1800, 3000), delay, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'both' }).finished);
    }
    Promise.allSettled(animations).then(() => layer.remove());
  }

  // Số liệu thống kê đếm lên từ 0 khi vừa được điền (chỉ số nguyên, giữ nguyên định dạng 1.234).
  const COUNTERS = '.stat-num,.biz-stat-num,.ad-stat-num';
  function countUp() {
    if (reduceMotion) return;
    document.querySelectorAll(COUNTERS).forEach(el => {
      const text = el.textContent.trim();
      if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(text) || el.dataset.counted === text) return;
      const target = Number(text.replace(/\./g, ''));
      el.dataset.counted = text;
      if (target < 2) return;
      const start = performance.now();
      const step = now => {
        const progress = Math.min(1, (now - start) / 700);
        const value = Math.round(target * (1 - Math.pow(1 - progress, 3)));
        const shown = value.toLocaleString('vi-VN');
        el.dataset.counted = progress < 1 ? shown : text;
        el.textContent = progress < 1 ? shown : text;
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  function initMotion() {
    ambient();
    scanReveal();
    countUp();
    document.addEventListener('pointerdown', ripple);
    // Phần tử không phải <button> nhưng đóng vai nút (menu tài khoản...) bấm được bằng Enter/Space.
    document.addEventListener('keydown', event => {
      const target = event.target.closest?.('[role="button"]:not(button)');
      if (target && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); target.click(); }
    });
    // Phần lớn nội dung được render sau khi gọi API: quét lại khi DOM đổi.
    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; scanReveal(); countUp(); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMotion); else initMotion();

  // Đọc account id (sub) từ JWT đang lưu, dùng cho các cờ gắn với từng tài khoản.
  function accountId() {
    try { return JSON.parse(atob(localStorage.getItem('token').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || null; } catch (error) { return null; }
  }

  // Năm bản quyền luôn là năm hiện tại: <span data-current-year>2026</span>.
  const fillYear = () => document.querySelectorAll('[data-current-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fillYear); else fillYear();

  window.F2D = Object.freeze({ toast, busy, mutate, ask, lightbox, closeLightbox, date, dateTime, toDate, escapeHTML, interestsEditor, imagePicker, accountId, confetti });
})();
