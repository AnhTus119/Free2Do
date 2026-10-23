from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from app.database import get_db
from app.config import settings
from app import models, schemas
from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_reset_token,
    decode_payload,
    decode_token,
    issue_tokens,
    verify_google_token,
    get_authenticated_account,
    oauth2_scheme,
    requires_recovery_email,
    ensure_recovery_email,
)
from app.utils.otp import OtpRateLimited, generate_and_save_otp, verify_otp
from app.utils.email import EmailDeliveryError, send_otp_email
from app.utils.identity import find_account, normalize_email, normalize_person_name, normalize_phone, phone_taken, split_identifier

router = APIRouter(prefix="/auth", tags=["auth"])


def _otp_or_429(db: Session, email: str, purpose: str) -> str:
    try:
        return generate_and_save_otp(db, email, purpose=purpose)
    except OtpRateLimited as exc:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, str(exc), headers={"Retry-After": str(exc.wait_seconds)},
        ) from exc


def _send_otp_or_502(email: str, code: str, purpose: str) -> None:
    try:
        send_otp_email(email, code, purpose=purpose)
    except EmailDeliveryError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Không gửi được email OTP. Hãy kiểm tra cấu hình Gmail App Password trên Render.",
        ) from exc

# Cách 1: đăng ký bằng email hoặc số điện thoại + mật khẩu (không dùng OTP)
@router.post("/register", response_model=schemas.Token, status_code=status.HTTP_201_CREATED)
def register(payload: schemas.RegisterRequest, db: Session = Depends(get_db)):
    raw_identifier = payload.identifier or payload.email
    if not raw_identifier:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Vui lòng nhập email hoặc số điện thoại")
    try:
        name = normalize_person_name(payload.name)
        email, login_phone = split_identifier(raw_identifier)
        phone = login_phone or (normalize_phone(payload.phone) if payload.phone else None)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    if email and db.query(models.Account).filter(models.Account.email == email).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email đã được sử dụng")
    if phone and phone_taken(db, phone):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Số điện thoại đã được sử dụng")

    # Form đăng ký hiện tại dành cho người dùng thông thường. Nếu frontend không
    # truyền role_id, backend tự lấy role có role_name = "customer".
    if payload.role_id:
        role = db.query(models.Role).filter(models.Role.role_id == payload.role_id).first()
    else:
        role = (
            db.query(models.Role)
            .filter(func.lower(models.Role.role_name) == "customer")
            .first()
        )

    if not role:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Không tìm thấy role customer. Hãy chạy python init_db.py để tạo role mặc định.",
        )

    now = datetime.utcnow()
    account = models.Account(
        email=email,
        phone=phone,
        recovery_email=email,
        password_hash=hash_password(payload.password),
        auth_provider="email" if email else "phone",
        # Không gửi OTP khi đăng ký nên email chưa được xác minh, nhưng tài khoản
        # vẫn được kích hoạt để có thể đăng nhập ngay.
        email_verified=False,
        account_type="user",
        status="active",
        created_at=now,
    )
    db.add(account)
    db.flush()

    user = models.User(
        account_id=account.account_id,
        role_id=role.role_id,
        name=name,
        phone=phone,
    )
    db.add(user)
    db.commit()

    # Trả token luôn để frontend có thể đăng nhập tự động sau khi đăng ký.
    return issue_tokens(db, account)

# Cách 2: Sign in with Google
@router.post("/google", response_model=schemas.Token)
def google_login(payload: schemas.GoogleLoginRequest, db: Session = Depends(get_db)):
    info = verify_google_token(payload.id_token)
    if not info:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google token không hợp lệ")

    account = db.query(models.Account).filter(models.Account.google_id == info["google_id"]).first()

    if not account:
        # Tài khoản Google mới -- tự tạo, không cần OTP vì Google đã xác thực email
        account = db.query(models.Account).filter(models.Account.email == info["email"]).first()
        if account:
            # Email đã tồn tại bằng cách đăng ký khác -- gắn thêm Google vào tài khoản đó
            account.google_id = info["google_id"]
            account.email_verified = True
            if account.auth_provider != "phone":
                account.recovery_email = info["email"]
        else:
            if not payload.role_id:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cần role_id để tạo tài khoản mới")

            now = datetime.utcnow()
            account = models.Account(
                email=info["email"],
                recovery_email=info["email"],
                password_hash=None,
                auth_provider="google",
                google_id=info["google_id"],
                email_verified=True,
                account_type="user",
                status="active",
                created_at=now,
            )
            db.add(account)
            db.flush()

            db.add(models.User(
                account_id=account.account_id,
                role_id=payload.role_id,
                name=info["name"],
            ))

        db.commit()

    return issue_tokens(db, account)

