const API_BASE_URL = "http://localhost:8000";

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

    const email = document.getElementById("login-account").value.trim();
    const password = document.getElementById("login-password").value;

    if (!email || !password) {
      showLoginError("Vui lòng nhập email và mật khẩu.");
      return;
    }

    try {
      const formData = new URLSearchParams();
      formData.append("username", email);
      formData.append("password", password);

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        showLoginError(data.detail || "Đăng nhập thất bại.");
        return;
      }

      localStorage.setItem("token", data.access_token);

      const meResponse = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const me = await meResponse.json();

      if (!meResponse.ok) {
        localStorage.removeItem("token");
        showLoginError(me.detail || "Không lấy được thông tin tài khoản.");
        return;
      }

      window.location.href = me.redirect || "index.html";
    } catch (error) {
      console.error(error);
      showLoginError("Không kết nối được backend tại http://localhost:8000.");
    }
  });
}
