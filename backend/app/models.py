import uuid
from datetime import timedelta
from sqlalchemy import Column, String, Float, Integer, Text, DateTime, Boolean, ForeignKey, UniqueConstraint, text
from sqlalchemy.orm import relationship
from app.database import Base

def gen_id() -> str:
    return str(uuid.uuid4())


COMPLAINT_DEADLINE = timedelta(days=30)


_sqlite_activity_code = 0


def next_activity_code(context) -> str:
    """Mã hiển thị A1, A2... cho hoạt động mới (khóa chính vẫn là activity_id).

    PostgreSQL: lấy từ SEQUENCE activity_code_seq, an toàn khi nhiều request đồng thời,
    mã đã xóa không bị dùng lại."""
    connection = context.connection
    if connection.dialect.name == "postgresql":
        # IF NOT EXISTS: database mới (clone mới, chưa có sequence) vẫn tạo được hoạt động.
        connection.execute(text("CREATE SEQUENCE IF NOT EXISTS activity_code_seq"))
        return "A" + str(connection.execute(text("SELECT nextval('activity_code_seq')")).scalar())
    # ponytail: SQLite chỉ dùng cho test/chạy local 1 tiến trình, max+1 + bộ đếm là đủ.
    global _sqlite_activity_code
    numbers = [
        int(code[1:])
        for code in connection.execute(text("SELECT code FROM activities WHERE code LIKE 'A%'")).scalars()
        if code and code[1:].isdigit()
    ]
    _sqlite_activity_code = max([_sqlite_activity_code, *numbers]) + 1
    return f"A{_sqlite_activity_code}"


_sqlite_user_code = 0


def next_user_code(context) -> str:
    """Mã khách hàng C1, C2... (khóa chính vẫn là user_id). Cùng cách với next_activity_code;
    PostgreSQL dùng SEQUENCE user_code_seq."""
    connection = context.connection
    if connection.dialect.name == "postgresql":
        # IF NOT EXISTS: deploy trước khi chạy migration vẫn đăng ký được (migration sẽ setval lại).
        connection.execute(text("CREATE SEQUENCE IF NOT EXISTS user_code_seq"))
        return "C" + str(connection.execute(text("SELECT nextval('user_code_seq')")).scalar())
    global _sqlite_user_code
    numbers = [
        int(code[1:])
        for code in connection.execute(text("SELECT code FROM users WHERE code LIKE 'C%'")).scalars()
        if code and code[1:].isdigit()
    ]
    _sqlite_user_code = max([_sqlite_user_code, *numbers]) + 1
    return f"C{_sqlite_user_code}"

class Account(Base):
    __tablename__ = "accounts"

    account_id = Column(String, primary_key=True, default=gen_id)
    email = Column(String, unique=True, nullable=True)
    phone = Column(String, unique=True, nullable=True)
    recovery_email = Column(String, nullable=True)
    password_hash = Column(String, nullable=True)  # null nếu đăng ký bằng Google
    auth_provider = Column(String, nullable=False, default="email")  # "email" | "phone" | "google"
    google_id = Column(String, unique=True, nullable=True)
    email_verified = Column(Boolean, nullable=False, default=False)
    # True: phải đổi mật khẩu trước khi dùng API khác (tài khoản tạo bằng bootstrap_admin.py).
    must_change_password = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    account_type = Column(String, nullable=False)
    status = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime)
    user = relationship("User", back_populates="account", uselist=False)
    operator = relationship("Operator", back_populates="account", uselist=False)

class Role(Base):
    __tablename__ = "roles"

    role_id = Column(String, primary_key=True, default=gen_id)
    role_name = Column(String, nullable=False)
    users = relationship("User", back_populates="role")

class User(Base):
    __tablename__ = "users"

    user_id = Column(String, primary_key=True, default=gen_id)
    code = Column(String, unique=True, index=True, default=next_user_code)  # mã hiển thị C{n}
    account_id = Column(String, ForeignKey("accounts.account_id"), nullable=False)
    role_id = Column(String, ForeignKey("roles.role_id"), nullable=False)
    name = Column(String, nullable=False)
    phone = Column(String)
    account = relationship("Account", back_populates="user")
    role = relationship("Role", back_populates="users")
    categories = relationship("UserCategory", back_populates="user")
    business_profile = relationship("BusinessProfile", back_populates="user", uselist=False)
    customer_profile = relationship("CustomerProfile", back_populates="user", uselist=False)
    business_requests = relationship("BusinessRequest", back_populates="user")
    bookmarks = relationship("Bookmark", back_populates="user")
    reviews = relationship("Review", back_populates="user")
    complaints = relationship("Complaint", back_populates="user")
    reports = relationship("Report", back_populates="user")
    search_history = relationship("SearchHistory", back_populates="user")

