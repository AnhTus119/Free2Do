import unittest
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models, schemas
from app.routers.auth import (
    forgot_password,
    login,
    register,
    reset_password,
    verify_reset_otp,
)


class AuthIdentifierTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        models.Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        models.Base.metadata.drop_all(cls.engine)
        cls.engine.dispose()

    def setUp(self):
        self.db = self.Session()
        self.db.add(models.Role(role_name="customer"))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_register_and_login_with_phone(self):
        token = register(
            schemas.RegisterRequest(
                identifier="+84 912 345 678",
                password="StrongPassword123",
                name="Khach hang",
            ),
            db=self.db,
        )
        self.assertTrue(token["access_token"])

        account = self.db.query(models.Account).filter_by(phone="0912345678").one()
        self.assertIsNone(account.email)
        self.assertEqual(account.phone, "0912345678")

        login_token = login(
            SimpleNamespace(username="0912 345 678", password="StrongPassword123"),
            db=self.db,
        )
        self.assertTrue(login_token["access_token"])

    @patch("app.routers.auth.send_otp_sms")
    def test_phone_otp_reset_flow(self, send_otp_sms):
        register(
            schemas.RegisterRequest(
                identifier="0901234567",
                password="OldPassword123",
                name="Khach hang",
            ),
            db=self.db,
        )
        forgot_password(
            schemas.ForgotPasswordRequest(identifier="0901234567", channel="sms"),
            db=self.db,
        )
        send_otp_sms.assert_called_once()
        code = self.db.query(models.OtpCode).one().code

        result = verify_reset_otp(
            schemas.VerifyOtpRequest(
                identifier="+84901234567", channel="sms", code=code
            ),
            db=self.db,
        )
        reset_password(
            schemas.ResetPasswordRequest(
                reset_token=result["reset_token"], new_password="NewPassword123"
            ),
            db=self.db,
        )
        login_token = login(
            SimpleNamespace(username="0901234567", password="NewPassword123"),
            db=self.db,
        )
        self.assertTrue(login_token["access_token"])


if __name__ == "__main__":
    unittest.main()
