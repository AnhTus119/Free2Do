from datetime import date, datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from typing import Annotated

from app.utils.google_maps import build_google_maps_url


def _with_google_maps_fallback(model):
    """Hoạt động chưa có link Google Maps thì tự tạo từ tọa độ/địa chỉ."""
    if not model.google_maps_url:
        model.google_maps_url = build_google_maps_url(model.latitude, model.longitude, model.address)
    return model

# Account
class AccountCreate(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    password: str
    account_type: str

class Account(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    account_id: str
    email: Optional[str] = None
    phone: Optional[str] = None
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
    code: Optional[str] = None  # mã hiển thị C{n}
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
    email_notifications: bool = True

class OperatorProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    email_notifications: Optional[bool] = None

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)

class UserInterestsUpdate(BaseModel):
    interests: list[str] = Field(default_factory=list, max_length=20)

class UserInterestsOut(BaseModel):
    interests: list[str]

class NotificationOut(BaseModel):
    id: str                      # ổn định theo đối tượng, frontend dùng để nhớ trạng thái đã đọc
    kind: str                    # new_activity | closing_soon | review | approved | hidden | pending_request | pending_activity | report | complaint
    title: str
    body: str = ""
    href: Optional[str] = None
    created_at: Optional[datetime] = None

# Category 
class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=40)

    @model_validator(mode="before")
    @classmethod
    def _strip_name(cls, data):
        if isinstance(data, dict) and isinstance(data.get("name"), str):
            data = {**data, "name": " ".join(data["name"].split())}
        return data

