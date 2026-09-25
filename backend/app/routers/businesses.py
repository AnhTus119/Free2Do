from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_current_business_user
from app.database import get_db
from app.routers.activities import _to_detail
from app.services.cloudinary_storage import delete_asset


router = APIRouter(prefix="/business", tags=["business"])


def _bucket_date(value: datetime, granularity: str) -> date:
    current = value.date()
    if granularity == "week":
        return current - timedelta(days=current.weekday())
    if granularity == "month":
        return current.replace(day=1)
    return current


def _next_bucket(current: date, granularity: str) -> date:
    if granularity == "week":
        return current + timedelta(days=7)
    if granularity == "month":
        return (current.replace(day=28) + timedelta(days=4)).replace(day=1)
    return current + timedelta(days=1)


def _owned_review(db: Session, review_id: str, business_id: str) -> models.Review:
    review = (
        db.query(models.Review)
        .join(models.Activity, models.Activity.activity_id == models.Review.activity_id)
        .filter(
            models.Review.review_id == review_id,
            models.Activity.business_id == business_id,
        )
        .first()
    )
    if not review:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy đánh giá")
    return review


def _review_out(review: models.Review) -> schemas.BusinessReviewOut:
    return schemas.BusinessReviewOut(
        review_id=review.review_id,
        user_id=review.user_id,
        activity_id=review.activity_id,
        activity_name=review.activity.name,
        reviewer_name=review.user.name,
        rating=review.rating,
        content=review.content,
        created_at=review.created_at,
        updated_at=review.updated_at,
        media=[schemas.ReviewMedia.model_validate(item) for item in review.media],
        reply=schemas.ReviewReplyOut.model_validate(review.reply) if review.reply else None,
    )


