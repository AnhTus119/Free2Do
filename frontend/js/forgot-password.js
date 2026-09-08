const AUTH_API_BASE_URL = "https://free2do.onrender.com";

async function readJson(response) {
  try { return await response.json(); } catch { return {}; }
}

const forgotForm = document.querySelector(".forgot-password__form");
if (forgotForm) {
  forgotForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("forgot-email").value.trim();
    if (!email) return;

    try {
      const response = await fetch(`${AUTH_API_BASE_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await readJson(response);
      if (!response.ok) return alert(data.detail || "Không gửi được mã xác nhận.");

      sessionStorage.setItem("reset_email", email);
      window.location.href = "check-email.html";
    } catch (error) {
      console.error(error);
      alert("Không kết nối được backend tại http://localhost:8000.");
    }
  });
}

const checkEmailForm = document.querySelector(".check-email__form");
if (checkEmailForm) {
  checkEmailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = sessionStorage.getItem("reset_email");
    const code = document.getElementById("check-email-code").value.trim();

    if (!email) {
      alert("Không tìm thấy email cần đặt lại mật khẩu. Vui lòng nhập lại email.");
      window.location.href = "forgot-password.html";
      return;
    }

    try {
      const response = await fetch(`${AUTH_API_BASE_URL}/auth/verify-reset-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await readJson(response);
      if (!response.ok) return alert(data.detail || "Mã xác nhận không đúng hoặc đã hết hạn.");

      sessionStorage.setItem("reset_token", data.reset_token);
      window.location.href = "reset-password.html";
    } catch (error) {
      console.error(error);
      alert("Không kết nối được backend tại http://localhost:8000.");
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

      sessionStorage.removeItem("reset_email");
      sessionStorage.removeItem("reset_token");
      alert("Đổi mật khẩu thành công. Hãy đăng nhập bằng mật khẩu mới.");
      window.location.href = "log-in.html";
    } catch (error) {
      console.error(error);
      alert("Không kết nối được backend tại http://localhost:8000.");
    }
  });
}
