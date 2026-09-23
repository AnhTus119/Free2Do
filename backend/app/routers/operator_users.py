from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_operator

router = APIRouter(prefix="/operator", tags=["operator-users"])


def _to_user_admin_out(user: models.User) -> schemas.UserAdminOut:
    return schemas.UserAdminOut(
        created_at=user.account.created_at,
        user_id=user.user_id,
        account_id=user.account_id,
        email=user.account.email,
        role_name=user.role.role_name,
        name=user.name,
        phone=user.phone,
        status=user.account.status,
    )


@router.get("/users", response_model=list[schemas.UserAdminOut])
def list_users(
    role: Optional[str] = Query(None, description="Lọc theo role_name, vd 'customer' hoặc 'business'"),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    """Operator xem danh sách Customer và Business."""
    query = db.query(models.User).join(models.Role).join(models.Account)
    if role:
        query = query.filter(models.Role.role_name == role)
    if status_filter:
        query = query.filter(models.Account.status == status_filter)
    return [_to_user_admin_out(u) for u in query.all()]


@router.get("/users/{user_id}", response_model=schemas.UserAdminOut)
def get_user(
    user_id: str,
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy người dùng")
    return _to_user_admin_out(user)


@router.patch("/users/{user_id}", response_model=schemas.UserAdminOut)
def update_user(
    user_id: str,
    payload: schemas.UserAdminUpdate,
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy người dùng")

    if payload.name is not None:
        user.name = payload.name
    if payload.phone is not None:
        user.phone = payload.phone
    db.commit()
    db.refresh(user)
    return _to_user_admin_out(user)


@router.patch("/users/{user_id}/status", response_model=schemas.UserAdminOut)
def update_user_status(
    user_id: str,
    payload: schemas.AccountStatusUpdate,
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    """Khóa/mở khóa tài khoản Customer hoặc Business (sửa accounts.status)."""
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy người dùng")

    user.account.status = payload.status
    db.commit()
    db.refresh(user)
    return _to_user_admin_out(user)


@router.get("/business-profiles/{user_id}", response_model=schemas.BusinessProfile)
def get_business_profile(
    user_id: str,
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    profile = db.query(models.BusinessProfile).filter(models.BusinessProfile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hồ sơ Doanh nghiệp")
    return profile


@router.patch("/business-profiles/{user_id}", response_model=schemas.BusinessProfile)
def update_business_profile(
    user_id: str,
    payload: schemas.BusinessProfileAdminUpdate,
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    profile = db.query(models.BusinessProfile).filter(models.BusinessProfile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy hồ sơ Doanh nghiệp")

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/dashboard", response_model=schemas.DashboardOut)
def get_dashboard(
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    """Xem tổng quan hệ thống: số lượng user/business/activity/review và các mục đang chờ xử lý."""
    business_role = db.query(models.Role).filter(models.Role.role_name == "business").first()
    business_count = (
        db.query(models.User).filter(models.User.role_id == business_role.role_id).count()
        if business_role
        else 0
    )
    return schemas.DashboardOut(
        user_count=db.query(models.User).count(),
        business_count=business_count,
        activity_count=db.query(models.Activity).count(),
        review_count=db.query(models.Review).count(),
        pending_request_count=db.query(models.BusinessRequest)
        .filter(models.BusinessRequest.status == "pending")
        .count(),
        pending_report_count=db.query(models.Report).filter(models.Report.status == "pending").count(),
        pending_complaint_count=db.query(models.Complaint)
        .filter(models.Complaint.status == "pending")
        .count(),
    )
