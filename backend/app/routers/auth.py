from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.config import settings
from app import models, schemas
from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_reset_token,
    decode_token,
    verify_google_token,
    get_current_account,
)
from app.utils.otp import generate_and_save_otp, verify_otp
from app.utils.email import send_otp_email

router = APIRouter(prefix="/auth", tags=["auth"])

# Cách 1: đăng ký bằng email + mật khẩu (không dùng OTP)
@router.post("/register", response_model=schemas.Token, status_code=status.HTTP_201_CREATED)
def register(payload: schemas.RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(models.Account).filter(models.Account.email == payload.email).first()
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email đã được sử dụng")

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
        email=payload.email,
        password_hash=hash_password(payload.password),
        auth_provider="email",
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
        name=payload.name,
        phone=payload.phone,
    )
    db.add(user)
    db.commit()

    # Trả token luôn để frontend có thể đăng nhập tự động sau khi đăng ký.
    return {"access_token": create_access_token(account.account_id)}

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
        else:
            if not payload.role_id:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cần role_id để tạo tài khoản mới")

            now = datetime.utcnow()
            account = models.Account(
                email=info["email"],
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

    return {"access_token": create_access_token(account.account_id)}

# Đăng nhập (email + mật khẩu) -- dùng chung cho user (khách hàng/doanh nghiệp) và operator (admin).
# Chỉ nhận username (email) + password, đúng chuẩn OAuth2PasswordRequestForm, không yêu cầu thêm gì khác.
@router.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    account = db.query(models.Account).filter(models.Account.email == form_data.username).first()

    if (
        not account
        or account.auth_provider != "email"
        or not account.password_hash
        or not verify_password(form_data.password, account.password_hash)
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sai email hoặc mật khẩu")

    if account.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản chưa được kích hoạt hoặc đã bị khóa")

    if account.account_type == "operator":
        operator = db.query(models.Operator).filter(models.Operator.account_id == account.account_id).first()
        if not operator or operator.status != "active":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản Operator đã bị khóa")
        # Phiên đăng nhập của Operator/admin giới hạn 3 tiếng, ngắn hơn user thường
        token = create_access_token(account.account_id, expire_minutes=settings.OPERATOR_TOKEN_EXPIRE_MINUTES)
    else:
        token = create_access_token(account.account_id)

    return {"access_token": token}


# Lấy thông tin tài khoản đang đăng nhập + gợi ý trang điều hướng (dùng ngay sau khi login/register)
@router.get("/me", response_model=schemas.MeResponse)
def read_me(account: models.Account = Depends(get_current_account), db: Session = Depends(get_db)):
    if account.account_type == "operator":
        operator = db.query(models.Operator).filter(models.Operator.account_id == account.account_id).first()
        return schemas.MeResponse(
            account_id=account.account_id,
            email=account.email,
            account_type="operator",
            role="operator",
            name=operator.name if operator else "",
            redirect="admin.html",
        )

    user = db.query(models.User).filter(models.User.account_id == account.account_id).first()
    role_name = user.role.role_name if user and user.role else None
    return schemas.MeResponse(
        account_id=account.account_id,
        email=account.email,
        account_type="user",
        role=role_name,
        name=user.name if user else "",
        redirect="index.html",
    )

# Quên / đổi mật khẩu
@router.post("/forgot-password", response_model=schemas.MessageResponse)
def forgot_password(payload: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    account = db.query(models.Account).filter(models.Account.email == payload.email).first()

    # Không tiết lộ email có tồn tại hay không -- luôn trả về message giống nhau
    if account and account.auth_provider == "email":
        code = generate_and_save_otp(db, payload.email, purpose="reset_password")
        send_otp_email(payload.email, code, purpose="reset_password")

    return {"message": "Nếu email tồn tại, mã OTP đã được gửi"}

@router.post("/verify-reset-otp", response_model=schemas.ResetTokenResponse)
def verify_reset_otp(payload: schemas.VerifyOtpRequest, db: Session = Depends(get_db)):
    if not verify_otp(db, payload.email, payload.code, purpose="reset_password"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mã OTP không đúng hoặc đã hết hạn")

    return {"reset_token": create_reset_token(payload.email)}

@router.post("/reset-password", response_model=schemas.MessageResponse)
def reset_password(payload: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    email = decode_token(payload.reset_token, expected_type="reset")
    if not email:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Reset token không hợp lệ hoặc đã hết hạn")

    account = db.query(models.Account).filter(models.Account.email == email).first()
    if not account:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tài khoản")

    account.password_hash = hash_password(payload.new_password)
    db.commit()

    return {"message": "Đổi mật khẩu thành công"}