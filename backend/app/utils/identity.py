import re
import unicodedata

from sqlalchemy.orm import Session

from app import models


# Phần trước @: chữ, số và . _ % + - (không bắt đầu/kết thúc bằng dấu chấm, không có ".." liền nhau);
# tên miền: các nhãn chữ/số/gạch nối, đuôi ít nhất 2 chữ cái. Chặn các chuỗi như "<script>@x.com".
EMAIL_PATTERN = re.compile(
    r"^(?!\.)(?!.*\.\.)[a-z0-9._%+-]{1,64}(?<!\.)@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$"
)

# Tên người dùng: chữ cái tiếng Anh hoặc tiếng Việt (có dấu), có thể có khoảng trắng, 2-50 ký tự.
# Không cho số và ký tự đặc biệt (*&^%$#@!()-_+= ...), nên chặn luôn HTML/script.
VIETNAMESE_LETTERS = (
    "àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ"
)
NAME_PATTERN = re.compile(
    rf"^[A-Za-z{VIETNAMESE_LETTERS}{VIETNAMESE_LETTERS.upper()}]+(?: [A-Za-z{VIETNAMESE_LETTERS}{VIETNAMESE_LETTERS.upper()}]+)*$"
)
NAME_MIN_LENGTH, NAME_MAX_LENGTH = 2, 50


def normalize_email(value: str) -> str:
    email = value.strip().lower()
    if len(email) > 254 or not EMAIL_PATTERN.fullmatch(email):
        raise ValueError("Email không hợp lệ")
    return email


def normalize_person_name(value: str | None) -> str:
    """Chuẩn hoá và kiểm tra họ tên / tên người dùng. Lỗi trả ValueError với câu hiển thị cho người dùng."""
    name = " ".join(unicodedata.normalize("NFC", value or "").split())
    if not NAME_MIN_LENGTH <= len(name) <= NAME_MAX_LENGTH:
        raise ValueError(f"Tên cần dài từ {NAME_MIN_LENGTH} đến {NAME_MAX_LENGTH} ký tự")
    if not NAME_PATTERN.fullmatch(name):
        raise ValueError("Tên chỉ được gồm chữ cái tiếng Việt hoặc tiếng Anh và khoảng trắng, không chứa số hay ký tự đặc biệt")
    return name


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
