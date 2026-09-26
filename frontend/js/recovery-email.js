const API_BASE_URL = window.FREE2DO_CONFIG?.API_BASE_URL?.replace(/\/$/, "");
const token = localStorage.getItem("token");

if (!API_BASE_URL) {
  throw new Error("Thiếu FREE2DO_CONFIG.API_BASE_URL");
}

if (!token) {
  window.location.replace("log-in.html");
}

const emailForm = document.getElementById("recovery-email-form");
const codeForm = document.getElementById("recovery-code-form");
const emailInput = document.getElementById("recovery-email");
const codeInput = document.getElementById("recovery-code");
const message = document.getElementById("recovery-message");

let pendingEmail = "";

function homePageForAccount(me) {
  if (me.account_type === "operator" || me.role === "operator") {
    return "admin.html";
  }

  if (me.role === "business") {
    return "Demo Trang Business/business-home.html";
  }

  return "Demo Trang Customer/home.html";
}

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    throw new Error(
      `Không kết nối được backend tại ${API_BASE_URL}.`
    );
  }

  const data = await response.json().catch(() => null);

  if (response.status === 401) {
    localStorage.removeItem("token");
    window.location.replace("log-in.html");
    throw new Error("Phiên đăng nhập đã hết hạn.");
  }

  if (!response.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : `Yêu cầu thất bại (${response.status}).`
    );
  }

  return data;
}

emailForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  pendingEmail = emailInput.value.trim().toLowerCase();
  message.textContent = "";

  try {
    await request("/auth/recovery-email/request", {
      method: "POST",
      body: JSON.stringify({
        recovery_email: pendingEmail,
      }),
    });

    emailInput.readOnly = true;
    emailForm.querySelector("button").disabled = true;
    codeForm.classList.remove("hidden");

    message.style.color = "#287a52";
    message.textContent =
      "Đã gửi mã OTP. Hãy kiểm tra hộp thư và thư rác.";
  } catch (error) {
    message.style.color = "#b42318";
    message.textContent = error.message;
  }
});

codeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";

  try {
    await request("/auth/recovery-email/verify", {
      method: "PUT",
      body: JSON.stringify({
        recovery_email: pendingEmail,
        code: codeInput.value.trim(),
      }),
    });

    const me = await request("/auth/me");

    // Điều hướng đúng theo loại tài khoản sau khi xác minh.
    window.location.replace(
      me.redirect || homePageForAccount(me)
    );
  } catch (error) {
    message.style.color = "#b42318";
    message.textContent = error.message;
  }
});