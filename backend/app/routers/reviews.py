from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_user

router = APIRouter(tags=["reviews"])


@router.get("/activities/{activity_id}/reviews", response_model=list[schemas.Review])
def list_activity_reviews(activity_id: str, db: Session = Depends(get_db)):
    return (
        db.query(models.Review)
        .filter(models.Review.activity_id == activity_id)
        .order_by(models.Review.created_at.desc())
        .all()
    )


@router.post("/reviews", response_model=schemas.Review, status_code=status.HTTP_201_CREATED)
def create_review(
    payload: schemas.ReviewCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    activity = db.query(models.Activity).filter(models.Activity.activity_id == payload.activity_id).first()
    if not activity:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")

    existing = (
        db.query(models.Review)
        .filter(models.Review.activity_id == payload.activity_id, models.Review.user_id == user.user_id)
        .first()
    )
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bạn đã đánh giá hoạt động này rồi")

    review = models.Review(
        user_id=user.user_id,
        activity_id=payload.activity_id,
        rating=payload.rating,
        content=payload.content,
        created_at=datetime.utcnow(),
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return review


@router.patch("/reviews/{review_id}", response_model=schemas.Review)
def update_review(
    review_id: str,
    payload: schemas.ReviewUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    review = db.query(models.Review).filter(models.Review.review_id == review_id).first()
    if not review or review.user_id != user.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy đánh giá")

    if payload.rating is not None:
        review.rating = payload.rating
    if payload.content is not None:
        review.content = payload.content
    review.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(review)
    return review


@router.delete("/reviews/{review_id}", response_model=schemas.MessageResponse)
def delete_review(
    review_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    review = db.query(models.Review).filter(models.Review.review_id == review_id).first()
    if not review or review.user_id != user.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy đánh giá")

    # Dọn các bản ghi phụ thuộc trước -- complaints.review_id và review_media.review_id
    # đều là FK not null, xóa review trước sẽ vi phạm ràng buộc trên Postgres.
    db.query(models.Complaint).filter(models.Complaint.review_id == review_id).delete()
    db.query(models.ReviewMedia).filter(models.ReviewMedia.review_id == review_id).delete()
    db.delete(review)
    db.commit()
    return {"message": "Đã xóa đánh giá"}


@router.post("/reviews/{review_id}/media", response_model=schemas.ReviewMedia, status_code=status.HTTP_201_CREATED)
def add_review_media(
    review_id: str,
    payload: schemas.ReviewMediaCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    review = db.query(models.Review).filter(models.Review.review_id == review_id).first()
    if not review or review.user_id != user.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy đánh giá")

    media = models.ReviewMedia(review_id=review_id, media_url=payload.media_url, media_type=payload.media_type)
    db.add(media)
    db.commit()
    db.refresh(media)
    return media
