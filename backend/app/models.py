import uuid
from sqlalchemy import Column, String, Float, Integer, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

def gen_id() -> str:
    return str(uuid.uuid4())

class Account(Base):
    __tablename__ = "accounts"

    account_id = Column(String, primary_key=True, default=gen_id)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=True)  # null nếu đăng ký bằng Google
    auth_provider = Column(String, nullable=False, default="email")  # "email" | "google"
    google_id = Column(String, unique=True, nullable=True)
    email_verified = Column(Boolean, nullable=False, default=False)
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
    business_name = Column(String, nullable=False)
    phone = Column(String)
    description = Column(Text)
    business_address = Column(String, nullable=False)
    verified_by = Column(String, ForeignKey("operators.operator_id"))
    verified_at = Column(DateTime)
    user = relationship("User", back_populates="business_profile")
    activities = relationship("Activity", back_populates="business")

class BusinessRequest(Base):
    __tablename__ = "business_requests"

    request_id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    business_name = Column(String, nullable=False)
    phone = Column(String)
    business_address = Column(String, nullable=False)
    description = Column(Text)
    status = Column(String, nullable=False)
    rejection_reason = Column(Text)
    reviewed_by = Column(String, ForeignKey("operators.operator_id"))
    created_at = Column(DateTime, nullable=False)
    reviewed_at = Column(DateTime)
    user = relationship("User", back_populates="business_requests")

class CustomerProfile(Base):
    __tablename__ = "customer_profiles"

    user_id = Column(String, ForeignKey("users.user_id"), primary_key=True)
    avatar_url = Column(String)
    user = relationship("User", back_populates="customer_profile")

class Activity(Base):
    __tablename__ = "activities"

    activity_id = Column(String, primary_key=True, default=gen_id)
    business_id = Column(String, ForeignKey("business_profiles.user_id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text)
    price = Column(Float)
    address = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    time_open = Column(DateTime)
    time_close = Column(DateTime)
    status = Column(String, nullable=False)
    verified_by = Column(String, ForeignKey("operators.operator_id"))
    verified_at = Column(DateTime)
    expire_at = Column(DateTime)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime)
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

class ReviewMedia(Base):
    __tablename__ = "review_media"

    media_id = Column(String, primary_key=True, default=gen_id)
    review_id = Column(String, ForeignKey("reviews.review_id"), nullable=False)
    media_url = Column(String, nullable=False)
    media_type = Column(String, nullable=False)
    review = relationship("Review", back_populates="media")

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
    created_at = Column(DateTime, nullable=False)
    user = relationship("User", back_populates="search_history")

class OtpCode(Base):
    __tablename__ = "otp_codes"

    otp_id = Column(String, primary_key=True, default=gen_id)
    email = Column(String, nullable=False, index=True)
    code = Column(String, nullable=False)
    purpose = Column(String, nullable=False)  # hiện chỉ dùng "reset_password"
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False)