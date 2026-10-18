import unittest
from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import bootstrap_admin
from app import models
from app.auth import hash_password, verify_password
from app.database import get_db
from app.main import app


class AdminBootstrapTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        models.Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine)
        self.db = self.Session()

        def override_db():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)  # không dùng "with": không chạy lifespan (schema sync, sweeper)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()

    def login(self, email, password):
        response = self.client.post("/auth/login", data={"username": email, "password": password})
        self.assertEqual(response.status_code, 200, response.text)
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    def test_defaults_create_flagged_admin_operator(self):
        bootstrap_admin.create_admin(self.db, bootstrap_admin.DEFAULT_EMAIL, bootstrap_admin.DEFAULT_PASSWORD)
        account = self.db.query(models.Account).filter_by(email="test123@gmail.com").one()
        self.assertTrue(account.must_change_password)
        self.assertEqual(account.account_type, "operator")
        self.assertTrue(verify_password("test12345", account.password_hash))
        self.assertEqual(account.operator.level, "admin")

    def test_custom_values_and_validation(self):
        bootstrap_admin.create_admin(self.db, " Boss@Example.COM ", "another-pass-1")
        self.assertIsNotNone(self.db.query(models.Account).filter_by(email="boss@example.com").first())
        with self.assertRaises(ValueError):
            bootstrap_admin.create_admin(self.db, "x@example.com", "short")
        with self.assertRaises(ValueError):
            bootstrap_admin.create_admin(self.db, "not-an-email", "long-enough-1")

    def test_existing_account_is_never_modified(self):
        # Giống tài khoản test123@gmail.com đã có (đang bị vô hiệu hóa) trên production.
        original_hash = hash_password("old-secret-1")
        self.db.add(models.Account(account_id="EXIST", email="test123@gmail.com", password_hash=original_hash,
                                   auth_provider="email", account_type="operator", status="disabled",
                                   created_at=datetime.utcnow()))
        self.db.commit()
        with self.assertRaises(ValueError):
            bootstrap_admin.create_admin(self.db, "test123@gmail.com", "test12345")
        self.db.expire_all()
        account = self.db.query(models.Account).filter_by(email="test123@gmail.com").one()
        self.assertEqual((account.status, account.password_hash, account.must_change_password),
                         ("disabled", original_hash, False))
        self.assertEqual(self.db.query(models.Account).count(), 1)

    def test_first_login_must_change_password_before_protected_api(self):
        bootstrap_admin.create_admin(self.db, "test123@gmail.com", "test12345")
        headers = self.login("test123@gmail.com", "test12345")

        me = self.client.get("/auth/me", headers=headers)
        self.assertEqual(me.status_code, 200)
        self.assertTrue(me.json()["requires_password_change"])
        for path in ("/operator/dashboard", "/operator/complaints", "/operator/me", "/notifications"):
            self.assertEqual(self.client.get(path, headers=headers).status_code, 428, path)

        wrong = self.client.post("/auth/change-password", headers=headers,
                                 json={"current_password": "nope-nope", "new_password": "brand-new-pass"})
        self.assertEqual(wrong.status_code, 400)
        self.assertEqual(self.client.get("/operator/dashboard", headers=headers).status_code, 428)

        same = self.client.post("/auth/change-password", headers=headers,
                                json={"current_password": "test12345", "new_password": "test12345"})
        self.assertEqual(same.status_code, 400)

        changed = self.client.post("/auth/change-password", headers=headers,
                                   json={"current_password": "test12345", "new_password": "brand-new-pass"})
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertFalse(self.client.get("/auth/me", headers=headers).json()["requires_password_change"])
        self.assertEqual(self.client.get("/operator/dashboard", headers=headers).status_code, 200)
        self.assertEqual(self.client.post("/auth/login", data={"username": "test123@gmail.com", "password": "test12345"}).status_code, 401)
        self.login("test123@gmail.com", "brand-new-pass")

    def test_regular_registration_is_not_flagged(self):
        self.db.add(models.Role(role_id="RC", role_name="customer"))
        self.db.commit()
        created = self.client.post("/auth/register", json={"identifier": "cus@example.com", "password": "matkhau123", "name": "Khach Hang"})
        self.assertEqual(created.status_code, 201, created.text)
        headers = {"Authorization": f"Bearer {created.json()['access_token']}"}
        self.assertFalse(self.client.get("/auth/me", headers=headers).json()["requires_password_change"])
        self.assertEqual(self.client.get("/users/me/search-history", headers=headers).status_code, 200)


if __name__ == "__main__":
    unittest.main()
