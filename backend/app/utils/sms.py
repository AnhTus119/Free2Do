import requests

from app.config import settings
from app.utils.identity import phone_to_e164


class SmsNotConfigured(RuntimeError):
    pass


def send_otp_sms(to_phone: str, code: str, purpose: str) -> None:
    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN or not settings.TWILIO_FROM_PHONE:
        raise SmsNotConfigured("Dịch vụ gửi OTP qua SMS chưa được cấu hình")
    message = (
        f"Ma xac minh Free2Do cua ban la {code}. "
        f"Ma co hieu luc trong {settings.OTP_EXPIRE_MINUTES} phut."
    )
    response = requests.post(
        f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json",
        auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
        data={"To": phone_to_e164(to_phone), "From": settings.TWILIO_FROM_PHONE, "Body": message},
        timeout=15,
    )
    if not response.ok:
        raise RuntimeError("Không thể gửi mã OTP qua SMS")
