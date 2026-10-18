"""
Tạo tài khoản Operator admin đầu tiên cho database CỦA BẠN (clone mới). Chạy tay, 1 lần.

Lý do cần script này: API POST /operator/operators yêu cầu người gọi đã là
Operator admin -- nhưng database mới chưa có Operator nào. Các Operator sau
tạo trong trang quản trị bằng tài khoản admin này.

Cách chạy (trong backend/, venv đã kích hoạt, .env trỏ tới database cần tạo):
    python bootstrap_admin.py                     # email mặc định test123@gmail.com
    python bootstrap_admin.py admin@example.com   # email khác

Mật khẩu được hỏi khi chạy (Enter = mặc định test12345). Script in ra database đích
và chỉ ghi khi bạn gõ "yes". Email đã tồn tại thì dừng, không sửa tài khoản nào.
Lần đăng nhập đầu tiên, tài khoản bắt buộc phải đổi mật khẩu.
"""
import sys
from datetime import datetime
from getpass import getpass

from sqlalchemy.orm import Session

from app.database import SessionLocal, engine
from app.auth import hash_password
from app.utils.identity import normalize_email
from app import models

DEFAULT_EMAIL = "test123@gmail.com"
DEFAULT_PASSWORD = "test12345"
NAME = "Quan tri vien"


def create_admin(db: Session, email: str, password: str) -> models.Account:
    """Tạo Operator admin bị buộc đổi mật khẩu. Email đã tồn tại -> ValueError, không sửa gì."""
    email = normalize_email(email)
    if len(password) < 8:
        raise ValueError("Mật khẩu phải có ít nhất 8 ký tự.")
    if db.query(models.Account).filter(models.Account.email == email).first():
        raise ValueError(f"Email {email} đã có tài khoản trong database này; không tạo trùng, không sửa tài khoản cũ.")
    now = datetime.utcnow()
    account = models.Account(
        email=email,
        password_hash=hash_password(password),
        auth_provider="email",
        email_verified=True,
        must_change_password=True,
        account_type="operator",
        status="active",
        created_at=now,
    )
    db.add(account)
    db.flush()  # có account_id trước khi tạo Operator
    db.add(models.Operator(account_id=account.account_id, name=NAME, level="admin", status="active", created_at=now))
    db.commit()
    return account


def main() -> None:
    email = sys.argv[1] if len(sys.argv) > 1 else (input(f"Email admin [{DEFAULT_EMAIL}]: ").strip() or DEFAULT_EMAIL)
    password = getpass(f"Mật khẩu (Enter = mặc định {DEFAULT_PASSWORD}): ")
    if password and password != getpass("Nhập lại mật khẩu: "):
        raise SystemExit("Mật khẩu nhập lại không khớp, chưa tạo tài khoản.")
    target = f"{engine.url.host or 'file'}/{engine.url.database or ''}"
    print(f"Database đích (theo DATABASE_URL trong backend/.env): {target}")
    if input('Tạo tài khoản trên database này? Gõ "yes" để tiếp tục: ').strip().lower() != "yes":
        raise SystemExit("Đã hủy, không ghi gì vào database.")
    db = SessionLocal()
    try:
        created = create_admin(db, email, password or DEFAULT_PASSWORD).email
    except ValueError as exc:
        raise SystemExit(f"Không tạo tài khoản: {exc}") from exc
    finally:
        db.close()
    print(f"Đã tạo Operator admin {created}. Đăng nhập tại log-in.html; lần đầu sẽ phải đổi mật khẩu.")


if __name__ == "__main__":
    main()
