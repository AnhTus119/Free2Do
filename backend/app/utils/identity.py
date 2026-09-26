import re

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models


EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def normalize_email(value: str) -> str:
    email = value.strip().lower()
    if not EMAIL_PATTERN.fullmatch(email):
        raise ValueError("Email không hợp lệ")
    return email


def normalize_phone(value: str) -> str:
    phone = re.sub(r"[^0-9+]", "", value.strip())
    if phone.startswith("+84"):
        phone = "0" + phone[3:]
    elif phone.startswith("84") and len(phone) >= 11:
        phone = "0" + phone[2:]
    if not phone.isdigit() or not phone.startswith("0") or not 9 <= len(phone) <= 11:
        raise ValueError("Số điện thoại không hợp lệ")
    return phone


def split_identifier(value: str) -> tuple[str | None, str | None]:
    value = value.strip()
    if "@" in value:
        return normalize_email(value), None
    return None, normalize_phone(value)


def find_account(db: Session, identifier: str) -> models.Account | None:
    email, phone = split_identifier(identifier)
    if email:
        return db.query(models.Account).filter(models.Account.email == email).first()
    return db.query(models.Account).filter(models.Account.phone == phone).first()


def phone_to_e164(phone: str) -> str:
    normalized = normalize_phone(phone)
    return "+84" + normalized[1:]
