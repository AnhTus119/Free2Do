from datetime import datetime
from app.database import SessionLocal
from app import models
from app.auth import hash_password

PASSWORD = "Test@123"

OPERATORS = [
    ("thiennhann0006@gmail.com", "Nguyễn Thiện Nhân"),
    ("dieulinhld02@test.com", "Lê Thị Diệu Linh"),
    ("nasedahariyu0507@gmail.com", "Dương Khánh Duy"),
    ("phamphuonganh30102006@test.com", "Phạm Phương Anh"),
    ("Klian0405@gmail.com", "Nguyễn Thị Linh Anh"),
    ("tranhoangtrung240206@test.com", "Trần Hoàng Trung"),
    ("anhtud143@gmail.com", "Đoàn Anh Tú"),
]

def main():
    db = SessionLocal()
    now = datetime.utcnow()

    for email, name in OPERATORS:
        if db.query(models.Account).filter_by(email=email).first():
            continue

        account = models.Account(
            email=email,
            password_hash=hash_password(PASSWORD),
            auth_provider="email",
            email_verified=True,
            account_type="operator",
            status="active",
            created_at=now,
        )
        db.add(account)
        db.flush()

        db.add(models.Operator(account_id=account.account_id, name=name))

    db.commit()
    db.close()
    print(f"Đã tạo xong 7 account operator. Mật khẩu chung: {PASSWORD}")

if __name__ == "__main__":
    main()