from datetime import UTC, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_business_user, get_current_operator

router = APIRouter(tags=["complaints"])


@router.post("/complaints", response_model=schemas.Complaint, status_code=status.HTTP_201_CREATED)
def create_complaint(
    payload: schemas.ComplaintCreate,
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    review = (
        db.query(models.Review)
        .join(models.Activity, models.Activity.activity_id == models.Review.activity_id)
        .filter(
            models.Review.review_id == payload.review_id,
            models.Activity.business_id == business.user_id,
        )
        .first()
    )
    if not review:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy đánh giá")

    existing = (
        db.query(models.Complaint)
        .filter(
            models.Complaint.user_id == business.user_id,
            models.Complaint.review_id == payload.review_id,
            models.Complaint.status == "pending",
        )
        .first()
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Đánh giá đã có khiếu nại đang chờ xử lý")

    complaint = models.Complaint(
        user_id=business.user_id,
        review_id=payload.review_id,
        reason=payload.reason,
        description=payload.description,
        status="pending",
        created_at=datetime.now(UTC).replace(tzinfo=None),
    )
    db.add(complaint)
    db.commit()
    db.refresh(complaint)
    return complaint


@router.get("/business/complaints", response_model=list[schemas.Complaint])
def list_business_complaints(
    db: Session = Depends(get_db),
    business: models.BusinessProfile = Depends(get_current_business_user),
):
    return (
        db.query(models.Complaint)
        .filter(models.Complaint.user_id == business.user_id)
        .order_by(models.Complaint.created_at.desc())
        .all()
    )


# ---------------------------------------------------------------------------
# Operator -- xử lý khiếu nại đánh giá
# ---------------------------------------------------------------------------
operator_router = APIRouter(prefix="/operator/complaints", tags=["operator-complaints"])


@operator_router.get("", response_model=list[schemas.Complaint])
def list_complaints(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    query = db.query(models.Complaint)
    if status_filter:
        query = query.filter(models.Complaint.status == status_filter)
    return query.order_by(models.Complaint.created_at.desc()).all()


@operator_router.patch("/{complaint_id}/resolve", response_model=schemas.MessageResponse)
def resolve_complaint(
    complaint_id: str,
    payload: schemas.ComplaintResolveRequest,
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    """Operator xử lý khiếu nại (xóa đánh giá bị khiếu nại hoặc bỏ qua) rồi xóa hẳn bản ghi
    khiếu nại khỏi database -- không lưu lại lịch sử sau khi đã xử lý (theo đúng đặc tả usecase)."""
    complaint = db.query(models.Complaint).filter(models.Complaint.complaint_id == complaint_id).first()
    if not complaint:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy khiếu nại")
    if complaint.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Khiếu nại đã được xử lý")

    if payload.action == "delete_review":
        review_id = complaint.review_id
        # Xóa complaint (kể cả complaint khác cùng trỏ tới review này) trước khi xóa review,
        # vì complaints.review_id là FK not null -- xóa review trước sẽ vi phạm ràng buộc.
        db.query(models.Complaint).filter(models.Complaint.review_id == review_id).delete()
        db.query(models.ReviewMedia).filter(models.ReviewMedia.review_id == review_id).delete()
        db.query(models.Review).filter(models.Review.review_id == review_id).delete()
        db.commit()
        return {"message": "Đã xóa đánh giá và xử lý khiếu nại"}

    db.delete(complaint)
    db.commit()
    return {"message": "Đã xử lý và xóa khiếu nại"}
