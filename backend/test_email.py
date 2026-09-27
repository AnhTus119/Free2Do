"""Chẩn đoán Gmail SMTP và tùy chọn gửi một email OTP thử."""
import smtplib
import ssl
import sys
from app.config import settings
from app.utils.email import send_otp_email


def normalized_credentials():
    user = settings.SMTP_USER.strip().strip("\"'")
    password = "".join(settings.SMTP_PASSWORD.strip().strip("\"'").split())
    return user, password


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    user, password = normalized_credentials()
    if not user or not password:
        raise SystemExit("THẤT BẠI: thiếu SMTP_USER hoặc SMTP_PASSWORD trong backend/.env")
    print(f"SMTP: {settings.SMTP_HOST}:{settings.SMTP_PORT}")
    print(f"Tài khoản: {user}")
    print(f"App Password sau chuẩn hóa: {len(password)} ký tự")
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as server:
            server.ehlo()
            server.starttls(context=ssl.create_default_context())
            server.ehlo()
            server.login(user, password)
        print("ĐĂNG NHẬP SMTP: THÀNH CÔNG")
    except smtplib.SMTPAuthenticationError as exc:
        raise SystemExit(
            f"THẤT BẠI: Gmail từ chối tài khoản/App Password (SMTP {exc.smtp_code}). "
            "Hãy tạo App Password mới; không dùng mật khẩu Gmail thường."
        ) from exc
    except Exception as exc:
        raise SystemExit(f"THẤT BẠI KẾT NỐI SMTP: {type(exc).__name__}: {exc}") from exc

    if len(sys.argv) >= 2:
        to_email = sys.argv[1].strip()
        send_otp_email(to_email, code="123456", purpose="reset_password")
        print(f"ĐÃ GỬI EMAIL THỬ tới {to_email}; hãy kiểm tra cả Spam/Thư rác.")
    else:
        print("Chưa gửi email. Muốn gửi thử: python test_email.py email-nhan@gmail.com")

if __name__ == "__main__":
    main()
