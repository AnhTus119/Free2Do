from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import get_current_business_user
from app.database import get_db
from app.routers.activities import _to_detail
from app.services.cloudinary_storage import delete_asset


router = APIRouter(prefix="/business", tags=["business"])


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