class Category(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    category_id: str
    name: str

class CategoryAdminOut(Category):
    activity_count: int = 0  # số hoạt động đang gắn tag này

# BusinessProfile
class BusinessProfileCreate(BaseModel):
    business_name: str
    phone: Optional[str] = None
    description: Optional[str] = None
    business_address: Optional[str] = None

class BusinessProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: str
    business_code: Optional[str] = None
    business_name: str
    phone: Optional[str] = None
    description: Optional[str] = None
    business_address: Optional[str] = None
    avatar_url: Optional[str] = None
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None

# BusinessRequest
class BusinessRequestCreate(BaseModel):
    business_name: str
    phone: Optional[str] = None
    business_address: Optional[str] = None
    description: Optional[str] = None

class BusinessRequestProofOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    proof_id: str
    media_url: str
    created_at: datetime

class BusinessRequest(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    request_id: str
    user_id: str
    business_name: str
    phone: Optional[str] = None
    business_address: Optional[str] = None
    description: Optional[str] = None
    status: str
    rejection_reason: Optional[str] = None
    reviewed_by: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    proofs: list[BusinessRequestProofOut] = Field(default_factory=list)


# CustomerProfile
class CustomerProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: str
    avatar_url: Optional[str] = None

# Activity
# Mô tả bắt buộc khi tạo và không được xóa trống khi sửa (ảnh bìa bắt buộc được kiểm tra ở form tạo).
RequiredText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class ActivityCreate(BaseModel):
    name: str
    description: RequiredText
    price: Optional[int] = Field(None, ge=0)
    price_text: Optional[str] = None
    address: str
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    time_open: Optional[datetime] = None
    time_close: Optional[datetime] = None
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    always_available: bool = True
    category_ids: list[str] = Field(default_factory=list)
    source_url: Optional[str] = None
    google_maps_url: Optional[str] = None

class OperatorActivityCreate(ActivityCreate):
    """Operator tạo hoạt động cho một doanh nghiệp đã có tài khoản (business_id = mã doanh nghiệp)."""
    business_id: str

class BusinessLookupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: str
    business_name: str
    phone: Optional[str] = None
    business_address: Optional[str] = None
    description: Optional[str] = None
    avatar_url: Optional[str] = None

class Activity(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    activity_id: str
    code: Optional[str] = None  # mã hiển thị A{n}
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
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    always_available: bool = True
    status: str
    rejection_reason: Optional[str] = None
    expire_at: Optional[datetime] = None  # hạn chờ duyệt
    created_at: datetime
    source_url: Optional[str] = None
    google_maps_url: Optional[str] = None

class ActivityWithScore(Activity):
    """Dùng cho kết quả tìm kiếm kèm % phù hợp"""
    match_score: float
    distance_km: Optional[float] = None
    business_name: str
    category_ids: list[str] = Field(default_factory=list)
    category_names: list[str] = Field(default_factory=list)
    avg_rating: Optional[float] = None
    review_count: int = 0
    image_url: Optional[str] = None
    business_logo_url: Optional[str] = None

    @model_validator(mode="after")
    def _fill_google_maps_url(self):
        return _with_google_maps_fallback(self)

# ActivityMedia
class ActivityMedia(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    media_id: str
    activity_id: str
    media_url: str
    media_type: str
    media_kind: str = "gallery"
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


class MyReviewOut(ReviewOut):
    """Lịch sử đánh giá của chính người dùng, kèm thông tin hoạt động để hiển thị thẻ."""
    activity_name: str
    activity_status: str
    activity_image: Optional[str] = None

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
    activity_name: Optional[str] = None
    activity_id: Optional[str] = None
    activity_code: Optional[str] = None
    complainant_name: Optional[str] = None  # tên doanh nghiệp gửi khiếu nại
    reviewer_name: Optional[str] = None
    review_rating: Optional[int] = None
    review_content: Optional[str] = None
    review_created_at: Optional[datetime] = None
    reply_content: Optional[str] = None  # phản hồi của doanh nghiệp cho đánh giá gốc
    evidence: list[ReviewMedia] = Field(default_factory=list)

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
    activity_name: Optional[str] = None
    activity_code: Optional[str] = None
    reporter_name: Optional[str] = None

# SearchHistory
class SearchParams(BaseModel):
    """Query params cho endpoint tìm kiếm chính (gộp 6 tiêu chí)"""
    keyword: Optional[str] = None
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    radius: float = Field(5.0, gt=0)
    budget: Optional[float] = Field(None, ge=0)
    free_time: Optional[int] = Field(None, ge=30)
    selected_date: Optional[date] = None
    category_ids: list[str] = Field(default_factory=list)
    sort_by: Literal["match", "distance", "price", "rating"] = "match"
    record_history: bool = True
    location_label: Optional[str] = Field(None, max_length=120)  # lưu cùng lịch sử tìm kiếm

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
    location_label: Optional[str] = None
    created_at: datetime

# Auth
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class LoginRequest(BaseModel):
    identifier: str
    password: str

class RegisterRequest(BaseModel):
    """Đăng ký bằng email hoặc số điện thoại; mặc định dùng role customer."""
    identifier: Optional[str] = None
    email: Optional[str] = None  # tương thích client cũ
    password: str
    name: str
    role_id: Optional[str] = None
    phone: Optional[str] = None

class GoogleLoginRequest(BaseModel):
    """Đăng ký/đăng nhập cách 2: Sign in with Google"""
    id_token: str
    role_id: Optional[str] = None

class VerifyOtpRequest(BaseModel):
    identifier: str
    code: str

class ForgotPasswordRequest(BaseModel):
    identifier: str

class RecoveryEmailRequest(BaseModel):
    recovery_email: str

class RecoveryEmailVerifyRequest(RecoveryEmailRequest):
    code: str

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
    email: Optional[str] = None
    account_type: str            # "user" | "operator"
    role: Optional[str] = None   # role_name nếu là user (vd "customer","business"), "operator" nếu là Operator
    name: str
    username: str
    user_id: Optional[str] = None
    operator_id: Optional[str] = None
    phone: Optional[str] = None
    recovery_email: Optional[str] = None
    requires_recovery_email: bool = False
    avatar_url: Optional[str] = None
    level: Optional[str] = None
    redirect: str                # Trang phù hợp với operator, customer hoặc business

# ---------------------------------------------------------------------------
# User categories (sở thích) -- khách hàng chọn để phục vụ interest matching
# ---------------------------------------------------------------------------
class UserCategoriesUpdate(BaseModel):
    category_ids: list[str]

class UserProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    phone: Optional[str] = Field(None, max_length=30)


class GroupMemberInput(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    free_hours: float = Field(gt=0, le=24)
    address: str = Field(min_length=1, max_length=500)
    # GPS hoặc kết quả tra địa chỉ ở frontend; thiếu thì backend tự tra address trên bản đồ.
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    budget: float = Field(ge=0)
    category_ids: list[str] = Field(min_length=1)


class GroupCreateRequest(BaseModel):
    host: GroupMemberInput
    group_name: Optional[str] = Field(None, min_length=1, max_length=60)

    @model_validator(mode="before")
    @classmethod
    def accept_legacy_members_payload(cls, value):
        # Tương thích frontend cũ trong lúc client cập nhật; chỉ host được tạo.
        if isinstance(value, dict) and "host" not in value and value.get("members"):
            value = {**value, "host": value["members"][0]}
        return value


class GroupJoinRequest(GroupMemberInput):
    pass


class GroupMemberUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    free_hours: Optional[float] = Field(None, gt=0, le=24)
    address: Optional[str] = Field(None, min_length=1, max_length=500)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    budget: Optional[float] = Field(None, ge=0)
    category_ids: Optional[list[str]] = Field(None, min_length=1)


class GroupReadyRequest(BaseModel):
    is_ready: bool


class GroupLeaveRequest(BaseModel):
    action: Literal["approve", "reject"]


class GroupActivityConfirmation(BaseModel):
    action: Literal["accept", "reject"]


class GroupPaymentAction(BaseModel):
    action: Literal["paid", "unpaid", "remind"]


class GroupExpenseUpdate(BaseModel):
    total_amount: int = Field(ge=0)


class GroupActivitySelect(BaseModel):
    activity_id: str


class GroupPaymentOut(BaseModel):
    payment_id: str
    member_id: str
    amount: float
    status: str
    reminded_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None


class GroupMemberOut(BaseModel):
    member_id: str
    user_id: Optional[str] = None
    name: str
    free_hours: float
    address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    budget: float
    category_ids: list[str]
    category_names: list[str]
    is_host: bool
    is_ready: bool = False
    activity_vote_id: Optional[str] = None
    vote_activity_ids: list[str] = Field(default_factory=list)
    confirmation_status: Optional[str] = None
    leave_requested_at: Optional[datetime] = None
    leave_status: str = "none"
    is_online: bool = False
    payment: GroupPaymentOut


class GroupSelectedActivityOut(BaseModel):
    activity_id: str
    name: str
    description: Optional[str] = None
    address: str
    price: Optional[float] = None
    price_text: Optional[str] = None
    time_open: Optional[datetime] = None
    time_close: Optional[datetime] = None
    avg_rating: Optional[float] = None
    category_ids: list[str] = Field(default_factory=list)
    media_url: Optional[str] = None
    business_logo_url: Optional[str] = None


class GroupVoteTallyOut(BaseModel):
    activity_id: str
    name: str
    votes: int
    voter_member_ids: list[str]
    business_logo_url: Optional[str] = None
    media_url: Optional[str] = None


class GroupOut(BaseModel):
    group_id: str
    invite_code: str
    invite_url: str
    group_name: Optional[str] = None
    host_user_id: str
    is_host: bool
    status: str
    search_started: bool = False
    all_ready: bool = False
    confirmation_complete: bool = False
    selected_activity: Optional[GroupSelectedActivityOut] = None
    voting_closed: bool = False
    vote_tally: list[GroupVoteTallyOut] = Field(default_factory=list)
    tied_activity_ids: list[str] = Field(default_factory=list)
    random_pick: Optional[GroupSelectedActivityOut] = None
    random_seq: int = 0
    final_method: Optional[str] = None
    members: list[GroupMemberOut]
    total_amount: float
    paid_amount: float
    missing_amount: float
    created_at: datetime
    updated_at: datetime


class GroupRecommendationOut(GroupSelectedActivityOut):
    match_score: int
    member_scores: dict[str, int]
    distance_km: Optional[float] = None  # khoảng cách tới điểm giữa của nhóm

# ---------------------------------------------------------------------------
# Activity -- mở rộng cho Business (CRUD) và Operator (duyệt)
# ---------------------------------------------------------------------------
class ActivityUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[RequiredText] = None
    price: Optional[int] = Field(None, ge=0)
    price_text: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    time_open: Optional[datetime] = None
    time_close: Optional[datetime] = None
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    always_available: Optional[bool] = None
    category_ids: Optional[list[str]] = None
    source_url: Optional[str] = None
    google_maps_url: Optional[str] = None

    @model_validator(mode="after")
    def _description_not_cleared(self):
        if "description" in self.model_fields_set and self.description is None:
            raise ValueError("Mô tả hoạt động là bắt buộc")
        return self

class ActivityDetail(Activity):
    """Chi tiết hoạt động: kèm danh mục, media, rating trung bình -- dùng cho trang chi tiết"""
    category_ids: list[str] = Field(default_factory=list)
    media: list[ActivityMedia] = Field(default_factory=list)
    avg_rating: Optional[float] = None
    review_count: int = 0

class ActivityBusinessPhoto(BaseModel):
    """Ảnh gallery của doanh nghiệp, hiển thị thêm trong trang chi tiết hoạt động."""
    media_url: str
    media_type: str = "image"

class ActivityPublicOut(ActivityDetail):
    """Hoạt động công khai kèm tên doanh nghiệp để frontend không phải dùng dữ liệu mẫu."""
    business_name: str
    business_avatar_url: Optional[str] = None
    business_media: list[ActivityBusinessPhoto] = Field(default_factory=list)
    distance_km: Optional[float] = None
    is_approved: bool = False

    @model_validator(mode="after")
    def _fill_google_maps_url(self):
        return _with_google_maps_fallback(self)


class LocationResolveOut(BaseModel):
    latitude: float
    longitude: float
    display_name: str
    source: str

class ActivityAdminOut(ActivityPublicOut):
    """Dùng cho danh sách Operator duyệt -- kèm tên doanh nghiệp và thông tin xác minh"""
    business_name: str
    verified_by: Optional[str] = None
    verified_by_name: Optional[str] = None
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
    code: Optional[str] = None  # mã khách hàng C{n}
    account_id: str
    email: Optional[str] = None
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
    activity_code: Optional[str] = None
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
    business_address: Optional[str] = None
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
    activity_code: Optional[str] = None
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

class ActivityRejectRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=1000)

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


class OperatorActionLogOut(BaseModel):
    log_id: str
    action: str
    detail: Optional[str] = None
    created_at: datetime
    target_type: str
    target_id: str
    target_name: Optional[str] = None
    operator_name: str
