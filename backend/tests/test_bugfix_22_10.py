"""Các sửa lỗi đợt 22/10: SĐT (định dạng + 1 SĐT/1 tài khoản), đơn doanh nghiệp bắt buộc đủ thông tin,
khóa đăng nhập sai 5 lần, giới hạn gửi OTP, refresh token/đăng xuất, mã 400 cho 2 API theo test case."""
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.auth import create_access_token, hash_password
from app.database import get_db
from app.main import app
from app.utils.identity import normalize_phone

PASSWORD = "Matkhau123"


class Base(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        models.Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine)
        self.db = self.Session()
        now = datetime.utcnow()
        self.db.add(models.Role(role_id="RC", role_name="customer"))
        accounts = (
            ("AC", "c@t.local", None, "email"),
            ("AD", "d@t.local", "0987654321", "email"),
            ("AP", None, "0911111111", "phone"),
        )
        for aid, email, phone, provider in accounts:
            self.db.add(models.Account(
                account_id=aid, email=email, phone=phone, recovery_email=email or "p@t.local",
                password_hash=hash_password(PASSWORD), auth_provider=provider,
                account_type="user", status="active", created_at=now,
            ))
        self.db.flush()
        self.db.add_all([
            models.User(user_id="C1", account_id="AC", role_id="RC", name="Khach"),
            models.User(user_id="D1", account_id="AD", role_id="RC", name="Dung", phone="0987654321"),
            models.User(user_id="P1", account_id="AP", role_id="RC", name="Phuong", phone="0911111111"),
        ])
        self.db.commit()

        def override_db():
            session = self.Session()
            try:
                yield session
            finally:
                session.close()

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)
        self.as_ = {name: {"Authorization": f"Bearer {create_access_token(aid)}"} for name, aid in (("c", "AC"), ("p", "AP"))}

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()

    def login(self, username="c@t.local", password=PASSWORD):
        return self.client.post("/auth/login", data={"username": username, "password": password})


class PhoneTests(Base):
    def test_phone_format(self):
        self.assertEqual(normalize_phone("+84 912.345-678"), "0912345678")
        for bad in ("abc123", "abc0912345678", "0212345678", "091234567", "09123456789"):
            with self.assertRaises(ValueError):
                normalize_phone(bad)

    def test_profile_phone_validated_unique_and_locked_for_phone_login(self):
        patch_me = lambda who, phone: self.client.patch("/users/me", headers=self.as_[who], json={"phone": phone})
        self.assertEqual(patch_me("c", "abc123").status_code, 400)
        self.assertEqual(patch_me("c", "0987 654 321").status_code, 400)  # trùng SĐT tài khoản khác
        saved = patch_me("c", "+84 933 333 333")
        self.assertEqual((saved.status_code, saved.json()["phone"]), (200, "0933333333"))
        self.assertEqual(patch_me("p", "0944444444").status_code, 400)  # đăng nhập bằng SĐT: khóa
        unchanged = patch_me("p", "0911 111 111")
        self.assertEqual((unchanged.status_code, unchanged.json()["phone_locked"]), (200, True))


class BusinessRequestTests(Base):
    def send(self, **changes):
        body = {"business_name": "Quán Mới", "phone": "0955555555", "description": "Quán cà phê sân vườn yên tĩnh"}
        body.update(changes)
        return self.client.post("/business-requests", headers=self.as_["c"], json=body)

    def test_required_fields_phone_rules_and_cancel(self):
        self.assertEqual(self.send(phone="").status_code, 422)
        self.assertEqual(self.send(description="Ngắn quá").status_code, 422)
        self.assertEqual(self.send(business_name=" ").status_code, 422)
        self.assertEqual(self.send(phone="abc").status_code, 400)
        self.assertEqual(self.send(phone="0911111111").status_code, 400)  # SĐT của tài khoản khác
        created = self.send(business_address=None)  # địa chỉ trụ sở được để trống
        self.assertEqual(created.status_code, 201, created.text)
        request_id = created.json()["request_id"]
        self.assertEqual(self.client.delete(f"/business-requests/{request_id}", headers=self.as_["p"]).status_code, 404)
        self.assertEqual(self.client.delete(f"/business-requests/{request_id}", headers=self.as_["c"]).status_code, 200)
        self.assertEqual(self.send().status_code, 201)  # hủy rồi thì gửi lại được


