from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.orm import Session, joinedload
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from app.config import settings
from app.database import get_db
from app import models

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)
def create_access_token(account_id: str, expire_minutes: Optional[int] = None) -> str:
    minutes = expire_minutes if expire_minutes is not None else settings.JWT_EXPIRE_MINUTES
    expire = datetime.utcnow() + timedelta(minutes=minutes)
    payload = {"sub": account_id, "type": "access", "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def create_reset_token(account_id: str) -> str:
    """Token ngắn hạn, chỉ dùng để đổi mật khẩu sau khi đã xác minh OTP thành công."""
    expire = datetime.utcnow() + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": account_id, "type": "reset", "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def decode_token(token: str, expected_type: str) -> Optional[str]:
    """Trả về account_id trong ``sub`` nếu token hợp lệ và đúng loại."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    return payload.get("sub")

def verify_google_token(token: str) -> Optional[dict]:
    """Xác minh id_token do Google Identity Services trả về ở frontend.
    Trả về dict {email, google_id, name} nếu hợp lệ, None nếu không.
    """
    try:
        info = google_id_token.verify_oauth2_token(
            token, google_requests.Request(), settings.GOOGLE_CLIENT_ID
        )
    except ValueError:
        return None
    if not info.get("email_verified", False):
        return None
    return {
        "email": info["email"],
        "google_id": info["sub"],
        "name": info.get("name", info["email"]),
    }


# ---------------------------------------------------------------------------
# Dependencies phân quyền -- dùng trong router bằng Depends(...)
# ---------------------------------------------------------------------------

def get_authenticated_account(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.Account:
    """Giải mã access token mà chưa yêu cầu email khôi phục."""
    account_id = decode_token(token, expected_type="access")
    if not account_id:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Token không hợp lệ hoặc đã hết hạn",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Nạp luôn hồ sơ user/operator bằng JOIN: mỗi request chỉ tốn 1 lượt tới database
    # (trước đây là 2 lượt nối đuôi nhau: tìm account rồi mới tìm user/operator).
    account = (
        db.query(models.Account)
        .options(joinedload(models.Account.user), joinedload(models.Account.operator))
        .filter(models.Account.account_id == account_id)
        .first()
    )
    if not account:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tài khoản không tồn tại")
    if account.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản chưa được kích hoạt hoặc đã bị khóa")
    if account.user:
        cutoff = datetime.utcnow() - timedelta(days=60)
        overdue = (
            db.query(models.GroupPayment.payment_id)
            .join(models.GroupMember, models.GroupMember.member_id == models.GroupPayment.member_id)
            .filter(
                models.GroupMember.user_id == account.user.user_id,
                models.GroupPayment.status == "unpaid",
                models.GroupPayment.overdue_since.is_not(None),
                models.GroupPayment.overdue_since <= cutoff,
            )
            .first()
        )
        if overdue:
            account.status = "blocked"
            db.commit()
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Tài khoản bị khóa do khoản thanh toán nhóm quá hạn trên 2 tháng",
            )
    return account


def requires_recovery_email(account: models.Account) -> bool:
    """Chỉ tài khoản đăng nhập bằng số điện thoại cần email khôi phục riêng."""
    return account.auth_provider == "phone" and not bool(account.recovery_email)


def get_current_account(
    account: models.Account = Depends(get_authenticated_account),
) -> models.Account:
    """Tài khoản hợp lệ; phone account phải có email khôi phục đã xác minh."""
    if requires_recovery_email(account):
        raise HTTPException(
            status.HTTP_428_PRECONDITION_REQUIRED,
            "Bạn cần bổ sung và xác minh email khôi phục trước khi tiếp tục",
        )
    return account


def get_current_user(
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> models.User:
    """Yêu cầu tài khoản loại 'user' (khách hàng/doanh nghiệp), trả về User tương ứng."""
    if account.account_type != "user":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Yêu cầu tài khoản người dùng")

    user = account.user  # đã được nạp cùng account ở get_authenticated_account
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hồ sơ người dùng")
    return user


def get_current_business_user(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.BusinessProfile:
    """Yêu cầu User hiện tại có hồ sơ doanh nghiệp, trả về BusinessProfile."""
    profile = (
        db.query(models.BusinessProfile)
        .filter(models.BusinessProfile.user_id == user.user_id)
        .first()
    )
    if not profile:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Yêu cầu tài khoản Doanh nghiệp")
    return profile


def get_current_operator(
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> models.Operator:
    """Yêu cầu tài khoản loại 'operator', trả về Operator tương ứng. Dùng cho mọi route admin."""
    if account.account_type != "operator":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Yêu cầu quyền Operator")

    operator = account.operator  # đã được nạp cùng account ở get_authenticated_account
    if not operator:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Không tìm thấy hồ sơ Operator")
    if operator.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản Operator đã bị khóa")
    return operator


def require_admin_operator(
    operator: models.Operator = Depends(get_current_operator),
) -> models.Operator:
    """Yêu cầu Operator cấp cao (level='admin') -- dùng cho các route quản lý tài khoản Operator khác."""
    if operator.level != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Yêu cầu quyền Operator cấp cao (admin)")
    return operator
