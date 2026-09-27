import smtplib
import ssl
import logging
import socket
from email.mime.text import MIMEText
from email.utils import formataddr

from app.config import settings

logger = logging.getLogger(__name__)


class EmailDeliveryError(RuntimeError):
    """Lỗi SMTP an toàn để trả về client mà không làm lộ credential."""

SUBJECT_BY_PURPOSE = {
    "reset_password": "Mã xác minh đổi mật khẩu Free2Do",
    "verify_recovery_email": "Xác minh email khôi phục Free2Do",
}


def _send_message(to_email: str, message: MIMEText) -> None:
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
