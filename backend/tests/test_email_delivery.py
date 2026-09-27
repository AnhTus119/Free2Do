import smtplib
import unittest
from unittest.mock import patch

from app.utils.email import EmailDeliveryError, _send_message
from email.mime.text import MIMEText


class EmailDeliveryTests(unittest.TestCase):
    @patch("app.utils.email.settings")
    def test_missing_credentials_has_clear_error(self, mocked_settings):
        mocked_settings.SMTP_USER = ""
        mocked_settings.SMTP_PASSWORD = ""
        mocked_settings.SMTP_HOST = "smtp.gmail.com"
        mocked_settings.SMTP_PORT = 587
        with self.assertRaisesRegex(EmailDeliveryError, "SMTP_USER"):
            _send_message("receiver@example.com", MIMEText("test"))

    @patch("app.utils.email.smtplib.SMTP")
    @patch("app.utils.email.settings")
    def test_gmail_authentication_error_has_actionable_message(self, mocked_settings, smtp):
        mocked_settings.SMTP_USER = "sender@gmail.com"
        mocked_settings.SMTP_PASSWORD = "abcd efgh ijkl mnop"
        mocked_settings.SMTP_HOST = "smtp.gmail.com"
        mocked_settings.SMTP_PORT = 587
        smtp.return_value.__enter__.return_value.login.side_effect = smtplib.SMTPAuthenticationError(
            535, b"Username and Password not accepted"
        )
        with self.assertRaisesRegex(EmailDeliveryError, "App Password mới"):
            _send_message("receiver@example.com", MIMEText("test"))


if __name__ == "__main__":
    unittest.main()
