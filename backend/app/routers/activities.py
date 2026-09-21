from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app import models, schemas
from app.auth import get_current_business_user, get_current_operator
from app.utils.email import send_activity_approved_email, send_activity_hidden_email

router = APIRouter(prefix="/activities", tags=["activities"])


def _to_detail(db: Session, activity: models.Activity) -> schemas.ActivityDetail:
    avg_rating = (
        db.query(func.avg(models.Review.rating))
        .filter(models.Review.activity_id == activity.activity_id)
        .scalar()
    )
    review_count = (
        db.query(func.count(models.Review.review_id))
        .filter(models.Review.activity_id == activity.activity_id)
        .scalar()
    )
    return schemas.ActivityDetail(
        **schemas.Activity.model_validate(activity).model_dump(),
        category_ids=[c.category_id for c in activity.categories],
        media=[schemas.ActivityMedia.model_validate(m) for m in activity.media],
        avg_rating=round(avg_rating, 1) if avg_rating else None,
        review_count=review_count or 0,
    )


def _set_categories(db: Session, activity_id: str, category_ids: list[str]) -> None:
    db.query(models.ActivityCategory).filter(models.ActivityCategory.activity_id == activity_id).delete()
    for category_id in category_ids:
        db.add(models.ActivityCategory(activity_id=activity_id, category_id=category_id))