class Operator(Base):
    __tablename__ = "operators"

    operator_id = Column(String, primary_key=True, default=gen_id)
    account_id = Column(String, ForeignKey("accounts.account_id"), nullable=False)
    name = Column(String, nullable=False)
    level = Column(String, nullable=False, default="staff")     # "admin" (cấp cao) | "staff" (nhân viên)
    status = Column(String, nullable=False, default="active")   # "active" | "disabled"
    created_at = Column(DateTime, nullable=False)
    email_notifications = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    account = relationship("Account", back_populates="operator")

class Category(Base):
    __tablename__ = "categories"

    category_id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    users = relationship("UserCategory", back_populates="category")
    activities = relationship("ActivityCategory", back_populates="category")

class UserCategory(Base):
    __tablename__ = "user_categories"

    user_id = Column(String, ForeignKey("users.user_id"), primary_key=True)
    category_id = Column(String, ForeignKey("categories.category_id"), primary_key=True)
    user = relationship("User", back_populates="categories")
    category = relationship("Category", back_populates="users")

class BusinessProfile(Base):
    __tablename__ = "business_profiles"

    user_id = Column(String, ForeignKey("users.user_id"), primary_key=True)
    business_code = Column(String, unique=True, index=True)
    business_name = Column(String, nullable=False)
    phone = Column(String)
    description = Column(Text)
    business_address = Column(String)
    avatar_url = Column(String)
    avatar_public_id = Column(String)
    verified_by = Column(String, ForeignKey("operators.operator_id"))
    verified_at = Column(DateTime)
    user = relationship("User", back_populates="business_profile")
    activities = relationship("Activity", back_populates="business")
    media = relationship("BusinessMedia", back_populates="business", cascade="all, delete-orphan")
    review_replies = relationship("ReviewReply", back_populates="business", cascade="all, delete-orphan")

class BusinessRequest(Base):
    __tablename__ = "business_requests"

    request_id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    business_name = Column(String, nullable=False)
    phone = Column(String)
    business_address = Column(String)
    description = Column(Text)
    status = Column(String, nullable=False)
    rejection_reason = Column(Text)
    reviewed_by = Column(String, ForeignKey("operators.operator_id"))
    created_at = Column(DateTime, nullable=False)
    reviewed_at = Column(DateTime)
    user = relationship("User", back_populates="business_requests")
    proofs = relationship(
        "BusinessRequestProof", back_populates="request", cascade="all, delete-orphan",
        order_by="BusinessRequestProof.created_at",
    )


class BusinessRequestProof(Base):
    """Ảnh minh chứng của đơn đăng ký doanh nghiệp. Tách hẳn khỏi activities_media."""
    __tablename__ = "business_request_proofs"

    proof_id = Column(String, primary_key=True, default=gen_id)
    request_id = Column(String, ForeignKey("business_requests.request_id", ondelete="CASCADE"), nullable=False, index=True)
    media_url = Column(String, nullable=False)
    public_id = Column(String, nullable=False)
    bytes = Column(Integer)
    created_at = Column(DateTime, nullable=False)
    request = relationship("BusinessRequest", back_populates="proofs")

class CustomerProfile(Base):
    __tablename__ = "customer_profiles"

    user_id = Column(String, ForeignKey("users.user_id"), primary_key=True)
    avatar_url = Column(String)
    avatar_public_id = Column(String)
    user = relationship("User", back_populates="customer_profile")

