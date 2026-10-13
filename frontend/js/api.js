/* All browser requests use this Vercel origin. The server mounts FastAPI at /api. */
window.Free2DoAPI = (() => {
  const base = window.FREE2DO_CONFIG.API_BASE_URL;
  async function request(path, { auth = false, ...options } = {}) {
    const headers = new Headers(options.headers || {});
    if (auth) {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Vui lòng đăng nhập để tiếp tục.');
      headers.set('Authorization', `Bearer ${token}`);
    }
    const response = await fetch(`${base}${path}`, { ...options, headers });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = body?.detail;
      throw new Error(typeof detail === 'string' ? detail : `Yêu cầu thất bại (${response.status}).`);
    }
    return body;
  }
  const json = (method, path, body, auth = true) => request(path, {
    method, auth, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return { request, json };
})();
