// Cấu hình dùng chung cho toàn bộ frontend tĩnh.
// Không thêm dấu "/" ở cuối URL để tránh tạo đường dẫn "//auth/...".
window.FREE2DO_CONFIG = Object.freeze({
  API_BASE_URL: "https://free2do.onrender.com",
});

// Đánh thức Render ngay khi trang vừa mở. Với gói Free, backend có thể ngủ sau
// thời gian không hoạt động; pre-warm giúp lúc người dùng bấm nút không phải chờ
// toàn bộ thời gian cold-start nữa.
window.FREE2DO_BACKEND_READY = fetch(
  `${window.FREE2DO_CONFIG.API_BASE_URL}/health/live`,
  { cache: "no-store" },
).then(response => response.ok).catch(() => false);