class Activity(Base):
    __tablename__ = "activities"

    activity_id = Column(String, primary_key=True, default=gen_id)
    code = Column(String, unique=True, index=True, default=next_activity_code)  # mã hiển thị A{n}
    business_id = Column(String, ForeignKey("business_profiles.user_id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    price = Column(Float)
    price_text = Column(String)
    address = Column(String, nullable=False)
    latitude = Column(Float)
    longitude = Column(Float)
    time_open = Column(DateTime)
    time_close = Column(DateTime)
    available_from = Column(DateTime)
    available_until = Column(DateTime)
    always_available = Column(Boolean, nullable=False, default=True)
    status = Column(String, nullable=False)
    verified_by = Column(String, ForeignKey("operators.operator_id"))
    verified_at = Column(DateTime)
    expire_at = Column(DateTime)  # hạn chờ duyệt: quá hạn mà vẫn "pending" thì chuyển "expired"
    rejection_reason = Column(Text)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime)
    source_url = Column(String)
    google_maps_url = Column(String)
    business = relationship("BusinessProfile", back_populates="activities")
    categories = relationship("ActivityCategory", back_populates="activity")
    media = relationship("ActivityMedia", back_populates="activity")
    bookmarks = relationship("Bookmark", back_populates="activity")
    reviews = relationship("Review", back_populates="activity")
    reports = relationship("Report", back_populates="activity")

class ActivityCategory(Base):
    __tablename__ = "activities_categories"

    activity_id = Column(String, ForeignKey("activities.activity_id"), primary_key=True)
    category_id = Column(String, ForeignKey("categories.category_id"), primary_key=True)
    activity = relationship("Activity", back_populates="categories")
    category = relationship("Category", back_populates="activities")

class ActivityMedia(Base):
    __tablename__ = "activities_media"

    media_id = Column(String, primary_key=True, default=gen_id)
    activity_id = Column(String, ForeignKey("activities.activity_id"), nullable=False)
    media_url = Column(String, nullable=False)
    media_type = Column(String, nullable=False)
    media_kind = Column(String, nullable=False, default="gallery")
    public_id = Column(String)
    bytes = Column(Integer)
    width = Column(Integer)
    height = Column(Integer)
    activity = relationship("Activity", back_populates="media")

class Bookmark(Base):
    __tablename__ = "bookmarks"

    user_id = Column(String, ForeignKey("users.user_id"), primary_key=True)
    activity_id = Column(String, ForeignKey("activities.activity_id"), primary_key=True)
    created_at = Column(DateTime, nullable=False)
    user = relationship("User", back_populates="bookmarks")
    activity = relationship("Activity", back_populates="bookmarks")

class Review(Base):
    __tablename__ = "reviews"

    review_id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    activity_id = Column(String, ForeignKey("activities.activity_id"), nullable=False)
    rating = Column(Integer, nullable=False)
    content = Column(Text)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime)
    user = relationship("User", back_populates="reviews")
    activity = relationship("Activity", back_populates="reviews")
    media = relationship("ReviewMedia", back_populates="review")
    complaints = relationship("Complaint", back_populates="review")
    reply = relationship("ReviewReply", back_populates="review", uselist=False, cascade="all, delete-orphan")

class ReviewMedia(Base):
    __tablename__ = "review_media"

    media_id = Column(String, primary_key=True, default=gen_id)
    review_id = Column(String, ForeignKey("reviews.review_id"), nullable=False)
    media_url = Column(String, nullable=False)
    media_type = Column(String, nullable=False)
    public_id = Column(String)
    bytes = Column(Integer)
    review = relationship("Review", back_populates="media")

class BusinessMedia(Base):
    __tablename__ = "business_media"

    media_id = Column(String, primary_key=True, default=gen_id)
    business_id = Column(String, ForeignKey("business_profiles.user_id"), nullable=False)
    media_url = Column(String, nullable=False)
    public_id = Column(String, nullable=False)
    media_type = Column(String, nullable=False, default="image")
    media_kind = Column(String, nullable=False)  # menu | gallery | logo
    bytes = Column(Integer)
    width = Column(Integer)
    height = Column(Integer)
    created_at = Column(DateTime, nullable=False)
    business = relationship("BusinessProfile", back_populates="media")

