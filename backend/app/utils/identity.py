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


# Di động Việt Nam: 10 số, đầu 03/05/07/08/09 (nhập kèm +84/84, dấu cách, chấm, gạch nối vẫn được).
PHONE_PATTERN = re.compile(r"^0[35789]\d{8}$")
PHONE_INVALID_MESSAGE = "Số điện thoại không hợp lệ (cần 10 số, bắt đầu bằng 03, 05, 07, 08 hoặc 09)"
PHONE_TAKEN_MESSAGE = "Số điện thoại đã được sử dụng bởi tài khoản khác"


def canonical_phone(value: str) -> str:
    """Bỏ dấu cách/chấm/gạch nối và đổi +84/84 thành 0, KHÔNG kiểm tra định dạng (dùng để tra cứu dữ liệu cũ)."""
    phone = re.sub(r"[\s.\-()]", "", value.strip())
    if phone.startswith("+84"):
        phone = "0" + phone[3:]
    elif phone.startswith("84") and len(phone) >= 11:
        phone = "0" + phone[2:]
    return phone


def normalize_phone(value: str) -> str:
    phone = canonical_phone(value)
    if not PHONE_PATTERN.fullmatch(phone):
        raise ValueError(PHONE_INVALID_MESSAGE)
    return phone


def phone_taken(db: Session, phone: str, user_id: str | None = None, account_id: str | None = None) -> bool:
    """1 SĐT chỉ thuộc 1 tài khoản: SĐT đăng nhập, SĐT hồ sơ cá nhân, SĐT doanh nghiệp và đơn đăng ký
    doanh nghiệp đang chờ duyệt của tài khoản KHÁC đều tính là đã dùng."""
    checks = (
        db.query(models.Account.account_id).filter(models.Account.phone == phone, models.Account.account_id != account_id),
        db.query(models.User.user_id).filter(models.User.phone == phone, models.User.user_id != user_id),
        db.query(models.BusinessProfile.user_id).filter(models.BusinessProfile.phone == phone, models.BusinessProfile.user_id != user_id),
        db.query(models.BusinessRequest.request_id).filter(
            models.BusinessRequest.phone == phone,
            models.BusinessRequest.status == "pending",
            models.BusinessRequest.user_id != user_id,
        ),
    )
    return any(query.first() for query in checks)


def clean_phone(db: Session, value: str | None, user_id: str | None = None, account_id: str | None = None) -> str | None:
    """SĐT người dùng sửa: rỗng -> None; sai định dạng hoặc trùng tài khoản khác -> ValueError."""
    if value is None or not value.strip():
        return None
    phone = normalize_phone(value)
    if phone_taken(db, phone, user_id=user_id, account_id=account_id):
        raise ValueError(PHONE_TAKEN_MESSAGE)
    return phone


def split_identifier(value: str) -> tuple[str | None, str | None]:
    value = value.strip()
    if "@" in value:
        return normalize_email(value), None
    return None, normalize_phone(value)


def find_account(db: Session, identifier: str) -> models.Account | None:
    identifier = identifier.strip()
    if "@" in identifier:
        email = normalize_email(identifier)
        return db.query(models.Account).filter(models.Account.email == email).first()
    # ponytail: tra cứu không ép định dạng mới để tài khoản cũ có SĐT bàn/11 số vẫn đăng nhập được.
    phone = canonical_phone(identifier)
    if not phone:
        return None
    return db.query(models.Account).filter(models.Account.phone == phone).first()
