from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict

# Account
class AccountCreate(BaseModel):
    email: str
    password: str
    account_type: str

class Account(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    account_id: str
    email: str
    account_type: str
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None

# Role
class Role(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    role_id: str
    role_name: str

# User 
class UserCreate(BaseModel):
    email: str
    password: str
    role_id: str
    name: str
    phone: Optional[str] = None

class User(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: str
    account_id: str
    role_id: str
    name: str
    phone: Optional[str] = None

# Operator 
class Operator(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    operator_id: str
    account_id: str
    name: str
    level: str
    status: str

# Operator -- quản lý tài khoản Operator (chỉ admin mới gọi được các API này)
class OperatorCreateRequest(BaseModel):
    email: str
    password: str
    name: str
    level: Literal["admin", "staff"] = "staff"

class OperatorUpdateRequest(BaseModel):
    name: Optional[str] = None
    level: Optional[Literal["admin", "staff"]] = None
    status: Optional[Literal["active", "disabled"]] = None

class OperatorOut(BaseModel):
    operator_id: str
    account_id: str
    email: str
    name: str
    level: str
    status: str
    created_at: datetime

# Category 
class CategoryCreate(BaseModel):
    name: str

class Category(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    category_id: str
    name: str

# BusinessProfile
class BusinessProfileCreate(BaseModel):
    business_name: str
    phone: Optional[str] = None
    description: Optional[str] = None
    business_address: str

class BusinessProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: str
    business_name: str
    phone: Optional[str] = None
    description: Optional[str] = None
    business_address: str
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None

# BusinessRequest
class BusinessRequestCreate(BaseModel):
    business_name: str
    phone: Optional[str] = None
    business_address: str
    description: Optional[str] = None

class BusinessRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    request_id: str
    user_id: str
    business_name: str
    phone: Optional[str] = None
    business_address: str
    description: Optional[str] = None
    status: str
    rejection_reason: Optional[str] = None
    reviewed_by: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None

# CustomerProfile
class CustomerProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: str
    avatar_url: Optional[str] = None

# Activity
class ActivityCreate(BaseModel):
    name: str
    description: Optional[str] = None
    price: Optional[float] = None
    address: str
    latitude: float
    longitude: float
    time_open: Optional[datetime] = None
    time_close: Optional[datetime] = None
    category_ids: list[str] = []

class Activity(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    activity_id: str
    business_id: str
    name: str
    description: Optional[str] = None
    price: Optional[float] = None
    address: str
    latitude: float
    longitude: float
    time_open: Optional[datetime] = None
    time_close: Optional[datetime] = None
    status: str
    created_at: datetime

class ActivityWithScore(Activity):
    """Dùng cho kết quả tìm kiếm kèm % phù hợp"""
    match_score: float
    distance_km: Optional[float] = None

# ActivityMedia
class ActivityMedia(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    media_id: str
    activity_id: str
    media_url: str
    media_type: str

# Bookmark
class Bookmark(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: str
    activity_id: str
    created_at: datetime

# Review 
class ReviewCreate(BaseModel):
    activity_id: str
    rating: int
    content: Optional[str] = None

class Review(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    review_id: str
    user_id: str
    activity_id: str
    rating: int
    content: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

# ReviewMedia
class ReviewMedia(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    media_id: str
    review_id: str
    media_url: str
    media_type: str

# Complaint
class ComplaintCreate(BaseModel):
    review_id: str
    reason: str
    description: Optional[str] = None

class Complaint(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    complaint_id: str
    user_id: str
    review_id: str
    reason: str
    description: Optional[str] = None
    status: str
    created_at: datetime
    resolved_at: Optional[datetime] = None

# Report
class ReportCreate(BaseModel):
    activity_id: str
    reason: str
    description: Optional[str] = None

class Report(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    report_id: str
    user_id: str
    activity_id: str
    reason: str
    description: Optional[str] = None
    status: str
    created_at: datetime
    resolved_at: Optional[datetime] = None

# SearchHistory
class SearchParams(BaseModel):
    """Query params cho endpoint tìm kiếm chính (gộp 6 tiêu chí)"""
    keyword: Optional[str] = None
    latitude: float
    longitude: float
    radius: float = 5.0
    budget: Optional[float] = None
    free_time: Optional[int] = None
    category_ids: list[str] = []

class SearchHistory(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    search_id: str
    user_id: str
    keyword: Optional[str] = None
    latitude: float
    longitude: float
    radius: float
    budget: Optional[float] = None
    free_time: Optional[int] = None
    created_at: datetime

# Auth
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    """Đăng ký bằng email + mật khẩu. Nếu không truyền role_id, mặc định dùng role customer."""
    email: str
    password: str
    name: str
    role_id: Optional[str] = None
    phone: Optional[str] = None

class GoogleLoginRequest(BaseModel):
    """Đăng ký/đăng nhập cách 2: Sign in with Google"""
    id_token: str
    role_id: Optional[str] = None

class VerifyOtpRequest(BaseModel):
    email: str
    code: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetTokenResponse(BaseModel):
    reset_token: str

class ResetPasswordRequest(BaseModel):
    reset_token: str
    new_password: str

class MessageResponse(BaseModel):
    message: str

class MeResponse(BaseModel):
    """Dùng cho GET /auth/me -- frontend gọi ngay sau khi có token để biết điều hướng vào trang nào."""
    account_id: str
    email: str
    account_type: str            # "user" | "operator"
    role: Optional[str] = None   # role_name nếu là user (vd "customer","business"), "operator" nếu là Operator
    name: str
    redirect: str                # "admin.html" | "index.html"