class ReviewReply(Base):
    __tablename__ = "review_replies"

    reply_id = Column(String, primary_key=True, default=gen_id)
    review_id = Column(String, ForeignKey("reviews.review_id"), nullable=False, unique=True)
    business_id = Column(String, ForeignKey("business_profiles.user_id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime)
    review = relationship("Review", back_populates="reply")
    business = relationship("BusinessProfile", back_populates="review_replies")
    media = relationship("ReviewReplyMedia", back_populates="reply", cascade="all, delete-orphan")

class ReviewReplyMedia(Base):
    __tablename__ = "review_reply_media"

    media_id = Column(String, primary_key=True, default=gen_id)
    reply_id = Column(String, ForeignKey("review_replies.reply_id"), nullable=False)
    media_url = Column(String, nullable=False)
    public_id = Column(String, nullable=False)
    media_type = Column(String, nullable=False)
    bytes = Column(Integer)
    created_at = Column(DateTime, nullable=False)
    reply = relationship("ReviewReply", back_populates="media")

class AvatarPreset(Base):
    __tablename__ = "avatar_presets"

    preset_id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    media_url = Column(String, nullable=False)
    public_id = Column(String, nullable=False, unique=True)
    is_active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False)

class Complaint(Base):
    __tablename__ = "complaints"

    complaint_id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    review_id = Column(String, ForeignKey("reviews.review_id"), nullable=False)
    reason = Column(String, nullable=False)
    description = Column(Text)
    status = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False)
    resolved_at = Column(DateTime)
    resolved_by = Column(String, ForeignKey("operators.operator_id"))
    user = relationship("User", back_populates="complaints")
    review = relationship("Review", back_populates="complaints")

    @property
    def deadline(self):
        """Hạn Operator xử lý: 30 ngày kể từ lúc gửi (tính ra, không lưu thêm cột)."""
        return self.created_at + COMPLAINT_DEADLINE if self.created_at else None

class Report(Base):
    __tablename__ = "reports"

    report_id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    activity_id = Column(String, ForeignKey("activities.activity_id"), nullable=False)
    reason = Column(String, nullable=False)
    description = Column(Text)
    status = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False)
    resolved_at = Column(DateTime)
    resolved_by = Column(String, ForeignKey("operators.operator_id"))
    user = relationship("User", back_populates="reports")
    activity = relationship("Activity", back_populates="reports")

class SearchHistory(Base):
    __tablename__ = "search_history"

    search_id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    keyword = Column(String)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    radius = Column(Float, nullable=False)
    budget = Column(Float)
    free_time = Column(Integer)
    location_label = Column(String)  # tên vị trí lúc tìm, vd "Cầu Giấy"
    created_at = Column(DateTime, nullable=False)
    user = relationship("User", back_populates="search_history")


class Group(Base):
    __tablename__ = "groups"
    group_id = Column(String, primary_key=True, default=gen_id)
    invite_code = Column(String, nullable=False, unique=True, index=True)
    group_name = Column(String(60))
    host_user_id = Column(String, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    selected_activity_id = Column(String, ForeignKey("activities.activity_id", ondelete="SET NULL"))
    status = Column(String, nullable=False, default="active")
    search_started = Column(Boolean, nullable=False, default=False)
    voting_closed_at = Column(DateTime)            # host đóng bình chọn
    random_pick_activity_id = Column(String)       # kết quả random đang chờ host chốt (khi hòa phiếu)
    random_seq = Column(Integer, nullable=False, default=0, server_default=text("0"))  # tăng mỗi lần random để client chạy animation
    final_method = Column(String)                  # "top_vote" | "random"
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)
    host = relationship("User", foreign_keys=[host_user_id])
    selected_activity = relationship("Activity", foreign_keys=[selected_activity_id])
    members = relationship("GroupMember", back_populates="group", cascade="all, delete-orphan")
    payments = relationship("GroupPayment", back_populates="group", cascade="all, delete-orphan")


class GroupMember(Base):
    __tablename__ = "group_members"
    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_group_member_user"),)
    member_id = Column(String, primary_key=True, default=gen_id)
    group_id = Column(String, ForeignKey("groups.group_id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.user_id", ondelete="SET NULL"), index=True)
    name = Column(String, nullable=False)
    free_hours = Column(Float, nullable=False)
    address = Column(String, nullable=False)
    latitude = Column(Float)   # tọa độ đã tra từ address hoặc GPS, dùng tính điểm giữa của nhóm
    longitude = Column(Float)
    budget = Column(Float, nullable=False)
    category_ids_json = Column(Text, nullable=False, default="[]")
    is_host = Column(Boolean, nullable=False, default=False)
    is_ready = Column(Boolean, nullable=False, default=False)
    leave_requested_at = Column(DateTime)
    leave_status = Column(String, nullable=False, default="none")
    joined_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)
    group = relationship("Group", back_populates="members")
    user = relationship("User", foreign_keys=[user_id])
    payment = relationship("GroupPayment", back_populates="member", uselist=False, cascade="all, delete-orphan")


