import unittest
from datetime import UTC, datetime
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models, schemas
from app.auth import hash_password
from app.routers import activities, notifications, users
from app.routers import auth as auth_router
from app.routers.operator import update_my_operator_profile
from app.routers.operator_users import lookup_business_profiles


class NewFeatureTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        models.Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.now = now = datetime.now(UTC).replace(tzinfo=None)
        self.db.add_all([models.Role(role_id="RB", role_name="business"), models.Role(role_id="RC", role_name="customer")])
        for aid, kind in (("AO", "operator"), ("AB", "user"), ("AC", "user")):
            self.db.add(models.Account(account_id=aid, email=f"{aid}@t.local", recovery_email=f"{aid}@t.local",
                                       password_hash=hash_password("Matkhau123"), account_type=kind, status="active",
                                       auth_provider="email", email_verified=True, created_at=now))
        self.db.flush()
        self.db.add(models.Operator(operator_id="OP1", account_id="AO", name="Op", level="admin", status="active", created_at=now))
        self.db.add(models.User(user_id="B900", account_id="AB", role_id="RB", name="Biz"))
        self.db.add(models.User(user_id="UC", account_id="AC", role_id="RC", name="Cus"))
        self.db.flush()
        self.db.add(models.BusinessProfile(user_id="B900", business_name="Quán Thử Nghiệm", business_address="1 Đường Thử"))
        self.db.flush()
        self.db.add(models.Activity(activity_id="A1", business_id="B900", name="Cà phê thử", address="1 Đường Thử", status="active",
                                    created_at=now, verified_at=now, always_available=True))
        self.db.add(models.Activity(activity_id="A2", business_id="B900", name="Chờ duyệt", address="1 Đường Thử", status="pending", created_at=now))
        self.db.add(models.BusinessRequest(request_id="R1", user_id="UC", business_name="Shop Mới", status="pending", created_at=now))
        self.db.commit()
        self.operator = self.db.get(models.Operator, "OP1")

    def ids(self, account_id):
        return {i.id for i in notifications.list_notifications(db=self.db, account=self.db.get(models.Account, account_id))}

    # --- thông báo
    def test_notifications_by_role(self):
        self.assertIn("new-activity:A1", self.ids("AC"))
        self.assertNotIn("new-activity:A2", self.ids("AC"))
        self.assertTrue({"request:R1", "pending-activity:A2"} <= self.ids("AO"))
        self.db.add(models.Review(review_id="V1", user_id="UC", activity_id="A1", rating=5, created_at=self.now))
        self.db.commit()
        business = self.ids("AB")
        self.assertIn("review:V1", business)
        self.assertTrue(any(i.startswith("approved:A1") for i in business))

    def test_closing_soon_handles_overnight_hours(self):
        at = datetime(2026, 10, 15, 20, 30, tzinfo=notifications.VN_TZ)
        activity = self.db.get(models.Activity, "A1")
        activity.time_open, activity.time_close = datetime(2000, 1, 1, 8), datetime(2000, 1, 1, 21)
        self.assertEqual(30, notifications._minutes_until_close(activity, at))
        activity.time_open, activity.time_close = datetime(2000, 1, 1, 18), datetime(2000, 1, 1, 2)
        self.assertEqual(330, notifications._minutes_until_close(activity, at))
        self.assertIsNone(notifications._minutes_until_close(activity, at.replace(hour=10)))

    # --- hồ sơ operator / đổi mật khẩu
    def test_operator_profile_and_password(self):
        out = update_my_operator_profile(schemas.OperatorProfileUpdate(name="Tên Mới", email_notifications=False), self.db, self.operator)
        self.assertEqual(("Tên Mới", False), (out.name, out.email_notifications))
        account = self.db.get(models.Account, "AO")
        with self.assertRaises(HTTPException):
            auth_router.change_password(schemas.ChangePasswordRequest(current_password="sai", new_password="Matkhau456"), self.db, account)
        auth_router.change_password(schemas.ChangePasswordRequest(current_password="Matkhau123", new_password="Matkhau456"), self.db, account)
        self.assertTrue(auth_router.verify_password("Matkhau456", account.password_hash))

    # --- operator tạo hoạt động
    def payload(self, **extra):
        data = dict(name="Quán Thử Nghiệm - Cà phê", address="1 Đường Thử, Hai Bà Trưng, Hà Nội",
                    google_maps_url="https://maps.app.goo.gl/abc", business_id="B900")
        data.update(extra)
        return schemas.OperatorActivityCreate(**data)

    def test_lookup_business(self):
        find = lambda q: [i.user_id for i in lookup_business_profiles(q=q, limit=8, db=self.db, operator=self.operator)]
        self.assertEqual(["B900"], find("thử nghiệm"))
        self.assertEqual(["B900"], find("B900"))
        self.assertEqual([], find("không tồn tại"))

    def test_operator_activity_is_active_and_requires_existing_business(self):
        with patch.object(activities, "_coordinates", return_value=(21.0, 105.85)):
            out = activities.operator_create_activity(self.payload(), self.db, self.operator)
        activity = self.db.get(models.Activity, out.activity_id)
        self.assertEqual(("active", "OP1", "B900"), (activity.status, activity.verified_by, activity.business_id))
        with self.assertRaises(HTTPException) as missing:
            activities.operator_create_activity(self.payload(business_id="B404"), self.db, self.operator)
        self.assertEqual(404, missing.exception.status_code)
        with self.assertRaises(HTTPException) as bad:
            activities.operator_create_activity(self.payload(address="dfb"), self.db, self.operator)
        self.assertEqual(422, bad.exception.status_code)

    # --- sở thích cá nhân
    def test_interests_dedupe_order_and_remove(self):
        user = self.db.get(models.User, "UC")
        put = lambda v: users.replace_my_interests(schemas.UserInterestsUpdate(interests=v), self.db, user)["interests"]
        self.assertEqual(["Leo núi", "Đọc sách"], put(["  Leo   núi ", "Đọc sách", "leo núi", ""]))
        self.assertEqual(["Leo núi", "Đọc sách", "Bơi"], put(["Leo núi", "Đọc sách", "Bơi"]))
        self.assertEqual(["Bơi"], put(["Bơi"]))


if __name__ == "__main__":
    unittest.main()
