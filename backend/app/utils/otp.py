import random
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app import models
from app.config import settings

class OtpRateLimited(Exception):
    """Gửi OTP quá dày: chờ ``wait_seconds`` giây rồi mới gửi lại được."""

    def __init__(self, wait_seconds: int):
        super().__init__(f"Bạn gửi mã OTP quá nhiều lần. Vui lòng đợi {wait_seconds} giây rồi thử lại")
        self.wait_seconds = wait_seconds


def _otp_wait_seconds(db: Session, email: str, purpose: str, now: datetime) -> int:
    """0 nếu được gửi; ngược lại số giây phải chờ (OTP_RESEND_SECONDS giữa 2 lần, tối đa OTP_MAX_PER_HOUR/giờ)."""
    recent = [
        row[0]
        for row in db.query(models.OtpCode.created_at)
        .filter(
            models.OtpCode.email == email,
            models.OtpCode.purpose == purpose,
            models.OtpCode.created_at > now - timedelta(hours=1),
        )
        .order_by(models.OtpCode.created_at.desc())
        .all()
    ]
    waits = [0]
    if recent:
        waits.append(settings.OTP_RESEND_SECONDS - (now - recent[0]).total_seconds())
    if len(recent) >= settings.OTP_MAX_PER_HOUR:
        waits.append(3600 - (now - recent[settings.OTP_MAX_PER_HOUR - 1]).total_seconds())
    return max(0, int(max(waits) + 0.999))


def generate_and_save_otp(db: Session, email: str, purpose: str) -> str:
    """Tạo OTP mới; gửi quá dày thì raise OtpRateLimited (router trả 429)."""
    now = datetime.utcnow()
    wait = _otp_wait_seconds(db, email, purpose, now)
    if wait:
        raise OtpRateLimited(wait)
    code = f"{random.randint(0, 999999):06d}"

    otp = models.OtpCode(
        email=email,
        code=code,
        purpose=purpose,
        expires_at=now + timedelta(minutes=settings.OTP_EXPIRE_MINUTES),
        is_used=False,
        created_at=now,
    )
    db.add(otp)
    db.commit()
    return code

def verify_otp(db: Session, email: str, code: str, purpose: str) -> bool:
    now = datetime.utcnow()

    otp = (
        db.query(models.OtpCode)
        .filter(
            models.OtpCode.email == email,
            models.OtpCode.code == code,
            models.OtpCode.purpose == purpose,
            models.OtpCode.is_used == False,  # noqa: E712
            models.OtpCode.expires_at >= now,
        )
        .order_by(models.OtpCode.created_at.desc())
        .first()
    )

    if not otp:
        return False

    otp.is_used = True
    db.commit()
    return True
