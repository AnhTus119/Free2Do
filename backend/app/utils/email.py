import smtplib
import ssl
import logging
import socket
import base64
import json
import urllib.error
import urllib.parse
import urllib.request
from email.mime.text import MIMEText
from email.utils import formataddr

from app.config import settings

logger = logging.getLogger(__name__)


class EmailDeliveryError(RuntimeError):
    """Lỗi SMTP an toàn để trả về client mà không làm lộ credential."""


def get_email_provider() -> str:
    provider = settings.EMAIL_PROVIDER.strip().lower()
    if provider == "auto":
        return "gmail_api" if settings.GMAIL_API_REFRESH_TOKEN.strip() else "smtp"
    if provider not in {"gmail_api", "smtp"}:
        raise EmailDeliveryError("EMAIL_PROVIDER phải là auto, gmail_api hoặc smtp")
    return provider

SUBJECT_BY_PURPOSE = {
    "reset_password": "Mã xác minh đổi mật khẩu Free2Do",
    "verify_recovery_email": "Xác minh email khôi phục Free2Do",
}


def _send_smtp_message(to_email: str, message: MIMEText) -> None:
    user = settings.SMTP_USER.strip().strip("\"'")
    # Google hiển thị App Password theo 4 nhóm có dấu cách; SMTP cần chuỗi 16 ký tự.
    password = "".join(settings.SMTP_PASSWORD.strip().strip("\"'").split())
    host = settings.SMTP_HOST.strip().strip("\"'") or "smtp.gmail.com"
    if not user or not password:
        raise EmailDeliveryError("Render chưa có SMTP_USER hoặc SMTP_PASSWORD")

    try:
        with smtplib.SMTP(host, settings.SMTP_PORT, timeout=20) as server:
            server.ehlo()
            server.starttls(context=ssl.create_default_context())
            server.ehlo()
            server.login(user, password)
            server.send_message(message, from_addr=user, to_addrs=[to_email])
    except smtplib.SMTPAuthenticationError as exc:
        logger.exception("SMTP authentication failed (host=%s, port=%s, user=%s)", host, settings.SMTP_PORT, user)
        raise EmailDeliveryError(
            "Gmail từ chối đăng nhập SMTP. Hãy tạo Gmail App Password mới và cập nhật SMTP_PASSWORD trên Render"
        ) from exc
    except (smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected, socket.timeout, TimeoutError, OSError) as exc:
        logger.exception("SMTP connection failed (host=%s, port=%s, user=%s)", host, settings.SMTP_PORT, user)
        raise EmailDeliveryError(
            f"Không kết nối được Gmail SMTP tại {host}:{settings.SMTP_PORT}"
        ) from exc
    except smtplib.SMTPException as exc:
        logger.exception("SMTP protocol failed (host=%s, port=%s, user=%s)", host, settings.SMTP_PORT, user)
        raise EmailDeliveryError("Gmail SMTP từ chối gửi email. Hãy xem Render Logs để biết mã lỗi") from exc
    except Exception:
        # Chỉ ghi loại lỗi, host và user; tuyệt đối không ghi mật khẩu hay OTP.
        logger.exception("SMTP send failed (host=%s, port=%s, user=%s)", host, settings.SMTP_PORT, user)
        raise


def _gmail_access_token() -> str:
    client_id = settings.GMAIL_API_CLIENT_ID.strip().strip("\"'")
    client_secret = settings.GMAIL_API_CLIENT_SECRET.strip().strip("\"'")
    refresh_token = settings.GMAIL_API_REFRESH_TOKEN.strip().strip("\"'")
    if not client_id or not client_secret or not refresh_token:
        raise EmailDeliveryError(
            "Render thiếu GMAIL_API_CLIENT_ID, GMAIL_API_CLIENT_SECRET hoặc GMAIL_API_REFRESH_TOKEN"
        )
    data = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=data,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        logger.exception("Gmail OAuth token rejected (status=%s)", exc.code)
        raise EmailDeliveryError(
            "Google từ chối Gmail API refresh token. Hãy cấp lại token có quyền gmail.send"
        ) from exc
    except (urllib.error.URLError, socket.timeout, TimeoutError, OSError) as exc:
        logger.exception("Gmail OAuth connection failed")
        raise EmailDeliveryError("Không kết nối được Google OAuth qua HTTPS") from exc
    access_token = payload.get("access_token")
    if not access_token:
        raise EmailDeliveryError("Google OAuth không trả về access token")
    return access_token


