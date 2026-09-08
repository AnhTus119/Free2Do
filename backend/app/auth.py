from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.orm import Session
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

def create_reset_token(email: str) -> str:
    """Token ngắn hạn, chỉ dùng để đổi mật khẩu sau khi đã xác minh OTP thành công."""
    expire = datetime.utcnow() + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": email, "type": "reset", "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def decode_token(token: str, expected_type: str) -> Optional[str]:
    """Trả về 'sub' (account_id hoặc email) nếu token hợp lệ và đúng loại, ngược lại None."""
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

def get_current_account(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.Account:
    """Giải mã access token, trả về Account đang đăng nhập. Dùng cho mọi route cần đăng nhập."""
    account_id = decode_token(token, expected_type="access")
    if not account_id:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Token không hợp lệ hoặc đã hết hạn",
            headers={"WWW-Authenticate": "Bearer"},
        )

    account = db.query(models.Account).filter(models.Account.account_id == account_id).first()
    if not account:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tài khoản không tồn tại")
    if account.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản chưa được kích hoạt hoặc đã bị khóa")
    return account


def get_current_user(
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> models.User:
    """Yêu cầu tài khoản loại 'user' (khách hàng/doanh nghiệp), trả về User tương ứng."""
    if account.account_type != "user":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Yêu cầu tài khoản người dùng")

    user = db.query(models.User).filter(models.User.account_id == account.account_id).first()
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

    operator = db.query(models.Operator).filter(models.Operator.account_id == account.account_id).first()
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