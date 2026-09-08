const API_BASE_URL = "http://localhost:8000";

const registerForm = document.querySelector(".signup__form");
let registerErrorEl = document.getElementById("register-error");

function ensureErrorBox() {
  if (registerErrorEl || !registerForm) return;
  registerErrorEl = document.createElement("p");
  registerErrorEl.id = "register-error";
  registerErrorEl.style.cssText = "display:none;color:#b42318;text-align:center;margin:0 0 12px;font-weight:600;";
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
    const email = document.getElementById("register-account").value.trim();
    const password = document.getElementById("register-password").value;
    const passwordConfirm = document.getElementById("register-password-confirm").value;

    if (!name || !email || !password || !passwordConfirm) {
      showRegisterError("Vui lòng nhập đầy đủ thông tin.");
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      showRegisterError("Hiện tại hệ thống đăng ký bằng email. Vui lòng nhập email hợp lệ.");
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
        body: JSON.stringify({ email, password, name }),
      });

      const data = await response.json();
      if (!response.ok) {
        showRegisterError(data.detail || "Đăng ký thất bại.");
        return;
      }

      localStorage.setItem("token", data.access_token);
      alert("Đăng ký thành công!");
      window.location.href = "index.html";
    } catch (error) {
      console.error(error);
      showRegisterError("Không kết nối được backend tại http://localhost:8000.");
    }
  });
}