@router.get("/me", response_model=schemas.BusinessProfile)
def get_business_profile(
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    return business


@router.patch("/me", response_model=schemas.BusinessProfile)
def update_business_profile(
    payload: schemas.BusinessProfileUpdate,
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(business, field, value)
    db.commit()
    db.refresh(business)
    return business


@router.get("/dashboard", response_model=schemas.BusinessDashboardOut)
def get_business_dashboard(
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    grouped = dict(
        db.query(models.Activity.status, func.count(models.Activity.activity_id))
        .filter(models.Activity.business_id == business.user_id)
        .group_by(models.Activity.status)
        .all()
    )
    review_count, average_rating = (
        db.query(func.count(models.Review.review_id), func.avg(models.Review.rating))
        .join(models.Activity, models.Activity.activity_id == models.Review.activity_id)
        .filter(models.Activity.business_id == business.user_id)
        .one()
    )
    unanswered = (
        db.query(func.count(models.Review.review_id))
        .join(models.Activity, models.Activity.activity_id == models.Review.activity_id)
        .outerjoin(models.ReviewReply, models.ReviewReply.review_id == models.Review.review_id)
        .filter(
            models.Activity.business_id == business.user_id,
            models.ReviewReply.reply_id.is_(None),
        )
        .scalar()
        or 0
    )
    pending_complaints = (
        db.query(func.count(models.Complaint.complaint_id))
        .filter(
            models.Complaint.user_id == business.user_id,
            models.Complaint.status == "pending",
        )
        .scalar()
        or 0
    )
    bookmark_count = (
        db.query(func.count(models.Bookmark.activity_id))
        .join(models.Activity, models.Activity.activity_id == models.Bookmark.activity_id)
        .filter(models.Activity.business_id == business.user_id)
        .scalar()
        or 0
    )
    return schemas.BusinessDashboardOut(
        activity_count=sum(grouped.values()),
        active_activity_count=grouped.get("active", 0),
        pending_activity_count=grouped.get("pending", 0),
        hidden_activity_count=grouped.get("hidden", 0),
        cancelled_activity_count=grouped.get("cancelled", 0),
        review_count=review_count or 0,
        unanswered_review_count=unanswered,
        average_rating=round(float(average_rating), 1) if average_rating is not None else None,
        pending_complaint_count=pending_complaints,
        bookmark_count=bookmark_count,
    )


@router.get("/analytics", response_model=schemas.BusinessAnalyticsOut)
def get_business_analytics(
    days: int = Query(30, ge=7, le=365),
    activity_id: str | None = Query(None),
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    """Dữ liệu biểu đồ đã tổng hợp ở backend từ Review và Bookmark thật."""
    activities_query = db.query(models.Activity).filter(models.Activity.business_id == business.user_id)
    if activity_id:
        activities_query = activities_query.filter(models.Activity.activity_id == activity_id)
    activities = activities_query.order_by(models.Activity.created_at.desc()).all()
    if activity_id and not activities:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")

    activity_ids = [activity.activity_id for activity in activities]
    now = datetime.now(UTC).replace(tzinfo=None)
    start = datetime.combine((now - timedelta(days=days - 1)).date(), datetime.min.time())
    granularity = "day" if days <= 31 else "week" if days <= 120 else "month"

    if activity_ids:
        period_reviews = (
            db.query(models.Review)
            .filter(models.Review.activity_id.in_(activity_ids), models.Review.created_at >= start)
            .all()
        )
        period_bookmarks = (
            db.query(models.Bookmark)
            .filter(models.Bookmark.activity_id.in_(activity_ids), models.Bookmark.created_at >= start)
            .all()
        )
    else:
        period_reviews, period_bookmarks = [], []

    first_bucket = _bucket_date(start, granularity)
    last_bucket = _bucket_date(now, granularity)
    trend = {}
    cursor = first_bucket
    while cursor <= last_bucket:
        trend[cursor] = {"reviews": 0, "bookmarks": 0, "ratings": []}
        cursor = _next_bucket(cursor, granularity)
    for review in period_reviews:
        bucket = _bucket_date(review.created_at, granularity)
        trend[bucket]["reviews"] += 1
        trend[bucket]["ratings"].append(review.rating)
    for bookmark in period_bookmarks:
        bucket = _bucket_date(bookmark.created_at, granularity)
        trend[bucket]["bookmarks"] += 1

    engagement_trend = [
        schemas.BusinessTrendPoint(
            label=bucket.isoformat(),
            review_count=value["reviews"],
            bookmark_count=value["bookmarks"],
            interaction_count=value["reviews"] + value["bookmarks"],
            average_rating=(
                round(sum(value["ratings"]) / len(value["ratings"]), 2)
                if value["ratings"] else None
            ),
        )
        for bucket, value in sorted(trend.items())
    ]

    rating_counts = {rating: 0 for rating in range(1, 6)}
    for review in period_reviews:
        rating_counts[review.rating] = rating_counts.get(review.rating, 0) + 1
    total_ratings = len(period_reviews)
    rating_distribution = [
        schemas.BusinessRatingPoint(
            rating=rating,
            count=rating_counts[rating],
            percentage=round(rating_counts[rating] * 100 / total_ratings, 1) if total_ratings else 0,
        )
        for rating in range(1, 6)
    ]

    status_counts: dict[str, int] = {}
    for activity in activities:
        status_counts[activity.status] = status_counts.get(activity.status, 0) + 1
    activity_status_distribution = [
        schemas.BusinessStatusPoint(status=name, count=count)
        for name, count in sorted(status_counts.items())
    ]

    category_rows = []
    if activity_ids:
        category_rows = (
            db.query(models.Category.category_id, models.Category.name, func.count(models.ActivityCategory.activity_id))
            .join(models.ActivityCategory, models.ActivityCategory.category_id == models.Category.category_id)
            .filter(models.ActivityCategory.activity_id.in_(activity_ids))
            .group_by(models.Category.category_id, models.Category.name)
            .order_by(func.count(models.ActivityCategory.activity_id).desc(), models.Category.name)
            .all()
        )
    category_distribution = [
        schemas.BusinessCategoryPoint(category_id=row[0], category_name=row[1], activity_count=row[2])
        for row in category_rows
    ]

    review_metrics = {}
    bookmark_metrics = {}
    unanswered_metrics = {}
    if activity_ids:
        review_metrics = {
            row[0]: (row[1], row[2])
            for row in (
                db.query(
                    models.Review.activity_id,
                    func.count(models.Review.review_id),
                    func.avg(models.Review.rating),
                )
                .filter(models.Review.activity_id.in_(activity_ids))
                .group_by(models.Review.activity_id)
                .all()
            )
        }
        bookmark_metrics = dict(
            db.query(models.Bookmark.activity_id, func.count(models.Bookmark.user_id))
            .filter(models.Bookmark.activity_id.in_(activity_ids))
            .group_by(models.Bookmark.activity_id)
            .all()
        )
        unanswered_metrics = dict(
            db.query(models.Review.activity_id, func.count(models.Review.review_id))
            .outerjoin(models.ReviewReply, models.ReviewReply.review_id == models.Review.review_id)
            .filter(models.Review.activity_id.in_(activity_ids), models.ReviewReply.reply_id.is_(None))
            .group_by(models.Review.activity_id)
            .all()
        )

    performance = []
    for activity in activities:
        review_count, average_rating = review_metrics.get(activity.activity_id, (0, None))
        bookmark_count = bookmark_metrics.get(activity.activity_id, 0)
        performance.append(
            schemas.BusinessActivityPerformance(
                activity_id=activity.activity_id,
                activity_name=activity.name,
                status=activity.status,
                review_count=review_count,
                bookmark_count=bookmark_count,
                unanswered_review_count=unanswered_metrics.get(activity.activity_id, 0),
                average_rating=round(float(average_rating), 2) if average_rating is not None else None,
                interaction_count=review_count + bookmark_count,
            )
        )
    performance.sort(key=lambda item: (item.interaction_count, item.review_count), reverse=True)
    period_average = (
        round(sum(review.rating for review in period_reviews) / total_ratings, 2)
        if total_ratings else None
    )
    return schemas.BusinessAnalyticsOut(
        generated_at=now,
        period_days=days,
        granularity=granularity,
        activity_id=activity_id,
        summary=schemas.BusinessAnalyticsSummary(
            period_review_count=total_ratings,
            period_bookmark_count=len(period_bookmarks),
            period_interaction_count=total_ratings + len(period_bookmarks),
            period_average_rating=period_average,
            total_activity_count=len(activities),
        ),
        engagement_trend=engagement_trend,
        rating_distribution=rating_distribution,
        activity_status_distribution=activity_status_distribution,
        category_distribution=category_distribution,
        activity_performance=performance,
    )
@router.get("/activities", response_model=list[schemas.ActivityPublicOut])
def list_business_activities(
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    activities = (
        db.query(models.Activity)
        .filter(models.Activity.business_id == business.user_id)
        .order_by(models.Activity.created_at.desc())
        .all()
    )
    return [_to_detail(db, activity) for activity in activities]


@router.get("/reviews", response_model=list[schemas.BusinessReviewOut])
def list_business_reviews(
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    reviews = (
        db.query(models.Review)
        .join(models.Activity, models.Activity.activity_id == models.Review.activity_id)
        .filter(models.Activity.business_id == business.user_id)
        .order_by(models.Review.created_at.desc())
        .all()
    )
    return [_review_out(review) for review in reviews]


@router.post(
    "/reviews/{review_id}/reply",
    response_model=schemas.ReviewReplyOut,
    status_code=status.HTTP_201_CREATED,
)
def create_review_reply(
    review_id: str,
    payload: schemas.ReviewReplyCreate,
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    review = _owned_review(db, review_id, business.user_id)
    if review.reply:
        raise HTTPException(status.HTTP_409_CONFLICT, "Đánh giá đã có phản hồi")
    reply = models.ReviewReply(
        review_id=review.review_id,
        business_id=business.user_id,
        content=payload.content,
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(reply)
    db.commit()
    db.refresh(reply)
    return reply


@router.patch("/review-replies/{reply_id}", response_model=schemas.ReviewReplyOut)
def update_review_reply(
    reply_id: str,
    payload: schemas.ReviewReplyUpdate,
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    reply = db.query(models.ReviewReply).filter(models.ReviewReply.reply_id == reply_id).first()
    if not reply or reply.business_id != business.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phản hồi")
    reply.content = payload.content
    reply.updated_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
    db.refresh(reply)
    return reply


@router.delete("/review-replies/{reply_id}", response_model=schemas.MessageResponse)
def delete_review_reply(
    reply_id: str,
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    reply = db.query(models.ReviewReply).filter(models.ReviewReply.reply_id == reply_id).first()
    if not reply or reply.business_id != business.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy phản hồi")
    for media in reply.media:
        try:
            delete_asset(media.public_id, media.media_type)
        except Exception:
            # Không chặn xóa phản hồi nếu Cloudinary tạm thời lỗi; public_id vẫn giúp
            # tác vụ dọn rác định kỳ có thể xử lý asset mồ côi sau đó.
            pass
    db.delete(reply)
    db.commit()
    return {"message": "Đã xóa phản hồi"}
