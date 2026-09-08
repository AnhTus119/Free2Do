"""
Test riêng việc gửi email OTP qua Gmail SMTP.
Cách chạy (từ thư mục backend/): python test_email.py your-email@gmail.com
"""
import sys
from app.utils.email import send_otp_email

def main():
    if len(sys.argv) < 2:
        print("Cách dùng: python test_email.py your-email@gmail.com")
        return

    to_email = sys.argv[1]

    try:
        send_otp_email(to_email, code="123456", purpose="register")
        print(f"Đã gửi email test tới {to_email}, kiểm tra hộp thư (kể cả Spam).")
    except Exception as e:
        print("Gửi email thất bại:")
        print(e)

if __name__ == "__main__":
    main()