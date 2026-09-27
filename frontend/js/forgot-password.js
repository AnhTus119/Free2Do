const AUTH_API_BASE_URL = window.FREE2DO_CONFIG.API_BASE_URL;

async function readJson(response) {
  try { return await response.json(); } catch { return {}; }
}

const forgotForm = document.querySelector(".forgot-password__form");
const inlineOtpForm = document.getElementById("forgot-otp-form");
if (forgotForm) {
  forgotForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const identifier = document.getElementById("forgot-identifier").value.trim();
    if (!identifier) return;

    const button = forgotForm.querySelector("button");
    const message = document.getElementById("forgot-message");
    button.disabled = true;
    button.textContent = "Đang gửi mã...";
    message.textContent = "";
    try {
      await window.FREE2DO_BACKEND_READY;
      const response = await fetch(`${AUTH_API_BASE_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.detail || "Không gửi được mã xác nhận.");

      sessionStorage.setItem("reset_identifier", identifier);
      message.textContent = data.message || "Mã OTP đã được gửi tới email của bạn.";
      message.classList.add("is-success");
      button.disabled = false;
      button.textContent = "Gửi lại mã";
      inlineOtpForm.classList.remove("hidden");
      inlineOtpForm.setAttribute("aria-hidden", "false");
      document.getElementById("forgot-otp-code").focus();
    } catch (error) {
      console.error(error);
      button.disabled = false;
      button.textContent = "Gửi mã xác nhận";
      message.classList.remove("is-success");
      message.textContent = error.message || `Không kết nối được backend tại ${AUTH_API_BASE_URL}.`;
    }
  });
}

if (inlineOtpForm) {
  inlineOtpForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const identifier = sessionStorage.getItem("reset_identifier");
    const codeInput = document.getElementById("forgot-otp-code");
    const code = codeInput.value.trim();
    const button = inlineOtpForm.querySelector("button");
    const message = document.getElementById("otp-message");

    if (!identifier) {
      message.textContent = "Phiên xác nhận đã hết hạn. Vui lòng gửi lại mã OTP.";
      return;
    }

    button.disabled = true;
    button.textContent = "Đang xác nhận...";
    message.textContent = "";
    try {
      await window.FREE2DO_BACKEND_READY;
      const response = await fetch(`${AUTH_API_BASE_URL}/auth/verify-reset-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, code }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.detail || "Mã OTP không đúng hoặc đã hết hạn.");

      sessionStorage.setItem("reset_token", data.reset_token);
      window.location.href = "reset-password.html";
    } catch (error) {
      console.error(error);
      button.disabled = false;
      button.textContent = "Xác nhận mã OTP";
      message.textContent = error.message || `Không kết nối được backend tại ${AUTH_API_BASE_URL}.`;
      codeInput.focus();
    }
  });
}

const checkEmailForm = document.querySelector(".check-email__form");
if (checkEmailForm) {
  checkEmailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const identifier = sessionStorage.getItem("reset_identifier");
    const code = document.getElementById("check-email-code").value.trim();

    if (!identifier) {
      alert("Không tìm thấy tài khoản cần đặt lại mật khẩu. Vui lòng thử lại.");
      window.location.href = "forgot-password.html";
      return;
    }

    const button = checkEmailForm.querySelector("button");
    const message = checkEmailForm.querySelector(".form-message");
    button.disabled = true;
    button.textContent = "Đang xác nhận...";
    message.textContent = "";
    try {
      await window.FREE2DO_BACKEND_READY;
      const response = await fetch(`${AUTH_API_BASE_URL}/auth/verify-reset-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, code }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.detail || "Mã xác nhận không đúng hoặc đã hết hạn.");

      sessionStorage.setItem("reset_token", data.reset_token);
      window.location.href = "reset-password.html";
    } catch (error) {
      console.error(error);
      button.disabled = false;
      button.textContent = "Xác nhận mã OTP";
      message.textContent = error.message || `Không kết nối được backend tại ${AUTH_API_BASE_URL}.`;
    }
  });
}

const resetForm = document.querySelector(".reset-password__form");
if (resetForm) {
  resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const resetToken = sessionStorage.getItem("reset_token");
    const password = document.getElementById("reset-password").value;
    const confirmPassword = document.getElementById("reset-password-confirm").value;

    if (!resetToken) {
      alert("Phiên đặt lại mật khẩu không hợp lệ. Vui lòng yêu cầu mã mới.");
      window.location.href = "forgot-password.html";
      return;
    }
    if (password.length < 8) return alert("Mật khẩu phải có ít nhất 8 ký tự.");
    if (password !== confirmPassword) return alert("Mật khẩu xác nhận không khớp.");

    try {
      const response = await fetch(`${AUTH_API_BASE_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset_token: resetToken, new_password: password }),
      });
      const data = await readJson(response);
      if (!response.ok) return alert(data.detail || "Đổi mật khẩu thất bại.");

      sessionStorage.removeItem("reset_identifier");
      sessionStorage.removeItem("reset_token");
      alert("Đổi mật khẩu thành công. Hãy đăng nhập bằng mật khẩu mới.");
      window.location.href = "log-in.html";
    } catch (error) {
      console.error(error);
      alert(`Không kết nối được backend tại ${AUTH_API_BASE_URL}.`);
    }
  });
}
