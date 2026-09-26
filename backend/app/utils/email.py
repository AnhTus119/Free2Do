import smtplib
from email.mime.text import MIMEText
from email.utils import formataddr

from app.config import settings

SUBJECT_BY_PURPOSE = {
    "reset_password": "Mã xác minh đổi mật khẩu Free2Do",
    "verify_recovery_email": "Xác minh email khôi phục Free2Do",
}


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

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_USER, [to_email], msg.as_string())


def send_notification_email(to_email: str, subject: str, body: str) -> None:
    """Gửi email thông báo chung (duyệt/từ chối business_request, activity...)."""
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = formataddr(("Free2Do", settings.SMTP_USER))
    msg["To"] = to_email

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_USER, [to_email], msg.as_string())


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