# Đăng nhập bằng email hoặc số điện thoại + mật khẩu.
@router.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    try:
        account = find_account(db, form_data.username)
    except ValueError:
        account = None

    if not account or account.auth_provider == "google" or not account.password_hash:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sai email/số điện thoại hoặc mật khẩu")

    # Chống dò mật khẩu: sai LOGIN_MAX_FAILED lần liên tiếp -> khóa đăng nhập LOGIN_LOCK_MINUTES phút.
    now = datetime.utcnow()
    if account.login_locked_until and account.login_locked_until > now:
        minutes = int((account.login_locked_until - now).total_seconds() // 60) + 1
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Bạn đã nhập sai mật khẩu quá {settings.LOGIN_MAX_FAILED} lần. Vui lòng thử lại sau {minutes} phút",
        )
    if not verify_password(form_data.password, account.password_hash):
        account.failed_login_count = (account.failed_login_count or 0) + 1
        if account.failed_login_count >= settings.LOGIN_MAX_FAILED:
            account.failed_login_count = 0
            account.login_locked_until = now + timedelta(minutes=settings.LOGIN_LOCK_MINUTES)
            db.commit()
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Bạn đã nhập sai mật khẩu quá {settings.LOGIN_MAX_FAILED} lần. "
                f"Tài khoản tạm khóa đăng nhập {settings.LOGIN_LOCK_MINUTES} phút",
            )
        db.commit()
        remaining = settings.LOGIN_MAX_FAILED - account.failed_login_count
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            f"Sai email/số điện thoại hoặc mật khẩu. Còn {remaining} lần thử trước khi bị khóa {settings.LOGIN_LOCK_MINUTES} phút",
        )
    if account.failed_login_count or account.login_locked_until:
        account.failed_login_count = 0
        account.login_locked_until = None

    if account.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản chưa được kích hoạt hoặc đã bị khóa")

    if account.account_type == "operator":
        operator = db.query(models.Operator).filter(models.Operator.account_id == account.account_id).first()
        if not operator or operator.status != "active":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản Operator đã bị khóa")
    # Phiên Operator/admin (8 tiếng) ngắn hơn user thường (7 ngày), xem issue_tokens.
    return issue_tokens(db, account)


