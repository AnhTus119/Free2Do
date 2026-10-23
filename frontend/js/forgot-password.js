const AUTH_API_BASE_URL = window.FREE2DO_CONFIG.API_BASE_URL;

async function readJson(response) {
  try { return await response.json(); } catch { return {}; }
}

// Backend chỉ cho gửi lại OTP sau 60 giây (tối đa 5 lần/giờ): khóa nút và đếm ngược cho khớp.
const OTP_RESEND_SECONDS = 60;
function lockResend(button, seconds) {
  clearInterval(button._cooldown);
  let left = seconds;
  const tick = () => {
    button.disabled = left > 0;
    button.textContent = left > 0 ? `Gửi lại mã (${left}s)` : "Gửi lại mã";
    if (left-- <= 0) clearInterval(button._cooldown);
  };
  tick();
  button._cooldown = setInterval(tick, 1000);
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
      if (response.status === 429) {
        message.classList.remove("is-success");
        message.textContent = data.detail;
        lockResend(button, Number(response.headers.get("Retry-After")) || OTP_RESEND_SECONDS);
        return;
      }
      if (!response.ok) throw new Error(data.detail || "Không gửi được mã xác nhận.");

      sessionStorage.setItem("reset_identifier", identifier);
      message.textContent = data.message || "Mã OTP đã được gửi tới email của bạn.";
      message.classList.add("is-success");
      lockResend(button, OTP_RESEND_SECONDS);
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

const resetForm = document.querySelector(".reset-password__form");
if (resetForm) {
  resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const resetToken = sessionStorage.getItem("reset_token");
    const password = document.getElementById("reset-password").value;
    const confirmPassword = document.getElementById("reset-password-confirm").value;

    if (!resetToken) {
      F2D.toast("Phiên đặt lại mật khẩu không hợp lệ. Vui lòng yêu cầu mã mới.", "error");
      setTimeout(() => { window.location.href = "forgot-password.html"; }, 1800);
      return;
    }
    if (password.length < 8) return F2D.toast("Mật khẩu phải có ít nhất 8 ký tự.", "error");
    if (password !== confirmPassword) return F2D.toast("Mật khẩu xác nhận không khớp.", "error");

    await F2D.busy(resetForm.querySelector("button[type=submit], button:not([type])"), async () => {
      try {
        const response = await fetch(`${AUTH_API_BASE_URL}/auth/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reset_token: resetToken, new_password: password }),
        });
        const data = await readJson(response);
        if (!response.ok) return F2D.toast(data.detail || "Đổi mật khẩu thất bại.", "error");

        sessionStorage.removeItem("reset_identifier");
        sessionStorage.removeItem("reset_token");
        F2D.toast("Đổi mật khẩu thành công. Đang chuyển tới trang đăng nhập...");
        await new Promise(resolve => setTimeout(resolve, 1500));
        window.location.href = "log-in.html";
      } catch (error) {
        console.error(error);
        F2D.toast(`Không kết nối được máy chủ. Vui lòng thử lại sau.`, "error");
      }
    });
  });
}
