import smtplib
import unittest
from unittest.mock import patch

from app.utils.email import EmailDeliveryError, _gmail_access_token, _send_gmail_api, _send_message
from email.mime.text import MIMEText


class EmailDeliveryTests(unittest.TestCase):
    @patch("app.utils.email.settings")
    def test_missing_credentials_has_clear_error(self, mocked_settings):
        mocked_settings.SMTP_USER = ""
        mocked_settings.SMTP_PASSWORD = ""
        mocked_settings.SMTP_HOST = "smtp.gmail.com"
        mocked_settings.SMTP_PORT = 587
        mocked_settings.EMAIL_PROVIDER = "smtp"
        with self.assertRaisesRegex(EmailDeliveryError, "SMTP_USER"):
            _send_message("receiver@example.com", MIMEText("test"))

    @patch("app.utils.email.smtplib.SMTP")
    @patch("app.utils.email.settings")
    def test_gmail_authentication_error_has_actionable_message(self, mocked_settings, smtp):
        mocked_settings.SMTP_USER = "sender@gmail.com"
        mocked_settings.SMTP_PASSWORD = "abcd efgh ijkl mnop"
        mocked_settings.SMTP_HOST = "smtp.gmail.com"
        mocked_settings.SMTP_PORT = 587
        mocked_settings.EMAIL_PROVIDER = "smtp"
        smtp.return_value.__enter__.return_value.login.side_effect = smtplib.SMTPAuthenticationError(
            535, b"Username and Password not accepted"
        )
        with self.assertRaisesRegex(EmailDeliveryError, "App Password mới"):
            _send_message("receiver@example.com", MIMEText("test"))

    @patch("app.utils.email.urllib.request.urlopen")
    @patch("app.utils.email._gmail_access_token", return_value="access-token")
    @patch("app.utils.email.settings")
    def test_gmail_api_sends_rfc_message_over_https(self, mocked_settings, _token, urlopen):
        mocked_settings.GMAIL_SENDER_EMAIL = "sender@gmail.com"
        mocked_settings.SMTP_USER = ""
        response = urlopen.return_value.__enter__.return_value
        response.status = 200
        message = MIMEText("Mã OTP: 123456", _charset="utf-8")
        message["Subject"] = "Free2Do OTP"
        _send_gmail_api("receiver@example.com", message)
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
        self.assertEqual(request.headers["Authorization"], "Bearer access-token")
        self.assertIn(b'"raw":', request.data)

    @patch("app.utils.email.urllib.request.urlopen")
    @patch("app.utils.email.settings")
    def test_gmail_oauth_refresh_token_exchange(self, mocked_settings, urlopen):
        mocked_settings.GMAIL_API_CLIENT_ID = "client-id"
        mocked_settings.GMAIL_API_CLIENT_SECRET = "client-secret"
        mocked_settings.GMAIL_API_REFRESH_TOKEN = "refresh-token"
        response = urlopen.return_value.__enter__.return_value
        response.read.return_value = b'{"access_token":"new-access-token","expires_in":3600}'
        self.assertEqual(_gmail_access_token(), "new-access-token")
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "https://oauth2.googleapis.com/token")
        self.assertIn(b"grant_type=refresh_token", request.data)


if __name__ == "__main__":
    unittest.main()
