const API_BASE_URL = window.FREE2DO_CONFIG.API_BASE_URL;

const registerForm = document.querySelector(".signup__form");
let registerErrorEl = document.getElementById("register-error");

function ensureErrorBox() {
  if (registerErrorEl || !registerForm) return;
  registerErrorEl = document.createElement("p");
  registerErrorEl.id = "register-error";
  registerErrorEl.style.cssText = "display:none;color:#b42318;text-align:center;margin:0 0 10px;font-weight:600;";
  const submitButton = registerForm.querySelector(".signup__submit");
  registerForm.insertBefore(registerErrorEl, submitButton);
}

function showRegisterError(message) {
  ensureErrorBox();
  if (!registerErrorEl) return alert(message);
  registerErrorEl.textContent = message;
  registerErrorEl.style.display = "block";
}

function hideRegisterError() {
  ensureErrorBox();
  if (registerErrorEl) registerErrorEl.style.display = "none";
}

if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideRegisterError();

    const name = document.getElementById("register-name").value.trim().replace(/\s+/g, " ");
    const identifier = document.getElementById("register-account").value.trim();
    const password = document.getElementById("register-password").value;
    const passwordConfirm = document.getElementById("register-password-confirm").value;

    if (!name || !identifier || !password || !passwordConfirm) {
      showRegisterError("Vui lòng nhập đầy đủ thông tin.");
      return;
    }

    // Cùng quy tắc với backend (app/utils/identity.py): chỉ chữ cái và khoảng trắng, 2-50 ký tự.
    if (name.length < 2 || name.length > 50 || !/^\p{L}+(?: \p{L}+)*$/u.test(name)) {
      showRegisterError("Họ và tên chỉ gồm chữ cái tiếng Việt hoặc tiếng Anh và khoảng trắng (2-50 ký tự), không chứa số hay ký tự đặc biệt.");
      return;
    }

    const isEmail = /^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}$/.test(identifier);
    if (!isEmail && (identifier.includes("@") || F2D.phoneProblem(identifier))) {
      showRegisterError(identifier.includes("@") ? "Vui lòng nhập email hợp lệ." : F2D.phoneProblem(identifier));
      return;
    }

    if (password.length < 8) {
      showRegisterError("Mật khẩu phải có ít nhất 8 ký tự.");
      return;
    }

    if (password !== passwordConfirm) {
      showRegisterError("Mật khẩu xác nhận không khớp.");
      return;
    }

    try {
      const submitButton = registerForm.querySelector(".signup__submit");
      submitButton.disabled = true;
      submitButton.textContent = "Đang đăng ký...";
      await window.FREE2DO_BACKEND_READY;

      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password, name }),
      });

      const data = await response.json();
      if (!response.ok) {
        submitButton.disabled = false;
        submitButton.textContent = "Đăng ký";
        showRegisterError(data.detail || "Đăng ký thất bại.");
        return;
      }

      // Phiên mới: tick "Sử dụng vị trí hiện tại" về mặc định, xóa vị trí/chat AI của phiên trước.
      ["f2d:use-gps", "f2d:home-location", "f2d:ai-chat"].forEach(key => localStorage.removeItem(key));
      window.FREE2DO_SESSION.save(data);
      // Tài khoản mới: lần đầu vào home sẽ hiện popup chọn sở thích (customer-home.js).
      localStorage.setItem("f2d:onboard-interests", window.F2D.accountId() || "");
      const meResponse = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const me = await meResponse.json();
      if (!meResponse.ok) throw new Error(me.detail || "Không lấy được thông tin tài khoản.");

      const pendingGroupInvite = new URLSearchParams(location.search).get("groupInvite");

      // Lời mời chỉ đến từ URL; tài khoản cần email khôi phục sẽ đọc lại khóa này ở recovery-email.js.

      if (pendingGroupInvite) sessionStorage.setItem("pending_group_invite", pendingGroupInvite); else sessionStorage.removeItem("pending_group_invite");

      sessionStorage.removeItem("f2d:viewing-group");
      if (!me.requires_recovery_email && pendingGroupInvite && me.account_type === "user" && me.role !== "business") {
        sessionStorage.setItem("pending_group_invite", pendingGroupInvite); // đã đồng ý trước khi đăng ký: vào thẳng nhóm
        window.location.href = `Demo Trang Customer/group.html?groupInvite=${encodeURIComponent(pendingGroupInvite)}`;
        return;
      }
      window.location.href = me.requires_recovery_email
        ? "recovery-email.html"
        : (me.redirect || "Demo Trang Customer/home.html");
    } catch (error) {
      console.error(error);
      const submitButton = registerForm.querySelector(".signup__submit");
      submitButton.disabled = false;
      submitButton.textContent = "Đăng ký";
      showRegisterError(error.message || `Không kết nối được backend tại ${API_BASE_URL}.`);
    }
  });
}
