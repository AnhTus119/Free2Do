from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.auth import get_current_user

router = APIRouter(prefix="/users/me", tags=["users"])


@router.patch("", response_model=schemas.MeResponse)
def update_my_profile(
    payload: schemas.UserProfileUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        name = data["name"].strip()
        if not name:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Họ tên không được để trống")
        user.name = name
    if "phone" in data:
        raw_phone = data["phone"]
        user.phone = raw_phone.strip() or None if raw_phone is not None else None

    db.commit()
    db.refresh(user)
    profile = user.business_profile or user.customer_profile
    role_name = user.role.role_name if user.role else None
    account = user.account
    return schemas.MeResponse(
        account_id=account.account_id,
        email=account.email,
        account_type="user",
        role=role_name,
        name=user.name,
        user_id=user.user_id,
        phone=account.phone or user.phone,
        recovery_email=account.recovery_email,
        requires_recovery_email=account.auth_provider == "phone" and not account.recovery_email,
        avatar_url=profile.avatar_url if profile else None,
        redirect=(
            "Demo Trang Business/business-home.html"
            if role_name == "business"
            else "Demo Trang Customer/home.html"
        ),
    )


@router.get("/search-history", response_model=list[schemas.SearchHistory])
def get_my_search_history(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.SearchHistory)
        .filter(models.SearchHistory.user_id == user.user_id)
        .order_by(models.SearchHistory.created_at.desc())
        .all()
    )


@router.get("/categories", response_model=list[schemas.Category])
def get_my_categories(user: models.User = Depends(get_current_user)):
    return [uc.category for uc in user.categories]


@router.put("/categories", response_model=list[schemas.Category])
def update_my_categories(
    payload: schemas.UserCategoriesUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Ghi đè toàn bộ danh sách sở thích của user bằng danh sách category_ids truyền lên."""
    category_ids = list(dict.fromkeys(payload.category_ids))
    existing_ids = {
        row[0]
        for row in db.query(models.Category.category_id)
        .filter(models.Category.category_id.in_(category_ids))
        .all()
    } if category_ids else set()
    missing = [category_id for category_id in category_ids if category_id not in existing_ids]
    if missing:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Danh mục không tồn tại: {', '.join(missing)}",
        )
    db.query(models.UserCategory).filter(models.UserCategory.user_id == user.user_id).delete()
    for category_id in category_ids:
        db.add(models.UserCategory(user_id=user.user_id, category_id=category_id))
    db.commit()
    db.refresh(user)
    return [uc.category for uc in user.categories]
