const API_BASE_URL = window.FREE2DO_CONFIG.API_BASE_URL;

const loginForm = document.querySelector(".login__form");
let loginErrorEl = document.getElementById("login-error");

function ensureLoginErrorBox() {
  if (loginErrorEl || !loginForm) return;
  loginErrorEl = document.createElement("p");
  loginErrorEl.id = "login-error";
  loginErrorEl.style.cssText = "display:none;color:#b42318;text-align:center;margin:0 0 12px;font-weight:600;";
  const submitButton = loginForm.querySelector(".login__submit");
  loginForm.insertBefore(loginErrorEl, submitButton);
}

function showLoginError(message) {
  ensureLoginErrorBox();
  if (!loginErrorEl) return alert(message);
  loginErrorEl.textContent = message;
  loginErrorEl.style.display = "block";
}

function hideLoginError() {
  ensureLoginErrorBox();
  if (loginErrorEl) loginErrorEl.style.display = "none";
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideLoginError();

    const identifier = document.getElementById("login-account").value.trim();
    const password = document.getElementById("login-password").value;

    if (!identifier || !password) {
      showLoginError("Vui lòng nhập email/số điện thoại và mật khẩu.");
      return;
    }

    try {
      const submitButton = loginForm.querySelector(".login__submit");
      const originalLabel = submitButton.textContent;
      submitButton.disabled = true;
      submitButton.textContent = "Đang đăng nhập...";
      await window.FREE2DO_BACKEND_READY;

      const formData = new URLSearchParams();
      formData.append("username", identifier);
      formData.append("password", password);

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        submitButton.disabled = false;
        submitButton.textContent = originalLabel;
        showLoginError(data.detail || "Đăng nhập thất bại.");
        return;
      }

      // Phiên mới: tick "Sử dụng vị trí hiện tại" về mặc định, xóa vị trí/chat AI của phiên trước.
      ["f2d:use-gps", "f2d:home-location", "f2d:ai-chat"].forEach(key => localStorage.removeItem(key));
      localStorage.setItem("token", data.access_token);

      const meResponse = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const me = await meResponse.json();

      if (!meResponse.ok) {
        localStorage.removeItem("token");
        submitButton.disabled = false;
        submitButton.textContent = originalLabel;
        showLoginError(me.detail || "Không lấy được thông tin tài khoản.");
        return;
      }

      // Chỉ theo lời mời nhóm khi trang đăng nhập được mở từ nút "Đồng ý" (URL có ?groupInvite).
      // Xóa giá trị cũ còn sót trong tab, tránh tài khoản khác bị hỏi tham gia nhóm sau khi đăng nhập.
      const invite = new URLSearchParams(location.search).get("groupInvite");
      if (invite) sessionStorage.setItem("pending_group_invite", invite); else sessionStorage.removeItem("pending_group_invite");
      sessionStorage.removeItem("f2d:viewing-group");

      if (me.requires_recovery_email) {
        window.location.href = "recovery-email.html";
        return;
      }

      const pendingGroupInvite = new URLSearchParams(location.search).get("groupInvite");
      if (pendingGroupInvite && me.account_type === "user" && me.role !== "business") {
        sessionStorage.setItem("pending_group_invite", pendingGroupInvite); // đã đồng ý trước khi đăng nhập: vào thẳng nhóm
        window.location.href = `Demo Trang Customer/group.html?groupInvite=${encodeURIComponent(pendingGroupInvite)}`;
        return;
      }

      window.location.href = me.redirect || (
        me.account_type === "operator"
          ? "admin.html"
          : me.role === "business"
            ? "Demo Trang Business/business-home.html"
            : "Demo Trang Customer/home.html"
      );
    } catch (error) {
      console.error(error);
      const submitButton = loginForm.querySelector(".login__submit");
      submitButton.disabled = false;
      submitButton.textContent = "Đăng nhập";
      showLoginError(`Không kết nối được backend tại ${API_BASE_URL}.`);
    }
  });
}

// Giữ lời mời nhóm (?groupInvite) khi chuyển sang trang đăng ký.
document.querySelectorAll('a[href="sign-up.html"]').forEach(link => { link.href += location.search; });
