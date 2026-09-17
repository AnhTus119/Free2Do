from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_user, get_current_operator
from app.utils.email import send_business_request_approved_email, send_business_request_rejected_email

router = APIRouter(tags=["business-requests"])


@router.post("/business-requests", response_model=schemas.BusinessRequest, status_code=status.HTTP_201_CREATED)
def create_business_request(
    payload: schemas.BusinessRequestCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Customer gửi yêu cầu nâng cấp thành tài khoản Doanh nghiệp."""
    if user.business_profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tài khoản đã là Doanh nghiệp")

    pending = (
        db.query(models.BusinessRequest)
        .filter(models.BusinessRequest.user_id == user.user_id, models.BusinessRequest.status == "pending")
        .first()
    )
    if pending:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bạn đã có một yêu cầu đang chờ duyệt")

    request = models.BusinessRequest(
        user_id=user.user_id,
        business_name=payload.business_name,
        phone=payload.phone,
        business_address=payload.business_address,
        description=payload.description,
        status="pending",
        created_at=datetime.utcnow(),
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


@router.get("/business-requests/me", response_model=list[schemas.BusinessRequest])
def list_my_business_requests(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.BusinessRequest)
        .filter(models.BusinessRequest.user_id == user.user_id)
        .order_by(models.BusinessRequest.created_at.desc())
        .all()
    )


# ---------------------------------------------------------------------------
# Operator -- duyệt yêu cầu trở thành Doanh nghiệp
# ---------------------------------------------------------------------------
operator_router = APIRouter(prefix="/operator/business-requests", tags=["operator-business-requests"])


@operator_router.get("", response_model=list[schemas.BusinessRequest])
def list_business_requests(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    query = db.query(models.BusinessRequest)
    if status_filter:
        query = query.filter(models.BusinessRequest.status == status_filter)
    return query.order_by(models.BusinessRequest.created_at.desc()).all()


@operator_router.get("/{request_id}", response_model=schemas.BusinessRequest)
def get_business_request(
    request_id: str,
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    request = db.query(models.BusinessRequest).filter(models.BusinessRequest.request_id == request_id).first()
    if not request:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy yêu cầu")
    return request


@operator_router.patch("/{request_id}/approve", response_model=schemas.BusinessRequest)
def approve_business_request(
    request_id: str,
    db: Session = Depends(get_db),
    operator: models.Operator = Depends(get_current_operator),
):
    request = db.query(models.BusinessRequest).filter(models.BusinessRequest.request_id == request_id).first()
    if not request:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy yêu cầu")
    if request.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Yêu cầu đã được xử lý")

    now = datetime.utcnow()
    request.status = "approved"
    request.reviewed_by = operator.operator_id
    request.reviewed_at = now

    business_profile = models.BusinessProfile(
        user_id=request.user_id,
        business_name=request.business_name,
        phone=request.phone,
        description=request.description,
        business_address=request.business_address,
        verified_by=operator.operator_id,
        verified_at=now,
    )
    db.add(business_profile)

    # Nâng role user lên "business" nếu role tương ứng đã tồn tại trong bảng roles
    business_role = db.query(models.Role).filter(models.Role.role_name == "business").first()
    if business_role:
        request.user.role_id = business_role.role_id

    db.commit()
    db.refresh(request)

    send_business_request_approved_email(request.user.account.email, request.business_name)
    return request


@operator_router.patch("/{request_id}/reject", response_model=schemas.BusinessRequest)
def reject_business_request(
    request_id: str,
    db: Session = Depends(get_db),
    operator: models.Operator = Depends(get_current_operator),
):
    request = db.query(models.BusinessRequest).filter(models.BusinessRequest.request_id == request_id).first()
    if not request:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy yêu cầu")
    if request.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Yêu cầu đã được xử lý")

    request.status = "rejected"
    request.reviewed_by = operator.operator_id
    request.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(request)

    send_business_request_rejected_email(request.user.account.email, request.business_name)
    return request
