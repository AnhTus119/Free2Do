from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy import exists
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
def create_access_token(account_id: str, expire_minutes: Optional[int] = None, session_id: Optional[str] = None) -> str:
    minutes = expire_minutes if expire_minutes is not None else settings.JWT_EXPIRE_MINUTES
    expire = datetime.utcnow() + timedelta(minutes=minutes)
    payload = {"sub": account_id, "type": "access", "exp": expire}
    if session_id:
        payload["sid"] = session_id  # phiên (refresh_tokens.token_id): đăng xuất là token này hết hiệu lực
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def issue_tokens(db: Session, account: models.Account) -> dict:
    """Tạo phiên đăng nhập mới: access token ngắn hạn + refresh token (user 7 ngày, Operator 8 tiếng)."""
    now = datetime.utcnow()
    lifetime = (
        timedelta(minutes=settings.OPERATOR_REFRESH_TOKEN_EXPIRE_MINUTES)
        if account.account_type == "operator"
        else timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    account_id, session_id, expires_at = account.account_id, models.gen_id(), now + lifetime
    db.add(models.RefreshToken(token_id=session_id, account_id=account_id, expires_at=expires_at, created_at=now))
    db.commit()
    refresh_token = jwt.encode(
        {"sub": account_id, "type": "refresh", "jti": session_id, "exp": expires_at},
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    return {
        "access_token": create_access_token(account_id, session_id=session_id),
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }

def create_reset_token(account_id: str) -> str:
    """Token ngắn hạn, chỉ dùng để đổi mật khẩu sau khi đã xác minh OTP thành công."""
    expire = datetime.utcnow() + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": account_id, "type": "reset", "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def decode_payload(token: str, expected_type: str) -> Optional[dict]:
    """Toàn bộ payload nếu token hợp lệ (chữ ký, hạn dùng) và đúng loại, ngược lại None."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    return payload


def decode_token(token: str, expected_type: str) -> Optional[str]:
    """Trả về account_id trong ``sub`` nếu token hợp lệ và đúng loại."""
    payload = decode_payload(token, expected_type)
    return payload.get("sub") if payload else None

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
    payload = decode_payload(token, expected_type="access")
    if not payload or not payload.get("sub"):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Token không hợp lệ hoặc đã hết hạn",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Nạp luôn hồ sơ user/operator bằng JOIN: mỗi request chỉ tốn 1 lượt tới database
    # (trước đây là 2 lượt nối đuôi nhau: tìm account rồi mới tìm user/operator).
    query = (
        db.query(models.Account)
        .options(joinedload(models.Account.user), joinedload(models.Account.operator))
        .filter(models.Account.account_id == payload["sub"])
    )
    session_id = payload.get("sid")
    if session_id:
        # Phiên đã đăng xuất/hết hạn -> access token của phiên đó bị từ chối ngay (cùng 1 truy vấn).
        query = query.filter(exists().where(
            models.RefreshToken.token_id == session_id,
            models.RefreshToken.account_id == models.Account.account_id,
            models.RefreshToken.revoked_at.is_(None),
            models.RefreshToken.expires_at > datetime.utcnow(),
        ))
    account = query.first()
    if not account:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if account.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản chưa được kích hoạt hoặc đã bị khóa")
    return account


def requires_recovery_email(account: models.Account) -> bool:
    """Chỉ tài khoản đăng nhập bằng số điện thoại cần email khôi phục riêng."""
    return account.auth_provider == "phone" and not bool(account.recovery_email)


def ensure_recovery_email(account: models.Account) -> None:
    if requires_recovery_email(account):
        raise HTTPException(
            status.HTTP_428_PRECONDITION_REQUIRED,
            "Bạn cần bổ sung và xác minh email khôi phục trước khi tiếp tục",
        )


def get_current_account(
    account: models.Account = Depends(get_authenticated_account),
) -> models.Account:
    """Tài khoản hợp lệ; phone account phải có email khôi phục đã xác minh, tài khoản được
    tạo bằng bootstrap_admin.py phải đổi mật khẩu trước (chỉ /auth/me và /auth/change-password
    dùng get_authenticated_account nên vẫn gọi được)."""
    ensure_recovery_email(account)
    if account.must_change_password:
        raise HTTPException(
            status.HTTP_428_PRECONDITION_REQUIRED,
            "Bạn cần đổi mật khẩu trước khi tiếp tục",
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
