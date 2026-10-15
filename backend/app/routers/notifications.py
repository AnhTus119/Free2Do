"""Thông báo cho chuông ở góc phải: tính trực tiếp từ dữ liệu, không cần bảng riêng.

Trạng thái "đã đọc" do frontend lưu theo từng người; ``id`` của mỗi thông báo ổn định
theo đối tượng (ví dụ ``request:<id>``) nên khi xử lý xong thông báo tự biến mất.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.auth import get_current_account
from app.database import get_db

router = APIRouter(prefix="/notifications", tags=["notifications"])

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
RECENT_DAYS = 7
CLOSING_SOON_MINUTES = 120
LIMIT = 8


def _item(item_id, kind, title, body="", href=None, created_at=None) -> schemas.NotificationOut:
    return schemas.NotificationOut(id=item_id, kind=kind, title=title, body=body, href=href, created_at=created_at)


def _minutes_until_close(activity: models.Activity, now: datetime) -> int | None:
    """Số phút còn lại trước giờ đóng cửa nếu hoạt động đang mở, ngược lại None."""
    if activity.time_open is None or activity.time_close is None:
        return None
    current = now.hour * 60 + now.minute
    start = activity.time_open.hour * 60 + activity.time_open.minute
    end = activity.time_close.hour * 60 + activity.time_close.minute
    if start == end:
        return None
    if start < end:
        return end - current if start <= current < end else None
    if current >= start:  # qua nửa đêm (ví dụ 18:00 -> 02:00)
        return end + 24 * 60 - current
    return end - current if current < end else None


def _applies_today(activity: models.Activity, today) -> bool:
    if activity.available_from and activity.available_from.date() > today:
        return False
    if activity.always_available is not False:
        return True
    return not (activity.available_until and activity.available_until.date() < today)


def _customer_notifications(db: Session) -> list[schemas.NotificationOut]:
    now = datetime.now(VN_TZ)
    since = datetime.utcnow() - timedelta(days=RECENT_DAYS)
    result = []
    closing = []
    # ponytail: quét toàn bộ hoạt động active mỗi lần gọi; thêm cột phút mở/đóng + index nếu số hoạt động lên hàng chục nghìn
    for activity in db.query(models.Activity).filter(models.Activity.status == "active").all():
        left = _minutes_until_close(activity, now)
        if left is not None and 0 < left <= CLOSING_SOON_MINUTES and _applies_today(activity, now.date()):
            closing.append((left, activity))
    for left, activity in sorted(closing, key=lambda pair: pair[0])[:LIMIT]:
        result.append(_item(
            f"closing:{activity.activity_id}:{now.date().isoformat()}", "closing_soon",
            "Sắp đóng cửa, tới trải nghiệm ngay", f"{activity.name} đóng cửa sau {left} phút",
            f"activity-detail.html?id={activity.activity_id}", datetime.utcnow(),
        ))
    recent = (
        db.query(models.Activity).options(joinedload(models.Activity.business))
        .filter(models.Activity.status == "active", models.Activity.created_at >= since)
        .order_by(models.Activity.created_at.desc()).limit(LIMIT).all()
    )
    for activity in recent:
        result.append(_item(
            f"new-activity:{activity.activity_id}", "new_activity",
            f"{activity.business.business_name} vừa đăng hoạt động mới", activity.name,
            f"activity-detail.html?id={activity.activity_id}", activity.created_at,
        ))
    return result


def _operator_notifications(db: Session) -> list[schemas.NotificationOut]:
    result = []
    for request in (db.query(models.BusinessRequest).filter(models.BusinessRequest.status == "pending")
                    .order_by(models.BusinessRequest.created_at.desc()).limit(LIMIT)):
        result.append(_item(f"request:{request.request_id}", "pending_request", "Yêu cầu doanh nghiệp chờ duyệt",
                            request.business_name, "businesses.html", request.created_at))
    for activity in (db.query(models.Activity).filter(models.Activity.status == "pending")
                     .order_by(models.Activity.created_at.desc()).limit(LIMIT)):
        result.append(_item(f"pending-activity:{activity.activity_id}", "pending_activity", "Hoạt động chờ duyệt",
                            activity.name, "activities.html", activity.created_at))
    for report in (db.query(models.Report).options(joinedload(models.Report.activity)).filter(models.Report.status == "pending")
                   .order_by(models.Report.created_at.desc()).limit(LIMIT)):
        result.append(_item(f"report:{report.report_id}", "report", "Báo cáo hoạt động mới",
                            f"{report.activity.name}: {report.reason}", f"management.html#report-{report.report_id}", report.created_at))
    for complaint in (db.query(models.Complaint).filter(models.Complaint.status == "pending")
                      .order_by(models.Complaint.created_at.desc()).limit(LIMIT)):
        result.append(_item(f"complaint:{complaint.complaint_id}", "complaint", "Khiếu nại đánh giá mới",
                            complaint.reason, f"management.html#complaint-{complaint.complaint_id}", complaint.created_at))
    return result


def _business_notifications(db: Session, profile: models.BusinessProfile) -> list[schemas.NotificationOut]:
    since = datetime.utcnow() - timedelta(days=RECENT_DAYS)
    result = []
    for review in (db.query(models.Review).join(models.Activity, models.Review.activity_id == models.Activity.activity_id)
                   .options(joinedload(models.Review.activity))
                   .filter(models.Activity.business_id == profile.user_id, models.Review.created_at >= since)
                   .order_by(models.Review.created_at.desc()).limit(LIMIT)):
        result.append(_item(f"review:{review.review_id}", "review", "Đánh giá mới",
                            f"{review.rating}★ cho {review.activity.name}", "reviews.html", review.created_at))
    for activity in (db.query(models.Activity)
                     .filter(models.Activity.business_id == profile.user_id, models.Activity.status == "active",
                             models.Activity.verified_at >= since)
                     .order_by(models.Activity.verified_at.desc()).limit(LIMIT)):
        result.append(_item(f"approved:{activity.activity_id}:{int(activity.verified_at.timestamp())}", "approved",
                            "Hoạt động đã được duyệt", activity.name, "my-activities.html", activity.verified_at))
    for activity in (db.query(models.Activity)
                     .filter(models.Activity.business_id == profile.user_id, models.Activity.status == "hidden",
                             models.Activity.updated_at >= since)
                     .order_by(models.Activity.updated_at.desc()).limit(LIMIT)):
        result.append(_item(f"hidden:{activity.activity_id}", "hidden", "Hoạt động đã bị ẩn",
                            activity.name, "my-activities.html", activity.updated_at))
    return result


@router.get("", response_model=list[schemas.NotificationOut])
def list_notifications(db: Session = Depends(get_db), account: models.Account = Depends(get_current_account)):
    """Thông báo theo vai trò của người đang đăng nhập (operator / business / customer)."""
    if account.account_type == "operator":
        items = _operator_notifications(db)
    else:
        user = account.user
        profile = db.query(models.BusinessProfile).filter(models.BusinessProfile.user_id == user.user_id).first() if user else None
        items = _business_notifications(db, profile) if profile else _customer_notifications(db)
    return sorted(items, key=lambda item: item.created_at or datetime(1970, 1, 1), reverse=True)
