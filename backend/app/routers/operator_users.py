from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.database import get_db
from app import models, schemas
from app.auth import get_current_operator

router = APIRouter(prefix="/operator", tags=["operator-users"])


def _to_user_admin_out(db: Session, user: models.User) -> schemas.UserAdminOut:
    values = {}
    if user.role.role_name == "customer":
        review_count, last_activity_at = (
            db.query(func.count(models.Review.review_id), func.max(models.Review.created_at))
            .filter(models.Review.user_id == user.user_id)
            .one()
        )
        values.update(
            participation_count=review_count or 0,
            review_count=review_count or 0,
            last_activity_at=last_activity_at,
        )
    elif user.role.role_name == "business":
        status_counts = dict(
            db.query(models.Activity.status, func.count(models.Activity.activity_id))
            .filter(models.Activity.business_id == user.user_id)
            .group_by(models.Activity.status)
            .all()
        )
        average_rating = (
            db.query(func.avg(models.Review.rating))
            .join(models.Activity, models.Review.activity_id == models.Activity.activity_id)
            .filter(models.Activity.business_id == user.user_id)
            .scalar()
        )
        values.update(
            activity_count=sum(status_counts.values()),
            active_activity_count=status_counts.get("active", 0),
            pending_activity_count=status_counts.get("pending", 0),
            average_rating=round(float(average_rating), 1) if average_rating is not None else None,
        )
    return schemas.UserAdminOut(
        user_id=user.user_id,
        account_id=user.account_id,
        email=user.account.email,
        role_name=user.role.role_name,
        name=user.name,
        phone=user.phone,
        status=user.account.status,
        created_at=user.account.created_at,
        **values,
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
    return [_to_user_admin_out(db, u) for u in query.all()]


@router.get("/summaries/customers", response_model=schemas.CustomerSummaryOut)
def get_customer_summary(
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    base = db.query(models.User).join(models.Role).join(models.Account).filter(models.Role.role_name == "customer")
    return schemas.CustomerSummaryOut(
        total_count=base.count(),
        active_count=base.filter(models.Account.status == "active").count(),
        locked_count=base.filter(models.Account.status.in_(("blocked", "suspended"))).count(),
    )


@router.get("/summaries/businesses", response_model=schemas.BusinessSummaryOut)
def get_business_summary(
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    base = db.query(models.User).join(models.Role).join(models.Account).filter(models.Role.role_name == "business")
    pending_count = (
        db.query(models.BusinessRequest)
        .filter(models.BusinessRequest.status == "pending")
        .count()
    )
    business_count = base.count()
    return schemas.BusinessSummaryOut(
        total_count=business_count + pending_count,
        active_count=base.filter(models.Account.status == "active").count(),
        pending_count=pending_count,
        locked_count=base.filter(models.Account.status.in_(("blocked", "suspended"))).count(),
    )


@router.get("/users/{user_id}", response_model=schemas.UserAdminOut)
def get_user(
    user_id: str,
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy người dùng")
    return _to_user_admin_out(db, user)


@router.get("/users/{user_id}/categories", response_model=list[schemas.Category])
def get_user_categories(
    user_id: str,
    db: Session = Depends(get_db),
    _operator: models.Operator = Depends(get_current_operator),
):
    """Operator đọc sở thích của user để hiển thị hồ sơ bằng dữ liệu DB."""
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy người dùng")
    return [item.category for item in user.categories]


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
    return _to_user_admin_out(db, user)


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
    return _to_user_admin_out(db, user)


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
    customer_role = db.query(models.Role).filter(models.Role.role_name == "customer").first()
    business_count = (
        db.query(models.User).filter(models.User.role_id == business_role.role_id).count()
        if business_role
        else 0
    )
    customer_count = (
        db.query(models.User).filter(models.User.role_id == customer_role.role_id).count()
        if customer_role
        else 0
    )
    pending_request_count = (
        db.query(models.BusinessRequest)
        .filter(models.BusinessRequest.status == "pending")
        .count()
    )
    pending_activity_count = (
        db.query(models.Activity).filter(models.Activity.status == "pending").count()
    )
    return schemas.DashboardOut(
        user_count=db.query(models.User).count(),
        business_count=business_count,
        activity_count=db.query(models.Activity).count(),
        review_count=db.query(models.Review).count(),
        pending_request_count=pending_request_count,
        pending_report_count=db.query(models.Report).filter(models.Report.status == "pending").count(),
        pending_complaint_count=db.query(models.Complaint)
        .filter(models.Complaint.status == "pending")
        .count(),
        customer_count=customer_count,
        active_activity_count=db.query(models.Activity).filter(models.Activity.status == "active").count(),
        pending_activity_count=pending_activity_count,
        locked_customer_count=(
            db.query(models.User)
            .join(models.Account)
            .filter(
                models.User.role_id == customer_role.role_id,
                models.Account.status.in_(("blocked", "suspended")),
            )
            .count()
            if customer_role
            else 0
        ),
        missing_business_phone_count=(
            db.query(models.BusinessProfile)
            .filter(or_(models.BusinessProfile.phone.is_(None), models.BusinessProfile.phone == ""))
            .count()
        ),
        pending_total_count=pending_activity_count + pending_request_count,
    )
