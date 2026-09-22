const ADMIN_API_BASE_URL = window.FREE2DO_CONFIG.API_BASE_URL;

const adminForm = document.querySelector(".admin-login__form");

function showAdminFieldError(inputId, errorId, message) {
  const field = document.getElementById(inputId).closest(".admin-login__field");
  const errorEl = document.getElementById(errorId);
  field.classList.add("admin-login__field--error");
  errorEl.textContent = message;
}

function clearAdminFieldError(inputId, errorId) {
  const field = document.getElementById(inputId).closest(".admin-login__field");
  field.classList.remove("admin-login__field--error");
  document.getElementById(errorId).textContent = "";
}

if (adminForm) {
  adminForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAdminFieldError("admin-account", "admin-account-error");
    clearAdminFieldError("admin-password", "admin-password-error");

    const email = document.getElementById("admin-account").value.trim();
    const password = document.getElementById("admin-password").value;
    if (!email || !password) {
      showAdminFieldError(
        !email ? "admin-account" : "admin-password",
        !email ? "admin-account-error" : "admin-password-error",
        "Vui lòng nhập đầy đủ thông tin."
      );
      return;
    }

    try {
      const formData = new URLSearchParams({ username: email, password });
      const response = await fetch(`${ADMIN_API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showAdminFieldError("admin-password", "admin-password-error", data.detail || "Đăng nhập thất bại.");
        return;
      }

      const meResponse = await fetch(`${ADMIN_API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const me = await meResponse.json().catch(() => ({}));
      if (!meResponse.ok || me.account_type !== "operator") {
        showAdminFieldError("admin-account", "admin-account-error", "Tài khoản này không có quyền quản trị.");
        return;
      }

      localStorage.setItem("token", data.access_token);
      window.location.href = me.redirect || "admin.html";
    } catch (error) {
      console.error(error);
      showAdminFieldError("admin-account", "admin-account-error", `Không kết nối được backend tại ${ADMIN_API_BASE_URL}.`);
    }
  });
}
