"""Gửi email cho các operator đã bật 'nhận email thông báo' khi có việc mới cần duyệt."""
import logging

from sqlalchemy.orm import Session

from app import models
from app.utils.email import send_notification_email

logger = logging.getLogger("free2do.operator_alerts")


def notify_operators_by_email(db: Session, subject: str, body: str) -> None:
    """Best-effort: lỗi gửi email không bao giờ làm hỏng thao tác chính."""
    try:
        operators = (
            db.query(models.Operator)
            .filter(models.Operator.status == "active", models.Operator.email_notifications.is_(True))
            .all()
        )
        for operator in operators:
            email = operator.account.email or operator.account.recovery_email
            if not email:
                continue
            try:
                send_notification_email(email, subject, body)
            except Exception:  # noqa: BLE001
                logger.exception("Không gửi được email thông báo cho operator %s", operator.operator_id)
    except Exception:  # noqa: BLE001
        logger.exception("Không thể gửi email thông báo cho operator")
