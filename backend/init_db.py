"""
Chạy để tạo các bảng còn thiếu và đảm bảo có role mặc định.
Cách chạy (từ thư mục backend/): python init_db.py
"""
from app.database import engine, Base, SessionLocal
from app import models

DEFAULT_ROLES = ("customer", "business")

def seed_default_roles():
    db = SessionLocal()
    try:
        existing = {role.role_name.lower() for role in db.query(models.Role).all()}
        for role_name in DEFAULT_ROLES:
            if role_name not in existing:
                db.add(models.Role(role_name=role_name))
        db.commit()
    finally:
        db.close()

def main():
    Base.metadata.create_all(bind=engine)
    seed_default_roles()
    print("Đã tạo/kiểm tra bảng và role mặc định: customer, business.")

if __name__ == "__main__":
    main()
