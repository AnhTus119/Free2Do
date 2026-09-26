"""Kích hoạt đăng nhập bằng số điện thoại cho các Business từ dữ liệu seed.

Mật khẩu mặc định theo yêu cầu kiểm thử: ``Doanhnghiep123``.
Script chỉ cập nhật các Business B001..B028 thuộc bộ dữ liệu mẫu và có số điện
thoại trong database hoặc seed. Có thể chạy lại an toàn.
"""

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app import models
from app.auth import hash_password
from app.database import SessionLocal
from app.utils.identity import normalize_phone
from seed_activities import ACTIVITIES


DEFAULT_BUSINESS_PASSWORD = "Doanhnghiep123"
SEED_PHONES: dict[str, str | None] = {}
for row in ACTIVITIES:
    SEED_PHONES.setdefault(row[1], row[3])


def seed_business_accounts(db: Session) -> tuple[list[tuple[str, str]], list[str]]:
    updated: list[tuple[str, str]] = []
    missing_phone: list[str] = []
    now = datetime.now(UTC).replace(tzinfo=None)

    for business_id, fallback_phone in sorted(SEED_PHONES.items()):
        profile = db.query(models.BusinessProfile).filter_by(user_id=business_id).first()
        user = db.query(models.User).filter_by(user_id=business_id).first()
        if not profile or not user or not user.account:
            raise RuntimeError(f"Thiếu quan hệ account/user/business_profile cho {business_id}")

        raw_phone = profile.phone or user.phone or fallback_phone
        if not raw_phone:
            missing_phone.append(business_id)
            continue
        phone = normalize_phone(raw_phone)
        collision = (
            db.query(models.Account)
            .filter(models.Account.phone == phone, models.Account.account_id != user.account_id)
            .first()
        )
        if collision:
            raise RuntimeError(f"Số điện thoại {phone} của {business_id} đã thuộc tài khoản khác")

        account = user.account
        account.phone = phone
        account.password_hash = hash_password(DEFAULT_BUSINESS_PASSWORD)
        account.auth_provider = "phone"
        account.status = "active"
        account.updated_at = now
        user.phone = phone
        profile.phone = phone
        updated.append((business_id, phone))

    db.commit()
    return updated, missing_phone


def main() -> None:
    db = SessionLocal()
    try:
        updated, missing = seed_business_accounts(db)
        print(f"Enabled phone login for {len(updated)} seeded businesses.")
        if missing:
            print(f"Missing phone number: {', '.join(missing)}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
