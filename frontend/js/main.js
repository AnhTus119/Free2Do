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

  window.F2D = Object.freeze({ toast, busy, mutate, lightbox, closeLightbox, date, dateTime, toDate, escapeHTML });
})();
