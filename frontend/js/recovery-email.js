const RECOVERY_API_BASE = window.FREE2DO_CONFIG.API_BASE_URL;
const token = localStorage.getItem("token");
if (!token) window.location.href = "log-in.html";

const emailForm = document.getElementById("recovery-email-form");
const codeForm = document.getElementById("recovery-code-form");
const emailInput = document.getElementById("recovery-email");
const codeInput = document.getElementById("recovery-code");
const message = document.getElementById("recovery-message");
let pendingEmail = "";

async function request(path, options = {}) {
  const response = await fetch(`${RECOVERY_API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Yêu cầu thất bại.");
  return data;
}

emailForm.addEventListener("submit", async event => {
  event.preventDefault();
  pendingEmail = emailInput.value.trim().toLowerCase();
  message.textContent = "";
  try {
    await request("/auth/recovery-email/request", {
      method: "POST",
      body: JSON.stringify({ recovery_email: pendingEmail }),
    });
    emailInput.readOnly = true;
    emailForm.querySelector("button").disabled = true;
    codeForm.classList.remove("hidden");
    message.style.color = "#287a52";
    message.textContent = "Đã gửi mã OTP. Hãy kiểm tra hộp thư và thư rác.";
  } catch (error) {
    message.style.color = "#b42318";
    message.textContent = error.message;
  }
});

codeForm.addEventListener("submit", async event => {
  event.preventDefault();
  message.textContent = "";
  try {
    await request("/auth/recovery-email/verify", {
      method: "PUT",
      body: JSON.stringify({ recovery_email: pendingEmail, code: codeInput.value.trim() }),
    });
    const me = await request("/auth/me");
    window.location.href = me.redirect;
  } catch (error) {
    message.style.color = "#b42318";
    message.textContent = error.message;
  }
});
