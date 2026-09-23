"""
Chạy 1 LẦN DUY NHẤT để tạo Operator cấp cao (admin) đầu tiên.

Lý do cần script này: API POST /operator/operators yêu cầu người gọi đã là
Operator admin -- nhưng lúc mới deploy chưa có Operator nào cả. Sau khi có
admin đầu tiên, mọi Operator khác (kể cả admin khác) nên tạo qua API
POST /operator/operators (đăng nhập bằng tài khoản admin này), KHÔNG chạy
lại script này nữa.

Cách chạy (đứng trong thư mục backend/, đã kích hoạt venv, đã có .env):
    python bootstrap_admin.py

Nhớ đổi EMAIL/PASSWORD/NAME bên dưới trước khi chạy, và đổi mật khẩu ngay
sau lần đăng nhập đầu tiên.
"""
from datetime import datetime

from app.database import SessionLocal
from app.auth import hash_password
from app import models

EMAIL = "admin@free2do.vn"
PASSWORD = "DoiMatKhauNayNgaySauKhiDangNhap!123"
NAME = "Quan tri vien"


def main() -> None:
    db = SessionLocal()
    try:
        existing = db.query(models.Account).filter(models.Account.email == EMAIL).first()
        if existing:
            print(f"Email {EMAIL} đã tồn tại trong database, dừng lại (không tạo trùng).")
            return

        now = datetime.utcnow()
        account = models.Account(
            email=EMAIL,
            password_hash=hash_password(PASSWORD),
            auth_provider="email",
            email_verified=True,
            account_type="operator",
            status="active",
            created_at=now,
        )
        db.add(account)
        db.flush()  # có account_id trước khi tạo Operator

        operator = models.Operator(
            account_id=account.account_id,
            name=NAME,
            level="admin",
            status="active",
            created_at=now,
        )
        db.add(operator)
        db.commit()

        print("Đã tạo Operator admin đầu tiên:")
        print(f"  email    = {EMAIL}")
        print(f"  password = {PASSWORD}")
        print("Đăng nhập qua POST /auth/login rồi đổi mật khẩu ngay.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