class LoginLockTests(Base):
    def test_five_wrong_passwords_lock_login_for_ten_minutes(self):
        for remaining in (4, 3, 2, 1):
            wrong = self.login(password="sai-mat-khau")
            self.assertEqual(wrong.status_code, 401)
            self.assertIn(f"Còn {remaining} lần", wrong.json()["detail"])
        self.assertEqual(self.login(password="sai-mat-khau").status_code, 429)
        self.assertEqual(self.login().status_code, 429)  # đang khóa thì mật khẩu đúng cũng chặn
        self.db.query(models.Account).filter_by(account_id="AC").update(
            {models.Account.login_locked_until: datetime.utcnow() - timedelta(seconds=1)})
        self.db.commit()
        self.assertEqual(self.login().status_code, 200)


class SessionTests(Base):
    def test_refresh_and_signout(self):
        tokens = self.login().json()
        self.assertTrue(tokens["refresh_token"])
        access = {"Authorization": f"Bearer {tokens['access_token']}"}
        self.assertEqual(self.client.post("/auth/refresh-token", json={}).status_code, 400)
        self.assertEqual(self.client.post("/auth/refresh-token", json={"refresh_token": "abc.123.xyz"}).status_code, 401)
        self.assertEqual(self.client.post("/auth/refresh-token", json={"refresh_token": tokens["access_token"]}).status_code, 401)
        refreshed = self.client.post("/auth/refresh-token", json={"refresh_token": tokens["refresh_token"]})
        self.assertEqual(refreshed.status_code, 200)
        self.assertEqual(self.client.get("/auth/me", headers={"Authorization": f"Bearer {refreshed.json()['access_token']}"}).status_code, 200)

        self.assertEqual(self.client.post("/auth/signout").status_code, 401)  # không có token
        self.assertEqual(self.client.post("/auth/signout", headers=access).status_code, 200)
        self.assertEqual(self.client.get("/auth/me", headers=access).status_code, 401)  # token cũ bị từ chối ngay
        self.assertEqual(self.client.post("/auth/refresh-token", json={"refresh_token": tokens["refresh_token"]}).status_code, 401)

    def test_expired_refresh_token_rejected(self):
        tokens = self.login().json()
        self.db.query(models.RefreshToken).update({models.RefreshToken.expires_at: datetime.utcnow() - timedelta(seconds=1)})
        self.db.commit()
        self.assertEqual(self.client.post("/auth/refresh-token", json={"refresh_token": tokens["refresh_token"]}).status_code, 401)


class OtpAndValidationTests(Base):
    @patch("app.routers.auth.send_otp_email")
    def test_otp_resend_limited(self, sent):
        first = self.client.post("/auth/forgot-password", json={"identifier": "c@t.local"})
        again = self.client.post("/auth/forgot-password", json={"identifier": "c@t.local"})
        self.assertEqual((first.status_code, again.status_code, sent.call_count), (200, 429, 1))
        self.assertTrue(again.headers["Retry-After"])

    def test_only_two_apis_turn_validation_errors_into_400(self):
        self.assertEqual(self.client.post("/auth/verify-reset-otp", json={"identifier": "c@t.local"}).status_code, 400)
        self.assertEqual(self.client.put("/users/me/categories", headers=self.as_["c"], json={"category_ids": "abc"}).status_code, 400)
        self.assertEqual(self.client.put("/users/me/categories", headers=self.as_["c"], json={"category_ids": []}).status_code, 200)
        self.assertEqual(self.client.post("/auth/forgot-password", json={}).status_code, 422)  # API khác giữ nguyên


if __name__ == "__main__":
    unittest.main()
