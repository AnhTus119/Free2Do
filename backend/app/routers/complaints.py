from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_user, get_current_operator

router = APIRouter(tags=["complaints"])


@router.post("/complaints", response_model=schemas.Complaint, status_code=status.HTTP_201_CREATED)
def create_complaint(
    payload: schemas.ComplaintCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    review = db.query(models.Review).filter(models.Review.review_id == payload.review_id).first()
    if not review:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy đánh giá")

    complaint = models.Complaint(
        user_id=user.user_id,
        review_id=payload.review_id,
        reason=payload.reason,
        description=payload.description,
        status="pending",
        created_at=datetime.utcnow(),
    )
    db.add(complaint)
    db.commit()
    db.refresh(complaint)
    return complaint


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


@operator_router.patch("/{complaint_id}/resolve", response_model=schemas.Complaint)
def resolve_complaint(
    complaint_id: str,
    payload: schemas.ComplaintResolveRequest,
    db: Session = Depends(get_db),
    operator: models.Operator = Depends(get_current_operator),
):
    complaint = db.query(models.Complaint).filter(models.Complaint.complaint_id == complaint_id).first()
    if not complaint:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy khiếu nại")
    if complaint.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Khiếu nại đã được xử lý")

    if payload.action == "delete_review":
        db.delete(complaint.review)

    complaint.status = "resolved"
    complaint.resolved_by = operator.operator_id
    complaint.resolved_at = datetime.utcnow()
    db.commit()
    db.refresh(complaint)
    return complaint