@router.post("/refresh-token", response_model=schemas.Token)
def refresh_access_token(payload: schemas.RefreshTokenRequest, db: Session = Depends(get_db)):
    """Đổi refresh token còn hạn lấy access token mới (cùng phiên, refresh token giữ nguyên)."""
    if not payload.refresh_token or not payload.refresh_token.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Thiếu refresh token")
    claims = decode_payload(payload.refresh_token.strip(), expected_type="refresh")
    session = db.get(models.RefreshToken, claims.get("jti")) if claims and claims.get("jti") else None
    if (
        not session
        or session.account_id != claims.get("sub")
        or session.revoked_at is not None
        or session.expires_at <= datetime.utcnow()
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token không hợp lệ hoặc đã hết hạn")
    account = db.get(models.Account, session.account_id)
    if not account or account.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản chưa được kích hoạt hoặc đã bị khóa")
    # ponytail: không xoay vòng refresh token -- nhiều tab cùng làm mới một lúc không đá nhau ra ngoài.
    return {
        "access_token": create_access_token(account.account_id, session_id=session.token_id),
        "refresh_token": payload.refresh_token.strip(),
    }


@router.post("/signout", response_model=schemas.MessageResponse)
def signout(
    token: str = Depends(oauth2_scheme),
    account: models.Account = Depends(get_authenticated_account),
    db: Session = Depends(get_db),
):
    """Đăng xuất phiên hiện tại: refresh token và mọi access token của phiên này hết hiệu lực ngay."""
    session_id = (decode_payload(token, expected_type="access") or {}).get("sid")
    session = db.get(models.RefreshToken, session_id) if session_id else None
    if session and session.account_id == account.account_id and session.revoked_at is None:
        session.revoked_at = datetime.utcnow()
        db.commit()
    return {"message": "Đã đăng xuất"}


# Lấy thông tin tài khoản đang đăng nhập + gợi ý trang điều hướng (dùng ngay sau khi login/register)
@router.get("/me", response_model=schemas.MeResponse)
def read_me(account: models.Account = Depends(get_authenticated_account), db: Session = Depends(get_db)):
    if account.account_type == "operator":
        operator = account.operator  # đã nạp cùng account, không cần truy vấn thêm
        return schemas.MeResponse(
            account_id=account.account_id,
            email=account.email,
            phone=account.phone,
            recovery_email=account.recovery_email,
            requires_recovery_email=requires_recovery_email(account),
            requires_password_change=bool(account.must_change_password),
            account_type="operator",
            role="operator",
            name=operator.name if operator else "",
            username=operator.name if operator else "",
            operator_id=operator.operator_id if operator else None,
            level=operator.level if operator else None,
            redirect="admin.html",
        )

    user = (
        db.query(models.User)
        .options(
            joinedload(models.User.role),
            joinedload(models.User.business_profile),
            joinedload(models.User.customer_profile),
        )
        .filter(models.User.account_id == account.account_id)
        .first()
    )
    role_name = user.role.role_name if user and user.role else None
    avatar_url = None
    if user:
        profile = user.business_profile or user.customer_profile
        avatar_url = profile.avatar_url if profile else None
    is_business = role_name == "business"
    return schemas.MeResponse(
        account_id=account.account_id,
        email=account.email,
        account_type="user",
        role=role_name,
        name=user.name if user else "",
        username=user.name if user else "",
        user_id=user.user_id if user else None,
        phone=(account.phone or user.phone) if user else account.phone,
        phone_locked=account.auth_provider == "phone",
        recovery_email=account.recovery_email,
        requires_recovery_email=requires_recovery_email(account),
        requires_password_change=bool(account.must_change_password),
        avatar_url=avatar_url,
        redirect=(
            "Demo Trang Business/business-home.html"
            if is_business
            else "Demo Trang Customer/home.html"
        ),
    )

# Quên / đổi mật khẩu
@router.post("/change-password", response_model=schemas.MessageResponse)
def change_password(
    payload: schemas.ChangePasswordRequest,
    db: Session = Depends(get_db),
    account: models.Account = Depends(get_authenticated_account),
):
    """Đổi mật khẩu cho mọi loại tài khoản đang đăng nhập (customer, business, operator).
    Không chặn tài khoản đang bị buộc đổi mật khẩu: đây chính là bước gỡ chặn đó."""
    ensure_recovery_email(account)
    if not account.password_hash:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tài khoản này đăng nhập bằng Google nên chưa có mật khẩu")
    if not verify_password(payload.current_password, account.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mật khẩu hiện tại không đúng")
    if payload.current_password == payload.new_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mật khẩu mới phải khác mật khẩu hiện tại")
    account.password_hash = hash_password(payload.new_password)
    account.must_change_password = False
    account.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Đã đổi mật khẩu"}


@router.post("/forgot-password", response_model=schemas.MessageResponse)
def forgot_password(payload: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    try:
        account = find_account(db, payload.identifier)
    except ValueError:
        account = None
    destination = None
    if account:
        destination = account.recovery_email or (
            account.email if account.auth_provider != "phone" else None
        )
    if account and account.password_hash and destination:
        code = _otp_or_429(db, destination, purpose="reset_password")
        _send_otp_or_502(destination, code, purpose="reset_password")

    return {"message": "Nếu tài khoản tồn tại, mã OTP đã được gửi tới email khôi phục"}

@router.post("/verify-reset-otp", response_model=schemas.ResetTokenResponse)
def verify_reset_otp(payload: schemas.VerifyOtpRequest, db: Session = Depends(get_db)):
    try:
        account = find_account(db, payload.identifier)
    except ValueError:
        account = None
    destination = None
    if account:
        destination = account.recovery_email or (
            account.email if account.auth_provider != "phone" else None
        )
    if not destination or not verify_otp(db, destination, payload.code, purpose="reset_password"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mã OTP không đúng hoặc đã hết hạn")

    return {"reset_token": create_reset_token(account.account_id)}


def _validate_recovery_email(raw_email: str) -> str:
    try:
        email = normalize_email(raw_email)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return email


@router.post("/recovery-email/request", response_model=schemas.MessageResponse)
def request_recovery_email(
    payload: schemas.RecoveryEmailRequest,
    account: models.Account = Depends(get_authenticated_account),
    db: Session = Depends(get_db),
):
    if account.auth_provider != "phone":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Tài khoản email/Google dùng chính email đăng nhập để khôi phục mật khẩu",
        )
    email = _validate_recovery_email(payload.recovery_email)
    code = _otp_or_429(db, email, purpose="verify_recovery_email")

    _send_otp_or_502(email, code, purpose="verify_recovery_email")

    return {"message": "Mã OTP đã được gửi tới email khôi phục"}


@router.put("/recovery-email/verify", response_model=schemas.MessageResponse)
def verify_recovery_email(
    payload: schemas.RecoveryEmailVerifyRequest,
    account: models.Account = Depends(get_authenticated_account),
    db: Session = Depends(get_db),
):
    if account.auth_provider != "phone":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Tài khoản này không cần thiết lập email khôi phục riêng",
        )
    email = _validate_recovery_email(payload.recovery_email)
    if not verify_otp(db, email, payload.code, purpose="verify_recovery_email"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mã OTP không đúng hoặc đã hết hạn")
    account.recovery_email = email
    db.commit()
    return {"message": "Email khôi phục đã được xác minh"}

@router.post("/reset-password", response_model=schemas.MessageResponse)
def reset_password(payload: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    account_id = decode_token(payload.reset_token, expected_type="reset")
    if not account_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Reset token không hợp lệ hoặc đã hết hạn")

    account = db.query(models.Account).filter(models.Account.account_id == account_id).first()
    if not account:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tài khoản")

    account.password_hash = hash_password(payload.new_password)
    db.commit()

    return {"message": "Đổi mật khẩu thành công"}