def _send_gmail_api(to_email: str, message: MIMEText) -> None:
    sender = settings.GMAIL_SENDER_EMAIL.strip().strip("\"'") or settings.SMTP_USER.strip().strip("\"'")
    if not sender:
        raise EmailDeliveryError("Render thiếu GMAIL_SENDER_EMAIL")
    if message.get("From"):
        message.replace_header("From", formataddr(("Free2Do", sender)))
    else:
        message["From"] = formataddr(("Free2Do", sender))
    if message.get("To"):
        message.replace_header("To", to_email)
    else:
        message["To"] = to_email
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii").rstrip("=")
    request = urllib.request.Request(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        data=json.dumps({"raw": raw}).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {_gmail_access_token()}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            if response.status not in {200, 201, 202}:
                raise EmailDeliveryError(f"Gmail API trả về HTTP {response.status}")
    except urllib.error.HTTPError as exc:
        logger.exception("Gmail API rejected message (status=%s, sender=%s)", exc.code, sender)
        if exc.code in {401, 403}:
            detail = "Gmail API từ chối quyền gửi. Hãy bật Gmail API và cấp scope gmail.send"
        elif exc.code == 429:
            detail = "Gmail API đã vượt giới hạn gửi. Vui lòng thử lại sau"
        else:
            detail = f"Gmail API không gửi được email (HTTP {exc.code})"
        raise EmailDeliveryError(detail) from exc
    except (urllib.error.URLError, socket.timeout, TimeoutError, OSError) as exc:
        logger.exception("Gmail API connection failed (sender=%s)", sender)
        raise EmailDeliveryError("Không kết nối được Gmail API qua HTTPS") from exc


def _send_message(to_email: str, message: MIMEText) -> None:
    if get_email_provider() == "gmail_api":
        _send_gmail_api(to_email, message)
    else:
        _send_smtp_message(to_email, message)


def send_otp_email(to_email: str, code: str, purpose: str) -> None:
    subject = SUBJECT_BY_PURPOSE.get(purpose, "Mã xác minh Free2Do")
    body = (
        f"Mã xác minh của bạn là: {code}\n\n"
        f"Mã có hiệu lực trong {settings.OTP_EXPIRE_MINUTES} phút. "
        f"Nếu không phải bạn yêu cầu, hãy bỏ qua email này."
    )

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = formataddr(("Free2Do", settings.SMTP_USER))
    msg["To"] = to_email

    _send_message(to_email, msg)


def send_notification_email(to_email: str, subject: str, body: str) -> None:
    """Gửi email thông báo chung (duyệt/từ chối business_request, activity...)."""
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = formataddr(("Free2Do", settings.SMTP_USER))
    msg["To"] = to_email

    _send_message(to_email, msg)


def send_business_request_approved_email(to_email: str, business_name: str) -> None:
    send_notification_email(
        to_email,
        "Yêu cầu trở thành Doanh nghiệp đã được duyệt",
        f'Chúc mừng! Yêu cầu đăng ký doanh nghiệp "{business_name}" của bạn trên Free2Do đã được duyệt. '
        f"Bạn có thể đăng nhập và bắt đầu đăng hoạt động ngay bây giờ.",
    )


def send_business_request_rejected_email(to_email: str, business_name: str) -> None:
    send_notification_email(
        to_email,
        "Yêu cầu trở thành Doanh nghiệp bị từ chối",
        f'Yêu cầu đăng ký doanh nghiệp "{business_name}" của bạn trên Free2Do chưa được duyệt. '
        f"Vui lòng liên hệ Free2Do để biết thêm chi tiết hoặc gửi lại yêu cầu.",
    )


def send_activity_approved_email(to_email: str, activity_name: str) -> None:
    send_notification_email(
        to_email,
        "Hoạt động đã được duyệt",
        f'Hoạt động "{activity_name}" của bạn đã được duyệt và hiển thị công khai trên Free2Do.',
    )


def send_activity_hidden_email(to_email: str, activity_name: str) -> None:
    send_notification_email(
        to_email,
        "Hoạt động đã bị ẩn",
        f'Hoạt động "{activity_name}" của bạn trên Free2Do đã bị ẩn khỏi kết quả tìm kiếm. '
        f"Vui lòng liên hệ Free2Do để biết thêm chi tiết.",
    )
