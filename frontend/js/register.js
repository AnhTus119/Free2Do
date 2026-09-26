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

    const name = document.getElementById("register-name").value.trim();
    const identifier = document.getElementById("register-account").value.trim();
    const password = document.getElementById("register-password").value;
    const passwordConfirm = document.getElementById("register-password-confirm").value;

    if (!name || !identifier || !password || !passwordConfirm) {
      showRegisterError("Vui lòng nhập đầy đủ thông tin.");
      return;
    }

    const isEmail = /^\S+@\S+\.\S+$/.test(identifier);
    const phoneDigits = identifier.replace(/[^0-9+]/g, "");
    if (!isEmail && !/^(?:\+84|84|0)\d{8,10}$/.test(phoneDigits)) {
      showRegisterError("Vui lòng nhập email hoặc số điện thoại hợp lệ.");
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
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password, name }),
      });

      const data = await response.json();
      if (!response.ok) {
        showRegisterError(data.detail || "Đăng ký thất bại.");
        return;
      }

      localStorage.setItem("token", data.access_token);
      alert("Đăng ký thành công!");
      window.location.href = "Demo Trang Customer/home.html";
    } catch (error) {
      console.error(error);
      showRegisterError(`Không kết nối được backend tại ${API_BASE_URL}.`);
    }
  });
}
