from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

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
    avatar_url: Optional[str] = None
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
    price_text: Optional[str] = None
    address: str
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    time_open: Optional[datetime] = None
    time_close: Optional[datetime] = None
    category_ids: list[str] = Field(default_factory=list)
    source_url: Optional[str] = None

class Activity(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    activity_id: str
    business_id: str
    name: str
    description: Optional[str] = None
    price: Optional[float] = None
    price_text: Optional[str] = None
    address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    time_open: Optional[datetime] = None
    time_close: Optional[datetime] = None
    status: str
    created_at: datetime
    source_url: Optional[str] = None

class ActivityWithScore(Activity):
    """Dùng cho kết quả tìm kiếm kèm % phù hợp"""
    match_score: float
    distance_km: Optional[float] = None
    business_name: str
    category_ids: list[str] = Field(default_factory=list)
    avg_rating: Optional[float] = None
    review_count: int = 0

# ActivityMedia
class ActivityMedia(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    media_id: str
    activity_id: str
    media_url: str
    media_type: str
    public_id: Optional[str] = None
    bytes: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None

# Bookmark
class Bookmark(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: str
    activity_id: str
    created_at: datetime

# Review 
class ReviewCreate(BaseModel):
    activity_id: str
    rating: int = Field(ge=1, le=5)
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

class ReviewMedia(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    media_id: str
    review_id: str
    media_url: str
    media_type: str
    public_id: Optional[str] = None
    bytes: Optional[int] = None

class ReviewReplyMediaPublicOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    media_url: str
    media_type: str

class ReviewReplyPublicOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    reply_id: str
    content: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    media: list[ReviewReplyMediaPublicOut] = Field(default_factory=list)

class ReviewOut(Review):
    """Review trả về frontend kèm tên thật của người đánh giá."""
    reviewer_name: str
    media: list[ReviewMedia] = Field(default_factory=list)
    reply: Optional[ReviewReplyPublicOut] = None

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
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    radius: float = Field(5.0, gt=0)
    budget: Optional[float] = Field(None, ge=0)
    free_time: Optional[int] = Field(None, ge=30)
    category_ids: list[str] = Field(default_factory=list)
    sort_by: Literal["match", "distance", "price", "rating"] = "match"

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
    user_id: Optional[str] = None
    operator_id: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    level: Optional[str] = None
    redirect: str                # Trang phù hợp với operator, customer hoặc business

# ---------------------------------------------------------------------------
# User categories (sở thích) -- khách hàng chọn để phục vụ interest matching
# ---------------------------------------------------------------------------
class UserCategoriesUpdate(BaseModel):
    category_ids: list[str]

# ---------------------------------------------------------------------------
# Activity -- mở rộng cho Business (CRUD) và Operator (duyệt)
# ---------------------------------------------------------------------------
class ActivityUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    price_text: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    time_open: Optional[datetime] = None
    time_close: Optional[datetime] = None
    category_ids: Optional[list[str]] = None
    source_url: Optional[str] = None

class ActivityDetail(Activity):
    """Chi tiết hoạt động: kèm danh mục, media, rating trung bình -- dùng cho trang chi tiết"""
    category_ids: list[str] = Field(default_factory=list)
    media: list[ActivityMedia] = Field(default_factory=list)
    avg_rating: Optional[float] = None
    review_count: int = 0

class ActivityPublicOut(ActivityDetail):
    """Hoạt động công khai kèm tên doanh nghiệp để frontend không phải dùng dữ liệu mẫu."""
    business_name: str
    business_avatar_url: Optional[str] = None

class ActivityAdminOut(ActivityPublicOut):
    """Dùng cho danh sách Operator duyệt -- kèm tên doanh nghiệp và thông tin xác minh"""
    business_name: str
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None
    expire_at: Optional[datetime] = None

# ---------------------------------------------------------------------------
# Review -- cập nhật
# ---------------------------------------------------------------------------
class ReviewUpdate(BaseModel):
    rating: Optional[int] = Field(None, ge=1, le=5)
    content: Optional[str] = None

# ---------------------------------------------------------------------------
# Operator -- xử lý report / complaint
# ---------------------------------------------------------------------------
class ReportResolveRequest(BaseModel):
    action: Literal["dismiss", "hide_activity"]

class ComplaintResolveRequest(BaseModel):
    action: Literal["dismiss", "delete_review"]

# ---------------------------------------------------------------------------
# Operator -- quản lý Customer/Business, xem/sửa Business Profile, dashboard
# ---------------------------------------------------------------------------
class UserAdminOut(BaseModel):
    user_id: str
    account_id: str
    email: str
    role_name: str
    name: str
    phone: Optional[str] = None
    status: str  # accounts.status: active | blocked | suspended
    created_at: datetime
    participation_count: int = 0
    review_count: int = 0
    last_activity_at: Optional[datetime] = None
    activity_count: int = 0
    active_activity_count: int = 0
    pending_activity_count: int = 0
    average_rating: Optional[float] = None

class UserAdminUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None

class AccountStatusUpdate(BaseModel):
    status: Literal["active", "blocked", "suspended"]

class BusinessProfileAdminUpdate(BaseModel):
    business_name: Optional[str] = None
    phone: Optional[str] = None
    description: Optional[str] = None
    business_address: Optional[str] = None

class BusinessProfileUpdate(BaseModel):
    business_name: Optional[str] = Field(None, min_length=1, max_length=200)
    phone: Optional[str] = Field(None, max_length=30)
    description: Optional[str] = Field(None, max_length=5000)
    business_address: Optional[str] = Field(None, min_length=1, max_length=500)

class BusinessDashboardOut(BaseModel):
    activity_count: int
    active_activity_count: int
    pending_activity_count: int
    hidden_activity_count: int
    cancelled_activity_count: int
    review_count: int
    unanswered_review_count: int
    average_rating: Optional[float] = None
    pending_complaint_count: int
    bookmark_count: int

class BusinessAnalyticsSummary(BaseModel):
    period_review_count: int
    period_bookmark_count: int
    period_interaction_count: int
    period_average_rating: Optional[float] = None
    total_activity_count: int

class BusinessTrendPoint(BaseModel):
    label: str
    review_count: int
    bookmark_count: int
    interaction_count: int
    average_rating: Optional[float] = None

class BusinessRatingPoint(BaseModel):
    rating: int
    count: int
    percentage: float

class BusinessStatusPoint(BaseModel):
    status: str
    count: int

class BusinessCategoryPoint(BaseModel):
    category_id: str
    category_name: str
    activity_count: int

class BusinessActivityPerformance(BaseModel):
    activity_id: str
    activity_name: str
    status: str
    review_count: int
    bookmark_count: int
    unanswered_review_count: int
    average_rating: Optional[float] = None
    interaction_count: int

class BusinessAnalyticsOut(BaseModel):
    generated_at: datetime
    period_days: int
    granularity: Literal["day", "week", "month"]
    activity_id: Optional[str] = None
    summary: BusinessAnalyticsSummary
    engagement_trend: list[BusinessTrendPoint]
    rating_distribution: list[BusinessRatingPoint]
    activity_status_distribution: list[BusinessStatusPoint]
    category_distribution: list[BusinessCategoryPoint]
    activity_performance: list[BusinessActivityPerformance]

class BusinessMediaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    media_id: str
    business_id: str
    media_url: str
    public_id: str
    media_type: str
    media_kind: str
    bytes: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    created_at: datetime

class BusinessPublicOut(BaseModel):
    user_id: str
    business_name: str
    phone: Optional[str] = None
    description: Optional[str] = None
    business_address: str
    avatar_url: Optional[str] = None
    activity_count: int = 0
    media: list[BusinessMediaOut] = Field(default_factory=list)

class ReviewReplyCreate(BaseModel):
    content: str = Field(min_length=1, max_length=5000)

class ReviewReplyUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=5000)

class ReviewReplyMediaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    media_id: str
    reply_id: str
    media_url: str
    public_id: str
    media_type: str
    bytes: Optional[int] = None
    created_at: datetime

class ReviewReplyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    reply_id: str
    review_id: str
    business_id: str
    content: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    media: list[ReviewReplyMediaOut] = Field(default_factory=list)

class BusinessReviewOut(BaseModel):
    review_id: str
    user_id: str
    activity_id: str
    activity_name: str
    reviewer_name: str
    rating: int
    content: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    media: list[ReviewMedia] = Field(default_factory=list)
    reply: Optional[ReviewReplyOut] = None

class AvatarPresetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    preset_id: str
    name: str
    media_url: str
    sort_order: int

class MediaUploadOut(BaseModel):
    media_url: str
    public_id: str
    media_type: str
    bytes: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None

class ActivityStatusUpdate(BaseModel):
    status: Literal["pending", "active", "cancelled", "hidden"]

class DashboardOut(BaseModel):
    user_count: int
    business_count: int
    activity_count: int
    review_count: int
    pending_request_count: int
    pending_report_count: int
    pending_complaint_count: int
    customer_count: int
    active_activity_count: int
    pending_activity_count: int
    locked_customer_count: int
    missing_business_phone_count: int
    pending_total_count: int

class CustomerSummaryOut(BaseModel):
    total_count: int
    active_count: int
    locked_count: int

class BusinessSummaryOut(BaseModel):
    total_count: int
    active_count: int
    pending_count: int
    locked_count: int

class ActivitySummaryOut(BaseModel):
    total_count: int
    active_count: int
    pending_count: int
    hidden_count: int
    cancelled_count: int
    expired_count: int
    rejected_count: int