# ---------------------------------------------------------------------------
# Customer -- xem chi tiết hoạt động (chỉ thấy pending/active, không thấy hidden/cancelled)
# ---------------------------------------------------------------------------
@router.get("/{activity_id}", response_model=schemas.ActivityDetail)
def get_activity(activity_id: str, db: Session = Depends(get_db)):
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if not activity or activity.status not in ("active", "pending"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")
    return _to_detail(db, activity)


# ---------------------------------------------------------------------------
# Business -- quản lý hoạt động của chính mình
# ---------------------------------------------------------------------------
@router.post("", response_model=schemas.ActivityDetail, status_code=status.HTTP_201_CREATED)
def create_activity(
    payload: schemas.ActivityCreate,
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    now = datetime.utcnow()
    activity = models.Activity(
        business_id=business.user_id,
        name=payload.name,
        description=payload.description,
        price=payload.price,
        address=payload.address,
        latitude=payload.latitude,
        longitude=payload.longitude,
        time_open=payload.time_open,
        time_close=payload.time_close,
        status="pending",
        created_at=now,
    )
    db.add(activity)
    db.flush()
    _set_categories(db, activity.activity_id, payload.category_ids)
    db.commit()
    db.refresh(activity)
    return _to_detail(db, activity)


@router.get("/mine/list", response_model=list[schemas.Activity])
def list_my_activities(
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    return (
        db.query(models.Activity)
        .filter(models.Activity.business_id == business.user_id)
        .order_by(models.Activity.created_at.desc())
        .all()
    )


@router.patch("/{activity_id}", response_model=schemas.ActivityDetail)
def update_activity(
    activity_id: str,
    payload: schemas.ActivityUpdate,
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if not activity or activity.business_id != business.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")

    data = payload.model_dump(exclude_unset=True, exclude={"category_ids"})
    for field, value in data.items():
        setattr(activity, field, value)
    if payload.category_ids is not None:
        _set_categories(db, activity.activity_id, payload.category_ids)

    # Sửa hoạt động đã duyệt (active) -> phải chờ Operator duyệt lại
    if activity.status == "active":
        activity.status = "pending"
        activity.verified_by = None
        activity.verified_at = None

    activity.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(activity)
    return _to_detail(db, activity)


@router.delete("/{activity_id}", response_model=schemas.MessageResponse)
def cancel_activity(
    activity_id: str,
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if not activity or activity.business_id != business.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")

    activity.status = "cancelled"
    activity.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Đã hủy hoạt động"}


@router.post("/{activity_id}/media", response_model=schemas.ActivityMedia, status_code=status.HTTP_201_CREATED)
def add_activity_media(
    activity_id: str,
    payload: schemas.ActivityMediaCreate,
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if not activity or activity.business_id != business.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")

    media = models.ActivityMedia(activity_id=activity_id, media_url=payload.media_url, media_type=payload.media_type)
    db.add(media)
    db.commit()
    db.refresh(media)
    return media


@router.delete("/media/{media_id}", response_model=schemas.MessageResponse)
def delete_activity_media(
    media_id: str,
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    media = db.query(models.ActivityMedia).filter(models.ActivityMedia.media_id == media_id).first()
    if not media or media.activity.business_id != business.user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy media")

    db.delete(media)
    db.commit()
    return {"message": "Đã xóa media"}


# ---------------------------------------------------------------------------
# Operator -- duyệt / ẩn hoạt động
# ---------------------------------------------------------------------------
operator_router = APIRouter(prefix="/operator/activities", tags=["operator-activities"])


@operator_router.get("", response_model=list[schemas.ActivityAdminOut])
def list_activities_for_review(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    query = db.query(models.Activity)
    if status_filter:
        query = query.filter(models.Activity.status == status_filter)
    activities = query.order_by(models.Activity.created_at.desc()).all()

    return [
        schemas.ActivityAdminOut(
            **schemas.Activity.model_validate(a).model_dump(),
            business_name=a.business.business_name,
            verified_by=a.verified_by,
            verified_at=a.verified_at,
        )
        for a in activities
    ]


@operator_router.get("/{activity_id}", response_model=schemas.ActivityDetail)
def get_activity_for_review(
    activity_id: str,
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    """Operator xem chi tiết hoạt động ở bất kỳ trạng thái nào (kể cả hidden/cancelled)."""
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if not activity:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")
    return _to_detail(db, activity)


@operator_router.patch("/{activity_id}", response_model=schemas.ActivityDetail)
def update_activity_as_operator(
    activity_id: str,
    payload: schemas.ActivityUpdate,
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    """Operator sửa trực tiếp thông tin hoạt động (không cần đổi trạng thái)."""
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if not activity:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")

    data = payload.model_dump(exclude_unset=True, exclude={"category_ids"})
    for field, value in data.items():
        setattr(activity, field, value)
    if payload.category_ids is not None:
        _set_categories(db, activity.activity_id, payload.category_ids)

    activity.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(activity)
    return _to_detail(db, activity)


@operator_router.patch("/{activity_id}/status", response_model=schemas.Activity)
def set_activity_status(
    activity_id: str,
    payload: schemas.ActivityStatusUpdate,
    db: Session = Depends(get_db),
    operator: models.Operator = Depends(get_current_operator),
):
    """Đổi trạng thái hoạt động sang bất kỳ giá trị hợp lệ nào -- linh hoạt hơn approve/hide
    (vd trả 1 activity đã hidden về active mà không cần đi qua lại luồng duyệt)."""
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if not activity:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")

    activity.status = payload.status
    if payload.status == "active":
        activity.verified_by = operator.operator_id
        activity.verified_at = datetime.utcnow()
    db.commit()
    db.refresh(activity)
    return activity


@operator_router.patch("/{activity_id}/approve", response_model=schemas.Activity)
def approve_activity(
    activity_id: str,
    db: Session = Depends(get_db),
    operator: models.Operator = Depends(get_current_operator),
):
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if not activity:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")
    if activity.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Hoạt động không ở trạng thái chờ duyệt")

    activity.status = "active"
    activity.verified_by = operator.operator_id
    activity.verified_at = datetime.utcnow()
    db.commit()
    db.refresh(activity)

    send_activity_approved_email(activity.business.user.account.email, activity.name)
    return activity


@operator_router.patch("/{activity_id}/hide", response_model=schemas.Activity)
def hide_activity(
    activity_id: str,
    db: Session = Depends(get_db),
    operator: models.Operator = Depends(get_current_operator),
):
    """Dùng để: (1) từ chối hoạt động đang pending, hoặc (2) ẩn hoạt động active do vi phạm."""
    activity = db.query(models.Activity).filter(models.Activity.activity_id == activity_id).first()
    if not activity:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hoạt động")
    if activity.status not in ("pending", "active"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Hoạt động đã ở trạng thái ẩn hoặc đã hủy")

    activity.status = "hidden"
    activity.verified_by = operator.operator_id
    activity.verified_at = datetime.utcnow()
    db.commit()
    db.refresh(activity)

    send_activity_hidden_email(activity.business.user.account.email, activity.name)
    return activity
