// Cấu hình dùng chung cho toàn bộ frontend tĩnh.
// Không thêm dấu "/" ở cuối URL để tránh tạo đường dẫn "//auth/...".
// Mở frontend từ localhost/127.0.0.1 thì gọi backend chạy local (uvicorn cổng 8000),
// để khi phát triển không ghi nhầm vào dữ liệu production.
window.FREE2DO_CONFIG = Object.freeze({
  API_BASE_URL: ["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://localhost:8000"
    : "https://free2do-o4oy.onrender.com",
});

// Đánh thức Render ngay khi trang vừa mở. Với gói Free, backend có thể ngủ sau
// thời gian không hoạt động; pre-warm giúp lúc người dùng bấm nút không phải chờ
// toàn bộ thời gian cold-start nữa.
window.FREE2DO_BACKEND_READY = fetch(
  `${window.FREE2DO_CONFIG.API_BASE_URL}/health/live`,
  { cache: "no-store" },
).then(response => response.ok).catch(() => false);

// Cache các request GET trong sessionStorage (mỗi tab một bộ nhớ riêng):
//  - chuyển trang rồi quay lại trong vòng 5 phút: dùng lại dữ liệu cũ, không gọi lại API;
//  - quá 5 phút, hoặc người dùng reload (F5), hoặc có thao tác ghi (POST/PATCH/PUT/DELETE): tải mới.
window.FREE2DO_CACHE = (() => {
  const PREFIX = 'f2d:';
  const TTL_MS = 5 * 60 * 1000;
  const clear = () => {
    try { Object.keys(sessionStorage).filter(k => k.startsWith(PREFIX)).forEach(k => sessionStorage.removeItem(k)); } catch (e) { /* storage bị chặn */ }
  };
  if (performance.getEntriesByType('navigation')[0]?.type === 'reload') clear();
  const key = path => `${PREFIX}${(localStorage.getItem('token') || '').slice(-16)}|${path}`;
  return {
    clear,
    TTL_MS,
    get(path) {
      try {
        const raw = sessionStorage.getItem(key(path));
        if (!raw) return undefined;
        const entry = JSON.parse(raw);
        if (!entry || typeof entry.t !== 'number' || Date.now() - entry.t > TTL_MS) { sessionStorage.removeItem(key(path)); return undefined; }
        return entry.v;
      } catch (e) { return undefined; }
    },
    set(path, value) { try { sessionStorage.setItem(key(path), JSON.stringify({ t: Date.now(), v: value })); } catch (e) { /* đầy bộ nhớ: bỏ qua */ } },
  };
})();

// Phiên đăng nhập: access token (30 phút) + refresh token (user 7 ngày, Operator 8 tiếng).
// Mọi fetch tới API có header Authorization mà nhận 401 sẽ tự đổi refresh token lấy access token
// mới rồi gửi lại đúng 1 lần, nên các file gọi API không cần tự xử lý việc làm mới token.
window.FREE2DO_SESSION = (() => {
  const API = window.FREE2DO_CONFIG.API_BASE_URL;
  const nativeFetch = window.fetch.bind(window);
  let refreshing = null;
  const clear = () => {
    ['token', 'refresh_token'].forEach(key => localStorage.removeItem(key));
    window.FREE2DO_CACHE.clear();
  };
  const save = data => {
    localStorage.setItem('token', data.access_token);
    if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
  };
  function refresh() {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) return Promise.resolve(false);
    // Nhiều request cùng gặp 401 thì chỉ gọi làm mới 1 lần.
    refreshing ||= nativeFetch(`${API}/auth/refresh-token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refreshToken }),
    }).then(async response => {
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) clear(); // phiên hết hạn/đã đăng xuất/bị khóa
        return false;
      }
      save(await response.json());
      return true;
    }).catch(() => false).finally(() => { refreshing = null; });
    return refreshing;
  }
  window.fetch = async (input, init = {}) => {
    const response = await nativeFetch(input, init);
    const url = typeof input === 'string' ? input : input.url;
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    if (response.status !== 401 || !headers.has('Authorization') || !url.startsWith(API) || url.includes('/auth/refresh-token')) {
      return response;
    }
    if (!(await refresh())) return response;
    headers.set('Authorization', `Bearer ${localStorage.getItem('token')}`);
    return nativeFetch(input, { ...init, headers });
  };
  // Đăng xuất: thu hồi phiên trên máy chủ (token cũ bị từ chối ngay) rồi xóa token ở trình duyệt.
  async function logout() {
    const token = localStorage.getItem('token');
    if (token) {
      await Promise.race([
        nativeFetch(`${API}/auth/signout`, { method: 'POST', keepalive: true, headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        new Promise(resolve => setTimeout(resolve, 3000)),
      ]);
    }
    clear();
  }
  return { save, clear, refresh, logout };
})();