class GroupPayment(Base):
    __tablename__ = "group_payments"
    payment_id = Column(String, primary_key=True, default=gen_id)
    group_id = Column(String, ForeignKey("groups.group_id", ondelete="CASCADE"), nullable=False, index=True)
    member_id = Column(String, ForeignKey("group_members.member_id", ondelete="CASCADE"), nullable=False, unique=True)
    amount = Column(Float, nullable=False, default=0)
    status = Column(String, nullable=False, default="unpaid")
    reminded_at = Column(DateTime)
    overdue_since = Column(DateTime)
    paid_at = Column(DateTime)
    updated_at = Column(DateTime, nullable=False)
    group = relationship("Group", back_populates="payments")
    member = relationship("GroupMember", back_populates="payment")


class GroupActivityVote(Base):
    __tablename__ = "group_activity_votes"
    __table_args__ = (
        UniqueConstraint("group_id", "member_id", name="uq_group_activity_vote_member"),
    )
    vote_id = Column(String, primary_key=True, default=gen_id)
    group_id = Column(String, ForeignKey("groups.group_id", ondelete="CASCADE"), nullable=False, index=True)
    member_id = Column(String, ForeignKey("group_members.member_id", ondelete="CASCADE"), nullable=False, index=True)
    activity_id = Column(String, ForeignKey("activities.activity_id", ondelete="CASCADE"), nullable=False)
    confirmation_status = Column(String, nullable=False, default="pending")

class OtpCode(Base):
    __tablename__ = "otp_codes"

    otp_id = Column(String, primary_key=True, default=gen_id)
    email = Column(String, nullable=False, index=True)
    code = Column(String, nullable=False)
    purpose = Column(String, nullable=False)  # hiện chỉ dùng "reset_password"
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False)


class UserInterest(Base):
    """Sở thích tự do của người dùng (hiện trong trang cá nhân và được AI dùng để hiểu ngữ cảnh).

    Khác với ``categories`` (tag của hoạt động do operator quản lý)."""
    __tablename__ = "user_interests"
    __table_args__ = (UniqueConstraint("user_id", "label_key", name="uq_user_interests_user_label"),)

    interest_id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False, index=True)
    label = Column(String, nullable=False)
    label_key = Column(String, nullable=False)  # chữ thường để chống trùng
    created_at = Column(DateTime, nullable=False)


class GroupActivityBallot(Base):
    """Phiếu bình chọn: mỗi thành viên chọn được nhiều hoạt động (một dòng cho mỗi hoạt động)."""
    __tablename__ = "group_activity_ballots"
    __table_args__ = (UniqueConstraint("member_id", "activity_id", name="uq_group_ballot_member_activity"),)

    ballot_id = Column(String, primary_key=True, default=gen_id)
    group_id = Column(String, ForeignKey("groups.group_id", ondelete="CASCADE"), nullable=False, index=True)
    member_id = Column(String, ForeignKey("group_members.member_id", ondelete="CASCADE"), nullable=False, index=True)
    activity_id = Column(String, ForeignKey("activities.activity_id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, nullable=False)


class OperatorActionLog(Base):
    """Nhật ký thao tác của operator. business_id = doanh nghiệp liên quan (chính nó hoặc chủ hoạt động),
    để hồ sơ doanh nghiệp gom được cả thao tác với các hoạt động của doanh nghiệp."""
    __tablename__ = "operator_action_logs"

    log_id = Column(String, primary_key=True, default=gen_id)
    operator_id = Column(String, ForeignKey("operators.operator_id"), nullable=False)
    target_type = Column(String, nullable=False)  # "customer" | "business" | "activity"
    target_id = Column(String, nullable=False, index=True)
    business_id = Column(String, index=True)
    action = Column(String, nullable=False)        # nhãn tiếng Việt, vd "Duyệt hoạt động"
    detail = Column(Text)
    created_at = Column(DateTime, nullable=False)
    operator = relationship("Operator")
