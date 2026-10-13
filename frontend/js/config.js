// Cấu hình dùng chung cho toàn bộ frontend tĩnh.
// Không thêm dấu "/" ở cuối URL để tránh tạo đường dẫn "//auth/...".
window.FREE2DO_CONFIG = Object.freeze({
  API_BASE_URL: "https://free2do-o4oy.onrender.com",
});

// Đánh thức Render ngay khi trang vừa mở. Với gói Free, backend có thể ngủ sau
// thời gian không hoạt động; pre-warm giúp lúc người dùng bấm nút không phải chờ
// toàn bộ thời gian cold-start nữa.
window.FREE2DO_BACKEND_READY = fetch(
  `${window.FREE2DO_CONFIG.API_BASE_URL}/health/live`,
  { cache: "no-store" },
).then(response => response.ok).catch(() => false);

// Cache các request GET trong sessionStorage: chuyển trang rồi quay lại sẽ dùng dữ liệu cũ,
// chỉ tải mới khi người dùng reload trang (F5) hoặc sau khi có thao tác ghi (POST/PATCH/DELETE).
window.FREE2DO_CACHE = (() => {
  const PREFIX = 'f2d:';
  const clear = () => {
    try { Object.keys(sessionStorage).filter(k => k.startsWith(PREFIX)).forEach(k => sessionStorage.removeItem(k)); } catch (e) { /* storage bị chặn */ }
  };
  if (performance.getEntriesByType('navigation')[0]?.type === 'reload') clear();
  const key = path => `${PREFIX}${(localStorage.getItem('token') || '').slice(-16)}|${path}`;
  return {
    clear,
    get(path) { try { const raw = sessionStorage.getItem(key(path)); return raw ? JSON.parse(raw) : undefined; } catch (e) { return undefined; } },
    set(path, value) { try { sessionStorage.setItem(key(path), JSON.stringify(value)); } catch (e) { /* đầy bộ nhớ: bỏ qua */ } },
  };
})();
