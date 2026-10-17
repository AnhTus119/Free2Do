"""Hết hạn chờ duyệt, từ chối/xóa hoạt động, chống trùng hoạt động, mã khách hàng, kiểm tra tên/email."""
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models, schemas
from app.routers import activities, categories
from app.utils.identity import normalize_email, normalize_person_name


class OperatorRoundTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        models.Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.now = now = datetime.utcnow()
        self.db.add_all([models.Role(role_id="RB", role_name="business"), models.Role(role_id="RC", role_name="customer")])
        for aid, kind in (("AO", "operator"), ("AB", "user")):
            self.db.add(models.Account(account_id=aid, email=f"{aid}@t.local", account_type=kind, status="active",
                                       auth_provider="email", email_verified=True, created_at=now))
        self.db.flush()
        self.db.add(models.Operator(operator_id="OP1", account_id="AO", name="Op", level="admin", status="active", created_at=now))
        self.db.add(models.User(user_id="B1", account_id="AB", role_id="RB", name="Biz"))
        self.db.flush()
        self.db.add(models.BusinessProfile(user_id="B1", business_name="Quán Thử", business_address="1 Đường Thử"))
        self.db.add(models.Activity(activity_id="X1", business_id="B1", name="Cà phê Thử", address="1 Đường Thử, Hà Nội",
                                    latitude=21.0, longitude=105.8, status="active", created_at=now))
        self.db.add(models.Activity(activity_id="P1", business_id="B1", name="Chờ lâu", address="2 Đường Thử", status="pending",
                                    created_at=now - timedelta(days=31), expire_at=now - timedelta(days=1)))
        self.db.add(models.Activity(activity_id="P2", business_id="B1", name="Chờ mới", address="3 Đường Thử", status="pending",
                                    created_at=now, expire_at=now + timedelta(days=29)))
        self.db.commit()
        self.operator = self.db.get(models.Operator, "OP1")

    def test_overdue_pending_expires_with_email_and_cannot_be_approved(self):
        with patch.object(activities, "send_activity_expired_email") as mail:
            self.assertEqual(1, activities.expire_overdue_activities(self.db))
        mail.assert_called_once()
        self.assertEqual("expired", self.db.get(models.Activity, "P1").status)
        self.assertEqual("pending", self.db.get(models.Activity, "P2").status)
        with self.assertRaises(HTTPException):
            activities.approve_activity("P1", self.db, self.operator)

    def test_reject_requires_pending_and_stores_reason(self):
        with patch.object(activities, "send_activity_rejected_email") as mail:
            out = activities.reject_activity("P2", schemas.ActivityRejectRequest(reason="Ảnh sai địa điểm"), self.db, self.operator)
        self.assertEqual(("rejected", "Ảnh sai địa điểm"), (out.status, out.rejection_reason))
        mail.assert_called_once()
        with self.assertRaises(HTTPException):
            activities.reject_activity("X1", schemas.ActivityRejectRequest(reason="abc"), self.db, self.operator)

    def test_operator_delete_only_active(self):
        activities.delete_activity_as_operator("X1", self.db, self.operator)
        self.assertEqual("cancelled", self.db.get(models.Activity, "X1").status)
        with self.assertRaises(HTTPException):
            activities.delete_activity_as_operator("P2", self.db, self.operator)

    def test_duplicate_needs_other_name_or_place(self):
        with self.assertRaises(HTTPException) as ctx:  # cùng tên (khác hoa/thường) + cùng địa chỉ
            activities._ensure_not_duplicate(self.db, "cà phê  thử", "1 đường thử, hà nội", None, None)
        self.assertEqual(409, ctx.exception.status_code)
        with self.assertRaises(HTTPException):  # cùng tên + toạ độ cách ~10 m
            activities._ensure_not_duplicate(self.db, "Cà phê Thử", "Địa chỉ khác", 21.00009, 105.8)
        activities._ensure_not_duplicate(self.db, "Cà phê Thử", "99 Phố Khác", 21.1, 105.9)  # khác vị trí
        activities._ensure_not_duplicate(self.db, "Trà sữa", "1 Đường Thử, Hà Nội", 21.0, 105.8)  # khác tên
        self.db.get(models.Activity, "X1").status = "expired"  # hoạt động cũ hết hạn -> được gửi lại
        self.db.commit()
        activities._ensure_not_duplicate(self.db, "Cà phê Thử", "1 Đường Thử, Hà Nội", 21.0, 105.8)

    def test_new_business_activity_gets_review_deadline(self):
        payload = schemas.ActivityCreate(name="Mới tinh", description="Mô tả", address="5 Đường Thử, Hà Nội", google_maps_url="https://maps.app.goo.gl/x")
        with patch.object(activities, "_coordinates", return_value=(21.2, 105.7)):
            created = activities._create_activity_record(self.db, self.db.get(models.BusinessProfile, "B1"), payload)
        self.assertEqual("pending", created.status)
        self.assertAlmostEqual(30, (created.expire_at - created.created_at).days, delta=1)

    def test_customer_codes_are_sequential(self):
        account = models.Account(account_id="AC2", email="c2@t.local", account_type="user", status="active",
                                 auth_provider="email", email_verified=True, created_at=self.now)
        self.db.add(account)
        self.db.flush()
        first = models.User(account_id="AC2", role_id="RC", name="Khách Một")
        self.db.add(first)
        self.db.commit()
        self.assertRegex(first.code, r"^C\d+$")
        self.assertNotEqual(self.db.get(models.User, "B1").code, first.code)

    def test_category_delete_blocked_when_used(self):
        cat = models.Category(category_id="K1", name="Cà phê")
        self.db.add(cat)
        self.db.add(models.ActivityCategory(activity_id="X1", category_id="K1"))
        self.db.commit()
        with self.assertRaises(HTTPException) as ctx:
            categories.delete_category("K1", self.db, self.operator)
        self.assertEqual(409, ctx.exception.status_code)
        with self.assertRaises(HTTPException):  # trùng tên không phân biệt hoa thường
            categories.create_category(schemas.CategoryCreate(name="cà PHÊ"), self.db, self.operator)
        rows = categories.list_categories_for_operator(self.db, self.operator)
        self.assertEqual([("Cà phê", 1)], [(row.name, row.activity_count) for row in rows])

    def test_person_name_rules(self):
        self.assertEqual("Nguyễn Văn An", normalize_person_name("  Nguyễn   Văn An "))
        self.assertEqual("John Smith", normalize_person_name("John Smith"))
        for bad in ("<script>alert(1)</script>>", "An123", "A", "Tú@go", "Trần-Thị", "x" * 51):
            with self.assertRaises(ValueError, msg=bad):
                normalize_person_name(bad)

    def test_email_rules(self):
        self.assertEqual("mail.sai+1@gmail.com", normalize_email(" Mail.Sai+1@Gmail.com "))
        for bad in ("<script>@x.com", "a..b@x.com", ".a@x.com", "a@x", "a@-x.com", "a b@x.com"):
            with self.assertRaises(ValueError, msg=bad):
                normalize_email(bad)


    def test_action_logs_scoped_per_profile(self):
        """Hồ sơ hoạt động chỉ thấy log của chính nó + log cấp doanh nghiệp; hồ sơ DN thấy tất cả."""
        from app.routers import action_logs
        with patch.object(activities, "send_activity_rejected_email"):
            activities.reject_activity("P2", schemas.ActivityRejectRequest(reason="Thiếu ảnh"), self.db, self.operator)
        activities.delete_activity_as_operator("X1", self.db, self.operator)
        action_logs.log_action(self.db, self.operator, "Khóa tài khoản", "business", "B1", "B1")
        self.db.commit()

        on_p2 = action_logs.list_action_logs("activity", "P2", self.db, self.operator)
        self.assertEqual({"Từ chối hoạt động", "Khóa tài khoản"}, {row.action for row in on_p2})
        self.assertIn("Thiếu ảnh", next(row.detail for row in on_p2 if row.action == "Từ chối hoạt động"))
        on_business = action_logs.list_action_logs("business", "B1", self.db, self.operator)
        self.assertEqual(3, len(on_business))
        self.assertEqual("Cà phê Thử", next(row.target_name for row in on_business if row.target_id == "X1"))
        self.assertEqual([], action_logs.list_action_logs("customer", "B1", self.db, self.operator))

    def test_activity_description_required(self):
        from pydantic import ValidationError
        with self.assertRaises(ValidationError):
            schemas.ActivityCreate(name="A", description="   ", address="1 Phố")
        with self.assertRaises(ValidationError):
            schemas.ActivityUpdate(description="")
        with self.assertRaises(ValidationError):
            schemas.ActivityUpdate(description=None)
        self.assertIsNone(schemas.ActivityUpdate(name="B").description)


if __name__ == "__main__":
    unittest.main()
